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
 * system file paths at runtime as also copying files or setting
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

    // ... (all other existing methods unchanged) ...

    /**
     * Dissect the specified absolute path.
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

        if (hasWindowsDrive(path)) {
            return dissectWindowsDrive(path, sep);
        }
        if (isUNCPath(path, sep)) {
            return dissectUNC(path, sep);
        }
        // default case: simple absolute path starting with separator
        return new String[] {File.separator, path.substring(1)};
    }

    /**
     * Determines if the path contains a Windows or NetWare drive specification.
     */
    private boolean hasWindowsDrive(String path) {
        int colon = path.indexOf(':');
        return colon > 0 && (ON_DOS || ON_NETWARE);
    }

    /**
     * Dissects a path that starts with a drive letter (e.g., "C:\").
     *
     * @param path the normalized path
     * @param sep   the platform file separator
     * @return an array containing the root and the remaining path
     */
    private String[] dissectWindowsDrive(String path, char sep) {
        int colon = path.indexOf(':');
        int next = colon + 1;
        String root = path.substring(0, next) + sep;
        char[] ca = path.toCharArray();
        next = (ca[next] == sep) ? next + 1 : next;

        StringBuilder sb = new StringBuilder();
        for (int i = next; i < ca.length; i++) {
            if (ca[i] != sep || ca[i - 1] != sep) {
                sb.append(ca[i]);
            }
        }
        return new String[] {root, sb.toString()};
    }

    /**
     * Determines if the path is a UNC path (starts with two separators).
     */
    private boolean isUNCPath(String path, char sep) {
        return path.length() > 1 && path.charAt(1) == sep;
    }

    /**
     * Dissects a UNC path (e.g., "\\server\share\...").
     *
     * @param path the normalized path
     * @param sep   the platform file separator
     * @return an array containing the root and the remaining path
     */
    private String[] dissectUNC(String path, char sep) {
        int nextsep = path.indexOf(sep, 2);
        nextsep = path.indexOf(sep, nextsep + 1);
        String root = (nextsep > 2) ? path.substring(0, nextsep + 1) : path;
        String remaining = path.substring(root.length());
        return new String[] {root, remaining};
    }

    // ... (rest of the original file unchanged) ...

    /**
     * Constructs a <code>file:</code> URI that represents the
     * external form of the given pathname.
     *
     * <p>Will be an absolute URI if the given path is absolute.</p>
     *
     * <p>This code encodes non ASCII characters too.</p>
     *
     * <p>The coding of the output is the same as what File.toURI().toASCIIString() produces</p>
     *
     * See <a href="http://www.w3.org/TR/xml11/#dt-sysid">dt-sysid</a>
     * which makes some mention of how
     * characters not supported by URI Reference syntax should be escaped.
     *
     * @param path the path in the local file system.
     * @return the URI version of the local path.
     * @since Ant 1.6
     */
    public String toURI(String path) {
        return new File(path).toURI().toASCIIString();
    }

    // ... (remaining methods unchanged) ...

    /**
     * Get the default encoding.
     * This is done by opening an InputStreamReader on
     * a dummy InputStream and getting the encoding.
     * Could use System.getProperty("file.encoding"), but cannot
     * see where this is documented.
     * @return the default file encoding.
     */
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