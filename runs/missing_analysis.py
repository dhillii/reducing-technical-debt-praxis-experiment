import json

base = "/mnt/c/Users/David Hill/iCloudDrive/GWU/Dissertation/reducing-technical-debt-praxis-experiment/runs"

# What models are in each file?
print("=== Model distribution ===")
for fname, fpath in [
    ("file1", f"{base}/job-2addc568-3c83-45a0-bc4a-9eef98cfa2ce-output.jsonl"),
    ("file2", f"{base}/job-c352e2fa-e9e0-47e7-a629-0a24fcaa7ab9-output.jsonl"),
]:
    rows = []
    with open(fpath, errors="replace") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line, strict=False))
                except Exception:
                    pass
    models = {}
    for r in rows:
        m = r["response"]["body"].get("model", "unknown")
        models[m] = models.get(m, 0) + 1
    print(f"{fname}: {models}")

# File 2: what are the 194 missing custom_ids?
rows2 = []
with open(f"{base}/job-c352e2fa-e9e0-47e7-a629-0a24fcaa7ab9-output.jsonl", errors="replace") as f:
    for line in f:
        line = line.strip()
        if line:
            try:
                rows2.append(json.loads(line, strict=False))
            except Exception:
                pass
ids2 = set(int(r["custom_id"]) for r in rows2)
missing = sorted(set(range(1, 1315)) - ids2)
print(f"\nFile 2: {len(missing)} missing custom_ids")

# Are they clustered?
gaps = []
start = missing[0]
prev = missing[0]
for cid in missing[1:]:
    if cid != prev + 1:
        gaps.append((start, prev))
        start = cid
    prev = cid
gaps.append((start, prev))
print(f"Gap ranges ({len(gaps)} ranges): {gaps[:30]}")

# Look for the input JSONL files to figure out what each custom_id maps to
import os, glob
input_files = glob.glob(f"{base}/../data/**/*.jsonl", recursive=True) + \
              glob.glob(f"{base}/../*.jsonl", recursive=False)
print(f"\nInput JSONL files found: {input_files}")

# Check for batch input files
batch_inputs = glob.glob(f"{base}/../*batch*input*", recursive=False) + \
               glob.glob(f"{base}/../*input*", recursive=False)
print(f"Potential input files: {batch_inputs}")
