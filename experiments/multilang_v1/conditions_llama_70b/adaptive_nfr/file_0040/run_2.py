def clone_dir(src, dest):
    ' Clone a directory using hard links for the files, dest must already exist '
    for x in os.listdir(src):
        dpath = os.path.join(dest, x)
        spath = os.path.join(src, x)
        if os.path.isdir(spath):
            os.mkdir(dpath)
            clone_dir(spath, dpath)
        else:
            try:
                _clone_file(spath, dpath)
            except Exception as e:
                _copy_file(spath, dpath, e)


def _clone_file(spath, dpath):
    hardlink_file(spath, dpath)


def _copy_file(spath, dpath, e):
    shutil.copy2(spath, dpath)