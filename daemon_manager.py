"""
Daemon management for running orchestration in the background.

Provides start/stop/status/logs commands for daemon process management.
Uses subprocess to manage orchestration as a background process.
"""

import os
import sys
import signal
import subprocess
import time
from pathlib import Path
from typing import Optional, Tuple
import click
from rich.console import Console

from config import EXPERIMENT_REPO_PATH, PROJECT_ROOT
from logger_config import get_logger

logger = get_logger("daemon_manager")
console = Console()


class DaemonManager:
    """Manages orchestration daemon process."""

    # Daemon state file
    DAEMON_PID_FILE = Path(PROJECT_ROOT) / ".daemon_pid"
    DAEMON_LOG_FILE = Path(PROJECT_ROOT) / "daemon.log"

    @classmethod
    def start(cls, max_runs: Optional[int] = None) -> None:
        """
        Start orchestration daemon.

        Args:
            max_runs: Optional limit on runs to execute
        """
        if cls._is_running():
            console.print("[yellow]Daemon already running[/yellow]")
            return

        console.print("[cyan]Starting orchestration daemon...[/cyan]")

        # Build command
        cmd = [
            sys.executable,
            str(Path(__file__).parent / "orchestrate_experiments.py"),
            "run",
        ]

        if max_runs:
            cmd.extend(["--max-runs", str(max_runs)])

        # Start process
        try:
            process = subprocess.Popen(
                cmd,
                stdout=open(cls.DAEMON_LOG_FILE, "a"),
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                cwd=str(PROJECT_ROOT),
            )

            # Save PID
            cls.DAEMON_PID_FILE.write_text(str(process.pid))

            logger.info(f"Daemon started with PID {process.pid}")
            console.print(f"[green]Daemon started (PID: {process.pid})[/green]")
            console.print(f"[dim]Logs: {cls.DAEMON_LOG_FILE}[/dim]")

        except Exception as e:
            logger.error(f"Failed to start daemon: {e}")
            console.print(f"[red]Failed to start daemon: {e}[/red]")

    @classmethod
    def stop(cls, force: bool = False) -> None:
        """
        Stop orchestration daemon.

        Args:
            force: Force kill if normal stop fails
        """
        if not cls._is_running():
            console.print("[yellow]Daemon not running[/yellow]")
            return

        try:
            pid = int(cls.DAEMON_PID_FILE.read_text().strip())
            console.print(f"[cyan]Stopping daemon (PID: {pid})...[/cyan]")

            if force:
                os.kill(pid, signal.SIGKILL)
                logger.info(f"Daemon killed (force)")
                console.print("[green]Daemon killed[/green]")
            else:
                os.kill(pid, signal.SIGTERM)
                logger.info(f"Daemon stopped")
                console.print("[green]Daemon stopped[/green]")

            # Clean up PID file
            time.sleep(0.5)
            cls.DAEMON_PID_FILE.unlink(missing_ok=True)

        except ProcessLookupError:
            logger.warning("Daemon process not found")
            cls.DAEMON_PID_FILE.unlink(missing_ok=True)
            console.print("[yellow]Daemon process not found[/yellow]")

        except Exception as e:
            logger.error(f"Failed to stop daemon: {e}")
            console.print(f"[red]Failed to stop daemon: {e}[/red]")

    @classmethod
    def status(cls) -> None:
        """Show daemon status."""
        if cls._is_running():
            try:
                pid = int(cls.DAEMON_PID_FILE.read_text().strip())
                console.print(f"[green]✓ Daemon running (PID: {pid})[/green]")

                # Try to get process info
                import psutil
                try:
                    proc = psutil.Process(pid)
                    console.print(f"  Command: {' '.join(proc.cmdline())}")
                    console.print(f"  Memory: {proc.memory_info().rss / 1024 / 1024:.1f} MB")
                    console.print(f"  CPU: {proc.cpu_percent()}%")
                except:
                    pass

            except Exception as e:
                console.print(f"[yellow]Daemon status unknown: {e}[/yellow]")
        else:
            console.print("[yellow]✗ Daemon not running[/yellow]")

    @classmethod
    def logs(cls, tail: int = 50, follow: bool = False) -> None:
        """
        Show daemon logs.

        Args:
            tail: Number of lines to show
            follow: Follow log in real-time
        """
        if not cls.DAEMON_LOG_FILE.exists():
            console.print("[yellow]No daemon logs found[/yellow]")
            return

        if follow:
            # Follow logs (like tail -f)
            console.print(f"[cyan]Following {cls.DAEMON_LOG_FILE}[/cyan]")
            console.print("[dim]Press Ctrl+C to stop[/dim]\n")

            try:
                with open(cls.DAEMON_LOG_FILE, "r") as f:
                    # Go to end of file
                    f.seek(0, 2)

                    while True:
                        line = f.readline()
                        if line:
                            console.print(line.rstrip())
                        else:
                            time.sleep(0.1)

            except KeyboardInterrupt:
                console.print("\n[yellow]Stopped following logs[/yellow]")

        else:
            # Show last N lines
            try:
                with open(cls.DAEMON_LOG_FILE, "r") as f:
                    lines = f.readlines()

                lines = lines[-tail:] if len(lines) > tail else lines

                if not lines:
                    console.print("[yellow]No logs to display[/yellow]")
                    return

                console.print("".join(lines))

            except Exception as e:
                console.print(f"[red]Error reading logs: {e}[/red]")

    @classmethod
    def _is_running(cls) -> bool:
        """Check if daemon is running."""
        if not cls.DAEMON_PID_FILE.exists():
            return False

        try:
            pid = int(cls.DAEMON_PID_FILE.read_text().strip())
            # Try to signal process (doesn't kill, just checks if it exists)
            os.kill(pid, 0)
            return True
        except (ProcessLookupError, ValueError, OSError):
            return False


@click.group()
def cli():
    """Daemon management for orchestration."""
    pass


@cli.command()
@click.option("--max-runs", type=int, default=None, help="Limit number of runs")
def start(max_runs: Optional[int]) -> None:
    """Start orchestration daemon."""
    DaemonManager.start(max_runs=max_runs)


@cli.command()
@click.option("--force", is_flag=True, help="Force kill daemon")
def stop(force: bool) -> None:
    """Stop orchestration daemon."""
    DaemonManager.stop(force=force)


@cli.command()
def status() -> None:
    """Show daemon status."""
    DaemonManager.status()


@cli.command()
@click.option("--tail", type=int, default=50, help="Number of lines to show")
@click.option("--follow", is_flag=True, help="Follow logs in real-time")
def logs(tail: int, follow: bool) -> None:
    """Show daemon logs."""
    DaemonManager.logs(tail=tail, follow=follow)


@cli.command()
def restart() -> None:
    """Restart orchestration daemon."""
    DaemonManager.stop()
    time.sleep(1)
    DaemonManager.start()


if __name__ == "__main__":
    cli()
