/**
   * List the statuses and block locations of the files in the given path.
   * 
   * If the path is a directory, 
   *   if recursive is false, returns files in the directory;
   *   if recursive is true, return files in the subtree rooted at the path.
   *   The subtree is traversed in the depth-first order.
   * If the path is a file, return the file's status and block locations.
   * Files across symbolic links are also returned.
   * 
   * @param f is the path
   * @param recursive if the subdirectories need to be traversed recursively
   *
   * @return an iterator that traverses statuses of the files
   * If any IO exception (for example a sub-directory gets deleted while
   * listing is being executed), next() or hasNext() of the returned iterator
   * may throw a RuntimeException with the IO exception as the cause.
   *
   * @throws AccessControlException If access is denied
   * @throws FileNotFoundException If <code>f</code> does not exist
   * @throws UnsupportedFileSystemException If file system for <code>f</code>
   *         is not supported
   * @throws IOException If an I/O error occurred
   */
  public RemoteIterator<LocatedFileStatus> listFiles(
      final Path f, final boolean recursive) throws AccessControlException,
      FileNotFoundException, UnsupportedFileSystemException, 
      IOException {
    return new LocatedFileStatusIterator(FileContext.this, f, recursive);
  }

  /**
   * Iterator over LocatedFileStatus objects that traverses a directory tree
   * depth-first, optionally following symbolic links.
   */
  private static class LocatedFileStatusIterator implements RemoteIterator<LocatedFileStatus> {
    private final FileContext fc;
    private final Stack<RemoteIterator<LocatedFileStatus>> itors = new Stack<>();
    private RemoteIterator<LocatedFileStatus> curItor;
    private LocatedFileStatus curFile;
    private final boolean recursive;
    private final Path rootPath;

    LocatedFileStatusIterator(FileContext fc, Path f, boolean recursive)
        throws AccessControlException, FileNotFoundException,
        UnsupportedFileSystemException, IOException {
      this.fc = fc;
      this.recursive = recursive;
      this.rootPath = f;
      this.curItor = fc.listLocatedStatus(f);
    }

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

    private void handleFileStat(LocatedFileStatus stat) throws IOException {
      if (stat.isFile()) {
        curFile = stat;
      } else if (stat.isSymlink()) {
        FileStatus symstat = fc.getFileStatus(stat.getSymlink());
        if (symstat.isFile() || (recursive && symstat.isDirectory())) {
          itors.push(curItor);
          curItor = fc.listLocatedStatus(stat.getPath());
        }
      } else if (recursive) {
        itors.push(curItor);
        curItor = fc.listLocatedStatus(stat.getPath());
      }
    }

    @Override
    public LocatedFileStatus next() throws IOException {
      if (hasNext()) {
        LocatedFileStatus result = curFile;
        curFile = null;
        return result;
      }
      throw new java.util.NoSuchElementException("No more entry in " + rootPath);
    }
  }