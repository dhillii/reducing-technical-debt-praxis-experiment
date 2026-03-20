# Source File Extraction Guide

This guide explains how to extract the 146 source files from the 14 GitHub repositories needed for the dissertation experiment.

## Quick Start

### On macOS/Linux:
```bash
bash extract_files.sh
```

### On Windows (PowerShell):
```powershell
python clone_source_files.py --csv "path\to\unified_experimental_dataset_shell.csv"
```

### On Windows (Git Bash):
```bash
bash extract_files.sh
```

## What This Does

The extraction script:

1. **Reads the experimental dataset CSV** - Identifies all 146 unique files across 14 projects
2. **Clones GitHub repositories** - Downloads the 14 open-source projects:
   - Ghost
   - create-react-app
   - eslint
   - express
   - hapi
   - keystone
   - laverna
   - mail
   - mocha
   - mongoose
   - pm2
   - sequelize
   - strapi
   - webpack

3. **Extracts source files** - Copies the specific files from each repo to `sample_source_code/`
4. **Creates a manifest** - Logs which files were extracted, in `extraction_manifest.csv`

## Input Files

You need the experimental dataset CSV file:
```
unified_experimental_dataset_shell.csv
```

Expected location (will be auto-found):
```
../Reducing Technical Debt in Legacy Codebases through AI-Enabled Prompt Refinement/code/data_collection/data/unified_experimental_dataset_shell.csv
```

You can also specify explicitly:
```bash
python clone_source_files.py --csv /path/to/unified_experimental_dataset_shell.csv
```

## Output Structure

After running, you'll have:

```
.
├── sample_source_code/              # Extracted source files (146 files)
│   ├── file_0001_newsletter-detail-modal.tsx
│   ├── file_0002_utils.ts
│   ├── ...
│   └── file_0146_...
├── repos_cache/                     # Cloned GitHub repos (cached locally)
│   ├── Ghost/
│   ├── create-react-app/
│   ├── eslint/
│   ├── ...
│   └── webpack/
└── extraction_manifest.csv          # Mapping of extracted files to originals
```

## Command-Line Options

### Basic Usage
```bash
python clone_source_files.py
```

### With Custom CSV Path
```bash
python clone_source_files.py --csv /absolute/path/to/unified_experimental_dataset_shell.csv
```

### Change Output Directory
```bash
python clone_source_files.py --output my_source_files --repos-dir my_repos
```

### Skip Repository Cloning (use existing clones)
```bash
python clone_source_files.py --skip-cloning
```
This is useful if you already have the repos cached and just want to re-extract files.

### Re-extract Files (overwrite existing)
```bash
python clone_source_files.py --re-extract
```
By default, already-extracted files are skipped. Use this to force re-extraction.

## Typical Workflow

### First Run (Full Extraction)
```bash
# This will clone all 14 repos and extract all 146 files
python clone_source_files.py --csv "path/to/unified_experimental_dataset_shell.csv"
# Takes 5-10 minutes depending on internet speed
```

### Subsequent Runs (Faster)
```bash
# Repos are already cached, just checks for missing files
python clone_source_files.py --csv "path/to/unified_experimental_dataset_shell.csv"
# Takes <1 minute
```

### If You Need to Update Repos
```bash
# Will git pull the latest from each repo, then extract
python clone_source_files.py --csv "path/to/unified_experimental_dataset_shell.csv"
```

### If Files Get Corrupted
```bash
# Re-extract all files from cached repos
python clone_source_files.py --re-extract
```

## Expected Output

After extraction completes:

```
============================================================
EXTRACTION SUMMARY
============================================================
Extracted: 146
Skipped (already exist): 0
Failed: 0
Total: 146

✓ Extraction complete!
Files saved to: /absolute/path/to/sample_source_code
```

## Troubleshooting

### CSV File Not Found
```
ERROR: CSV file not found: unified_experimental_dataset_shell.csv
```

**Solution:** Specify the full path:
```bash
python clone_source_files.py --csv "/Users/yourname/path/to/unified_experimental_dataset_shell.csv"
```

### Some Files Not Found
```
Extracted: 140
Skipped: 0
Failed: 6
```

**Possible causes:**
- File was moved/deleted in the repo
- Different branch or version than expected
- Path changed between when CSV was created and now

**Solution:** Check the extraction manifest:
```bash
grep "failed" extraction_manifest.csv
```

### Git Clone Timeout
```
Timeout cloning Ghost
```

**Solution:** Skip cloning and try with the existing cache:
```bash
python clone_source_files.py --skip-cloning
```

Or increase timeout by manually cloning:
```bash
git clone https://github.com/TryGhost/Ghost.git repos_cache/Ghost
```

### Disk Space Issues

The cloned repos take ~2-3 GB. If you're short on space:

1. Run with `--skip-cloning` after first extraction
2. Delete repos_cache/ after extraction (files are already copied)
   ```bash
   rm -rf repos_cache/
   ```
3. Re-extract if needed with:
   ```bash
   python clone_source_files.py --re-extract  # Uses cached repos if available
   ```

## Manifest File

The `extraction_manifest.csv` contains:

```csv
output_filename,project,original_path,status
file_0001_newsletter-detail-modal.tsx,Ghost,apps/admin-x-settings/src/components/settings/email/newsletters/newsletter-detail-modal.tsx,extracted
file_0002_utils.ts,Ghost,apps/shade/src/lib/utils.ts,extracted
...
```

Use this to verify extraction and trace files back to their original locations.

## Next Steps

Once extraction is complete, you're ready for:

1. **Setup experiment environment** - Create `.env` file with API credentials
2. **Validate setup** - Run `python validation.py --full`
3. **Initialize state** - Run `python orchestrate_experiments.py --init`
4. **Start experiment** - Run `python daemon_manager.py start`

See `EXPERIMENT_WORKFLOW.md` for the full experiment procedure.
