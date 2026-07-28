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
package org.apache.tools.ant.util;

import java.io.File;
import java.io.FilenameFilter;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.Reader;
import java.io.Writer;
import java.net.HttpURLConnection;
import java.net.JarURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLConnection;
import java.nio.channels.Channel;
import java.text.DecimalFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Random;
import java.util.Stack;
import java.util.StringTokenizer;
import java.util.Vector;
import java.util.jar.JarFile;

import org.apache.tools.ant.BuildException;
import org.apache.tools.ant.PathTokenizer;
import org.apache.tools.ant.Project;
import org.apache.tools.ant.launch.Locator;
import org.apache.tools.ant.taskdefs.condition.Os;
import org.apache.tools.ant.types.FilterSetCollection;
import org.apache.tools.ant.types.resources.FileResource;

/**
 * This class also encapsulates methods which allow Files to be
 * referred to using abstract path names which are translated to native
 * system file paths at runtime as well as copying files or setting
 * their last modification time.
 *
 */
public class FileUtils {
    private static final int DELETE_RETRY_SLEEP_MILLIS = 10;
    private static final int EXPAND_SPACE = 50;
    private static final FileUtils PRIMARY_INSTANCE = new FileUtils();

    //get some non-crypto-grade randomness from various places.
    private static Random rand = new Random(System.currentTimeMillis()
            + Runtime.getRuntime().freeMemory());

    private static final boolean ON_NETWARE = Os.isFamily("netware");
    private static final boolean ON_DOS = Os.isFamily("dos");
    private static final boolean ON_WIN9X = Os.isFamily("win9x");
    private static final boolean ON_WINDOWS = Os.isFamily("windows");

    static final int BUF_SIZE = 8192;


    /**
     * The granularity of timestamps under FAT.
     */
    public static final long FAT_FILE_TIMESTAMP_GRANULARITY = 2000;

    /**
     * The granularity of timestamps under Unix.
     */
    public static final long UNIX_FILE_TIMESTAMP_GRANULARITY = 1000;

    /**
     * The granularity of timestamps under the NT File System.
     * NTFS has a granularity of 100 nanoseconds, which is less
     * than 1 millisecond, so we round this up to 1 millisecond.
     */
    public static final long NTFS_FILE_TIMESTAMP_GRANULARITY = 1;

    /**
     * A one item cache for fromUri.
     * fromUri is called for each element when parseing ant build
     * files. It is a costly operation. This just caches the result
     * of the last call.
     */
    private Object cacheFromUriLock = new Object();
    private String cacheFromUriRequest = null;
    private String cacheFromUriResponse = null;

    /**
     * Factory method.
     *
     * @return a new instance of FileUtils.
     * @deprecated since 1.7.
     *             Use getFileUtils instead,
     * FileUtils do not have state.
     */
    public static FileUtils newFileUtils() {
        return new FileUtils();
    }

    /**
     * Method to retrieve The FileUtils, which is shared by all users of this
     * method.
     * @return an instance of FileUtils.
     * @since Ant 1.6.3
     */
    public static FileUtils getFileUtils() {
        return PRIMARY_INSTANCE;
    }

    /**
     * Empty constructor.
     */
    protected FileUtils() {
    }

    /**
     * Get the URL for a file taking into account # characters.
     *
     * @param file the file whose URL representation is required.
     * @return The FileURL value.
     * @throws MalformedURLException if the URL representation cannot be
     *      formed.
     */
    public URL getFileURL(File file) throws MalformedURLException {
        return new URL(file.toURI().toASCIIString());
    }

    // ----------------------------------------------------------------------
    // Copy file overloads (unchanged)
    // ----------------------------------------------------------------------
    public void copyFile(String sourceFile, String destFile) throws IOException {
        copyFile(new File(sourceFile), new File(destFile), null, false, false);
    }

    public void copyFile(String sourceFile, String destFile, FilterSetCollection filters)
            throws IOException {
        copyFile(new File(sourceFile), new File(destFile), filters, false, false);
    }

