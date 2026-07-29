if hasattr(path_or_stream, 'seek'):
    path_or_stream.seek(0)
    pt = PersistentTemporaryFile('_import_plugin.'+fmt)
    shutil.copyfileobj(path_or_stream, pt, 1024**2)
    pt.close()
    path = pt.name
else: