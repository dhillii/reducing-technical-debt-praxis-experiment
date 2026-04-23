# Plan: Extend Pipeline with Together AI — Unified Provider Architecture

**What:** Refactor the existing `batch_processor.py` and `batch_run_orchestrator.py` in-place to support a second provider. No new orchestrators or processors — provider-specific mechanics are isolated via simple injection. All shared logic (manifest, prompts, local metrics, CSV, git) stays in one place, unmodified.

---

## What changes and where

| File | Change type | Summary |
|---|---|---|
| `utils/config.py` | **Extend** | Add Together AI constants alongside Claude ones |
| `api/batch_processor.py` | **Refactor in-place** | Rename existing class → `AnthropicBatchProvider`; add `TogetherBatchProvider` with identical public interface; `BatchOrchestrator` takes a `provider=` arg |
| `orchestration/batch_run_orchestrator.py` | **Parameterize** | `__init__` gains `provider` + `model_key` args; derives CSV/state/conditions paths from `model_key`; normalizes result extraction; writes `llm_model`/`llm_temperature` to CSV; git commit moved to single end-of-batch commit for Together |
| `orchestration/orchestrate_experiments.py` | **Extend CLI only** | Add `--provider` / `--model` to all `batch-*` commands; defaults preserve 100% existing Haiku behavior |
| `orchestration/state_manager.py` | **Minor** | Add optional `state_file: Path = None` param if currently hardcoded |
| `.env` | **Extend** | Add `TOGETHER_API_KEY=` placeholder |
| `requirements.txt` | **Extend** | Add `together>=1.5.13` |

---

## Models

| model_key | Together AI model_id | gpt_oss_prefix |
|---|---|---|
| llama_8b | meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo | False |
| gpt_oss_20b | openai/gpt-oss-20b | True |
| llama_70b | meta-llama/Llama-3.3-70B-Instruct-Turbo | False |
| gpt_oss_120b | openai/gpt-oss-120b | True |

---

## Phase 1 — Config (`utils/config.py`)

Add after existing Claude constants:

