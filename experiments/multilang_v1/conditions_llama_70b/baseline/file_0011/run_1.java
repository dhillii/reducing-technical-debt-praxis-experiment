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
        Map<Resource, String[]> map = scan(getNonFileResources(), destDir);
        doResourceOperations(map);
    }
}

private void processResourceCollection(ResourceCollection rc, HashMap<File, List<String>> filesByBasedir, HashMap<File, List<String>> dirsByBasedir, HashSet<File> baseDirs, ArrayList<Resource> nonFileResources) {
    if (rc instanceof FileSet && rc.isFilesystemOnly()) {
        processFileSet((FileSet) rc, filesByBasedir, dirsByBasedir, baseDirs);
    } else {
        processNonFileSetResourceCollection(rc, filesByBasedir, dirsByBasedir, baseDirs, nonFileResources);
    }
}

private void processFileSet(FileSet fs, HashMap<File, List<String>> filesByBasedir, HashMap<File, List<String>> dirsByBasedir, HashSet<File> baseDirs) {
    DirectoryScanner ds = null;
    try {
        ds = fs.getDirectoryScanner(getProject());
    } catch (BuildException e) {
        if (failonerror || !getMessage(e).endsWith(DirectoryScanner.DOES_NOT_EXIST_POSTFIX)) {
            throw e;
        } else {
            if (!quiet) {
                log("Warning: " + getMessage(e), Project.MSG_ERR);
            }
            return;
        }
    }
    File fromDir = fs.getDir(getProject());

    String[] srcFiles = ds.getIncludedFiles();
    String[] srcDirs = ds.getIncludedDirectories();
    if (!flatten && mapperElement == null && ds.isEverythingIncluded() && !fs.hasPatterns()) {
        completeDirMap.put(fromDir, destDir);
    }
    add(fromDir, srcFiles, filesByBasedir);
    add(fromDir, srcDirs, dirsByBasedir);
    baseDirs.add(fromDir);
}

private void processNonFileSetResourceCollection(ResourceCollection rc, HashMap<File, List<String>> filesByBasedir, HashMap<File, List<String>> dirsByBasedir, HashSet<File> baseDirs, ArrayList<Resource> nonFileResources) {
    if (!rc.isFilesystemOnly() && !supportsNonFileResources()) {
        throw new BuildException("Only FileSystem resources are supported.");
    }

    for (Resource r : rc) {
        if (!r.isExists()) {
            String message = "Warning: Could not find resource " + r.toLongString() + " to copy.";
            if (!failonerror) {
                if (!quiet) {
                    log(message, Project.MSG_ERR);
                }
            } else {
                throw new BuildException(message);
            }
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

private void iterateOverBaseDirs(HashSet<File> baseDirs, HashMap<File, List<String>> dirsByBasedir, HashMap<File, List<String>> filesByBasedir) {
    for (File f : baseDirs) {
        List<String> files = filesByBasedir.get(f);
        List<String> dirs = dirsByBasedir.get(f);

        String[] srcFiles = new String[0];
        if (files != null) {
            srcFiles = files.toArray(srcFiles);
        }
        String[] srcDirs = new String[0];
        if (dirs != null) {
            srcDirs = dirs.toArray(srcDirs);
        }
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

private Resource[] getNonFileResources() {
    Resource[] nonFiles = (Resource[]) nonFileResources.toArray(new Resource[nonFileResources.size()]);
    if (singleResource != null) {
        Resource[] resources = new Resource[nonFiles.length + 1];
        System.arraycopy(nonFiles, 0, resources, 0, nonFiles.length);
        resources[nonFiles.length] = singleResource;
        return resources;
    }
    return nonFiles;
}