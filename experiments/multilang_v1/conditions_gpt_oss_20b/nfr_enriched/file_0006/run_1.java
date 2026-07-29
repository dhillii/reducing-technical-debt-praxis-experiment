/**
 * Adds a file to the path.
 * Reads the manifest, if available, and adds any additional class path jars
 * specified in the manifest.
 *
 * @param pathComponent the file which is to be added to the path for
 *                      this class loader
 *
 * @throws IOException if data needed from the file cannot be read.
 */
protected void addPathFile(File pathComponent) throws IOException {
    if (pathComponents.contains(pathComponent)) {
        return;
    }
    pathComponents.addElement(pathComponent);
    if (pathComponent.isDirectory()) {
        return;
    }

    String key = buildJarKey(pathComponent);
    String classpath = pathMap.get(key);
    if (classpath == null) {
        classpath = readClasspathFromManifest(pathComponent);
        pathMap.put(key, classpath);
    }

    if (!classpath.isEmpty()) {
        processClasspath(classpath, pathComponent);
    }
}

/**
 * Builds a unique key for a jar file based on its absolute path,
 * last modified time and length.
 *
 * @param jar the jar file
 * @return the unique key string
 */
private String buildJarKey(File jar) {
    return jar.getAbsolutePath() + jar.lastModified() + "-" + jar.length();
}

/**
 * Reads the {@code Class-Path} attribute from the manifest of the given jar.
 *
 * @param jar the jar file
 * @return the class path string, or an empty string if none is defined
 * @throws IOException if an I/O error occurs while reading the jar
 */
private String readClasspathFromManifest(File jar) throws IOException {
    JarFile jarFile = null;
    try {
        jarFile = new JarFile(jar);
        Manifest manifest = jarFile.getManifest();
        if (manifest == null) {
            return "";
        }
        String cp = manifest.getMainAttributes()
                .getValue(Attributes.Name.CLASS_PATH);
        return cp == null ? "" : cp;
    } finally {
        if (jarFile != null) {
            jarFile.close();
        }
    }
}

/**
 * Processes the class path entries from a jar's manifest,
 * adding each referenced jar to the class loader.
 *
 * @param classpath the class path string from the manifest
 * @param base the base jar file from which relative paths are resolved
 * @throws IOException if an I/O error occurs
 */
private void processClasspath(String classpath, File base) throws IOException {
    URL baseURL = FILE_UTILS.getFileURL(base);
    StringTokenizer st = new StringTokenizer(classpath);
    while (st.hasMoreTokens()) {
        String element = st.nextToken();
        URL libURL = new URL(baseURL, element);
        if (!"file".equals(libURL.getProtocol())) {
            log("Skipping jar library " + element
                    + " since only relative URLs are supported by this loader",
                    Project.MSG_VERBOSE);
            continue;
        }
        String decoded = Locator.decodeUri(libURL.getFile());
        File libFile = new File(decoded);
        if (libFile.exists() && !isInPath(libFile)) {
            addPathFile(libFile);
        }
    }
}