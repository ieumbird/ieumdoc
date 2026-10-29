"""Regenerate saved Docling fixtures against local docling-serve v1.32.0.

uv run --with httpx==0.28.1 --with pillow==12.0.0 python convert.py
Start/stop Docker separately using the commands in README.md.
"""
import base64
import hashlib
import io
import json
import time
import sys
from pathlib import Path
import httpx
from PIL import Image

root = Path(__file__).parent
endpoint = "http://127.0.0.1:8001"
options = {
    "from_formats": ["pdf"], "to_formats": ["json"], "image_export_mode": "embedded",
    "pipeline": "standard", "pdf_backend": "threaded_docling_parse",
    "do_ocr": True, "force_ocr": False, "ocr_preset": "auto", "ocr_lang": ["en"],
    "do_table_structure": True, "table_mode": "accurate", "table_cell_matching": True,
    "table_structure_preset": "tableformer_v1_accurate", "do_pdf_heading_hierarchy": True,
    "pdf_heading_hierarchy_options": {
        "use_bookmarks": True, "use_numbering": True, "use_style": True,
        "use_font_style": True, "style_size_tolerance": 0.05, "max_level": 6,
        "bookmark_match_threshold": 0.8,
    },
    "include_images": True, "include_page_images": True, "images_scale": 2.0,
    "md_compact_tables": False, "do_code_enrichment": True, "do_formula_enrichment": True,
    "do_picture_classification": True, "do_chart_extraction": False, "abort_on_error": False,
}

with httpx.Client(timeout=120) as client:
    version = client.get(endpoint + "/version").json()
    print("Service version:", version, flush=True)
    for folder in (root / name for name in (sys.argv[1:] or ["nist-sp1108r4", "synthetic"])):
        fields = []
        for key, value in options.items():
            values = value if isinstance(value, list) else [value]
            for item in values:
                encoded = json.dumps(item) if not isinstance(item, str) else item
                fields.append((key, (None, encoded)))
        pdf = (folder / "source.pdf").read_bytes()
        response = client.post(endpoint + "/v1/convert/file/async",
                               files=fields + [("files", ("source.pdf", pdf, "application/pdf"))])
        response.raise_for_status()
        task = response.json()["task_id"]
        print(folder.name, "task", task, flush=True)
        last = None
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            status = client.get(endpoint + "/v1/status/poll/" + task).json()
            state = status["task_status"]
            if state != last:
                print(folder.name, state, flush=True)
                last = state
            if state in ("success", "partial_success"):
                break
            if state in ("failure", "failed", "error"):
                raise RuntimeError(status)
            time.sleep(3)
        else:
            raise TimeoutError(task)
        result = client.get(endpoint + "/v1/result/" + task)
        result.raise_for_status()
        raw = result.json()
        doc = raw["document"]["json_content"]
        images = folder / "images"
        images.mkdir(exist_ok=True)

        def externalize(value):
            if isinstance(value, dict):
                if isinstance(value.get("uri"), str) and value["uri"].startswith("data:image/"):
                    image = Image.open(io.BytesIO(base64.b64decode(value["uri"].split(",", 1)[1])))
                    old_width = image.width
                    image.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
                    content = io.BytesIO()
                    image.save(content, format="PNG", optimize=True)
                    data = content.getvalue()
                    name = hashlib.sha256(data).hexdigest() + ".png"
                    (images / name).write_bytes(data)
                    value["uri"] = "images/" + name
                    value["size"] = {"width": image.width, "height": image.height}
                    value["dpi"] = round(value["dpi"] * image.width / old_width)
                    value["mimetype"] = "image/png"
                for child in value.values():
                    externalize(child)
            elif isinstance(value, list):
                for child in value:
                    externalize(child)

        externalize(doc)
        referenced = set()
        def image_names(value):
            if isinstance(value, dict):
                if isinstance(value.get("uri"), str) and value["uri"].startswith("images/"):
                    referenced.add(value["uri"][7:])
                for child in value.values():
                    image_names(child)
            elif isinstance(value, list):
                for child in value:
                    image_names(child)
        image_names(doc)
        for old in images.glob("*.png"):
            if old.name not in referenced:
                old.unlink()
        (folder / "document.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        manifest = {"service": version, "options": options, "source_sha256": hashlib.sha256(pdf).hexdigest(),
                    "task_status": state, "normalization": "Embedded images externalized to PNG, maximum 1000x1000; image size/dpi updated. All document semantics and provenance unchanged."}
        (folder / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(folder.name, "saved", len(doc["pages"]), "pages", flush=True)
