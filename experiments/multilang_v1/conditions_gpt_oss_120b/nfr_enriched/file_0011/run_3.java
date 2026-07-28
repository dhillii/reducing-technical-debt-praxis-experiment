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

package org.apache.tools.ant.taskdefs;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Hashtable;
import java.util.List;
import java.util.Map;
import java.util.Vector;
import org.apache.tools.ant.Task;
import org.apache.tools.ant.Project;
import org.apache.tools.ant.BuildException;
import org.apache.tools.ant.DirectoryScanner;
import org.apache.tools.ant.types.Mapper;
import org.apache.tools.ant.types.FileSet;
import org.apache.tools.ant.types.FilterSet;
import org.apache.tools.ant.types.FilterChain;
import org.apache.tools.ant.types.FilterSetCollection;
import org.apache.tools.ant.types.Resource;
import org.apache.tools.ant.types.ResourceCollection;
import org.apache.tools.ant.types.ResourceFactory;
import org.apache.tools.ant.types.resources.FileProvider;
import org.apache.tools.ant.types.resources.FileResource;
import org.apache.tools.ant.util.FileUtils;
import org.apache.tools.ant.util.FileNameMapper;
import org.apache.tools.ant.util.IdentityMapper;
import org.apache.tools.ant.util.LinkedHashtable;
import org.apache.tools.ant.util.ResourceUtils;
import org.apache.tools.ant.util.SourceFileScanner;
import org.apache.tools.ant.util.FlatFileNameMapper;

/**
 * Copies a file or directory to a new file
 * or directory.  Files are only copied if the source file is newer
 * than the destination file, or when the destination file does not
 * exist.  It is possible to explicitly overwrite existing files.</p>
 *
 * <p>This implementation is based on Arnout Kuiper's initial design
 * document, the following mailing list discussions, and the
 * copyfile/copydir tasks.</p>
 *
 *
 * @since Ant 1.2
 *
 * @ant.task category="filesystem"
 */
public class Copy extends Task {
    private static final String MSG_WHEN_COPYING_EMPTY_RC_TO_FILE =
        "Cannot perform operation from directory to file.";

    static final File NULL_FILE_PLACEHOLDER = new File("/NULL_FILE");
    static final String LINE_SEPARATOR = System.getProperty("line.separator");
    // CheckStyle:VisibilityModifier OFF - bc
    protected File file = null;     // the source file
    protected File destFile = null; // the destination file
    protected File destDir = null;  // the destination directory
    protected Vector<ResourceCollection> rcs = new Vector<ResourceCollection>();
    // here to provide API backwards compatibility
    protected Vector<ResourceCollection> filesets = rcs;

    private boolean enableMultipleMappings = false;
    protected boolean filtering = false;
    protected boolean preserveLastModified = false;
    protected boolean forceOverwrite = false;
    protected boolean flatten = false;
    protected int verbosity = Project.MSG_VERBOSE;
    protected boolean includeEmpty = true;
    protected boolean failonerror = true;

    protected Hashtable<String, String[]> fileCopyMap = new LinkedHashtable<String, String[]>();
    protected Hashtable<String, String[]> dirCopyMap = new LinkedHashtable<String, String[]>();
    protected Hashtable<File, File> completeDirMap = new LinkedHashtable<File, File>();

    protected Mapper mapperElement = null;
    protected FileUtils fileUtils;
    //CheckStyle:VisibilityModifier ON
    private Vector<FilterChain> filterChains = new Vector<FilterChain>();
    private Vector<FilterSet> filterSets = new Vector<FilterSet>();
    private String inputEncoding = null;
    private String outputEncoding = null;
    private long granularity = 0;
    private boolean force = false;
    private boolean quiet = false;

    // used to store the single non-file resource to copy when the
    // tofile attribute has been used
    private Resource singleResource = null;

    /**
     * Copy task constructor.
     */
    public Copy() {
        fileUtils = FileUtils.getFileUtils();
        granularity = fileUtils.getFileTimestampGranularity();
    }

    protected FileUtils getFileUtils() {
        return fileUtils;
    }

    public void setFile(File file) {
        this.file = file;
    }

    public void setTofile(File destFile) {
        this.destFile = destFile;
    }

    public void setTodir(File destDir) {
        this.destDir = destDir;
    }

