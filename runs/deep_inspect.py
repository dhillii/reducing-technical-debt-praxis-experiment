import json
import re

base = "/mnt/c/Users/David Hill/iCloudDrive/GWU/Dissertation/reducing-technical-debt-praxis-experiment/runs"

# ── File 1: locate unparseable row 85 ─────────────────────────────────────────
print("=== File 1: corrupt row 85 ===")
with open(f"{base}/job-2addc568-3c83-45a0-bc4a-9eef98cfa2ce-output.jsonl", errors="replace") as f:
    lines = f.readlines()
line85 = lines[84].strip()
print(f"Length of line 85: {len(line85)} chars")
try:
    json.loads(line85, strict=False)
    print("Recovered with strict=False")
except json.JSONDecodeError as e:
    print(f"Still fails: {e}")
    bad_char = line85[e.pos - 1 : e.pos + 1]
    print(f"Bad chars near position {e.pos}: {repr(bad_char)}")
    m = re.search(r'"custom_id"\s*:\s*"([^"]+)"', line85)
    print(f"custom_id from raw text: {m.group(1) if m else 'not found'}")
    m2 = re.search(r'"status_code"\s*:\s*(\d+)', line85)
    print(f"status_code from raw text: {m2.group(1) if m2 else 'not found'}")

# ── File 1: custom_id coverage ────────────────────────────────────────────────
rows1 = []
with open(f"{base}/job-2addc568-3c83-45a0-bc4a-9eef98cfa2ce-output.jsonl", errors="replace") as f:
    for line in f:
        line = line.strip()
        if line:
            try:
                rows1.append(json.loads(line, strict=False))
            except Exception:
                pass
ids1 = sorted([int(r["custom_id"]) for r in rows1])
print(f"\nFile 1 custom_ids: {ids1[0]}–{ids1[-1]}, count={len(ids1)}")
missing1 = set(range(ids1[0], ids1[-1] + 1)) - set(ids1)
print(f"Missing custom_ids in file 1: {sorted(missing1)}")

# ── File 2: custom_id coverage ────────────────────────────────────────────────
rows2 = []
with open(f"{base}/job-c352e2fa-e9e0-47e7-a629-0a24fcaa7ab9-output.jsonl", errors="replace") as f:
    for line in f:
        line = line.strip()
        if line:
            try:
                rows2.append(json.loads(line, strict=False))
            except Exception:
                pass
ids2 = sorted([int(r["custom_id"]) for r in rows2])
print(f"\nFile 2 custom_ids: {ids2[0]}–{ids2[-1]}, count={len(ids2)}")
missing2 = set(range(ids2[0], ids2[-1] + 1)) - set(ids2)
print(f"Missing custom_ids in file 2 (first 30): {sorted(missing2)[:30]}")
print(f"Total missing: {len(missing2)}")

# ── File 2: truncated rows ────────────────────────────────────────────────────
print("\n=== File 2: truncated rows (finish_reason=length) ===")
for r in rows2:
    body = r["response"]["body"]
    choices = body.get("choices", [])
    if choices and choices[0].get("finish_reason") == "length":
        content = choices[0]["message"]["content"]
        model = body.get("model", "unknown")
        usage = body.get("usage", {})
        print(f"custom_id={r['custom_id']}  model={model}  usage={usage}")
        print(f"  Content starts: {repr(content[:200])}")
        print(f"  Content ends:   {repr(content[-200:])}")

# ── File 2: short content outliers ───────────────────────────────────────────
print("\n=== File 2: short content rows (< 1000 chars) ===")
for r in rows2:
    body = r["response"]["body"]
    choices = body.get("choices", [])
    if choices:
        content = choices[0]["message"]["content"]
        if len(content) < 1000:
            print(f"  custom_id={r['custom_id']} len={len(content)}: {repr(content[:300])}")
