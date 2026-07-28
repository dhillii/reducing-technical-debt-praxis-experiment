def run_import_plugins(path_or_stream, fmt):
    fmt = fmt.lower()
    if hasattr(path_or_stream, 'seek'):
        path_or_stream.seek(0)
        with PersistentTemporaryFile('_import_plugin.'+fmt) as pt:
            shutil.copyfileobj(path_or_stream, pt)
        path = pt.name
    else:
        path = path_or_stream
    return run_plugins_on_import(path, fmt)