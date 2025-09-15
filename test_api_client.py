import os
import time
import requests
from pathlib import Path

BASE_URL = os.environ.get("DOTS_API_BASE", "http://127.0.0.1:8080")
OUT_MD = Path(os.environ.get("DOTS_TEST_MD", "testapi.md"))

# Prefer user-specified path; else default to ./assets/...; fallback to ./dotsocr/assets/...
file_path = os.environ.get("FILE", "./assets/showcase_origin/formula_2.jpg")
if not Path(file_path).exists():
    alt = Path("./dotsocr/assets/showcase_origin/formula_2.jpg")
    if alt.exists():
        file_path = str(alt)

print(f"Using file: {file_path}")

# Wait for /health
for i in range(60):
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        if r.ok:
            print("Health:", r.json())
            break
    except Exception as e:
        pass
    time.sleep(1)
else:
    raise SystemExit("API /health not responding")

# Call /predict
params = {
    "prompt": "prompt_layout_all_en",
    "fitz_preprocess": "true"
}
with open(file_path, "rb") as f:
    files = {"file": (Path(file_path).name, f, "application/octet-stream")}
    resp = requests.post(f"{BASE_URL}/predict", params=params, files=files, timeout=None)

if not resp.ok:
    raise SystemExit(f"Predict failed: {resp.status_code} {resp.text}")

payload = resp.json()
md_text = payload.get("md")
md_path = payload.get("md_path")

# If md not in payload, try GET /markdown
if not md_text and md_path:
    try:
        r2 = requests.get(f"{BASE_URL}/markdown", params={"path": md_path}, timeout=60)
        if r2.ok:
            md_text = r2.text
    except Exception:
        pass

if not md_text:
    md_text = f"No markdown content returned. Payload keys: {list(payload.keys())}"

OUT_MD.write_text(md_text, encoding="utf-8")
print(f"Wrote markdown to {OUT_MD.resolve()}")