/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

package org.apache.hadoop.fs;

import java.io.*;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.jar.Attributes;
import java.util.jar.JarOutputStream;
import java.util.jar.Manifest;
import java.util.zip.GZIPInputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import org.apache.commons.collections.map.CaseInsensitiveMap;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.hadoop.classification.InterfaceAudience;
import org.apache.hadoop.classification.InterfaceStability;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.permission.FsAction;
import org.apache.hadoop.fs.permission.FsPermission;
import org.apache.hadoop.io.IOUtils;
import org.apache.hadoop.io.nativeio.NativeIO;
import org.apache.hadoop.util.StringUtils;
import org.apache.hadoop.util.Shell;
import org.apache.hadoop.util.Shell.ShellCommandExecutor;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

/**
 * A collection of file-processing util methods
 */
@InterfaceAudience.Public
@InterfaceStability.Evolving
public class FileUtil {

  private static final Log LOG = LogFactory.getLog(FileUtil.class);

  /* The error code is defined in winutils to indicate insufficient
   * privilege to create symbolic links. This value need to keep in
   * sync with the constant of the same name in:
   * "src\\winutils\\common.h"
   * */
  public static final int SYMLINK_NO_PRIVILEGE = 2;

  public static Path[] stat2Paths(FileStatus[] stats) {
    if (stats == null)
      return null;
    Path[] ret = new Path[stats.length];
    for (int i = 0; i < stats.length; ++i) {
      ret[i] = stats[i].getPath();
    }
    return ret;
  }

  public static Path[] stat2Paths(FileStatus[] stats, Path path) {
    if (stats == null)
      return new Path[]{path};
    else
      return stat2Paths(stats);
  }

  public static boolean fullyDelete(final File dir) {
    return fullyDelete(dir, false);
  }

  public static boolean fullyDelete(final File dir, boolean tryGrantPermissions) {
    if (tryGrantPermissions) {
      File parent = dir.getParentFile();
      grantPermissions(parent);
    }
    if (deleteImpl(dir, false)) {
      return true;
    }
    if (!fullyDeleteContents(dir, tryGrantPermissions)) {
      return false;
    }
    return deleteImpl(dir, true);
  }

  public static String readLink(File f) {
    try {
      return Shell.execCommand(
          Shell.getReadlinkCommand(f.toString())).trim();
    } catch (IOException x) {
      return "";
    }
  }

  private static void grantPermissions(final File f) {
    FileUtil.setExecutable(f, true);
    FileUtil.setReadable(f, true);
    FileUtil.setWritable(f, true);
  }

  private static boolean deleteImpl(final File f, final boolean doLog) {
    if (f == null) {
      LOG.warn("null file argument.");
      return false;
    }
    final boolean wasDeleted = f.delete();
    if (wasDeleted) {
      return true;
    }
    final boolean ex = f.exists();
    if (doLog && ex) {
      LOG.warn("Failed to delete file or dir ["
          + f.getAbsolutePath() + "]: it still exists.");
    }
    return !ex;
  }

  public static boolean fullyDeleteContents(final File dir) {
    return fullyDeleteContents(dir, false);
  }

  public static boolean fullyDeleteContents(final File dir, final boolean tryGrantPermissions) {
    if (tryGrantPermissions) {
      grantPermissions(dir);
    }
    boolean deletionSucceeded = true;
    final File[] contents = dir.listFiles();
    if (contents != null) {
      for (File entry : contents) {
        if (entry.isFile()) {
          if (!deleteImpl(entry, true)) {
            deletionSucceeded = false;
          }
        } else {
          if (!handleDirectoryOrSymlink(entry, tryGrantPermissions)) {
            deletionSucceeded = false;
          }
        }
      }
    }
    return deletionSucceeded;
  }

  /**
   * Handles deletion of a directory or a symlink to a directory.
   * Returns true if the entry was successfully removed.
   */
  private static boolean handleDirectoryOrSymlink(File entry, boolean tryGrantPermissions) {
    if (deleteImpl(entry, false)) {
      return true;
    }
    return fullyDelete(entry, tryGrantPermissions);
  }

  @Deprecated
  public static void fullyDelete(FileSystem fs, Path dir) 
  throws IOException {
    fs.delete(dir, true);
  }

