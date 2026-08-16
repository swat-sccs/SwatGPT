"""Scrape the current Swarthmore College catalog (Acalog) into markdown files.

The catalog gateway (content.php / preview_*.php) sits behind an AWS WAF JS
challenge, but the site's own ajax endpoints (ajax/preview_course.php,
ajax/preview_program.php, ajax/preview_page.php, ajax/preview_filter.php)
serve the same content and are used here. Courses, programs, and
student-facing policy sections (educational program, degree requirements,
course credit, academic calendar) from the current catalog year are each
written to information/catalog/ as markdown with YAML frontmatter as they are
scraped, for RAG ingestion.

Usage: python3 scrape_catalog.py
Dependencies: requests, html2text
"""

import re
import sys
import time
import hashlib
from html import unescape
from pathlib import Path

import requests
import html2text

BASE = "https://catalog.swarthmore.edu"
OUT_DIR = Path(__file__).parent / "information" / "catalog"
REQUEST_PACING = 1.0
THROTTLE_INITIAL_WAIT = 60
THROTTLE_MAX_WAIT = 480
POLICY_SECTIONS = (
    "educational program",
    "degree requirements",
    "course credit",
    "academic calendar",
)

session = requests.Session()
session.headers["User-Agent"] = "SwatGPT-Catalog-Scraper/1.0 (Swarthmore RAG ingestion)"


def fetch(path: str, params: dict) -> str:
    url = f"{BASE}/{path}"
    throttle_wait = THROTTLE_INITIAL_WAIT
    transport_failures = 0
    while True:
        try:
            resp = session.get(url, params=params, timeout=30)
            if resp.status_code == 202 or (resp.ok and not resp.text.strip()):
                if throttle_wait > THROTTLE_MAX_WAIT:
                    raise RuntimeError(f"still throttled after backoff cap (HTTP {resp.status_code})")
                print(f"  throttled (HTTP {resp.status_code}); cooling down {throttle_wait}s", file=sys.stderr)
                time.sleep(throttle_wait)
                throttle_wait *= 2
                continue
            resp.raise_for_status()
            return resp.text
        except requests.RequestException as exc:
            transport_failures += 1
            if transport_failures > 3:
                raise
            wait = 2**transport_failures
            print(f"  retry in {wait}s ({exc})", file=sys.stderr)
            time.sleep(wait)


def discover_catalog() -> tuple[int, str]:
    html = fetch("index.php", {})
    match = re.search(r'<option value="(\d+)" selected>College Bulletin (\d{4}-\d{4})\s*<', html)
    if not match:
        raise RuntimeError("could not discover current catalog id/year")
    return int(match.group(1)), match.group(2)


def discover_navoids(catoid: int) -> dict:
    html = fetch("index.php", {"catoid": str(catoid)})
    pattern = rf'href="/content\.php\?catoid={catoid}&navoid=(\d+)"[^>]*>([^<]+)<'
    nav = {"policies": []}
    for navoid, label in re.findall(pattern, html):
        clean = unescape(label).strip()
        lowered = clean.lower()
        if clean == "Course Search":
            nav["courses"] = int(navoid)
        elif clean == "Departments and Programs":
            nav["programs"] = int(navoid)
        elif any(section in lowered for section in POLICY_SECTIONS):
            nav["policies"].append(int(navoid))
    missing = [key for key in ("courses", "programs") if key not in nav]
    if missing or not nav["policies"]:
        raise RuntimeError(f"navigation discovery incomplete: {nav}")
    return nav


def make_converter() -> html2text.HTML2Text:
    conv = html2text.HTML2Text()
    conv.body_width = 0
    conv.ignore_images = True
    conv.ignore_emphasis = False
    conv.wrap_links = False
    return conv


def clean_html(html: str) -> str:
    html = re.sub(r'<a href="#" class="link-open".*?</a>', "", html, flags=re.DOTALL)
    html = re.sub(r'<span class="print_link">.*?</span>', "", html, flags=re.DOTALL)
    html = re.sub(r"<div class='acalog-social-media-links[^']*'>\s*</div>", "", html)
    html = re.sub(r'<span style="display: none !important">[^<]*</span>', "", html)
    html = re.sub(r'<p><a target="_blank" href="https://studentregistration\.swarthmore\.edu[^"]*">[^<]*</a></p>', "", html)
    html = re.sub(r'<a href="#"[^>]*>(.*?)</a>', r"\1", html, flags=re.DOTALL)
    html = re.sub(r"<hr\s*/?>", "", html)
    return html


def absolutize_links(markdown: str) -> str:
    markdown = re.sub(r"\]\((/[^)]*)\)", rf"]({BASE}\1)", markdown)
    return re.sub(r"\]\(((?:preview_|content\.php|index\.php)[^)]*)\)", rf"]({BASE}/\1)", markdown)


