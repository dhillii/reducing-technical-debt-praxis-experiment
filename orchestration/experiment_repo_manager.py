"""
Git operations manager for the experiment repository.

Handles commits with structured metadata, pushes, and repository management.
"""

import os
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime
from git import Repo, GitCommandError, Actor
from utils.config import (
    EXPERIMENT_REPO_PATH,
    EXPERIMENT_REPO_REMOTE_URL,
    GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL,
    SONARCLOUD_COMPONENT_TEMPLATE,
    GIT_COMMIT_TIMEOUT,
    GIT_PUSH_TIMEOUT,
)
from utils.logger_config import get_logger

logger = get_logger("experiment_repo_manager")


class ExperimentRepoManager:
    """Manages git operations for the experiment repository."""

    def __init__(self, repo_path: Optional[str] = None):
        """
        Initialize repository manager.

        Args:
            repo_path: Path to git repository (defaults to EXPERIMENT_REPO_PATH)
        """
        self.repo_path = Path(repo_path or EXPERIMENT_REPO_PATH)

        # Initialize or open repository
        if self.repo_path.exists():
            try:
                self.repo = Repo(self.repo_path)
                logger.info(f"Opened existing repository: {self.repo_path}")
            except Exception as e:
                logger.error(f"Failed to open repository: {e}")
                raise
        else:
            logger.info(f"Repository path does not exist yet: {self.repo_path}")
            self.repo = None

    def ensure_repo_exists(self) -> None:
        """Ensure the repository exists. Initialize if needed."""
        if self.repo is not None:
            return

        self.repo_path.mkdir(parents=True, exist_ok=True)
        self.repo = Repo.init(self.repo_path)
        logger.info(f"Initialized new repository: {self.repo_path}")

        # Add remote origin if configured and not already present
        if EXPERIMENT_REPO_REMOTE_URL:
            try:
                self.repo.create_remote("origin", EXPERIMENT_REPO_REMOTE_URL)
                logger.info(f"Added remote origin: {EXPERIMENT_REPO_REMOTE_URL}")
            except GitCommandError as e:
                logger.warning(f"Failed to add remote origin: {e}")

    def configure_author(
        self,
        author_name: str = GIT_AUTHOR_NAME,
        author_email: str = GIT_AUTHOR_EMAIL,
    ) -> None:
        """
        Configure git author for commits.

        Args:
            author_name: Author name
            author_email: Author email
        """
        if not self.repo:
            raise ValueError("Repository not initialized")

        with self.repo.config_writer() as git_config:
            git_config.set_value("user", "name", author_name)
            git_config.set_value("user", "email", author_email)

        logger.info(f"Configured author: {author_name} <{author_email}>")

    def write_code_file(
        self,
        condition: str,
        file_id: int,
        run_number: int,
        code: str,
    ) -> Path:
        """
        Write refactored code to file in the repository.

        File structure: conditions/{condition}/file_{file_id:04d}/run_{run_number}.js

        Args:
            condition: Refactoring condition (baseline, nfr_generic, adaptive_nfr)
            file_id: File ID
            run_number: Run number (1, 2, or 3)
            code: Refactored code content

        Returns:
            Path to written file
        """
        if not self.repo:
            raise ValueError("Repository not initialized")

        # Create directory structure
        file_dir = self.repo_path / "conditions" / condition / f"file_{file_id:04d}"
        file_dir.mkdir(parents=True, exist_ok=True)

        # Write code file
        file_path = file_dir / f"run_{run_number}.js"
        file_path.write_text(code, encoding="utf-8")

        logger.debug(f"Code written to {file_path}")
        return file_path

    def generate_sonar_component_key(
        self,
        condition: str,
        file_id: int,
        run_number: int,
    ) -> str:
        """
        Generate SonarCloud component key for a run.

        Format: praxis-experiments:conditions/{condition}/file_{file_id:04d}/run_{run_number}

        Args:
            condition: Refactoring condition
            file_id: File ID
            run_number: Run number

        Returns:
            SonarCloud component key
        """
        return SONARCLOUD_COMPONENT_TEMPLATE.format(
            condition=condition,
            file_id=file_id,
            run_number=run_number,
        )

    def create_commit(
        self,
        record_id: int,
        file_id: int,
        project_name: str,
        file_name: str,
        condition: str,
        run_number: int,
        llm_model: str,
        llm_temperature: float,
        prompt_tokens: int,
        completion_tokens: int,
        total_tokens: int,
        timestamp: str,
        pre_cc: Optional[int] = None,
        expected_post_cc: Optional[int] = None,
    ) -> str:
        """
        Create an atomic git commit with structured metadata.

        Args:
            record_id: Unique record ID
            file_id: File ID
            project_name: Project name
            file_name: File name
            condition: Refactoring condition
            run_number: Run number
            llm_model: LLM model used
            llm_temperature: Temperature parameter
            prompt_tokens: Input tokens
            completion_tokens: Output tokens
            total_tokens: Total tokens
            timestamp: ISO timestamp
            pre_cc: Pre-refactoring cyclomatic complexity
            expected_post_cc: Expected post-refactoring CC

        Returns:
            Commit hash
        """
        if not self.repo:
            raise ValueError("Repository not initialized")

        # Build commit message with metadata
        file_id_padded = f"{file_id:04d}"

        commit_message = (
            f"File {file_id_padded} | {project_name} | {condition} | Run {run_number}\n\n"
            f"Commit metadata (YAML-style header):\n"
            f"---\n"
            f"record_id: {record_id}\n"
            f"file_id: {file_id}\n"
            f"project_name: {project_name}\n"
            f"file_name: {file_name}\n"
            f"condition: {condition}\n"
            f"run_number: {run_number}\n"
            f"llm_model: {llm_model}\n"
            f"llm_temperature: {llm_temperature}\n"
            f"prompt_tokens: {prompt_tokens}\n"
            f"completion_tokens: {completion_tokens}\n"
            f"total_tokens: {total_tokens}\n"
            f"timestamp: {timestamp}\n"
            f"---\n\n"
            f"Refactored code for {file_name} addressing SonarCloud issues.\n"
        )

        if pre_cc is not None:
            commit_message += f"Pre-refactoring CC: {pre_cc}\n"
        if expected_post_cc is not None:
            commit_message += f"Expected post-refactoring CC: {expected_post_cc}\n"

        commit_message += f"\n" \
                         f"Code path: conditions/{condition}/file_{file_id_padded}/run_{run_number}.js\n"

        try:
            # Stage all changes
            self.repo.git.add(A=True)

            # Create commit
            author = Actor(GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL)
            commit = self.repo.index.commit(
                commit_message,
                author=author,
                committer=author,
            )

            logger.info(f"Created commit {commit.hexsha[:8]} for record {record_id}")
            return commit.hexsha

        except GitCommandError as e:
            logger.error(f"Failed to create commit: {str(e)}")
            raise

    def push_to_remote(self, remote_name: str = "origin") -> bool:
        """
        Push commits to remote repository.

        Args:
            remote_name: Remote name (default: origin)

        Returns:
            True if push succeeded
        """
        if not self.repo:
            raise ValueError("Repository not initialized")

        try:
            remote = self.repo.remote(remote_name)
            logger.info(f"Pushing to {remote_name}...")
            remote.push()
            logger.info(f"Push to {remote_name} succeeded")
            return True

        except GitCommandError as e:
            logger.error(f"Push failed: {str(e)}")
            raise

    def get_latest_commit_hash(self) -> str:
        """Get the hash of the latest commit."""
        if not self.repo:
            raise ValueError("Repository not initialized")

        if len(self.repo.heads) == 0:
            raise ValueError("No commits in repository yet")

        return self.repo.head.commit.hexsha

    def get_commit_message(self, commit_hash: str) -> str:
        """Get the message for a specific commit."""
        if not self.repo:
            raise ValueError("Repository not initialized")

        commit = self.repo.commit(commit_hash)
        return commit.message

    def get_commit_count(self) -> int:
        """Get total number of commits in the repository."""
        if not self.repo:
            return 0

        try:
            return self.repo.git.rev_list("--count", "HEAD")
        except GitCommandError:
            return 0

    def validate_code_file(self, file_path: Path) -> bool:
        """
        Validate that a code file exists and is readable.

        Args:
            file_path: Path to code file

        Returns:
            True if file is valid
        """
        if not file_path.exists():
            logger.warning(f"Code file does not exist: {file_path}")
            return False

        if not file_path.is_file():
            logger.warning(f"Code path is not a file: {file_path}")
            return False

        try:
            file_path.read_text(encoding="utf-8")
            return True
        except Exception as e:
            logger.warning(f"Failed to read code file: {e}")
            return False

    def get_repository_status(self) -> Dict[str, Any]:
        """Get status information about the repository."""
        if not self.repo:
            return {"status": "not_initialized"}

        try:
            return {
                "status": "ok",
                "path": str(self.repo_path),
                "commit_count": self.get_commit_count(),
                "current_branch": self.repo.active_branch.name,
                "is_dirty": self.repo.is_dirty(),
            }
        except Exception as e:
            logger.error(f"Failed to get repository status: {e}")
            return {"status": "error", "error": str(e)}


if __name__ == "__main__":
    from logger_config import setup_logging
    setup_logging()

    # Test repository manager
    try:
        manager = ExperimentRepoManager()
        print(f"Repository status: {manager.get_repository_status()}")
    except Exception as e:
        print(f"Error: {e}")