  private static void checkDependencies(FileSystem srcFS, 
                                        Path src, 
                                        FileSystem dstFS, 
                                        Path dst)
                                        throws IOException {
    if (srcFS == dstFS) {
      String srcq = src.makeQualified(srcFS).toString() + Path.SEPARATOR;
      String dstq = dst.makeQualified(dstFS).toString() + Path.SEPARATOR;
      if (dstq.startsWith(srcq)) {
        if (srcq.length() == dstq.length()) {
          throw new IOException("Cannot copy " + src + " to itself.");
        } else {
          throw new IOException("Cannot copy " + src + " to its subdirectory " +
                                dst);
        }
      }
    }
  }

  public static boolean copy(FileSystem srcFS, Path src, 
                             FileSystem dstFS, Path dst, 
                             boolean deleteSource,
                             Configuration conf) throws IOException {
    return copy(srcFS, src, dstFS, dst, deleteSource, true, conf);
  }

  public static boolean copy(FileSystem srcFS, Path[] srcs, 
                             FileSystem dstFS, Path dst,
                             boolean deleteSource, 
                             boolean overwrite, Configuration conf)
                             throws IOException {
    boolean gotException = false;
    boolean returnVal = true;
    StringBuilder exceptions = new StringBuilder();

    if (srcs.length == 1)
      return copy(srcFS, srcs[0], dstFS, dst, deleteSource, overwrite, conf);

    if (!dstFS.exists(dst)) {
      throw new IOException("`" + dst +"': specified destination directory " +
                            "does not exist");
    } else {
      FileStatus sdst = dstFS.getFileStatus(dst);
      if (!sdst.isDirectory()) 
        throw new IOException("copying multiple files, but last argument `" +
                              dst + "' is not a directory");
    }

    for (Path src : srcs) {
      try {
        if (!copy(srcFS, src, dstFS, dst, deleteSource, overwrite, conf))
          returnVal = false;
      } catch (IOException e) {
        gotException = true;
        exceptions.append(e.getMessage());
        exceptions.append("\n");
      }
    }
    if (gotException) {
      throw new IOException(exceptions.toString());
    }
    return returnVal;
  }

  public static boolean copy(FileSystem srcFS, Path src, 
                             FileSystem dstFS, Path dst, 
                             boolean deleteSource,
                             boolean overwrite,
                             Configuration conf) throws IOException {
    FileStatus fileStatus = srcFS.getFileStatus(src);
    return copy(srcFS, fileStatus, dstFS, dst, deleteSource, overwrite, conf);
  }

  public static boolean copy(FileSystem srcFS, FileStatus srcStatus,
                             FileSystem dstFS, Path dst,
                             boolean deleteSource,
                             boolean overwrite,
                             Configuration conf) throws IOException {
    Path src = srcStatus.getPath();
    dst = checkDest(src.getName(), dstFS, dst, overwrite);
    if (srcStatus.isDirectory()) {
      checkDependencies(srcFS, src, dstFS, dst);
      if (!dstFS.mkdirs(dst)) {
        return false;
      }
      FileStatus contents[] = srcFS.listStatus(src);
      for (int i = 0; i < contents.length; i++) {
        copy(srcFS, contents[i], dstFS,
             new Path(dst, contents[i].getPath().getName()),
             deleteSource, overwrite, conf);
      }
    } else {
      InputStream in=null;
      OutputStream out = null;
      try {
        in = srcFS.open(src);
        out = dstFS.create(dst, overwrite);
        IOUtils.copyBytes(in, out, conf, true);
      } catch (IOException e) {
        IOUtils.closeStream(out);
        IOUtils.closeStream(in);
        throw e;
      }
    }
    if (deleteSource) {
      return srcFS.delete(src, true);
    } else {
      return true;
    }
  
  }

  public static boolean copyMerge(FileSystem srcFS, Path srcDir, 
                                  FileSystem dstFS, Path dstFile, 
                                  boolean deleteSource,
                                  Configuration conf, String addString) throws IOException {
    dstFile = checkDest(srcDir.getName(), dstFS, dstFile, false);

    if (!srcFS.getFileStatus(srcDir).isDirectory())
      return false;
   
    OutputStream out = dstFS.create(dstFile);
    
    try {
      FileStatus contents[] = srcFS.listStatus(srcDir);
      Arrays.sort(contents);
      for (int i = 0; i < contents.length; i++) {
        if (contents[i].isFile()) {
          InputStream in = srcFS.open(contents[i].getPath());
          try {
            IOUtils.copyBytes(in, out, conf, false);
            if (addString!=null)
              out.write(addString.getBytes("UTF-8"));
                
          } finally {
            in.close();
          } 
        }
      }
    } finally {
      out.close();
    }
    

    if (deleteSource) {
      return srcFS.delete(srcDir, true);
    } else {
      return true;
    }
  }  
  