    public FilterChain createFilterChain() {
        FilterChain filterChain = new FilterChain();
        filterChains.addElement(filterChain);
        return filterChain;
    }

    public FilterSet createFilterSet() {
        FilterSet filterSet = new FilterSet();
        filterSets.addElement(filterSet);
        return filterSet;
    }

    public void setPreserveLastModified(String preserve) {
        setPreserveLastModified(Project.toBoolean(preserve));
    }

    public void setPreserveLastModified(boolean preserve) {
        preserveLastModified = preserve;
    }

    public boolean getPreserveLastModified() {
        return preserveLastModified;
    }

    protected Vector<FilterSet> getFilterSets() {
        return filterSets;
    }

    protected Vector<FilterChain> getFilterChains() {
        return filterChains;
    }

    public void setFiltering(boolean filtering) {
        this.filtering = filtering;
    }

    public void setOverwrite(boolean overwrite) {
        this.forceOverwrite = overwrite;
    }

    public void setForce(boolean f) {
        force = f;
    }

    public boolean getForce() {
        return force;
    }

    public void setFlatten(boolean flatten) {
        this.flatten = flatten;
    }

    public void setVerbose(boolean verbose) {
        this.verbosity = verbose ? Project.MSG_INFO : Project.MSG_VERBOSE;
    }

    public void setIncludeEmptyDirs(boolean includeEmpty) {
        this.includeEmpty = includeEmpty;
    }

    public void setQuiet(boolean quiet) {
        this.quiet = quiet;
    }

    public void setEnableMultipleMappings(boolean enableMultipleMappings) {
        this.enableMultipleMappings = enableMultipleMappings;
    }

    public boolean isEnableMultipleMapping() {
        return enableMultipleMappings;
    }

    public void setFailOnError(boolean failonerror) {
        this.failonerror = failonerror;
    }

    public void addFileset(FileSet set) {
        add(set);
    }

    public void add(ResourceCollection res) {
        rcs.add(res);
    }

    public Mapper createMapper() throws BuildException {
        if (mapperElement != null) {
            throw new BuildException("Cannot define more than one mapper",
                                     getLocation());
        }
        mapperElement = new Mapper(getProject());
        return mapperElement;
    }

    public void add(FileNameMapper fileNameMapper) {
        createMapper().add(fileNameMapper);
    }

    public void setEncoding(String encoding) {
        this.inputEncoding = encoding;
        if (outputEncoding == null) {
            outputEncoding = encoding;
        }
    }

    public String getEncoding() {
        return inputEncoding;
    }

    public void setOutputEncoding(String encoding) {
        this.outputEncoding = encoding;
    }

    public String getOutputEncoding() {
        return outputEncoding;
    }

    public void setGranularity(long granularity) {
        this.granularity = granularity;
    }

    /**
     * Perform the copy operation.
     * @exception BuildException if an error occurs.
     */
    public void execute() throws BuildException {
        File savedFile = file;
        File savedDestFile = destFile;
        File savedDestDir = destDir;
        ResourceCollection savedRc = null;
        if (file == null && destFile != null && rcs.size() == 1) {
            savedRc = (ResourceCollection) rcs.elementAt(0);
        }

        try {
            if (!validateAndPrepare()) {
                return;
            }

            copySingleFile();

            CollectionData data = collectResourceCollections();

            iterateOverBaseDirs(data.baseDirs, data.dirsByBasedir, data.filesByBasedir);

            performFileOperations();

            handleNonFileResources(data.nonFileResources);
        } finally {
            singleResource = null;
            file = savedFile;
            destFile = savedDestFile;
            destDir = savedDestDir;
            if (savedRc != null) {
                rcs.insertElementAt(savedRc, 0);
            }
            fileCopyMap.clear();
            dirCopyMap.clear();
            completeDirMap.clear();
        }
    }

    /**
     * Holds intermediate collection data.
     */
    private static class CollectionData {
        HashMap<File, List<String>> filesByBasedir = new HashMap<File, List<String>>();
        HashMap<File, List<String>> dirsByBasedir = new HashMap<File, List<String>>();
        HashSet<File> baseDirs = new HashSet<File>();
        List<Resource> nonFileResources = new ArrayList<Resource>();
    }

