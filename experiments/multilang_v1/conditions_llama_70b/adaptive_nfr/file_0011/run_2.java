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
    if (!hasValidSource()) {
        throw new BuildException("Specify at least one source--a file or a resource collection.");
    }
    if (!hasValidDestination()) {
        throw new BuildException("One of tofile or todir must be set.");
    }
    if (hasInvalidSourceAndDestination()) {
        throw new BuildException("Only one of tofile and todir may be set.");
    }
    if (hasInvalidSourceFile()) {
        throw new BuildException("Use a resource collection to copy directories.");
    }
    if (hasInvalidDestinationFile()) {
        throw new BuildException("Cannot concatenate multiple files into a single file.");
    }
}

private boolean hasValidSource() {
    return file != null || rcs.size() > 0;
}

private boolean hasValidDestination() {
    return destFile != null || destDir != null;
}

private boolean hasInvalidSourceAndDestination() {
    return destFile != null && destDir != null;
}

private boolean hasInvalidSourceFile() {
    return file != null && file.isDirectory();
}

private boolean hasInvalidDestinationFile() {
    return destFile != null && rcs.size() > 0;
}

private void copySingleFile() {
    if (file != null) {
        if (file.exists()) {
            if (destFile == null) {
                destFile = new File(destDir, file.getName());
            }
            if (shouldCopyFile()) {
                fileCopyMap.put(file.getAbsolutePath(), new String[] { destFile.getAbsolutePath() });
            } else {
                log(file + " omitted as " + destFile + " is up to date.", Project.MSG_VERBOSE);
            }
        } else {
            handleMissingFile();
        }
    }
}

private boolean shouldCopyFile() {
    return forceOverwrite || !destFile.exists() || (file.lastModified() - granularity > destFile.lastModified());
}

private void handleMissingFile() {
    String message = "Warning: Could not find file " + file.getAbsolutePath() + " to copy.";
    if (!failonerror) {
        if (!quiet) {
            log(message, Project.MSG_ERR);
        }
    } else {
        throw new BuildException(message);
    }
}

private void processResourceCollections() {
    HashMap<File, List<String>> filesByBasedir = new HashMap<File, List<String>>();
    HashMap<File, List<String>> dirsByBasedir = new HashMap<File, List<String>>();
    HashSet<File> baseDirs = new HashSet<File>();
    ArrayList<Resource> nonFileResources = new ArrayList<Resource>();

    for (int i = 0; i < rcs.size(); i++) {
        ResourceCollection rc = rcs.elementAt(i);
        processResourceCollection(rc, filesByBasedir, dirsByBasedir, baseDirs, nonFileResources);
    }

    iterateOverBaseDirs(baseDirs, dirsByBasedir, filesByBasedir);
    doFileOperations();
    doResourceOperations(nonFileResources);
}