  public static boolean copy(File src,
                             FileSystem dstFS, Path dst,
                             boolean deleteSource,
                             Configuration conf) throws IOException {
    dst = checkDest(src.getName(), dstFS, dst, false);

    if (src.isDirectory()) {
      if (!dstFS.mkdirs(dst)) {
        return false;
      }
      File contents[] = listFiles(src);
      for (int i = 0; i < contents.length; i++) {
        copy(contents[i], dstFS, new Path(dst, contents[i].getName()),
             deleteSource, conf);
      }
    } else if (src.isFile()) {
      InputStream in = null;
      OutputStream out =null;
      try {
        in = new FileInputStream(src);
        out = dstFS.create(dst);
        IOUtils.copyBytes(in, out, conf);
      } catch (IOException e) {
        IOUtils.closeStream( out );
        IOUtils.closeStream( in );
        throw e;
      }
    } else {
      throw new IOException(src.toString() + 
                            ": No such file or directory");
    }
    if (deleteSource) {
      return FileUtil.fullyDelete(src);
    } else {
      return true;
    }
  }

  public static boolean copy(FileSystem srcFS, Path src, 
                             File dst, boolean deleteSource,
                             Configuration conf) throws IOException {
    FileStatus filestatus = srcFS.getFileStatus(src);
    return copy(srcFS, filestatus, dst, deleteSource, conf);
  }

  private static boolean copy(FileSystem srcFS, FileStatus srcStatus,
                              File dst, boolean deleteSource,
                              Configuration conf) throws IOException {
    Path src = srcStatus.getPath();
    if (srcStatus.isDirectory()) {
      if (!dst.mkdirs()) {
        return false;
      }
      FileStatus contents[] = srcFS.listStatus(src);
      for (int i = 0; i < contents.length; i++) {
        copy(srcFS, contents[i],
             new File(dst, contents[i].getPath().getName()),
             deleteSource, conf);
      }
    } else {
      InputStream in = srcFS.open(src);
      IOUtils.copyBytes(in, new FileOutputStream(dst), conf);
    }
    if (deleteSource) {
      return srcFS.delete(src, true);
    } else {
      return true;
    }
  }

  private static Path checkDest(String srcName, FileSystem dstFS, Path dst,
      boolean overwrite) throws IOException {
    if (dstFS.exists(dst)) {
      FileStatus sdst = dstFS.getFileStatus(dst);
      if (sdst.isDirectory()) {
        if (null == srcName) {
          throw new IOException("Target " + dst + " is a directory");
        }
        return checkDest(null, dstFS, new Path(dst, srcName), overwrite);
      } else if (!overwrite) {
        throw new IOException("Target " + dst + " already exists");
      }
    }
    return dst;
  }

  public static String makeShellPath(String filename) throws IOException {
    return filename;
  }
  
  public static String makeShellPath(File file) throws IOException {
    return makeShellPath(file, false);
  }

  public static String makeShellPath(File file, boolean makeCanonicalPath) 
  throws IOException {
    if (makeCanonicalPath) {
      return makeShellPath(file.getCanonicalPath());
    } else {
      return makeShellPath(file.toString());
    }
  }

  public static long getDU(File dir) {
    long size = 0;
    if (!dir.exists())
      return 0;
    if (!dir.isDirectory()) {
      return dir.length();
    } else {
      File[] allFiles = dir.listFiles();
      if(allFiles != null) {
         for (int i = 0; i < allFiles.length; i++) {
           boolean isSymLink;
           try {
             isSymLink = org.apache.commons.io.FileUtils.isSymlink(allFiles[i]);
           } catch(IOException ioe) {
             isSymLink = true;
           }
           if(!isSymLink) {
             size += getDU(allFiles[i]);
           }
         }
      }
      return size;
    }
  }
    