    /**
     * Validates attributes and handles early exit on specific warning.
     * @return true to continue processing, false to stop execution.
     */
    private boolean validateAndPrepare() {
        try {
            validateAttributes();
        } catch (BuildException e) {
            if (failonerror || !getMessage(e).equals(MSG_WHEN_COPYING_EMPTY_RC_TO_FILE)) {
                throw e;
            } else {
                log("Warning: " + getMessage(e), Project.MSG_ERR);
                return false;
            }
        }
        return true;
    }

    /**
     * Collects information from resource collections.
     * @return a holder with collected data.
     */
    private CollectionData collectResourceCollections() {
        CollectionData data = new CollectionData();
        final int size = rcs.size();
        for (int i = 0; i < size; i++) {
            ResourceCollection rc = rcs.elementAt(i);

            if (rc instanceof FileSet && rc.isFilesystemOnly()) {
                FileSet fs = (FileSet) rc;
                DirectoryScanner ds;
                try {
                    ds = fs.getDirectoryScanner(getProject());
                } catch (BuildException e) {
                    if (failonerror || !getMessage(e).endsWith(DirectoryScanner.DOES_NOT_EXIST_POSTFIX)) {
                        throw e;
                    } else {
                        if (!quiet) {
                            log("Warning: " + getMessage(e), Project.MSG_ERR);
                        }
                        continue;
                    }
                }
                File fromDir = fs.getDir(getProject());
                String[] srcFiles = ds.getIncludedFiles();
                String[] srcDirs = ds.getIncludedDirectories();
                if (!flatten && mapperElement == null && ds.isEverythingIncluded() && !fs.hasPatterns()) {
                    completeDirMap.put(fromDir, destDir);
                }
                add(fromDir, srcFiles, data.filesByBasedir);
                add(fromDir, srcDirs, data.dirsByBasedir);
                data.baseDirs.add(fromDir);
            } else {
                if (!rc.isFilesystemOnly() && !supportsNonFileResources()) {
                    throw new BuildException("Only FileSystem resources are supported.");
                }
                for (Resource r : rc) {
                    if (!r.isExists()) {
                        String message = "Warning: Could not find resource " + r.toLongString() + " to copy.";
                        if (!failonerror) {
                            if (!quiet) {
                                log(message, Project.MSG_ERR);
                            }
                        } else {
                            throw new BuildException(message);
                        }
                        continue;
                    }

                    File baseDir = NULL_FILE_PLACEHOLDER;
                    String name = r.getName();
                    FileProvider fp = r.as(FileProvider.class);
                    if (fp != null) {
                        FileResource fr = ResourceUtils.asFileResource(fp);
                        baseDir = getKeyFile(fr.getBaseDir());
                        if (fr.getBaseDir() == null) {
                            name = fr.getFile().getAbsolutePath();
                        }
                    }

                    if (r.isDirectory() || fp != null) {
                        add(baseDir, name, r.isDirectory() ? data.dirsByBasedir : data.filesByBasedir);
                        data.baseDirs.add(baseDir);
                    } else {
                        data.nonFileResources.add(r);
                    }
                }
            }
        }
        return data;
    }

    /**
     * Executes file operations with error handling.
     */
    private void performFileOperations() {
        try {
            doFileOperations();
        } catch (BuildException e) {
            if (!failonerror) {
                if (!quiet) {
                    log("Warning: " + getMessage(e), Project.MSG_ERR);
                }
            } else {
                throw e;
            }
        }
    }

    /**
     * Handles copying of non‑file resources.
     */
    private void handleNonFileResources(List<Resource> nonFileResources) {
        if (nonFileResources.isEmpty() && singleResource == null) {
            return;
        }
        Resource[] nonFiles = nonFileResources.toArray(new Resource[0]);
        Map<Resource, String[]> map = scan(nonFiles, destDir);
        if (singleResource != null) {
            map.put(singleResource, new String[] { destFile.getAbsolutePath() });
        }
        try {
            doResourceOperations(map);
        } catch (BuildException e) {
            if (!failonerror) {
                if (!quiet) {
                    log("Warning: " + getMessage(e), Project.MSG_ERR);
                }
            } else {
                throw e;
            }
        }
    }

