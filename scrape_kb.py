"""Scrape every article from the Swarthmore Knowledge Base (MediaWiki) into markdown files.

Each article in the main namespace is fetched via the MediaWiki API, converted from
rendered HTML to markdown, and saved under information/ with YAML frontmatter
(title, source URL, page id, categories) for RAG ingestion.

Usage: python scrape_kb.py
Dependencies: requests, html2text
"""

import re
import sys
import time
from pathlib import Path

import requests
import html2text

API = "https://kb.swarthmore.edu/api.php"
BASE = "https://kb.swarthmore.edu"
OUT_DIR = Path(__file__).parent / "information"

session = requests.Session()
session.headers["User-Agent"] = "SwatGPT-KB-Scraper/1.0 (Swarthmore RAG ingestion)"


def api_get(params: dict) -> dict:
    params = {**params, "format": "json", "formatversion": "2"}
    for attempt in range(4):
        try:
            resp = session.get(API, params=params, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except (requests.RequestException, ValueError) as exc:
            if attempt == 3:
                raise
            wait = 2 ** attempt
            print(f"  retry in {wait}s ({exc})", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def list_all_pages() -> list[dict]:
    pages: list[dict] = []
    params = {
        "action": "query",
        "list": "allpages",
        "apnamespace": "0",
        "apfilterredir": "nonredirects",
        "aplimit": "500",
    }
    while True:
        data = api_get(params)
        pages.extend(data["query"]["allpages"])
        cont = data.get("continue")
        if not cont:
            return pages
        params = {**params, **cont}


def make_converter() -> html2text.HTML2Text:
    conv = html2text.HTML2Text()
    conv.body_width = 0
    conv.ignore_images = False
    conv.ignore_emphasis = False
    conv.mark_code = True
    conv.wrap_links = False
    return conv


def absolutize_links(markdown: str) -> str:
    return re.sub(r"\]\((/[^)]*)\)", rf"]({BASE}\1)", markdown)


def strip_edit_sections(html: str) -> str:
    return re.sub(r'<span class="mw-editsection">.*?</span></span>', "", html, flags=re.DOTALL)


def slugify(title: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", title).strip()
    slug = re.sub(r"[\s_]+", "-", slug).lower()
    return slug[:120] or "untitled"


def fetch_page(title: str) -> dict | None:
    data = api_get({
        "action": "parse",
        "page": title,
        "prop": "text|categories|displaytitle",
        "disablelimitreport": "1",
        "disableeditsection": "1",
    })
    return data.get("parse")


def frontmatter(title: str, url: str, pageid: int, categories: list[str]) -> str:
    lines = [
        "---",
        f'title: "{title.replace(chr(34), chr(39))}"',
        f"source: {url}",
        f"pageid: {pageid}",
    ]
    if categories:
        lines.append("categories:")
        lines.extend(f"  - {c}" for c in categories)
    lines.append("---")
    return "\n".join(lines)


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    pages = list_all_pages()
    print(f"Found {len(pages)} articles")

    converter = make_converter()
    seen_slugs: set[str] = set()
    failures: list[str] = []

    for i, page in enumerate(pages, 1):
        title = page["title"]
        try:
            parsed = fetch_page(title)
            if not parsed or "text" not in parsed:
                raise ValueError("no parse text returned")
        except Exception as exc:
            failures.append(title)
            print(f"[{i}/{len(pages)}] FAILED {title}: {exc}", file=sys.stderr)
            continue

        html = strip_edit_sections(parsed["text"])
        body = absolutize_links(converter.handle(html)).strip()
        categories = [c["category"].replace("_", " ") for c in parsed.get("categories", [])]
        url = f"{BASE}/wiki/{requests.utils.quote(title.replace(' ', '_'))}"

        slug = slugify(title)
        if slug in seen_slugs:
            slug = f"{slug}-{page['pageid']}"
        seen_slugs.add(slug)

        content = f"{frontmatter(title, url, page['pageid'], categories)}\n\n# {title}\n\n{body}\n"
        (OUT_DIR / f"{slug}.md").write_text(content, encoding="utf-8")
        print(f"[{i}/{len(pages)}] {title} -> {slug}.md")
        time.sleep(0.15)

    print(f"\nDone: {len(pages) - len(failures)} saved to {OUT_DIR}/, {len(failures)} failed")
    if failures:
        print("Failed pages:", *failures, sep="\n  ")


if __name__ == "__main__":
    main()