private void processResourceCollection(ResourceCollection rc, HashMap<File, List<String>> filesByBasedir, HashMap<File, List<String>> dirsByBasedir, HashSet<File> baseDirs, ArrayList<Resource> nonFileResources) {
    if (rc instanceof FileSet && rc.isFilesystemOnly()) {
        FileSet fs = (FileSet) rc;
        DirectoryScanner ds = null;
        try {
            ds = fs.getDirectoryScanner(getProject());
        } catch (BuildException e) {
            handleBuildException(e);
            return;
        }
        File fromDir = fs.getDir(getProject());

        String[] srcFiles = ds.getIncludedFiles();
        String[] srcDirs = ds.getIncludedDirectories();
        add(fromDir, srcFiles, filesByBasedir);
        add(fromDir, srcDirs, dirsByBasedir);
        baseDirs.add(fromDir);
    } else {
        for (Resource r : rc) {
            if (!r.isExists()) {
                handleMissingResource(r);
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

private void handleBuildException(BuildException e) {
    if (failonerror || !getMessage(e).endsWith(DirectoryScanner.DOES_NOT_EXIST_POSTFIX)) {
        throw e;
    } else {
        if (!quiet) {
            log("Warning: " + getMessage(e), Project.MSG_ERR);
        }
    }
}

private void handleMissingResource(Resource r) {
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

private void doFileOperations() {
    if (fileCopyMap.size() > 0) {
        log("Copying " + fileCopyMap.size() + " file" + (fileCopyMap.size() == 1 ? "" : "s") + " to " + destDir.getAbsolutePath());

        for (Map.Entry<String, String[]> e : fileCopyMap.entrySet()) {
            String fromFile = e.getKey();
            String[] toFiles = e.getValue();

            for (int i = 0; i < toFiles.length; i++) {
                String toFile = toFiles[i];

                if (fromFile.equals(toFile)) {
                    log("Skipping self-copy of " + fromFile, verbosity);
                    continue;
                }
                try {
                    log("Copying " + fromFile + " to " + toFile, verbosity);

                    FilterSetCollection executionFilters = new FilterSetCollection();
                    if (filtering) {
                        executionFilters.addFilterSet(getProject().getGlobalFilterSet());
                    }
                    for (FilterSet filterSet : filterSets) {
                        executionFilters.addFilterSet(filterSet);
                    }
                    fileUtils.copyFile(new File(fromFile), new File(toFile), executionFilters, filterChains, forceOverwrite, preserveLastModified, /* append: */ false, inputEncoding, outputEncoding, getProject(), getForce());
                } catch (IOException ioe) {
                    handleIOException(ioe, fromFile, toFile);
                }
            }
        }
    }
    if (includeEmpty) {
        int createCount = 0;
        for (String[] dirs : dirCopyMap.values()) {
            for (int i = 0; i < dirs.length; i++) {
                File d = new File(dirs[i]);
                if (!d.exists()) {
                    if (!d.mkdirs()) {
                        log("Unable to create directory " + d.getAbsolutePath(), Project.MSG_ERR);
                    } else {
                        createCount++;
                    }
                }
            }
        }
        if (createCount > 0) {
            log("Copied " + dirCopyMap.size() + " empty director" + (dirCopyMap.size() == 1 ? "y" : "ies") + " to " + createCount + " empty director" + (createCount == 1 ? "y" : "ies") + " under " + destDir.getAbsolutePath());
        }
    }
}

private void handleIOException(IOException ioe, String fromFile, String toFile) {
    String msg = "Failed to copy " + fromFile + " to " + toFile + " due to " + getDueTo(ioe);
    File targetFile = new File(toFile);
    if (targetFile.exists() && !targetFile.delete()) {
        msg += " and I couldn't delete the corrupt " + toFile;
    }
    if (failonerror) {
        throw new BuildException(msg, ioe, getLocation());
    }
    log(msg, Project.MSG_ERR);
}

private void doResourceOperations(ArrayList<Resource> nonFileResources) {
    if (nonFileResources.size() > 0) {
        log("Copying " + nonFileResources.size() + " resource" + (nonFileResources.size() == 1 ? "" : "s") + " to " + destDir.getAbsolutePath());

        for (Resource fromResource : nonFileResources) {
            try {
                log("Copying " + fromResource + " to " + destDir.getAbsolutePath(), verbosity);

                FilterSetCollection executionFilters = new FilterSetCollection();
                if (filtering) {
                    executionFilters.addFilterSet(getProject().getGlobalFilterSet());
                }
                for (FilterSet filterSet : filterSets) {
                    executionFilters.addFilterSet(filterSet);
                }
                ResourceUtils.copyResource(fromResource, new FileResource(destDir, fromResource.getName()), executionFilters, filterChains, forceOverwrite, preserveLastModified, /* append: */ false, inputEncoding, outputEncoding, getProject(), getForce());
            } catch (IOException ioe) {
                handleIOException(ioe, fromResource.toString(), destDir.getAbsolutePath());
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