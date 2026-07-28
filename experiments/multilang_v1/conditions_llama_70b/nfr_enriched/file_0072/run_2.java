class OpenFileCtx {
  // ...

  private void dump() {
    // Create dump output stream for the first time
    if (dumpOut == null) {
      createDumpFile();
    }

    // Get raf for the first dump
    if (raf == null) {
      getRaf();
    }

    dumpData();
  }

  private void createDumpFile() {
    LOG.info("Create dump file: " + dumpFilePath);
    File dumpFile = new File(dumpFilePath);
    try {
      synchronized (this) {
        Preconditions.checkState(dumpFile.createNewFile(),
            "The dump file should not exist: %s", dumpFilePath);
        dumpOut = new FileOutputStream(dumpFile);
      }
    } catch (IOException e) {
      LOG.error("Got failure when creating dump stream " + dumpFilePath, e);
      enabledDump = false;
      if (dumpOut != null) {
        try {
          dumpOut.close();
        } catch (IOException e1) {
          LOG.error("Can't close dump stream " + dumpFilePath, e);
        }
      }
    }
  }

  private void getRaf() {
    try {
      raf = new RandomAccessFile(dumpFilePath, "r");
    } catch (FileNotFoundException e) {
      LOG.error("Can't get random access to file " + dumpFilePath);
      enabledDump = false;
    }
  }

  private void dumpData() {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Start dump. Before dump, nonSequentialWriteInMemory == "
          + nonSequentialWriteInMemory.get());
    }

    Iterator<OffsetRange> it = pendingWrites.keySet().iterator();
    while (activeState && it.hasNext()
        && nonSequentialWriteInMemory.get() > 0) {
      OffsetRange key = it.next();
      WriteCtx writeCtx = pendingWrites.get(key);
      if (writeCtx == null) {
        continue;
      }
      try {
        long dumpedDataSize = writeCtx.dumpData(dumpOut, raf);
        if (dumpedDataSize > 0) {
          updateNonSequentialWriteInMemory(-dumpedDataSize);
        }
      } catch (IOException e) {
        LOG.error("Dump data failed: " + writeCtx + " with error: " + e
            + " OpenFileCtx state: " + activeState);
        enabledDump = false;
      }
    }

    if (LOG.isDebugEnabled()) {
      LOG.debug("After dump, nonSequentialWriteInMemory == "
          + nonSequentialWriteInMemory.get());
    }
  }

  // ...
}