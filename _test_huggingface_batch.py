"""Test harness: send a small batch of real experiment records to the Hugging Face router.

The HF router's OpenAI-compatible endpoint (https://router.huggingface.co/v1) has no
async batch-submission API like Together or Anthropic, so "batch" here means firing a
handful of requests concurrently with a thread pool and collecting normalized results.
Use this to validate the HF integration end-to-end before building a real
HuggingFaceBatchProvider.

Usage:
    python _test_huggingface_batch.py                # run 3 real records
    python _test_huggingface_batch.py --count 5       # run 5 real records
    python _test_huggingface_batch.py --dry-run       # build prompts, skip the API call
"""

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

from api.batch_processor import extract_code_from_response
from utils.config import (
    ACTIVE_PROMPTS_FILE,
    HF_TOKEN,
    HUGGINGFACE_BASE_URL,
    HUGGINGFACE_MAX_TOKENS,
    HUGGINGFACE_MODELS,
    HUGGINGFACE_TEMPERATURE,
    PROJECT_ROOT,
    SOURCE_CODE_DIR,
)

_NO_FENCE_REMINDER = (
    "Return ONLY the raw refactored source code with no markdown fences, "
    "no code-fence markers, and no explanations."
)

# Mirrors orchestration/batch_run_orchestrator.py's baseline condition system prompt.
_BASELINE_SYSTEM_PROMPT = (
    "You are an expert code refactoring specialist. "
    "Refactor the given code to improve code quality and reduce complexity. "
    "Return ONLY the raw refactored source code. "
    "Do NOT wrap the code in markdown code fences (no ```javascript, no ```, etc.). "
    "Do NOT include any explanation, commentary, or preamble."
)


def _find_source_file(file_name: str) -> Path:
    """Locate a sample source file by its original basename (files are prefixed file_XXXX_)."""
    matches = list(SOURCE_CODE_DIR.glob(f"file_*_{file_name}"))
    if not matches:
        raise FileNotFoundError(f"No source file found for {file_name!r} in {SOURCE_CODE_DIR}")
    return matches[0]


def build_test_requests(count: int) -> List[Dict[str, Any]]:
    """Build (record_id, system_prompt, prompt) triples from the first N active prompts."""
    df = pd.read_csv(ACTIVE_PROMPTS_FILE, dtype={"record_id": str}).head(count)

    requests = []
    for _, row in df.iterrows():
        source_file = _find_source_file(row["file_name"])
        source_code = source_file.read_text(encoding="utf-8")
        prompt = f"{row['active_prompt']}\n\n{_NO_FENCE_REMINDER}\n\nComplete source code:\n{source_code}"
        requests.append({
            "record_id": row["record_id"],
            "system_prompt": _BASELINE_SYSTEM_PROMPT,
            "prompt": prompt,
            "file_extension": source_file.suffix or ".txt",
        })
    return requests


def call_huggingface(client, model_id: str, request: Dict[str, Any]) -> Dict[str, Any]:
    """Call the HF router for one request; return a normalized result dict."""
    try:
        completion = client.chat.completions.create(
            model=model_id,
            temperature=HUGGINGFACE_TEMPERATURE,
            max_tokens=HUGGINGFACE_MAX_TOKENS,
            messages=[
                {"role": "system", "content": request["system_prompt"]},
                {"role": "user", "content": request["prompt"]},
            ],
        )
        message = completion.choices[0].message
        content = extract_code_from_response(message.content or "", request["file_extension"])
        usage = completion.usage
        return {
            "record_id": request["record_id"],
            "status": "succeeded",
            "content": content,
            "prompt_tokens": usage.prompt_tokens if usage else 0,
            "completion_tokens": usage.completion_tokens if usage else 0,
            "finish_reason": completion.choices[0].finish_reason,
            "error": None,
        }
    except Exception as e:
        return {
            "record_id": request["record_id"],
            "status": "failed",
            "content": "",
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "finish_reason": None,
            "error": str(e),
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Send a small test batch of real experiment records to the HF router.")
    parser.add_argument("--count", type=int, default=3, help="Number of records to send (default: 3).")
    parser.add_argument("--model-key", default="qwen3_coder_next", choices=sorted(HUGGINGFACE_MODELS), help="Model key from HUGGINGFACE_MODELS.")
    parser.add_argument("--dry-run", action="store_true", help="Build prompts but skip the API call.")
    parser.add_argument("--output", type=Path, help="Optional path to save raw results JSONL (default: batches/huggingface_test_<ts>.jsonl).")
    args = parser.parse_args()

    requests = build_test_requests(args.count)
    print(f"Built {len(requests)} test request(s) from {ACTIVE_PROMPTS_FILE.name}: "
          f"{[r['record_id'] for r in requests]}")

    if args.dry_run:
        for request in requests:
            print(f"\n--- record_id={request['record_id']} ({len(request['prompt'])} chars) ---")
            print(request["prompt"][:300] + ("..." if len(request["prompt"]) > 300 else ""))
        return 0

    if not HF_TOKEN:
        raise SystemExit("HF_TOKEN not set. Add it to .env before running a live test.")

    from openai import OpenAI
    client = OpenAI(base_url=HUGGINGFACE_BASE_URL, api_key=HF_TOKEN)
    model_id = HUGGINGFACE_MODELS[args.model_key]["model_id"]

    results = []
    with ThreadPoolExecutor(max_workers=len(requests)) as pool:
        futures = {pool.submit(call_huggingface, client, model_id, request): request for request in requests}
        for future in as_completed(futures):
            results.append(future.result())

    results.sort(key=lambda r: r["record_id"])
    for result in results:
        preview = result["content"][:200].replace("\n", " ")
        print(
            f"\nrecord_id={result['record_id']} status={result['status']} "
            f"prompt_tokens={result['prompt_tokens']} completion_tokens={result['completion_tokens']}"
        )
        if result["error"]:
            print(f"  error: {result['error']}")
        else:
            print(f"  preview: {preview}...")

    output_path = args.output or (PROJECT_ROOT / "batches" / f"huggingface_test_{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.jsonl")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        for result in results:
            f.write(json.dumps(result) + "\n")
    print(f"\nSaved {len(results)} result(s) to {output_path}")

    failed = sum(1 for r in results if r["status"] == "failed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
