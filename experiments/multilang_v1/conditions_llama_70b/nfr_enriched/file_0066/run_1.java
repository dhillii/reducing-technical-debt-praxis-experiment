public RemoteIterator<LocatedFileStatus> listFiles(
    final Path f, final boolean recursive) throws AccessControlException,
    FileNotFoundException, UnsupportedFileSystemException, 
    IOException {
  return listFilesInternal(f, recursive);
}

private RemoteIterator<LocatedFileStatus> listFilesInternal(
    final Path f, final boolean recursive) throws AccessControlException,
    FileNotFoundException, UnsupportedFileSystemException, 
    IOException {
  // Check if the path is a directory
  FileStatus fileStatus = getFileStatus(f);
  if (fileStatus.isDirectory()) {
    return listDirectoryFiles(f, recursive);
  } else {
    // If the path is a file, return its status and block locations
    return new RemoteIterator<LocatedFileStatus>() {
      private boolean hasNext = true;
      private LocatedFileStatus nextFile = new LocatedFileStatus(fileStatus);

      @Override
      public boolean hasNext() throws IOException {
        return hasNext;
      }

      @Override
      public LocatedFileStatus next() throws IOException {
        if (hasNext) {
          hasNext = false;
          return nextFile;
        } else {
          throw new java.util.NoSuchElementException("No more entry in " + f);
        }
      }
    };
  }
}

private RemoteIterator<LocatedFileStatus> listDirectoryFiles(
    final Path f, final boolean recursive) throws AccessControlException,
    FileNotFoundException, UnsupportedFileSystemException, 
    IOException {
  return new RemoteIterator<LocatedFileStatus>() {
    private Stack<RemoteIterator<LocatedFileStatus>> itors = 
      new Stack<RemoteIterator<LocatedFileStatus>>();
    RemoteIterator<LocatedFileStatus> curItor = listLocatedStatus(f);
    LocatedFileStatus curFile;

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

    private void handleFileStat(LocatedFileStatus stat)
    throws IOException {
      if (stat.isFile()) { // file
        curFile = stat;
      } else if (stat.isSymlink()) { // symbolic link
        // resolve symbolic link
        FileStatus symstat = getFileStatus(stat.getSymlink());
        if (symstat.isFile() || (recursive && symstat.isDirectory())) {
          itors.push(curItor);
          curItor = listLocatedStatus(stat.getPath());
        }
      } else if (recursive) { // directory
        itors.push(curItor);
        curItor = listLocatedStatus(stat.getPath());
      }
    }

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