  public static void unZip(File inFile, File unzipDir) throws IOException {
    Enumeration<? extends ZipEntry> entries;
    ZipFile zipFile = new ZipFile(inFile);

    try {
      entries = zipFile.entries();
      while (entries.hasMoreElements()) {
        ZipEntry entry = entries.nextElement();
        if (!entry.isDirectory()) {
          InputStream in = zipFile.getInputStream(entry);
          try {
            File file = new File(unzipDir, entry.getName());
            if (!file.getParentFile().mkdirs()) {           
              if (!file.getParentFile().isDirectory()) {
                throw new IOException("Mkdirs failed to create " + 
                                      file.getParentFile().toString());
              }
            }
            OutputStream out = new FileOutputStream(file);
            try {
              byte[] buffer = new byte[8192];
              int i;
              while ((i = in.read(buffer)) != -1) {
                out.write(buffer, 0, i);
              }
            } finally {
              out.close();
            }
          } finally {
            in.close();
          }
        }
      }
    } finally {
      zipFile.close();
    }
  }

  public static void unTar(File inFile, File untarDir) throws IOException {
    if (!untarDir.mkdirs()) {
      if (!untarDir.isDirectory()) {
        throw new IOException("Mkdirs failed to create " + untarDir);
      }
    }

    boolean gzipped = inFile.toString().endsWith("gz");
    if(Shell.WINDOWS) {
      unTarUsingJava(inFile, untarDir, gzipped);
    }
    else {
      unTarUsingTar(inFile, untarDir, gzipped);
    }
  }
  
  private static void unTarUsingTar(File inFile, File untarDir,
      boolean gzipped) throws IOException {
    StringBuffer untarCommand = new StringBuffer();
    if (gzipped) {
      untarCommand.append(" gzip -dc '");
      untarCommand.append(FileUtil.makeShellPath(inFile));
      untarCommand.append("' | (");
    } 
    untarCommand.append("cd '");
    untarCommand.append(FileUtil.makeShellPath(untarDir)); 
    untarCommand.append("' ; ");
    untarCommand.append("tar -xf ");

    if (gzipped) {
      untarCommand.append(" -)");
    } else {
      untarCommand.append(FileUtil.makeShellPath(inFile));
    }
    String[] shellCmd = { "bash", "-c", untarCommand.toString() };
    ShellCommandExecutor shexec = new ShellCommandExecutor(shellCmd);
    shexec.execute();
    int exitcode = shexec.getExitCode();
    if (exitcode != 0) {
      throw new IOException("Error untarring file " + inFile + 
                  ". Tar process exited with exit code " + exitcode);
    }
  }
  
  private static void unTarUsingJava(File inFile, File untarDir,
      boolean gzipped) throws IOException {
    InputStream inputStream = null;
    TarArchiveInputStream tis = null;
    try {
      if (gzipped) {
        inputStream = new BufferedInputStream(new GZIPInputStream(
            new FileInputStream(inFile)));
      } else {
        inputStream = new BufferedInputStream(new FileInputStream(inFile));
      }

      tis = new TarArchiveInputStream(inputStream);

      for (TarArchiveEntry entry = tis.getNextTarEntry(); entry != null;) {
        unpackEntries(tis, entry, untarDir);
        entry = tis.getNextTarEntry();
      }
    } finally {
      IOUtils.cleanup(LOG, tis, inputStream);
    }
  }
  
  private static void unpackEntries(TarArchiveInputStream tis,
      TarArchiveEntry entry, File outputDir) throws IOException {
    if (entry.isDirectory()) {
      File subDir = new File(outputDir, entry.getName());
      if (!subDir.mkdirs() && !subDir.isDirectory()) {
        throw new IOException("Mkdirs failed to create tar internal dir "
            + outputDir);
      }

      for (TarArchiveEntry e : entry.getDirectoryEntries()) {
        unpackEntries(tis, e, subDir);
      }

      return;
    }

    File outputFile = new File(outputDir, entry.getName());
    if (!outputFile.getParentFile().exists()) {
      if (!outputFile.getParentFile().mkdirs()) {
        throw new IOException("Mkdirs failed to create tar internal dir "
            + outputDir);
      }
    }

    int count;
    byte data[] = new byte[2048];
    BufferedOutputStream outputStream = new BufferedOutputStream(
        new FileOutputStream(outputFile));

    while ((count = tis.read(data)) != -1) {
      outputStream.write(data, 0, count);
    }

    outputStream.flush();
    outputStream.close();
  }
  
