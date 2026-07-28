/**
 * Add a file to the path.
 * Reads the manifest, if available, and adds any additional class path jars
 * specified in the manifest.
 *
 * @param pathComponent the file which is to be added to the path for
 *                      this class loader
 *
 * @throws IOException if data needed from the file cannot be read.
 */
protected void addPathFile(File pathComponent) throws IOException {
    addPathComponentToPath(pathComponent);
    if (pathComponent.isDirectory()) {
        return;
    }
    addClasspathEntriesFromManifest(pathComponent);
}

/**
 * Adds a path component to the path.
 * 
 * @param pathComponent the file which is to be added to the path for
 *                      this class loader
 */
private void addPathComponentToPath(File pathComponent) {
    if (!pathComponents.contains(pathComponent)) {
        pathComponents.addElement(pathComponent);
    }
}

/**
 * Adds classpath entries from the manifest of the given file.
 * 
 * @param pathComponent the file which is to be added to the path for
 *                      this class loader
 * @throws IOException if data needed from the file cannot be read.
 */
private void addClasspathEntriesFromManifest(File pathComponent) throws IOException {
    String absPathPlusTimeAndLength = pathComponent.getAbsolutePath()
            + pathComponent.lastModified() + "-" + pathComponent.length();
    String classpath = (String) pathMap.get(absPathPlusTimeAndLength);
    if (classpath == null) {
        classpath = getManifestClasspath(pathComponent);
        pathMap.put(absPathPlusTimeAndLength, classpath);
    }
    if (!"".equals(classpath)) {
        addClasspathEntries(pathComponent, classpath);
    }
}

/**
 * Gets the classpath from the manifest of the given file.
 * 
 * @param pathComponent the file which is to be added to the path for
 *                      this class loader
 * @return the classpath from the manifest
 * @throws IOException if data needed from the file cannot be read.
 */
private String getManifestClasspath(File pathComponent) throws IOException {
    JarFile jarFile = null;
    try {
        jarFile = new JarFile(pathComponent);
        Manifest manifest = jarFile.getManifest();
        if (manifest == null) {
            return "";
        }
        return manifest.getMainAttributes().getValue(Attributes.Name.CLASS_PATH);
    } finally {
        if (jarFile != null) {
            jarFile.close();
        }
    }
}

/**
 * Adds classpath entries from the given classpath string.
 * 
 * @param pathComponent the base file
 * @param classpath the classpath string
 */
private void addClasspathEntries(File pathComponent, String classpath) {
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