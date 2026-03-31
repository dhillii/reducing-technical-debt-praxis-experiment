#!/usr/bin/env python3
"""
Analyze and compare SonarQube vs. local metrics.

Usage:
    python analyze_metrics.py --report           # Print text report
    python analyze_metrics.py --export           # Export comparison CSV
    python analyze_metrics.py --full             # Do both
"""

import click
from pathlib import Path
from utils.metric_comparison import generate_comparison_report, export_comparison_csv


@click.command()
@click.option(
    "--report",
    is_flag=True,
    help="Print text comparison report"
)
@click.option(
    "--export",
    is_flag=True,
    help="Export detailed comparison CSV"
)
@click.option(
    "--full",
    is_flag=True,
    help="Do both report and export"
)
@click.option(
    "--csv",
    type=click.Path(exists=True),
    help="Path to experiment CSV (defaults to data/unified_experimental_dataset_shell.csv)"
)
def analyze(report: bool, export: bool, full: bool, csv: str):
    """Analyze SonarQube vs. local metric calculations."""

    if full:
        report = True
        export = True

    if not (report or export):
        click.echo("Use --report, --export, or --full")
        return

    csv_path = Path(csv) if csv else None

    if report or full:
        click.echo("\n" + "=" * 80)
        click.echo("GENERATING COMPARISON REPORT")
        click.echo("=" * 80 + "\n")

        report_text = generate_comparison_report(csv_path)
        click.echo(report_text)

    if export or full:
        click.echo("\n" + "=" * 80)
        click.echo("EXPORTING DETAILED COMPARISON")
        click.echo("=" * 80 + "\n")

        output_path = export_comparison_csv(csv_path)
        click.echo(f"✅ Comparison CSV exported to: {output_path}")
        click.echo("\nColumns added:")
        click.echo("  - cc_sonar_vs_local: Cyclomatic complexity difference")
        click.echo("  - cognitive_sonar_vs_local: Cognitive complexity difference")
        click.echo("  - ncloc_sonar_vs_local: NCLOC difference")


if __name__ == "__main__":
    analyze()
