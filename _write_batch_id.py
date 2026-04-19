"""Write the completed batch ID to the JSON file."""
import json
from pathlib import Path

batch_ids_dir = Path.home() / ".together" / "batches"
batch_ids_dir.mkdir(parents=True, exist_ok=True)

path = batch_ids_dir / "batch_ids_llama_8b.json"
data = ["e9f49905-f024-4217-86fa-6adae68f8027"]
path.write_text(json.dumps(data, indent=2))
print(f"Wrote {data} to {path}")
print(f"Verify: {json.loads(path.read_text())}")
