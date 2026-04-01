"""
Anthropic Batch API processor for parallel refactoring experiments.

Handles submission, polling, and result retrieval for batch processing.
The Anthropic Batch API accepts a list of requests directly (not a file).
"""

import json
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from anthropic import Anthropic, APIError
from utils.config import ANTHROPIC_API_KEY, CLAUDE_MODEL, CLAUDE_MAX_OUTPUT_TOKENS
from utils.logger_config import get_logger

logger = get_logger("batch_processor")


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


class BatchOrchestrator:
    """Orchestrates splitting, submitting and polling multiple batches."""

    def __init__(self):
        self.processor = BatchProcessor()

    def create_and_submit_batches(
        self,
        experiment_runs: List[Dict[str, Any]],
        batch_size: int = 164,
    ) -> List[str]:
        """
        Split experiment runs into batches, build requests, and submit all.

        Args:
            experiment_runs: List of run dicts (record_id, prompt, system_prompt, etc.)
            batch_size: Max requests per batch

        Returns:
            List of submitted batch IDs
        """
        total_runs = len(experiment_runs)
        num_batches = (total_runs + batch_size - 1) // batch_size
        logger.info(f"Splitting {total_runs} runs into {num_batches} batches of ≤{batch_size}")

        batch_ids = []
        for i in range(num_batches):
            chunk = experiment_runs[i * batch_size:(i + 1) * batch_size]
            batch_name = f"refactor_batch_{i + 1:02d}_of_{num_batches:02d}"

            requests = self.processor.build_batch_requests(chunk)
            try:
                batch_id = self.processor.submit_batch(requests, batch_name=batch_name)
                batch_ids.append(batch_id)
                if i < num_batches - 1:
                    time.sleep(1)  # Avoid hammering the API
            except APIError as e:
                logger.error(f"Failed to submit {batch_name}: {e}")

        logger.info(f"Submitted {len(batch_ids)}/{num_batches} batches successfully")
        return batch_ids

    def poll_all_batches(self, batch_ids: List[str]) -> Dict[str, Any]:
        """Poll all batches and return aggregated summary."""
        batch_statuses = {}
        total_requests = total_completed = total_processing = 0

        for batch_id in batch_ids:
            status = self.processor.poll_batch(batch_id)
            batch_statuses[batch_id] = status
            total_requests += status["total_requests"]
            total_completed += status["succeeded"] + status["errored"] + status["canceled"] + status["expired"]
            total_processing += status["processing"]

        overall_pct = int(100 * total_completed / total_requests) if total_requests > 0 else 0

        return {
            "batch_statuses": batch_statuses,
            "total_requests": total_requests,
            "total_completed": total_completed,
            "total_processing": total_processing,
            "completion_pct": overall_pct,
            "num_batches": len(batch_ids),
        }

    def retrieve_all_results(self, batch_ids: List[str]) -> List[Dict[str, Any]]:
        """Retrieve results from all completed batches."""
        all_results = []
        for batch_id in batch_ids:
            results = self.processor.retrieve_results(batch_id)
            all_results.extend(results)
        logger.info(f"Retrieved {len(all_results)} total results from {len(batch_ids)} batches")
        return all_results