def to_markdown(converter: html2text.HTML2Text, html: str) -> str:
    markdown = absolutize_links(converter.handle(clean_html(html))).strip()
    return re.sub(r"\n{3,}", "\n\n", markdown)


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", unescape(text)).strip()
    slug = re.sub(r"[\s_]+", "-", slug).lower()
    return slug[:100] or "untitled"


def quote(value: str) -> str:
    return '"' + value.replace('"', "'") + '"'


def frontmatter(fields: list[tuple[str, str]]) -> str:
    return "\n".join(["---", *(f"{key}: {value}" for key, value in fields), "---"])


class Writer:
    def __init__(self, catalog_year: str):
        self.catalog_year = catalog_year
        self.seen: set[str] = set()
        self.counts: dict[str, int] = {}

    def save(self, filename: str, uid: str, fields: list[tuple[str, str]], title: str, body: str, kind: str) -> str:
        if filename in self.seen:
            filename = filename.removesuffix(".md") + f"-{uid}.md"
        self.seen.add(filename)
        body_text = f"# {title}\n\n{body}\n"
        digest = hashlib.sha256(body_text.encode("utf-8")).hexdigest()
        fields = [*fields, ("catalog_year", self.catalog_year), ("content_hash", digest)]
        (OUT_DIR / filename).write_text(f"{frontmatter(fields)}\n\n{body_text}", encoding="utf-8")
        self.counts[kind] = self.counts.get(kind, 0) + 1
        return filename


def load_done() -> tuple[dict[str, set[int]], set[str]]:
    done: dict[str, set[int]] = {"course": set(), "program": set(), "policy": set()}
    filenames: set[str] = set()
    for path in OUT_DIR.glob("*.md"):
        filenames.add(path.name)
        head = path.read_text(encoding="utf-8")[:600]
        type_match = re.search(r"^type: (\w+)$", head, re.MULTILINE)
        id_match = re.search(r"[?&](?:coid|poid|navoid)=(\d+)", head)
        if type_match and id_match and type_match.group(1) in done:
            done[type_match.group(1)].add(int(id_match.group(1)))
    return done, filenames


def list_course_ids(catoid: int, navoid: int) -> list[int]:
    first = fetch("ajax/preview_filter.php", {"catoid": str(catoid), "nav_oid": str(navoid), "show": ""})
    pages = [int(p) for p in re.findall(r"cpage%5D=(\d+)", first)]
    last_page = max(pages) if pages else 1
    course_ids: list[int] = []
    seen: set[int] = set()

    def collect(html: str) -> None:
        for coid in re.findall(rf"showCourse\('{catoid}', '(\d+)'", html):
            course_id = int(coid)
            if course_id not in seen:
                seen.add(course_id)
                course_ids.append(course_id)

    collect(first)
    for page in range(2, last_page + 1):
        html = fetch(
            "ajax/preview_filter.php",
            {"catoid": str(catoid), "nav_oid": str(navoid), "filter[cpage]": str(page), "show": ""},
        )
        collect(html)
        print(f"  course index page {page}/{last_page}: {len(course_ids)} courses so far")
        time.sleep(REQUEST_PACING)
    return course_ids


def list_programs(catoid: int, navoid: int) -> list[tuple[int, str]]:
    html = fetch("ajax/preview_filter.php", {"catoid": str(catoid), "nav_oid": str(navoid), "show": ""})
    pattern = rf'preview_program\.php\?catoid={catoid}&(?:amp;)?poid=(\d+)[^"]*"[^>]*>([^<]+)</a>'
    programs: list[tuple[int, str]] = []
    seen: set[int] = set()
    for poid, name in re.findall(pattern, html):
        program_id = int(poid)
        if program_id not in seen:
            seen.add(program_id)
            programs.append((program_id, unescape(name).strip()))
    return programs


def scrape_course(catoid: int, coid: int, converter: html2text.HTML2Text, writer: Writer) -> str:
    html = fetch("ajax/preview_course.php", {"catoid": str(catoid), "coid": str(coid), "show": ""})
    title_match = re.search(r"<h3>(.*?)</h3>", html, re.DOTALL)
    if not title_match:
        raise ValueError("no course title found")
    title = re.sub(r"\s+", " ", unescape(title_match.group(1)).replace("\xa0", " ")).strip()

    body_html = html[title_match.end():]
    body_html = re.sub(r"</td>\s*</tr>\s*</table>.*$", "", body_html, flags=re.DOTALL)
    body = to_markdown(converter, body_html)

    url = f"{BASE}/preview_course_nopop.php?catoid={catoid}&coid={coid}"
    fields: list[tuple[str, str]] = [("title", quote(title)), ("source", url), ("type", "course")]

    code_match = re.match(r"([A-Z]{2,6})\s+([0-9]{1,3}[A-Z]{0,3})\.?\s*(.*)", title)
    if code_match:
        dept, number, rest = code_match.groups()
        fields.extend([("dept", dept.lower()), ("number", quote(number))])
        filename = f"{dept.lower()}-{number.lower()}-{slugify(rest)}.md"
    else:
        filename = f"course-{slugify(title)}.md"

    credits_match = re.search(r"(\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?)\s+credits?\b", body)
    if credits_match:
        fields.append(("credits", quote(credits_match.group(1))))
    prereq_match = re.search(r"Prerequisites?:\s*([^\n]+)", body)
    if prereq_match:
        fields.append(("prereqs", quote(prereq_match.group(1).strip().rstrip("\\"))))

    return writer.save(filename, str(coid), fields, title, body, "course")


