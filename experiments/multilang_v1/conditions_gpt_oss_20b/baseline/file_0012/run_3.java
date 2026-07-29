protected void compile() {
    if (compileList.length == 0) {
        return;
    }
    logCompilationStart();
    if (listFiles) {
        listSourceFiles();
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

private void logCompilationStart() {
    String msg = "Compiling " + compileList.length + " source file"
            + (compileList.length == 1 ? "" : "s")
            + (destDir != null ? " to " + destDir : "");
    log(msg);
}

private void listSourceFiles() {
    for (File f : compileList) {
        log(f.getAbsolutePath());
    }
}

private CompilerAdapter getAdapter() {
    if (nestedAdapter != null) {
        return nestedAdapter;
    }
    return CompilerAdapterFactory.getCompiler(getCompiler(), this,
            createCompilerClasspath());
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