"""Inspect Together AI batch create response shape."""
from together import Together
import os

# Use the real API key
c = Together(api_key=os.environ.get("TOGETHER_API_KEY"))

# First upload a tiny test file
import tempfile, json
tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False)
line = {
    "custom_id": "test-001",
    "body": {
        "model": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
        "messages": [{"role": "user", "content": "Say hello"}],
        "max_tokens": 10,
        "temperature": 0.0,
    }
}
tmp.write(json.dumps(line) + "\n")
tmp.flush()
tmp.close()

file_resp = c.files.upload(file=tmp.name, purpose="batch-api", check=False)
print(f"File response type: {type(file_resp)}")
print(f"File response: {file_resp}")
print(f"File id: {file_resp.id}")

batch_resp = c.batches.create(
    input_file_id=file_resp.id,
    endpoint="/v1/chat/completions",
    completion_window="24h",
)
print(f"\nBatch response type: {type(batch_resp)}")
print(f"Batch response: {batch_resp}")
print(f"Batch dir: {dir(batch_resp)}")

# Try to cancel it immediately so we don't waste money
try:
    bid = getattr(batch_resp, "id", None) or getattr(batch_resp, "batch_id", None)
    if bid:
        c.batches.cancel(bid)
        print(f"Cancelled batch: {bid}")
except Exception as e:
    print(f"Cancel failed (expected): {e}")
