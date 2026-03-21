"""
Main experiment orchestration engine for the dissertation research.

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
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime
import pandas as pd
import click

# Local imports
from utils.config import (
    CSV_INPUT_FILE,
    SOURCE_CODE_DIR,
    EXECUTION_STAGES,
    SONARCLOUD_COMPONENT_TEMPLATE,
)
from utils.logger_config import setup_logging, get_logger
from orchestration.state_manager import StateManager, ExperimentRun
from orchestration.experiment_repo_manager import ExperimentRepoManager
from api.claude_caller import ClaudeCaller
from api.sonarcloud_poller import SonarCloudPoller
from utils.validation import run_all_validations, get_validation_report

logger = get_logger("orchestrator")


class ExperimentOrchestrator:
    """Main orchestration engine for dissertation experiments."""

    def __init__(self):
        """Initialize the orchestrator."""
        self.state_manager = StateManager()
        self.repo_manager = ExperimentRepoManager()
        self.claude_caller = ClaudeCaller()
        self.sonar_poller = SonarCloudPoller()
        self.csv_df = None
        self._load_csv()

    def _load_csv(self) -> None:
        """Load the CSV data."""
        try:
            self.csv_df = pd.read_csv(CSV_INPUT_FILE, dtype={"record_id": str})
            logger.info(f"Loaded CSV: {len(self.csv_df)} records")
        except Exception as e:
            logger.error(f"Failed to load CSV: {e}")
            raise

    def initialize_state_from_csv(self) -> None:
        """Initialize state file from CSV if not already done."""
        # Check if runs have already been added (not just if total_runs is set)
        existing_runs = self.state_manager._state.get("runs", {})

        if len(existing_runs) > 0:
            logger.info(f"State already initialized with {len(existing_runs)} runs")
            return

        logger.info("Initializing state from CSV...")

        for idx, row in self.csv_df.iterrows():
            run = ExperimentRun(
                record_id=str(row["record_id"]),
                file_id=int(row["project_id"]),  # Use project_id as file_id
                project_name=str(row["project_name"]),
                file_name=str(row["file_name"]),
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

        # Files are named file_XXXX_originalname.ext, search for matching file
        file_name = csv_row["file_name"]
        matching_files = list(SOURCE_CODE_DIR.glob(f"*{file_name}"))

        if not matching_files:
            raise FileNotFoundError(f"Source file not found for: {file_name} in {SOURCE_CODE_DIR}")

        source_file = matching_files[0]  # Use first match

        original_code = source_file.read_text(encoding="utf-8")

        # Build prompt from CSV
        prompt = self._build_prompt(run, csv_row, original_code)

        logger.debug(f"Calling Claude API for {run.record_id}")

        # Call Claude
        response = self.claude_caller.call(
            prompt=prompt,
            system_prompt=self._get_system_prompt(run.condition),
            max_tokens=4096,
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

        # Ensure repo is initialized
        self.repo_manager.ensure_repo_exists()
        self.repo_manager.configure_author()

        # Write code file
        csv_row = self.csv_df[self.csv_df["record_id"] == run.record_id].iloc[0]

        # Find the file matching the file_name from CSV
        file_name = csv_row["file_name"]
        matching_files = list(SOURCE_CODE_DIR.glob(f"*{file_name}"))
        if not matching_files:
            raise FileNotFoundError(f"Source file not found for: {file_name}")
        source_file = matching_files[0]
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
            timestamp=datetime.utcnow().isoformat() + "Z",
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

        try:
            self.repo_manager.push_to_remote()
            logger.info(f"Git push succeeded for {record_id}")
        except Exception as e:
            logger.warning(f"Git push failed for {record_id}: {str(e)}")
            # Continue anyway; SonarCloud may still analyze

    def _stage_sonar_queue_check(self, record_id: str, run: ExperimentRun) -> None:
        """
        Stage 5: Verify SonarCloud received the code.

        Args:
            record_id: Run ID
            run: Experiment run
        """
        self.state_manager.update_run_status(record_id, "IN_PROGRESS", "SONAR_QUEUE_CHECK")

        # Generate component key
        component_key = self.sonar_poller._SonarCloudPoller__sonar_component_key(
            run.condition, run.file_id, run.run_number
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

        # Add metadata
        self.csv_df.loc[csv_idx, "git_commit_hash"] = run.git_commit_hash
        self.csv_df.loc[csv_idx, "sonar_component_key"] = run.sonar_component_key

        # Save CSV
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

    def run_all_experiments(self, max_runs: Optional[int] = None, max_projects: Optional[int] = None) -> None:
        """
        Run all pending experiments.

        Args:
            max_runs: Optional limit on number of runs to execute
            max_projects: Optional limit on number of unique projects to process
        """
        logger.info("Starting experiment orchestration...")

        # Initialize state from CSV if needed
        self.initialize_state_from_csv()

        run_count = 0
        failed_count = 0
        completed_projects = set()

        while True:
            stats = self.state_manager.get_statistics()
            logger.info(
                f"Progress: {stats['completed']}/{stats['total_runs']} "
                f"completed, {stats['failed']} failed"
            )

            if max_runs and run_count >= max_runs:
                logger.info(f"Reached max runs limit: {max_runs}")
                break

            # Check project limit
            if max_projects and len(completed_projects) >= max_projects:
                logger.info(f"Reached max projects limit: {max_projects} projects processed")
                break

            # Check for pause
            if stats["status"] == "PAUSED":
                logger.info("Experiment paused")
                time.sleep(5)
                continue

            # Execute next run
            project_name = self.run_next_experiment()
            if project_name:
                run_count += 1
                completed_projects.add(project_name)
                logger.info(f"Completed projects so far: {len(completed_projects)}: {completed_projects}")
            else:
                # No more pending runs
                break

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
@click.option("--validate", is_flag=True, help="Run validation before starting")
def run(max_runs: Optional[int], max_projects: Optional[int], validate: bool) -> None:
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
        orchestrator.run_all_experiments(max_runs=max_runs, max_projects=max_projects)
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
