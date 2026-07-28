public void execute() throws BuildException {
    File savedFile = file;
    File savedDestFile = destFile;
    File savedDestDir = destDir;
    ResourceCollection savedRc = null;
    if (file == null && destFile != null && rcs.size() == 1) {
        savedRc = (ResourceCollection) rcs.elementAt(0);
    }

    try {
        validateAttributes();
        copySingleFile();
        processResourceCollections();
    } finally {
        cleanup();
    }
}

private void processResourceCollections() {
    HashMap<File, List<String>> filesByBasedir = new HashMap<>();
    HashMap<File, List<String>> dirsByBasedir = new HashMap<>();
    HashSet<File> baseDirs = new HashSet<>();
    ArrayList<Resource> nonFileResources = new ArrayList<>();

    for (ResourceCollection rc : rcs) {
        processResourceCollection(rc, filesByBasedir, dirsByBasedir, baseDirs, nonFileResources);
    }

    iterateOverBaseDirs(baseDirs, dirsByBasedir, filesByBasedir);
    doFileOperations();

    if (!nonFileResources.isEmpty() || singleResource != null) {
        Resource[] nonFiles = nonFileResources.toArray(new Resource[0]);
        Map<Resource, String[]> map = scan(nonFiles, destDir);
        if (singleResource != null) {
            map.put(singleResource, new String[] { destFile.getAbsolutePath() });
        }
        doResourceOperations(map);
    }
}

private void processResourceCollection(ResourceCollection rc, HashMap<File, List<String>> filesByBasedir, HashMap<File, List<String>> dirsByBasedir, HashSet<File> baseDirs, ArrayList<Resource> nonFileResources) {
    if (rc instanceof FileSet && rc.isFilesystemOnly()) {
        FileSet fs = (FileSet) rc;
        DirectoryScanner ds = fs.getDirectoryScanner(getProject());
        File fromDir = fs.getDir(getProject());
        String[] srcFiles = ds.getIncludedFiles();
        String[] srcDirs = ds.getIncludedDirectories();

        add(fromDir, srcFiles, filesByBasedir);
        add(fromDir, srcDirs, dirsByBasedir);
        baseDirs.add(fromDir);
    } else {
        for (Resource r : rc) {
            if (!r.isExists()) {
                handleNonExistentResource(r);
                continue;
            }

            File baseDir = NULL_FILE_PLACEHOLDER;
            String name = r.getName();
            FileProvider fp = r.as(FileProvider.class);
            if (fp != null) {
                FileResource fr = ResourceUtils.asFileResource(fp);
                baseDir = getKeyFile(fr.getBaseDir());
                if (fr.getBaseDir() == null) {
                    name = fr.getFile().getAbsolutePath();
                }
            }

            if (r.isDirectory() || fp != null) {
                add(baseDir, name, r.isDirectory() ? dirsByBasedir : filesByBasedir);
                baseDirs.add(baseDir);
            } else {
                nonFileResources.add(r);
            }
        }
    }
}

private void handleNonExistentResource(Resource r) {
    String message = "Warning: Could not find resource " + r.toLongString() + " to copy.";
    if (!failonerror) {
        if (!quiet) {
            log(message, Project.MSG_ERR);
        }
    } else {
        throw new BuildException(message);
    }
}

private void iterateOverBaseDirs(HashSet<File> baseDirs, HashMap<File, List<String>> dirsByBasedir, HashMap<File, List<String>> filesByBasedir) {
    for (File f : baseDirs) {
        List<String> files = filesByBasedir.get(f);
        List<String> dirs = dirsByBasedir.get(f);

        String[] srcFiles = files.toArray(new String[0]);
        String[] srcDirs = dirs.toArray(new String[0]);
        scan(f == NULL_FILE_PLACEHOLDER ? null : f, destDir, srcFiles, srcDirs);
    }
}

private void cleanup() {
    singleResource = null;
    file = savedFile;
    destFile = savedDestFile;
    destDir = savedDestDir;
    if (savedRc != null) {
        rcs.insertElementAt(savedRc, 0);
    }
    fileCopyMap.clear();
    dirCopyMap.clear();
    completeDirMap.clear();
}