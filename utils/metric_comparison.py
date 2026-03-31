"""
Compare SonarQube metrics vs. local calculated metrics.

Helps validate that local calculations align with SonarQube's measurements.
"""

import pandas as pd
from pathlib import Path
from typing import Dict, Tuple
from utils.logger_config import get_logger

logger = get_logger("metric_comparison")


def load_experiment_csv(csv_path: Path = None) -> pd.DataFrame:
    """Load the experiment CSV."""
    if csv_path is None:
        from utils.config import CSV_INPUT_FILE
        csv_path = Path(CSV_INPUT_FILE)

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    return pd.read_csv(csv_path)


def compare_pre_metrics(df: pd.DataFrame) -> Dict[str, Tuple[float, float, float]]:
    """
    Compare pre-refactoring SonarQube metrics vs. local calculations.

    Returns:
        Dict with metrics as keys, (mean_diff, median_diff, std_diff) as values
    """
    results = {}

    # Cyclomatic Complexity
    if "pre_cyclomatic_complexity" in df.columns and "pre_local_cyclomatic_complexity" in df.columns:
        sonar = pd.to_numeric(df["pre_cyclomatic_complexity"], errors="coerce").dropna()
        local = pd.to_numeric(df["pre_local_cyclomatic_complexity"], errors="coerce").dropna()

        # Match on indices
        valid = sonar.index.intersection(local.index)
        if len(valid) > 0:
            diff = sonar[valid] - local[valid]
            results["Cyclomatic Complexity"] = (
                diff.mean(),
                diff.median(),
                diff.std(),
                len(valid)
            )

    # Cognitive Complexity
    if "pre_cognitive_complexity" in df.columns and "pre_local_cognitive_complexity" in df.columns:
        sonar = pd.to_numeric(df["pre_cognitive_complexity"], errors="coerce").dropna()
        local = pd.to_numeric(df["pre_local_cognitive_complexity"], errors="coerce").dropna()

        valid = sonar.index.intersection(local.index)
        if len(valid) > 0:
            diff = sonar[valid] - local[valid]
            results["Cognitive Complexity"] = (
                diff.mean(),
                diff.median(),
                diff.std(),
                len(valid)
            )

    # NCLOC
    if "pre_ncloc" in df.columns and "pre_local_ncloc" in df.columns:
        sonar = pd.to_numeric(df["pre_ncloc"], errors="coerce").dropna()
        local = pd.to_numeric(df["pre_local_ncloc"], errors="coerce").dropna()

        valid = sonar.index.intersection(local.index)
        if len(valid) > 0:
            diff = sonar[valid] - local[valid]
            results["NCLOC"] = (
                diff.mean(),
                diff.median(),
                diff.std(),
                len(valid)
            )

    return results


def generate_comparison_report(csv_path: Path = None) -> str:
    """Generate a text report comparing SonarQube vs. local metrics."""
    df = load_experiment_csv(csv_path)
    comparison = compare_pre_metrics(df)

    report = []
    report.append("=" * 80)
    report.append("METRIC COMPARISON REPORT: SonarQube vs. Local Calculations")
    report.append("=" * 80)
    report.append("")
    report.append("This report shows the differences between SonarQube's pre-refactoring metrics")
    report.append("and your local calculations. A difference of 0 means perfect alignment.")
    report.append("")

    if not comparison:
        report.append("ERROR: No comparable metrics found in CSV.")
        return "\n".join(report)

    for metric, (mean_diff, median_diff, std_diff, count) in comparison.items():
        report.append(f"\n{metric} (n={count}):")
        report.append(f"  Mean difference (Sonar - Local):   {mean_diff:+.2f}")
        report.append(f"  Median difference (Sonar - Local): {median_diff:+.2f}")
        report.append(f"  Std dev of differences:             {std_diff:.2f}")

        # Interpretation
        if abs(mean_diff) < 0.5:
            report.append(f"  ✅ Excellent alignment")
        elif abs(mean_diff) < 2.0:
            report.append(f"  ⚠️  Good alignment (minor differences)")
        else:
            report.append(f"  ⚠️  Consider investigation (larger differences)")

    report.append("")
    report.append("=" * 80)
    report.append("INTERPRETATION")
    report.append("=" * 80)
    report.append("")
    report.append("- Positive difference: SonarQube metric is higher than local calculation")
    report.append("- Negative difference: Local calculation is higher than SonarQube")
    report.append("- Your local calculations are used for POST-metrics and deltas")
    report.append("- SonarQube values are reference PRE-metrics only")
    report.append("")

    return "\n".join(report)


def export_comparison_csv(csv_path: Path = None, output_path: Path = None) -> Path:
    """
    Export a CSV with comparison columns for deeper analysis.
    """
    df = load_experiment_csv(csv_path)

    if output_path is None:
        output_path = Path(csv_path).parent / "metric_comparison_analysis.csv"

    # Add comparison columns
    if "pre_cyclomatic_complexity" in df.columns and "pre_local_cyclomatic_complexity" in df.columns:
        df["cc_sonar_vs_local"] = (
            pd.to_numeric(df["pre_cyclomatic_complexity"], errors="coerce") -
            pd.to_numeric(df["pre_local_cyclomatic_complexity"], errors="coerce")
        )

    if "pre_cognitive_complexity" in df.columns and "pre_local_cognitive_complexity" in df.columns:
        df["cognitive_sonar_vs_local"] = (
            pd.to_numeric(df["pre_cognitive_complexity"], errors="coerce") -
            pd.to_numeric(df["pre_local_cognitive_complexity"], errors="coerce")
        )

    if "pre_ncloc" in df.columns and "pre_local_ncloc" in df.columns:
        df["ncloc_sonar_vs_local"] = (
            pd.to_numeric(df["pre_ncloc"], errors="coerce") -
            pd.to_numeric(df["pre_local_ncloc"], errors="coerce")
        )

    df.to_csv(output_path, index=False)
    logger.info(f"Comparison CSV exported to {output_path}")

    return output_path


if __name__ == "__main__":
    report = generate_comparison_report()
    print(report)

    output_path = export_comparison_csv()
    print(f"\nComparison CSV saved to: {output_path}")
