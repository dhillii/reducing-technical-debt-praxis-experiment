"""Check a Together batch JSONL file before uploading it.

Example:
    python -m utils.check_token_budget --input pending_batch.jsonl --model-key llama_70b
"""

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

from utils.config import TOGETHER_CONTEXT_SAFETY_MARGIN, TOGETHER_MODELS
from utils.token_budget import evaluate_token_budget


def analyze_batch(jsonl_path: Path, model_key: str) -> List[Dict[str, Any]]:
    """Return one context-budget result for every request in a batch JSONL file."""
    if model_key not in TOGETHER_MODELS:
        raise ValueError(f"Unknown model key {model_key!r}. Valid values: {list(TOGETHER_MODELS)}")

    context_window = TOGETHER_MODELS[model_key]["context_window_tokens"]
    results = []
    with jsonl_path.open(encoding="utf-8") as batch_file:
        for line_number, line in enumerate(batch_file, start=1):
            if not line.strip():
                continue
            row = json.loads(line)
            body = row["body"]
            messages = body["messages"]
            system_prompt = next(
                (message.get("content", "") for message in messages if message.get("role") == "system"),
                "",
            )
            prompt = next(
                (message.get("content", "") for message in messages if message.get("role") == "user"),
                "",
            )
            budget = evaluate_token_budget(
                system_prompt=system_prompt,
                prompt=prompt,
                max_output_tokens=body.get("max_tokens", 16_384),
                context_window_tokens=context_window,
                safety_margin_tokens=TOGETHER_CONTEXT_SAFETY_MARGIN,
            )
            results.append({
                "line_number": line_number,
                "record_id": row.get("custom_id", ""),
                **budget.as_dict(),
            })
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Preflight a Together batch JSONL context budget.")
    parser.add_argument("--input", type=Path, required=True, help="Path to the Together batch JSONL file.")
    parser.add_argument("--model-key", choices=sorted(TOGETHER_MODELS), required=True)
    parser.add_argument("--output", type=Path, help="Optional JSON report path.")
    args = parser.parse_args()

    results = analyze_batch(args.input, args.model_key)
    report = {
        "input": str(args.input),
        "model_key": args.model_key,
        "request_count": len(results),
        "over_budget_count": sum(not result["fits"] for result in results),
        "results": results,
    }
    serialized = json.dumps(report, indent=2)
    if args.output:
        args.output.write_text(serialized + "\n", encoding="utf-8")
    else:
        print(serialized)

    return 2 if report["over_budget_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