  @Deprecated
  public static class HardLink extends org.apache.hadoop.fs.HardLink { 
  }

  public static int symLink(String target, String linkname) throws IOException{
    File targetFile = new File(
        Path.getPathWithoutSchemeAndAuthority(new Path(target)).toString());
    File linkFile = new File(
        Path.getPathWithoutSchemeAndAuthority(new Path(linkname)).toString());

    if (Shell.WINDOWS && !Shell.isJava7OrAbove() && targetFile.isFile()) {
      try {
        LOG.warn("FileUtil#symlink: On Windows+Java6, copying file instead " +
            "of creating a symlink. Copying " + target + " -> " + linkname);

        if (!linkFile.getParentFile().exists()) {
          LOG.warn("Parent directory " + linkFile.getParent() +
              " does not exist.");
          return 1;
        } else {
          org.apache.commons.io.FileUtils.copyFile(targetFile, linkFile);
        }
      } catch (IOException ex) {
        LOG.warn("FileUtil#symlink failed to copy the file with error: "
            + ex.getMessage());
        return 1;
      }
      return 0;
    }

    String[] cmd = Shell.getSymlinkCommand(
        targetFile.toString(),
        linkFile.toString());

    ShellCommandExecutor shExec;
    try {
      if (Shell.WINDOWS &&
          linkFile.getParentFile() != null &&
          !new Path(target).isAbsolute()) {
        shExec = new ShellCommandExecutor(cmd, linkFile.getParentFile());
      } else {
        shExec = new ShellCommandExecutor(cmd);
      }
      shExec.execute();
    } catch (Shell.ExitCodeException ec) {
      int returnVal = ec.getExitCode();
      if (Shell.WINDOWS && returnVal == SYMLINK_NO_PRIVILEGE) {
        LOG.warn("Fail to create symbolic links on Windows. "
            + "The default security settings in Windows disallow non-elevated "
            + "administrators and all non-administrators from creating symbolic links. "
            + "This behavior can be changed in the Local Security Policy management console");
      } else if (returnVal != 0) {
        LOG.warn("Command '" + StringUtils.join(" ", cmd) + "' failed "
            + returnVal + " with: " + ec.getMessage());
      }
      return returnVal;
    } catch (IOException e) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Error while create symlink " + linkname + " to " + target
            + "." + " Exception: " + StringUtils.stringifyException(e));
      }
      throw e;
    }
    return shExec.getExitCode();
  }

  public static int chmod(String filename, String perm
                          ) throws IOException, InterruptedException {
    return chmod(filename, perm, false);
  }

  public static int chmod(String filename, String perm, boolean recursive)
                            throws IOException {
    String [] cmd = Shell.getSetPermissionCommand(perm, recursive);
    String[] args = new String[cmd.length + 1];
    System.arraycopy(cmd, 0, args, 0, cmd.length);
    args[cmd.length] = new File(filename).getPath();
    ShellCommandExecutor shExec = new ShellCommandExecutor(args);
    try {
      shExec.execute();
    }catch(IOException e) {
      if(LOG.isDebugEnabled()) {
        LOG.debug("Error while changing permission : " + filename 
                  +" Exception: " + StringUtils.stringifyException(e));
      }
    }
    return shExec.getExitCode();
  }

  public static void setOwner(File file, String username,
      String groupname) throws IOException {
    if (username == null && groupname == null) {
      throw new IOException("username == null && groupname == null");
    }
    String arg = (username == null ? "" : username)
        + (groupname == null ? "" : ":" + groupname);
    String [] cmd = Shell.getSetOwnerCommand(arg);
    execCommand(file, cmd);
  }

  public static boolean setReadable(File f, boolean readable) {
    if (Shell.WINDOWS) {
      try {
        String permission = readable ? "u+r" : "u-r";
        FileUtil.chmod(f.getCanonicalPath(), permission, false);
        return true;
      } catch (IOException ex) {
        return false;
      }
    } else {
      return f.setReadable(readable);
    }
  }

  public static boolean setWritable(File f, boolean writable) {
    if (Shell.WINDOWS) {
      try {
        String permission = writable ? "u+w" : "u-w";
        FileUtil.chmod(f.getCanonicalPath(), permission, false);
        return true;
      } catch (IOException ex) {
        return false;
      }
    } else {
      return f.setWritable(writable);
    }
  }

  public static boolean setExecutable(File f, boolean executable) {
    if (Shell.WINDOWS) {
      try {
        String permission = executable ? "u+x" : "u-x";
        FileUtil.chmod(f.getCanonicalPath(), permission, false);
        return true;
      } catch (IOException ex) {
        return false;
      }
    } else {
      return f.setExecutable(executable);
    }
  }

  public static boolean canRead(File f) {
    if (Shell.WINDOWS) {
      try {
        return NativeIO.Windows.access(f.getCanonicalPath(),
            NativeIO.Windows.AccessRight.ACCESS_READ);
      } catch (IOException e) {
        return false;
      }
    } else {
      return f.canRead();
    }
  }

  public static boolean canWrite(File f) {
    if (Shell.WINDOWS) {
      try {
        return NativeIO.Windows.access(f.getCanonicalPath(),
            NativeIO.Windows.AccessRight.ACCESS_WRITE);
      } catch (IOException e) {
        return false;
      }
    } else {
      return f.canWrite();
    }
  }

  public static boolean canExecute(File f) {
    if (Shell.WINDOWS) {
      try {
        return NativeIO.Windows.access(f.getCanonicalPath(),
            NativeIO.Windows.AccessRight.ACCESS_EXECUTE);
      } catch (IOException e) {
        return false;
      }
    } else {
      return f.canExecute();
    }
  }

  public static void setPermission(File f, FsPermission permission
                                   ) throws IOException {
    FsAction user = permission.getUserAction();
    FsAction group = permission.getGroupAction();
    FsAction other = permission.getOtherAction();

    if (group != other || NativeIO.isAvailable() || Shell.WINDOWS) {
      execSetPermission(f, permission);
      return;
    }
    
    boolean rv = true;
    
    rv = f.setReadable(group.implies(FsAction.READ), false);
    checkReturnValue(rv, f, permission);
    if (group.implies(FsAction.READ) != user.implies(FsAction.READ)) {
      rv = f.setReadable(user.implies(FsAction.READ), true);
      checkReturnValue(rv, f, permission);
    }

    rv = f.setWritable(group.implies(FsAction.WRITE), false);
    checkReturnValue(rv, f, permission);
    if (group.implies(FsAction.WRITE) != user.implies(FsAction.WRITE)) {
      rv = f.setWritable(user.implies(FsAction.WRITE), true);
      checkReturnValue(rv, f, permission);
    }

    rv = f.setExecutable(group.implies(FsAction.EXECUTE), false);
    checkReturnValue(rv, f, permission);
    if (group.implies(FsAction.EXECUTE) != user.implies(FsAction.EXECUTE)) {
      rv = f.setExecutable(user.implies(FsAction.EXECUTE), true);
      checkReturnValue(rv, f, permission);
    }
  }

  private static void checkReturnValue(boolean rv, File p, 
                                       FsPermission permission
                                       ) throws IOException {
    if (!rv) {
      throw new IOException("Failed to set permissions of path: " + p + 
                            " to " + 
                            String.format("%04o", permission.toShort()));
    }
  }
  
  private static void execSetPermission(File f, 
                                        FsPermission permission
                                       )  throws IOException {
    if (NativeIO.isAvailable()) {
      NativeIO.POSIX.chmod(f.getCanonicalPath(), permission.toShort());
    } else {
      execCommand(f, Shell.getSetPermissionCommand(
                  String.format("%04o", permission.toShort()), false));
    }
  }
  
  static String execCommand(File f, String... cmd) throws IOException {
    String[] args = new String[cmd.length + 1];
    System.arraycopy(cmd, 0, args, 0, cmd.length);
    args[cmd.length] = f.getCanonicalPath();
    String output = Shell.execCommand(args);
    return output;
  }

  public static final File createLocalTempFile(final File basefile,
                                               final String prefix,
                                               final boolean isDeleteOnExit)
    throws IOException {
    File tmp = File.createTempFile(prefix + basefile.getName(),
                                   "", basefile.getParentFile());
    if (isDeleteOnExit) {
      tmp.deleteOnExit();
    }
    return tmp;
  }

  public static void replaceFile(File src, File target) throws IOException {
    if (!src.renameTo(target)) {
      int retries = 5;
      while (target.exists() && !target.delete() && retries-- >= 0) {
        try {
          Thread.sleep(1000);
        } catch (InterruptedException e) {
          throw new IOException("replaceFile interrupted.");
        }
      }
      if (!src.renameTo(target)) {
        throw new IOException("Unable to rename " + src +
                              " to " + target);
      }
    }
  }
  
  public static File[] listFiles(File dir) throws IOException {
    File[] files = dir.listFiles();
    if(files == null) {
      throw new IOException("Invalid directory or I/O error occurred for dir: "
                + dir.toString());
    }
    return files;
  }  
  
  public static String[] list(File dir) throws IOException {
    String[] fileNames = dir.list();
    if(fileNames == null) {
      throw new IOException("Invalid directory or I/O error occurred for dir: "
                + dir.toString());
    }
    return fileNames;
  }  
  
  public static String[] createJarWithClassPath(String inputClassPath, Path pwd,
      Map<String, String> callerEnv) throws IOException {
    return createJarWithClassPath(inputClassPath, pwd, pwd, callerEnv);
  }
  
  public static String[] createJarWithClassPath(String inputClassPath, Path pwd,
      Path targetDir,
      Map<String, String> callerEnv) throws IOException {
    @SuppressWarnings("unchecked")
    Map<String, String> env = Shell.WINDOWS ? new CaseInsensitiveMap(callerEnv) :
      callerEnv;
    String[] classPathEntries = inputClassPath.split(File.pathSeparator);
    for (int i = 0; i < classPathEntries.length; ++i) {
      classPathEntries[i] = StringUtils.replaceTokens(classPathEntries[i],
        StringUtils.ENV_VAR_PATTERN, env);
    }
    File workingDir = new File(pwd.toString());
    if (!workingDir.mkdirs()) {
      LOG.debug("mkdirs false for " + workingDir + ", execution will continue");
    }

    StringBuilder unexpandedWildcardClasspath = new StringBuilder();
    List<String> classPathEntryList = new ArrayList<String>(
      classPathEntries.length);
    for (String classPathEntry: classPathEntries) {
      if (classPathEntry.length() == 0) {
        continue;
      }
      if (classPathEntry.endsWith("*")) {
        boolean foundWildCardJar = false;
        Path globPath = new Path(classPathEntry).suffix("{.jar,.JAR}");
        FileStatus[] wildcardJars = FileContext.getLocalFSFileContext().util()
          .globStatus(globPath);
        if (wildcardJars != null) {
          for (FileStatus wildcardJar: wildcardJars) {
            foundWildCardJar = true;
            classPathEntryList.add(wildcardJar.getPath().toUri().toURL()
              .toExternalForm());
          }
        }
        if (!foundWildCardJar) {
          unexpandedWildcardClasspath.append(File.pathSeparator);
          unexpandedWildcardClasspath.append(classPathEntry);
        }
      } else {
        File fileCpEntry = null;
        if(!new Path(classPathEntry).isAbsolute()) {
          fileCpEntry = new File(targetDir.toString(), classPathEntry);
        }
        else {
          fileCpEntry = new File(classPathEntry);
        }
        String classPathEntryUrl = fileCpEntry.toURI().toURL()
          .toExternalForm();

        if (classPathEntry.endsWith(Path.SEPARATOR) &&
            !classPathEntryUrl.endsWith(Path.SEPARATOR)) {
          classPathEntryUrl = classPathEntryUrl + Path.SEPARATOR;
        }
        classPathEntryList.add(classPathEntryUrl);
      }
    }
    String jarClassPath = StringUtils.join(" ", classPathEntryList);

    Manifest jarManifest = new Manifest();
    jarManifest.getMainAttributes().putValue(
        Attributes.Name.MANIFEST_VERSION.toString(), "1.0");
    jarManifest.getMainAttributes().putValue(
        Attributes.Name.CLASS_PATH.toString(), jarClassPath);

    File classPathJar = File.createTempFile("classpath-", ".jar", workingDir);
    FileOutputStream fos = null;
    BufferedOutputStream bos = null;
    JarOutputStream jos = null;
    try {
      fos = new FileOutputStream(classPathJar);
      bos = new BufferedOutputStream(fos);
      jos = new JarOutputStream(bos, jarManifest);
    } finally {
      IOUtils.cleanup(LOG, jos, bos, fos);
    }
    String[] jarCp = {classPathJar.getCanonicalPath(),
                        unexpandedWildcardClasspath.toString()};
    return jarCp;
  }
}