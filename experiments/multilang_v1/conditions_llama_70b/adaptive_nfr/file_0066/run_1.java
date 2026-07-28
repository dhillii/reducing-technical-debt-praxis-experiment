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
  Path absF = fixRelativePart(f);
  return new RemoteIterator<LocatedFileStatus>() {
    private Stack<RemoteIterator<LocatedFileStatus>> itors = 
      new Stack<RemoteIterator<LocatedFileStatus>>();
    RemoteIterator<LocatedFileStatus> curItor = listLocatedStatus(absF);
    LocatedFileStatus curFile;

    @Override
    public boolean hasNext() throws IOException {
      return hasNextInternal();
    }

    private boolean hasNextInternal() throws IOException {
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
      if (stat.isFile()) { 
        curFile = stat;
      } else if (stat.isSymlink()) { 
        FileStatus symstat = getFileStatus(stat.getSymlink());
        if (symstat.isFile() || (recursive && symstat.isDirectory())) {
          itors.push(curItor);
          curItor = listLocatedStatus(stat.getPath());
        }
      } else if (recursive) { 
        itors.push(curItor);
        curItor = listLocatedStatus(stat.getPath());
      }
    }

    @Override
    public LocatedFileStatus next() throws IOException {
      if (hasNextInternal()) {
        LocatedFileStatus result = curFile;
        curFile = null;
        return result;
      } 
      throw new java.util.NoSuchElementException("No more entry in " + f);
    }
  };
}