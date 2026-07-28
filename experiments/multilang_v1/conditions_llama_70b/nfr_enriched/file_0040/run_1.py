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
                hardlink_file(spath, dpath)
            except OSError as e:
                if e.errno == errno.EPERM:
                    # Permission denied, fall back to copying
                    shutil.copy2(spath, dpath)
                else:
                    raise