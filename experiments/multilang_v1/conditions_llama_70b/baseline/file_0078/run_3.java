private static final String BAD_STATE_MESSAGE = "Bad state: %s";

// ...

public synchronized void initJournalsForWrite() {
    Preconditions.checkState(state == State.UNINITIALIZED ||
        state == State.CLOSED, BAD_STATE_MESSAGE, state);
    
    initJournals(this.editsDirs);
    state = State.BETWEEN_LOG_SEGMENTS;
}

// ...

synchronized void openForWrite() throws IOException {
    Preconditions.checkState(state == State.BETWEEN_LOG_SEGMENTS,
        BAD_STATE_MESSAGE, state);

    long segmentTxId = getLastWrittenTxId() + 1;
    // Safety check: we should never start a segment if there are
    // newer txids readable.
    List<EditLogInputStream> streams = new ArrayList<EditLogInputStream>();
    journalSet.selectInputStreams(streams, segmentTxId, true);
    if (!streams.isEmpty()) {
        String error = String.format("Cannot start writing at txid %s " +
            "when there is a stream available for read: %s",
            segmentTxId, streams.get(0));
        IOUtils.cleanup(LOG, streams.toArray(new EditLogInputStream[0]));
        throw new IllegalStateException(error);
    }
    
    startLogSegment(segmentTxId, true);
    assert state == State.IN_SEGMENT : BAD_STATE_MESSAGE + " " + state;
}

// ...

synchronized void formatNonFileJournals(NamespaceInfo nsInfo) throws IOException {
    Preconditions.checkState(state == State.BETWEEN_LOG_SEGMENTS,
        BAD_STATE_MESSAGE, state);
    
    for (JournalManager jm : journalSet.getJournalManagers()) {
        if (!(jm instanceof FileJournalManager)) {
            jm.format(nsInfo);
        }
    }
}

// ...

synchronized List<FormatConfirmable> getFormatConfirmables() {
    Preconditions.checkState(state == State.BETWEEN_LOG_SEGMENTS,
        BAD_STATE_MESSAGE, state);

    List<FormatConfirmable> ret = Lists.newArrayList();
    for (final JournalManager jm : journalSet.getJournalManagers()) {
        // The FJMs are confirmed separately since they are also
        // StorageDirectories
        if (!(jm instanceof FileJournalManager)) {
            ret.add(jm);
        }
    }
    return ret;
}

// ...

synchronized void endCurrentLogSegment(boolean writeEndTxn) {
    LOG.info("Ending log segment " + curSegmentTxId);
    Preconditions.checkState(isSegmentOpen(),
        BAD_STATE_MESSAGE, state);
    
    if (writeEndTxn) {
        logEdit(LogSegmentOp.getInstance(cache.get(), 
            FSEditLogOpCodes.OP_END_LOG_SEGMENT));
        logSync();
    }

    printStatistics(true);
    
    final long lastTxId = getLastWrittenTxId();
    
    try {
        journalSet.finalizeLogSegment(curSegmentTxId, lastTxId);
        editLogStream = null;
    } catch (IOException e) {
        //All journals have failed, it will be handled in logSync.
    }
    
    state = State.BETWEEN_LOG_SEGMENTS;
}