"""
Main experiment orchestration engine for the praxis research.

Orchestrates 1,314 LLM-based code refactoring experiments across:
- 146 source files
- 3 prompt conditions (baseline, nfr_generic, adaptive_nfr)
- 3 runs per condition
- 7 execution stages per run

Provides state persistence, pause/resume, and comprehensive error handling.
"""

import sys
import time
import json
import csv
import threading
import re
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd
import click

# Local imports
from utils.config import (
    CSV_INPUT_FILE,
    SOURCE_CODE_DIR,
    EXTRACTION_MANIFEST_FILE,
    EXECUTION_STAGES,
    SONARCLOUD_COMPONENT_TEMPLATE,
    CLAUDE_MAX_OUTPUT_TOKENS,
)
from utils.logger_config import setup_logging, get_logger
from orchestration.state_manager import StateManager, ExperimentRun
from orchestration.experiment_repo_manager import ExperimentRepoManager
from api.claude_caller import ClaudeCaller
from api.sonarcloud_poller import SonarCloudPoller
from utils.validation import run_all_validations, get_validation_report

logger = get_logger("orchestrator")


class ExperimentOrchestrator:
    """Main orchestration engine for praxis experiments."""

    _TEXT_RESULT_COLUMNS = [
        "refactoring_applied",
        "git_commit_hash",
        "sonar_component_key",
    ]

    def __init__(self):
        """Initialize the orchestrator."""
        self.state_manager = StateManager()
        self.repo_manager = ExperimentRepoManager()
        self.claude_caller = ClaudeCaller()
        self.sonar_poller = SonarCloudPoller()
        self.csv_df = None
        self._manifest_by_project_path: Dict[Tuple[str, str], int] = {}
        self._git_lock = threading.Lock()  # Serialize git operations
        self._csv_lock = threading.Lock()  # Serialize CSV writes
        self._load_csv()

    def _load_csv(self) -> None:
        """Load the CSV data."""
        try:
            self.csv_df = pd.read_csv(CSV_INPUT_FILE, dtype={"record_id": str})

            # Columns that are initially empty can be inferred as float64, which
            # later rejects string writes (e.g., setting refactoring_applied="Y").
            for col in self._TEXT_RESULT_COLUMNS:
                if col in self.csv_df.columns:
                    self.csv_df[col] = self.csv_df[col].astype("string")

            self._load_manifest_index()

            logger.info(f"Loaded CSV: {len(self.csv_df)} records")
        except Exception as e:
            logger.error(f"Failed to load CSV: {e}")
            raise

    def _load_manifest_index(self) -> None:
        """Load deterministic mapping from (project, original_path) -> file_id."""
        if not EXTRACTION_MANIFEST_FILE.exists():
            raise FileNotFoundError(f"Extraction manifest not found: {EXTRACTION_MANIFEST_FILE}")

        manifest_df = pd.read_csv(EXTRACTION_MANIFEST_FILE)
        mapping: Dict[Tuple[str, str], int] = {}

        for _, row in manifest_df.iterrows():
            output_name = str(row.get("output_filename", ""))
            match = re.match(r"^file_(\d{4})_", output_name)
            if not match:
                continue

            project = str(row.get("project", "")).strip()
            original_path = self._normalize_path(str(row.get("original_path", "")))
            if not project or not original_path:
                continue

            mapping[(project, original_path)] = int(match.group(1))

        self._manifest_by_project_path = mapping
        logger.info(f"Loaded extraction manifest index: {len(mapping)} entries")

    @staticmethod
    def _normalize_path(path_value: str) -> str:
        """Normalize path separators for robust matching."""
        return path_value.strip().replace("\\", "/")

    def _resolve_file_id_from_row(self, csv_row: Any) -> int:
        """Resolve canonical file_id using project and source path from CSV row."""
        project = str(csv_row.get("project_name", "")).strip()
        file_path = self._normalize_path(str(csv_row.get("file_path", "")))

        file_id = self._manifest_by_project_path.get((project, file_path))
        if file_id is not None:
            return file_id

        # Some datasets include project path in file_key; use it as backup if available.
        file_key = str(csv_row.get("file_key", ""))
        if ":" in file_key:
            key_path = self._normalize_path(file_key.split(":", 1)[1])
            file_id = self._manifest_by_project_path.get((project, key_path))
            if file_id is not None:
                return file_id

        raise ValueError(
            f"Could not resolve file_id for project={project!r}, file_path={file_path!r}"
        )

    def _find_source_file_for_row(self, csv_row: Any) -> Tuple[int, Path]:
        """Resolve (file_id, source_file_path) deterministically from a CSV row."""
        file_id = self._resolve_file_id_from_row(csv_row)
        file_name = str(csv_row.get("file_name", "")).strip()

        candidates = sorted(SOURCE_CODE_DIR.glob(f"file_{file_id:04d}_*"))
        if not candidates:
            raise FileNotFoundError(
                f"No source file found for file_id={file_id:04d} under {SOURCE_CODE_DIR}"
            )

        if file_name:
            exact_name_candidates = [p for p in candidates if p.name == f"file_{file_id:04d}_{file_name}"]
            if len(exact_name_candidates) == 1:
                return file_id, exact_name_candidates[0]

        return file_id, candidates[0]

    def _ensure_text_columns(self) -> None:
        """Ensure result columns used for string values accept string assignments."""
        for col in self._TEXT_RESULT_COLUMNS:
            if col not in self.csv_df.columns:
                self.csv_df[col] = pd.Series(pd.NA, index=self.csv_df.index, dtype="string")
            elif self.csv_df[col].dtype != "string":
                self.csv_df[col] = self.csv_df[col].astype("string")

    def initialize_state_from_csv(self) -> None:
        """Initialize state file from CSV if not already done."""
        # Check if runs have already been added (not just if total_runs is set)
        existing_runs = self.state_manager._state.get("runs", {})

        if len(existing_runs) > 0:
            self._repair_existing_file_ids()
            logger.info(f"State already initialized with {len(existing_runs)} runs")
            return

        logger.info("Initializing state from CSV...")

        for idx, row in self.csv_df.iterrows():
            file_name = str(row["file_name"])
            file_id, _ = self._find_source_file_for_row(row)
            run = ExperimentRun(
                record_id=str(row["record_id"]),
                file_id=file_id,
                project_name=str(row["project_name"]),
                file_name=file_name,
                condition=str(row["prompt_condition"]),  # CSV uses prompt_condition
                run_number=int(row["run_number"]),
            )
            self.state_manager.add_run(run)

        logger.info(f"State initialized with {len(self.csv_df)} runs")

    def run_next_experiment(self) -> Optional[str]:
        """
        Execute the next pending experiment.

        Returns:
            Project name if an experiment was executed, None if none pending
        """
        # Get next pending run
        record_id = self.state_manager.get_next_pending_run()
        if not record_id:
            logger.info("No more pending runs")
            return None

        run = self.state_manager.get_run(record_id)
        if not run:
            logger.error(f"Run {record_id} not found")
            return None

        # Keep older state files compatible by correcting project_id-derived file IDs.
        csv_row = self.csv_df[self.csv_df["record_id"] == run.record_id].iloc[0]
        corrected_file_id, _ = self._find_source_file_for_row(csv_row)
        if run.file_id != corrected_file_id:
            logger.info(
                f"Correcting file_id for run {run.record_id}: "
                f"{run.file_id} -> {corrected_file_id}"
            )
            run.file_id = corrected_file_id
            self.state_manager.add_run(run)

        logger.info(
            f"Starting run {record_id}: File {run.file_id} | "
            f"{run.condition} | Run {run.run_number}"
        )

        try:
            self.state_manager.update_run_status(record_id, "IN_PROGRESS", "CODE_GENERATION")

            # Stage 1: Code Generation
            generated_code, tokens = self._stage_code_generation(run)

            # Stage 2: Code Validation
            self._stage_code_validation(record_id, generated_code)

            # Stage 3: Git Commit
            commit_hash = self._stage_git_commit(run, tokens)

            # Stage 4: Git Push
            self._stage_git_push(record_id)

            # Stage 5: SonarCloud Queue Check
            self._stage_sonar_queue_check(record_id, run)

            # Stage 6: SonarCloud Metric Extraction
            metrics = self._stage_sonar_metric_extraction(record_id, run)

            # Stage 7: CSV Update
            self._stage_csv_update(record_id, run, metrics)

            # Mark as completed
            self.state_manager.update_run_status(record_id, "COMPLETED")

            logger.info(
                f"Run {record_id} completed in "
                f"{self.state_manager.get_run(record_id).duration_seconds:.1f}s"
            )
            return run.project_name

        except Exception as e:
            logger.error(f"Run {record_id} failed: {str(e)}")
            self.state_manager.update_run_status(record_id, "FAILED")
            return None

    def _stage_code_generation(self, run: ExperimentRun) -> tuple:
        """
        Stage 1: Generate refactored code using Claude.

        Args:
            run: Experiment run

        Returns:
            Tuple of (generated_code, tokens_dict)
        """
        self.state_manager.update_run_status(run.record_id, "IN_PROGRESS", "CODE_GENERATION")

        # Load original source code
        csv_row = self.csv_df[self.csv_df["record_id"] == run.record_id].iloc[0]

        # Resolve source file deterministically from project/path metadata.
        resolved_file_id, source_file = self._find_source_file_for_row(csv_row)
        if run.file_id != resolved_file_id:
            run.file_id = resolved_file_id
            self.state_manager.add_run(run)

        original_code = source_file.read_text(encoding="utf-8")

        # Build prompt from CSV
        prompt = self._build_prompt(run, csv_row, original_code)

        logger.debug(f"Calling Claude API for {run.record_id}")

        # Call Claude
        response = self.claude_caller.call(
            prompt=prompt,
            system_prompt=self._get_system_prompt(run.condition),
            max_tokens=CLAUDE_MAX_OUTPUT_TOKENS,
        )

        # Detect truncated responses before attempting code extraction
        if response["stop_reason"] == "max_tokens":
            raise ValueError(
                f"Claude response truncated (hit {CLAUDE_MAX_OUTPUT_TOKENS} token limit). "
                f"Output tokens: {response['completion_tokens']}"
            )

        generated_code = self.claude_caller.extract_code_from_response(
            response["content"], file_extension=".js"
        )

        # Update run with token info
        run.llm_model = response["model"]
        run.llm_temperature = 0.0
        run.prompt_tokens = response["prompt_tokens"]
        run.completion_tokens = response["completion_tokens"]
        run.llm_tokens_used = response["total_tokens"]

        logger.info(
            f"Code generated for {run.record_id}: "
            f"{run.prompt_tokens} input, {run.completion_tokens} output tokens"
        )

        return generated_code, {
            "model": response["model"],
            "temperature": 0.0,
            "prompt_tokens": response["prompt_tokens"],
            "completion_tokens": response["completion_tokens"],
            "total_tokens": response["total_tokens"],
        }

    def _stage_code_validation(self, record_id: str, code: str) -> None:
        """
        Stage 2: Validate generated code syntax.

        Args:
            record_id: Run ID
            code: Generated code
        """
        self.state_manager.update_run_status(record_id, "IN_PROGRESS", "CODE_VALIDATION")

        if not code or len(code.strip()) == 0:
            raise ValueError("Generated code is empty")

        # Basic syntax validation (brace matching, etc.)
        braces = code.count("{") - code.count("}")
        if braces != 0:
            raise ValueError(f"Unbalanced braces in generated code: {braces:+d}")

        logger.debug(f"Code validated for {record_id}")

    def _stage_git_commit(self, run: ExperimentRun, tokens: Dict[str, Any]) -> str:
        """
        Stage 3: Create atomic git commit.

        Args:
            run: Experiment run
            tokens: Token information

        Returns:
            Commit hash
        """
        self.state_manager.update_run_status(run.record_id, "IN_PROGRESS", "GIT_COMMIT")

        with self._git_lock:
            # Ensure repo is initialized
            self.repo_manager.ensure_repo_exists()
            self.repo_manager.configure_author()

            # Write code file
            csv_row = self.csv_df[self.csv_df["record_id"] == run.record_id].iloc[0]

            resolved_file_id, source_file = self._find_source_file_for_row(csv_row)
            if run.file_id != resolved_file_id:
                run.file_id = resolved_file_id
                self.state_manager.add_run(run)
            code = source_file.read_text(encoding="utf-8")

            self.repo_manager.write_code_file(
                condition=run.condition,
                file_id=run.file_id,
                run_number=run.run_number,
                code=code,
            )

            # Get pre-refactoring CC from CSV if available
            pre_cc = csv_row.get("pre_cyclomatic_complexity")

            # Create commit
            commit_hash = self.repo_manager.create_commit(
                record_id=int(run.record_id),
                file_id=run.file_id,
                project_name=run.project_name,
                file_name=run.file_name,
                condition=run.condition,
                run_number=run.run_number,
                llm_model=tokens["model"],
                llm_temperature=tokens["temperature"],
                prompt_tokens=tokens["prompt_tokens"],
                completion_tokens=tokens["completion_tokens"],
                total_tokens=tokens["total_tokens"],
                timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                pre_cc=int(pre_cc) if pd.notna(pre_cc) else None,
            )

        # Update state
        self.state_manager.update_run_status(run.record_id, "IN_PROGRESS", "GIT_COMMIT")
        run.git_commit_hash = commit_hash

        logger.info(f"Git commit created for {run.record_id}: {commit_hash[:8]}")
        return commit_hash

    def _stage_git_push(self, record_id: str) -> None:
        """
        Stage 4: Push commit to remote.

        Args:
            record_id: Run ID
        """
        self.state_manager.update_run_status(record_id, "IN_PROGRESS", "GIT_PUSH")

        with self._git_lock:
            try:
                self.repo_manager.push_to_remote()
                logger.info(f"Git push succeeded for {record_id}")
            except Exception as e:
                logger.warning(f"Git push failed for {record_id}: {str(e)}")
                # Continue anyway; SonarCloud may still analyze

    def _repair_existing_file_ids(self) -> None:
        """Repair runs initialized with project_id-as-file_id in existing state files."""
        repaired = 0
        for record_id in list(self.state_manager._state.get("runs", {}).keys()):
            run = self.state_manager.get_run(record_id)
            if not run:
                continue

            csv_row = self.csv_df[self.csv_df["record_id"] == run.record_id]
            if csv_row.empty:
                continue

            expected_file_id, _ = self._find_source_file_for_row(csv_row.iloc[0])
            if run.file_id != expected_file_id:
                run.file_id = expected_file_id
                self.state_manager.add_run(run)
                repaired += 1

        if repaired:
            logger.info(f"Repaired file_id for {repaired} existing runs")

    def _stage_batch_git_push(self) -> None:
        """
        Push all pending commits to remote in a single push.
        Used in concurrent mode to batch pushes instead of one per run.
        """
        with self._git_lock:
            try:
                self.repo_manager.push_to_remote()
                logger.info("Batch git push succeeded")
            except Exception as e:
                logger.warning(f"Batch git push failed: {str(e)}")

    def _stage_sonar_queue_check(self, record_id: str, run: ExperimentRun) -> None:
        """
        Stage 5: Verify SonarCloud received the code.

        Args:
            record_id: Run ID
            run: Experiment run
        """
        self.state_manager.update_run_status(record_id, "IN_PROGRESS", "SONAR_QUEUE_CHECK")

        # Generate component key
        component_key = SONARCLOUD_COMPONENT_TEMPLATE.format(
            condition=run.condition,
            file_id=run.file_id,
            run_number=run.run_number,
        )
        run.sonar_component_key = component_key

        logger.debug(f"SonarCloud component key: {component_key}")

    def _stage_sonar_metric_extraction(self, record_id: str, run: ExperimentRun) -> Dict[str, Any]:
        """
        Stage 6: Poll SonarCloud until metrics are ready.

        Args:
            record_id: Run ID
            run: Experiment run

        Returns:
            Metrics dict
        """
        self.state_manager.update_run_status(record_id, "IN_PROGRESS", "SONAR_METRIC_EXTRACTION")

        # Generate component key
        component_key = SONARCLOUD_COMPONENT_TEMPLATE.format(
            condition=run.condition,
            file_id=run.file_id,
            run_number=run.run_number,
        )

        try:
            # Poll SonarCloud
            analysis_result = self.sonar_poller.wait_for_analysis_completion(component_key)

            if analysis_result["status"] == "SUCCESS":
                metrics = analysis_result.get("metrics", {})

                # Update state with metrics
                self.state_manager.update_run_with_metrics(
                    record_id,
                    cc=metrics.get("cyclomatic_complexity"),
                    cognitive_cc=metrics.get("cognitive_complexity"),
                    ncloc=metrics.get("ncloc"),
                    cc_delta=None,  # Will be calculated in CSV update
                )

                logger.info(f"Metrics extracted for {record_id}: {metrics}")
                return metrics
            else:
                raise Exception(f"SonarCloud analysis failed: {analysis_result.get('error')}")

        except TimeoutError as e:
            logger.error(f"SonarCloud timeout for {record_id}: {str(e)}")
            self.state_manager.add_error_to_run(
                record_id,
                stage="SONAR_METRIC_EXTRACTION",
                error_type="SonarCloudTimeoutError",
                message=str(e),
                is_retriable=True,
            )
            raise

    def _stage_csv_update(self, record_id: str, run: ExperimentRun, metrics: Dict[str, Any]) -> None:
        """
        Stage 7: Update CSV with results.

        Args:
            record_id: Run ID
            run: Experiment run
            metrics: Metrics dict
        """
        self.state_manager.update_run_status(record_id, "IN_PROGRESS", "CSV_UPDATE")

        # Find row in CSV
        csv_idx = self.csv_df[self.csv_df["record_id"] == record_id].index[0]

        # Guard against pandas inferring empty string columns as float64.
        self._ensure_text_columns()

        # Update post-metrics
        self.csv_df.loc[csv_idx, "refactoring_applied"] = "Y"
        self.csv_df.loc[csv_idx, "post_cyclomatic_complexity"] = metrics.get("cyclomatic_complexity")
        self.csv_df.loc[csv_idx, "post_cognitive_complexity"] = metrics.get("cognitive_complexity")
        self.csv_df.loc[csv_idx, "post_ncloc"] = metrics.get("ncloc")

        # Calculate delta
        pre_cc = self.csv_df.loc[csv_idx, "pre_cyclomatic_complexity"]
        post_cc = metrics.get("cyclomatic_complexity")
        if pd.notna(pre_cc) and post_cc is not None:
            delta = post_cc - int(pre_cc)
            self.csv_df.loc[csv_idx, "cc_delta"] = delta
            self.state_manager.update_run_with_metrics(
                record_id,
                cc=post_cc,
                cognitive_cc=metrics.get("cognitive_complexity"),
                ncloc=metrics.get("ncloc"),
                cc_delta=delta,
            )

        # Calculate cognitive complexity delta
        pre_cognitive = self.csv_df.loc[csv_idx, "pre_cognitive_complexity"]
        post_cognitive = metrics.get("cognitive_complexity")
        if pd.notna(pre_cognitive) and post_cognitive is not None:
            cognitive_delta = post_cognitive - int(pre_cognitive)
            self.csv_df.loc[csv_idx, "cognitive_delta"] = cognitive_delta

        # Add metadata
        self.csv_df.loc[csv_idx, "git_commit_hash"] = run.git_commit_hash
        self.csv_df.loc[csv_idx, "sonar_component_key"] = run.sonar_component_key

        # Save CSV
        with self._csv_lock:
            self.csv_df.to_csv(CSV_INPUT_FILE, index=False)
        logger.info(f"CSV updated for {record_id}")

    def _build_prompt(self, run: ExperimentRun, csv_row: Any, original_code: str) -> str:
        """Build the refactoring prompt for Claude."""
        # Get prompt from CSV
        prompt_col = f"prompt_{run.condition}"
        if prompt_col in csv_row:
            prompt_template = csv_row[prompt_col]
        else:
            # Fallback
            prompt_template = "Refactor the following code to reduce complexity:\n\n{code}"

        return prompt_template.format(code=original_code)

    def _get_system_prompt(self, condition: str) -> str:
        """Get system prompt based on condition."""
        system_prompts = {
            "baseline": (
                "You are an expert code refactoring specialist. "
                "Refactor the given code to improve code quality and reduce complexity."
            ),
            "nfr_generic": (
                "You are an expert code refactoring specialist. "
                "Refactor the given code focusing on non-functional requirements: "
                "maintainability, readability, and testability."
            ),
            "adaptive_nfr": (
                "You are an expert code refactoring specialist. "
                "Analyze the code and adaptively refactor it, applying techniques that best suit "
                "the specific code patterns and complexity issues found."
            ),
        }
        return system_prompts.get(condition, system_prompts["baseline"])

    def _execute_single_run(self, record_id: str, batch_push: bool = False) -> Optional[str]:
        """
        Execute a single experiment run. Thread-safe for concurrent execution.

        Args:
            record_id: Run record ID
            batch_push: If True, skip individual push (caller will batch push)

        Returns:
            Project name if successful, None if failed
        """
        run = self.state_manager.get_run(record_id)
        if not run:
            logger.error(f"Run {record_id} not found")
            return None

        logger.info(
            f"Starting run {record_id}: File {run.file_id} | "
            f"{run.condition} | Run {run.run_number}"
        )

        try:
            self.state_manager.update_run_status(record_id, "IN_PROGRESS", "CODE_GENERATION")

            # Stage 1: Code Generation (I/O-bound, safe to parallelize)
            generated_code, tokens = self._stage_code_generation(run)

            # Stage 2: Code Validation (CPU-light)
            self._stage_code_validation(record_id, generated_code)

            # Stage 3: Git Commit (serialized via _git_lock)
            commit_hash = self._stage_git_commit(run, tokens)

            # Stage 4: Git Push (skip if batching)
            if not batch_push:
                self._stage_git_push(record_id)

            # Stage 5: SonarCloud Queue Check
            self._stage_sonar_queue_check(record_id, run)

            # Stage 6: SonarCloud Metric Extraction (I/O-bound, safe to parallelize)
            metrics = self._stage_sonar_metric_extraction(record_id, run)

            # Stage 7: CSV Update (serialized via _csv_lock)
            self._stage_csv_update(record_id, run, metrics)

            # Mark as completed
            self.state_manager.update_run_status(record_id, "COMPLETED")

            logger.info(
                f"Run {record_id} completed in "
                f"{self.state_manager.get_run(record_id).duration_seconds:.1f}s"
            )
            return run.project_name

        except Exception as e:
            logger.error(f"Run {record_id} failed: {str(e)}")
            self.state_manager.update_run_status(record_id, "FAILED")
            return None

    def _get_next_pending_batch(self, batch_size: int, max_runs: Optional[int] = None,
                                 current_count: int = 0) -> List[str]:
        """
        Get the next batch of pending run IDs.

        Args:
            batch_size: Max number of runs to fetch
            max_runs: Overall run limit
            current_count: Runs already processed

        Returns:
            List of record IDs
        """
        remaining = batch_size
        if max_runs:
            remaining = min(batch_size, max_runs - current_count)
        if remaining <= 0:
            return []

        batch = []
        pending = self.state_manager.get_all_runs_by_status("PENDING")
        for record_id in pending:
            if len(batch) >= remaining:
                break
            batch.append(record_id)
        return batch

    def run_all_experiments(
        self,
        max_runs: Optional[int] = None,
        max_projects: Optional[int] = None,
        concurrency: int = 1,
    ) -> None:
        """
        Run all pending experiments.

        Args:
            max_runs: Optional limit on number of runs to execute
            max_projects: Optional limit on number of unique projects to process
            concurrency: Number of concurrent workers (1 = sequential)
        """
        logger.info(
            f"Starting experiment orchestration "
            f"(concurrency={concurrency})..."
        )

        # Initialize state from CSV if needed
        self.initialize_state_from_csv()

        run_count = 0
        failed_count = 0
        completed_projects = set()
        batch_push = concurrency > 1  # Batch pushes in concurrent mode

        if concurrency <= 1:
            # Sequential mode (original behavior)
            while True:
                stats = self.state_manager.get_statistics()
                logger.info(
                    f"Progress: {stats['completed']}/{stats['total_runs']} "
                    f"completed, {stats['failed']} failed"
                )

                if max_runs and run_count >= max_runs:
                    logger.info(f"Reached max runs limit: {max_runs}")
                    break

                if max_projects and len(completed_projects) >= max_projects:
                    logger.info(f"Reached max projects limit: {max_projects} projects processed")
                    break

                if stats.get("status") == "PAUSED":
                    logger.info("Experiment paused")
                    time.sleep(5)
                    continue

                project_name = self.run_next_experiment()
                if project_name:
                    run_count += 1
                    completed_projects.add(project_name)
                    logger.info(f"Completed projects so far: {len(completed_projects)}: {completed_projects}")
                else:
                    break
        else:
            # Concurrent mode
            logger.info(f"Running with {concurrency} concurrent workers")

            while True:
                stats = self.state_manager.get_statistics()
                logger.info(
                    f"Progress: {stats['completed']}/{stats['total_runs']} "
                    f"completed, {stats['failed']} failed"
                )

                if max_runs and run_count >= max_runs:
                    logger.info(f"Reached max runs limit: {max_runs}")
                    break

                if max_projects and len(completed_projects) >= max_projects:
                    logger.info(f"Reached max projects limit: {max_projects} projects processed")
                    break

                if stats.get("status") == "PAUSED":
                    logger.info("Experiment paused")
                    time.sleep(5)
                    continue

                # Get a batch of pending runs
                batch = self._get_next_pending_batch(
                    batch_size=concurrency,
                    max_runs=max_runs,
                    current_count=run_count,
                )

                if not batch:
                    logger.info("No more pending runs")
                    break

                # Mark all batch runs as in-progress to prevent re-selection
                for record_id in batch:
                    self.state_manager.update_run_status(record_id, "IN_PROGRESS", "CODE_GENERATION")

                # Execute batch concurrently
                with ThreadPoolExecutor(max_workers=concurrency) as executor:
                    future_to_id = {
                        executor.submit(self._execute_single_run, record_id, batch_push): record_id
                        for record_id in batch
                    }

                    for future in as_completed(future_to_id):
                        record_id = future_to_id[future]
                        try:
                            project_name = future.result()
                            if project_name:
                                run_count += 1
                                completed_projects.add(project_name)
                            else:
                                failed_count += 1
                        except Exception as e:
                            logger.error(f"Run {record_id} raised exception: {str(e)}")
                            failed_count += 1

                # Batch push after each batch completes
                if batch_push:
                    self._stage_batch_git_push()

                logger.info(
                    f"Batch complete: {len(batch)} runs processed, "
                    f"{len(completed_projects)} projects so far"
                )

        logger.info(
            f"Orchestration complete: {run_count} executed, "
            f"{failed_count} failed, {len(completed_projects)} projects processed"
        )


