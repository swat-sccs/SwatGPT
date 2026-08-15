"""Merge the individual KB printer pages into two RAG-friendly documents.

Run after scrape_kb.py. Replaces the ~200 near-duplicate per-printer pages in
information/ with:
  - printer-directory.md      (every printer's details, grouped by building)
  - printer-setup-instructions.md (each unique setup-instruction variant, once)

Usage: python merge_printers.py
"""

import re
import hashlib
from pathlib import Path
from collections import defaultdict

INFO_DIR = Path(__file__).parent / "information"

FIELD_ORDER = ["Department", "Location", "Queue Name", "Printer Model", "Access", "Print Release Station"]


def parse_frontmatter(text: str) -> dict:
    match = re.match(r"---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        return {}
    meta: dict = {}
    for line in match.group(1).splitlines():
        if ":" in line and not line.startswith(" "):
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip().strip('"')
    return meta


def parse_table(text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in text.splitlines():
        if "|" not in line or line.strip().startswith("---"):
            continue
        key, _, value = line.partition("|")
        key, value = key.strip(), value.strip()
        if key in FIELD_ORDER:
            fields[key] = value
    return fields


def extract_section(text: str, heading_pattern: str) -> str | None:
    match = re.search(rf"^#{{2,3}} {heading_pattern}\s*$(.*?)(?=^#{{1,3}} |\Z)", text, re.DOTALL | re.MULTILINE)
    return match.group(1).strip() if match else None


def normalize(section: str) -> str:
    return hashlib.sha1(re.sub(r"\s+", " ", section).strip().encode()).hexdigest()


BUILDING_ALIASES = {
    "singer hall": "Singer",
    "mccabe library": "McCabe",
    "marylyons": "Mary Lyons",
    "fieldhouse lane": "506 Fieldhouse Lane",
    "sharples community commons": "Sharples Commons",
    "old tarble lab": "Old Tarble",
    "kohlberg 326 language center": "Kohlberg",
    "intercultural center clothier": "Intercultural Center",
    "lang center for social responsibility": "Lang Center for Social Responsibility",
}


def building_of(location: str) -> str:
    cleaned = re.sub(r"\bRoom\s+\S+\s*$", "", location, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s+\d(?:st|nd|rd|th)(\s+Floor\b.*)?$", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s+(Lobby|Hallway|Basement|Corridor|Loft|Office)$", "", cleaned, flags=re.IGNORECASE).strip()
    for _ in range(2):
        cleaned = re.sub(r"\s+[A-Z]{0,2}\d{1,4}[A-Za-z]?(-\d+)?$", "", cleaned).strip()
    cleaned = re.sub(r"\bAve\b\.?", "Avenue", cleaned)
    cleaned = cleaned or location
    return BUILDING_ALIASES.get(cleaned.lower(), cleaned)


def mac_support(text: str) -> str:
    section = extract_section(text, r"Connecting from macOS")
    if section and re.search(r"no Mac drivers", section, re.IGNORECASE):
        return "No macOS support"
    return "Windows and macOS"


def is_printer_page(text: str, meta: dict) -> bool:
    return meta.get("title", "").endswith(" Printer") and "Queue Name" in text


def collect() -> tuple[list[dict], dict[str, dict]]:
    printers: list[dict] = []
    variants: dict[str, dict] = {}

    for path in sorted(INFO_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        meta = parse_frontmatter(text)
        if not is_printer_page(text, meta):
            continue

        fields = parse_table(text)
        printers.append({
            "path": path,
            "title": meta.get("title", path.stem),
            "source": meta.get("source", ""),
            "fields": fields,
            "mac": mac_support(text),
        })

        for label, pattern in [
            ("Connecting from Windows", r"Connecting from Windows"),
            ("Connecting from macOS", r"Connecting from macOS"),
            ("Print Release Station Instructions", r"Print Release Station Instructions"),
        ]:
            section = extract_section(text, re.escape(pattern))
            if not section:
                continue
            key = f"{label}:{normalize(section)}"
            variant = variants.setdefault(key, {"label": label, "text": section, "models": set(), "count": 0})
            variant["models"].add(fields.get("Printer Model", "Unknown model"))
            variant["count"] += 1

    return printers, variants


def write_directory(printers: list[dict]) -> None:
    by_building: dict[str, list[dict]] = defaultdict(list)
    display_names: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for printer in printers:
        building = building_of(printer["fields"].get("Location", "Unknown"))
        key = building.lower()
        by_building[key].append(printer)
        display_names[key][building] += 1

    lines = [
        "---",
        'title: "Campus Printer Directory"',
        "source: https://kb.swarthmore.edu/wiki/Main_Page",
        "categories:",
        "  - FacStaff Printer",
        "  - Printing",
        "---",
        "",
        "# Campus Printer Directory",
        "",
        f"Directory of all {len(printers)} networked faculty/staff printers at Swarthmore College, "
        "grouped by building. To connect from Windows or macOS, or to use a print release station, "
        "see the \"Campus Printer Setup Instructions\" article. Each printer is installed using its "
        "queue name on the `swat-print` print server.",
        "",
    ]

    for key in sorted(by_building):
        canonical = max(display_names[key].items(), key=lambda item: item[1])[0]
        lines.append(f"## {canonical}")
        lines.append("")
        for printer in sorted(by_building[key], key=lambda p: p["fields"].get("Queue Name", "")):
            f = printer["fields"]
            release = "Yes" if f.get("Print Release Station", "").lower().startswith("y") else "No"
            lines.append(f"### {f.get('Queue Name', printer['title'])}")
            lines.append("")
            lines.append(f"- **Department**: {f.get('Department', 'Unknown')}")
            lines.append(f"- **Location**: {f.get('Location', 'Unknown')}")
            lines.append(f"- **Printer model**: {f.get('Printer Model', 'Unknown')}")
            lines.append(f"- **Access**: {f.get('Access', 'Unknown')}")
            lines.append(f"- **Print release station (OneCard swipe required)**: {release}")
            lines.append(f"- **Platform support**: {printer['mac']}")
            lines.append(f"- **Source**: {printer['source']}")
            lines.append("")

    (INFO_DIR / "printer-directory.md").write_text("\n".join(lines), encoding="utf-8")


def write_instructions(variants: dict[str, dict]) -> None:
    lines = [
        "---",
        'title: "Campus Printer Setup Instructions"',
        "source: https://kb.swarthmore.edu/wiki/Main_Page",
        "categories:",
        "  - FacStaff Printer",
        "  - Printing",
        "---",
        "",
        "# Campus Printer Setup Instructions",
        "",
        "How to connect to Swarthmore's networked faculty/staff printers. Find your printer's "
        "queue name, model, and location in the \"Campus Printer Directory\" article, then follow "
        "the instructions below that match your operating system and printer model.",
        "",
    ]

    order = ["Connecting from Windows", "Connecting from macOS", "Print Release Station Instructions"]
    grouped: dict[str, list[dict]] = defaultdict(list)
    for variant in variants.values():
        grouped[variant["label"]].append(variant)

    for label in order:
        group = sorted(grouped.get(label, []), key=lambda v: -v["count"])
        if not group:
            continue
        lines.append(f"## {label}")
        lines.append("")
        for variant in group:
            if len(group) > 1:
                models = ", ".join(sorted(variant["models"]))
                lines.append(f"### Applies to: {models}")
                lines.append("")
            lines.append(re.sub(
                r"from the table (at the top of this page|above)",
                "from the Campus Printer Directory",
                variant["text"],
            ))
            lines.append("")

    (INFO_DIR / "printer-setup-instructions.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    printers, variants = collect()
    print(f"Parsed {len(printers)} printer pages, {len(variants)} unique instruction variants")

    write_directory(printers)
    write_instructions(variants)

    for printer in printers:
        printer["path"].unlink()
    print(f"Wrote printer-directory.md and printer-setup-instructions.md, removed {len(printers)} originals")


if __name__ == "__main__":
    main()
