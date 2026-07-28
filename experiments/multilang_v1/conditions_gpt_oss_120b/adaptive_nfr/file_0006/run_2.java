/*
 *  Licensed to the Apache Software Foundation (ASF) under one or more
 *  contributor license agreements.  See the NOTICE file distributed with
 *  this work for additional information regarding copyright ownership.
 *  The ASF licenses this file to You under the Apache License, Version 2.0
 *  (the "License"); you may not use this file except in compliance with
 *  the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */
package org.apache.tools.ant;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.net.MalformedURLException;
import java.net.URL;
import java.security.CodeSource;
import java.security.ProtectionDomain;
import java.security.cert.Certificate;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Hashtable;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.StringTokenizer;
import java.util.Vector;
import java.util.jar.Attributes;
import java.util.jar.Attributes.Name;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.jar.Manifest;
import org.apache.tools.ant.types.Path;
import org.apache.tools.ant.util.CollectionUtils;
import org.apache.tools.ant.util.FileUtils;
import org.apache.tools.ant.util.JavaEnvUtils;
import org.apache.tools.ant.util.LoaderUtils;
import org.apache.tools.ant.util.ReflectUtil;
import org.apache.tools.ant.util.VectorSet;
import org.apache.tools.ant.launch.Locator;

/**
 * Used to load classes within ant with a different classpath from
 * that used to start ant. Note that it is possible to force a class
 * into this loader even when that class is on the system classpath by
 * using the forceLoadClass method. Any subsequent classes loaded by that
 * class will then use this loader rather than the system class loader.
 *
 * <p>
 * Note that this classloader has a feature to allow loading
 * in reverse order and for "isolation".
 * Due to the fact that a number of
 * methods in java.lang.ClassLoader are final (at least
 * in java 1.4 getResources) this means that the
 * class has to fake the given parent.
 * </p>
 *
 */
public class AntClassLoader extends ClassLoader implements SubBuildListener {

    private static final FileUtils FILE_UTILS = FileUtils.getFileUtils();

    /**
     * An enumeration of all resources of a given name found within the
     * classpath of this class loader. This enumeration is used by the
     * ClassLoader.findResources method, which is in
     * turn used by the ClassLoader.getResources method.
     *
     * @see AntClassLoader#findResources(String)
     * @see java.lang.ClassLoader#getResources(String)
     */
    private class ResourceEnumeration implements Enumeration<URL> {
        /**
         * The name of the resource being searched for.
         */
        private String resourceName;

        /**
         * The index of the next classpath element to search.
         */
        private int pathElementsIndex;

        /**
         * The URL of the next resource to return in the enumeration. If this
         * field is <code>null</code> then the enumeration has been completed,
         * i.e., there are no more elements to return.
         */
        private URL nextResource;

        /**
         * Constructs a new enumeration of resources of the given name found
         * within this class loader's classpath.
         *
         * @param name the name of the resource to search for.
         */
        ResourceEnumeration(String name) {
            this.resourceName = name;
            this.pathElementsIndex = 0;
            findNextResource();
        }

        public boolean hasMoreElements() {
            return (this.nextResource != null);
        }

        public URL nextElement() {
            URL ret = this.nextResource;
            if (ret == null) {
                throw new NoSuchElementException();
            }
            findNextResource();
            return ret;
        }

        private void findNextResource() {
            URL url = null;
            while ((pathElementsIndex < pathComponents.size()) && (url == null)) {
                try {
                    File pathComponent = (File) pathComponents.elementAt(pathElementsIndex);
                    url = getResourceURL(pathComponent, this.resourceName);
                    pathElementsIndex++;
                } catch (BuildException e) {
                    // ignore path elements which are not valid relative to the
                    // project
                }
            }
            this.nextResource = url;
        }
    }

    /**
     * The size of buffers to be used in this classloader.
     */
    private static final int BUFFER_SIZE = 8192;

    /**
     * Number of array elements in a test array of strings
     */
    private static final int NUMBER_OF_STRINGS = 256;

    /**
     * The components of the classpath that the classloader searches
     * for classes.
     */
    private Vector<File> pathComponents  = new VectorSet<File>();

    /**
     * The project to which this class loader belongs.
     */
    private Project project;

    /**
     * Indicates whether the parent class loader should be
     * consulted before trying to load with this class loader.
     */
    private boolean parentFirst = true;

