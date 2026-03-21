"""
Praxis Experiment Orchestration System

A production-grade framework for executing, monitoring, and analyzing
1,314 LLM-based code refactoring experiments across multiple conditions.

Main modules:
- orchestrate_experiments: Main execution engine
- state_manager: Persistent state handling
- monitor_cli: Interactive monitoring dashboard
- experiment_repo_manager: Git operations
- claude_caller: Claude API wrapper
- sonarcloud_poller: SonarCloud metrics extraction
- logger_config: Logging configuration
- validation: Pre-execution validation
- config: Constants and configuration
- daemon_manager: Background process management

Usage:
    python orchestrate_experiments.py run --max-runs 10
    python monitor_cli.py monitor
    python daemon_manager.py start
"""

__version__ = "1.0.0"
__author__ = "David Hill, Jr. (david.hill@xeviosoft.com)"
