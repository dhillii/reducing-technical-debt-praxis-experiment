"""
Batch API processors for parallel refactoring experiments.

Supports three providers:
  - AnthropicBatchProvider:   Anthropic Messages Batch API (async, proprietary)
  - TogetherBatchProvider:    Together AI Batch API (JSONL upload → poll → download)
  - HuggingFaceBatchProvider: HF router (OpenAI-compatible, no async batch API;
                              requests run concurrently inside submit_batch and
                              results are cached locally so poll/retrieve still work)

All providers expose the same public interface so BatchOrchestrator and
BatchRunOrchestrator are provider-agnostic.

Result dicts returned by retrieve_results() are normalized to:
    {record_id, status: "succeeded"|"retryable"|"failed", content: str,
   prompt_tokens: int, completion_tokens: int, error}
"""

import json
import re
import requests as http_requests
import tempfile
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from anthropic import Anthropic, APIError
from utils.config import (
    ANTHROPIC_API_KEY,
    CLAUDE_MODEL,
    CLAUDE_MAX_OUTPUT_TOKENS,
    HF_TOKEN,
    HUGGINGFACE_BASE_URL,
    HUGGINGFACE_MAX_TOKENS,
    HUGGINGFACE_MODELS,
    HUGGINGFACE_TEMPERATURE,
    PROJECT_ROOT,
    TOGETHER_API_KEY,
    TOGETHER_BATCH_IDS_DIR,
    TOGETHER_CONTEXT_SAFETY_MARGIN,
    TOGETHER_MODELS,
)
from utils.logger_config import get_logger
from utils.token_budget import ContextBudgetExceeded, evaluate_token_budget

logger = get_logger("batch_processor")


# ---------------------------------------------------------------------------
# Shared utility: code extraction from LLM responses
# ---------------------------------------------------------------------------

# Maps a file extension to the fence languages an LLM might emit for it.
_LANG_ALIASES: Dict[str, List[str]] = {
    "js":   ["javascript", "js"],
    "jsx":  ["jsx", "javascript", "js"],
    "ts":   ["typescript", "ts"],
    "tsx":  ["tsx", "typescript", "ts"],
    "py":   ["python", "py"],
    "java": ["java"],
}


def _sanitize_content(text: str) -> str:
    """
    Remove bare C0 control characters (U+0000-U+001F) that are illegal in
    JSON strings, except for the three whitespace escapes JSON allows
    (\\t = U+0009, \\n = U+000A, \\r = U+000D).

    This prevents JSONL serialization failures when an LLM embeds a stray
    NUL or other control byte inside generated code.
    """
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)


def extract_code_from_response(response_text: str, file_extension: str = ".js") -> str:
    """
    Extract generated code from an LLM response, stripping markdown fences.

    Handles all language-label variants an LLM might emit for a given file
    type (e.g. both triple-backtick js and triple-backtick javascript for .js files).

    Args:
        response_text: Raw text from the model
        file_extension: Expected file type (e.g. ".js", ".ts", ".tsx")

    Returns:
        Clean code string with fences and surrounding whitespace removed
    """
    lang = file_extension.lstrip(".")
    aliases = _LANG_ALIASES.get(lang, [lang])

    # Try each known alias for this extension (most-specific first)
    for alias in aliases:
        pattern = f"```{alias}"
        if pattern in response_text:
            fence_idx = response_text.find(pattern)
            newline_idx = response_text.find("\n", fence_idx)
            if newline_idx == -1:
                continue
            start_idx = newline_idx + 1
            end_idx = response_text.find("\n```", start_idx)
            if end_idx > start_idx:
                return response_text[start_idx:end_idx].strip()

    # Generic fence without a language label (``` ... ```)
    if "```" in response_text:
        idx = 0
        while True:
            fence_idx = response_text.find("```", idx)
            if fence_idx == -1:
                break
            newline_idx = response_text.find("\n", fence_idx)
            if newline_idx == -1:
                break
            start_idx = newline_idx + 1
            end_idx = response_text.find("\n```", start_idx)
            if end_idx > start_idx:
                return response_text[start_idx:end_idx].strip()
            idx = fence_idx + 3

    return response_text.strip()


# ---------------------------------------------------------------------------
# Anthropic provider
# ---------------------------------------------------------------------------

