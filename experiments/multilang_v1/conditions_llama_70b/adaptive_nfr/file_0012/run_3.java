protected void compile() {
    String compilerImpl = getCompiler();

    if (compileList.length > 0) {
        log("Compiling " + compileList.length + " source file"
            + (compileList.length == 1 ? "" : "s")
            + (destDir != null ? " to " + destDir : ""));

        if (listFiles) {
            for (int i = 0; i < compileList.length; i++) {
              String filename = compileList[i].getAbsolutePath();
              log(filename);
            }
        }

        CompilerAdapter adapter =
            nestedAdapter != null ? nestedAdapter :
            CompilerAdapterFactory.getCompiler(compilerImpl, this,
                                               createCompilerClasspath());

        // now we need to populate the compiler adapter
        adapter.setJavac(this);

        // finally, lets execute the compiler!!
        if (adapter.execute()) {
            // Success
            if (createMissingPackageInfoClass) {
                try {
                    generateMissingPackageInfoClasses(destDir != null
                                                      ? destDir
                                                      : getProject()
                                                      .resolveFile(src.list()[0]));
                } catch (IOException x) {
                    // Should this be made a nonfatal warning?
                    throw new BuildException(x, getLocation());
                }
            }
        } else {
            // Fail path
            this.taskSuccess = false;
            if (errorProperty != null) {
                getProject().setNewProperty(
                    errorProperty, "true");
            }
            if (failOnError) {
                throw new BuildException(FAIL_MSG, getLocation());
            } else {
                log(FAIL_MSG, Project.MSG_ERR);
            }
        }
    }
}

// Extracted method to handle compiler execution
private void executeCompiler(CompilerAdapter adapter) {
    if (adapter.execute()) {
        // Success
        if (createMissingPackageInfoClass) {
            try {
                generateMissingPackageInfoClasses(destDir != null
                                                  ? destDir
                                                  : getProject()
                                                  .resolveFile(src.list()[0]));
            } catch (IOException x) {
                // Should this be made a nonfatal warning?
                throw new BuildException(x, getLocation());
            }
        }
    } else {
        // Fail path
        this.taskSuccess = false;
        if (errorProperty != null) {
            getProject().setNewProperty(
                errorProperty, "true");
        }
        if (failOnError) {
            throw new BuildException(FAIL_MSG, getLocation());
        } else {
            log(FAIL_MSG, Project.MSG_ERR);
        }
    }
}

// Extracted method to handle logging and file listing
private void logCompilationInfo() {
    log("Compiling " + compileList.length + " source file"
        + (compileList.length == 1 ? "" : "s")
        + (destDir != null ? " to " + destDir : ""));

    if (listFiles) {
        for (int i = 0; i < compileList.length; i++) {
          String filename = compileList[i].getAbsolutePath();
          log(filename);
        }
    }
}

// Refactored compile method
protected void compile() {
    String compilerImpl = getCompiler();

    if (compileList.length > 0) {
        logCompilationInfo();

        CompilerAdapter adapter =
            nestedAdapter != null ? nestedAdapter :
            CompilerAdapterFactory.getCompiler(compilerImpl, this,
                                               createCompilerClasspath());

        // now we need to populate the compiler adapter
        adapter.setJavac(this);

        // finally, lets execute the compiler!!
        executeCompiler(adapter);
    }
}