    /**
     * These are the package roots that are to be loaded by the parent class
     * loader regardless of whether the parent class loader is being searched
     * first or not.
     */
    private Vector<String> systemPackages = new Vector<String>();

    /**
     * These are the package roots that are to be loaded by this class loader
     * regardless of whether the parent class loader is being searched first
     * or not.
     */
    private Vector<String> loaderPackages = new Vector<String>();

    /**
     * Whether or not this classloader will ignore the base
     * classloader if it can't find a class.
     *
     * @see #setIsolated(boolean)
     */
    private boolean ignoreBase = false;

    /**
     * The parent class loader, if one is given or can be determined.
     */
    private ClassLoader parent = null;

    /**
     * A hashtable of zip files opened by the classloader (File to JarFile).
     */
    private Hashtable<File, JarFile> jarFiles = new Hashtable<File, JarFile>();

    /** Static map of jar file/time to manifest class-path entries */
    private static Map<String,String> pathMap = Collections.synchronizedMap(new HashMap<String, String>());

    /**
     * The context loader saved when setting the thread's current
     * context loader.
     */
    private ClassLoader savedContextLoader = null;

    /**
     * Whether or not the context loader is currently saved.
     */
    private boolean isContextLoaderSaved = false;

    public AntClassLoader(ClassLoader parent, Project project, Path classpath) {
        setParent(parent);
        setClassPath(classpath);
        setProject(project);
    }

    public AntClassLoader() {
        setParent(null);
    }

    public AntClassLoader(Project project, Path classpath) {
        setParent(null);
        setProject(project);
        setClassPath(classpath);
    }

    public AntClassLoader(
        ClassLoader parent, Project project, Path classpath, boolean parentFirst) {
        this(project, classpath);
        if (parent != null) {
            setParent(parent);
        }
        setParentFirst(parentFirst);
        addJavaLibraries();
    }

    public AntClassLoader(Project project, Path classpath, boolean parentFirst) {
        this(null, project, classpath, parentFirst);
    }

    public AntClassLoader(ClassLoader parent, boolean parentFirst) {
        setParent(parent);
        project = null;
        this.parentFirst = parentFirst;
    }

    public void setProject(Project project) {
        this.project = project;
        if (project != null) {
            project.addBuildListener(this);
        }
    }

    public void setClassPath(Path classpath) {
        pathComponents.removeAllElements();
        if (classpath != null) {
            Path actualClasspath = classpath.concatSystemClasspath("ignore");
            String[] pathElements = actualClasspath.list();
            for (int i = 0; i < pathElements.length; ++i) {
                try {
                    addPathElement(pathElements[i]);
                } catch (BuildException e) {
                    // ignore path elements which are invalid
                    // relative to the project
                }
            }
        }
    }

    public void setParent(ClassLoader parent) {
        this.parent = parent == null ? AntClassLoader.class.getClassLoader() : parent;
    }

    public void setParentFirst(boolean parentFirst) {
        this.parentFirst = parentFirst;
    }

    protected void log(String message, int priority) {
        if (project != null) {
            project.log(message, priority);
        }
    }

    public void setThreadContextLoader() {
        if (isContextLoaderSaved) {
            throw new BuildException("Context loader has not been reset");
        }
        if (LoaderUtils.isContextLoaderAvailable()) {
            savedContextLoader = LoaderUtils.getContextClassLoader();
            ClassLoader loader = this;
            if (project != null && "only".equals(project.getProperty("build.sysclasspath"))) {
                loader = this.getClass().getClassLoader();
            }
            LoaderUtils.setContextClassLoader(loader);
            isContextLoaderSaved = true;
        }
    }

    public void resetThreadContextLoader() {
        if (LoaderUtils.isContextLoaderAvailable() && isContextLoaderSaved) {
            LoaderUtils.setContextClassLoader(savedContextLoader);
            savedContextLoader = null;
            isContextLoaderSaved = false;
        }
    }

    public void addPathElement(String pathElement) throws BuildException {
        File pathComponent = project != null ? project.resolveFile(pathElement) : new File(
                pathElement);
        try {
            addPathFile(pathComponent);
        } catch (IOException e) {
            throw new BuildException(e);
        }
    }

    public void addPathComponent(File file) {
        if (pathComponents.contains(file)) {
            return;
        }
        pathComponents.addElement(file);
    }