class AnthropicBatchProvider:
    """Manages Anthropic Messages Batch API operations."""

    def __init__(self, api_key: Optional[str] = None):
        key = api_key or ANTHROPIC_API_KEY
        if not key:
            raise ValueError("ANTHROPIC_API_KEY not set")

        self.client = Anthropic(api_key=key)
        self.model = CLAUDE_MODEL
        self.batch_dir = Path.home() / ".claude" / "batches"
        self.batch_dir.mkdir(parents=True, exist_ok=True)

    def build_batch_requests(
        self,
        requests_list: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Build Anthropic-formatted batch request dicts.

        Each dict in requests_list must contain:
          record_id, prompt, system_prompt, max_tokens (opt), temperature (opt)

        Returns:
            List of Anthropic batch request dicts
        """
        batch_requests = []
        for req in requests_list:
            batch_requests.append({
                "custom_id": req["record_id"],
                "params": {
                    "model": self.model,
                    "max_tokens": req.get("max_tokens", CLAUDE_MAX_OUTPUT_TOKENS),
                    "temperature": req.get("temperature", 0.0),
                    "system": req["system_prompt"],
                    "messages": [
                        {"role": "user", "content": req["prompt"]}
                    ]
                }
            })
        return batch_requests

    def submit_batch(
        self,
        batch_requests: List[Dict[str, Any]],
        batch_name: str = ""
    ) -> str:
        """Submit a list of Anthropic-formatted requests; return batch ID."""
        response = self.client.beta.messages.batches.create(
            requests=batch_requests,
        )

        batch_id = response.id
        logger.info(
            f"Submitted batch '{batch_name}': {batch_id} "
            f"({len(batch_requests)} requests, model: {self.model})"
        )

        metadata = {
            "batch_id": batch_id,
            "batch_name": batch_name,
            "model": self.model,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "request_count": len(batch_requests),
        }
        with open(self.batch_dir / f"{batch_id}_metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

        return batch_id

    def poll_batch(self, batch_id: str) -> Dict[str, Any]:
        """Return normalized status dict for a single batch."""
        response = self.client.beta.messages.batches.retrieve(batch_id)
        counts = response.request_counts

        logger.debug(f"Batch {batch_id} raw attrs: {[a for a in dir(response) if not a.startswith('_')]}")

        processing = getattr(counts, "processing", 0)
        succeeded  = getattr(counts, "succeeded", 0)
        errored    = getattr(counts, "errored", 0)
        canceled   = getattr(counts, "canceled", 0)
        expired    = getattr(counts, "expired", 0)

        total = processing + succeeded + errored + canceled + expired
        done  = succeeded + errored + canceled + expired
        completion_pct = int(100 * done / total) if total > 0 else 0

        raw_status = (
            getattr(response, "processing_status", None)
            or getattr(response, "status", None)
            or "unknown"
        )

        return {
            "batch_id": batch_id,
            "status": raw_status,
            "processing": processing,
            "succeeded": succeeded,
            "errored": errored,
            "canceled": canceled,
            "expired": expired,
            "total_requests": total,
            "completion_pct": completion_pct,
        }

    def retrieve_results(self, batch_id: str) -> List[Dict[str, Any]]:
        """
        Retrieve results from a completed batch.

        Returns normalized list:
          {record_id, status, content, prompt_tokens, completion_tokens, error}
        """
        status = self.poll_batch(batch_id)
        if status["status"] != "ended":
            logger.warning(
                f"Batch {batch_id} not complete yet "
                f"(status: {status['status']}, {status['completion_pct']}%)"
            )
            return []

        results = []
        try:
            for result in self.client.beta.messages.batches.results(batch_id):
                message = getattr(result.result, "message", None)
                error = getattr(result.result, "error", None)

                if result.result.type == "succeeded" and message:
                    raw_text = message.content[0].text if message.content else ""
                    raw_text = _sanitize_content(raw_text)
                    content = extract_code_from_response(raw_text, file_extension=".js")
                    results.append({
                        "record_id": result.custom_id,
                        "status": "succeeded",
                        "content": content,
                        "prompt_tokens": message.usage.input_tokens,
                        "completion_tokens": message.usage.output_tokens,
                        "error": None,
                    })
                else:
                    results.append({
                        "record_id": result.custom_id,
                        "status": "failed",
                        "content": "",
                        "prompt_tokens": 0,
                        "completion_tokens": 0,
                        "error": str(error) if error else "unknown error",
                    })

            logger.info(f"Retrieved {len(results)} results from batch {batch_id}")
        except Exception as e:
            logger.error(f"Error retrieving results from batch {batch_id}: {e}")

        return results

    def list_batches(self) -> List[Dict[str, Any]]:
        """List all submitted batches."""
        batches = []
        try:
            for batch in self.client.beta.messages.batches.list():
                batches.append({
                    "batch_id": batch.id,
                    "status": batch.status,
                    "created_at": batch.created_at,
                })
        except Exception as e:
            logger.error(f"Error listing batches: {e}")
        return batches


# Backward-compatibility alias (existing code imported BatchProcessor)
BatchProcessor = AnthropicBatchProvider


# ---------------------------------------------------------------------------
# Together AI provider
# ---------------------------------------------------------------------------

class TogetherBatchProvider:
    """
    Manages Together AI Batch API operations.

    Flow: write JSONL → upload file → create batch → poll → download output JSONL.
    System prompt is placed as role=system inside the messages array (not top-level).
    """

    def __init__(self, model_key: str, batch_dir: Optional[Path] = None):
        if not TOGETHER_API_KEY:
            raise ValueError("TOGETHER_API_KEY not set")

        try:
            from together import Together
        except ImportError:
            raise ImportError(
                "together package not installed. Run: pip install together>=1.5.13"
            )

        self.client = Together(api_key=TOGETHER_API_KEY)
        self.model_key = model_key
        self.model_id = TOGETHER_MODELS[model_key]["model_id"]
        self.batch_dir = batch_dir or TOGETHER_BATCH_IDS_DIR
        self.batch_dir.mkdir(parents=True, exist_ok=True)
        self._pending_file_extensions: Dict[str, str] = {}

    def _download_file(self, file_id: str, dest: Path) -> None:
        """Download a Together AI file via REST API (avoids SDK quirks)."""
        url = f"https://api.together.xyz/v1/files/{file_id}/content"
        resp = http_requests.get(
            url,
            headers={"Authorization": f"Bearer {TOGETHER_API_KEY}"},
            timeout=120,
        )
        resp.raise_for_status()
        dest.write_bytes(resp.content)

    def build_batch_requests(
        self,
        requests_list: List[Dict[str, Any]],
    ) -> Path:
        """
        Write all requests to a retained JSONL file in the project batch directory.

        Each line:
          {"custom_id": "<record_id>", "body": {"model": "...", "messages": [...],
           "max_tokens": ..., "temperature": ...}}

        Returns:
            Path to the JSONL file retained for audit and token-budget checks
        """
        context_window = TOGETHER_MODELS[self.model_key]["context_window_tokens"]
        over_budget = []
        self._pending_file_extensions = {}
        for req in requests_list:
            budget = evaluate_token_budget(
                system_prompt=req["system_prompt"],
                prompt=req["prompt"],
                max_output_tokens=req.get("max_tokens", 16384),
                context_window_tokens=context_window,
                safety_margin_tokens=TOGETHER_CONTEXT_SAFETY_MARGIN,
            )
            if not budget.fits:
                over_budget.append((req["record_id"], budget))
            self._pending_file_extensions[str(req["record_id"])] = req.get("file_extension", ".js")

        if over_budget:
            details = "; ".join(
                f"{record_id} ({budget.required_tokens:,}/{budget.context_window_tokens:,})"
                for record_id, budget in over_budget[:10]
            )
            raise ContextBudgetExceeded(
                f"{len(over_budget)} request(s) exceed the context budget for "
                f"{self.model_id}: {details}. Use utils/check_token_budget.py "
                "to generate a full report before submitting."
            )

        tmp = tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".jsonl",
            delete=False,
            prefix=f"together_batch_{self.model_key}_",
            dir=self.batch_dir,
            encoding="utf-8",
        )
        for req in requests_list:
            body: Dict[str, Any] = {
                "model": self.model_id,
                "messages": [
                    {"role": "system", "content": req["system_prompt"]},
                    {"role": "user",   "content": req["prompt"]},
                ],
                "max_tokens":  req.get("max_tokens", 16384),
                "temperature": req.get("temperature", 0.0),
            }
            reasoning_effort = req.get("reasoning_effort")
            if reasoning_effort:
                body["reasoning_effort"] = reasoning_effort
            if req.get("disable_reasoning"):
                body["reasoning"] = {"enabled": False}
            line = {"custom_id": req["record_id"], "body": body}
            tmp.write(json.dumps(line) + "\n")
        tmp.flush()
        tmp.close()
        return Path(tmp.name)

    def submit_batch(
        self,
        jsonl_path: Path,
        batch_name: str = ""
    ) -> str:
        """
        Upload JSONL file and create a Together AI batch job.

        Args:
            jsonl_path: Path to JSONL input file
            batch_name: Optional label for logging

        Returns:
            Batch ID string
        """
        logger.info(f"Uploading batch file: {jsonl_path}")
        file_resp = self.client.files.upload(
            file=str(jsonl_path),
            purpose="batch-api",
            check=False,
        )
        file_id = file_resp.id
        logger.info(f"File uploaded: {file_id}")

        batch_resp = self.client.batches.create(
            input_file_id=file_id,
            endpoint="/v1/chat/completions",
            completion_window="24h",
        )
        # Together AI SDK v2.x wraps the BatchJob inside BatchCreateResponse.job
        batch_id = batch_resp.job.id
        logger.info(
            f"Created batch '{batch_name}': {batch_id} "
            f"(model: {self.model_id}, file: {file_id})"
        )

        # Extract submitted custom_ids for completeness validation later
        submitted_ids: List[str] = []
        try:
            with open(jsonl_path, "r", encoding="utf-8") as _jf:
                for _line in _jf:
                    _line = _line.strip()
                    if _line:
                        _row = json.loads(_line)
                        _cid = _row.get("custom_id")
                        if _cid:
                            submitted_ids.append(str(_cid))
        except Exception as _e:
            logger.warning(f"Could not read submitted IDs from {jsonl_path}: {_e}")

        metadata = {
            "batch_id": batch_id,
            "batch_name": batch_name,
            "model_key": self.model_key,
            "model_id": self.model_id,
            "file_id": file_id,
            "request_file": str(jsonl_path),
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "submitted_count": len(submitted_ids),
            "submitted_ids": submitted_ids,
            "file_extensions": self._pending_file_extensions,
        }
        with open(self.batch_dir / f"{batch_id}_metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

        return batch_id

    def poll_batch(self, batch_id: str) -> Dict[str, Any]:
        """
        Return normalized status dict compatible with AnthropicBatchProvider.

        Together AI statuses: VALIDATING, IN_PROGRESS, COMPLETED, FAILED, CANCELLED
        """
        batch = self.client.batches.retrieve(batch_id)
        status = getattr(batch, "status", "UNKNOWN")
        total = getattr(batch, "request_count", 0)

        is_done = status in ("COMPLETED", "FAILED", "CANCELLED")
        completion_pct = 100 if is_done else 0

        return {
            "batch_id": batch_id,
            "status": status,
            "processing": total if not is_done else 0,
            "succeeded": total if status == "COMPLETED" else 0,
            "errored": total if status == "FAILED" else 0,
            "canceled": total if status == "CANCELLED" else 0,
            "expired": 0,
            "total_requests": total,
            "completion_pct": completion_pct,
        }

    def retrieve_results(self, batch_id: str) -> List[Dict[str, Any]]:
        """
        Download output JSONL from a completed Together AI batch.

        Returns normalized list:
          {record_id, status, content, prompt_tokens, completion_tokens, error}
        """
        status_info = self.poll_batch(batch_id)
        if status_info["status"] != "COMPLETED":
            logger.warning(
                f"Batch {batch_id} not COMPLETED yet "
                f"(status: {status_info['status']})"
            )
            return []

        batch = self.client.batches.retrieve(batch_id)
        output_file_id = getattr(batch, "output_file_id", None)
        error_file_id = getattr(batch, "error_file_id", None)
        file_extensions: Dict[str, str] = {}
        metadata_path = self.batch_dir / f"{batch_id}_metadata.json"
        if metadata_path.exists():
            try:
                with open(metadata_path, encoding="utf-8") as metadata_file:
                    file_extensions = json.load(metadata_file).get("file_extensions", {})
            except Exception as e:
                logger.warning(f"Could not load file extensions for batch {batch_id}: {e}")

        results: List[Dict[str, Any]] = []

        if output_file_id:
            output_path = self.batch_dir / f"{batch_id}_output.jsonl"
            self._download_file(output_file_id, output_path)
            logger.info(f"Downloaded output file: {output_path}")

            with open(output_path, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        # Use strict=False to tolerate stray control characters
                        # that some models embed in generated code.
                        row = json.loads(line, strict=False)
                        custom_id = row.get("custom_id", "")
                        resp = row.get("response", {})
                        body = resp.get("body", {})
                        status_code = resp.get("status_code", 0)

                        if status_code == 200 and body.get("choices"):
                            choice = body["choices"][0]
                            finish_reason = choice.get("finish_reason")
                            if finish_reason == "length":
                                results.append({
                                    "record_id": custom_id,
                                    "status": "retryable",
                                    "content": "",
                                    "prompt_tokens": 0,
                                    "completion_tokens": 0,
                                    "error": "finish_reason=length (completion truncated)",
                                })
                                logger.warning(
                                    f"Record {custom_id} reached the completion limit; "
                                    "it will be returned to PENDING for retry."
                                )
                                continue

                            content_raw = choice["message"]["content"]
                            # Step 4: strip bare control chars before extraction + storage
                            content_raw = _sanitize_content(content_raw)
                            file_extension = file_extensions.get(str(custom_id), ".js")
                            content = extract_code_from_response(content_raw, file_extension=file_extension)
                            usage = body.get("usage", {})
                            results.append({
                                "record_id": custom_id,
                                "status": "succeeded",
                                "content": content,
                                "prompt_tokens": usage.get("prompt_tokens", 0),
                                "completion_tokens": usage.get("completion_tokens", 0),
                                "error": None,
                                "file_extension": file_extension,
                            })
                        else:
                            results.append({
                                "record_id": custom_id,
                                "status": "failed",
                                "content": "",
                                "prompt_tokens": 0,
                                "completion_tokens": 0,
                                "error": f"status_code={status_code}",
                            })
                    except Exception as e:
                        logger.warning(f"Could not parse output line: {e}")

        # Collect errors from the error file (partial failures)
        if error_file_id:
            error_path = self.batch_dir / f"{batch_id}_errors.jsonl"
            self._download_file(error_file_id, error_path)
            logger.info(f"Downloaded error file: {error_path}")

            failed_ids = {r["record_id"] for r in results}
            with open(error_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                        custom_id = row.get("custom_id", "")
                        if custom_id not in failed_ids:
                            error_msg = str(row.get("error", "unknown error"))
                            logger.warning(
                                f"Record {custom_id} failed in batch: {error_msg}"
                            )
                            results.append({
                                "record_id": custom_id,
                                "status": "failed",
                                "content": "",
                                "prompt_tokens": 0,
                                "completion_tokens": 0,
                                "error": error_msg,
                            })
                    except Exception as e:
                        logger.warning(f"Could not parse error line: {e}")

        succeeded_count = sum(1 for r in results if r["status"] == "succeeded")
        logger.info(
            f"Retrieved {len(results)} results from batch {batch_id} "
            f"({succeeded_count} succeeded)"
        )

        # Step 5: completeness validation — compare returned IDs against submitted IDs
        metadata_path = self.batch_dir / f"{batch_id}_metadata.json"
        if metadata_path.exists():
            try:
                with open(metadata_path, "r") as _mf:
                    _meta = json.load(_mf)
                expected_ids = set(str(i) for i in _meta.get("submitted_ids", []))
                if expected_ids:
                    returned_ids = {r["record_id"] for r in results}
                    missing_ids = sorted(expected_ids - returned_ids, key=lambda x: int(x) if x.isdigit() else x)
                    if missing_ids:
                        logger.warning(
                            f"Batch {batch_id} completeness check FAILED: "
                            f"{len(missing_ids)}/{len(expected_ids)} IDs missing from output. "
                            f"First 20 missing: {missing_ids[:20]}"
                        )
                    else:
                        logger.info(
                            f"Batch {batch_id} completeness check PASSED: "
                            f"all {len(expected_ids)} submitted IDs returned."
                        )
            except Exception as _e:
                logger.warning(f"Could not perform completeness check for {batch_id}: {_e}")
        else:
            logger.warning(
                f"No metadata file found for batch {batch_id}; "
                f"skipping completeness check (batch was submitted before this feature was added)."
            )

        return results

    def list_batches(self) -> List[Dict[str, Any]]:
        """List all Together AI batch jobs."""
        batches = []
        try:
            for batch in self.client.batches.list():
                batches.append({
                    "batch_id": batch.id,
                    "status": batch.status,
                    "created_at": getattr(batch, "created_at", None),
                })
        except Exception as e:
            logger.error(f"Error listing batches: {e}")
        return batches


# ---------------------------------------------------------------------------
# Hugging Face router provider
# ---------------------------------------------------------------------------

class HuggingFaceBatchProvider:
    """
    Manages "batch" refactoring runs against the Hugging Face router
    (OpenAI-compatible https://router.huggingface.co/v1 endpoint).

    The router has no async batch-submission API like Together or Anthropic, so:
      - build_batch_requests writes a retained JSONL file (audit trail, same
        shape as TogetherBatchProvider's).
      - submit_batch fires every request concurrently right away with a thread
        pool, writes the results to a local output JSONL, and returns a locally
        generated batch_id.
      - poll_batch / retrieve_results read that local state back, so from
        BatchOrchestrator's point of view this still looks like an async job
        even though the work already happened inside submit_batch.
    """

    def __init__(self, model_key: str, batch_dir: Optional[Path] = None):
        if not HF_TOKEN:
            raise ValueError("HF_TOKEN not set")
        if model_key not in HUGGINGFACE_MODELS:
            raise ValueError(
                f"Unknown Hugging Face model_key {model_key!r}. "
                f"Valid keys: {list(HUGGINGFACE_MODELS)}"
            )

        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError(
                "openai package not installed. Run: pip install openai>=1.0.0"
            )

        self.client = OpenAI(base_url=HUGGINGFACE_BASE_URL, api_key=HF_TOKEN)
        self.model_key = model_key
        self.model_id = HUGGINGFACE_MODELS[model_key]["model_id"]
        self.batch_dir = batch_dir or (PROJECT_ROOT / "batches")
        self.batch_dir.mkdir(parents=True, exist_ok=True)
        self._pending_file_extensions: Dict[str, str] = {}

    def build_batch_requests(
        self,
        requests_list: List[Dict[str, Any]],
    ) -> Path:
        """Write all requests to a retained JSONL file, mirroring TogetherBatchProvider."""
        self._pending_file_extensions = {}
        tmp = tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".jsonl",
            delete=False,
            prefix=f"huggingface_batch_{self.model_key}_",
            dir=self.batch_dir,
            encoding="utf-8",
        )
        for req in requests_list:
            self._pending_file_extensions[str(req["record_id"])] = req.get("file_extension", ".js")
            body: Dict[str, Any] = {
                "model": self.model_id,
                "messages": [
                    {"role": "system", "content": req["system_prompt"]},
                    {"role": "user",   "content": req["prompt"]},
                ],
                "max_tokens":  req.get("max_tokens", HUGGINGFACE_MAX_TOKENS),
                "temperature": req.get("temperature", HUGGINGFACE_TEMPERATURE),
            }
            line = {"custom_id": req["record_id"], "body": body}
            tmp.write(json.dumps(line) + "\n")
        tmp.flush()
        tmp.close()
        return Path(tmp.name)

    def _call_one(self, custom_id: str, body: Dict[str, Any], max_retries: int = 4) -> Dict[str, Any]:
        """Call the HF router for one request, retrying transient gateway errors."""
        last_error: Optional[Exception] = None
        for attempt in range(max_retries):
            try:
                completion = self.client.chat.completions.create(**body)
                choice = completion.choices[0]
                usage = completion.usage
                return {
                    "custom_id": custom_id,
                    "response": {
                        "status_code": 200,
                        "body": {
                            "choices": [{
                                "finish_reason": choice.finish_reason,
                                "message": {"content": choice.message.content or ""},
                            }],
                            "usage": {
                                "prompt_tokens": usage.prompt_tokens if usage else 0,
                                "completion_tokens": usage.completion_tokens if usage else 0,
                            },
                        },
                    },
                }
            except Exception as e:
                last_error = e
                if attempt == max_retries - 1 or not self._is_retryable_error(e):
                    break
                sleep_s = 2.0 * (2 ** attempt)
                logger.warning(
                    f"Retryable HF error for {custom_id} (attempt {attempt + 1}/{max_retries}): "
                    f"{e}; retrying in {sleep_s:.0f}s"
                )
                time.sleep(sleep_s)

        return {
            "custom_id": custom_id,
            "response": {"status_code": 0, "body": {}},
            "error": str(last_error),
        }

    @staticmethod
    def _is_retryable_error(e: Exception) -> bool:
        """True for transient gateway/rate-limit errors worth retrying (e.g. 502/503/504)."""
        status_code = getattr(e, "status_code", None)
        if status_code in (429, 500, 502, 503, 504):
            return True
        message = str(e)
        return any(
            token in message
            for token in (
                "502", "503", "504",
                "Gateway Time-out", "Bad Gateway", "Service Unavailable",
                "Timeout", "timed out", "Connection",
            )
        )

    def submit_batch(
        self,
        jsonl_path: Path,
        batch_name: str = ""
    ) -> str:
        """Run every request concurrently right now; persist results as a local 'batch'."""
        requests_list = []
        with jsonl_path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    requests_list.append(json.loads(line))

        batch_id = f"hf-{uuid.uuid4().hex[:12]}"
        logger.info(
            f"Running {len(requests_list)} Hugging Face request(s) concurrently "
            f"for batch '{batch_name}' ({batch_id})"
        )

        output_path = self.batch_dir / f"{batch_id}_output.jsonl"
        submitted_ids: List[str] = []
        max_workers = max(1, min(len(requests_list), 8))
        with output_path.open("w", encoding="utf-8") as out_file, ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(self._call_one, row["custom_id"], row["body"]): row["custom_id"]
                for row in requests_list
            }
            for future in as_completed(futures):
                result = future.result()
                submitted_ids.append(str(result["custom_id"]))
                out_file.write(json.dumps(result) + "\n")

        metadata = {
            "batch_id": batch_id,
            "batch_name": batch_name,
            "model_key": self.model_key,
            "model_id": self.model_id,
            "request_file": str(jsonl_path),
            "output_file": str(output_path),
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "submitted_count": len(submitted_ids),
            "submitted_ids": submitted_ids,
            "file_extensions": self._pending_file_extensions,
            "status": "COMPLETED",
        }
        with open(self.batch_dir / f"{batch_id}_metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

        logger.info(
            f"Completed Hugging Face batch '{batch_name}': {batch_id} "
            f"({len(submitted_ids)} requests)"
        )
        return batch_id

    def poll_batch(self, batch_id: str) -> Dict[str, Any]:
        """Return normalized status; HF batches finish synchronously inside submit_batch."""
        metadata_path = self.batch_dir / f"{batch_id}_metadata.json"
        if not metadata_path.exists():
            return {
                "batch_id": batch_id,
                "status": "UNKNOWN",
                "processing": 0,
                "succeeded": 0,
                "errored": 0,
                "canceled": 0,
                "expired": 0,
                "total_requests": 0,
                "completion_pct": 0,
            }

        with open(metadata_path, encoding="utf-8") as f:
            meta = json.load(f)
        total = meta.get("submitted_count", 0)
        return {
            "batch_id": batch_id,
            "status": "COMPLETED",
            "processing": 0,
            "succeeded": total,
            "errored": 0,
            "canceled": 0,
            "expired": 0,
            "total_requests": total,
            "completion_pct": 100,
        }

    def retrieve_results(self, batch_id: str) -> List[Dict[str, Any]]:
        """Parse the local output JSONL written by submit_batch into normalized results."""
        status_info = self.poll_batch(batch_id)
        if status_info["status"] != "COMPLETED":
            logger.warning(f"Batch {batch_id} not COMPLETED yet (status: {status_info['status']})")
            return []

        metadata_path = self.batch_dir / f"{batch_id}_metadata.json"
        with open(metadata_path, encoding="utf-8") as f:
            meta = json.load(f)
        file_extensions: Dict[str, str] = meta.get("file_extensions", {})
        output_path = Path(meta["output_file"])

        results: List[Dict[str, Any]] = []
        with open(output_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line, strict=False)
                    custom_id = row.get("custom_id", "")
                    resp = row.get("response", {})
                    body = resp.get("body", {})
                    status_code = resp.get("status_code", 0)

                    if status_code == 200 and body.get("choices"):
                        choice = body["choices"][0]
                        finish_reason = choice.get("finish_reason")
                        if finish_reason == "length":
                            results.append({
                                "record_id": custom_id,
                                "status": "retryable",
                                "content": "",
                                "prompt_tokens": 0,
                                "completion_tokens": 0,
                                "error": "finish_reason=length (completion truncated)",
                            })
                            continue

                        content_raw = _sanitize_content(choice["message"]["content"])
                        file_extension = file_extensions.get(str(custom_id), ".js")
                        content = extract_code_from_response(content_raw, file_extension=file_extension)
                        usage = body.get("usage", {})
                        results.append({
                            "record_id": custom_id,
                            "status": "succeeded",
                            "content": content,
                            "prompt_tokens": usage.get("prompt_tokens", 0),
                            "completion_tokens": usage.get("completion_tokens", 0),
                            "error": None,
                            "file_extension": file_extension,
                        })
                    else:
                        results.append({
                            "record_id": custom_id,
                            "status": "failed",
                            "content": "",
                            "prompt_tokens": 0,
                            "completion_tokens": 0,
                            "error": row.get("error", f"status_code={status_code}"),
                        })
                except Exception as e:
                    logger.warning(f"Could not parse output line: {e}")

        succeeded_count = sum(1 for r in results if r["status"] == "succeeded")
        logger.info(
            f"Retrieved {len(results)} results from Hugging Face batch {batch_id} "
            f"({succeeded_count} succeeded)"
        )
        return results

    def list_batches(self) -> List[Dict[str, Any]]:
        """List locally recorded Hugging Face batches (there is no remote batch registry)."""
        batches = []
        for metadata_path in sorted(self.batch_dir.glob("hf-*_metadata.json")):
            try:
                with open(metadata_path, encoding="utf-8") as f:
                    meta = json.load(f)
                batches.append({
                    "batch_id": meta["batch_id"],
                    "status": meta.get("status", "COMPLETED"),
                    "created_at": meta.get("submitted_at"),
                })
            except Exception as e:
                logger.error(f"Error reading {metadata_path}: {e}")
        return batches


# ---------------------------------------------------------------------------
# Provider-agnostic orchestrator
# ---------------------------------------------------------------------------

class BatchOrchestrator:
    """Orchestrates splitting, submitting and polling multiple batches."""

    def __init__(self, provider: Optional[Any] = None):
        """
        Args:
            provider: An AnthropicBatchProvider or TogetherBatchProvider instance.
                      Defaults to AnthropicBatchProvider() for backward compatibility.
        """
        self.processor = provider if provider is not None else AnthropicBatchProvider()

    def create_and_submit_batches(
        self,
        experiment_runs: List[Dict[str, Any]],
        batch_size: int = 10000,
    ) -> List[str]:
        """
        Build requests and submit as a single batch regardless of provider.

        Both Anthropic (up to 10,000 requests) and Together AI (up to 50,000)
        support well more requests than a typical experiment run (≤1,314).

        Returns:
            List of submitted batch IDs.
        """
        if isinstance(self.processor, (TogetherBatchProvider, HuggingFaceBatchProvider)):
            return self._submit_together(experiment_runs, batch_size)

        return self._submit_anthropic(experiment_runs)

    def _submit_anthropic(
        self,
        experiment_runs: List[Dict[str, Any]],
    ) -> List[str]:
        total_runs = len(experiment_runs)
        logger.info(f"Submitting {total_runs} runs as a single Anthropic batch")

        requests = self.processor.build_batch_requests(experiment_runs)
        try:
            batch_id = self.processor.submit_batch(requests, batch_name="refactor_batch")
            logger.info(f"Submitted 1 batch successfully: {batch_id}")
            return [batch_id]
        except APIError as e:
            logger.error(f"Failed to submit Anthropic batch: {e}")
            return []

    def _submit_together(
        self,
        experiment_runs: List[Dict[str, Any]],
        batch_size: int,
    ) -> List[str]:
        if batch_size < 1:
            raise ValueError("batch_size must be positive")

        total_runs = len(experiment_runs)
        chunks = [
            experiment_runs[index:index + batch_size]
            for index in range(0, total_runs, batch_size)
        ]
        logger.info(
            f"Building {len(chunks)} Together AI batches for {total_runs} runs "
            f"(up to {batch_size} requests each)"
        )

        batch_ids = []
        for index, chunk in enumerate(chunks, start=1):
            try:
                jsonl_path = self.processor.build_batch_requests(chunk)
                batch_name = f"refactor_{index}_of_{len(chunks)}_{len(chunk)}_runs"
                batch_id = self.processor.submit_batch(jsonl_path, batch_name=batch_name)
                batch_ids.append(batch_id)
                logger.info(f"Submitted Together AI batch {index}/{len(chunks)}: {batch_id}")
            except Exception as e:
                logger.error(f"Failed to submit Together AI batch {index}/{len(chunks)}: {e}")

        return batch_ids

    def poll_all_batches(self, batch_ids: List[str]) -> Dict[str, Any]:
        """Poll all batches and return aggregated summary."""
        TERMINAL_STATUSES = {"COMPLETED", "FAILED", "CANCELLED", "canceled", "expired", "ended"}
        batch_statuses = {}
        total_requests = total_completed = total_processing = 0

        for batch_id in batch_ids:
            status = self.processor.poll_batch(batch_id)
            batch_statuses[batch_id] = status
            total_requests += status["total_requests"]
            total_completed += status["succeeded"] + status["errored"] + status.get("canceled", 0) + status.get("expired", 0)
            total_processing += status["processing"]

        # If all batches are in terminal states treat as 100% complete,
        # even when total_requests == 0 (can happen when the API no longer
        # reports a count for a finalised batch).
        all_terminal = all(
            s.get("status", "").upper() in TERMINAL_STATUSES
            for s in batch_statuses.values()
        )
        if all_terminal and batch_statuses:
            overall_pct = 100
        elif total_requests > 0:
            overall_pct = int(100 * total_completed / total_requests)
        else:
            overall_pct = 0

        return {
            "batch_statuses": batch_statuses,
            "total_requests": total_requests,
            "total_completed": total_completed,
            "total_processing": total_processing,
            "completion_pct": overall_pct,
            "num_batches": len(batch_ids),
        }

    def retrieve_all_results(self, batch_ids: List[str]) -> List[Dict[str, Any]]:
        """Retrieve normalized result dicts from all completed batches."""
        all_results = []
        for batch_id in batch_ids:
            results = self.processor.retrieve_results(batch_id)
            all_results.extend(results)
        logger.info(f"Retrieved {len(all_results)} total results from {len(batch_ids)} batches")
        return all_results



class BatchProcessor:
    """Manages Anthropic Batch API operations."""

    def __init__(self, api_key: Optional[str] = None):
        """Initialize batch processor."""
        key = api_key or ANTHROPIC_API_KEY
        if not key:
            raise ValueError("ANTHROPIC_API_KEY not set")

        self.client = Anthropic(api_key=key)
        self.model = CLAUDE_MODEL
        self.batch_dir = Path.home() / ".claude" / "batches"
        self.batch_dir.mkdir(parents=True, exist_ok=True)

    def build_batch_requests(
        self,
        requests_list: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Build a list of requests in Anthropic Batch API format.

        Args:
            requests_list: List of dicts with keys:
                - record_id: unique identifier (becomes custom_id)
                - prompt: user message content
                - system_prompt: system message
                - max_tokens: max output tokens (default CLAUDE_MAX_OUTPUT_TOKENS)
                - temperature: sampling temperature (default 0.0)

        Returns:
            List of Anthropic-formatted batch request dicts
        """
        batch_requests = []
        for req in requests_list:
            batch_requests.append({
                "custom_id": req["record_id"],
                "params": {
                    "model": self.model,
                    "max_tokens": req.get("max_tokens", CLAUDE_MAX_OUTPUT_TOKENS),
                    "temperature": req.get("temperature", 0.0),
                    "system": req["system_prompt"],
                    "messages": [
                        {"role": "user", "content": req["prompt"]}
                    ]
                }
            })
        return batch_requests

    def submit_batch(
        self,
        batch_requests: List[Dict[str, Any]],
        batch_name: str = ""
    ) -> str:
        """
        Submit a list of requests to the Anthropic Batch API.

        Args:
            batch_requests: List of Anthropic-formatted request dicts
            batch_name: Optional label for logging/metadata

        Returns:
            Batch ID string
        """
        response = self.client.beta.messages.batches.create(
            requests=batch_requests,
        )

        batch_id = response.id
        logger.info(
            f"Submitted batch '{batch_name}': {batch_id} "
            f"({len(batch_requests)} requests, model: {self.model})"
        )

        # Save metadata locally for tracking
        metadata = {
            "batch_id": batch_id,
            "batch_name": batch_name,
            "model": self.model,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "request_count": len(batch_requests),
        }
        with open(self.batch_dir / f"{batch_id}_metadata.json", "w") as f:
            json.dump(metadata, f, indent=2)

        return batch_id

    def poll_batch(self, batch_id: str) -> Dict[str, Any]:
        """
        Check status of a single batch.

        Returns:
            Dict with status, counts, and completion percentage
        """
        response = self.client.beta.messages.batches.retrieve(batch_id)
        counts = response.request_counts

        # Log raw response attributes once for debugging
        logger.debug(f"Batch {batch_id} raw attrs: {[a for a in dir(response) if not a.startswith('_')]}")
        logger.debug(f"Counts attrs: {[a for a in dir(counts) if not a.startswith('_')]}")

        processing = getattr(counts, "processing", 0)
        succeeded  = getattr(counts, "succeeded", 0)
        errored    = getattr(counts, "errored", 0)
        canceled   = getattr(counts, "canceled", 0)
        expired    = getattr(counts, "expired", 0)

        total = processing + succeeded + errored + canceled + expired
        done  = succeeded + errored + canceled + expired
        completion_pct = int(100 * done / total) if total > 0 else 0

        # SDK uses processing_status (not status)
        raw_status = (
            getattr(response, "processing_status", None)
            or getattr(response, "status", None)
            or "unknown"
        )
        # Normalize: batch is "done" when processing_status == "ended"
        status = raw_status

        return {
            "batch_id": batch_id,
            "status": status,
            "processing": processing,
            "succeeded": succeeded,
            "errored": errored,
            "canceled": canceled,
            "expired": expired,
            "total_requests": total,
            "completion_pct": completion_pct,
        }

    def retrieve_results(self, batch_id: str) -> List[Dict[str, Any]]:
        """
        Stream results from a completed batch.

        Returns:
            List of result dicts with record_id, status, message, and error
        """
        status = self.poll_batch(batch_id)
        if status["status"] != "ended":
            logger.warning(
                f"Batch {batch_id} not complete yet "
                f"(status: {status['status']}, {status['completion_pct']}%)"
            )
            return []

        results = []
        try:
            for result in self.client.beta.messages.batches.results(batch_id):
                results.append({
                    "record_id": result.custom_id,
                    "status": result.result.type,
                    "message": getattr(result.result, "message", None),
                    "error": getattr(result.result, "error", None),
                })
            logger.info(f"Retrieved {len(results)} results from batch {batch_id}")
        except Exception as e:
            logger.error(f"Error retrieving results from batch {batch_id}: {e}")

        return results

    def list_batches(self) -> List[Dict[str, Any]]:
        """List all submitted batches."""
        batches = []
        try:
            for batch in self.client.beta.messages.batches.list():
                batches.append({
                    "batch_id": batch.id,
                    "status": batch.status,
                    "created_at": batch.created_at,
                })
        except Exception as e:
            logger.error(f"Error listing batches: {e}")
        return batches
