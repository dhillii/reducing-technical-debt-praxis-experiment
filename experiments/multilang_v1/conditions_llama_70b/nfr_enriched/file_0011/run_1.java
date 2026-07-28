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

private void validateAttributes() throws BuildException {
    if (file == null && rcs.size() == 0) {
        throw new BuildException("Specify at least one source--a file or a resource collection.");
    }
    if (destFile != null && destDir != null) {
        throw new BuildException("Only one of tofile and todir may be set.");
    }
    if (destFile == null && destDir == null) {
        throw new BuildException("One of tofile or todir must be set.");
    }
    if (file != null && file.isDirectory()) {
        throw new BuildException("Use a resource collection to copy directories.");
    }
    if (destFile != null && rcs.size() > 0) {
        if (rcs.size() > 1) {
            throw new BuildException("Cannot concatenate multiple files into a single file.");
        } else {
            ResourceCollection rc = (ResourceCollection) rcs.elementAt(0);
            if (!rc.isFilesystemOnly() && !supportsNonFileResources()) {
                throw new BuildException("Only FileSystem resources are supported.");
            }
            if (rc.size() == 0) {
                throw new BuildException(MSG_WHEN_COPYING_EMPTY_RC_TO_FILE);
            } else if (rc.size() == 1) {
                Resource res = rc.iterator().next();
                FileProvider r = res.as(FileProvider.class);
                if (file == null) {
                    if (r != null) {
                        file = r.getFile();
                    } else {
                        singleResource = res;
                    }
                    rcs.removeElementAt(0);
                } else {
                    throw new BuildException("Cannot concatenate multiple files into a single file.");
                }
            } else {
                throw new BuildException("Cannot concatenate multiple files into a single file.");
            }
        }
    }
    if (destFile != null) {
        destDir = destFile.getParentFile();
    }
}

private void copySingleFile() {
    if (file != null) {
        if (file.exists()) {
            if (destFile == null) {
                destFile = new File(destDir, file.getName());
            }
            if (forceOverwrite || !destFile.exists() || (file.lastModified() - granularity > destFile.lastModified())) {
                fileCopyMap.put(file.getAbsolutePath(), new String[] {destFile.getAbsolutePath()});
            } else {
                log(file + " omitted as " + destFile + " is up to date.", Project.MSG_VERBOSE);
            }
        } else {
            String message = "Warning: Could not find file " + file.getAbsolutePath() + " to copy.";
            if (!failonerror) {
                if (!quiet) {
                    log(message, Project.MSG_ERR);
                }
            } else {
                throw new BuildException(message);
            }
        }
    }
}

private void processResourceCollections() {
    HashMap<File, List<String>> filesByBasedir = new HashMap<File, List<String>>();
    HashMap<File, List<String>> dirsByBasedir = new HashMap<File, List<String>>();
    HashSet<File> baseDirs = new HashSet<File>();
    ArrayList<Resource> nonFileResources = new ArrayList<Resource>();
    final int size = rcs.size();
    for (int i = 0; i < size; i++) {
        ResourceCollection rc = rcs.elementAt(i);
        processResourceCollection(rc, filesByBasedir, dirsByBasedir, baseDirs, nonFileResources);
    }
    iterateOverBaseDirs(baseDirs, dirsByBasedir, filesByBasedir);
    try {
        doFileOperations();
    } catch (BuildException e) {
        if (!failonerror) {
            if (!quiet) {
                log("Warning: " + getMessage(e), Project.MSG_ERR);
            }
        } else {
            throw e;
        }
    }
    if (nonFileResources.size() > 0 || singleResource != null) {
        Resource[] nonFiles = (Resource[]) nonFileResources.toArray(new Resource[nonFileResources.size()]);
        Map<Resource, String[]> map = scan(nonFiles, destDir);
        if (singleResource != null) {
            map.put(singleResource, new String[] {destFile.getAbsolutePath()});
        }
        try {
            doResourceOperations(map);
        } catch (BuildException e) {
            if (!failonerror) {
                if (!quiet) {
                    log("Warning: " + getMessage(e), Project.MSG_ERR);
                }
            } else {
                throw e;
            }
        }
    }
}

private void processResourceCollection(ResourceCollection rc, HashMap<File, List<String>> filesByBasedir, HashMap<File, List<String>> dirsByBasedir, HashSet<File> baseDirs, ArrayList<Resource> nonFileResources) {
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