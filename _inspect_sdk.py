"""Quick introspection of Together AI SDK batch methods."""
from together import Together
c = Together(api_key="dummy")
cls = type(c.batches)
print(f"Class: {cls.__name__} from {cls.__module__}")
print(f"Methods: {[m for m in dir(c.batches) if not m.startswith('_')]}")

# Also check files
cls2 = type(c.files)
print(f"\nFiles class: {cls2.__name__} from {cls2.__module__}")
print(f"Files methods: {[m for m in dir(c.files) if not m.startswith('_')]}")

# Check together version
import together
print(f"\ntogether version: {together.__version__}")
