import json
import csv

base = "/mnt/c/Users/David Hill/iCloudDrive/GWU/Dissertation/reducing-technical-debt-praxis-experiment"

# Load file 2 parsed IDs
rows2 = []
with open(f"{base}/runs/job-c352e2fa-e9e0-47e7-a629-0a24fcaa7ab9-output.jsonl", errors="replace") as f:
    for line in f:
        line = line.strip()
        if line:
            try:
                rows2.append(json.loads(line, strict=False))
            except Exception:
                pass
ids2 = set(int(r["custom_id"]) for r in rows2)
missing = sorted(set(range(1, 1315)) - ids2)

# Load the Llama dataset CSV (together_dataset_llama_70b.csv)
dataset_path = f"{base}/data/together_dataset_llama_70b.csv"
print(f"Loading: {dataset_path}")

missing_rows = []
with open(dataset_path, newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    headers = reader.fieldnames
    print(f"Columns: {headers}")
    all_rows = list(reader)

print(f"Total dataset rows: {len(all_rows)}")
print(f"Sample row keys: {list(all_rows[0].keys())[:15]}")

# Check index alignment — does row index match custom_id?
# Find what column has the custom_id / row number
print("\nFirst 3 rows (index-aligned check):")
for i, row in enumerate(all_rows[:3], 1):
    print(f"  index {i}: {dict(list(row.items())[:6])}")

# Get rows that were missing
missing_row_data = []
for mid in missing:
    idx = mid - 1  # 1-based to 0-based
    if idx < len(all_rows):
        missing_row_data.append((mid, all_rows[idx]))

print(f"\nMissing IDs ({len(missing)}), first 20:")
for mid, row in missing_row_data[:20]:
    key_fields = {k: row.get(k, "?") for k in ["condition", "file_name", "project_name", "record_id", "file_id"] if k in row}
    print(f"  custom_id={mid}: {key_fields}")

# Breakdown by condition
conditions = {}
for _, row in missing_row_data:
    c = row.get("condition", "unknown")
    conditions[c] = conditions.get(c, 0) + 1
print(f"\nMissing by condition: {conditions}")

# Breakdown by project
projects = {}
for _, row in missing_row_data:
    p = row.get("project_name", "unknown")
    projects[p] = projects.get(p, 0) + 1
print(f"Missing by project: {projects}")
