public RemoteIterator<LocatedFileStatus> listFiles(
        final Path f, final boolean recursive) throws AccessControlException,
        FileNotFoundException, UnsupportedFileSystemException, 
        IOException {
      return new ListFilesIterator(f, recursive);
    }

    /**
     * Iterator implementation for {@link #listFiles(Path, boolean)}.
     * Traverses files depth‑first, handling symlinks and directories
     * according to the {@code recursive} flag.
     */
    private class ListFilesIterator implements RemoteIterator<LocatedFileStatus> {
      private final Path startPath;
      private final boolean recursive;
      private final Stack<RemoteIterator<LocatedFileStatus>> itors = new Stack<>();
      private RemoteIterator<LocatedFileStatus> curItor;
      private LocatedFileStatus curFile;

      ListFilesIterator(Path f, boolean recursive) throws IOException {
        this.startPath = f;
        this.recursive = recursive;
        this.curItor = FileContext.this.listLocatedStatus(f);
      }

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
        throw new java.util.NoSuchElementException("No more entry in " + startPath);
      }

      /**
       * Handles a {@link LocatedFileStatus} according to its type.
       * Files are emitted directly; directories are traversed when
       * {@code recursive} is true; symlinks are resolved and processed
       * based on the target type.
       */
      private void processStat(LocatedFileStatus stat) throws IOException {
        if (stat.isFile()) {
          curFile = stat;
        } else if (stat.isSymlink()) {
          FileStatus targetStatus = FileContext.this.getFileStatus(stat.getSymlink());
          if (targetStatus.isFile() || (recursive && targetStatus.isDirectory())) {
            itors.push(curItor);
            curItor = FileContext.this.listLocatedStatus(stat.getPath());
          }
        } else if (recursive) { // directory
          itors.push(curItor);
          curItor = FileContext.this.listLocatedStatus(stat.getPath());
        }
      }
    }