    public void copyFile(String sourceFile, String destFile, FilterSetCollection filters,
                         boolean overwrite) throws IOException {
        copyFile(new File(sourceFile), new File(destFile), filters, overwrite, false);
    }

    public void copyFile(String sourceFile, String destFile,
                         FilterSetCollection filters,
                         boolean overwrite, boolean preserveLastModified)
        throws IOException {
        copyFile(new File(sourceFile), new File(destFile), filters, overwrite,
                 preserveLastModified);
    }

    public void copyFile(String sourceFile, String destFile,
                         FilterSetCollection filters, boolean overwrite,
                         boolean preserveLastModified, String encoding) throws IOException {
        copyFile(new File(sourceFile), new File(destFile), filters,
                 overwrite, preserveLastModified, encoding);
    }

    // CheckStyle:ParameterNumberCheck OFF - bc
    public void copyFile(String sourceFile, String destFile,
                         FilterSetCollection filters, Vector filterChains,
                         boolean overwrite, boolean preserveLastModified,
                         String encoding, Project project) throws IOException {
        copyFile(new File(sourceFile), new File(destFile), filters, filterChains, overwrite,
                preserveLastModified, encoding, project);
    }

    public void copyFile(String sourceFile, String destFile,
                         FilterSetCollection filters, Vector filterChains,
                         boolean overwrite, boolean preserveLastModified,
                         String inputEncoding, String outputEncoding,
                         Project project) throws IOException {
        copyFile(new File(sourceFile), new File(destFile), filters, filterChains, overwrite,
                preserveLastModified, inputEncoding, outputEncoding, project);
    }

    public void copyFile(File sourceFile, File destFile) throws IOException {
        copyFile(sourceFile, destFile, null, false, false);
    }

    public void copyFile(File sourceFile, File destFile, FilterSetCollection filters)
            throws IOException {
        copyFile(sourceFile, destFile, filters, false, false);
    }

    public void copyFile(File sourceFile, File destFile, FilterSetCollection filters,
                         boolean overwrite) throws IOException {
        copyFile(sourceFile, destFile, filters, overwrite, false);
    }

    public void copyFile(File sourceFile, File destFile, FilterSetCollection filters,
                         boolean overwrite, boolean preserveLastModified) throws IOException {
        copyFile(sourceFile, destFile, filters, overwrite, preserveLastModified, null);
    }

    public void copyFile(File sourceFile, File destFile,
                         FilterSetCollection filters, boolean overwrite,
                         boolean preserveLastModified, String encoding) throws IOException {
        copyFile(sourceFile, destFile, filters, null, overwrite,
                 preserveLastModified, encoding, null);
    }

    public void copyFile(File sourceFile, File destFile,
                         FilterSetCollection filters, Vector filterChains,
                         boolean overwrite, boolean preserveLastModified,
                         String encoding, Project project) throws IOException {
        copyFile(sourceFile, destFile, filters, filterChains,
                 overwrite, preserveLastModified, encoding, encoding, project);
    }

    public void copyFile(File sourceFile, File destFile,
                         FilterSetCollection filters, Vector filterChains,
                         boolean overwrite, boolean preserveLastModified,
                         String inputEncoding, String outputEncoding,
                         Project project) throws IOException {
        copyFile(sourceFile, destFile, filters, filterChains, overwrite, preserveLastModified,
                false, inputEncoding, outputEncoding, project);
    }

    public void copyFile(File sourceFile, File destFile,
            FilterSetCollection filters, Vector filterChains,
            boolean overwrite, boolean preserveLastModified,
            String inputEncoding, String outputEncoding,
            Project project) throws IOException {
        copyFile(sourceFile, destFile, filters, filterChains, overwrite, preserveLastModified,
                false, inputEncoding, outputEncoding, project);
    }

