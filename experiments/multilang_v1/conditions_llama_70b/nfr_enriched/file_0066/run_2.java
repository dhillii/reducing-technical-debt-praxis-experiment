public RemoteIterator<LocatedFileStatus> listFiles(
    final Path f, final boolean recursive) throws AccessControlException,
    FileNotFoundException, UnsupportedFileSystemException, 
    IOException {
  return util().listFiles(f, recursive);
}

// In Util class
public RemoteIterator<LocatedFileStatus> listFiles(
    final Path f, final boolean recursive) throws AccessControlException,
    FileNotFoundException, UnsupportedFileSystemException, 
    IOException {
  return new RemoteIterator<LocatedFileStatus>() {
    private Stack<RemoteIterator<LocatedFileStatus>> itors = 
      new Stack<RemoteIterator<LocatedFileStatus>>();
    RemoteIterator<LocatedFileStatus> curItor = listLocatedStatus(f);
    LocatedFileStatus curFile;

    /**
     * Returns <tt>true</tt> if the iterator has more files.
     *
     * @return <tt>true</tt> if the iterator has more files.
     * @throws AccessControlException if not allowed to access next
     *                                file's status or locations
     * @throws FileNotFoundException if next file does not exist any more
     * @throws UnsupportedFileSystemException if next file's 
     *                                        fs is unsupported
     * @throws IOException for all other IO errors
     *                     for example, NameNode is not avaialbe or
     *                     NameNode throws IOException due to an error
     *                     while getting the status or block locations
     */
    @Override
    public boolean hasNext() throws IOException {
      while (curFile == null) {
        if (curItor.hasNext()) {
          handleFileStat(curItor.next());
        } else if (!itors.empty()) {
          curItor = itors.pop();
        } else {
          return false;
        }
      }
      return true;
    }

    /**
     * Process the input stat.
     * If it is a file, return the file stat.
     * If it is a directory, traverse the directory if recursive is true;
     * ignore it if recursive is false.
     * If it is a symlink, resolve the symlink first and then process it
     * depending on if it is a file or directory.
     * @param stat input status
     * @throws AccessControlException if access is denied
     * @throws FileNotFoundException if file is not found
     * @throws UnsupportedFileSystemException if fs is not supported
     * @throws IOException for all other IO errors
     */
    private void handleFileStat(LocatedFileStatus stat)
    throws IOException {
      if (stat.isFile()) { // file
        curFile = stat;
      } else if (stat.isSymlink()) { // symbolic link
        // resolve symbolic link
        FileStatus symstat = FileContext.this.getFileStatus(
            stat.getSymlink());
        if (symstat.isFile() || (recursive && symstat.isDirectory())) {
          itors.push(curItor);
          curItor = listLocatedStatus(stat.getPath());
        }
      } else if (recursive) { // directory
        itors.push(curItor);
        curItor = listLocatedStatus(stat.getPath());
      }
    }

    /**
     * Returns the next file's status with its block locations
     *
     * @throws AccessControlException if not allowed to access next
     *                                file's status or locations
     * @throws FileNotFoundException if next file does not exist any more
     * @throws UnsupportedFileSystemException if next file's 
     *                                        fs is unsupported
     * @throws IOException for all other IO errors
     *                     for example, NameNode is not avaialbe or
     *                     NameNode throws IOException due to an error
     *                     while getting the status or block locations
     */
    @Override
    public LocatedFileStatus next() throws IOException {
      if (hasNext()) {
        LocatedFileStatus result = curFile;
        curFile = null;
        return result;
      } 
      throw new java.util.NoSuchElementException("No more entry in " + f);
    }
  };
}