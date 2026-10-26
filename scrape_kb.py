"""Scrape every article from the Swarthmore Knowledge Base (MediaWiki) into markdown files.

Each article in the main namespace is fetched via the MediaWiki API, converted from
rendered HTML to markdown, and saved under information/ with YAML frontmatter
(title, source URL, page id, content hash, categories) for RAG ingestion.

Usage: python scrape_kb.py
Dependencies: requests, html2text

Articles that were not rescraped (removed or renamed on the wiki) are pruned only when
every fetch succeeded and at most MAX_PRUNE_RATIO (default 0.2) of the existing files
would go; otherwise everything is kept. Run merge_printers.py afterwards as usual.
"""

import os
import re
import sys
import time
import hashlib
from pathlib import Path

import requests
import html2text

API = "https://kb.swarthmore.edu/api.php"
BASE = "https://kb.swarthmore.edu"
OUT_DIR = Path(__file__).parent / "information"
SLEEP = 0.15
MAX_PRUNE_RATIO = float(os.environ.get("MAX_PRUNE_RATIO", "0.2"))

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


def stale_files(kept: set[str], failures: list[str]) -> tuple[list[Path], str | None]:
    """Files to prune, or the reason pruning is skipped (a failure is not a removal)."""
    existing = sorted(OUT_DIR.glob("*.md"))
    stale = [f for f in existing if f.stem not in kept]
    if failures:
        return [], f"{len(failures)} fetch(es) failed"
    if existing and len(stale) > MAX_PRUNE_RATIO * len(existing):
        return [], (
            f"{len(stale)}/{len(existing)} files would be removed, over MAX_PRUNE_RATIO={MAX_PRUNE_RATIO}"
        )
    return stale, None


def yaml_quote(value: str) -> str:
    """Double-quoted YAML scalar; the raw title stays in the H1 and ingest matches the two."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def frontmatter(title: str, url: str, pageid: int, categories: list[str], body: str) -> str:
    lines = [
        "---",
        f"title: {yaml_quote(title)}",
        f"source: {url}",
        f"pageid: {pageid}",
        f"content_hash: {hashlib.sha256(body.encode('utf-8')).hexdigest()}",
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

        content = f"{frontmatter(title, url, page['pageid'], categories, body)}\n\n# {title}\n\n{body}\n"
        (OUT_DIR / f"{slug}.md").write_text(content, encoding="utf-8")
        print(f"[{i}/{len(pages)}] {title} -> {slug}.md")
        time.sleep(SLEEP)

    stale, skip_reason = stale_files(seen_slugs, failures)
    for f in stale:
        f.unlink()

    print(
        f"\nDone: {len(pages) - len(failures)} saved to {OUT_DIR}/, "
        f"{len(stale)} stale files removed, {len(failures)} failed"
    )
    if skip_reason:
        print(f"Pruning skipped: {skip_reason}. Existing articles were kept; re-run to retry.")
    if failures:
        print("Failed pages:", *failures, sep="\n  ")


if __name__ == "__main__":
    main()
