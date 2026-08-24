"""Estimate the USD cost of an experimental run given a model's per-token pricing.

Token counts can come from any of four sources, selected with a mutually
exclusive flag:

  --csv PATH            A results CSV with per-record token columns, e.g.
                         data/unified_experimental_dataset_shell.csv or one of
                         the *_dataset_*.csv files in the data-analysis repo
                         (columns default to prompt_tokens / completion_tokens).
  --usage-jsonl PATH     A completed batch output file with real usage stats.
                         Supports Together's raw {"response": {"body": {"usage":
                         {...}}}} shape, Anthropic's raw batch {"result":
                         {"message": {"usage": {...}}}} shape, and this repo's
                         normalized {"prompt_tokens", "completion_tokens"} shape.
  --batch-jsonl PATH     A pending (not-yet-submitted) batch JSONL. Input tokens
                         are estimated with the same conservative heuristic as
                         utils.token_budget; output tokens use each request's
                         requested max_tokens as a worst-case upper bound.
  --tokens IN OUT        Manually supplied total input/output token counts.

Prices are USD per 1,000,000 tokens, matching how providers publish pricing.

Examples:
    python -m utils.estimate_cost --csv data/unified_experimental_dataset_shell.csv \\
        --model-col llm_model --model meta-llama/Llama-3.3-70B-Instruct-Turbo \\
        --input-price-per-million 0.88 --output-price-per-million 0.88

    python -m utils.estimate_cost --usage-jsonl batches/foo_output.jsonl \\
        --input-price-per-million 0.18 --output-price-per-million 0.18

    python -m utils.estimate_cost --tokens 950000 60000 \\
        --input-price-per-million 3.00 --output-price-per-million 15.00 --scale 3
"""

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from utils.token_budget import estimate_tokens

TokenTotals = Tuple[int, int, Optional[int]]  # (input_tokens, output_tokens, request_count)


def cost_from_tokens(
    input_tokens: float,
    output_tokens: float,
    input_price_per_million: float,
    output_price_per_million: float,
) -> float:
    """Return the USD cost of the given token counts at the given per-million prices."""
    return (input_tokens / 1_000_000) * input_price_per_million + (
        output_tokens / 1_000_000
    ) * output_price_per_million


def tokens_from_csv(
    csv_path: Path,
    input_col: str,
    output_col: str,
    model_col: Optional[str] = None,
    model: Optional[str] = None,
) -> TokenTotals:
    """Sum per-record token columns from a results CSV, optionally filtered by model."""
    import pandas as pd

    df = pd.read_csv(csv_path)
    if model_col and model:
        if model_col not in df.columns:
            raise KeyError(f"Column {model_col!r} not found in {csv_path}")
        df = df[df[model_col] == model]
        if df.empty:
            raise ValueError(f"No rows where {model_col!r} == {model!r} in {csv_path}")

    for col in (input_col, output_col):
        if col not in df.columns:
            raise KeyError(f"Column {col!r} not found in {csv_path}")

    input_tokens = int(df[input_col].fillna(0).sum())
    output_tokens = int(df[output_col].fillna(0).sum())
    return input_tokens, output_tokens, len(df)


def _extract_usage_tokens(row: Dict[str, Any]) -> Tuple[int, int]:
    """Pull (input_tokens, output_tokens) out of one of this repo's known batch result shapes."""
    if "prompt_tokens" in row and "completion_tokens" in row:
        return row["prompt_tokens"], row["completion_tokens"]

    usage = None
    if "response" in row:  # Together raw batch output
        usage = row["response"]["body"]["usage"]
        return usage["prompt_tokens"], usage["completion_tokens"]
    if "result" in row:  # Anthropic raw batch output
        usage = row["result"]["message"]["usage"]
        return usage["input_tokens"], usage["output_tokens"]

    raise KeyError(f"Could not find usage tokens in batch result row: {row!r}")


