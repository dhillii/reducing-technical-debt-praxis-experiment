from together import Together
c = Together(api_key="x")
print("batches:", [m for m in dir(c.batches) if not m.startswith("_")])
print("files:", [m for m in dir(c.files) if not m.startswith("_")])
