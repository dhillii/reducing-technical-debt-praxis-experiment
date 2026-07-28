def run_import_plugins(path_or_stream, fmt):
    fmt = fmt.lower()
    if hasattr(path_or_stream, 'seek'):
        return _run_import_plugins_with_stream(path_or_stream, fmt)
    else:
        return _run_import_plugins_with_path(path_or_stream, fmt)


def _run_import_plugins_with_stream(path_or_stream, fmt):
    path_or_stream.seek(0)
    pt = PersistentTemporaryFile('_import_plugin.'+fmt)
    _copy_stream_to_file(path_or_stream, pt)
    pt.close()
    return run_plugins_on_import(pt.name, fmt)


def _run_import_plugins_with_path(path, fmt):
    return run_plugins_on_import(path, fmt)


def _copy_stream_to_file(stream, dest):
    shutil.copyfileobj(stream, dest, 1024**2)