    public void copyFile(File sourceFile, File destFile,
                         FilterSetCollection filters, Vector filterChains,
                         boolean overwrite, boolean preserveLastModified,
                         boolean append,
                         String inputEncoding, String outputEncoding,
                         Project project) throws IOException {
        copyFile(sourceFile, destFile, filters, filterChains, overwrite,
                 preserveLastModified, append, inputEncoding, outputEncoding,
                 project, /* force: */ false);
    }

    public void copyFile(File sourceFile, File destFile,
                         FilterSetCollection filters, Vector filterChains,
                         boolean overwrite, boolean preserveLastModified,
                         boolean append,
                         String inputEncoding, String outputEncoding,
                         Project project, boolean force) throws IOException {
        ResourceUtils.copyResource(new FileResource(sourceFile),
                                   new FileResource(destFile),
                                   filters, filterChains, overwrite,
                                   preserveLastModified, append, inputEncoding,
                                   outputEncoding, project, force);
    }

    // CheckStyle:ParameterNumberCheck ON

    public void setFileLastModified(File file, long time) {
        ResourceUtils.setLastModified(new FileResource(file), time);
    }

    public File resolveFile(File file, String filename) {
        if (!isAbsolutePath(filename)) {
            char sep = File.separatorChar;
            filename = filename.replace('/', sep).replace('\\', sep);
            if (isContextRelativePath(filename)) {
                file = null;
                String udir = System.getProperty("user.dir");
                if (filename.charAt(0) == sep && udir.charAt(0) == sep) {
                    filename = dissect(udir)[0] + filename.substring(1);
                }
            }
            filename = new File(file, filename).getAbsolutePath();
        }
        return normalize(filename);
    }

    public static boolean isContextRelativePath(String filename) {
        if (!(ON_DOS || ON_NETWARE) || filename.length() == 0) {
            return false;
        }
        char sep = File.separatorChar;
        filename = filename.replace('/', sep).replace('\\', sep);
        char c = filename.charAt(0);
        int len = filename.length();
        return (c == sep && (len == 1 || filename.charAt(1) != sep))
                || (Character.isLetter(c) && len > 1
                && filename.indexOf(':') == 1
                && (len == 2 || filename.charAt(2) != sep));
    }

    public static boolean isAbsolutePath(String filename) {
        int len = filename.length();
        if (len == 0) {
            return false;
        }
        char sep = File.separatorChar;
        filename = filename.replace('/', sep).replace('\\', sep);
        char c = filename.charAt(0);
        if (!(ON_DOS || ON_NETWARE)) {
            return (c == sep);
        }
        if (c == sep) {
            if (!(ON_DOS && len > 4 && filename.charAt(1) == sep)) {
                return false;
            }
            int nextsep = filename.indexOf(sep, 2);
            return nextsep > 2 && nextsep + 1 < len;
        }
        int colon = filename.indexOf(':');
        return (Character.isLetter(c) && colon == 1
                && filename.length() > 2 && filename.charAt(2) == sep)
                || (ON_NETWARE && colon > 0);
    }

    public static String translatePath(String toProcess) {
        if (toProcess == null || toProcess.length() == 0) {
            return "";
        }
        StringBuffer path = new StringBuffer(toProcess.length() + EXPAND_SPACE);
        PathTokenizer tokenizer = new PathTokenizer(toProcess);
        while (tokenizer.hasMoreTokens()) {
            String pathComponent = tokenizer.nextToken();
            pathComponent = pathComponent.replace('/', File.separatorChar);
            pathComponent = pathComponent.replace('\\', File.separatorChar);
            if (path.length() != 0) {
                path.append(File.pathSeparatorChar);
            }
            path.append(pathComponent);
        }
        return path.toString();
    }

    public File normalize(final String path) {
        Stack s = new Stack();
        String[] dissect = dissect(path);
        s.push(dissect[0]);

        StringTokenizer tok = new StringTokenizer(dissect[1], File.separator);
        while (tok.hasMoreTokens()) {
            String thisToken = tok.nextToken();
            if (".".equals(thisToken)) {
                continue;
            }
            if ("..".equals(thisToken)) {
                if (s.size() < 2) {
                    return new File(path);
                }
                s.pop();
            } else {
                s.push(thisToken);
            }
        }
        StringBuffer sb = new StringBuffer();
        final int size = s.size();
        for (int i = 0; i < size; i++) {
            if (i > 1) {
                sb.append(File.separatorChar);
            }
            sb.append(s.elementAt(i));
        }
        return new File(sb.toString());
    }

