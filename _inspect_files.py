"""Inspect files.content() signature."""
import inspect
import together

client = together.Together()
print("content signature:", inspect.signature(client.files.content))
print()
# Also check the source
try:
    print(inspect.getsource(client.files.content))
except Exception as e:
    print(f"Could not get source: {e}")
