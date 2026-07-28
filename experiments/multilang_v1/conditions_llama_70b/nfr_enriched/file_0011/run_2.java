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
    HashMap<File, List<String>> filesByBasedir = new HashMap<File, List<String>>();
    HashMap<File, List<String>> dirsByBasedir = new HashMap<File, List<String>>();
    HashSet<File> baseDirs = new HashSet<File>();
    ArrayList<Resource> nonFileResources = new ArrayList<Resource>();
    processResourceCollections(filesByBasedir, dirsByBasedir, baseDirs, nonFileResources);

    iterateOverBaseDirs(baseDirs, dirsByBasedir, filesByBasedir);
    doFileOperations();

    if (nonFileResources.size() > 0 || singleResource != null) {
        Resource[] nonFiles = (Resource[]) nonFileResources.toArray(new Resource[nonFileResources.size()]);
        Map<Resource, String[]> map = scan(nonFiles, destDir);
        if (singleResource != null) {
            map.put(singleResource, new String[] { destFile.getAbsolutePath() });
        }
        doResourceOperations(map);
    }
}

private void processResourceCollections(HashMap<File, List<String>> filesByBasedir, 
                                      HashMap<File, List<String>> dirsByBasedir, 
                                      HashSet<File> baseDirs, 
                                      ArrayList<Resource> nonFileResources) {
    final int size = rcs.size();
    for (int i = 0; i < size; i++) {
        ResourceCollection rc = rcs.elementAt(i);
        processResourceCollection(rc, filesByBasedir, dirsByBasedir, baseDirs, nonFileResources);
    }
}

private void processResourceCollection(ResourceCollection rc, 
                                     HashMap<File, List<String>> filesByBasedir, 
                                     HashMap<File, List<String>> dirsByBasedir, 
                                     HashSet<File> baseDirs, 
                                     ArrayList<Resource> nonFileResources) {
    if (rc instanceof FileSet && rc.isFilesystemOnly()) {
        FileSet fs = (FileSet) rc;
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
    } else {
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