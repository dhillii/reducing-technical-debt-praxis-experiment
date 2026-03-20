#!/usr/bin/env python3
"""
Extract candidate source files from 14 GitHub repositories.

This script:
1. Identifies 146 unique source files from the experimental dataset CSV
2. Maps them to their 14 GitHub repositories
3. Clones the repos (or uses existing clones)
4. Extracts source files to sample_source_code/ directory
5. Creates a manifest of extracted files
"""

import os
import sys
import shutil
import subprocess
import csv
from pathlib import Path
from collections import defaultdict
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Project GitHub URLs (from dhillii organization forks)
PROJECT_REPOS = {
    "Ghost": "https://github.com/dhillii/Ghost.git",
    "create-react-app": "https://github.com/dhillii/create-react-app.git",
    "eslint": "https://github.com/dhillii/eslint.git",
    "express": "https://github.com/dhillii/express.git",
    "hapi": "https://github.com/dhillii/hapi.git",
    "keystone": "https://github.com/dhillii/keystone.git",
    "laverna": "https://github.com/dhillii/laverna.git",
    "mail": "https://github.com/dhillii/Mail.git",
    "mocha": "https://github.com/dhillii/mocha.git",
    "mongoose": "https://github.com/dhillii/mongoose.git",
    "pm2": "https://github.com/dhillii/pm2.git",
    "sequelize": "https://github.com/dhillii/sequelize.git",
    "strapi": "https://github.com/dhillii/strapi.git",
    "webpack": "https://github.com/dhillii/webpack.git",
}


