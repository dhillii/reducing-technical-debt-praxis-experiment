/**
 * Perform the compilation.
 *
 * @since Ant 1.5
 */
protected void compile() {
    String compilerImpl = getCompiler();

    if (compileList.length > 0) {
        logCompilationInfo();
        executeCompiler(compilerImpl);
    }
}

/**
 * Log compilation information.
 */
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

/**
 * Execute the compiler.
 *
 * @param compilerImpl the compiler implementation
 */
private void executeCompiler(String compilerImpl) {
    CompilerAdapter adapter =
        nestedAdapter != null ? nestedAdapter :
        CompilerAdapterFactory.getCompiler(compilerImpl, this,
                                           createCompilerClasspath());

    adapter.setJavac(this);

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