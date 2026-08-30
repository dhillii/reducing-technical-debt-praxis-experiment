/* Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.apache.tools.ant;

import java.io.File;
import java.io.IOException;
import java.io.EOFException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Collections;
import java.util.Enumeration;
import java.util.Hashtable;
import java.util.Properties;
import java.util.Stack;
import java.util.Vector;
import java.util.Set;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Map;
import java.util.WeakHashMap;
import org.apache.tools.ant.input.DefaultInputHandler;
import org.apache.tools.ant.input.InputHandler;
import org.apache.tools.ant.helper.DefaultExecutor;
import org.apache.tools.ant.types.FilterSet;
import org.apache.tools.ant.types.FilterSetCollection;
import org.apache.tools.ant.types.Description;
import org.apache.tools.ant.types.Path;
import org.apache.tools.ant.types.Resource;
import org.apache.tools.ant.types.ResourceFactory;
import org.apache.tools.ant.types.resources.FileResource;
import org.apache.tools.ant.util.CollectionUtils;
import org.apache.tools.ant.util.FileUtils;
import org.apache.tools.ant.util.JavaEnvUtils;
import org.apache.tools.ant.util.StringUtils;
import org.apache.tools.ant.util.VectorSet;

public class Project implements ResourceFactory {
    public static final int MSG_ERR = 0;
    public static final int MSG_WARN = 1;
    public static final int MSG_INFO = 2;
    public static final int MSG_VERBOSE = 3;
    public static final int MSG_DEBUG = 4;

    private static final String VISITING = "VISITING";
    private static final String VISITED = "VISITED";

    public static final String JAVA_1_0 = JavaEnvUtils.JAVA_1_0;
    public static final String JAVA_1_1 = JavaEnvUtils.JAVA_1_1;
    public static final String JAVA_1_2 = JavaEnvUtils.JAVA_1_2;
    public static final String JAVA_1_3 = JavaEnvUtils.JAVA_1_3;
    public static final String JAVA_1_4 = JavaEnvUtils.JAVA_1_4;

    public static final String TOKEN_START = FilterSet.DEFAULT_TOKEN_START;
    public static final String TOKEN_END = FilterSet.DEFAULT_TOKEN_END;

    private static final FileUtils FILE_UTILS = FileUtils.getFileUtils();

    private String name;
    private String description;

    private Hashtable<String, Object> references = new AntRefTable();
    private HashMap<String, Object> idReferences = new HashMap<String, Object>();
    private String defaultTarget;

    private Hashtable<String, Target> targets = new Hashtable<String, Target>();
    private FilterSet globalFilterSet = new FilterSet() {
        {
            setProject(Project.this);
        }
    };

    private FilterSetCollection globalFilters = new FilterSetCollection(globalFilterSet);

    private File baseDir;

    private final Object listenersLock = new Object();
    private volatile BuildListener[] listeners = new BuildListener[0];

    private final ThreadLocal<Boolean> isLoggingMessage = new ThreadLocal<Boolean>() {
        protected Boolean initialValue() {
            return Boolean.FALSE;
        }
    };

    private ClassLoader coreLoader = null;

    private final Map<Thread, Task> threadTasks = Collections.synchronizedMap(new WeakHashMap<Thread, Task>());
    private final Map<ThreadGroup, Task> threadGroupTasks = Collections.synchronizedMap(new WeakHashMap<ThreadGroup, Task>());

    private InputHandler inputHandler = null;
    private InputStream defaultInputStream = null;
    private boolean keepGoingMode = false;

    public void setInputHandler(InputHandler handler) {
        inputHandler = handler;
    }

    public void setDefaultInputStream(InputStream defaultInputStream) {
        this.defaultInputStream = defaultInputStream;
    }

    public InputStream getDefaultInputStream() {
        return defaultInputStream;
    }

    public InputHandler getInputHandler() {
        return inputHandler;
    }

    public Project() {
        inputHandler = new DefaultInputHandler();
    }

    public Project createSubProject() {
        Project subProject = null;
        try {
            subProject = (Project) (getClass().newInstance());
        } catch (Exception e) {
            subProject = new Project();
        }
        initSubProject(subProject);
        return subProject;
    }

    public void initSubProject(Project subProject) {
        ComponentHelper.getComponentHelper(subProject)
            .initSubProject(ComponentHelper.getComponentHelper(this));
        subProject.setDefaultInputStream(getDefaultInputStream());
        subProject.setKeepGoingMode(isKeepGoingMode());
        subProject.setExecutor(getExecutor().getSubProjectExecutor());
    }

    public void init() throws BuildException {
        initProperties();
        ComponentHelper.getComponentHelper(this).initDefaultDefinitions();
    }

    public void initProperties() throws BuildException {
        setJavaVersionProperty();
        setSystemProperties();
        setPropertyInternal(MagicNames.ANT_VERSION, Main.getAntVersion());
        setAntLib();
    }

    private void setAntLib() {
        File antlib = org.apache.tools.ant.launch.Locator.getClassSource(Project.class);
        if (antlib != null) {
            setPropertyInternal(MagicNames.ANT_LIB, antlib.getAbsolutePath());
        }
    }

    public AntClassLoader createClassLoader(Path path) {
        return AntClassLoader.newAntClassLoader(getClass().getClassLoader(), this, path, true);
    }

    public AntClassLoader createClassLoader(ClassLoader parent, Path path) {
        return AntClassLoader.newAntClassLoader(parent, this, path, true);
    }

    public void setCoreLoader(ClassLoader coreLoader) {
        this.coreLoader = coreLoader;
    }

    public ClassLoader getCoreLoader() {
        return coreLoader;
    }

    public void addBuildListener(BuildListener listener) {
        synchronized (listenersLock) {
            for (int i = 0; i < listeners.length; i++) {
                if (listeners[i] == listener) {
                    return;
                }
            }
            BuildListener[] newListeners = new BuildListener[listeners.length + 1];
            System.arraycopy(listeners, 0, newListeners, 0, listeners.length);
            newListeners[listeners.length] = listener;
            listeners = newListeners;
        }
    }

    public void removeBuildListener(BuildListener listener) {
        synchronized (listenersLock) {
            for (int i = 0; i < listeners.length; i++) {
                if (listeners[i] == listener) {
                    BuildListener[] newListeners = new BuildListener[listeners.length - 1];
                    System.arraycopy(listeners, 0, newListeners, 0, i);
                    System.arraycopy(listeners, i + 1, newListeners, i, listeners.length - i - 1);
                    listeners = newListeners;
                    break;
                }
            }
        }
    }

    public Vector<BuildListener> getBuildListeners() {
        synchronized (listenersLock) {
            Vector<BuildListener> r = new Vector<BuildListener>(listeners.length);
            for (int i = 0; i < listeners.length; i++) {
                r.add(listeners[i]);
            }
            return r;
        }
    }

    public void log(String message) {
        log(message, MSG_INFO);
    }

    public void log(String message, int msgLevel) {
        log(message, null, msgLevel);
    }

    public void log(String message, Throwable throwable, int msgLevel) {
        fireMessageLogged(this, message, throwable, msgLevel);
    }

    public void log(Task task, String message, int msgLevel) {
        fireMessageLogged(task, message, null, msgLevel);
    }

    public void log(Task task, String message, Throwable throwable, int msgLevel) {
        fireMessageLogged(task, message, throwable, msgLevel);
    }

    public void log(Target target, String message, int msgLevel) {
        log(target, message, null, msgLevel);
    }

    public void log(Target target, String message, Throwable throwable, int msgLevel) {
        fireMessageLogged(target, message, throwable, msgLevel);
    }

    public FilterSet getGlobalFilterSet() {
        return globalFilterSet;
    }

    public void setProperty(String name, String value) {
        PropertyHelper.getPropertyHelper(this).setProperty(name, value, true);
    }

    public void setNewProperty(String name, String value) {
        PropertyHelper.getPropertyHelper(this).setNewProperty(name, value);
    }

    public void setUserProperty(String name, String value) {
        PropertyHelper.getPropertyHelper(this).setUserProperty(name, value);
    }

    public void setInheritedProperty(String name, String value) {
        PropertyHelper.getPropertyHelper(this).setInheritedProperty(name, value);
    }

    private void setPropertyInternal(String name, String value) {
        PropertyHelper.getPropertyHelper(this).setProperty(name, value, false);
    }

    public String getProperty(String propertyName) {
        Object value = PropertyHelper.getPropertyHelper(this).getProperty(propertyName);
        return value == null ? null : String.valueOf(value);
    }

    public String replaceProperties(String value) throws BuildException {
        return PropertyHelper.getPropertyHelper(this).replaceProperties(null, value, null);
    }

    public String getUserProperty(String propertyName) {
        return (String) PropertyHelper.getPropertyHelper(this).getUserProperty(propertyName);
    }

    public Hashtable<String, Object> getProperties() {
        return PropertyHelper.getPropertyHelper(this).getProperties();
    }

    public Hashtable<String, Object> getUserProperties() {
        return PropertyHelper.getPropertyHelper(this).getUserProperties();
    }

    public Hashtable<String, Object> getInheritedProperties() {
        return PropertyHelper.getPropertyHelper(this).getInheritedProperties();
    }

    public void copyUserProperties(Project other) {
        PropertyHelper.getPropertyHelper(this).copyUserProperties(other);
    }

    public void copyInheritedProperties(Project other) {
        PropertyHelper.getPropertyHelper(this).copyInheritedProperties(other);
    }

    public void setDefaultTarget(String defaultTarget) {
        setDefault(defaultTarget);
    }

    public String getDefaultTarget() {
        return defaultTarget;
    }

    public void setDefault(String defaultTarget) {
        if (defaultTarget != null) {
            setUserProperty(MagicNames.PROJECT_DEFAULT_TARGET, defaultTarget);
        }
        this.defaultTarget = defaultTarget;
    }

    public void setName(String name) {
        setUserProperty(MagicNames.PROJECT_NAME, name);
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getDescription() {
        if (description == null) {
            description = Description.getDescription(this);
        }
        return description;
    }

    public void addFilter(String token, String value) {
        if (token == null) {
            return;
        }
        globalFilterSet.addFilter(new FilterSet.Filter(token, value));
    }

    public Hashtable<String, String> getFilters() {
        return globalFilterSet.getFilterHash();
    }

    public void setBasedir(String baseD) throws BuildException {
        setBaseDir(new File(baseD));
    }

    public void setBaseDir(File baseDir) throws BuildException {
        validateAndSetBaseDir(FILE_UTILS.normalize(baseDir.getAbsolutePath()));
    }

    private void validateAndSetBaseDir(File normalizedBaseDir) throws BuildException {
        validateBaseDirExists(normalizedBaseDir);
        validateBaseDirIsDirectory(normalizedBaseDir);
        this.baseDir = normalizedBaseDir;
        setPropertyInternal(MagicNames.PROJECT_BASEDIR, this.baseDir.getPath());
        log("Project base dir set to: " + this.baseDir, MSG_VERBOSE);
    }

    private void validateBaseDirExists(File baseDir) throws BuildException {
        if (!baseDir.exists()) {
            throw new BuildException("Basedir " + baseDir.getAbsolutePath() + " does not exist");
        }
    }

    private void validateBaseDirIsDirectory(File baseDir) throws BuildException {
        if (!baseDir.isDirectory()) {
            throw new BuildException("Basedir " + baseDir.getAbsolutePath() + " is not a directory");
        }
    }

    public File getBaseDir() {
        if (baseDir == null) {
            try {
                setBasedir(".");
            } catch (BuildException ex) {
                ex.printStackTrace();
            }
        }
        return baseDir;
    }

    public void setKeepGoingMode(boolean keepGoingMode) {
        this.keepGoingMode = keepGoingMode;
    }

    public boolean isKeepGoingMode() {
        return this.keepGoingMode;
    }

    public static String getJavaVersion() {
        return JavaEnvUtils.getJavaVersion();
    }

    public void setJavaVersionProperty() throws BuildException {
        String javaVersion = JavaEnvUtils.getJavaVersion();
        setPropertyInternal(MagicNames.ANT_JAVA_VERSION, javaVersion);

        if (!JavaEnvUtils.isAtLeastJavaVersion(JavaEnvUtils.JAVA_1_4)) {
            throw new BuildException("Ant cannot work on Java prior to 1.4");
        }
        log("Detected Java version: " + javaVersion + " in: " + System.getProperty("java.home"), MSG_VERBOSE);
        log("Detected OS: " + System.getProperty("os.name"), MSG_VERBOSE);
    }

    public void setSystemProperties() {
        Properties systemP = System.getProperties();
        Enumeration<?> e = systemP.propertyNames();
        while (e.hasMoreElements()) {
            String propertyName = (String) e.nextElement();
            String value = systemP.getProperty(propertyName);
            if (value != null) {
                setPropertyInternal(propertyName, value);
            }
        }
    }

    public void addTaskDefinition(String taskName, Class<?> taskClass) throws BuildException {
        ComponentHelper.getComponentHelper(this).addTaskDefinition(taskName, taskClass);
    }

    public void checkTaskClass(final Class<?> taskClass) throws BuildException {
        ComponentHelper.getComponentHelper(this).checkTaskClass(taskClass);

        if (!Modifier.isPublic(taskClass.getModifiers())) {
            String message = taskClass + " is not public";
            log(message, MSG_ERR);
            throw new BuildException(message);
        }
        if (Modifier.isAbstract(taskClass.getModifiers())) {
            String message = taskClass + " is abstract";
            log(message, MSG_ERR);
            throw new BuildException(message);
        }
        try {
            taskClass.getConstructor();
        } catch (NoSuchMethodException e) {
            String message = "No public no-arg constructor in " + taskClass;
            log(message, MSG_ERR);
            throw new BuildException(message);
        } catch (LinkageError e) {
            String message = "Could not load " + taskClass + ": " + e;
            log(message, MSG_ERR);
            throw new BuildException(message, e);
        }
        if (!Task.class.isAssignableFrom(taskClass)) {
            TaskAdapter.checkTaskClass(taskClass, this);
        }
    }

    public Hashtable<String, Class<?>> getTaskDefinitions() {
        return ComponentHelper.getComponentHelper(this).getTaskDefinitions();
    }

    public Map<String, Class<?>> getCopyOfTaskDefinitions() {
        return new HashMap<String, Class<?>>(getTaskDefinitions());
    }

    public void addDataTypeDefinition(String typeName, Class<?> typeClass) {
        ComponentHelper.getComponentHelper(this).addDataTypeDefinition(typeName, typeClass);
    }

    public Hashtable<String, Class<?>> getDataTypeDefinitions() {
        return ComponentHelper.getComponentHelper(this).getDataTypeDefinitions();
    }

    public Map<String, Class<?>> getCopyOfDataTypeDefinitions() {
        return new HashMap<String, Class<?>>(getDataTypeDefinitions());
    }

    public void addTarget(Target target) throws BuildException {
        addTarget(target.getName(), target);
    }

    public void addTarget(String targetName, Target target) throws BuildException {
        if (targets.get(targetName) != null) {
            throw new BuildException("Duplicate target: `" + targetName + "'");
        }
        addOrReplaceTarget(targetName, target);
    }

    public void addOrReplaceTarget(Target target) {
        addOrReplaceTarget(target.getName(), target);
    }

    public void addOrReplaceTarget(String targetName, Target target) {
        String msg = "+Target: " + targetName;
        log(msg, MSG_DEBUG);
        target.setProject(this);
        targets.put(targetName, target);
    }

    public Hashtable<String, Target> getTargets() {
        return targets;
    }

    public Map<String, Target> getCopyOfTargets() {
        return new HashMap<String, Target>(targets);
    }

    public Task createTask(String taskType) throws BuildException {
        return ComponentHelper.getComponentHelper(this).createTask(taskType);
    }

    public Object createDataType(String typeName) throws BuildException {
        return ComponentHelper.getComponentHelper(this).createDataType(typeName);
    }

    public void setExecutor(Executor e) {
        addReference(MagicNames.ANT_EXECUTOR_REFERENCE, e);
    }

    public Executor getExecutor() {
        Object o = getReference(MagicNames.ANT_EXECUTOR_REFERENCE);
        if (o == null) {
            String classname = getProperty(MagicNames.ANT_EXECUTOR_CLASSNAME);
            if (classname == null) {
                classname = DefaultExecutor.class.getName();
            }
            log("Attempting to create object of type " + classname, MSG_DEBUG);
            try {
                o = Class.forName(classname, true, coreLoader).newInstance();
            } catch (ClassNotFoundException seaEnEfEx) {
                try {
                    o = Class.forName(classname).newInstance();
                } catch (Exception ex) {
                    log(ex.toString(), MSG_ERR);
                }
            } catch (Exception ex) {
                log(ex.toString(), MSG_ERR);
            }
            if (o == null) {
                throw new BuildException("Unable to obtain a Target Executor instance.");
            }
            setExecutor((Executor) o);
        }
        return (Executor) o;
    }

    public void executeTargets(Vector<String> names) throws BuildException {
        setUserProperty(MagicNames.PROJECT_INVOKED_TARGETS, CollectionUtils.flattenToString(names));
        getExecutor().executeTargets(this, names.toArray(new String[names.size()]));
    }

    public void demuxOutput(String output, boolean isWarning) {
        Task task = getThreadTask(Thread.currentThread());
        if (task == null) {
            log(output, isWarning ? MSG_WARN : MSG_INFO);
        } else {
            if (isWarning) {
                task.handleErrorOutput(output);
            } else {
                task.handleOutput(output);
            }
        }
    }

    public int defaultInput(byte[] buffer, int offset, int length) throws IOException {
        if (defaultInputStream != null) {
            System.out.flush();
            return defaultInputStream.read(buffer, offset, length);
        } else {
            throw new EOFException("No input provided for project");
        }
    }

    public int demuxInput(byte[] buffer, int offset, int length) throws IOException {
        Task task = getThreadTask(Thread.currentThread());
        if (task == null) {
            return defaultInput(buffer, offset, length);
        } else {
            return task.handleInput(buffer, offset, length);
        }
    }

    public void demuxFlush(String output, boolean isError) {
        Task task = getThreadTask(Thread.currentThread());
        if (task == null) {
            fireMessageLogged(this, output, isError ? MSG_ERR : MSG_INFO);
        } else {
            if (isError) {
                task.handleErrorFlush(output);
            } else {
                task.handleFlush(output);
            }
        }
    }

    public void executeTarget(String targetName) throws BuildException {
        if (targetName == null) {
            String msg = "No target specified";
            throw new BuildException(msg);
        }
        executeSortedTargets(topoSort(targetName, targets, false));
    }

    public void executeSortedTargets(Vector<Target> sortedTargets) throws BuildException {
        Set<String> succeededTargets = new HashSet<String>();
        BuildException buildException = null;
        for (Target curtarget : sortedTargets) {
            boolean canExecute = true;
            for (Enumeration<String> depIter = curtarget.getDependencies(); depIter.hasMoreElements();) {
                String dependencyName = depIter.nextElement();
                if (!succeededTargets.contains(dependencyName)) {
                    canExecute = false;
                    log(curtarget, "Cannot execute '" + curtarget.getName() + "' - '" + dependencyName + "' failed or was not executed.", MSG_ERR);
                    break;
                }
            }
            if (canExecute) {
                Throwable thrownException = null;
                try {
                    curtarget.performTasks();
                    succeededTargets.add(curtarget.getName());
                } catch (RuntimeException ex) {
                    if (!keepGoingMode) {
                        throw ex;
                    }
                    thrownException = ex;
                } catch (Throwable ex) {
                    if (!keepGoingMode) {
                        throw new BuildException(ex);
                    }
                    thrownException = ex;
                }
                if (thrownException != null) {
                    if (thrownException instanceof BuildException) {
                        log(curtarget, "Target '" + curtarget.getName() + "' failed with message '" + thrownException.getMessage() + "'.", MSG_ERR);
                        if (buildException == null) {
                            buildException = (BuildException) thrownException;
                        }
                    } else {
                        log(curtarget, "Target '" + curtarget.getName() + "' failed with message '" + thrownException.getMessage() + "'.", MSG_ERR);
                        thrownException.printStackTrace(System.err);
                        if (buildException == null) {
                            buildException = new BuildException(thrownException);
                        }
                    }
                }
            }
        }
        if (buildException != null) {
            throw buildException;
        }
    }

    public File resolveFile(String fileName, File rootDir) {
        return FILE_UTILS.resolveFile(rootDir, fileName);
    }

    public File resolveFile(String fileName) {
        return FILE_UTILS.resolveFile(baseDir, fileName);
    }

    public static String translatePath(String toProcess) {
        return FileUtils.translatePath(toProcess);
    }

    public void copyFile(String sourceFile, String destFile) throws IOException {
        FILE_UTILS.copyFile(sourceFile, destFile);
    }

    public void copyFile(String sourceFile, String destFile, boolean filtering) throws IOException {
        FILE_UTILS.copyFile(sourceFile, destFile, filtering ? globalFilters : null);
    }

    public void copyFile(String sourceFile, String destFile, boolean filtering, boolean overwrite) throws IOException {
        FILE_UTILS.copyFile(sourceFile, destFile, filtering ? globalFilters : null, overwrite);
    }

    public void copyFile(String sourceFile, String destFile, boolean filtering, boolean overwrite, boolean preserveLastModified) throws IOException {
        FILE_UTILS.copyFile(sourceFile, destFile, filtering ? globalFilters : null, overwrite, preserveLastModified);
    }

    public void copyFile(File sourceFile, File destFile) throws IOException {
        FILE_UTILS.copyFile(sourceFile, destFile);
    }

    public void copyFile(File sourceFile, File destFile, boolean filtering) throws IOException {
        FILE_UTILS.copyFile(sourceFile, destFile, filtering ? globalFilters : null);
    }

    public void copyFile(File sourceFile, File destFile, boolean filtering, boolean overwrite) throws IOException {
        FILE_UTILS.copyFile(sourceFile, destFile, filtering ? globalFilters : null, overwrite);
    }

    public void copyFile(File sourceFile, File destFile, boolean filtering, boolean overwrite, boolean preserveLastModified) throws IOException {
        FILE_UTILS.copyFile(sourceFile, destFile, filtering ? globalFilters : null, overwrite, preserveLastModified);
    }

    public void setFileLastModified(File file, long time) throws BuildException {
        FILE_UTILS.setFileLastModified(file, time);
        log("Setting modification time for " + file, MSG_VERBOSE);
    }

    public static boolean toBoolean(String s) {
        return ("on".equalsIgnoreCase(s) || "true".equalsIgnoreCase(s) || "yes".equalsIgnoreCase(s));
    }

    public static Project getProject(Object o) {
        if (o instanceof ProjectComponent) {
            return ((ProjectComponent) o).getProject();
        }
        try {
            Method m = o.getClass().getMethod("getProject", (Class[]) null);
            if (Project.class == m.getReturnType()) {
                return (Project) m.invoke(o, (Object[]) null);
            }
        } catch (Exception e) {
            // ignore
        }
        return null;
    }

    public final Vector<Target> topoSort(String root, Hashtable<String, Target> targetTable) throws BuildException {
        return topoSort(new String[] {root}, targetTable, true);
    }

    public final Vector<Target> topoSort(String root, Hashtable<String, Target> targetTable, boolean returnAll) throws BuildException {
        return topoSort(new String[] {root}, targetTable, returnAll);
    }

    public final Vector<Target> topoSort(String[] root, Hashtable<String, Target> targetTable, boolean returnAll) throws BuildException {
        Vector<Target> ret = new VectorSet<Target>();
        Hashtable<String, String> state = new Hashtable<String, String>();
        Stack<String> visiting = new Stack<String>();

        for (int i = 0; i < root.length; i++) {
            String st = state.get(root[i]);
            if (st == null) {
                tsort(root[i], targetTable, state, visiting, ret);
            } else if (st == VISITING) {
                throw new RuntimeException("Unexpected node in visiting state: " + root[i]);
            }
        }

        StringBuffer buf = new StringBuffer("Build sequence for target(s)");
        for (int j = 0; j < root.length; j++) {
            buf.append((j == 0) ? " `" : ", `").append(root[j]).append('\'');
        }
        buf.append(" is " + ret);
        log(buf.toString(), MSG_VERBOSE);

        Vector<Target> complete = returnAll ? ret : new Vector<Target>(ret);
        for (Enumeration<String> en = targetTable.keys(); en.hasMoreElements();) {
            String curTarget = en.nextElement();
            String st = state.get(curTarget);
            if (st == null) {
                tsort(curTarget, targetTable, state, visiting, complete);
            } else if (st == VISITING) {
                throw new RuntimeException("Unexpected node in visiting state: " + curTarget);
            }
        }
        log("Complete build sequence is " + complete, MSG_VERBOSE);
        return ret;
    }

    private void tsort(String root, Hashtable<String, Target> targetTable, Hashtable<String, String> state,
                       Stack<String> visiting, Vector<Target> ret) throws BuildException {
        state.put(root, VISITING);
        visiting.push(root);

        Target target = targetTable.get(root);

        if (target == null) {
            StringBuilder sb = new StringBuilder("Target \"");
            sb.append(root).append("\" does not exist in the project \"").append(name).append("\". ");
            visiting.pop();
            if (!visiting.empty()) {
                String parent = visiting.peek();
                sb.append("It is used from target \"").append(parent).append("\".");
            }
            throw new BuildException(new String(sb));
        }

        for (Enumeration<String> en = target.getDependencies(); en.hasMoreElements();) {
            String cur = en.nextElement();
            String m = state.get(cur);
            if (m == null) {
                tsort(cur, targetTable, state, visiting, ret);
            } else if (m == VISITING) {
                throw makeCircularException(cur, visiting);
            }
        }

        String p = visiting.pop();
        if (root != p) {
            throw new RuntimeException("Unexpected internal error: expected to pop " + root + " but got " + p);
        }
        state.put(root, VISITED);
        ret.addElement(target);
    }

    private static BuildException makeCircularException(String end, Stack<String> stk) {
        final StringBuilder sb = new StringBuilder("Circular dependency: ");
        sb.append(end);
        String c;
        do {
            c = stk.pop();
            sb.append(" <- ").append(c);
        } while (!c.equals(end));
        return new BuildException(sb.toString());
    }

    public void inheritIDReferences(Project parent) {
    }

    public void addIdReference(String id, Object value) {
        idReferences.put(id, value);
    }

    public void addReference(String referenceName, Object value) {
        Object old = ((AntRefTable) references).getReal(referenceName);
        if (old == value) {
            return;
        }
        if (old != null && !(old instanceof UnknownElement)) {
            log("Overriding previous definition of reference to " + referenceName, MSG_VERBOSE);
        }
        log("Adding reference: " + referenceName, MSG_DEBUG);
        references.put(referenceName, value);
    }

    public Hashtable<String, Object> getReferences() {
        return references;
    }

    public boolean hasReference(String key) {
        return references.containsKey(key);
    }

    public Map<String, Object> getCopyOfReferences() {
        return new HashMap<String, Object>(references);
    }

    public <T> T getReference(String key) {
        @SuppressWarnings("unchecked")
        final T ret = (T) references.get(key);
        if (ret != null) {
            return ret;
        }
        if (!key.equals(MagicNames.REFID_PROPERTY_HELPER)) {
            try {
                if (PropertyHelper.getPropertyHelper(this).containsProperties(key)) {
                    log("Unresolvable reference " + key + " might be a misuse of property expansion syntax.", MSG_WARN);
                }
            } catch (Exception e) {
                // ignore
            }
        }
        return null;
    }

    public String getElementName(Object element) {
        return ComponentHelper.getComponentHelper(this).getElementName(element);
    }

    public void fireBuildStarted() {
        BuildEvent event = new BuildEvent(this);
        BuildListener[] currListeners = listeners;
        for (int i = 0; i < currListeners.length; i++) {
            currListeners[i].buildStarted(event);
        }
    }

    public void fireBuildFinished(Throwable exception) {
        BuildEvent event = new BuildEvent(this);
        event.setException(exception);
        BuildListener[] currListeners = listeners;
        for (int i = 0; i < currListeners.length; i++) {
            currListeners[i].buildFinished(event);
        }
        IntrospectionHelper.clearCache();
    }

    public void fireSubBuildStarted() {
        BuildEvent event = new BuildEvent(this);
        BuildListener[] currListeners = listeners;
        for (int i = 0; i < currListeners.length; i++) {
            if (currListeners[i] instanceof SubBuildListener) {
                ((SubBuildListener) currListeners[i]).subBuildStarted(event);
            }
        }
    }

    public void fireSubBuildFinished(Throwable exception) {
        BuildEvent event = new BuildEvent(this);
        event.setException(exception);
        BuildListener[] currListeners = listeners;
        for (int i = 0; i < currListeners.length; i++) {
            if (currListeners[i] instanceof SubBuildListener) {
                ((SubBuildListener) currListeners[i]).subBuildFinished(event);
            }
        }
    }

    protected void fireTargetStarted(Target target) {
        BuildEvent event = new BuildEvent(target);
        BuildListener[] currListeners = listeners;
        for (int i = 0; i < currListeners.length; i++) {
            currListeners[i].targetStarted(event);
        }
    }

    protected void fireTargetFinished(Target target, Throwable exception) {
        BuildEvent event = new BuildEvent(target);
        event.setException(exception);
        BuildListener[] currListeners = listeners;
        for (int i = 0; i < currListeners.length; i++) {
            currListeners[i].targetFinished(event);
        }
    }

    protected void fireTaskStarted(Task task) {
        registerThreadTask(Thread.currentThread(), task);
        BuildEvent event = new BuildEvent(task);
        BuildListener[] currListeners = listeners;
        for (int i = 0; i < currListeners.length; i++) {
            currListeners[i].taskStarted(event);
        }
    }

    protected void fireTaskFinished(Task task, Throwable exception) {
        registerThreadTask(Thread.currentThread(), null);
        System.out.flush();
        System.err.flush();
        BuildEvent event = new BuildEvent(task);
        event.setException(exception);
        BuildListener[] currListeners = listeners;
        for (int i = 0; i < currListeners.length; i++) {
            currListeners[i].taskFinished(event);
        }
    }

    private void fireMessageLoggedEvent(BuildEvent event, String message, int priority) {
        if (message == null) {
            message = String.valueOf(message);
        }
        if (message.endsWith(StringUtils.LINE_SEP)) {
            int endIndex = message.length() - StringUtils.LINE_SEP.length();
            event.setMessage(message.substring(0, endIndex), priority);
        } else {
            event.setMessage(message, priority);
        }
        if (isLoggingMessage.get() != Boolean.FALSE) {
            return;
        }
        try {
            isLoggingMessage.set(Boolean.TRUE);
            BuildListener[] currListeners = listeners;
            for (int i = 0; i < currListeners.length; i++) {
                currListeners[i].messageLogged(event);
            }
        } finally {
            isLoggingMessage.set(Boolean.FALSE);
        }
    }

    protected void fireMessageLogged(Project project, String message, int priority) {
        fireMessageLogged(project, message, null, priority);
    }

    protected void fireMessageLogged(Project project, String message, Throwable throwable, int priority) {
        BuildEvent event = new BuildEvent(project);
        event.setException(throwable);
        fireMessageLoggedEvent(event, message, priority);
    }

    protected void fireMessageLogged(Target target, String message, int priority) {
        fireMessageLogged(target, message, null, priority);
    }

    protected void fireMessageLogged(Target target, String message, Throwable throwable, int priority) {
        BuildEvent event = new BuildEvent(target);
        event.setException(throwable);
        fireMessageLoggedEvent(event, message, priority);
    }

    protected void fireMessageLogged(Task task, String message, int priority) {
        fireMessageLogged(task, message, null, priority);
    }

    protected void fireMessageLogged(Task task, String message, Throwable throwable, int priority) {
        BuildEvent event = new BuildEvent(task);
        event.setException(throwable);
        fireMessageLoggedEvent(event, message, priority);
    }

    public void registerThreadTask(Thread thread, Task task) {
        synchronized (threadTasks) {
            if (task != null) {
                threadTasks.put(thread, task);
                threadGroupTasks.put(thread.getThreadGroup(), task);
            } else {
                threadTasks.remove(thread);
                threadGroupTasks.remove(thread.getThreadGroup());
            }
        }
    }

    public Task getThreadTask(Thread thread) {
        synchronized (threadTasks) {
            Task task = threadTasks.get(thread);
            if (task == null) {
                ThreadGroup group = thread.getThreadGroup();
                while (task == null && group != null) {
                    task = threadGroupTasks.get(group);
                    group = group.getParent();
                }
            }
            return task;
        }
    }

    private static class AntRefTable extends Hashtable<String, Object> {
        private static final long serialVersionUID = 1L;

        AntRefTable() {
            super();
        }

        private Object getReal(Object key) {
            return super.get(key);
        }

        public Object get(Object key) {
            Object o = getReal(key);
            if (o instanceof UnknownElement) {
                UnknownElement ue = (UnknownElement) o;
                ue.maybeConfigure();
                o = ue.getRealThing();
            }
            return o;
        }
    }

    public final void setProjectReference(final Object obj) {
        if (obj instanceof ProjectComponent) {
            ((ProjectComponent) obj).setProject(this);
            return;
        }
        try {
            Method method = obj.getClass().getMethod("setProject", new Class[] {Project.class});
            if (method != null) {
                method.invoke(obj, new Object[] {this});
            }
        } catch (Throwable e) {
            // ignore
        }
    }

    public Resource getResource(String name) {
        return new FileResource(getBaseDir(), name);
    }
}