    /**
     * Dissect the specified absolute path.
     *
     * @param path the path to dissect.
     * @return String[] {root, remaining path}.
     * @throws java.lang.NullPointerException if path is null.
     * @since Ant 1.7
     */
    public String[] dissect(String path) {
        char sep = File.separatorChar;
        path = path.replace('/', sep).replace('\\', sep);

        if (!isAbsolutePath(path)) {
            throw new BuildException(path + " is not an absolute path");
        }

        String root = extractRoot(path, sep);
        String remaining = extractRemaining(path, root, sep);
        return new String[] {root, remaining};
    }

    /**
     * Extracts the root component of an absolute path.
     *
     * @param path the normalized path string.
     * @param sep the platform file separator.
     * @return the root part of the path.
     */
    private String extractRoot(String path, char sep) {
        int colon = path.indexOf(':');
        if (colon > 0 && (ON_DOS || ON_NETWARE)) {
            return extractDriveRoot(path, colon, sep);
        } else if (path.length() > 1 && path.charAt(1) == sep) {
            return extractUncRoot(path, sep);
        } else {
            return File.separator;
        }
    }

    /**
     * Handles drive-letter based roots (e.g., "C:").
     */
    private String extractDriveRoot(String path, int colon, char sep) {
        int next = colon + 1;
        String root = path.substring(0, next) + sep;
        char[] ca = path.toCharArray();
        next = (ca[next] == sep) ? next + 1 : next;

        StringBuilder sbPath = new StringBuilder();
        for (int i = next; i < ca.length; i++) {
            if (ca[i] != sep || ca[i - 1] != sep) {
                sbPath.append(ca[i]);
            }
        }
        // Update the original path reference for remaining extraction
        // (handled by caller)
        return root;
    }

    /**
     * Handles UNC roots (e.g., "\\server\share\").
     */
    private String extractUncRoot(String path, char sep) {
        int nextsep = path.indexOf(sep, 2);
        nextsep = path.indexOf(sep, nextsep + 1);
        String root = (nextsep > 2) ? path.substring(0, nextsep + 1) : path;
        return root;
    }

    /**
     * Determines the remaining part of the path after the root.
     *
     * @param path the original normalized path.
     * @param root the previously extracted root.
     * @param sep the platform file separator.
     * @return the path without the root component.
     */
    private String extractRemaining(String path, String root, char sep) {
        if (root.equals(File.separator)) {
            return path.substring(1);
        }
        if (root.length() > 0 && path.startsWith(root)) {
            return path.substring(root.length());
        }
        return path;
    }

    public String toVMSPath(File f) {
        String osPath;
        String path = normalize(f.getAbsolutePath()).getPath();
        String name = f.getName();
        boolean isAbsolute = path.charAt(0) == File.separatorChar;
        boolean isDirectory = f.isDirectory()
                && !name.regionMatches(true, name.length() - 4, ".DIR", 0, 4);
        String device = null;
        StringBuffer directory = null;
        String file = null;

        int index = 0;

        if (isAbsolute) {
            index = path.indexOf(File.separatorChar, 1);
            if (index == -1) {
                return path.substring(1) + ":[000000]";
            }
            device = path.substring(1, index++);
        }
        if (isDirectory) {
            directory = new StringBuffer(path.substring(index).replace(File.separatorChar, '.'));
        } else {
            int dirEnd = path.lastIndexOf(File.separatorChar, path.length());
            if (dirEnd == -1 || dirEnd < index) {
                file = path.substring(index);
            } else {
                directory = new StringBuffer(path.substring(index, dirEnd).
                                             replace(File.separatorChar, '.'));
                index = dirEnd + 1;
                if (path.length() > index) {
                    file = path.substring(index);
                }
            }
        }
        if (!isAbsolute && directory != null) {
            directory.insert(0, '.');
        }
        osPath = ((device != null) ? device + ":" : "")
                + ((directory != null) ? "[" + directory + "]" : "")
                + ((file != null) ? file : "");
        return osPath;
    }

