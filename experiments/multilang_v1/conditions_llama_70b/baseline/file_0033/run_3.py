def run_import_plugins(path_or_stream, fmt):
    fmt = fmt.lower()
    if hasattr(path_or_stream, 'seek'):
        path_or_stream.seek(0)
        pt = PersistentTemporaryFile('_import_plugin.'+fmt)
        with path_or_stream as src, pt as dest:
            shutil.copyfileobj(src, dest, 1024**2)
        path = pt.name
    else:
        path = path_or_stream
    return run_plugins_on_import(path, fmt)