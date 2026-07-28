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
 * 
 * Exceptions applicable to file systems accessed over RPC:
 * @throws RpcClientException If an exception occurred in the RPC client
 * @throws RpcServerException If an exception occurred in the RPC server
 * @throws UnexpectedServerException If server implementation throws 
 *           undeclared exception to RPC server
 */
public RemoteIterator<LocatedFileStatus> listFiles(
    final Path f, final boolean recursive) throws AccessControlException,
    FileNotFoundException, UnsupportedFileSystemException, 
    IOException {
  return new ListFilesIterator(f, recursive);
}

/**
 * Iterator implementation for {@link #listFiles(Path, boolean)}.
 * Handles depth‑first traversal and symbolic‑link resolution.
 */
private class ListFilesIterator implements RemoteIterator<LocatedFileStatus> {
  private final Stack<RemoteIterator<LocatedFileStatus>> itors = 
      new Stack<RemoteIterator<LocatedFileStatus>>();
  private RemoteIterator<LocatedFileStatus> curItor;
  private LocatedFileStatus curFile;
  private final boolean recursive;

  ListFilesIterator(Path f, boolean recursive) throws IOException {
    this.curItor = listLocatedStatus(f);
    this.recursive = recursive;
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

  @Override
  public LocatedFileStatus next() throws IOException {
    if (hasNext()) {
      LocatedFileStatus result = curFile;
      curFile = null;
      return result;
    }
    throw new java.util.NoSuchElementException("No more entry in iterator");
  }

  /**
   * Process a single {@link LocatedFileStatus}.
   * Updates iterator state based on file type and recursion flag.
   */
  private void handleFileStat(LocatedFileStatus stat) throws IOException {
    if (stat.isFile()) {
      curFile = stat;
    } else if (stat.isSymlink()) {
      FileStatus symstat = FileContext.this.getFileStatus(stat.getSymlink());
      if (symstat.isFile() || (recursive && symstat.isDirectory())) {
        itors.push(curItor);
        curItor = listLocatedStatus(stat.getPath());
      }
    } else if (recursive) { // directory
      itors.push(curItor);
      curItor = listLocatedStatus(stat.getPath());
    }
  }
}