"""Inspect the actual batches.create() return type to find the batch ID attribute."""
import os, json, tempfile
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from together import Together

c = Together(api_key=os.environ.get("TOGETHER_API_KEY"))

# Upload a tiny 1-request JSONL
tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False)
line = {
    "custom_id": "test-001",
    "body": {
        "model": "meta-llama/Meta-Llama-3-8B-Instruct-Lite",
        "messages": [{"role": "user", "content": "Say hello in one word"}],
        "max_tokens": 10,
        "temperature": 0.0,
    }
}
tmp.write(json.dumps(line) + "\n")
tmp.flush()
tmp.close()

file_resp = c.files.upload(file=tmp.name, purpose="batch-api", check=False)
print(f"=== FILE UPLOAD ===")
print(f"type: {type(file_resp).__name__}")
print(f"id: {file_resp.id}")

print(f"\n=== BATCH CREATE ===")
resp = c.batches.create(
    input_file_id=file_resp.id,
    endpoint="/v1/chat/completions",
    completion_window="24h",
)
print(f"type: {type(resp).__name__}")
print(f"attrs: {[a for a in dir(resp) if not a.startswith('_')]}")
print(f"repr: {repr(resp)[:800]}")

# Try to get the ID
for attr in ["id", "batch_id", "job"]:
    val = getattr(resp, attr, "NOT_FOUND")
    print(f"  .{attr} = {repr(val)[:200]}")

# Try model_dump
try:
    d = resp.model_dump() if hasattr(resp, "model_dump") else resp.dict()
    print(f"model_dump keys: {list(d.keys())}")
    print(f"model_dump: {json.dumps(d, default=str)[:600]}")
except Exception as e:
    print(f"model_dump failed: {e}")

# Cancel immediately
try:
    bid = getattr(resp, "id", None) or d.get("id") or d.get("job", {}).get("id")
    if bid:
        c.batches.cancel(bid)
        print(f"\nCancelled test batch: {bid}")
except Exception as e:
    print(f"Cancel note: {e}")
