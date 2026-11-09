#!/usr/bin/env python3
"""Stack header PNGs with out-of-band labels (Pillow)."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def load_row(img_path: Path, title: str, note: str, target_w: int = 1440):
    img = Image.open(img_path).convert("RGBA")
    if img.width != target_w:
        ratio = target_w / img.width
        img = img.resize((target_w, int(img.height * ratio)), Image.Resampling.LANCZOS)
    title_h = 28
    note_h = 36
    gap = 8
    strip_h = title_h + note_h + gap
    row_h = strip_h + img.height
    row = Image.new("RGBA", (target_w, row_h), (245, 245, 240, 255))
    draw = ImageDraw.Draw(row)
    try:
        font_t = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
        font_n = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except OSError:
        font_t = ImageFont.load_default()
        font_n = ImageFont.load_default()
    draw.text((0, 4), title, fill=(20, 20, 20, 255), font=font_t)
    draw.text((0, title_h + 2), note, fill=(80, 80, 80, 255), font=font_n)
    row.paste(img, (0, strip_h))
    return row


def main():
    spec_path, out_path = sys.argv[1], sys.argv[2]
    spec = json.loads(Path(spec_path).read_text())
    rows = [load_row(Path(r["header"]), r["label"], r["note"]) for r in spec["rows"]]
    pad = 16
    total_h = sum(r.height for r in rows) + pad * (len(rows) + 1)
    w = rows[0].width
    sheet = Image.new("RGBA", (w + pad * 2, total_h), (245, 245, 240, 255))
    y = pad
    for row in rows:
        sheet.paste(row, (pad, y))
        y += row.height + pad
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(out_path, format="PNG")
    print(json.dumps({"out": out_path, "width": sheet.width, "height": sheet.height, "rows": len(rows)}))


if __name__ == "__main__":
    main()
