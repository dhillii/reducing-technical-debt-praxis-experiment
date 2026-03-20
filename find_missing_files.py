#!/usr/bin/env python3
"""
Find missing files in cloned repositories and extract them.

This script:
1. Reads the extraction manifest
2. Finds files that failed to extract
3. Searches for them in the repos by filename
4. Extracts them to the correct location
"""

import os
import subprocess
import csv
from pathlib import Path
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

REPOS_DIR = Path("repos_cache")
OUTPUT_DIR = Path("sample_source_code")
MANIFEST_FILE = Path("extraction_manifest.csv")


def find_file_in_repo(repo_path, filename):
    """Search for a file in a repository by name."""
    try:
        result = subprocess.run(
            ["find", str(repo_path), "-name", filename, "-type", "f"],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.stdout:
            # Return first match
            matches = result.stdout.strip().split('\n')
            return Path(matches[0]) if matches[0] else None
    except Exception as e:
        logger.error(f"Error searching for {filename}: {e}")

    return None


def search_by_pattern(repo_path, pattern):
    """Search for files matching a pattern."""
    try:
        result = subprocess.run(
            ["find", str(repo_path), "-iname", f"*{pattern}*", "-type", "f"],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.stdout:
            matches = result.stdout.strip().split('\n')
            return [Path(m) for m in matches if m]
    except Exception as e:
        logger.error(f"Error searching for pattern {pattern}: {e}")

    return []


def read_manifest():
    """Read the extraction manifest and find failed files."""
    failed_files = []

    if not MANIFEST_FILE.exists():
        logger.error(f"Manifest file not found: {MANIFEST_FILE}")
        return failed_files

    with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['status'] == 'failed':
                failed_files.append({
                    'output_filename': row['output_filename'],
                    'project': row['project'],
                    'original_path': row['original_path'],
                    'file_name': Path(row['original_path']).name
                })

    return failed_files


def extract_file(source_path, output_path):
    """Copy a file to the output directory."""
    try:
        import shutil
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, output_path)
        return True
    except Exception as e:
        logger.error(f"Error extracting {source_path}: {e}")
        return False


def main():
    """Main entry point."""
    logger.info("=" * 60)
    logger.info("FINDING MISSING FILES")
    logger.info("=" * 60)

    # Read failed files from manifest
    failed_files = read_manifest()

    if not failed_files:
        logger.info("No failed files found in manifest!")
        return

    logger.info(f"\nFound {len(failed_files)} failed files:")
    for f in failed_files:
        logger.info(f"  - {f['output_filename']} (project: {f['project']})")

    logger.info("\n" + "=" * 60)
    logger.info("SEARCHING FOR FILES IN REPOS")
    logger.info("=" * 60)

    results = {}

    for failed in failed_files:
        project = failed['project']
        file_name = failed['file_name']
        output_filename = failed['output_filename']
        original_path = failed['original_path']

        repo_path = REPOS_DIR / project

        if not repo_path.exists():
            logger.warning(f"\nRepo not found: {project}")
            continue

        logger.info(f"\nSearching for: {file_name} in {project}")

        # Try 1: Exact filename match
        found_path = find_file_in_repo(repo_path, file_name)

        if found_path:
            logger.info(f"  ✓ Found at: {found_path.relative_to(repo_path)}")
            results[output_filename] = {
                'source': found_path,
                'status': 'found',
                'path': str(found_path.relative_to(repo_path))
            }
            continue

        # Try 2: Search by partial name (remove extensions, search fragments)
        name_without_ext = Path(file_name).stem
        matches = search_by_pattern(repo_path, name_without_ext)

        if matches:
            logger.info(f"  Found {len(matches)} matches:")
            for i, match in enumerate(matches[:5], 1):
                logger.info(f"    {i}. {match.relative_to(repo_path)}")

            # Use first match
            results[output_filename] = {
                'source': matches[0],
                'status': 'found_alternate',
                'path': str(matches[0].relative_to(repo_path))
            }
            continue

        logger.warning(f"  ✗ Not found in {project}")
        results[output_filename] = {
            'source': None,
            'status': 'not_found',
            'original': original_path
        }

    # Show results and ask for confirmation
    logger.info("\n" + "=" * 60)
    logger.info("SEARCH RESULTS")
    logger.info("=" * 60)

    found_count = sum(1 for r in results.values() if r['status'] != 'not_found')
    logger.info(f"\nFound: {found_count}/{len(failed_files)}")

    for output_filename, result in results.items():
        if result['status'] == 'not_found':
            logger.warning(f"  ✗ {output_filename}")
            logger.warning(f"      Original: {result['original']}")
        else:
            logger.info(f"  ✓ {output_filename}")
            logger.info(f"      New path: {result['path']}")

    # Extract found files
    logger.info("\n" + "=" * 60)
    logger.info("EXTRACTING FOUND FILES")
    logger.info("=" * 60)

    extracted_count = 0
    for output_filename, result in results.items():
        if result['status'] != 'not_found':
            source = result['source']
            output_path = OUTPUT_DIR / output_filename

            if extract_file(source, output_path):
                extracted_count += 1
                logger.info(f"✓ Extracted: {output_filename}")
            else:
                logger.error(f"✗ Failed to extract: {output_filename}")

    logger.info("\n" + "=" * 60)
    logger.info("SUMMARY")
    logger.info("=" * 60)
    logger.info(f"Extracted: {extracted_count}/{len(failed_files)}")

    # Save updated manifest
    logger.info("\nUpdating manifest...")
    update_manifest(results)
    logger.info("✓ Manifest updated!")


def update_manifest(results):
    """Update the manifest with extraction results."""
    rows = []

    with open(MANIFEST_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            output_filename = row['output_filename']

            if output_filename in results:
                result = results[output_filename]
                if result['status'] != 'not_found':
                    row['status'] = 'extracted'
                else:
                    row['status'] = 'still_missing'

            rows.append(row)

    with open(MANIFEST_FILE, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys() if rows else [])
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