@click.group()
def cli():
    """Experiment orchestration CLI."""
    pass


@cli.command()
@click.option("--max-runs", type=int, default=None, help="Limit number of runs")
@click.option("--max-projects", type=int, default=None, help="Limit number of unique projects to process")
@click.option("--concurrency", "-c", type=int, default=1, help="Number of concurrent workers (default: 1 = sequential)")
@click.option("--stream", "-s", is_flag=True, help="Stream Claude API responses in real-time")
@click.option("--validate", is_flag=True, help="Run validation before starting")
def run(max_runs: Optional[int], max_projects: Optional[int], concurrency: int, stream: bool, validate: bool) -> None:
    """Run the experiment orchestration."""
    setup_logging()

    if validate:
        print(get_validation_report())
        valid, _ = run_all_validations()
        if not valid:
            logger.error("Validation failed. Aborting.")
            sys.exit(1)

    try:
        orchestrator = ExperimentOrchestrator()
        if stream:
            orchestrator.claude_caller.stream = True
        orchestrator.run_all_experiments(
            max_runs=max_runs,
            max_projects=max_projects,
            concurrency=concurrency,
        )
    except Exception as e:
        logger.error(f"Orchestration failed: {e}")
        sys.exit(1)


@cli.command()
def validate() -> None:
    """Run validation checks."""
    setup_logging()
    print(get_validation_report())


if __name__ == "__main__":
    cli()