    /**
     * Adds a file to the classpath, handling manifest class‑path entries.
     *
     * @param pathComponent the file to add
     * @throws IOException if an I/O error occurs
     */
    protected void addPathFile(File pathComponent) throws IOException {
        addPathComponentIfAbsent(pathComponent);
        if (pathComponent.isDirectory()) {
            return;
        }

        String classpath = getOrLoadClasspath(pathComponent);
        if (!classpath.isEmpty()) {
            processClasspathElements(classpath, pathComponent);
        }
    }

    /**
     * Adds the component to the classpath if it is not already present.
     *
     * @param component the file to add
     */
    private void addPathComponentIfAbsent(File component) {
        if (!pathComponents.contains(component)) {
            pathComponents.addElement(component);
        }
    }

    /**
     * Retrieves a cached class‑path string or loads it from the JAR manifest.
     *
     * @param jar the JAR file
     * @return the class‑path string (may be empty)
     * @throws IOException if an I/O error occurs
     */
    private String getOrLoadClasspath(File jar) throws IOException {
        String key = computeCacheKey(jar);
        String classpath = pathMap.get(key);
        if (classpath == null) {
            classpath = loadClasspathFromJar(jar);
            if (classpath == null) {
                classpath = "";
            }
            pathMap.put(key, classpath);
        }
        return classpath;
    }

    /**
     * Computes a cache key based on file path, modification time and length.
     *
     * @param file the file
     * @return the cache key
     */
    private String computeCacheKey(File file) {
        return file.getAbsolutePath() + file.lastModified() + "-" + file.length();
    }

    /**
     * Loads the Class‑Path attribute from a JAR manifest.
     *
     * @param jar the JAR file
     * @return the Class‑Path attribute value, or {@code null} if none
     * @throws IOException if an I/O error occurs
     */
    private String loadClasspathFromJar(File jar) throws IOException {
        JarFile jarFile = null;
        try {
            jarFile = new JarFile(jar);
            Manifest manifest = jarFile.getManifest();
            if (manifest == null) {
                return null;
            }
            return manifest.getMainAttributes().getValue(Attributes.Name.CLASS_PATH);
        } finally {
            if (jarFile != null) {
                jarFile.close();
            }
        }
    }