- `TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY", "")`
- `TOGETHER_TEMPERATURE = 0.0`
- `TOGETHER_MAX_TOKENS = 16384` *(avg Haiku completion ~9,191 tokens; Together AI models cap well below Haiku's 64,000 — confirm or adjust)*
- `TOGETHER_BATCH_IDS_DIR = Path.home() / ".together" / "batches"` (separate from `~/.claude/batches/`)
- `TOGETHER_MODELS` dict:
  ```python
  TOGETHER_MODELS = {
      "llama_8b":    {"model_id": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", "gpt_oss_prefix": False},
      "gpt_oss_20b": {"model_id": "openai/gpt-oss-20b",                           "gpt_oss_prefix": True},
      "llama_70b":   {"model_id": "meta-llama/Llama-3.3-70B-Instruct-Turbo",      "gpt_oss_prefix": False},
      "gpt_oss_120b":{"model_id": "openai/gpt-oss-120b",                           "gpt_oss_prefix": True},
  }
  ```

---

## Phase 2 — Provider abstraction (`api/batch_processor.py`)

Refactor in-place; no new files:

- Rename `BatchProcessor` → `AnthropicBatchProvider` (identical behavior, zero logic change)
- Add `TogetherBatchProvider(model_key: str)` with the **same public methods**:
  - `build_batch_requests(requests_list)` → writes a temp `.jsonl`; each line:
    ```json
    {"custom_id": "<record_id>", "body": {"model": "<model_id>", "messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}], "max_tokens": 16384, "temperature": 0.0}}
    ```
    Note: system prompt inside `messages` as `role=system` (not a top-level field like Anthropic)
  - `submit_batch(batch_requests, batch_name)` → `client.files.upload(file=path, purpose="batch-api")` → `client.batches.create_batch(file_id, endpoint="/v1/chat/completions")`; persists batch ID to `TOGETHER_BATCH_IDS_DIR / f"batch_ids_{model_key}.json"`
  - `poll_batch(batch_id)` → `client.batches.get_batch(batch_id)`; maps Together statuses (`VALIDATING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLED`) to same normalized dict `{batch_id, status, total_requests, completion_pct}` that `AnthropicBatchProvider` returns
  - `retrieve_results(batch_id)` → download output JSONL via `client.files.retrieve_content(id=batch.output_file_id, output=<path>)`; parse each line; return normalized list: `{record_id, status: "succeeded"|"failed", content: str, prompt_tokens: int, completion_tokens: int, error}`
  - `list_batches()` → `client.batches.list_batches()`
- Refactor `BatchOrchestrator.__init__` to accept `provider=None` (defaults to `AnthropicBatchProvider()`)

---

## Phase 3 — Parameterize orchestrator (`orchestration/batch_run_orchestrator.py`)

### Constructor `__init__(provider="anthropic", model_key="haiku")`

**Path derivation at init:**
- `self.conditions_root` = `"conditions"` if `model_key == "haiku"` else `f"conditions_{model_key}"`
- `self.state_file` = `EXPERIMENT_STATE_FILE` if `model_key == "haiku"` else `PROJECT_ROOT / f"experiment_state_{model_key}.json"`
- `self.output_csv` = `CSV_INPUT_FILE` if `model_key == "haiku"` else `DATA_DIR / f"together_dataset_{model_key}.csv"`
- `self.model` / `self.max_tokens` / `self.temperature` from appropriate config section
- `self.gpt_oss_prefix` = `TOGETHER_MODELS[model_key]["gpt_oss_prefix"]` when provider is `together`
- For Together AI: if `self.output_csv` doesn't exist yet, initialize it from `active_prompts_for_experiment.csv` joined with the shell CSV's pre-metric columns (same 47-column structure, pre-metrics populated, post-metrics empty)
- Pass `self.state_file` to `StateManager(state_file=self.state_file)`
- `self.batch_orchestrator = BatchOrchestrator(provider=AnthropicBatchProvider() if provider == "anthropic" else TogetherBatchProvider(model_key=model_key))`

### Fix: write `llm_model` and `llm_temperature` to CSV during retrieval

**The current code never writes these columns (confirmed: lines 420–444 of the existing file have no `llm_model` write).** Add to the CSV update block, for both Haiku and Together AI paths:

```python
self.csv_df.loc[idx, "llm_model"]       = self.model        # e.g. "claude-haiku-4-5-20251001"
self.csv_df.loc[idx, "llm_temperature"]  = self.temperature  # 0.0 (or 0.01 if fallback triggered)
```

### System prompt modification

`_get_system_prompt(condition)`: if `self.gpt_oss_prefix` is True, prepend `"Use medium reasoning effort.\n\n"` to the returned string.

### Result extraction normalization

Replace Anthropic-specific unpacking (`message.content[0].text`, `message.usage.input_tokens`) with the normalized dict format from the provider — `result["content"]`, `result["prompt_tokens"]`, `result["completion_tokens"]` — which both providers return identically.

### Git commit strategy

- **Haiku (unchanged):** 9 grouped commits (condition × run_number), then push
- **Together AI (new):** write all code files first, then **one single commit covering all `conditions_{model_key}/` changes**, then push — happens at the very end of `retrieve_and_process_results` after the file-writing loop completes
- Implementation: gate the commit-grouping loop behind `if model_key == "haiku":` / `else:` single commit

### Temperature fallback

Build JSONL with `temperature=0.0`. After retrieval, collect records appearing in `error_file_id` output; log warnings; re-submit failed `custom_id`s in a second JSONL with `temperature=0.01`; merge results before processing.

---

## Phase 4 — CLI (`orchestration/orchestrate_experiments.py`)

Add to **all** `batch-*` commands:
```python
@click.option("--provider", default="anthropic", type=click.Choice(["anthropic", "together"]),
              help="Inference provider")
@click.option("--model", default="haiku",
              help="Model key: haiku | llama_8b | gpt_oss_20b | llama_70b | gpt_oss_120b")
```

Each command passes these to `BatchRunOrchestrator(provider=provider, model_key=model)`. Existing invocations with no flags work identically.

**Example usage:**
```bash
python -m orchestration.orchestrate_experiments batch-submit   --provider together --model llama_70b
python -m orchestration.orchestrate_experiments batch-poll     --provider together --model llama_70b
python -m orchestration.orchestrate_experiments batch-stream   --provider together --model llama_70b
python -m orchestration.orchestrate_experiments batch-retrieve --provider together --model llama_70b
```

---

## Phase 5 — Wiring

- `requirements.txt`: add `together>=1.5.13`
- `.env`: add `TOGETHER_API_KEY=` placeholder
- `orchestration/state_manager.py`: add optional `state_file: Path = EXPERIMENT_STATE_FILE` param to `__init__` if currently hardcoded

---

## Confirmed Decisions

- Per-model CSV: `data/together_dataset_{model_key}.csv` ✓
- Git: single commit covering all files at end of retrieve, then push ✓
- Haiku path: zero behavior change — all existing CLI defaults preserved ✓
- Together AI output isolated from Haiku: separate conditions dir, state file, and CSV ✓
- `llm_model` and `llm_temperature` written to CSV for both Haiku and Together AI runs ✓

---

## Open Item

`TOGETHER_MAX_TOKENS = 16384` — Haiku used 64,000 but Together AI models cap output well below that. Average Haiku completion was ~9,191 tokens, which fits within 16,384. **Confirm this value or adjust?**

---

## Verification Checklist

1. **Haiku regression:** run `batch-retrieve` (no flags) → `llm_model` now populated as `claude-haiku-4-5-20251001` in the shell CSV
2. **Haiku isolation:** `conditions/` and `unified_experimental_dataset_complete_4_1_2026.csv` untouched after any Together AI run
3. **Submit:** `batch-submit --provider together --model llama_8b` → JSONL built with system as `role=system` in messages; file uploaded; batch ID in `~/.together/batches/batch_ids_llama_8b.json`
4. **Poll:** `batch-poll --provider together --model llama_8b` → status cycles `VALIDATING` → `IN_PROGRESS`
5. **Retrieve:** `batch-retrieve --provider together --model llama_8b` → `data/together_dataset_llama_8b.csv` populated, `llm_model = meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo`, single git commit with all `conditions_llama_8b/` files
6. **GPT-OSS prefix:** inspect a JSONL row for `gpt_oss_20b` → system message starts with `"Use medium reasoning effort."`
7. **Stream:** `batch-stream --provider together --model llama_70b` → polls until `COMPLETED` then auto-retrieves
