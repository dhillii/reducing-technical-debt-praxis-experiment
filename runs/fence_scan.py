import os
import re

base = "/mnt/c/Users/David Hill/iCloudDrive/GWU/Dissertation/reducing-technical-debt-praxis-experiment"

condition_dirs = [
    "conditions",
    "conditions_qwen_3_5_9b",
    "conditions_llama_70b",
    "conditions_gpt_oss_20b",
    "conditions_gpt_oss_120b",
]

# Fence pattern: a line that is ONLY a fence (opening or closing)
FENCE_RE = re.compile(r"^```")

totals = {}
per_dir = {}

for cdir in condition_dirs:
    dirpath = os.path.join(base, cdir)
    if not os.path.isdir(dirpath):
        continue
    fenced = []
    clean = 0
    for root, _, files in os.walk(dirpath):
        for fname in files:
            if not fname.endswith(".js"):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, encoding="utf-8", errors="replace") as f:
                    first_line = f.readline().strip()
                if FENCE_RE.match(first_line):
                    rel = os.path.relpath(fpath, base)
                    fenced.append(rel)
                else:
                    clean += 1
            except Exception:
                pass
    per_dir[cdir] = {"fenced": fenced, "clean": clean}
    totals[cdir] = len(fenced)

print("=== Fence contamination by conditions folder ===")
grand_total = 0
for cdir, counts in per_dir.items():
    n = len(counts["fenced"])
    grand_total += n
    print(f"\n{cdir}: {n} fenced, {counts['clean']} clean")
    for f in counts["fenced"][:5]:
        print(f"  {f}")
    if n > 5:
        print(f"  ... and {n - 5} more")

print(f"\nGRAND TOTAL fenced files: {grand_total}")
