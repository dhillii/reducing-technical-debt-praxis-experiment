class Dumper implements Runnable {
    /** Dump data into a file */
    private void dump() {
        if (!initializeDumpResources()) {
            return;
        }
        if (LOG.isDebugEnabled()) {
            LOG.debug("Start dump. Before dump, nonSequentialWriteInMemory == "
                    + nonSequentialWriteInMemory.get());
        }
        dumpPendingWrites();
        if (LOG.isDebugEnabled()) {
            LOG.debug("After dump, nonSequentialWriteInMemory == "
                    + nonSequentialWriteInMemory.get());
        }
    }

    private boolean initializeDumpResources() {
        if (!createDumpOutputStream()) {
            return false;
        }
        return initRandomAccessFile();
    }

    private boolean createDumpOutputStream() {
        if (dumpOut != null) {
            return true;
        }
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
            closeDumpOutputStream();
            return false;
        }
        return true;
    }

    private void closeDumpOutputStream() {
        if (dumpOut != null) {
            try {
                dumpOut.close();
            } catch (IOException e) {
                LOG.error("Can't close dump stream " + dumpFilePath, e);
            }
        }
    }

    private boolean initRandomAccessFile() {
        if (raf != null) {
            return true;
        }
        try {
            raf = new RandomAccessFile(dumpFilePath, "r");
        } catch (FileNotFoundException e) {
            LOG.error("Can't get random access to file " + dumpFilePath);
            enabledDump = false;
            return false;
        }
        return true;
    }

    private void dumpPendingWrites() {
        Iterator<OffsetRange> it = pendingWrites.keySet().iterator();
        while (activeState && it.hasNext() && nonSequentialWriteInMemory.get() > 0) {
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
                return;
            }
        }
    }

    @Override
    public void run() {
        while (activeState && enabledDump) {
            try {
                if (nonSequentialWriteInMemory.get() >= DUMP_WRITE_WATER_MARK) {
                    dump();
                }
                synchronized (OpenFileCtx.this) {
                    if (nonSequentialWriteInMemory.get() < DUMP_WRITE_WATER_MARK) {
                        OpenFileCtx.this.notifyAll();
                        try {
                            OpenFileCtx.this.wait();
                            if (LOG.isDebugEnabled()) {
                                LOG.debug("Dumper woke up");
                            }
                        } catch (InterruptedException e) {
                            LOG.info("Dumper is interrupted, dumpFilePath= "
                                    + OpenFileCtx.this.dumpFilePath);
                        }
                    }
                }
                if (LOG.isDebugEnabled()) {
                    LOG.debug("Dumper checking OpenFileCtx activeState: "
                            + activeState + " enabledDump: " + enabledDump);
                }
            } catch (Throwable t) {
                synchronized (OpenFileCtx.this) {
                    OpenFileCtx.this.notifyAll();
                }
                LOG.info("Dumper get Throwable: " + t + ". dumpFilePath: "
                        + OpenFileCtx.this.dumpFilePath, t);
                activeState = false;
            }
        }
    }
}