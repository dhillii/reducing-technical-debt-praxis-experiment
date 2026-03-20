#!/bin/bash
# Quick script to extract source files for the experiment

set -e

echo "================================================"
echo "SOURCE FILE EXTRACTION FOR DISSERTATION"
echo "================================================"

# Check for CSV file
CSV_FILE="unified_experimental_dataset_shell.csv"

# Try finding it in parent directories
if [ ! -f "$CSV_FILE" ]; then
    if [ -f "../reducing-technical-debt-praxis-experiment/data/$CSV_FILE" ]; then
        CSV_FILE="../reducing-technical-debt-praxis-experiment/data/$CSV_FILE"
    else
        echo "ERROR: Could not find $CSV_FILE"
        echo "Please ensure unified_experimental_dataset_shell.csv is available"
        exit 1
    fi
fi

echo "CSV file found: $CSV_FILE"
echo ""

# Run the extraction script
python3 clone_source_files.py \
    --csv "$CSV_FILE" \
    --output "sample_source_code" \
    --repos-dir "repos_cache" \
    "$@"

echo ""
echo "================================================"
echo "✓ Extraction complete!"
echo "================================================"
echo ""
echo "Output files are in: sample_source_code/"
echo "Repository cache is in: repos_cache/"
echo "Manifest saved to: extraction_manifest.csv"
