/**
 * Perform the compilation.
 *
 * @since Ant 1.5
 */
protected void compile() {
    String compilerImpl = getCompiler();
    compileFiles(compilerImpl);
}

/**
 * Compile the given list of files using the specified compiler implementation.
 *
 * @param compilerImpl the name of the compiler implementation
 */
private void compileFiles(String compilerImpl) {
    if (compileList.length > 0) {
        logCompilationInfo();
        executeCompiler(compilerImpl);
    }
}

/**
 * Log information about the compilation.
 */
private void logCompilationInfo() {
    log("Compiling " + compileList.length + " source file"
        + (compileList.length == 1 ? "" : "s")
        + (destDir != null ? " to " + destDir : ""));
    if (listFiles) {
        logFileList();
    }
}

/**
 * Log the list of files being compiled.
 */
private void logFileList() {
    for (int i = 0; i < compileList.length; i++) {
        String filename = compileList[i].getAbsolutePath();
        log(filename);
    }
}

/**
 * Execute the compiler with the given implementation.
 *
 * @param compilerImpl the name of the compiler implementation
 */
private void executeCompiler(String compilerImpl) {
    CompilerAdapter adapter =
        nestedAdapter != null ? nestedAdapter :
        CompilerAdapterFactory.getCompiler(compilerImpl, this,
                                           createCompilerClasspath());

    // now we need to populate the compiler adapter
    adapter.setJavac(this);

    // finally, lets execute the compiler!!
    if (adapter.execute()) {
        // Success
        generateMissingPackageInfoClassesIfNecessary();
    } else {
        // Fail path
        handleCompilationFailure();
    }
}

/**
 * Generate missing package-info classes if necessary.
 */
private void generateMissingPackageInfoClassesIfNecessary() {
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
}

/**
 * Handle compilation failure.
 */
private void handleCompilationFailure() {
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