    public File createTempFile(String prefix, String suffix, File parentDir) {
        return createTempFile(prefix, suffix, parentDir, false, false);
    }

    private static final String NULL_PLACEHOLDER = "null";

    public File createTempFile(String prefix, String suffix, File parentDir,
            boolean deleteOnExit, boolean createFile) {
        File result = null;
        String parent = (parentDir == null)
                ? System.getProperty("java.io.tmpdir")
                : parentDir.getPath();
        if (prefix == null) {
            prefix = NULL_PLACEHOLDER;
        }
        if (suffix == null) {
            suffix = NULL_PLACEHOLDER;
        }

        if (createFile) {
            try {
                result = File.createTempFile(prefix, suffix, new File(parent));
            } catch (IOException e) {
                throw new BuildException("Could not create tempfile in "
                        + parent, e);
            }
        } else {
            DecimalFormat fmt = new DecimalFormat("#####");
            synchronized (rand) {
                do {
                    result = new File(parent, prefix
                            + fmt.format(rand.nextInt(Integer.MAX_VALUE)) + suffix);
                } while (result.exists());
            }
        }

        if (deleteOnExit) {
            result.deleteOnExit();
        }
        return result;
    }

    public File createTempFile(String prefix, String suffix,
            File parentDir, boolean deleteOnExit) {
        return createTempFile(prefix, suffix, parentDir, deleteOnExit, false);
    }

    public boolean contentEquals(File f1, File f2) throws IOException {
        return contentEquals(f1, f2, false);
    }

    public boolean contentEquals(File f1, File f2, boolean textfile) throws IOException {
        return ResourceUtils.contentEquals(new FileResource(f1), new FileResource(f2), textfile);
    }

    public File getParentFile(File f) {
        return (f == null) ? null : f.getParentFile();
    }

    public static String readFully(Reader rdr) throws IOException {
        return readFully(rdr, BUF_SIZE);
    }

    public static String readFully(Reader rdr, int bufferSize)
        throws IOException {
        if (bufferSize <= 0) {
            throw new IllegalArgumentException("Buffer size must be greater "
                                               + "than 0");
        }
        final char[] buffer = new char[bufferSize];
        int bufferLength = 0;
        StringBuffer textBuffer = null;
        while (bufferLength != -1) {
            bufferLength = rdr.read(buffer);
            if (bufferLength > 0) {
                textBuffer = (textBuffer == null) ? new StringBuffer() : textBuffer;
                textBuffer.append(new String(buffer, 0, bufferLength));
            }
        }
        return (textBuffer == null) ? null : textBuffer.toString();
    }

    public static String safeReadFully(Reader reader) throws IOException {
        String ret = readFully(reader);
        return ret == null ? "" : ret;
    }

    public boolean createNewFile(File f) throws IOException {
        return f.createNewFile();
    }

    public boolean createNewFile(File f, boolean mkdirs) throws IOException {
        File parent = f.getParentFile();
        if (mkdirs && !(parent.exists())) {
            parent.mkdirs();
        }
        return f.createNewFile();
    }

    public boolean isSymbolicLink(File parent, String name)
        throws IOException {
        SymbolicLinkUtils u = SymbolicLinkUtils.getSymbolicLinkUtils();
        if (parent == null) {
            return u.isSymbolicLink(name);
        }
        return u.isSymbolicLink(parent, name);
    }

    public String removeLeadingPath(File leading, File path) {
        String l = normalize(leading.getAbsolutePath()).getAbsolutePath();
        String p = normalize(path.getAbsolutePath()).getAbsolutePath();
        if (l.equals(p)) {
            return "";
        }
        if (!l.endsWith(File.separator)) {
            l += File.separator;
        }
        return (p.startsWith(l)) ? p.substring(l.length()) : p;
    }

