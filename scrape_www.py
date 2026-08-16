"""Scrape student-facing sections of www.swarthmore.edu into markdown files.

URLs come from the Drupal sitemap (https://www.swarthmore.edu/sitemap.xml, pages 1-2),
filtered to an allowlist of informational sections. Main content is extracted with
trafilatura (strips nav/menu/footer boilerplate) and saved under information/www/
with YAML frontmatter (title, source URL, section, content hash) for RAG ingestion.

Usage: python scrape_www.py
Dependencies: requests, trafilatura
"""

import os
import re
import sys
import time
import html
import hashlib
from pathlib import Path
from urllib.parse import urlparse

import requests
import trafilatura

BASE = "https://www.swarthmore.edu"
SITEMAP_PAGES = (f"{BASE}/sitemap.xml?page=1", f"{BASE}/sitemap.xml?page=2")
OUT_DIR = Path(__file__).parent / "information" / "www"
MIN_BODY_CHARS = 300
SLEEP = 0.25
RESUME = os.environ.get("RESUME") == "1"

# Sections scraped in full (every page under the path prefix).
# Current-student-focused only: applicant/prospective sections (admissions-aid,
# financial-aid, transfer-students) are deliberately excluded.
ALLOW_TREES = frozenset({
    "academics", "campus-life", "registrar",
    "student-accounts-office", "student-employment", "new-students",
    "student-handbook", "advising-handbook", "division-student-affairs", "student-life",
    "student-health", "student-health-and-wellness", "counseling-and-psychological-services",
    "be-well", "public-safety", "accessibility-resources", "international-student-center",
    "global-engagement", "study-abroad", "its", "information-security", "libraries", "onecard",
    "swarthmore-dining", "dining-and-community-commons", "post-office", "office-academic-success",
    "teaching-learning-commons", "fellowships-and-prizes", "honors-program", "summer-opportunities",
    "summer-scholars-program", "pre-law-advising", "health-sciences-office", "intercultural-center",
    "interfaith-center", "gender-sexuality-center", "black-cultural-center", "title-ix",
    "equal-opportunity", "lang-center", "makerspace", "voter-information", "writing",
})

# Single pages scraped exactly (academic department/program landing pages, misc one-offs).
ALLOW_EXACT = frozenset({
    "department-theater", "music", "mathematics-statistics", "computer-science", "engineering",
    "chemistry-biochemistry", "film-media-studies", "philosophy", "religion", "linguistics",
    "psychology", "english-literature", "classics", "dance", "educational-studies", "black-studies",
    "japanese", "biology", "environmental-studies", "economics", "physics-astronomy",
    "gender-sexuality-studies", "sociology-anthropology", "chinese", "arabic", "russian",
    "modern-languages-literatures", "french-francophone-studies", "art", "art-history",
    "german-studies", "political-science", "history", "spanish", "asian-studies",
    "latin-american-and-latino-studies", "peace-conflict-studies", "interpretation-theory",
    "cognitive-science", "medieval-studies", "comparative-literature", "islamic-studies",
    "asian-american-studies", "philosophy-politics-and-economics", "global-studies",
    "architectural-studies", "swatalert", "parking", "physical-access-and-learning-support",
})

# Dropped even inside allowed sections: news, events, galleries, profile/staff pages, features.
EXCLUDE_PATTERNS = tuple(re.compile(p) for p in (
    r"(^|/)(news|events?)(/|$)",
    r"gallery",
    r"(^|/)profiles?(-|/|$)",
    r"alumni-profiles",
    r"meet-staff",
    r"its-staff",
    r"faculty-and-staff",
    r"faculty-staff",
    r"staff-directory",
    r"life-changing-courses",
    r"feature-stories",
    r"faculty-spotlight",
    r"a-message-",
    r"commencement",
    r"\?page=",
))

# Language gate: only pages whose <html lang> is English are kept.
HTML_LANG = re.compile(r"<html[^>]*\blang=[\"']?([A-Za-z-]+)", re.IGNORECASE)
# Backstop for locale path segments / non-English slugs missed by the lang attribute.
NON_ENGLISH_SLUG = re.compile(
    r"(^|/)(es|zh|zh-hans|zh-hant|ko|ja|fr|de|pt|ru|ar)(/|$)"
    r"|apoyando|estudiantes|familias|bienvenid|informacion|solicitud|ayuda-financiera"
    r"|-espanol|spanish-version|chinese-version|korean-version",
)

TITLE_SUFFIX = re.compile(r"\s*(?:::|\||—|-)\s*Swarthmore College\s*$")
TITLE_TAG = re.compile(r"<title[^>]*>(.*?)</title>", re.DOTALL | re.IGNORECASE)
H1_TAG = re.compile(r"<h1[^>]*>(.*?)</h1>", re.DOTALL | re.IGNORECASE)

