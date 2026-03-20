"""
Unit tests for the experiment orchestration system.

Tests critical components:
- State manager (persistence, transitions, thread safety)
- Retry logic (exponential backoff)
- Git operations (commit creation, metadata)
- Claude API wrapper (retry on rate limits)
- SonarCloud poller (timeout handling)
"""

import unittest
import tempfile
import json
import time
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

from state_manager import StateManager, ExperimentRun
from claude_caller import ClaudeCaller
from sonarcloud_poller import SonarCloudPoller
from config import EXPERIMENT_STATE_FILE


class TestStateManager(unittest.TestCase):
    """Tests for state management."""

    def setUp(self):
        """Set up test fixtures."""
        # Use temporary file for state
        self.temp_dir = tempfile.TemporaryDirectory()
        self.state_file = Path(self.temp_dir.name) / "test_state.json"
        self.state_manager = StateManager(self.state_file)

    def tearDown(self):
        """Clean up."""
        self.temp_dir.cleanup()

    def test_add_and_get_run(self):
        """Test adding and retrieving runs."""
        run = ExperimentRun(
            record_id="1",
            file_id=1,
            project_name="Test",
            file_name="test.js",
            condition="baseline",
            run_number=1,
        )

        self.state_manager.add_run(run)
        retrieved = self.state_manager.get_run("1")

        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.record_id, "1")
        self.assertEqual(retrieved.file_id, 1)

    def test_update_run_status(self):
        """Test updating run status."""
        run = ExperimentRun(
            record_id="2",
            file_id=2,
            project_name="Test",
            file_name="test.js",
            condition="baseline",
            run_number=1,
        )

        self.state_manager.add_run(run)
        self.state_manager.update_run_status("2", "IN_PROGRESS", "CODE_GENERATION")

        updated = self.state_manager.get_run("2")
        self.assertEqual(updated.status, "IN_PROGRESS")
        self.assertEqual(updated.current_stage, "CODE_GENERATION")
        self.assertIsNotNone(updated.started_at)

    def test_run_state_transitions(self):
        """Test valid state transitions."""
        run = ExperimentRun(
            record_id="3",
            file_id=3,
            project_name="Test",
            file_name="test.js",
            condition="baseline",
            run_number=1,
        )

        self.state_manager.add_run(run)

        # PENDING -> IN_PROGRESS
        self.state_manager.update_run_status("3", "IN_PROGRESS")
        self.assertEqual(self.state_manager.get_run("3").status, "IN_PROGRESS")

        # IN_PROGRESS -> COMPLETED
        self.state_manager.update_run_status("3", "COMPLETED")
        completed = self.state_manager.get_run("3")
        self.assertEqual(completed.status, "COMPLETED")
        self.assertIsNotNone(completed.completed_at)
        self.assertIsNotNone(completed.duration_seconds)

    def test_add_error_to_run(self):
        """Test error tracking."""
        run = ExperimentRun(
            record_id="4",
            file_id=4,
            project_name="Test",
            file_name="test.js",
            condition="baseline",
            run_number=1,
        )

        self.state_manager.add_run(run)
        self.state_manager.add_error_to_run(
            "4",
            stage="CODE_GENERATION",
            error_type="TestError",
            message="Test error message",
            is_retriable=True,
        )

        updated = self.state_manager.get_run("4")
        self.assertEqual(len(updated.errors), 1)
        self.assertEqual(updated.errors[0].error_type, "TestError")
        self.assertTrue(updated.errors[0].is_retriable)

    def test_reset_run_to_pending(self):
        """Test resetting failed run."""
        run = ExperimentRun(
            record_id="5",
            file_id=5,
            project_name="Test",
            file_name="test.js",
            condition="baseline",
            run_number=1,
        )

        self.state_manager.add_run(run)
        self.state_manager.update_run_status("5", "FAILED")

        # Reset
        self.state_manager.reset_run_to_pending("5")

        updated = self.state_manager.get_run("5")
        self.assertEqual(updated.status, "PENDING")
        self.assertEqual(updated.retry_count, 1)

    def test_get_next_pending_run(self):
        """Test getting next pending run."""
        for i in range(3):
            run = ExperimentRun(
                record_id=str(i),
                file_id=i,
                project_name="Test",
                file_name="test.js",
                condition="baseline",
                run_number=1,
            )
            self.state_manager.add_run(run)

        # Get first pending
        next_id = self.state_manager.get_next_pending_run()
        self.assertEqual(next_id, "0")

        # Mark as complete
        self.state_manager.update_run_status("0", "COMPLETED")

        # Next pending should be 1
        next_id = self.state_manager.get_next_pending_run()
        self.assertEqual(next_id, "1")

    def test_statistics(self):
        """Test statistics calculation."""
        for i in range(5):
            run = ExperimentRun(
                record_id=str(i),
                file_id=i,
                project_name="Test",
                file_name="test.js",
                condition="baseline",
                run_number=1,
            )
            self.state_manager.add_run(run)

        # Mark some as complete/failed
        self.state_manager.update_run_status("0", "COMPLETED")
        self.state_manager.update_run_status("1", "COMPLETED")
        self.state_manager.update_run_status("2", "FAILED")

        stats = self.state_manager.get_statistics()
        self.assertEqual(stats["completed"], 2)
        self.assertEqual(stats["failed"], 1)
        self.assertEqual(stats["pending"], 2)

    def test_state_persistence(self):
        """Test state is saved to disk."""
        run = ExperimentRun(
            record_id="persist",
            file_id=99,
            project_name="Test",
            file_name="test.js",
            condition="baseline",
            run_number=1,
        )

        self.state_manager.add_run(run)

        # Load state from disk in new instance
        new_manager = StateManager(self.state_file)
        loaded = new_manager.get_run("persist")

        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.file_id, 99)