class SourceFileExtractor:
    """Extract source files from GitHub repositories."""

    def __init__(self, csv_path, output_dir="sample_source_code", repos_dir="repos_cache"):
        """
        Initialize extractor.

        Args:
            csv_path: Path to unified_experimental_dataset_shell.csv
            output_dir: Directory to store extracted files
            repos_dir: Directory to cache cloned repos
        """
        self.csv_path = Path(csv_path)
        self.output_dir = Path(output_dir)
        self.repos_dir = Path(repos_dir)
        self.file_manifest = defaultdict(lambda: {"project": None, "original_path": None, "status": None})

    def ensure_output_dirs(self):
        """Create necessary directories."""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.repos_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Output directory: {self.output_dir.absolute()}")
        logger.info(f"Cache directory: {self.repos_dir.absolute()}")

    def read_csv(self):
        """Read CSV and extract unique files per project."""
        files_by_project = defaultdict(set)
        file_info = {}  # Track full paths

        try:
            with open(self.csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    project = row['project_name']
                    file_name = row['file_name']
                    file_path = row['file_path']

                    # Store unique file per project (deduplicate)
                    files_by_project[project].add(file_path)
                    file_info[file_path] = {
                        'project': project,
                        'file_name': file_name
                    }

            logger.info(f"CSV loaded: {len(file_info)} unique file references")
            return files_by_project, file_info

        except FileNotFoundError:
            logger.error(f"CSV file not found: {self.csv_path}")
            raise
        except Exception as e:
            logger.error(f"Error reading CSV: {e}")
            raise

    def clone_or_update_repo(self, project_name, repo_url):
        """Clone or update a GitHub repository."""
        repo_path = self.repos_dir / project_name

        try:
            if repo_path.exists():
                logger.info(f"Updating existing repo: {project_name}")
                subprocess.run(
                    ["git", "pull", "origin", "main"],
                    cwd=repo_path,
                    capture_output=True,
                    timeout=60
                )
                # Try master if main failed
                subprocess.run(
                    ["git", "pull", "origin", "master"],
                    cwd=repo_path,
                    capture_output=True,
                    timeout=60
                )
            else:
                logger.info(f"Cloning repo: {project_name} from {repo_url}")
                subprocess.run(
                    ["git", "clone", "--depth", "1", repo_url, str(repo_path)],
                    capture_output=True,
                    timeout=300
                )

            logger.info(f"✓ {project_name} ready")
            return True

        except subprocess.TimeoutExpired:
            logger.error(f"Timeout cloning {project_name}")
            return False
        except Exception as e:
            logger.error(f"Error with {project_name}: {e}")
            return False

    def extract_file(self, project_name, file_path, output_path):
        """Extract a single file from cloned repo."""
        repo_path = self.repos_dir / project_name
        source_file = repo_path / file_path

        if not source_file.exists():
            logger.warning(f"File not found: {file_path} in {project_name}")
            return False

        try:
            # Create output directory structure
            output_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_file, output_path)
            return True
        except Exception as e:
            logger.error(f"Error extracting {file_path}: {e}")
            return False

    def run(self, skip_cloning=False, re_extract=False):
        """
        Run the extraction process.

        Args:
            skip_cloning: If True, assume repos are already cloned
            re_extract: If True, re-extract even if files exist
        """
        self.ensure_output_dirs()

        logger.info("=" * 60)
        logger.info("SOURCE FILE EXTRACTION")
        logger.info("=" * 60)

        # Read CSV
        files_by_project, file_info = self.read_csv()

        logger.info(f"\nProjects to process: {len(files_by_project)}")
        for project, files in sorted(files_by_project.items()):
            logger.info(f"  {project}: {len(files)} unique files")

        # Clone/update repos
        if not skip_cloning:
            logger.info("\n" + "=" * 60)
            logger.info("CLONING/UPDATING REPOSITORIES")
            logger.info("=" * 60)

            for project_name in sorted(files_by_project.keys()):
                if project_name not in PROJECT_REPOS:
                    logger.warning(f"Unknown repo URL for {project_name}")
                    continue

                repo_url = PROJECT_REPOS[project_name]
                self.clone_or_update_repo(project_name, repo_url)

        # Extract files
        logger.info("\n" + "=" * 60)
        logger.info("EXTRACTING SOURCE FILES")
        logger.info("=" * 60)

        extracted_count = 0
        failed_count = 0
        skipped_count = 0
        file_counter = 1  # Sequential counter for file numbering

        for project_name in sorted(files_by_project.keys()):
            files = files_by_project[project_name]
            logger.info(f"\nExtracting from {project_name} ({len(files)} files)...")

            for file_path in sorted(files):
                file_name = file_info[file_path]['file_name']

                # Generate output filename with sequential numbering
                output_filename = f"file_{file_counter:04d}_{file_name}"
                output_path = self.output_dir / output_filename

                # Skip if exists and not re-extracting
                if output_path.exists() and not re_extract:
                    skipped_count += 1
                    self.file_manifest[output_filename] = {
                        'project': project_name,
                        'original_path': file_path,
                        'status': 'already_exists'
                    }
                    file_counter += 1
                    continue

                # Extract file
                if self.extract_file(project_name, file_path, output_path):
                    extracted_count += 1
                    logger.info(f"  ✓ {output_filename}")
                    self.file_manifest[output_filename] = {
                        'project': project_name,
                        'original_path': file_path,
                        'status': 'extracted'
                    }
                else:
                    failed_count += 1
                    logger.warning(f"  ✗ {output_filename} (file not found)")
                    self.file_manifest[output_filename] = {
                        'project': project_name,
                        'original_path': file_path,
                        'status': 'failed'
                    }

                file_counter += 1

        # Summary
        logger.info("\n" + "=" * 60)
        logger.info("EXTRACTION SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Extracted: {extracted_count}")
        logger.info(f"Skipped (already exist): {skipped_count}")
        logger.info(f"Failed: {failed_count}")
        logger.info(f"Total: {extracted_count + skipped_count + failed_count}")
        logger.info(f"Expected 146 unique files in: {self.output_dir.absolute()}")

        # Save manifest
        self.save_manifest()

        logger.info("\n✓ Extraction complete!")
        logger.info(f"Files saved to: {self.output_dir.absolute()}")

    def save_manifest(self):
        """Save extraction manifest."""
        manifest_path = self.output_dir.parent / "extraction_manifest.csv"

        try:
            with open(manifest_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=['output_filename', 'project', 'original_path', 'status'])
                writer.writeheader()

                for output_filename, info in sorted(self.file_manifest.items()):
                    writer.writerow({
                        'output_filename': output_filename,
                        'project': info['project'],
                        'original_path': info['original_path'],
                        'status': info['status']
                    })

            logger.info(f"Manifest saved to: {manifest_path}")
        except Exception as e:
            logger.error(f"Error saving manifest: {e}")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Extract candidate source files from GitHub repositories"
    )
    parser.add_argument(
        "--csv",
        default="unified_experimental_dataset_shell.csv",
        help="Path to experimental dataset CSV (default: unified_experimental_dataset_shell.csv)"
    )
    parser.add_argument(
        "--output",
        default="sample_source_code",
        help="Output directory for extracted files (default: sample_source_code)"
    )
    parser.add_argument(
        "--repos-dir",
        default="repos_cache",
        help="Directory to cache cloned repos (default: repos_cache)"
    )
    parser.add_argument(
        "--skip-cloning",
        action="store_true",
        help="Skip cloning/updating repos (assume they exist)"
    )
    parser.add_argument(
        "--re-extract",
        action="store_true",
        help="Re-extract files even if they already exist"
    )

    args = parser.parse_args()

    # Check if CSV exists
    csv_path = Path(args.csv)
    if not csv_path.exists():
        # Try looking in data_collection/data/ subdirectory
        alt_path = Path("data_collection/data") / args.csv
        if alt_path.exists():
            csv_path = alt_path
        else:
            logger.error(f"CSV file not found: {args.csv}")
            sys.exit(1)

    extractor = SourceFileExtractor(
        csv_path=csv_path,
        output_dir=args.output,
        repos_dir=args.repos_dir
    )

    extractor.run(
        skip_cloning=args.skip_cloning,
        re_extract=args.re_extract
    )


if __name__ == "__main__":
    main()