def scrape_program(catoid: int, poid: int, name: str, converter: html2text.HTML2Text, writer: Writer) -> str:
    html = fetch("ajax/preview_program.php", {"catoid": str(catoid), "poid": str(poid), "show": ""})
    title_match = re.search(r"<h1>(.*?)</h1>", html, re.DOTALL)
    title = name
    body_html = html[title_match.end():] if title_match else html
    body = to_markdown(converter, body_html)

    url = f"{BASE}/preview_program.php?catoid={catoid}&poid={poid}"
    fields = [("title", quote(title)), ("source", url), ("type", "program")]
    return writer.save(f"program-{slugify(title)}.md", str(poid), fields, title, body, "program")


def scrape_policy(catoid: int, navoid: int, converter: html2text.HTML2Text, writer: Writer) -> str:
    html = fetch("ajax/preview_page.php", {"catoid": str(catoid), "id": str(navoid), "show": ""})
    title_match = re.search(r'<h2 class="acalog-permalink-title">(.*?)</h2>', html, re.DOTALL)
    if not title_match:
        raise ValueError("no page title found")
    raw_title = re.sub(r"\s+", " ", unescape(title_match.group(1)).replace("\xa0", " ")).strip()
    title = re.sub(r"^\d+\s+", "", raw_title)

    body = to_markdown(converter, html[title_match.end():])
    url = f"{BASE}/content.php?catoid={catoid}&navoid={navoid}"
    fields = [("title", quote(title)), ("source", url), ("type", "policy")]
    return writer.save(f"policy-{slugify(title)}.md", str(navoid), fields, title, body, "policy")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    catoid, year = discover_catalog()
    print(f"Current catalog: catoid={catoid}, year {year}")
    nav = discover_navoids(catoid)
    print(f"Navigation: courses navoid={nav['courses']}, programs navoid={nav['programs']}, policy navoids={nav['policies']}")

    converter = make_converter()
    writer = Writer(year)
    failures: list[str] = []
    done, existing_files = load_done()
    writer.seen.update(existing_files)
    skipped = sum(len(ids) for ids in done.values())
    if skipped:
        print(f"Resuming: {len(done['course'])} courses, {len(done['program'])} programs, {len(done['policy'])} policies already on disk")

    for navoid in nav["policies"]:
        if navoid in done["policy"]:
            continue
        try:
            filename = scrape_policy(catoid, navoid, converter, writer)
            print(f"[policy {navoid}] -> {filename}")
        except Exception as exc:
            failures.append(f"policy navoid={navoid}: {exc}")
            print(f"[policy {navoid}] FAILED: {exc}", file=sys.stderr)
        time.sleep(REQUEST_PACING)

    programs = list_programs(catoid, nav["programs"])
    print(f"Found {len(programs)} programs")
    for i, (poid, name) in enumerate(programs, 1):
        if poid in done["program"]:
            continue
        try:
            filename = scrape_program(catoid, poid, name, converter, writer)
            print(f"[program {i}/{len(programs)}] {name} -> {filename}")
        except Exception as exc:
            failures.append(f"program poid={poid} ({name}): {exc}")
            print(f"[program {i}/{len(programs)}] FAILED {name}: {exc}", file=sys.stderr)
        time.sleep(REQUEST_PACING)

    course_ids = list_course_ids(catoid, nav["courses"])
    print(f"Found {len(course_ids)} courses")
    for i, coid in enumerate(course_ids, 1):
        if coid in done["course"]:
            continue
        try:
            filename = scrape_course(catoid, coid, converter, writer)
            print(f"[course {i}/{len(course_ids)}] coid={coid} -> {filename}")
        except Exception as exc:
            failures.append(f"course coid={coid}: {exc}")
            print(f"[course {i}/{len(course_ids)}] FAILED coid={coid}: {exc}", file=sys.stderr)
        time.sleep(REQUEST_PACING)

    total = sum(writer.counts.values())
    print(f"\nDone: {total} new files in {OUT_DIR}/ ({writer.counts}), {skipped} skipped as already scraped, {len(failures)} failed")
    if failures:
        print("Failures:", *failures, sep="\n  ")


if __name__ == "__main__":
    main()
