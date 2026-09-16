import json
import sys
import tempfile
from pathlib import Path


def fail(message):
    print(json.dumps({"ok": False, "error": message}))
    sys.exit(1)


try:
    from paddleocr import PaddleOCR
except Exception as exc:
    fail(f"PaddleOCR is not installed or could not be imported: {exc}")

try:
    from PIL import Image, ImageOps
except Exception as exc:
    fail(f"Pillow is not installed or could not be imported: {exc}")


MAX_OCR_SIDE = 1800


def scale_box(box, scale_x=1, scale_y=1):
    return [[float(point[0]) * scale_x, float(point[1]) * scale_y] for point in box]


def normalize_line(raw_line, scale_x=1, scale_y=1):
    box = raw_line[0]
    if hasattr(box, "tolist"):
        box = box.tolist()
    box = scale_box(box, scale_x, scale_y)
    text = raw_line[1][0]
    confidence = float(raw_line[1][1])
    xs = [point[0] for point in box]
    ys = [point[1] for point in box]
    return {
        "text": text,
        "confidence": confidence,
        "box": box,
        "bounds": {
            "x": min(xs),
            "y": min(ys),
            "width": max(xs) - min(xs),
            "height": max(ys) - min(ys),
        },
    }


def prepare_image(image_path, temp_dir):
    with Image.open(image_path) as image:
      image = ImageOps.exif_transpose(image).convert("RGB")
      original_width, original_height = image.size
      working = image.copy()
      working.thumbnail((MAX_OCR_SIDE, MAX_OCR_SIDE), Image.Resampling.LANCZOS)
      processed_width, processed_height = working.size
      output_path = Path(temp_dir) / f"{image_path.stem}-ocr.jpg"
      working.save(output_path, "JPEG", quality=88, optimize=True)

    return {
        "path": output_path,
        "original_width": original_width,
        "original_height": original_height,
        "processed_width": processed_width,
        "processed_height": processed_height,
        "scale_x": original_width / processed_width if processed_width else 1,
        "scale_y": original_height / processed_height if processed_height else 1,
    }


def main():
    if len(sys.argv) < 2:
        fail("No image paths were provided to OCR.")

    image_paths = [Path(value) for value in sys.argv[1:]]
    missing = [str(path) for path in image_paths if not path.exists()]
    if missing:
        fail(f"Image file not found: {', '.join(missing)}")

    ocr = PaddleOCR(
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        text_det_limit_side_len=MAX_OCR_SIDE,
        lang="en",
    )
    images = []

    with tempfile.TemporaryDirectory(prefix="packcheck-ocr-") as temp_dir:
        for image_path in image_paths:
            prepared = prepare_image(image_path, temp_dir)
            result = ocr.ocr(str(prepared["path"]))
            lines = []
            for page in result or []:
                if isinstance(page, dict):
                    texts = page.get("rec_texts") or []
                    scores = page.get("rec_scores") or []
                    boxes = page.get("rec_polys") or page.get("dt_polys") or []
                    for index, text in enumerate(texts):
                        box = boxes[index] if index < len(boxes) else [[0, 0], [0, 0], [0, 0], [0, 0]]
                        score = scores[index] if index < len(scores) else 0
                        lines.append(normalize_line([box, [text, score]], prepared["scale_x"], prepared["scale_y"]))
                else:
                    for raw_line in page or []:
                        lines.append(normalize_line(raw_line, prepared["scale_x"], prepared["scale_y"]))

            images.append({
                "path": str(image_path),
                "text": "\n".join(line["text"] for line in lines),
                "averageConfidence": (
                    sum(line["confidence"] for line in lines) / len(lines)
                    if lines else 0
                ),
                "originalSize": {
                    "width": prepared["original_width"],
                    "height": prepared["original_height"],
                },
                "processedSize": {
                    "width": prepared["processed_width"],
                    "height": prepared["processed_height"],
                },
                "lines": lines,
            })

    print(json.dumps({"ok": True, "images": images}))


if __name__ == "__main__":
    main()
