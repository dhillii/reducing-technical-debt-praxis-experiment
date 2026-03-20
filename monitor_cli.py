"""
Interactive monitoring CLI for the experiment orchestration system.

Provides real-time dashboard, status monitoring, and control commands:
- pause/resume experiment
- retry failed runs
- view logs
- export state
"""

import sys
import time
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.progress import Progress, BarColumn, PercentCompleteColumn
from state_manager import StateManager
from logger_config import setup_logging, get_logger
from config import MAIN_LOG_FILE, ERROR_LOG_FILE, DEBUG_LOG_FILE

logger = get_logger("monitor_cli")
console = Console()


class MonitorCLI:
    """Interactive monitoring interface for experiments."""

    def __init__(self):
        """Initialize monitor."""
        self.state_manager = StateManager()

    def display_dashboard(self, refresh_interval: int = 2) -> None:
        """
        Display real-time monitoring dashboard.

        Args:
            refresh_interval: Seconds between refreshes
        """
        while True:
            console.clear()
            self._draw_dashboard()
            time.sleep(refresh_interval)

    def _draw_dashboard(self) -> None:
        """Draw the monitoring dashboard."""
        stats = self.state_manager.get_statistics()

        # Title
        console.print(
            "[bold cyan]DISSERTATION EXPERIMENT ORCHESTRATION MONITOR[/bold cyan]",
            justify="center",
        )

        # Status line
        status_color = "green" if stats["status"] == "RUNNING" else "yellow"
        console.print(
            f"Status: [{status_color}]{stats['status']}[/{status_color}] | "
            f"Started: {stats['start_time'][:10]}",
            justify="center",
        )

        console.print()

        # Progress bar
        total = stats["total_runs"]
        completed = stats["completed"]
        percent = (completed / total * 100) if total > 0 else 0

        progress_table = Table.grid(padding=(0, 2))
        progress_bar = (
            f"[{'=' * int(percent / 5):<20}] {percent:.1f}%"
        )
        progress_table.add_row("Progress:", progress_bar)
        progress_table.add_row("", f"{completed:,} / {total:,} completed")
        console.print(progress_table)

        console.print()

        # Status breakdown
        breakdown_table = Table(title="Status Breakdown", show_header=False)
        breakdown_table.add_row(f"✓ COMPLETED: {stats['completed']:>6}")
        breakdown_table.add_row(f"✗ FAILED:     {stats['failed']:>6}")
        breakdown_table.add_row(f"⧖ IN_PROGRESS: {stats['in_progress']:>6}")
        breakdown_table.add_row(f"⋯ PENDING:    {stats['pending']:>6}")
        console.print(breakdown_table)

        console.print()

        # Recent activity
        failed_runs = self.state_manager.get_failed_runs()
        if failed_runs:
            console.print(f"[yellow]⚠ {len(failed_runs)} failed runs - use 'retry' to rerun[/yellow]")

        console.print()
        console.print("[dim]Commands: status | pause | resume | retry | logs | export[/dim]")

    def display_status(self, summary: bool = False, failed_only: bool = False,
                      file_id: Optional[int] = None) -> None:
        """
        Display status information.

        Args:
            summary: Show brief summary only
            failed_only: Show only failed runs
            file_id: Filter by file ID
        """
        stats = self.state_manager.get_statistics()

        if summary:
            percent = (stats["completed"] / stats["total_runs"] * 100) if stats["total_runs"] > 0 else 0
            console.print(
                f"Progress: {percent:.1f}% ({stats['completed']}/{stats['total_runs']} completed, "
                f"{stats['failed']} failed)"
            )
            return

        if failed_only:
            failed = self.state_manager.get_failed_runs()
            if not failed:
                console.print("No failed runs")
                return

            table = Table(title="Failed Runs", show_header=True)
            table.add_column("Record ID")
            table.add_column("File ID")
            table.add_column("Condition")
            table.add_column("Stage")
            table.add_column("Error Type")

            for record_id in failed[:20]:
                run = self.state_manager.get_run(record_id)
                if run:
                    error_type = run.errors[-1].error_type if run.errors else "Unknown"
                    table.add_row(
                        record_id,
                        str(run.file_id),
                        run.condition,
                        run.failure_stage or "Unknown",
                        error_type,
                    )

            console.print(table)
            return

        # Full status
        self._draw_dashboard()

    def pause_experiment(self, immediate: bool = False) -> None:
        """Pause experiment."""
        self.state_manager.pause_experiment()
        console.print("[yellow]Experiment paused[/yellow]")
        logger.info("Experiment paused via CLI")

    def resume_experiment(self) -> None:
        """Resume experiment."""
        self.state_manager.resume_experiment()
        console.print("[green]Experiment resumed[/green]")
        logger.info("Experiment resumed via CLI")

    def retry_failed_runs(self, record_id: Optional[str] = None,
                         file_id: Optional[int] = None,
                         condition: Optional[str] = None,
                         stage: Optional[str] = None) -> None:
        """
        Retry failed runs.

        Args:
            record_id: Specific record to retry
            file_id: Retry all failed runs for a file
            condition: Retry all failed runs for a condition
            stage: Retry all runs stuck at a stage
        """
        retried = 0

        if record_id:
            run = self.state_manager.get_run(record_id)
            if run and run.status == "FAILED":
                self.state_manager.reset_run_to_pending(record_id)
                retried = 1
                console.print(f"[green]Retried record {record_id}[/green]")

        elif file_id:
            failed = self.state_manager.get_runs_by_file_id(file_id, status="FAILED")
            for rid in failed:
                self.state_manager.reset_run_to_pending(rid)
                retried += 1
            console.print(f"[green]Retried {retried} runs for file {file_id}[/green]")

        elif condition:
            failed = self.state_manager.get_runs_by_condition(condition, status="FAILED")
            for rid in failed:
                self.state_manager.reset_run_to_pending(rid)
                retried += 1
            console.print(f"[green]Retried {retried} runs for condition {condition}[/green]")

        elif stage:
            # Retry runs that failed at a specific stage
            failed = self.state_manager.get_failed_runs()
            for rid in failed:
                run = self.state_manager.get_run(rid)
                if run and run.failure_stage == stage:
                    self.state_manager.reset_run_to_pending(rid)
                    retried += 1
            console.print(f"[green]Retried {retried} runs stuck at {stage}[/green]")

        if retried == 0:
            console.print("[yellow]No runs to retry[/yellow]")

        logger.info(f"Retried {retried} runs via CLI")

    def show_logs(self, tail: int = 50, file_id: Optional[int] = None,
                 errors_only: bool = False) -> None:
        """
        Show log entries.

        Args:
            tail: Number of lines to show
            file_id: Filter by file ID
            errors_only: Show only error logs
        """
        if errors_only:
            log_file = ERROR_LOG_FILE
        else:
            log_file = MAIN_LOG_FILE

        if not log_file.exists():
            console.print(f"[yellow]Log file not found: {log_file}[/yellow]")
            return

        try:
            with open(log_file, "r") as f:
                lines = f.readlines()

            # Get last N lines
            lines = lines[-tail:] if len(lines) > tail else lines

            # Filter by file_id if specified
            if file_id:
                lines = [
                    line for line in lines
                    if f"File {file_id}" in line or f"file_id: {file_id}" in line
                ]

            console.print("\n".join(lines))

        except Exception as e:
            console.print(f"[red]Error reading logs: {e}[/red]")

    def export_state(self, format: str = "json") -> None:
        """
        Export state for analysis.

        Args:
            format: Export format (json or csv)
        """
        if format == "json":
            summary = self.state_manager.get_state_summary()
            console.print_json(json.dumps(summary, indent=2, default=str))

        elif format == "csv":
            import csv as csv_module

            failed = self.state_manager.get_failed_runs()
            console.print("Record ID, File ID, Condition, Status, Stage, Error")

            for record_id in failed:
                run = self.state_manager.get_run(record_id)
                if run:
                    error = run.errors[-1].error_type if run.errors else ""
                    console.print(
                        f"{record_id}, {run.file_id}, {run.condition}, "
                        f"{run.status}, {run.failure_stage or ''}, {error}"
                    )

        logger.info(f"Exported state in {format} format")


