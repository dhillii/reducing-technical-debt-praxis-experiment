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

synchronized void startLogSegment(final long segmentTxId,
      boolean writeHeaderTxn) throws IOException {
    // ...
    Preconditions.checkState(state == State.BETWEEN_LOG_SEGMENTS,
        BAD_STATE_MESSAGE, state);
    // ...
}

// ...

synchronized void endCurrentLogSegment(boolean writeEndTxn) {
    Preconditions.checkState(isSegmentOpen(),
        BAD_STATE_MESSAGE, state);
    // ...
}

// ...

private void checkState(State expectedState) {
    Preconditions.checkState(state == expectedState, BAD_STATE_MESSAGE, state);
}

// ...

synchronized void openForWrite() throws IOException {
    checkState(State.BETWEEN_LOG_SEGMENTS);
    // ...
}

synchronized void initJournalsForWrite() {
    checkState(State.UNINITIALIZED);
    checkState(State.CLOSED);
    // ...
}

synchronized void formatNonFileJournals(NamespaceInfo nsInfo) throws IOException {
    checkState(State.BETWEEN_LOG_SEGMENTS);
    // ...
}

synchronized List<FormatConfirmable> getFormatConfirmables() {
    checkState(State.BETWEEN_LOG_SEGMENTS);
    // ...
}

synchronized void startLogSegment(final long segmentTxId,
      boolean writeHeaderTxn) throws IOException {
    checkState(State.BETWEEN_LOG_SEGMENTS);
    // ...
}

synchronized void endCurrentLogSegment(boolean writeEndTxn) {
    checkState(State.IN_SEGMENT);
    // ...
}