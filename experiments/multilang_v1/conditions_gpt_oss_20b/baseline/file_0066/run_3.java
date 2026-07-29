public RemoteIterator<LocatedFileStatus> listFiles(
      final Path f, final boolean recursive) throws AccessControlException,
      FileNotFoundException, UnsupportedFileSystemException, IOException {
    return new RemoteIterator<LocatedFileStatus>() {
      private final Stack<RemoteIterator<LocatedFileStatus>> itors =
          new Stack<>();
      private RemoteIterator<LocatedFileStatus> curItor = listLocatedStatus(f);
      private LocatedFileStatus curFile;

      @Override
      public boolean hasNext() throws IOException {
        if (curFile != null) {
          return true;
        }
        return fetchNext();
      }

      private boolean fetchNext() throws IOException {
        while (true) {
          if (curItor == null) {
            return false;
          }
          if (curItor.hasNext()) {
            LocatedFileStatus stat = curItor.next();
            if (stat.isFile()) {
              curFile = stat;
              return true;
            }
            if (stat.isSymlink()) {
              FileStatus symstat = FileContext.this.getFileStatus(
                  stat.getSymlink());
              if (symstat.isFile()
                  || (recursive && symstat.isDirectory())) {
                itors.push(curItor);
                curItor = listLocatedStatus(stat.getPath());
                continue;
              }
            } else if (recursive) {
              itors.push(curItor);
              curItor = listLocatedStatus(stat.getPath());
              continue;
            }
            // Skip non-file, non-recursive directory, and symlink that
            // doesn't match criteria.
          } else if (!itors.empty()) {
            curItor = itors.pop();
          } else {
            return false;
          }
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