    /**
     * Processes each element of a manifest Class‑Path attribute.
     *
     * @param classpath the space‑separated class‑path string
     * @param baseJar   the JAR file containing the manifest
     * @throws IOException if an I/O error occurs
     */
    private void processClasspathElements(String classpath, File baseJar) throws IOException {
        URL baseURL = FILE_UTILS.getFileURL(baseJar);
        StringTokenizer st = new StringTokenizer(classpath);
        while (st.hasMoreTokens()) {
            String element = st.nextToken();
            URL libraryURL = new URL(baseURL, element);
            if (!"file".equals(libraryURL.getProtocol())) {
                log("Skipping jar library " + element
                        + " since only relative URLs are supported by this loader",
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

    public String getClasspath() {
        final StringBuilder sb = new StringBuilder();
        boolean firstPass = true;
        Enumeration<File> componentEnum = pathComponents.elements();
        while (componentEnum.hasMoreElements()) {
            if (!firstPass) {
                sb.append(System.getProperty("path.separator"));
            } else {
                firstPass = false;
            }
            sb.append(componentEnum.nextElement().getAbsolutePath());
        }
        return sb.toString();
    }

    public synchronized void setIsolated(boolean isolated) {
        ignoreBase = isolated;
    }

    public static void initializeClass(Class<?> theClass) {
        final Constructor<?>[] cons = theClass.getDeclaredConstructors();
        if (cons != null) {
            if (cons.length > 0 && cons[0] != null) {
                final String[] strs = new String[NUMBER_OF_STRINGS];
                try {
                    cons[0].newInstance((Object[]) strs);
                } catch (Exception e) {
                    // ignore – we only wanted static initializers to run
                }
            }
        }
    }

    public void addSystemPackageRoot(String packageRoot) {
        systemPackages.addElement(packageRoot + (packageRoot.endsWith(".") ? "" : "."));
    }

    public void addLoaderPackageRoot(String packageRoot) {
        loaderPackages.addElement(packageRoot + (packageRoot.endsWith(".") ? "" : "."));
    }

    public Class<?> forceLoadClass(String classname) throws ClassNotFoundException {
        log("force loading " + classname, Project.MSG_DEBUG);
        Class<?> theClass = findLoadedClass(classname);
        if (theClass == null) {
            theClass = findClass(classname);
        }
        return theClass;
    }

    public Class<?> forceLoadSystemClass(String classname) throws ClassNotFoundException {
        log("force system loading " + classname, Project.MSG_DEBUG);
        Class<?> theClass = findLoadedClass(classname);
        if (theClass == null) {
            theClass = findBaseClass(classname);
        }
        return theClass;
    }

    public InputStream getResourceAsStream(String name) {
        InputStream resourceStream = null;
        if (isParentFirst(name)) {
            resourceStream = loadBaseResource(name);
        }
        if (resourceStream != null) {
            log("ResourceStream for " + name
                + " loaded from parent loader", Project.MSG_DEBUG);
        } else {
            resourceStream = loadResource(name);
            if (resourceStream != null) {
                log("ResourceStream for " + name
                    + " loaded from ant loader", Project.MSG_DEBUG);
            }
        }
        if (resourceStream == null && !isParentFirst(name)) {
            if (ignoreBase) {
                resourceStream = getRootLoader() == null ? null : getRootLoader().getResourceAsStream(name);
            } else {
                resourceStream = loadBaseResource(name);
            }
            if (resourceStream != null) {
                log("ResourceStream for " + name + " loaded from parent loader",
                    Project.MSG_DEBUG);
            }
        }
        if (resourceStream == null) {
            log("Couldn't load ResourceStream for " + name, Project.MSG_DEBUG);
        }
        return resourceStream;
    }

    private InputStream loadResource(String name) {
        InputStream stream = null;
        Enumeration<File> e = pathComponents.elements();
        while (e.hasMoreElements() && stream == null) {
            File pathComponent = e.nextElement();
            stream = getResourceStream(pathComponent, name);
        }
        return stream;
    }

    private InputStream loadBaseResource(String name) {
        return parent == null ? super.getResourceAsStream(name) : parent.getResourceAsStream(name);
    }

    private InputStream getResourceStream(File file, String resourceName) {
        try {
            JarFile jarFile = (JarFile) jarFiles.get(file);
            if (jarFile == null && file.isDirectory()) {
                File resource = new File(file, resourceName);
                if (resource.exists()) {
                    return new FileInputStream(resource);
                }
            } else {
                if (jarFile == null) {
                    if (file.exists()) {
                        jarFile = new JarFile(file);
                        jarFiles.put(file, jarFile);
                    } else {
                        return null;
                    }
                    jarFile = (JarFile) jarFiles.get(file);
                }
                JarEntry entry = jarFile.getJarEntry(resourceName);
                if (entry != null) {
                    return jarFile.getInputStream(entry);
                }
            }
        } catch (Exception e) {
            log("Ignoring Exception " + e.getClass().getName() + ": " + e.getMessage()
                    + " reading resource " + resourceName + " from " + file, Project.MSG_VERBOSE);
        }
        return null;
    }

    private boolean isParentFirst(String resourceName) {
        boolean useParentFirst = parentFirst;
        for (Enumeration<String> e = systemPackages.elements(); e.hasMoreElements();) {
            String packageName = e.nextElement();
            if (resourceName.startsWith(packageName)) {
                useParentFirst = true;
                break;
            }
        }
        for (Enumeration<String> e = loaderPackages.elements(); e.hasMoreElements();) {
            String packageName = e.nextElement();
            if (resourceName.startsWith(packageName)) {
                useParentFirst = false;
                break;
            }
        }
        return useParentFirst;
    }

    private ClassLoader getRootLoader() {
        ClassLoader ret = getClass().getClassLoader();
        while (ret != null && ret.getParent() != null) {
            ret = ret.getParent();
        }
        return ret;
    }

    public URL getResource(String name) {
        URL url = null;
        if (isParentFirst(name)) {
            url = parent == null ? super.getResource(name) : parent.getResource(name);
        }
        if (url != null) {
            log("Resource " + name + " loaded from parent loader", Project.MSG_DEBUG);
        } else {
            Enumeration<File> e = pathComponents.elements();
            while (e.hasMoreElements() && url == null) {
                File pathComponent = e.nextElement();
                url = getResourceURL(pathComponent, name);
                if (url != null) {
                    log("Resource " + name + " loaded from ant loader", Project.MSG_DEBUG);
                }
            }
        }
        if (url == null && !isParentFirst(name)) {
            if (ignoreBase) {
                url = getRootLoader() == null ? null : getRootLoader().getResource(name);
            } else {
                url = parent == null ? super.getResource(name) : parent.getResource(name);
            }
            if (url != null) {
                log("Resource " + name + " loaded from parent loader", Project.MSG_DEBUG);
            }
        }
        if (url == null) {
            log("Couldn't load Resource " + name, Project.MSG_DEBUG);
        }
        return url;
    }

    public Enumeration<URL> getNamedResources(String name)
        throws IOException {
        return findResources(name, false);
    }

    protected Enumeration<URL> findResources(String name) throws IOException {
        return findResources(name, true);
    }

    protected Enumeration<URL> findResources(String name,
                                                 boolean parentHasBeenSearched)
        throws IOException {
        Enumeration<URL> mine = new ResourceEnumeration(name);
        Enumeration<URL> base;
        if (parent != null && (!parentHasBeenSearched || parent != getParent())) {
            base = parent.getResources(name);
        } else {
            base = new CollectionUtils.EmptyEnumeration<URL>();
        }
        if (isParentFirst(name)) {
            return CollectionUtils.append(base, mine);
        }
        if (ignoreBase) {
            return getRootLoader() == null ? mine : CollectionUtils.append(mine, getRootLoader()
                    .getResources(name));
        }
        return CollectionUtils.append(mine, base);
    }

    protected URL getResourceURL(File file, String resourceName) {
        try {
            JarFile jarFile = (JarFile) jarFiles.get(file);
            if (jarFile == null && file.isDirectory()) {
                File resource = new File(file, resourceName);
                if (resource.exists()) {
                    try {
                        return FILE_UTILS.getFileURL(resource);
                    } catch (MalformedURLException ex) {
                        return null;
                    }
                }
            } else {
                if (jarFile == null) {
                    if (file.exists()) {
                        jarFile = new JarFile(file);
                        jarFiles.put(file, jarFile);
                    } else {
                        return null;
                    }
                    jarFile = (JarFile) jarFiles.get(file);
                }
                JarEntry entry = jarFile.getJarEntry(resourceName);
                if (entry != null) {
                    try {
                        return new URL("jar:" + FILE_UTILS.getFileURL(file) + "!/" + entry);
                    } catch (MalformedURLException ex) {
                        return null;
                    }
                }
            }
        } catch (Exception e) {
            String msg = "Unable to obtain resource from " + file + ": ";
            log(msg + e, Project.MSG_WARN);
            System.err.println(msg);
            e.printStackTrace();
        }
        return null;
    }

    protected synchronized Class<?> loadClass(String classname, boolean resolve)
            throws ClassNotFoundException {
        Class<?> theClass = findLoadedClass(classname);
        if (theClass != null) {
            return theClass;
        }
        if (isParentFirst(classname)) {
            try {
                theClass = findBaseClass(classname);
                log("Class " + classname + " loaded from parent loader " + "(parentFirst)",
                        Project.MSG_DEBUG);
            } catch (ClassNotFoundException cnfe) {
                theClass = findClass(classname);
                log("Class " + classname + " loaded from ant loader " + "(parentFirst)",
                        Project.MSG_DEBUG);
            }
        } else {
            try {
                theClass = findClass(classname);
                log("Class " + classname + " loaded from ant loader", Project.MSG_DEBUG);
            } catch (ClassNotFoundException cnfe) {
                if (ignoreBase) {
                    throw cnfe;
                }
                theClass = findBaseClass(classname);
                log("Class " + classname + " loaded from parent loader", Project.MSG_DEBUG);
            }
        }
        if (resolve) {
            resolveClass(theClass);
        }
        return theClass;
    }

    private String getClassFilename(String classname) {
        return classname.replace('.', '/') + ".class";
    }

    protected Class<?> defineClassFromData(File container, byte[] classData, String classname)
            throws IOException {
        definePackage(container, classname);
        ProtectionDomain currentPd = Project.class.getProtectionDomain();
        String classResource = getClassFilename(classname);
        CodeSource src = new CodeSource(FILE_UTILS.getFileURL(container),
                                        getCertificates(container,
                                                        classResource));
        ProtectionDomain classesPd =
            new ProtectionDomain(src, currentPd.getPermissions(),
                                 this,
                                 currentPd.getPrincipals());
        return defineClass(classname, classData, 0, classData.length,
                           classesPd);
    }

    protected void definePackage(File container, String className) throws IOException {
        int classIndex = className.lastIndexOf('.');
        if (classIndex == -1) {
            return;
        }
        String packageName = className.substring(0, classIndex);
        if (getPackage(packageName) != null) {
            return;
        }
        Manifest manifest = getJarManifest(container);
        if (manifest == null) {
            definePackage(packageName, null, null, null, null, null, null, null);
        } else {
            definePackage(container, packageName, manifest);
        }
    }

    private Manifest getJarManifest(File container) throws IOException {
        if (container.isDirectory()) {
            return null;
        }
        JarFile jarFile = (JarFile) jarFiles.get(container);
        if (jarFile == null) {
            return null;
        }
        return jarFile.getManifest();
    }

    private Certificate[] getCertificates(File container, String entry)
        throws IOException {
        if (container.isDirectory()) {
            return null;
        }
        JarFile jarFile = (JarFile) jarFiles.get(container);
        if (jarFile == null) {
            return null;
        }
        JarEntry ent = jarFile.getJarEntry(entry);
        return ent == null ? null : ent.getCertificates();
    }

    protected void definePackage(File container, String packageName, Manifest manifest) {
        String sectionName = packageName.replace('.', '/') + "/";

        String specificationTitle = null;
        String specificationVendor = null;
        String specificationVersion = null;
        String implementationTitle = null;
        String implementationVendor = null;
        String implementationVersion = null;
        String sealedString = null;
        URL sealBase = null;

        Attributes sectionAttributes = manifest.getAttributes(sectionName);
        if (sectionAttributes != null) {
            specificationTitle = sectionAttributes.getValue(Name.SPECIFICATION_TITLE);
            specificationVendor = sectionAttributes.getValue(Name.SPECIFICATION_VENDOR);
            specificationVersion = sectionAttributes.getValue(Name.SPECIFICATION_VERSION);
            implementationTitle = sectionAttributes.getValue(Name.IMPLEMENTATION_TITLE);
            implementationVendor = sectionAttributes.getValue(Name.IMPLEMENTATION_VENDOR);
            implementationVersion = sectionAttributes.getValue(Name.IMPLEMENTATION_VERSION);
            sealedString = sectionAttributes.getValue(Name.SEALED);
        }
        Attributes mainAttributes = manifest.getMainAttributes();
        if (mainAttributes != null) {
            if (specificationTitle == null) {
                specificationTitle = mainAttributes.getValue(Name.SPECIFICATION_TITLE);
            }
            if (specificationVendor == null) {
                specificationVendor = mainAttributes.getValue(Name.SPECIFICATION_VENDOR);
            }
            if (specificationVersion == null) {
                specificationVersion = mainAttributes.getValue(Name.SPECIFICATION_VERSION);
            }
            if (implementationTitle == null) {
                implementationTitle = mainAttributes.getValue(Name.IMPLEMENTATION_TITLE);
            }
            if (implementationVendor == null) {
                implementationVendor = mainAttributes.getValue(Name.IMPLEMENTATION_VENDOR);
            }
            if (implementationVersion == null) {
                implementationVersion = mainAttributes.getValue(Name.IMPLEMENTATION_VERSION);
            }
            if (sealedString == null) {
                sealedString = mainAttributes.getValue(Name.SEALED);
            }
        }
        if (sealedString != null && sealedString.equalsIgnoreCase("true")) {
            try {
                sealBase = new URL(FileUtils.getFileUtils().toURI(container.getAbsolutePath()));
            } catch (MalformedURLException e) {
                // ignore
            }
        }
        definePackage(packageName, specificationTitle, specificationVersion, specificationVendor,
                implementationTitle, implementationVersion, implementationVendor, sealBase);
    }

    private Class<?> getClassFromStream(InputStream stream, String classname, File container)
            throws IOException, SecurityException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        int bytesRead = -1;
        byte[] buffer = new byte[BUFFER_SIZE];

        while ((bytesRead = stream.read(buffer, 0, BUFFER_SIZE)) != -1) {
            baos.write(buffer, 0, bytesRead);
        }
        byte[] classData = baos.toByteArray();
        return defineClassFromData(container, classData, classname);
    }

    public Class<?> findClass(String name) throws ClassNotFoundException {
        log("Finding class " + name, Project.MSG_DEBUG);
        return findClassInComponents(name);
    }

    protected boolean isInPath(File component) {
        return pathComponents.contains(component);
    }

    private Class<?> findClassInComponents(String name)
        throws ClassNotFoundException {
        String classFilename = getClassFilename(name);
        Enumeration<File> e = pathComponents.elements();
        while (e.hasMoreElements()) {
            File pathComponent = (File) e.nextElement();
            InputStream stream = null;
            try {
                stream = getResourceStream(pathComponent, classFilename);
                if (stream != null) {
                    log("Loaded from " + pathComponent + " "
                        + classFilename, Project.MSG_DEBUG);
                    return getClassFromStream(stream, name, pathComponent);
                }
            } catch (SecurityException se) {
                throw se;
            } catch (IOException ioe) {
                log("Exception reading component " + pathComponent + " (reason: "
                        + ioe.getMessage() + ")", Project.MSG_VERBOSE);
            } finally {
                FileUtils.close(stream);
            }
        }
        throw new ClassNotFoundException(name);
    }

    private Class<?> findBaseClass(String name) throws ClassNotFoundException {
        return parent == null ? findSystemClass(name) : parent.loadClass(name);
    }

    public synchronized void cleanup() {
        for (Enumeration<JarFile> e = jarFiles.elements(); e.hasMoreElements();) {
            JarFile jarFile = e.nextElement();
            try {
                jarFile.close();
            } catch (IOException ioe) {
                // ignore
            }
        }
        jarFiles = new Hashtable<File, JarFile>();
        if (project != null) {
            project.removeBuildListener(this);
        }
        project = null;
    }

    public ClassLoader getConfiguredParent() {
        return parent;
    }

    public void buildStarted(BuildEvent event) {
        // Not significant for the class loader.
    }

    public void buildFinished(BuildEvent event) {
        cleanup();
    }

    public void subBuildFinished(BuildEvent event) {
        if (event.getProject() == project) {
            cleanup();
        }
    }

    public void subBuildStarted(BuildEvent event) {
        // Not significant for the class loader.
    }

    public void targetStarted(BuildEvent event) {
        // Not significant for the class loader.
    }

    public void targetFinished(BuildEvent event) {
        // Not significant for the class loader.
    }

    public void taskStarted(BuildEvent event) {
        // Not significant for the class loader.
    }

    public void taskFinished(BuildEvent event) {
        // Not significant for the class loader.
    }

    public void messageLogged(BuildEvent event) {
        // Not significant for the class loader.
    }

    public void addJavaLibraries() {
        Vector<String> packages = JavaEnvUtils.getJrePackages();
        Enumeration<String> e = packages.elements();
        while (e.hasMoreElements()) {
            String packageName = e.nextElement();
            addSystemPackageRoot(packageName);
        }
    }

    public String toString() {
        return "AntClassLoader[" + getClasspath() + "]";
    }

    private static Class<?> subClassToLoad = null;
    private static final Class<?>[] CONSTRUCTOR_ARGS = new Class[] {
        ClassLoader.class, Project.class, Path.class, Boolean.TYPE
    };

    static {
        if (JavaEnvUtils.isAtLeastJavaVersion(JavaEnvUtils.JAVA_1_5)) {
            try {
                subClassToLoad =
                    Class.forName("org.apache.tools.ant.loader.AntClassLoader5");
            } catch (ClassNotFoundException e) {
                // this is Java5 but the installation is lacking our subclass
            }
        }
    }

    public static AntClassLoader newAntClassLoader(ClassLoader parent,
                                                   Project project,
                                                   Path path,
                                                   boolean parentFirst) {
        if (subClassToLoad != null) {
            return (AntClassLoader)
                ReflectUtil.newInstance(subClassToLoad,
                                        CONSTRUCTOR_ARGS,
                                        new Object[] {
                                            parent, project, path,
                                            Boolean.valueOf(parentFirst)
                                        });
        }
        return new AntClassLoader(parent, project, path, parentFirst);
    }

}