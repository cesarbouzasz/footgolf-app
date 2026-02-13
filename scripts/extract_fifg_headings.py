import re

from pypdf import PdfReader


def main() -> None:
  path = r"public/footgolf-app_FIFG-Rules-of-the-Game-2025.pdf"
  reader = PdfReader(path)

  headings: list[tuple[int, str]] = []
  seen: set[str] = set()

  part_re = re.compile(r"^(PART\s+\d+\s*-\s*.+)$", re.IGNORECASE)
  rule_re = re.compile(r"^\d+-\d+(?:-\d+)?\s+[-–]\s+.+$")

  for page_index, page in enumerate(reader.pages, start=1):
    text = page.extract_text() or ""
    for line in (ln.strip() for ln in text.splitlines()):
      if not line:
        continue
      if not (part_re.match(line) or rule_re.match(line)):
        continue

      key = line.lower()
      if key in seen:
        continue
      seen.add(key)
      headings.append((page_index, line))

  print(f"pages={len(reader.pages)}")
  print(f"headings={len(headings)}")
  for page_index, line in headings:
    print(f"p{page_index}: {line}")


if __name__ == "__main__":
  main()