session = requests.Session()
session.headers["User-Agent"] = "SwatGPT-WWW-Scraper/1.0 (Swarthmore RAG ingestion)"


def fetch(url: str) -> str:
    for attempt in range(4):
        try:
            resp = session.get(url, timeout=30)
            resp.raise_for_status()
            return resp.text
        except requests.RequestException as exc:
            if attempt == 3:
                raise
            wait = 2 ** attempt
            print(f"  retry in {wait}s ({exc})", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def sitemap_urls() -> list[str]:
    urls: list[str] = []
    for page in SITEMAP_PAGES:
        urls.extend(re.findall(r"<loc>([^<]+)</loc>", fetch(page)))
    return urls


def allowed(url: str) -> bool:
    path = urlparse(url).path.strip("/")
    if not path:
        return False
    first = path.split("/")[0]
    if first not in ALLOW_TREES and path not in ALLOW_EXACT:
        return False
    if NON_ENGLISH_SLUG.search(path):
        return False
    return not any(p.search(path) for p in EXCLUDE_PATTERNS)


def is_english(page_html: str) -> bool:
    match = HTML_LANG.search(page_html)
    return match is None or match.group(1).lower().startswith("en")


def clean_title(raw: str) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", "", raw)).strip()
    text = text.split(" :: ")[0].strip()
    return TITLE_SUFFIX.sub("", text).strip()


def split_title(body: str, page_html: str) -> tuple[str, str]:
    first, _, rest = body.partition("\n")
    if first.startswith("# "):
        title = clean_title(first.lstrip("# "))
        if title:
            return title, rest.strip()
    for pattern in (TITLE_TAG, H1_TAG):
        match = pattern.search(page_html)
        if match:
            title = clean_title(match.group(1))
            if title:
                return title, body
    return "Untitled", body


def extract_body(page_html: str, url: str) -> str:
    markdown = trafilatura.extract(
        page_html,
        url=url,
        output_format="markdown",
        include_links=False,
        include_tables=True,
        favor_precision=True,
    )
    return (markdown or "").strip()


def slugify(path: str) -> str:
    slug = re.sub(r"[^\w-]+", "-", path.strip("/").replace("/", "-")).strip("-").lower()
    return slug[:120] or "untitled"


def frontmatter(title: str, url: str, section: str, body: str) -> str:
    content_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    return "\n".join([
        "---",
        f'title: "{title.replace(chr(34), chr(39))}"',
        f"source: {url}",
        f"section: {section}",
        f"content_hash: {content_hash}",
        "---",
    ])


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_urls = sitemap_urls()
    targets = sorted({u for u in all_urls if allowed(u)})
    print(f"Sitemap URLs: {len(all_urls)}; after allowlist filter: {len(targets)}")

    seen_slugs: set[str] = set()
    failures: list[str] = []
    stubs = 0
    non_english = 0
    resumed = 0
    written = 0

    for i, url in enumerate(targets, 1):
        path = urlparse(url).path.strip("/")
        existing = slugify(path)
        if RESUME and (OUT_DIR / f"{existing}.md").exists():
            seen_slugs.add(existing)
            resumed += 1
            continue

        try:
            page_html = fetch(url)
            body = extract_body(page_html, url)
        except Exception as exc:
            failures.append(url)
            print(f"[{i}/{len(targets)}] FAILED {url}: {exc}", file=sys.stderr)
            continue

        if not is_english(page_html):
            non_english += 1
            print(f"[{i}/{len(targets)}] NON-ENGLISH {path}")
            time.sleep(SLEEP)
            continue

        title, body = split_title(body, page_html)
        if len(body) < MIN_BODY_CHARS:
            stubs += 1
            print(f"[{i}/{len(targets)}] STUB ({len(body)} chars) {path}")
            time.sleep(SLEEP)
            continue

        slug = slugify(path)
        if slug in seen_slugs:
            slug = f"{slug}-{hashlib.sha256(url.encode()).hexdigest()[:8]}"
        seen_slugs.add(slug)

        section = path.split("/")[0]
        content = f"{frontmatter(title, url, section, body)}\n\n# {title}\n\n{body}\n"
        (OUT_DIR / f"{slug}.md").write_text(content, encoding="utf-8")
        written += 1
        print(f"[{i}/{len(targets)}] {path} -> {slug}.md")
        time.sleep(SLEEP)

    stale = [f for f in OUT_DIR.glob("*.md") if f.stem not in seen_slugs]
    for f in stale:
        f.unlink()

    print(
        f"\nDone: {written} saved to {OUT_DIR}/ ({resumed} already present, "
        f"{len(stale)} stale files removed), "
        f"{stubs} skipped as stubs, {non_english} skipped as non-English, {len(failures)} failed"
    )
    if failures:
        print("Failed pages:", *failures, sep="\n  ")


if __name__ == "__main__":
    main()
