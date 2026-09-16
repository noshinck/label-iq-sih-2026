import json
import sys
from pathlib import Path

import pdfplumber


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "Usage: extract_pdf_text.py <pdf>"}))
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    if not pdf_path.exists():
        print(json.dumps({"ok": False, "error": f"PDF not found: {pdf_path}"}))
        sys.exit(1)

    pages = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
            pages.append({"page": index, "text": text})

    print(json.dumps({"ok": True, "document": pdf_path.name, "pages": pages}))


if __name__ == "__main__":
    main()
