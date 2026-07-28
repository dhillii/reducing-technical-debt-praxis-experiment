protected void compile() {
    String compilerImpl = getCompiler();

    if (compileList.length > 0) {
        logCompilationInfo();
        executeCompiler(compilerImpl);
    }
}

private void logCompilationInfo() {
    log("Compiling " + compileList.length + " source file"
        + (compileList.length == 1 ? "" : "s")
        + (destDir != null ? " to " + destDir : ""));

    if (listFiles) {
        logSourceFiles();
    }
}

private void logSourceFiles() {
    for (int i = 0; i < compileList.length; i++) {
        String filename = compileList[i].getAbsolutePath();
        log(filename);
    }
}

private void executeCompiler(String compilerImpl) {
    CompilerAdapter adapter = getCompilerAdapter(compilerImpl);
    adapter.setJavac(this);

    if (adapter.execute()) {
        handleCompilationSuccess();
    } else {
        handleCompilationFailure();
    }
}

private CompilerAdapter getCompilerAdapter(String compilerImpl) {
    return nestedAdapter != null ? nestedAdapter :
        CompilerAdapterFactory.getCompiler(compilerImpl, this,
                                           createCompilerClasspath());
}

private void handleCompilationSuccess() {
    if (createMissingPackageInfoClass) {
        try {
            generateMissingPackageInfoClasses(destDir != null
                                              ? destDir
                                              : getProject()
                                              .resolveFile(src.list()[0]));
        } catch (IOException x) {
            throw new BuildException(x, getLocation());
        }
    }
}

private void handleCompilationFailure() {
    taskSuccess = false;
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