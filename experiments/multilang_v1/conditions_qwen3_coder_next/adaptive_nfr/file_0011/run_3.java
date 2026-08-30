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

    /**
     * Get the FileUtils for this task.
     * @return the fileutils object.
     */
    protected FileUtils getFileUtils() {
        return fileUtils;
    }

    /**
     * Set a single source file to copy.
     * @param file the file to copy.
     */
    public void setFile(File file) {
        this.file = file;
    }

    /**
     * Set the destination file.
     * @param destFile the file to copy to.
     */
    public void setTofile(File destFile) {
        this.destFile = destFile;
    }

    /**
     * Set the destination directory.
     * @param destDir the destination directory.
     */
    public void setTodir(File destDir) {
        this.destDir = destDir;
    }

    /**
     * Add a FilterChain.
     * @return a filter chain object.
     */
    public FilterChain createFilterChain() {
        FilterChain filterChain = new FilterChain();
        filterChains.addElement(filterChain);
        return filterChain;
    }

    /**
     * Add a filterset.
     * @return a filter set object.
     */
    public FilterSet createFilterSet() {
        FilterSet filterSet = new FilterSet();
        filterSets.addElement(filterSet);
        return filterSet;
    }

    /**
     * Give the copied files the same last modified time as the original files.
     * @param preserve a boolean string.
     * @deprecated since 1.5.x.
     *             setPreserveLastModified(String) has been deprecated and
     *             replaced with setPreserveLastModified(boolean) to
     *             consistently let the Introspection mechanism work.
     */
    public void setPreserveLastModified(String preserve) {
        setPreserveLastModified(Project.toBoolean(preserve));
    }

    /**
     * Give the copied files the same last modified time as the original files.
     * @param preserve if true preserve the modified time; default is false.
     */
    public void setPreserveLastModified(boolean preserve) {
        preserveLastModified = preserve;
    }

    /**
     * Get whether to give the copied files the same last modified time as
     * the original files.
     * @return the whether destination files will inherit the modification
     *         times of the corresponding source files.
     * @since 1.32, Ant 1.5
     */
    public boolean getPreserveLastModified() {
        return preserveLastModified;
    }

    /**
     * Get the filtersets being applied to this operation.
     *
     * @return a vector of FilterSet objects.
     */
    protected Vector<FilterSet> getFilterSets() {
        return filterSets;
    }

    /**
     * Get the filterchains being applied to this operation.
     *
     * @return a vector of FilterChain objects.
     */
    protected Vector<FilterChain> getFilterChains() {
        return filterChains;
    }

    /**
     * Set filtering mode.
     * @param filtering if true enable filtering; default is false.
     */
    public void setFiltering(boolean filtering) {
        this.filtering = filtering;
    }

    /**
     * Set overwrite mode regarding existing destination file(s).
     * @param overwrite if true force overwriting of destination file(s)
     *                  even if the destination file(s) are younger than
     *                  the corresponding source file. Default is false.
     */
    public void setOverwrite(boolean overwrite) {
        this.forceOverwrite = overwrite;
    }

    /**
     * Whether read-only destinations will be overwritten.
     *
     * <p>Defaults to false</p>
     *
     * @since Ant 1.8.2
     */
    public void setForce(boolean f) {
        force = f;
    }

    /**
     * Whether read-only destinations will be overwritten.
     *
     * @since Ant 1.8.2
     */
    public boolean getForce() {
        return force;
    }

    /**
     * Set whether files copied from directory trees will be "flattened"
     * into a single directory.  If there are multiple files with
     * the same name in the source directory tree, only the first
     * file will be copied into the "flattened" directory, unless
     * the forceoverwrite attribute is true.
     * @param flatten if true flatten the destination directory. Default
     *                is false.
     */
    public void setFlatten(boolean flatten) {
        this.flatten = flatten;
    }

    /**
     * Set verbose mode. Used to force listing of all names of copied files.
     * @param verbose whether to output the names of copied files.
     *                Default is false.
     */
    public void setVerbose(boolean verbose) {
        this.verbosity = verbose ? Project.MSG_INFO : Project.MSG_VERBOSE;
    }

    /**
     * Set whether to copy empty directories.
     * @param includeEmpty if true copy empty directories. Default is true.
     */
    public void setIncludeEmptyDirs(boolean includeEmpty) {
        this.includeEmpty = includeEmpty;
    }

	/**
	 * Set quiet mode. Used to hide messages when a file or directory to be
	 * copied does not exist.
	 *
	 * @param quiet
	 *            whether or not to display error messages when a file or
	 *            directory does not exist. Default is false.
	 */
	public void setQuiet(boolean quiet) {
		this.quiet = quiet;
	}

    /**
     * Set method of handling mappers that return multiple
     * mappings for a given source path.
     * @param enableMultipleMappings If true the task will
     *        copy to all the mappings for a given source path, if
     *        false, only the first file or directory is
     *        processed.
     *        By default, this setting is false to provide backward
     *        compatibility with earlier releases.
     * @since Ant 1.6
     */
    public void setEnableMultipleMappings(boolean enableMultipleMappings) {
        this.enableMultipleMappings = enableMultipleMappings;
    }

    /**
     * Get whether multiple mapping is enabled.
     * @return true if multiple mapping is enabled; false otherwise.
     */
    public boolean isEnableMultipleMapping() {
        return enableMultipleMappings;
    }

    /**
     * Set whether to fail when errors are encountered. If false, note errors
     * to the output but keep going. Default is true.
     * @param failonerror true or false.
     */
    public void setFailOnError(boolean failonerror) {
        this.failonerror = failonerror;
    }

    /**
     * Add a set of files to copy.
     * @param set a set of files to copy.
     */
    public void addFileset(FileSet set) {
        add(set);
    }

    /**
     * Add a collection of files to copy.
     * @param res a resource collection to copy.
     * @since Ant 1.7
     */
    public void add(ResourceCollection res) {
        rcs.add(res);
    }

    /**
     * Define the mapper to map source to destination files.
     * @return a mapper to be configured.
     * @exception BuildException if more than one mapper is defined.
     */
    public Mapper createMapper() throws BuildException {
        if (mapperElement != null) {
            throw new BuildException("Cannot define more than one mapper",
                                     getLocation());
        }
        mapperElement = new Mapper(getProject());
        return mapperElement;
    }

    /**
     * Add a nested filenamemapper.
     * @param fileNameMapper the mapper to add.
     * @since Ant 1.6.3
     */
    public void add(FileNameMapper fileNameMapper) {
        createMapper().add(fileNameMapper);
    }

    /**
     * Set the character encoding.
     * @param encoding the character encoding.
     * @since 1.32, Ant 1.5
     */
    public void setEncoding(String encoding) {
        this.inputEncoding = encoding;
        if (outputEncoding == null) {
            outputEncoding = encoding;
        }
    }

    /**
     * Get the character encoding to be used.
     * @return the character encoding, <code>null</code> if not set.
     *
     * @since 1.32, Ant 1.5
     */
    public String getEncoding() {
        return inputEncoding;
    }

    /**
     * Set the character encoding for output files.
     * @param encoding the output character encoding.
     * @since Ant 1.6
     */
    public void setOutputEncoding(String encoding) {
        this.outputEncoding = encoding;
    }

    /**
     * Get the character encoding for output files.
     * @return the character encoding for output files,
     * <code>null</code> if not set.
     *
     * @since Ant 1.6
     */
    public String getOutputEncoding() {
        return outputEncoding;
    }

    /**
     * Set the number of milliseconds leeway to give before deciding a
     * target is out of date.
     *
     * <p>Default is 1 second, or 2 seconds on DOS systems.</p>
     * @param granularity the granularity used to decide if a target is out of
     *                    date.
     * @since Ant 1.6.2
     */
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

        if (isSingleResourceInFileOperation()) {
            savedRc = (ResourceCollection) rcs.elementAt(0);
        }

        try {
            validateAttributesOrHandleEmptyRcTookitFileOperation();
            copySingleFile();

            HashMap<File, List<String>> filesByBasedir = new HashMap<File, List<String>>();
            HashMap<File, List<String>> dirsByBasedir = new HashMap<File, List<String>>();
            HashSet<File> baseDirs = new HashSet<File>();
            ArrayList<Resource> nonFileResources = new ArrayList<Resource>();
            final int size = rcs.size();

            for (int i = 0; i < size; i++) {
                processResourceCollection(rcs.elementAt(i), filesByBasedir, dirsByBasedir,
                                          baseDirs, nonFileResources);
            }

            iterateOverBaseDirs(baseDirs, dirsByBasedir, filesByBasedir);

            try {
                doFileOperations();
            } catch (BuildException e) {
                handleBuildException(e);
            }

            if (!nonFileResources.isEmpty() || singleResource != null) {
                Map<Resource, String[]> scanMap = scan(nonFileResources, destDir);
                if (singleResource != null) {
                    scanMap.put(singleResource, new String[] {destFile.getAbsolutePath()});
                }
                try {
                    doResourceOperations(scanMap);
                } catch (BuildException e) {
                    handleBuildException(e);
                }
            }
        } finally {
            cleanupAfterExecution(savedFile, savedDestFile, savedDestDir, savedRc);
        }
    }

    private boolean isSingleResourceInFileOperation() {
        return file == null && destFile != null && rcs.size() == 1;
    }

    private void validateAttributesOrHandleEmptyRcTookitFileOperation() throws BuildException {
        try {
            validateAttributes();
        } catch (BuildException e) {
            if (!shouldIgnoreEmptyRcTookitFileError(e)) {
                throw e;
            }
            log("Warning: " + getMessage(e), Project.MSG_ERR);
        }
    }

    private boolean shouldIgnoreEmptyRcTookitFileError(BuildException e) {
        return !failonerror && MSG_WHEN_COPYING_EMPTY_RC_TO_FILE.equals(getMessage(e));
    }

    private void handleBuildException(BuildException e) throws BuildException {
        if (!failonerror) {
            if (!quiet) {
                log("Warning: " + getMessage(e), Project.MSG_ERR);
            }
        } else {
            throw e;
        }
    }

    private void processResourceCollection(ResourceCollection rc,
                                           HashMap<File, List<String>> filesByBasedir,
                                           HashMap<File, List<String>> dirsByBasedir,
                                           HashSet<File> baseDirs,
                                           ArrayList<Resource> nonFileResources) {
        if (isFilesystemFileSet(rc)) {
            processFileSet((FileSet) rc, filesByBasedir, dirsByBasedir, baseDirs);
        } else {
            processGenericResourceCollection(rc, filesByBasedir, dirsByBasedir,
                                             baseDirs, nonFileResources);
        }
    }

    private boolean isFilesystemFileSet(ResourceCollection rc) {
        return rc instanceof FileSet && rc.isFilesystemOnly();
    }

    private void processFileSet(FileSet fs,
                                HashMap<File, List<String>> filesByBasedir,
                                HashMap<File, List<String>> dirsByBasedir,
                                HashSet<File> baseDirs) {
        DirectoryScanner ds = null;
        try {
            ds = fs.getDirectoryScanner(getProject());
        } catch (BuildException e) {
            handleDirectoryScannerException(e);
            return;
        }
        File fromDir = fs.getDir(getProject());

        String[] srcFiles = ds.getIncludedFiles();
        String[] srcDirs = ds.getIncludedDirectories();
        maybeRecordCompleteDirMap(fromDir, fs);
        add(fromDir, srcFiles, filesByBasedir);
        add(fromDir, srcDirs, dirsByBasedir);
        baseDirs.add(fromDir);
    }

    private void handleDirectoryScannerException(BuildException e) {
        if (shouldContinueOnScannerError(e)) {
            if (!quiet) {
                log("Warning: " + getMessage(e), Project.MSG_ERR);
            }
            return;
        }
        throw e;
    }

    private boolean shouldContinueOnScannerError(BuildException e) {
        return failonerror && getMessage(e)
            .endsWith(DirectoryScanner.DOES_NOT_EXIST_POSTFIX);
    }

    private void maybeRecordCompleteDirMap(File fromDir, FileSet fs) {
        if (!flatten && mapperElement == null
            && DirectoryScanner.EVERYTHING_INCLUDED.equals(dsIsEverythingIncluded_(fs))
            && !fs.hasPatterns()) {
            completeDirMap.put(fromDir, destDir);
        }
    }

    private String dsIsEverythingIncluded_(FileSet fs) {
        DirectoryScanner ds = null;
        try {
            ds = fs.getDirectoryScanner(getProject());
        } catch (BuildException ignored) {
            return null;
        }
        return ds != null ? DirectoryScanner.EVERYTHING_INCLUDED : null;
    }

    private void processGenericResourceCollection(ResourceCollection rc,
                                                  HashMap<File, List<String>> filesByBasedir,
                                                  HashMap<File, List<String>> dirsByBasedir,
                                                  HashSet<File> baseDirs,
                                                  ArrayList<Resource> nonFileResources) {
        if (!rc.isFilesystemOnly() && !supportsNonFileResources()) {
            throw new BuildException("Only FileSystem resources are supported.");
        }

        for (Resource r : rc) {
            if (!r.isExists()) {
                handleMissingResource(r);
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
                add(baseDir, name,
                    r.isDirectory() ? dirsByBasedir : filesByBasedir);
                baseDirs.add(baseDir);
            } else {
                nonFileResources.add(r);
            }
        }
    }

    private void handleMissingResource(Resource r) {
        String message = "Warning: Could not find resource "
            + r.toLongString() + " to copy.";
        if (failonerror) {
            throw new BuildException(message);
        }
        if (!quiet) {
            log(message, Project.MSG_ERR);
        }
    }

    private void cleanupAfterExecution(File savedFile, File savedDestFile, File savedDestDir,
                                       ResourceCollection savedRc) {
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

    private void copySingleFile() {
        if (file == null || !file.exists()) {
            handleMissingSingleSourceFile();
            return;
        }

        maybeSetupDestFileForSingleFile();
        if (!shouldSkipCopy()) {
            fileCopyMap.put(file.getAbsolutePath(),
                            new String[] {destFile.getAbsolutePath()});
        } else {
            log(file + " omitted as " + destFile + " is up to date.",
                Project.MSG_VERBOSE);
        }
    }

    private void maybeSetupDestFileForSingleFile() {
        if (destFile == null) {
            destFile = new File(destDir, file.getName());
        }
    }

    private void handleMissingSingleSourceFile() {
        String message = "Warning: Could not find file "
            + (file != null ? file.getAbsolutePath() : null) + " to copy.";
        if (failonerror) {
            throw new BuildException(message);
        }
        if (!quiet) {
            log(message, Project.MSG_ERR);
        }
    }

    private boolean shouldSkipCopy() {
        if (forceOverwrite) {
            return false;
        }
        if (!destFile.exists()) {
            return false;
        }
        return file.lastModified() - granularity <= destFile.lastModified();
    }

    private void iterateOverBaseDirs(HashSet<File> baseDirs,
                                     HashMap<File, List<String>> dirsByBasedir,
                                     HashMap<File, List<String>> filesByBasedir) {
        for (File f : baseDirs) {
            List<String> files = filesByBasedir.get(f);
            List<String> dirs = dirsByBasedir.get(f);

            String[] srcFiles = files == null ? new String[0] : files.toArray(new String[0]);
            String[] srcDirs = dirs == null ? new String[0] : dirs.toArray(new String[0]);

            File effectiveFromDir = f == NULL_FILE_PLACEHOLDER ? null : f;
            scan(effectiveFromDir, destDir, srcFiles, srcDirs);
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
            handleDestFileWithResourceCollections();
        }

        if (destFile != null) {
            destDir = destFile.getParentFile();
        }
    }

    private void handleDestFileWithResourceCollections() throws BuildException {
        if (rcs.size() > 1) {
            throw new BuildException("Cannot concatenate multiple files into a single file.");
        }

        ResourceCollection rc = (ResourceCollection) rcs.elementAt(0);

        if (!rc.isFilesystemOnly() && !supportsNonFileResources()) {
            throw new BuildException("Only FileSystem resources are supported.");
        }

        if (rc.size() == 0) {
            throw new BuildException(MSG_WHEN_COPYING_EMPTY_RC_TO_FILE);
        }

        if (rc.size() == 1) {
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
                throw new BuildException("Cannot concatenate multiple files into a single file.");
            }
        } else {
            throw new BuildException("Cannot concatenate multiple files into a single file.");
        }
    }

    protected void scan(File fromDir, File toDir, String[] files, String[] dirs) {
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
        String[] toCopy = forceOverwrite
            ? extractAllMappedFiles(names, mapper)
            : restrictToFileNamesMapped(names, fromDir, toDir, mapper);

        for (String name : toCopy) {
            File src = new File(fromDir, name);
            String[] mappedFiles = mapper.mapFileName(name);
            String[] absMappedFiles = mapToAbsolutePaths(toDir, mappedFiles);

            if (!enableMultipleMappings) {
                map.put(src.getAbsolutePath(),
                    new String[] {absMappedFiles[0]});
            } else {
                map.put(src.getAbsolutePath(), absMappedFiles);
            }
        }
    }

    private String[] extractAllMappedFiles(String[] names, FileNameMapper mapper) {
        Vector<String> vector = new Vector<String>();
        for (String name : names) {
            if (mapper.mapFileName(name) != null) {
                vector.addElement(name);
            }
        }
        String[] result = new String[vector.size()];
        vector.copyInto(result);
        return result;
    }

    private String[] restrictToFileNamesMapped(String[] names, File fromDir, File toDir,
                                               FileNameMapper mapper) {
        SourceFileScanner scanner = new SourceFileScanner(this);
        return scanner.restrict(names, fromDir, toDir, mapper, granularity);
    }

    private String[] mapToAbsolutePaths(File toDir, String[] mappedFiles) {
        String[] result = new String[mappedFiles.length];
        for (int i = 0; i < mappedFiles.length; ++i) {
            result[i] = new File(toDir, mappedFiles[i]).getAbsolutePath();
        }
        return result;
    }

    protected Map<Resource, String[]> buildMap(Resource[] fromResources, final File toDir,
                                               FileNameMapper mapper) {
        HashMap<Resource, String[]> map = new HashMap<Resource, String[]>();
        Resource[] toCopy = forceOverwrite
            ? extractAllMappedResources(fromResources, mapper)
            : selectOutOfDateSources(fromResources, toDir, mapper);

        for (Resource r : toCopy) {
            String[] mappedFiles = mapper.mapFileName(r.getName());
            validateMappedFiles(mappedFiles, r);
            String[] absMappedFiles = mapToAbsolutePaths(toDir, mappedFiles);

            if (!enableMultipleMappings) {
                map.put(r, new String[] {absMappedFiles[0]});
            } else {
                map.put(r, absMappedFiles);
            }
        }
        return map;
    }

    private Resource[] extractAllMappedResources(Resource[] fromResources, FileNameMapper mapper) {
        Vector<Resource> vector = new Vector<Resource>();
        for (Resource r : fromResources) {
            if (mapper.mapFileName(r.getName()) != null) {
                vector.addElement(r);
            }
        }
        Resource[] result = new Resource[vector.size()];
        vector.copyInto(result);
        return result;
    }

    private Resource[] selectOutOfDateSources(Resource[] fromResources, File toDir,
                                              FileNameMapper mapper) {
        return ResourceUtils.selectOutOfDateSources(this, fromResources, mapper,
            name -> new FileResource(toDir, name), granularity);
    }

    private void validateMappedFiles(String[] mappedFiles, Resource r) {
        for (String file : mappedFiles) {
            if (file == null) {
                throw new BuildException("Can't copy a resource without a name if the mapper"
                    + " doesn't provide one.");
            }
        }
    }

    protected void doFileOperations() {
        if (fileCopyMap.size() > 0) {
            log("Copying " + fileCopyMap.size() + " file"
                + (fileCopyMap.size() == 1 ? "" : "s") + " to " + destDir.getAbsolutePath());

            for (Map.Entry<String, String[]> entry : fileCopyMap.entrySet()) {
                String fromFile = entry.getKey();
                String[] toFiles = entry.getValue();

                for (String toFile : toFiles) {
                    if (fromFile.equals(toFile)) {
                        log("Skipping self-copy of " + fromFile, verbosity);
                        continue;
                    }
                    try {
                        log("Copying " + fromFile + " to " + toFile, verbosity);
                        doFileCopy(fromFile, toFile);
                    } catch (IOException ioe) {
                        handleCopyFailure(fromFile, toFile, ioe);
                    }
                }
            }
        }

        if (includeEmpty) {
            int createdDirs = 0;
            for (String[] paths : dirCopyMap.values()) {
                for (String path : paths) {
                    File dir = new File(path);
                    if (!dir.exists() && dir.mkdirs()) {
                        createdDirs++;
                    }
                }
            }
            maybeReportCreatedEmptyDirs(createdDirs);
        }
    }

    private void doFileCopy(String fromFile, String toFile) throws IOException {
        FilterSetCollection filters = createFilterSetCollection();

        fileUtils.copyFile(
            new File(fromFile), new File(toFile),
            filters, filterChains,
            forceOverwrite, preserveLastModified,
            false, inputEncoding,
            outputEncoding, getProject(), getForce());
    }

    private FilterSetCollection createFilterSetCollection() {
        FilterSetCollection filters = new FilterSetCollection();
        if (filtering) {
            filters.addFilterSet(getProject().getGlobalFilterSet());
        }
        filters.addAll(filterSets);
        return filters;
    }

    private void handleCopyFailure(String fromFile, String toFile, IOException ioe) {
        String msg = buildCopyFailureMessage(fromFile, toFile, ioe);
        File targetFile = new File(toFile);
        if (targetFile.exists() && !targetFile.delete()) {
            msg += " and I couldn't delete the corrupt " + toFile;
        }
        if (failonerror) {
            throw new BuildException(msg, ioe, getLocation());
        }
        log(msg, Project.MSG_ERR);
    }

    private String buildCopyFailureMessage(String fromFile, String toFile, IOException ioe) {
        StringBuilder msg = new StringBuilder();
        Exception ex = ioe;
        if (ex.getClass() != IOException.class || ex.getMessage() == null) {
            msg.append(ex.getClass().getName());
        }
        if (ex.getMessage() != null) {
            if (ex.getClass() != IOException.class) {
                msg.append(" ");
            }
            msg.append(ex.getMessage());
        }
        if (ex.getClass().getName().indexOf("MalformedInput") != -1) {
            msg.append(LINE_SEPARATOR);
            msg.append("This is normally due to the input file containing invalid");
            msg.append(LINE_SEPARATOR);
            msg.append("bytes for the character encoding used : ");
            msg.append(inputEncoding == null
                ? fileUtils.getDefaultEncoding() : inputEncoding);
            msg.append(LINE_SEPARATOR);
        }
        return msg.toString();
    }

    private void maybeReportCreatedEmptyDirs(int created) {
        if (created == 0) {
            return;
        }
        log("Copied " + dirCopyMap.size() + " empty director"
            + (dirCopyMap.size() == 1 ? "y" : "ies")
            + " to " + created + " empty director"
            + (created == 1 ? "y" : "ies") + " under "
            + destDir.getAbsolutePath());
    }

    protected void doResourceOperations(Map<Resource, String[]> map) {
        if (map.isEmpty()) {
            return;
        }

        log("Copying " + map.size() + " resource"
            + (map.size() == 1 ? "" : "s") + " to " + destDir.getAbsolutePath());

        for (Map.Entry<Resource, String[]> entry : map.entrySet()) {
            Resource src = entry.getKey();
            for (String destPath : entry.getValue()) {
                try {
                    log("Copying " + src + " to " + destPath, verbosity);
                    doResourceCopy(src, destPath);
                } catch (IOException ioe) {
                    handleCopyFailure(src.toShortString(), destPath, ioe);
                }
            }
        }
    }

    private void doResourceCopy(Resource src, String destPath) throws IOException {
        FilterSetCollection filters = createFilterSetCollection();
        ResourceUtils.copyResource(
            src,
            new FileResource(destDir, destPath),
            filters, filterChains,
            forceOverwrite, preserveLastModified,
            false, inputEncoding, outputEncoding,
            getProject(), getForce());
    }

    protected boolean supportsNonFileResources() {
        return getClass().equals(Copy.class);
    }

    private static void add(File baseDir, String[] names, Map<File, List<String>> m) {
        if (names == null) {
            return;
        }
        baseDir = getKeyFile(baseDir);
        List<String> list = m.get(baseDir);
        if (list == null) {
            list = new ArrayList<String>(names.length);
            m.put(baseDir, list);
        }
        list.addAll(java.util.Arrays.asList(names));
    }

    private static void add(File baseDir, String name, Map<File, List<String>> m) {
        if (name == null) {
            return;
        }
        add(baseDir, new String[] {name}, m);
    }

    private static File getKeyFile(File f) {
        return f == null ? NULL_FILE_PLACEHOLDER : f;
    }

    private FileNameMapper getMapper() {
        if (mapperElement != null) {
            return mapperElement.getImplementation();
        }
        if (flatten) {
            return new FlatFileNameMapper();
        }
        return new IdentityMapper();
    }

    private String getMessage(Exception ex) {
        return ex.getMessage() == null ? ex.toString() : ex.getMessage();
    }
}