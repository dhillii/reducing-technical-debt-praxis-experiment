long loadEditRecords(EditLogInputStream in, boolean closeOnExit,
      long expectedStartingTxId, StartupOption startOpt,
      MetaRecoveryContext recovery) throws IOException {
    FSDirectory fsDir = fsNamesys.dir;

    EnumMap<FSEditLogOpCodes, Holder<Integer>> opCounts =
      new EnumMap<FSEditLogOpCodes, Holder<Integer>>(FSEditLogOpCodes.class);

    fsNamesys.writeLock();
    fsDir.writeLock();

    long recentOpcodeOffsets[] = new long[4];
    Arrays.fill(recentOpcodeOffsets, -1);
    
    long expectedTxId = expectedStartingTxId;
    long numEdits = 0;
    long lastTxId = in.getLastTxId();
    long numTxns = (lastTxId - expectedStartingTxId) + 1;
    StartupProgress prog = NameNode.getStartupProgress();
    Step step = createStartupProgressStep(in);
    prog.setTotal(Phase.LOADING_EDITS, step, numTxns);
    Counter counter = prog.getCounter(Phase.LOADING_EDITS, step);
    long lastLogTime = monotonicNow();
    long lastInodeId = fsNamesys.dir.getLastInodeId();
    
    try {
      while (true) {
        FSEditLogOp op = readNextOp(in, recentOpcodeOffsets, expectedTxId, recovery);
        if (op == null) {
          break;
        }
        applyEditLogOp(op, fsDir, startOpt, in.getVersion(true), lastInodeId);
        updateOpCount(op.opCode, opCounts, step, counter);
        updateTxId(op, expectedTxId, lastAppliedTxId);
        logProgress(op, lastLogTime, lastTxId, numTxns, expectedStartingTxId);
        numEdits++;
        totalEdits++;
      }
    } finally {
      fsNamesys.dir.resetLastInodeId(lastInodeId);
      if(closeOnExit) {
        in.close();
      }
      fsDir.writeUnlock();
      fsNamesys.writeUnlock();
    }
    return numEdits;
  }

  private FSEditLogOp readNextOp(EditLogInputStream in, long[] recentOpcodeOffsets, long expectedTxId, MetaRecoveryContext recovery) throws IOException {
    try {
      FSEditLogOp op = in.readOp();
      if (op == null) {
        return null;
      }
      recentOpcodeOffsets[(int)(totalEdits % recentOpcodeOffsets.length)] = in.getPosition();
      if (op.hasTransactionId()) {
        if (op.getTransactionId() > expectedTxId) { 
          MetaRecoveryContext.editLogLoaderPrompt("There appears " +
              "to be a gap in the edit log.  We expected txid " +
              expectedTxId + ", but got txid " +
              op.getTransactionId() + ".", recovery, "ignoring missing " +
              " transaction IDs");
        } else if (op.getTransactionId() < expectedTxId) { 
          MetaRecoveryContext.editLogLoaderPrompt("There appears " +
              "to be an out-of-order edit in the edit log.  We " +
              "expected txid " + expectedTxId + ", but got txid " +
              op.getTransactionId() + ".", recovery,
              "skipping the out-of-order edit");
          return readNextOp(in, recentOpcodeOffsets, expectedTxId, recovery);
        }
      }
      return op;
    } catch (Throwable e) {
      // Handle a problem with our input
      check203UpgradeFailure(in.getVersion(true), e);
      String errorMessage =
        formatEditLogReplayError(in, recentOpcodeOffsets, expectedTxId);
      FSImage.LOG.error(errorMessage, e);
      if (recovery == null) {
         // We will only try to skip over problematic opcodes when in
         // recovery mode.
        throw new EditLogInputException(errorMessage, e, totalEdits);
      }
      MetaRecoveryContext.editLogLoaderPrompt(
          "We failed to read txId " + expectedTxId,
          recovery, "skipping the bad section in the log");
      in.resync();
      return readNextOp(in, recentOpcodeOffsets, expectedTxId, recovery);
    }
  }

  private void applyEditLogOp(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt, int logVersion, long lastInodeId) throws IOException {
    // existing implementation
  }

  private void updateOpCount(FSEditLogOpCodes opCode, EnumMap<FSEditLogOpCodes, Holder<Integer>> opCounts, Step step, Counter counter) {
    Holder<Integer> holder = opCounts.get(opCode);
    if (holder == null) {
      holder = new Holder<Integer>(1);
      opCounts.put(opCode, holder);
    } else {
      holder.held++;
    }
    counter.increment();
  }

  private void updateTxId(FSEditLogOp op, long expectedTxId, long lastAppliedTxId) {
    if (op.hasTransactionId()) {
      lastAppliedTxId = op.getTransactionId();
      expectedTxId = lastAppliedTxId + 1;
    } else {
      expectedTxId = lastAppliedTxId = expectedStartingTxId;
    }
  }

  private void logProgress(FSEditLogOp op, long lastLogTime, long lastTxId, long numTxns, long expectedStartingTxId) {
    if (op.hasTransactionId()) {
      long now = monotonicNow();
      if (now - lastLogTime > REPLAY_TRANSACTION_LOG_INTERVAL) {
        long deltaTxId = lastAppliedTxId - expectedStartingTxId + 1;
        int percent = Math.round((float) deltaTxId / numTxns * 100);
        LOG.info("replaying edit log: " + deltaTxId + "/" + numTxns
            + " transactions completed. (" + percent + "%)");
        lastLogTime = now;
      }
    }
  }