@click.group()
def cli():
    """Monitor and control experiment orchestration."""
    pass


@cli.command()
@click.option("--refresh", type=int, default=2, help="Refresh interval in seconds")
def monitor(refresh: int) -> None:
    """Display real-time monitoring dashboard."""
    setup_logging()
    try:
        cli_monitor = MonitorCLI()
        cli_monitor.display_dashboard(refresh_interval=refresh)
    except KeyboardInterrupt:
        console.print("\n[yellow]Monitor stopped[/yellow]")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


@cli.command()
@click.option("--summary", is_flag=True, help="Show brief summary")
@click.option("--failed", is_flag=True, help="Show only failed runs")
@click.option("--file-id", type=int, help="Filter by file ID")
def status(summary: bool, failed: bool, file_id: Optional[int]) -> None:
    """Show experiment status."""
    setup_logging()
    try:
        cli_monitor = MonitorCLI()
        cli_monitor.display_status(summary=summary, failed_only=failed, file_id=file_id)
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


@cli.command()
@click.option("--immediate", is_flag=True, help="Pause immediately")
def pause(immediate: bool) -> None:
    """Pause experiment orchestration."""
    setup_logging()
    try:
        cli_monitor = MonitorCLI()
        cli_monitor.pause_experiment(immediate=immediate)
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


@cli.command()
def resume() -> None:
    """Resume experiment orchestration."""
    setup_logging()
    try:
        cli_monitor = MonitorCLI()
        cli_monitor.resume_experiment()
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


@cli.command()
@click.option("--record-id", help="Retry specific record")
@click.option("--file-id", type=int, help="Retry all failed runs for file")
@click.option("--condition", help="Retry all failed runs for condition")
@click.option("--stage", help="Retry runs stuck at stage")
def retry(record_id: Optional[str], file_id: Optional[int],
         condition: Optional[str], stage: Optional[str]) -> None:
    """Retry failed runs."""
    setup_logging()
    try:
        cli_monitor = MonitorCLI()
        cli_monitor.retry_failed_runs(
            record_id=record_id,
            file_id=file_id,
            condition=condition,
            stage=stage,
        )
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


@cli.command()
@click.option("--tail", type=int, default=50, help="Number of lines to show")
@click.option("--file-id", type=int, help="Filter by file ID")
@click.option("--errors", is_flag=True, help="Show error logs only")
def logs(tail: int, file_id: Optional[int], errors: bool) -> None:
    """View logs."""
    setup_logging()
    try:
        cli_monitor = MonitorCLI()
        cli_monitor.show_logs(tail=tail, file_id=file_id, errors_only=errors)
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


@cli.command()
@click.option("--format", type=click.Choice(["json", "csv"]), default="json")
def export(format: str) -> None:
    """Export state for analysis."""
    setup_logging()
    try:
        cli_monitor = MonitorCLI()
        cli_monitor.export_state(format=format)
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")
        sys.exit(1)


if __name__ == "__main__":
    cli()