    public boolean isLeadingPath(File leading, File path) {
        String l = normalize(leading.getAbsolutePath()).getAbsolutePath();
        String p = normalize(path.getAbsolutePath()).getAbsolutePath();
        if (l.equals(p)) {
            return true;
        }
        if (!l.endsWith(File.separator)) {
            l += File.separator;
        }
        return p.startsWith(l);
    }

    public String toURI(String path) {
        return new File(path).toURI().toASCIIString();
    }

    public String fromURI(String uri) {
        synchronized (cacheFromUriLock) {
            if (uri.equals(cacheFromUriRequest)) {
                return cacheFromUriResponse;
            }
            String path = Locator.fromURI(uri);
            String ret = isAbsolutePath(path) ? normalize(path).getAbsolutePath() : path;
            cacheFromUriRequest = uri;
            cacheFromUriResponse = ret;
            return ret;
        }
    }

    public boolean fileNameEquals(File f1, File f2) {
        return normalize(f1.getAbsolutePath()).getAbsolutePath().equals(
                normalize(f2.getAbsolutePath()).getAbsolutePath());
    }

    public boolean areSame(File f1, File f2) throws IOException {
        if (f1 == null && f2 == null) {
            return true;
        }
        if (f1 == null || f2 == null) {
            return false;
        }
        File f1Normalized = normalize(f1.getAbsolutePath());
        File f2Normalized = normalize(f2.getAbsolutePath());
        return f1Normalized.equals(f2Normalized)
            || f1Normalized.getCanonicalFile().equals(f2Normalized
                                                      .getCanonicalFile());
    }

