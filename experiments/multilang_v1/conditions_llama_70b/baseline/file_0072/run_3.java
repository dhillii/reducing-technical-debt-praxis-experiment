class Dumper implements Runnable {
    /** Dump data into a file */
    private void dump() {
        createDumpOutputStream();
        getRafForDump();
        dumpData();
    }

    private void createDumpOutputStream() {
        if (dumpOut == null) {
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
                return;
            }
        }
    }

    private void getRafForDump() {
        if (raf == null) {
            try {
                raf = new RandomAccessFile(dumpFilePath, "r");
            } catch (FileNotFoundException e) {
                LOG.error("Can't get random access to file " + dumpFilePath);
                enabledDump = false;
                return;
            }
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
                return;
            }
        }

        if (LOG.isDebugEnabled()) {
            LOG.debug("After dump, nonSequentialWriteInMemory == "
                    + nonSequentialWriteInMemory.get());
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
                    LOG.debug("Dumper checking OpenFileCtx activeState: " + activeState
                            + " enabledDump: " + enabledDump);
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