    private void copySingleFile() {
        if (file != null) {
            if (file.exists()) {
                if (destFile == null) {
                    destFile = new File(destDir, file.getName());
                }
                if (forceOverwrite || !destFile.exists()
                    || (file.lastModified() - granularity > destFile.lastModified())) {
                    fileCopyMap.put(file.getAbsolutePath(),
                                    new String[] {destFile.getAbsolutePath()});
                } else {
                    log(file + " omitted as " + destFile + " is up to date.", Project.MSG_VERBOSE);
                }
            } else {
                String message = "Warning: Could not find file " + file.getAbsolutePath() + " to copy.";
                if (!failonerror) {
                    if (!quiet) {
                        log(message, Project.MSG_ERR);
                    }
                } else {
                    throw new BuildException(message);
                }
            }
        }
    }

    private void iterateOverBaseDirs(
        HashSet<File> baseDirs, HashMap<File, List<String>> dirsByBasedir, HashMap<File, List<String>> filesByBasedir) {

        for (File f : baseDirs) {
            List<String> files = filesByBasedir.get(f);
            List<String> dirs = dirsByBasedir.get(f);

            String[] srcFiles = new String[0];
            if (files != null) {
                srcFiles = files.toArray(srcFiles);
            }
            String[] srcDirs = new String[0];
            if (dirs != null) {
                srcDirs = dirs.toArray(srcDirs);
            }
            scan(f == NULL_FILE_PLACEHOLDER ? null : f, destDir, srcFiles, srcDirs);
        }
    }

    protected void validateAttributes() throws BuildException {
        if (file == null && rcs.size() == 0) {
            throw new BuildException(
                "Specify at least one source--a file or a resource collection.");
        }
        if (destFile != null && destDir != null) {
            throw new BuildException(
                "Only one of tofile and todir may be set.");
        }
        if (destFile == null && destDir == null) {
            throw new BuildException("One of tofile or todir must be set.");
        }
        if (file != null && file.isDirectory()) {
            throw new BuildException("Use a resource collection to copy directories.");
        }
        if (destFile != null && rcs.size() > 0) {
            if (rcs.size() > 1) {
                throw new BuildException(
                    "Cannot concatenate multiple files into a single file.");
            } else {
                ResourceCollection rc = (ResourceCollection) rcs.elementAt(0);
                if (!rc.isFilesystemOnly() && !supportsNonFileResources()) {
                    throw new BuildException("Only FileSystem resources are"
                                             + " supported.");
                }
                if (rc.size() == 0) {
                    throw new BuildException(MSG_WHEN_COPYING_EMPTY_RC_TO_FILE);
                } else if (rc.size() == 1) {
                    Resource res = rc.iterator().next();
                    FileProvider r = res.as(FileProvider.class);
                    if (file == null) {
                        if (r != null) {
                            file = r.getFile();
                        } else {
                            singleResource = res;
                        }
                        rcs.removeElementAt(0);
                    } else {
                        throw new BuildException(
                            "Cannot concatenate multiple files into a single file.");
                    }
                } else {
                    throw new BuildException(
                        "Cannot concatenate multiple files into a single file.");
                }
            }
        }
        if (destFile != null) {
            destDir = destFile.getParentFile();
        }
    }

    protected void scan(File fromDir, File toDir, String[] files,
                        String[] dirs) {
        FileNameMapper mapper = getMapper();
        buildMap(fromDir, toDir, files, mapper, fileCopyMap);

        if (includeEmpty) {
            buildMap(fromDir, toDir, dirs, mapper, dirCopyMap);
        }
    }

    protected Map<Resource, String[]> scan(Resource[] fromResources, File toDir) {
        return buildMap(fromResources, toDir, getMapper());
    }

    protected void buildMap(File fromDir, File toDir, String[] names,
                            FileNameMapper mapper, Hashtable<String, String[]> map) {
        String[] toCopy;
        if (forceOverwrite) {
            Vector<String> v = new Vector<String>();
            for (int i = 0; i < names.length; i++) {
                if (mapper.mapFileName(names[i]) != null) {
                    v.addElement(names[i]);
                }
            }
            toCopy = new String[v.size()];
            v.copyInto(toCopy);
        } else {
            SourceFileScanner ds = new SourceFileScanner(this);
            toCopy = ds.restrict(names, fromDir, toDir, mapper, granularity);
        }
        for (int i = 0; i < toCopy.length; i++) {
            File src = new File(fromDir, toCopy[i]);
            String[] mappedFiles = mapper.mapFileName(toCopy[i]);

            if (!enableMultipleMappings) {
                map.put(src.getAbsolutePath(),
                        new String[] {new File(toDir, mappedFiles[0]).getAbsolutePath()});
            } else {
                for (int k = 0; k < mappedFiles.length; k++) {
                    mappedFiles[k] = new File(toDir, mappedFiles[k]).getAbsolutePath();
                }
                map.put(src.getAbsolutePath(), mappedFiles);
            }
        }
    }