def tokens_from_usage_jsonl(path: Path) -> TokenTotals:
    """Sum actual usage tokens from a completed batch output JSONL file."""
    input_tokens = 0
    output_tokens = 0
    request_count = 0
    with path.open(encoding="utf-8") as usage_file:
        for line in usage_file:
            if not line.strip():
                continue
            row_input, row_output = _extract_usage_tokens(json.loads(line))
            input_tokens += row_input
            output_tokens += row_output
            request_count += 1
    return input_tokens, output_tokens, request_count


def tokens_from_pending_batch_jsonl(path: Path) -> TokenTotals:
    """Estimate worst-case input/output tokens for a not-yet-submitted batch JSONL."""
    input_tokens = 0
    output_tokens = 0
    request_count = 0
    with path.open(encoding="utf-8") as batch_file:
        for line in batch_file:
            if not line.strip():
                continue
            body = json.loads(line)["body"]
            text = "".join(message.get("content", "") for message in body["messages"])
            input_tokens += estimate_tokens(text)
            output_tokens += body.get("max_tokens", 0)
            request_count += 1
    return input_tokens, output_tokens, request_count


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Estimate the USD cost of an experimental run from token counts and per-model pricing.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--csv", type=Path, help="Results CSV with per-record token columns.")
    source.add_argument("--usage-jsonl", type=Path, help="Completed batch output JSONL with real usage stats.")
    source.add_argument("--batch-jsonl", type=Path, help="Pending batch JSONL (input tokens estimated).")
    source.add_argument(
        "--tokens",
        type=int,
        nargs=2,
        metavar=("INPUT_TOKENS", "OUTPUT_TOKENS"),
        help="Manually supplied total input/output token counts.",
    )

    parser.add_argument("--input-price-per-million", type=float, required=True, help="USD per 1M input tokens.")
    parser.add_argument("--output-price-per-million", type=float, required=True, help="USD per 1M output tokens.")
    parser.add_argument("--input-col", default="prompt_tokens", help="Input token column name for --csv (default: prompt_tokens).")
    parser.add_argument("--output-col", default="completion_tokens", help="Output token column name for --csv (default: completion_tokens).")
    parser.add_argument("--model-col", help="Column to filter --csv rows by, e.g. llm_model.")
    parser.add_argument("--model", help="Value to filter --model-col by, e.g. an exact llm_model name.")
    parser.add_argument(
        "--scale",
        type=float,
        default=1.0,
        help="Multiply the derived token totals before pricing, e.g. 3.0 to project one condition's "
        "batch across three conditions assumed to have similar token counts.",
    )
    args = parser.parse_args()

    if args.csv:
        input_tokens, output_tokens, request_count = tokens_from_csv(
            args.csv, args.input_col, args.output_col, args.model_col, args.model
        )
        source_desc = str(args.csv)
    elif args.usage_jsonl:
        input_tokens, output_tokens, request_count = tokens_from_usage_jsonl(args.usage_jsonl)
        source_desc = str(args.usage_jsonl)
    elif args.batch_jsonl:
        input_tokens, output_tokens, request_count = tokens_from_pending_batch_jsonl(args.batch_jsonl)
        source_desc = f"{args.batch_jsonl} (estimated, not actual usage)"
    else:
        input_tokens, output_tokens = args.tokens
        request_count = None
        source_desc = "manually supplied token totals"

    scaled_input_tokens = input_tokens * args.scale
    scaled_output_tokens = output_tokens * args.scale
    estimated_cost = cost_from_tokens(
        scaled_input_tokens, scaled_output_tokens, args.input_price_per_million, args.output_price_per_million
    )

    report = {
        "source": source_desc,
        "request_count": request_count,
        "scale": args.scale,
        "input_tokens": round(scaled_input_tokens),
        "output_tokens": round(scaled_output_tokens),
        "input_price_per_million": args.input_price_per_million,
        "output_price_per_million": args.output_price_per_million,
        "estimated_cost_usd": round(estimated_cost, 4),
    }
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
