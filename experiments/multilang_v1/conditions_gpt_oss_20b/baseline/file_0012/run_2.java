protected void compile() {
        if (compileList.length == 0) {
            return;
        }
        logCompilationStart();
        listFilesIfNeeded();
        CompilerAdapter adapter = getAdapter();
        adapter.setJavac(this);
        if (adapter.execute()) {
            handleSuccess();
        } else {
            handleFailure();
        }
    }

    private void logCompilationStart() {
        log("Compiling " + compileList.length + " source file"
            + (compileList.length == 1 ? "" : "s")
            + (destDir != null ? " to " + destDir : ""));
    }

    private void listFilesIfNeeded() {
        if (!listFiles) {
            return;
        }
        for (File file : compileList) {
            log(file.getAbsolutePath());
        }
    }

    private CompilerAdapter getAdapter() {
        if (nestedAdapter != null) {
            return nestedAdapter;
        }
        return CompilerAdapterFactory.getCompiler(
                getCompiler(), this, createCompilerClasspath());
    }

    private void handleSuccess() {
        if (!createMissingPackageInfoClass) {
            return;
        }
        File dest = destDir != null ? destDir
                : getProject().resolveFile(src.list()[0]);
        try {
            generateMissingPackageInfoClasses(dest);
        } catch (IOException e) {
            throw new BuildException(e, getLocation());
        }
    }

    private void handleFailure() {
        taskSuccess = false;
        if (errorProperty != null) {
            getProject().setNewProperty(errorProperty, "true");
        }
        if (failOnError) {
            throw new BuildException(FAIL_MSG, getLocation());
        } else {
            log(FAIL_MSG, Project.MSG_ERR);
        }
    }