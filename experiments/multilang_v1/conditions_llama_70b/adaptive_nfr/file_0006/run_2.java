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
    if (!pathComponents.contains(pathComponent)) {
        pathComponents.addElement(pathComponent);
    }
    if (pathComponent.isDirectory()) {
        return;
    }

    String absPathPlusTimeAndLength = pathComponent.getAbsolutePath()
            + pathComponent.lastModified() + "-" + pathComponent.length();
    String classpath = (String) pathMap.get(absPathPlusTimeAndLength);
    if (classpath == null) {
        classpath = getManifestClasspath(pathComponent);
        pathMap.put(absPathPlusTimeAndLength, classpath);
    }

    if (!"".equals(classpath)) {
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
}

/**
 * Get the classpath from the manifest of a given jar file.
 *
 * @param jarFile the jar file from which to read the manifest.
 *
 * @return the classpath specified in the manifest or an empty string if
 *         no manifest or no classpath is found.
 */
private String getManifestClasspath(File jarFile) {
    try {
        JarFile jar = new JarFile(jarFile);
        Manifest manifest = jar.getManifest();
        if (manifest == null) {
            return "";
        }
        return manifest.getMainAttributes().getValue(Attributes.Name.CLASS_PATH);
    } catch (IOException e) {
        return "";
    }
}