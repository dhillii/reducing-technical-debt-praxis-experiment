class Dumper implements Runnable {
    private final OpenFileCtx openFileCtx;

    Dumper(OpenFileCtx openFileCtx) {
        this.openFileCtx = openFileCtx;
    }

    @Override
    public void run() {
        while (openFileCtx.getActiveState() && openFileCtx.getEnabledDump()) {
            try {
                if (openFileCtx.getNonSequentialWriteInMemory() >= Dumper.DUMP_WRITE_WATER_MARK) {
                    dump();
                } else {
                    synchronized (openFileCtx) {
                        if (openFileCtx.getNonSequentialWriteInMemory() < Dumper.DUMP_WRITE_WATER_MARK) {
                            openFileCtx.notifyAll();
                            try {
                                openFileCtx.wait();
                            } catch (InterruptedException e) {
                                LOG.info("Dumper is interrupted, dumpFilePath= "
                                    + openFileCtx.getDumpFilePath());
                            }
                        }
                    }
                }
            } catch (Throwable t) {
                synchronized (openFileCtx) {
                    openFileCtx.notifyAll();
                }
                LOG.info("Dumper get Throwable: " + t + ". dumpFilePath: "
                    + openFileCtx.getDumpFilePath(), t);
                openFileCtx.setActiveState(false);
            }
        }
    }

    private void dump() {
        if (openFileCtx.getDumpOut() == null) {
            createDumpStream();
        }

        if (openFileCtx.getRaf() == null) {
            openFileCtx.initRaf();
        }

        Iterator<OffsetRange> it = openFileCtx.getPendingWrites().keySet().iterator();
        while (openFileCtx.getActiveState() && it.hasNext()
            && openFileCtx.getNonSequentialWriteInMemory() > 0) {
            OffsetRange key = it.next();
            WriteCtx writeCtx = openFileCtx.getPendingWrites().get(key);
            if (writeCtx == null) {
                continue;
            }
            try {
                long dumpedDataSize = writeCtx.dumpData(openFileCtx.getDumpOut(), openFileCtx.getRaf());
                if (dumpedDataSize > 0) {
                    openFileCtx.updateNonSequentialWriteInMemory(-dumpedDataSize);
                }
            } catch (IOException e) {
                LOG.error("Dump data failed: " + writeCtx + " with error: " + e
                    + " OpenFileCtx state: " + openFileCtx.getActiveState());
                openFileCtx.setEnabledDump(false);
                return;
            }
        }
    }

    private void createDumpStream() {
        LOG.info("Create dump file: " + openFileCtx.getDumpFilePath());
        File dumpFile = new File(openFileCtx.getDumpFilePath());
        try {
            synchronized (openFileCtx) {
                Preconditions.checkState(dumpFile.createNewFile(),
                    "The dump file should not exist: %s", openFileCtx.getDumpFilePath());
                openFileCtx.setDumpOut(new FileOutputStream(dumpFile));
            }
        } catch (IOException e) {
            LOG.error("Got failure when creating dump stream " + openFileCtx.getDumpFilePath(), e);
            openFileCtx.setEnabledDump(false);
            if (openFileCtx.getDumpOut() != null) {
                try {
                    openFileCtx.getDumpOut().close();
                } catch (IOException e1) {
                    LOG.error("Can't close dump stream " + openFileCtx.getDumpFilePath(), e1);
                }
            }
            return;
        }
    }

    private void initRaf() {
        try {
            openFileCtx.setRaf(new RandomAccessFile(openFileCtx.getDumpFilePath(), "r"));
        } catch (FileNotFoundException e) {
            LOG.error("Can't get random access to file " + openFileCtx.getDumpFilePath());
            openFileCtx.setEnabledDump(false);
            return;
        }
    }

    private static final long DUMP_WRITE_WATER_MARK = 1024 * 1024;
}