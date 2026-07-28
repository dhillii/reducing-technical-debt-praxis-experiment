protected void addPathFile(File pathComponent) throws IOException {
    if (pathComponents.contains(pathComponent)) {
        return;
    }
    pathComponents.addElement(pathComponent);
    if (pathComponent.isDirectory()) {
        return;
    }
    addClassPathEntriesFromManifest(pathComponent);
}

private void addClassPathEntriesFromManifest(File pathComponent) throws IOException {
    String absPathPlusTimeAndLength = pathComponent.getAbsolutePath()
            + pathComponent.lastModified() + "-" + pathComponent.length();
    String classpath = (String) pathMap.get(absPathPlusTimeAndLength);
    if (classpath == null) {
        classpath = getManifestClassPath(pathComponent);
        pathMap.put(absPathPlusTimeAndLength, classpath);
    }
    if (!"".equals(classpath)) {
        addClassPathEntriesFromManifestClassPath(pathComponent, classpath);
    }
}

private String getManifestClassPath(File pathComponent) {
    try (JarFile jarFile = new JarFile(pathComponent)) {
        Manifest manifest = jarFile.getManifest();
        if (manifest == null) {
            return "";
        }
        return manifest.getMainAttributes().getValue(Attributes.Name.CLASS_PATH);
    } catch (IOException e) {
        return "";
    }
}

private void addClassPathEntriesFromManifestClassPath(File pathComponent, String classpath) {
    URL baseURL = FILE_UTILS.getFileURL(pathComponent);
    StringTokenizer st = new StringTokenizer(classpath);
    while (st.hasMoreTokens()) {
        String classpathElement = st.nextToken();
        URL libraryURL = new URL(baseURL, classpathElement);
        if (!libraryURL.getProtocol().equals("file")) {
            log("Skipping jar library " + classpathElement
                    + " since only relative URLs are supported by this" + " loader",
                    Project.MSG_VERBOSE);
            continue;
        }
        String decodedPath = Locator.decodeUri(libraryURL.getFile());
        File libraryFile = new File(decodedPath);
        if (libraryFile.exists() && !isInPath(libraryFile)) {
            addPathFile(libraryFile);
        }
    }
}