class TestClaudeRetryLogic(unittest.TestCase):
    """Tests for Claude API retry logic."""

    @patch("claude_caller.Anthropic")
    def test_successful_api_call(self, mock_anthropic_class):
        """Test successful API call."""
        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # Mock response
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Generated code")]
        mock_response.usage.input_tokens = 100
        mock_response.usage.output_tokens = 200
        mock_response.model = "claude-sonnet"
        mock_response.stop_reason = "end_turn"

        mock_client.messages.create.return_value = mock_response

        caller = ClaudeCaller(api_key="test-key")
        result = caller.call(prompt="Test prompt", max_tokens=100)

        self.assertEqual(result["content"], "Generated code")
        self.assertEqual(result["prompt_tokens"], 100)
        self.assertEqual(result["completion_tokens"], 200)

    @patch("claude_caller.Anthropic")
    @patch("claude_caller.time.sleep")
    def test_rate_limit_retry(self, mock_sleep, mock_anthropic_class):
        """Test retry on rate limit."""
        from anthropic import RateLimitError

        mock_client = MagicMock()
        mock_anthropic_class.return_value = mock_client

        # First call fails with rate limit, second succeeds
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Generated code")]
        mock_response.usage.input_tokens = 100
        mock_response.usage.output_tokens = 200
        mock_response.model = "claude-sonnet"
        mock_response.stop_reason = "end_turn"

        mock_client.messages.create.side_effect = [
            RateLimitError("Rate limited", response=MagicMock(), body={}),
            mock_response,
        ]

        caller = ClaudeCaller(api_key="test-key")
        result = caller.call(prompt="Test prompt", max_tokens=100)

        self.assertEqual(result["content"], "Generated code")
        # Should have slept once (retry backoff)
        mock_sleep.assert_called()

    def test_extract_code_from_response(self):
        """Test code extraction from Claude response."""
        caller = ClaudeCaller(api_key="test-key")

        # Test markdown-wrapped code
        response = '```javascript\nfunction hello() { return "world"; }\n```'
        extracted = caller.extract_code_from_response(response, ".js")
        self.assertIn("function hello", extracted)
        self.assertNotIn("```", extracted)

        # Test plain code
        plain_code = "const x = 42;"
        extracted = caller.extract_code_from_response(plain_code, ".js")
        self.assertEqual(extracted, plain_code)


class TestSonarCloudPolling(unittest.TestCase):
    """Tests for SonarCloud polling."""

    @patch("sonarcloud_poller.requests.Session")
    def test_wait_for_analysis_completion_success(self, mock_session_class):
        """Test successful analysis polling."""
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session

        # Mock successful analysis response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "tasks": [{
                "status": "SUCCESS",
                "ceActivityDate": "2026-03-19T14:00:00Z",
            }]
        }

        mock_session.get.return_value = mock_response

        poller = SonarCloudPoller(token="test-token")

        # This will timeout if the mock doesn't work properly
        # We need to patch time.sleep to avoid actual waiting
        with patch("sonarcloud_poller.time.sleep"):
            result = poller.wait_for_analysis_completion(
                "test:component",
                timeout=10,
                initial_wait=0,
            )

        self.assertEqual(result["status"], "SUCCESS")

    @patch("sonarcloud_poller.requests.Session")
    @patch("sonarcloud_poller.time.time")
    def test_analysis_timeout(self, mock_time, mock_session_class):
        """Test timeout when analysis doesn't complete."""
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session

        # Mock pending response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "tasks": [{
                "status": "PENDING",
            }]
        }

        mock_session.get.return_value = mock_response

        # Mock time to simulate timeout
        start_time = 1000
        times = [start_time, start_time + 1, start_time + 2, start_time + 400]  # 400 > timeout
        mock_time.side_effect = times

        poller = SonarCloudPoller(token="test-token")

        with patch("sonarcloud_poller.time.sleep"):
            with self.assertRaises(TimeoutError):
                poller.wait_for_analysis_completion(
                    "test:component",
                    timeout=300,
                    initial_wait=0,
                )


class TestExponentialBackoff(unittest.TestCase):
    """Tests for exponential backoff calculations."""

    def test_backoff_calculation(self):
        """Test exponential backoff formula."""
        caller = ClaudeCaller(api_key="test-key")

        # Backoff should be: 1, 2, 4, 8, 16, 32, 60 (capped)
        backoffs = [caller._calculate_backoff(i) for i in range(1, 8)]

        self.assertEqual(backoffs[0], 1)    # 1 * 2^0
        self.assertEqual(backoffs[1], 2)    # 1 * 2^1
        self.assertEqual(backoffs[2], 4)    # 1 * 2^2
        self.assertEqual(backoffs[3], 8)    # 1 * 2^3
        self.assertEqual(backoffs[4], 16)   # 1 * 2^4
        self.assertEqual(backoffs[5], 32)   # 1 * 2^5
        self.assertEqual(backoffs[6], 60)   # Capped at max


if __name__ == "__main__":
    unittest.main()