    protected Map<Resource, String[]> buildMap(Resource[] fromResources, final File toDir,
                           FileNameMapper mapper) {
        HashMap<Resource, String[]> map = new HashMap<Resource, String[]>();
        Resource[] toCopy;
        if (forceOverwrite) {
            Vector<Resource> v = new Vector<Resource>();
            for (int i = 0; i < fromResources.length; i++) {
                if (mapper.mapFileName(fromResources[i].getName()) != null) {
                    v.addElement(fromResources[i]);
                }
            }
            toCopy = new Resource[v.size()];
            v.copyInto(toCopy);
        } else {
            toCopy = ResourceUtils.selectOutOfDateSources(this, fromResources,
                                                         mapper,
                                                         new ResourceFactory() {
                public Resource getResource(String name) {
                    return new FileResource(toDir, name);
                }
            }, granularity);
        }
        for (int i = 0; i < toCopy.length; i++) {
            String[] mappedFiles = mapper.mapFileName(toCopy[i].getName());
            for (int j = 0; j < mappedFiles.length; j++) {
                if (mappedFiles[j] == null) {
                    throw new BuildException("Can't copy a resource without a"
                                             + " name if the mapper doesn't"
                                             + " provide one.");
                }
            }

            if (!enableMultipleMappings) {
                map.put(toCopy[i],
                        new String[] {new File(toDir, mappedFiles[0]).getAbsolutePath()});
            } else {
                for (int k = 0; k < mappedFiles.length; k++) {
                    mappedFiles[k] = new File(toDir, mappedFiles[k]).getAbsolutePath();
                }
                map.put(toCopy[i], mappedFiles);
            }
        }
        return map;
    }

    protected void doFileOperations() {
        if (fileCopyMap.size() > 0) {
            log("Copying " + fileCopyMap.size()
                + " file" + (fileCopyMap.size() == 1 ? "" : "s")
                + " to " + destDir.getAbsolutePath());

            for (Map.Entry<String, String[]> e : fileCopyMap.entrySet()) {
                String fromFile = e.getKey();
                String[] toFiles = e.getValue();

                for (int i = 0; i < toFiles.length; i++) {
                    String toFile = toFiles[i];

                    if (fromFile.equals(toFile)) {
                        log("Skipping self-copy of " + fromFile, verbosity);
                        continue;
                    }
                    try {
                        log("Copying " + fromFile + " to " + toFile, verbosity);

                        FilterSetCollection executionFilters = new FilterSetCollection();
                        if (filtering) {
                            executionFilters.addFilterSet(getProject().getGlobalFilterSet());
                        }
                        for (FilterSet filterSet : filterSets) {
                            executionFilters.addFilterSet(filterSet);
                        }
                        fileUtils.copyFile(new File(fromFile), new File(toFile),
                                           executionFilters,
                                           filterChains, forceOverwrite,
                                           preserveLastModified,
                                           false, inputEncoding,
                                           outputEncoding, getProject(),
                                           getForce());
                    } catch (IOException ioe) {
                        String msg = "Failed to copy " + fromFile + " to " + toFile
                            + " due to " + getDueTo(ioe);
                        File targetFile = new File(toFile);
                        if (targetFile.exists() && !targetFile.delete()) {
                            msg += " and I couldn't delete the corrupt " + toFile;
                        }
                        if (failonerror) {
                            throw new BuildException(msg, ioe, getLocation());
                        }
                        log(msg, Project.MSG_ERR);
                    }
                }
            }
        }
        if (includeEmpty) {
            int createCount = 0;
            for (String[] dirs : dirCopyMap.values()) {
                for (int i = 0; i < dirs.length; i++) {
                    File d = new File(dirs[i]);
                    if (!d.exists()) {
                        if (!d.mkdirs()) {
                            log("Unable to create directory "
                                + d.getAbsolutePath(), Project.MSG_ERR);
                        } else {
                            createCount++;
                        }
                    }
                }
            }
            if (createCount > 0) {
                log("Copied " + dirCopyMap.size()
                    + " empty director"
                    + (dirCopyMap.size() == 1 ? "y" : "ies")
                    + " to " + createCount
                    + " empty director"
                    + (createCount == 1 ? "y" : "ies") + " under "
                    + destDir.getAbsolutePath());
            }
        }
    }

