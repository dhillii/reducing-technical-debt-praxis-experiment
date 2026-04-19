"""Inspect Together AI batch/file response objects to find correct attribute names."""
import os, json, sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from together import Together

c = Together(api_key=os.environ.get("TOGETHER_API_KEY"))

# 1. List existing batches and inspect the object shape
print("=== BATCHES ===")
batches = c.batches.list()
print(f"list() returned type: {type(batches).__name__}")

if hasattr(batches, '__iter__'):
    for i, b in enumerate(batches):
        print(f"\n--- Batch {i} ---")
        print(f"  type: {type(b).__name__}")
        print(f"  attrs: {[a for a in dir(b) if not a.startswith('_')]}")
        print(f"  repr: {repr(b)[:600]}")
        if i >= 2:
            break
else:
    print(f"  attrs: {[a for a in dir(batches) if not a.startswith('_')]}")
    print(f"  repr: {repr(batches)[:600]}")

# 2. List files
print("\n=== FILES ===")
files = c.files.list()
print(f"list() returned type: {type(files).__name__}")
print(f"  attrs: {[a for a in dir(files) if not a.startswith('_')]}")
print(f"  repr: {repr(files)[:400]}")
