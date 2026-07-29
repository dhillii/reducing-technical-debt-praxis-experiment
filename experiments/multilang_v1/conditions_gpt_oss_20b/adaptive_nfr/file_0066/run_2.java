public RemoteIterator<LocatedFileStatus> listFiles(
      final Path f, final boolean recursive) throws AccessControlException,
      FileNotFoundException, UnsupportedFileSystemException, 
      IOException {
    return new RemoteIterator<LocatedFileStatus>() {
      private Stack<RemoteIterator<LocatedFileStatus>> itors = 
          new Stack<RemoteIterator<LocatedFileStatus>>();
      private RemoteIterator<LocatedFileStatus> curItor = listLocatedStatus(f);
      private LocatedFileStatus curFile;

      @Override
      public boolean hasNext() throws IOException {
        while (curFile == null) {
          if (curItor.hasNext()) {
            processStat(curItor.next());
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
        throw new java.util.NoSuchElementException("No more entry in " + f);
      }

      private void processStat(LocatedFileStatus stat) throws IOException {
        if (stat.isFile()) {
          curFile = stat;
        } else if (stat.isSymlink()) {
          FileStatus symstat = FileContext.this.getFileStatus(
              stat.getSymlink());
          if (symstat.isFile() || (recursive && symstat.isDirectory())) {
            itors.push(curItor);
            curItor = listLocatedStatus(stat.getPath());
          }
        } else if (recursive) {
          itors.push(curItor);
          curItor = listLocatedStatus(stat.getPath());
        }
      }
    };
  }