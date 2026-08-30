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
        File savedFile = file; // may be altered in validateAttributes  
        File savedDestFile = destFile;  
        File savedDestDir = destDir;  
        ResourceCollection savedRc = null;  
        if (file == null && destFile != null && rcs.size() == 1) {  
            // will be removed in validateAttributes  
            savedRc = (ResourceCollection) rcs.elementAt(0);  
        }  

        try {  
            // make sure we don't have an illegal set of options  
            try {  
                validateAttributes();  
            } catch (BuildException e) {  
                if (failonerror  
                    || !getMessage(e)  
                    .equals(MSG_WHEN_COPYING_EMPTY_RC_TO_FILE)) {  
                    throw e;  
                } else {  
                    log("Warning: " + getMessage(e), Project.MSG_ERR);  
                    return;  
                }  
            }  

            // deal with the single file  
            copySingleFile();  

            // deal with the ResourceCollections  

            /* for historical and performance reasons we have to do  
               things in a rather complex way.  

               (1) Move is optimized to move directories if a fileset  
               has been included completely, therefore FileSets need a  
               special treatment.  This is also required to support  
               the failOnError semantice (skip filesets with broken  
               basedir but handle the remaining collections).  

               (2) We carry around a few protected methods that work  
               on basedirs and arrays of names.  To optimize stuff, all  
               resources with the same basedir get collected in  
               separate lists and then each list is handled in one go.  
            */  

            HashMap<File, List<String>> filesByBasedir = new HashMap<File, List<String>>();  
            HashMap<File, List<String>> dirsByBasedir = new HashMap<File, List<String>>();  
            HashSet<File> baseDirs = new HashSet<File>();  
            ArrayList<Resource> nonFileResources = new ArrayList<Resource>();  
            final int size = rcs.size();  
            for (int i = 0; i < size; i++) {  
                ResourceCollection rc = rcs.elementAt(i);  

                // Step (1) - beware of the ZipFileSet  
                if (rc instanceof FileSet && rc.isFilesystemOnly()) {  
                    processFileSet((FileSet) rc, filesByBasedir, dirsByBasedir, baseDirs);  
                } else { // not a fileset or contains non-file resources  
                    processNonFilesetResourceCollection(rc, baseDirs, nonFileResources);  
                }  
            }  

            iterateOverBaseDirs(baseDirs, dirsByBasedir, filesByBasedir);  

            // do all the copy operations now...  
            doFileOperationsOrLog();  

            if (nonFileResources.size() > 0 || singleResource != null) {  
                processNonFileResources(nonFileResources);  
            }  
        } finally {  
            // clean up again, so this instance can be used a second  
            // time  
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
     * Process a FileSet resource collection, extracting files and directories  
     * to be copied.  
     *  
     * @param fs           the FileSet to process  
     * @param filesByBasedir map of baseDir to files  
     * @param dirsByBasedir  map of baseDir to directories  
     * @param baseDirs     set of collected base directories  
     */  
    private void processFileSet(FileSet fs, HashMap<File, List<String>> filesByBasedir,  
                            HashMap<File, List<String>> dirsByBasedir, HashSet<File> baseDirs) {  
        DirectoryScanner ds = null;  
        try {  
            ds = fs.getDirectoryScanner(getProject());  
        } catch (BuildException e) {  
            handleScanException(e, fs.getDir(getProject()));  
            return;  
        }  

        File fromDir = fs.getDir(getProject());  
        String[] srcFiles = ds.getIncludedFiles();  
        String[] srcDirs = ds.getIncludedDirectories();  

        if (!flatten && mapperElement == null  
            && ds.isEverythingIncluded() && !fs.hasPatterns()) {  
            completeDirMap.put(fromDir, destDir);  
        }  

        add(fromDir, srcFiles, filesByBasedir);  
        add(fromDir, srcDirs, dirsByBasedir);  
        baseDirs.add(fromDir);  
    }  

    /**  
     * Process a non-FileSet resource collection, categorizing resources.  
     *  
     * @param rc                the resource collection  
     * @param baseDirs          set of base directories  
     * @param nonFileResources  list of non-file resources  
     */  
    private void processNonFilesetResourceCollection(ResourceCollection rc, HashSet<File> baseDirs,  
                                                    ArrayList<Resource> nonFileResources) {  
        if (!rc.isFilesystemOnly() && !supportsNonFileResources()) {  
            throw new BuildException("Only FileSystem resources are supported.");  
        }  

        for (Resource r : rc) {  
            if (!r.isExists()) {  
                logMissingResource(r);  
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
                add(baseDir, name, dirsByBasedir);  
                baseDirs.add(baseDir);  
            } else {  
                nonFileResources.add(r);  
            }  
        }  
    }  

    /**  
     * Logs a warning message when a resource is missing.  
     *  
     * @param r the missing resource  
     */  
    private void logMissingResource(Resource r) {  
        String message = "Warning: Could not find resource "  
            + r.toLongString() + " to copy.";  
        if (!failonerror) {  
            if (!quiet) {  
                log(message, Project.MSG_ERR);  
            }  
        } else {  
            throw new BuildException(message);  
        }  
    }  

    /**  
     * Handle exception thrown during directory scan and either rethrow or log.  
     *  
     * @param e the build exception  
     * @param dir the base directory of the fileset  
     */  
    private void handleScanException(BuildException e, File dir) {  
        String msg = getMessage(e);  
        if (failonerror || !msg.endsWith(DirectoryScanner.DOES_NOT_EXIST_POSTFIX)) {  
            throw e;  
        } else if (!quiet) {  
            log("Warning: " + msg, Project.MSG_ERR);  
        }  
    }  

    /**  
     * Execute file operations, catching and logging if needed.  
     */  
    private void doFileOperationsOrLog() {  
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
     * Process remaining non-file resources and perform copy operations.  
     *  
     * @param nonFileResources list of non-file resources  
     */  
    private void processNonFileResources(ArrayList<Resource> nonFileResources) {  
        Resource[] nonFiles =  
            (Resource[]) nonFileResources.toArray(new Resource[nonFileResources.size()]);  

        Map<Resource, String[]> map = scan(nonFiles, destDir);  
        if (singleResource != null) {  
            map.put(singleResource,  
                    new String[] { destFile.getAbsolutePath() });  
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

    /************************************************************************  
     **  protected and private methods  
     ************************************************************************/  

    private void copySingleFile() {  
        // deal with the single file  
        if (file != null) {  
            if (file.exists()) {  
                if (destFile == null) {  
                    destFile = new File(destDir, file.getName());  
                }  
                if (forceOverwrite || !destFile.exists()  
                    || (file.lastModified() - granularity  
                        > destFile.lastModified())) {  
                    fileCopyMap.put(file.getAbsolutePath(),  
                                    new String[] {destFile.getAbsolutePath()});  
                } else {  
                    log(file + " omitted as " + destFile  
                        + " is up to date.", Project.MSG_VERBOSE);  
                }  
            } else {  
                String message = "Warning: Could not find file "  
                    + file.getAbsolutePath() + " to copy.";  
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
            scanForBaseDir(f, dirsByBasedir.get(f), filesByBasedir.get(f));  
        }  
    }  

    /**  
     * Scans files and directories under a specific baseDir.  
     *  
     * @param baseDir   the base directory  
     * @param dirNames  list of directory names  
     * @param fileNames list of file names  
     */  
    private void scanForBaseDir(File baseDir, List<String> dirNames, List<String> fileNames) {  
        String[] srcFiles = fileNames != null ? fileNames.toArray(new String[0]) : new String[0];  
        String[] srcDirs = dirNames != null ? dirNames.toArray(new String[0]) : new String[0];  
        scan(baseDir == NULL_FILE_PLACEHOLDER ? null : baseDir, destDir, srcFiles, srcDirs);  
    }  

    /**  
     * Ensure we have a consistent and legal set of attributes, and set  
     * any internal flags necessary based on different combinations  
     * of attributes.  
     * @exception BuildException if an error occurs.  
     */  
    protected void validateAttributes() throws BuildException {  
        validateRequiredSources();  
        validateDestinationMutualExclusion();  
        validateSourceDirectoryUsage();  
        validateResourceCollectionsWithSingleFileDestination();  
        handleDirectoryDestination();  
    }  

    /**  
     * Validate that at least one source is specified.  
     * @throws BuildException if no source is provided  
     */  
    private void validateRequiredSources() throws BuildException {  
        if (file == null && rcs.size() == 0) {  
            throw new BuildException(  
                "Specify at least one source--a file or a resource collection.");  
        }  
    }  

    /**  
     * Ensure tofile and todir are not specified together.  
     * @throws BuildException if both destinations are set  
     */  
    private void validateDestinationMutualExclusion() throws BuildException {  
        if (destFile != null && destDir != null) {  
            throw new BuildException(  
                "Only one of tofile and todir may be set.");  
        }  
    }  

    /**  
     * Ensure either tofile or todir is set.  
     * @throws BuildException if neither destination is set  
     */  
    private void validateDestinationRequired() throws BuildException {  
        if (destFile == null && destDir == null) {  
            throw new BuildException("One of tofile or todir must be set.");  
        }  
    }  

    /**  
     * Ensure file is not a directory unless using resource collections.  
     * @throws BuildException if file is a directory  
     */  
    private void validateSourceDirectoryUsage() throws BuildException {  
        if (file != null && file.isDirectory()) {  
            throw new BuildException("Use a resource collection to copy directories.");  
        }  
    }  

    /**  
     * Validate resource collections when tofile is set.  
     * @throws BuildException if conditions are invalid  
     */  
    private void validateResourceCollectionsWithSingleFileDestination() throws BuildException {  
        if (destFile != null && rcs.size() > 0) {  
            if (rcs.size() > 1) {  
                throw new BuildException(  
                    "Cannot concatenate multiple files into a single file.");  
            } else {  
                ResourceCollection rc = (ResourceCollection) rcs.elementAt(0);  
                validateResourceCollection(rc);  

                if (rc.size() == 0) {  
                    throw new BuildException(MSG_WHEN_COPYING_EMPTY_RC_TO_FILE);  
                } else if (rc.size() == 1) {  
                    handleSingleResourceForSingleFileTarget(rc);  
                } else {  
                    throw new BuildException(  
                        "Cannot concatenate multiple files into a single file.");  
                }  
            }  
        }  
    }  

    /**  
     * Validates the given resource collection for compatibility.  
     *  
     * @param rc the resource collection to validate  
     * @throws BuildException if the resource collection is invalid  
     */  
    private void validateResourceCollection(ResourceCollection rc) throws BuildException {  
        if (!rc.isFilesystemOnly() && !supportsNonFileResources()) {  
            throw new BuildException("Only FileSystem resources are"  
                                     + " supported.");  
        }  
    }  

    /**  
     * Handles a single resource in a tofile context, extracting or storing it.  
     *  
     * @param rc the single-resource collection  
     * @throws BuildException if internal error occurs  
     */  
    private void handleSingleResourceForSingleFileTarget(ResourceCollection rc) throws BuildException {  
        Resource res = rc.iterator().next();  
        FileProvider r = res.as(FileProvider.class);  
        if (file == null) {  
            if (r != null) {  
                file = r.getFile();  
                rcs.removeElementAt(0);  
            } else {  
                singleResource = res;  
            }  
        } else {  
            throw new BuildException(  
                "Cannot concatenate multiple files into a single file.");  
        }  
    }  

    /**  
     * Derives directory destination from file destination, if applicable.  
     */  
    private void handleDirectoryDestination() {  
        if (destFile != null) {  
            destDir = destFile.getParentFile();  
        }  
    }  

    /**  
     * Compares source files to destination files to see if they should be  
     * copied.  
     *  
     * @param fromDir  The source directory.  
     * @param toDir    The destination directory.  
     * @param files    A list of files to copy.  
     * @param dirs     A list of directories to copy.  
     */  
    protected void scan(File fromDir, File toDir, String[] files,  
                        String[] dirs) {  
       FileNameMapper mapper = getMapper();  
        buildMap(fromDir, toDir, files, mapper, fileCopyMap);  

        if (includeEmpty) {  
            buildMap(fromDir, toDir, dirs, mapper, dirCopyMap);  
        }  
    }  

    /**  
     * Compares source resources to destination files to see if they  
     * should be copied.  
     *  
     * @param fromResources  The source resources.  
     * @param toDir          The destination directory.  
     *  
     * @return a Map with the out-of-date resources as keys and an  
     * array of target file names as values.  
     *  
     * @since Ant 1.7  
     */  
    protected Map<Resource, String[]> scan(Resource[] fromResources, File toDir) {  
        return buildMap(fromResources, toDir, getMapper());  
    }  

    /**  
     * Add to a map of files/directories to copy.  
     *  
     * @param fromDir the source directory.  
     * @param toDir   the destination directory.  
     * @param names   a list of filenames.  
     * @param mapper  a <code>FileNameMapper</code> value.  
     * @param map     a map of source file to array of destination files.  
     */  
    protected void buildMap(File fromDir, File toDir, String[] names,  
                            FileNameMapper mapper, Hashtable<String, String[]> map) {  
        String[] toCopy = determineFilesToCopy(names, mapper);  
        applyCopyMapping(toCopy, fromDir, toDir, mapper, map);  
    }  

    /**  
     * Determine which files should be copied based on overwrite policy.  
     *  
     * @param names the file names  
     * @param mapper the filename mapper  
     * @return array of names to copy  
     */  
    private String[] determineFilesToCopy(String[] names, FileNameMapper mapper) {  
        if (forceOverwrite) {  
            return filterMappedFiles(names, mapper);  
        } else {  
            return restrictByTimestamp(names, mapper);  
        }  
    }  

    /**  
     * Filter file names based on whether the mapper supports them.  
     *  
     * @param names the file names  
     * @param mapper the filename mapper  
     * @return filtered list of file names  
     */  
    private String[] filterMappedFiles(String[] names, FileNameMapper mapper) {  
        Vector<String> v = new Vector<String>();  
        for (String name : names) {  
            if (mapper.mapFileName(name) != null) {  
                v.addElement(name);  
            }  
        }  
        String[] result = new String[v.size()];  
        v.copyInto(result);  
        return result;  
    }  

    /**  
     * Restrict file list to those that require copying based on timestamp logic.  
     *  
     * @param names file names  
     * @param mapper filename mapper  
     * @return subset of names requiring copy  
     */  
    private String[] restrictByTimestamp(String[] names, FileNameMapper mapper) {  
        SourceFileScanner ds = new SourceFileScanner(this);  
        return ds.restrict(names, file == null ? null : file.getParentFile(), destDir, mapper, granularity);  
    }  

    /**  
     * Apply file/directory mapping results to the internal map.  
     *  
     * @param toCopy    files or directories to copy  
     * @param fromDir   source directory  
     * @param toDir     destination directory  
     * @param mapper    filename mapper  
     * @param map       source-target mapping structure  
     */  
    private void applyCopyMapping(String[] toCopy, File fromDir, File toDir, FileNameMapper mapper,  
                                  Hashtable<String, String[]> map) {  
        for (String name : toCopy) {  
            File src = new File(fromDir, name);  
            String[] mappedFiles = mapper.mapFileName(name);  

            if (!enableMultipleMappings) {  
                map.put(src.getAbsolutePath(), new String[] {new File(toDir, mappedFiles[0]).getAbsolutePath()});  
            } else {  
                for (int k = 0; k < mappedFiles.length; k++) {  
                    mappedFiles[k] = new File(toDir, mappedFiles[k]).getAbsolutePath();  
                }  
                map.put(src.getAbsolutePath(), mappedFiles);  
            }  
        }  
    }  

    /**  
     * Create a map of resources to copy.  
     *  
     * @param fromResources  The source resources.  
     * @param toDir   the destination directory.  
     * @param mapper  a <code>FileNameMapper</code> value.  
     * @return a map of source resource to array of destination files.  
     * @since Ant 1.7  
     */  
    protected Map<Resource, String[]> buildMap(Resource[] fromResources, final File toDir,  
                           FileNameMapper mapper) {  
        HashMap<Resource, String[]> map = new HashMap<Resource, String[]>();  
        Resource[] toCopy = determineResourcesToCopy(fromResources, mapper);  
        applyResourceCopyMapping(toCopy, toDir, mapper, map);  
        return map;  
    }  

    /**  
     * Determine which resources are candidates for copying.  
     *  
     * @param fromResources resources to evaluate  
     * @param mapper        filename mapper  
     * @return subset of resources requiring copy  
     */  
    private Resource[] determineResourcesToCopy(Resource[] fromResources, FileNameMapper mapper) {  
        if (forceOverwrite) {  
            return filterMappedResources(fromResources, mapper);  
        } else {  
            return selectOutOfDateResources(fromResources, mapper);  
        }  
    }  

    /**  
     * Filter resources based on whether the mapper can map them.  
     *  
     * @param fromResources resources to filter  
     * @param mapper        filename mapper  
     * @return filtered resources  
     */  
    private Resource[] filterMappedResources(Resource[] fromResources, FileNameMapper mapper) {  
        Vector<Resource> v = new Vector<Resource>();  
        for (Resource r : fromResources) {  
            if (mapper.mapFileName(r.getName()) != null) {  
                v.addElement(r);  
            }  
        }  
        Resource[] result = new Resource[v.size()];  
        v.copyInto(result);  
        return result;  
    }  

    /**  
     * Select resources that are out-of-date relative to their destinations.  
     *  
     * @param fromResources resources to scan  
     * @param mapper        filename mapper  
     * @return resources needing copy  
     */  
    private Resource[] selectOutOfDateResources(Resource[] fromResources, FileNameMapper mapper) {  
        return ResourceUtils.selectOutOfDateSources(this, fromResources, mapper,  
            new ResourceFactory() {  
                public Resource getResource(String name) {  
                    return new FileResource(toDir, name);  
                }  
            }, granularity);  
    }  

    /**  
     * Apply copy mapping for resources.  
     *  
     * @param toCopy        resources to copy  
     * @param toDir         destination directory  
     * @param mapper        filename mapper  
     * @param map           output map  
     */  
    private void applyResourceCopyMapping(Resource[] toCopy, File toDir, FileNameMapper mapper,  
                                   Map<Resource, String[]> map) {  
        for (Resource r : toCopy) {  
            String[] mappedFiles = mapper.mapFileName(r.getName());  
            validateMappedFiles(mappedFiles);  

            if (!enableMultipleMappings) {  
                map.put(r, new String[] {new File(toDir, mappedFiles[0]).getAbsolutePath()});  
            } else {  
                for (int k = 0; k < mappedFiles.length; k++) {  
                    mappedFiles[k] = new File(toDir, mappedFiles[k]).getAbsolutePath();  
                }  
                map.put(r, mappedFiles);  
            }  
        }  
    }  

    /**  
     * Validates that mapped files are not null for non-directory resources.  
     *  
     * @param mappedFiles the result of filename mapping  
     * @throws BuildException if any mapped file is null  
     */  
    private void validateMappedFiles(String[] mappedFiles) {  
        for (String f : mappedFiles) {  
            if (f == null) {  
                throw new BuildException("Can't copy a resource without a"  
                                         + " name if the mapper doesn't"  
                                         + " provide one.");  
            }  
        }  
    }  

    /**  
     * Actually does the file (and possibly empty directory) copies.  
     * This is a good method for subclasses to override.  
     */  
    protected void doFileOperations() {  
        if (fileCopyMap.size() > 0) {  
            log("Copying " + fileCopyMap.size()  
                + " file" + (fileCopyMap.size() == 1 ? "" : "s")  
                + " to " + destDir.getAbsolutePath());  

            for (Map.Entry<String, String[]> e : fileCopyMap.entrySet()) {  
                processFileCopy(e);  
            }  
        }  

        if (includeEmpty) {  
            createEmptyDirectories();  
        }  
    }  

    /**  
     * Copies a single file or multiple mapped destinations from one source.  
     *  
     * @param entry source-to-dest mapping entry  
     */  
    private void processFileCopy(Map.Entry<String, String[]> entry) {  
        String fromFile = entry.getKey();  
        String[] toFiles = entry.getValue();  

        for (String toFile : toFiles) {  
            if (fromFile.equals(toFile)) {  
                log("Skipping self-copy of " + fromFile, verbosity);  
                continue;  
            }  

            copyFileWithLogging(fromFile, toFile);  
        }  
    }  

    /**  
     * Attempts to copy a file, logging and handling errors appropriately.  
     *  
     * @param fromFile absolute path to source  
     * @param toFile   absolute path to destination  
     */  
    private void copyFileWithLogging(String fromFile, String toFile) {  
        log("Copying " + fromFile + " to " + toFile, verbosity);  

        FilterSetCollection filters = new FilterSetCollection();  
        if (filtering) {  
            filters.addFilterSet(getProject().getGlobalFilterSet());  
        }  
        for (FilterSet fs : filterSets) {  
            filters.addFilterSet(fs);  
        }  

        try {  
            fileUtils.copyFile(new File(fromFile), new File(toFile),  
                filters, filterChains, forceOverwrite, preserveLastModified,  
                false, inputEncoding, outputEncoding, getProject(), getForce());  
        } catch (IOException ioe) {  
            handleFileCopyFailure(fromFile, toFile, ioe);  
        }  
    }  

    /**  
     * Handles failure to copy a file: logs or throws exception depending on mode.  
     *  
     * @param fromFile   source file  
     * @param toFile     destination file  
     * @param ioe        the caught IOException  
     */  
    private void handleFileCopyFailure(String fromFile, String toFile, IOException ioe) {  
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

    /**  
     * Adds empty directories as needed.  
     */  
    private void createEmptyDirectories() {  
        int createCount = 0;  
        for (String[] dirs : dirCopyMap.values()) {  
            for (String dirPath : dirs) {  
                File d = new File(dirPath);  
                if (!d.exists() && d.mkdirs()) {  
                    createCount++;  
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

    /**  
     * Actually does the resource copies.  
     * This is a good method for subclasses to override.  
     * @param map a map of source resource to array of destination files.  
     * @since Ant 1.7  
     */  
    protected void doResourceOperations(Map<Resource, String[]> map) {  
        if (map.size() == 0) {  
            return;  
        }  

        log("Copying " + map.size()  
            + " resource" + (map.size() == 1 ? "" : "s")  
            + " to " + destDir.getAbsolutePath());  

        for (Map.Entry<Resource, String[]> entry : map.entrySet()) {  
            processResourceCopy(entry);  
        }  
    }  

    /**  
     * Copies a single resource to its mapped destinations.  
     *  
     * @param entry mapping entry  
     */  
    private void processResourceCopy(Map.Entry<Resource, String[]> entry) {  
        Resource fromResource = entry.getKey();  
        for (String toFile : entry.getValue()) {  
            copySingleResource(fromResource, toFile);  
        }  
    }  

    /**  
     * Copies a single resource and logs errors.  
     *  
     * @param fromResource the source resource  
     * @param toFile       destination path  
     */  
    private void copySingleResource(Resource fromResource, String toFile) {  
        log("Copying " + fromResource + " to " + toFile, verbosity);  

        FilterSetCollection filters = new FilterSetCollection();  
        if (filtering) {  
            filters.addFilterSet(getProject().getGlobalFilterSet());  
        }  
        for (FilterSet fs : filterSets) {  
            filters.addFilterSet(fs);  
        }  

        try {  
            ResourceUtils.copyResource(fromResource,  
                new FileResource(destDir, toFile),  
                filters, filterChains, forceOverwrite, preserveLastModified,  
                false, inputEncoding, outputEncoding, getProject(), getForce());  
        } catch (IOException ioe) {  
            handleResourceCopyFailure(fromResource, toFile, ioe);  
        }  
    }  

    /**  
     * Handles failure to copy a resource.  
     *  
     * @param fromResource source  
     * @param toFile       destination  
     * @param ioe          the caught IOException  
     */  
    private void handleResourceCopyFailure(Resource fromResource, String toFile, IOException ioe) {  
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

    /**  
     * Whether this task can deal with non-file resources.  
     *  
     * <p>&lt;copy&gt; can while &lt;move&gt; can't since we don't  
     * know how to remove non-file resources.</p>  
     *  
     * <p>This implementation returns true only if this task is  
     * &lt;copy&gt;.  Any subclass of this class that also wants to  
     * support non-file resources needs to override this method.  We  
     * need to do so for backwards compatibility reasons since we  
     * can't expect subclasses to support resources.</p>  
     * @return true if this task supports non file resources.  
     * @since Ant 1.7  
     */  
    protected boolean supportsNonFileResources() {  
        return getClass().equals(Copy.class);  
    }  

    /**  
     * Adds the given strings to a list contained in the given map.  
     * The file is the key into the map.  
     */  
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

    /**  
     * Adds the given string to a list contained in the given map.  
     * The file is the key into the map.  
     */  
    private static void add(File baseDir, String name, Map<File, List<String>> m) {  
        if (name != null) {  
            add(baseDir, new String[] {name}, m);  
        }  
    }  

    /**  
     * Either returns its argument or a plaeholder if the argument is null.  
     */  
    private static File getKeyFile(File f) {  
        return f == null ? NULL_FILE_PLACEHOLDER : f;  
    }  

    /**  
     * returns the mapper to use based on nested elements or the  
     * flatten attribute.  
     */  
    private FileNameMapper getMapper() {  
        FileNameMapper mapper = null;  
        if (mapperElement != null) {  
            mapper = mapperElement.getImplementation();  
        } else if (flatten) {  
            mapper = new FlatFileNameMapper();  
        } else {  
            mapper = new IdentityMapper();  
        }  
        return mapper;  
    }  

    /**  
     * Handle getMessage() for exceptions.  
     * @param ex the exception to handle  
     * @return ex.getMessage() if ex.getMessage() is not null  
     *         otherwise return ex.toString()  
     */  
    private String getMessage(Exception ex) {  
        return ex.getMessage() == null ? ex.toString() : ex.getMessage();  
    }  

    /**  
     * Returns a reason for failure based on  
     * the exception thrown.  
     * If the exception is not IOException output the class name,  
     * output the message  
     * if the exception is MalformedInput add a little note.  
     */  
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