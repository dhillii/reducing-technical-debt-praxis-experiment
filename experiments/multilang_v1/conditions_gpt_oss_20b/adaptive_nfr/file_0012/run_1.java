protected void compile() {
        if (compileList.length == 0) {
            return;
        }
        logCompileStart();
        if (listFiles) {
            logFiles();
        }
        CompilerAdapter adapter = getAdapter();
        adapter.setJavac(this);
        boolean success = adapter.execute();
        if (success) {
            handleSuccess();
        } else {
            handleFailure();
        }
    }

    /**
     * Logs the start of the compilation process.
     */
    private void logCompileStart() {
        log("Compiling " + compileList.length + " source file"
            + (compileList.length == 1 ? "" : "s")
            + (destDir != null ? " to " + destDir : ""));
    }

    /**
     * Logs each file that will be compiled.
     */
    private void logFiles() {
        for (int i = 0; i < compileList.length; i++) {
            String filename = compileList[i].getAbsolutePath();
            log(filename);
        }
    }

    /**
     * Obtains the {@link CompilerAdapter} to use for this compilation.
     *
     * @return the compiler adapter instance
     */
    private CompilerAdapter getAdapter() {
        return nestedAdapter != null ? nestedAdapter
                : CompilerAdapterFactory.getCompiler(getCompiler(),
                        this, createCompilerClasspath());
    }

    /**
     * Handles the successful compilation path.
     */
    private void handleSuccess() {
        if (createMissingPackageInfoClass) {
            try {
                File dest = destDir != null ? destDir
                        : getProject().resolveFile(src.list()[0]);
                generateMissingPackageInfoClasses(dest);
            } catch (IOException x) {
                throw new BuildException(x, getLocation());
            }
        }
    }

    /**
     * Handles the failed compilation path.
     */
    private void handleFailure() {
        this.taskSuccess = false;
        if (errorProperty != null) {
            getProject().setNewProperty(errorProperty, "true");
        }
        if (failOnError) {
            throw new BuildException(FAIL_MSG, getLocation());
        } else {
            log(FAIL_MSG, Project.MSG_ERR);
        }
    }