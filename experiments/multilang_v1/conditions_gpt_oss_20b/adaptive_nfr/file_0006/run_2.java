protected void addPathFile(File pathComponent) throws IOException {
        if (!pathComponents.contains(pathComponent)) {
            pathComponents.addElement(pathComponent);
        }
        if (pathComponent.isDirectory()) {
            return;
        }

        String key = getJarKey(pathComponent);
        String classpath = pathMap.get(key);
        if (classpath == null) {
            classpath = readClasspathFromJar(pathComponent);
            pathMap.put(key, classpath);
        }

        if (!classpath.isEmpty()) {
            addClasspathElements(pathComponent, classpath);
        }
    }

    /**
     * Builds a unique key for a jar file based on its absolute path,
     * last modified time and length.
     */
    private String getJarKey(File file) {
        return file.getAbsolutePath() + file.lastModified() + "-" + file.length();
    }

    /**
     * Reads the {@code Class-Path} attribute from the manifest of the given jar.
     *
     * @param jarFile the jar file to read
     * @return the class path string or an empty string if none
     * @throws IOException if an I/O error occurs
     */
    private String readClasspathFromJar(File jarFile) throws IOException {
        JarFile jf = null;
        try {
            jf = new JarFile(jarFile);
            Manifest manifest = jf.getManifest();
            if (manifest == null) {
                return "";
            }
            return manifest.getMainAttributes()
                    .getValue(Attributes.Name.CLASS_PATH);
        } finally {
            if (jf != null) {
                jf.close();
            }
        }
    }

    /**
     * Adds the class path entries specified in {@code classpath} relative
     * to {@code baseFile} to this loader.
     *
     * @param baseFile the jar or directory that defines the base URL
     * @param classpath the class path string from the manifest
     * @throws IOException if an I/O error occurs
     */
    private void addClasspathElements(File baseFile, String classpath) throws IOException {
        URL baseURL = FILE_UTILS.getFileURL(baseFile);
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
            String decodedPath = Locator.decodeUri(libURL.getFile());
            File libFile = new File(decodedPath);
            if (libFile.exists() && !isInPath(libFile)) {
                addPathFile(libFile);
            }
        }
    }