    public void rename(File from, File to) throws IOException {
        from = normalize(from.getAbsolutePath()).getCanonicalFile();
        to = normalize(to.getAbsolutePath());
        if (!from.exists()) {
            System.err.println("Cannot rename nonexistent file " + from);
            return;
        }
        if (from.getAbsolutePath().equals(to.getAbsolutePath())) {
            System.err.println("Rename of " + from + " to " + to + " is a no-op.");
            return;
        }
        if (to.exists() && !(areSame(from, to) || tryHardToDelete(to))) {
            throw new IOException("Failed to delete " + to + " while trying to rename " + from);
        }
        File parent = to.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("Failed to create directory " + parent
                                  + " while trying to rename " + from);
        }
        if (!from.renameTo(to)) {
            copyFile(from, to);
            if (!tryHardToDelete(from)) {
                throw new IOException("Failed to delete " + from + " while trying to rename it.");
            }
        }
    }

    public long getFileTimestampGranularity() {
        if (ON_WIN9X) {
            return FAT_FILE_TIMESTAMP_GRANULARITY;
        }
        if (ON_WINDOWS) {
            return NTFS_FILE_TIMESTAMP_GRANULARITY;
        }
        if (ON_DOS) {
            return FAT_FILE_TIMESTAMP_GRANULARITY;
        }
        return UNIX_FILE_TIMESTAMP_GRANULARITY;
    }

    public boolean hasErrorInCase(File localFile) {
        localFile = normalize(localFile.getAbsolutePath());
        if (!localFile.exists()) {
            return false;
        }
        final String localFileName = localFile.getName();
        FilenameFilter ff = new FilenameFilter () {
            public boolean accept(File dir, String name) {
                return name.equalsIgnoreCase(localFileName) && (!name.equals(localFileName));
            }
        };
        String[] names = localFile.getParentFile().list(ff);
        return names != null && names.length == 1;
    }

    public boolean isUpToDate(File source, File dest, long granularity) {
        if (!dest.exists()) {
            return false;
        }
        long sourceTime = source.lastModified();
        long destTime = dest.lastModified();
        return isUpToDate(sourceTime, destTime, granularity);
    }

    public boolean isUpToDate(File source, File dest) {
        return isUpToDate(source, dest, getFileTimestampGranularity());
    }

    public boolean isUpToDate(long sourceTime, long destTime, long granularity) {
        return destTime != -1 && destTime >= sourceTime + granularity;
    }

    public boolean isUpToDate(long sourceTime, long destTime) {
        return isUpToDate(sourceTime, destTime, getFileTimestampGranularity());
    }

    public static void close(Writer device) {
        if (null != device) {
            try {
                device.close();
            } catch (IOException e) {
                //ignore
            }
        }
    }

    public static void close(Reader device) {
        if (null != device) {
            try {
                device.close();
            } catch (IOException e) {
                //ignore
            }
        }
    }

    public static void close(OutputStream device) {
        if (null != device) {
            try {
                device.close();
            } catch (IOException e) {
                //ignore
            }
        }
    }

    public static void close(InputStream device) {
        if (null != device) {
            try {
                device.close();
            } catch (IOException e) {
                //ignore
            }
        }
    }

    public static void close(Channel device) {
        if (null != device) {
            try {
                device.close();
            } catch (IOException e) {
                //ignore
            }
        }
    }

    public static void close(URLConnection conn) {
        if (conn != null) {
            try {
                if (conn instanceof JarURLConnection) {
                    JarURLConnection juc = (JarURLConnection) conn;
                    JarFile jf = juc.getJarFile();
                    jf.close();
                    jf = null;
                } else if (conn instanceof HttpURLConnection) {
                    ((HttpURLConnection) conn).disconnect();
                }
            } catch (IOException exc) {
                //ignore
            }
        }
    }

    public static void delete(File file) {
        if (file != null) {
            file.delete();
        }
    }

    public boolean tryHardToDelete(File f) {
        return tryHardToDelete(f, ON_WINDOWS);
    }

    public boolean tryHardToDelete(File f, boolean runGC) {
        if (!f.delete()) {
            if (runGC) {
                System.gc();
            }
            try {
                Thread.sleep(DELETE_RETRY_SLEEP_MILLIS);
            } catch (InterruptedException ex) {
                // Ignore Exception
            }
            return f.delete();
        }
        return true;
    }

    public static String getRelativePath(File fromFile, File toFile) throws Exception {
        String fromPath = fromFile.getCanonicalPath();
        String toPath = toFile.getCanonicalPath();

        String[] fromPathStack = getPathStack(fromPath);
        String[] toPathStack = getPathStack(toPath);

        if (0 < toPathStack.length && 0 < fromPathStack.length) {
            if (!fromPathStack[0].equals(toPathStack[0])) {
                return getPath(Arrays.asList(toPathStack));
            }
        } else {
            return getPath(Arrays.asList(toPathStack));
        }

        int minLength = Math.min(fromPathStack.length, toPathStack.length);
        int same = 1;

        for (;
             same < minLength && fromPathStack[same].equals(toPathStack[same]);
             same++) {
            // Do nothing
        }

        List relativePathStack = new ArrayList();

        for (int i = same; i < fromPathStack.length; i++) {
            relativePathStack.add("..");
        }

        for (int i = same; i < toPathStack.length; i++) {
            relativePathStack.add(toPathStack[i]);
        }

        return getPath(relativePathStack);
    }

    public static String[] getPathStack(String path) {
        String normalizedPath = path.replace(File.separatorChar, '/');

        return normalizedPath.split("/");
    }

    public static String getPath(List pathStack) {
        return getPath(pathStack, '/');
    }

    public static String getPath(final List pathStack, final char separatorChar) {
        final StringBuffer buffer = new StringBuffer();

        final Iterator iter = pathStack.iterator();
        if (iter.hasNext()) {
            buffer.append(iter.next());
        }
        while (iter.hasNext()) {
            buffer.append(separatorChar);
            buffer.append(iter.next());
        }
        return buffer.toString();
    }

    public String getDefaultEncoding() {
        InputStreamReader is = new InputStreamReader(
            new InputStream() {
                public int read() {
                    return -1;
                }
            });
        try {
            return is.getEncoding();
        } finally {
            close(is);
        }
    }
}