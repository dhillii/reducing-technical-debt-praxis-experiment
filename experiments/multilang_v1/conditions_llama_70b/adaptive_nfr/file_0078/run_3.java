private static final String BAD_STATE_MESSAGE = "Bad state: %s";

// ...

synchronized void openForWrite() throws IOException {
    Preconditions.checkState(state == State.BETWEEN_LOG_SEGMENTS,
        BAD_STATE_MESSAGE, state);

    // ...
}

// ...

synchronized void initJournalsForWrite() {
    Preconditions.checkState(state == State.UNINITIALIZED ||
        state == State.CLOSED, BAD_STATE_MESSAGE, state);
    
    // ...
}

// ...

synchronized void formatNonFileJournals(NamespaceInfo nsInfo) throws IOException {
    Preconditions.checkState(state == State.BETWEEN_LOG_SEGMENTS,
        BAD_STATE_MESSAGE, state);
    
    // ...
}

// ...

synchronized List<FormatConfirmable> getFormatConfirmables() {
    Preconditions.checkState(state == State.BETWEEN_LOG_SEGMENTS,
        BAD_STATE_MESSAGE, state);

    // ...
}

// ...

synchronized void endCurrentLogSegment(boolean writeEndTxn) {
    LOG.info("Ending log segment " + curSegmentTxId);
    Preconditions.checkState(isSegmentOpen(),
        BAD_STATE_MESSAGE, state);
    
    // ...
}