    protected void doResourceOperations(Map<Resource, String[]> map) {
        if (map.size() > 0) {
            log("Copying " + map.size()
                + " resource" + (map.size() == 1 ? "" : "s")
                + " to " + destDir.getAbsolutePath());

            for (Map.Entry<Resource, String[]> e : map.entrySet()) {
                Resource fromResource = e.getKey();
                for (String toFile : e.getValue()) {
                    try {
                        log("Copying " + fromResource + " to " + toFile,
                            verbosity);

                        FilterSetCollection executionFilters = new FilterSetCollection();
                        if (filtering) {
                            executionFilters.addFilterSet(getProject().getGlobalFilterSet());
                        }
                        for (FilterSet filterSet : filterSets) {
                            executionFilters.addFilterSet(filterSet);
                        }
                        ResourceUtils.copyResource(fromResource,
                                                   new FileResource(destDir,
                                                                    toFile),
                                                   executionFilters,
                                                   filterChains,
                                                   forceOverwrite,
                                                   preserveLastModified,
                                                   false,
                                                   inputEncoding,
                                                   outputEncoding,
                                                   getProject(),
                                                   getForce());
                    } catch (IOException ioe) {
                        String msg = "Failed to copy " + fromResource
                            + " to " + toFile
                            + " due to " + getDueTo(ioe);
                        File targetFile = new File(toFile);
                        if (targetFile.exists() && !targetFile.delete()) {
                            msg += " and I couldn't delete the corrupt " + toFile;
                        }
                        if (failonerror) {
                            throw new BuildException(msg, ioe, getLocation());
                        }
                        log(msg, Project.MSG_ERR);
                    }
                }
            }
        }
    }

    protected boolean supportsNonFileResources() {
        return getClass().equals(Copy.class);
    }

    private static void add(File baseDir, String[] names, Map<File, List<String>> m) {
        if (names != null) {
            baseDir = getKeyFile(baseDir);
            List<String> l = m.get(baseDir);
            if (l == null) {
                l = new ArrayList<String>(names.length);
                m.put(baseDir, l);
            }
            l.addAll(java.util.Arrays.asList(names));
        }
    }

    private static void add(File baseDir, String name, Map<File, List<String>> m) {
        if (name != null) {
            add(baseDir, new String[] {name}, m);
        }
    }

    private static File getKeyFile(File f) {
        return f == null ? NULL_FILE_PLACEHOLDER : f;
    }

    private FileNameMapper getMapper() {
        if (mapperElement != null) {
            return mapperElement.getImplementation();
        } else if (flatten) {
            return new FlatFileNameMapper();
        } else {
            return new IdentityMapper();
        }
    }

    private String getMessage(Exception ex) {
        return ex.getMessage() == null ? ex.toString() : ex.getMessage();
    }

    private String getDueTo(Exception ex) {
        boolean baseIOException = ex.getClass() == IOException.class;
        StringBuffer message = new StringBuffer();
        if (!baseIOException || ex.getMessage() == null) {
            message.append(ex.getClass().getName());
        }
        if (ex.getMessage() != null) {
            if (!baseIOException) {
                message.append(" ");
            }
            message.append(ex.getMessage());
        }
        if (ex.getClass().getName().indexOf("MalformedInput") != -1) {
            message.append(LINE_SEPARATOR);
            message.append(
                "This is normally due to the input file containing invalid");
            message.append(LINE_SEPARATOR);
            message.append("bytes for the character encoding used : ");
            message.append(
                (inputEncoding == null
                 ? fileUtils.getDefaultEncoding() : inputEncoding));
            message.append(LINE_SEPARATOR);
        }
        return message.toString();
    }
}