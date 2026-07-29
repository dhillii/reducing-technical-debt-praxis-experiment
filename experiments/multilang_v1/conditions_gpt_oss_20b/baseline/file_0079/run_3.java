long loadEditRecords(EditLogInputStream in, boolean closeOnExit,
      long expectedStartingTxId, StartupOption startOpt,
      MetaRecoveryContext recovery) throws IOException {
    FSDirectory fsDir = fsNamesys.dir;

    EnumMap<FSEditLogOpCodes, Holder<Integer>> opCounts =
        new EnumMap<>(FSEditLogOpCodes.class);

    if (LOG.isTraceEnabled()) {
      LOG.trace("Acquiring write lock to replay edit log");
    }

    fsNamesys.writeLock();
    fsDir.writeLock();

    long[] recentOpcodeOffsets = {-1, -1, -1, -1};

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
        long lastPos = in.getPosition();
        FSEditLogOp op = readOp(in, recentOpcodeOffsets, numEdits,
            expectedTxId, recovery);
        if (op == null) {
          if (in.getPosition() == lastPos) {
            break;
          } else {
            continue;
          }
        }

        if (!checkTxId(op, expectedTxId, recovery)) {
          continue;
        }

        long inodeId;
        try {
          inodeId = applyEditLogOp(op, fsDir, startOpt,
              in.getVersion(true), lastInodeId);
        } catch (RollingUpgradeOp.RollbackException e) {
          throw e;
        } catch (Throwable e) {
          LOG.error("Encountered exception on operation " + op, e);
          if (recovery == null) {
            throw e instanceof IOException ? (IOException) e : new IOException(e);
          }
          MetaRecoveryContext.editLogLoaderPrompt(
              "Failed to apply edit log operation " + op + ": error "
                  + e.getMessage(), recovery, "applying edits");
          continue;
        }

        if (lastInodeId < inodeId) {
          lastInodeId = inodeId;
        }

        incrOpCount(op.opCode, opCounts, step, counter);

        if (op.hasTransactionId()) {
          lastAppliedTxId = op.getTransactionId();
          expectedTxId = lastAppliedTxId + 1;
        } else {
          expectedTxId = lastAppliedTxId = expectedStartingTxId;
        }

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

        numEdits++;
        totalEdits++;
      }
    } catch (RollingUpgradeOp.RollbackException e) {
      LOG.info("Stopped at OP_START_ROLLING_UPGRADE for rollback.");
    } catch (MetaRecoveryContext.RequestStopException e) {
      MetaRecoveryContext.LOG.warn("Stopped reading edit log at "
          + in.getPosition() + "/" + in.length());
    } finally {
      fsNamesys.dir.resetLastInodeId(lastInodeId);
      if (closeOnExit) {
        in.close();
      }
      fsDir.writeUnlock();
      fsNamesys.writeUnlock();

      if (LOG.isTraceEnabled()) {
        LOG.trace("replaying edit log finished");
      }

      if (FSImage.LOG.isDebugEnabled()) {
        dumpOpCounts(opCounts);
      }
    }
    return numEdits;
  }

  private FSEditLogOp readOp(EditLogInputStream in, long[] recentOpcodeOffsets,
      long numEdits, long expectedTxId, MetaRecoveryContext recovery)
      throws IOException {
    try {
      FSEditLogOp op = in.readOp();
      if (op == null) {
        return null;
      }
      recentOpcodeOffsets[(int) (numEdits % recentOpcodeOffsets.length)] =
          in.getPosition();
      return op;
    } catch (Throwable e) {
      check203UpgradeFailure(in.getVersion(true), e);
      String errorMessage =
          formatEditLogReplayError(in, recentOpcodeOffsets, expectedTxId);
      FSImage.LOG.error(errorMessage, e);
      if (recovery == null) {
        throw new EditLogInputException(errorMessage, e, numEdits);
      }
      MetaRecoveryContext.editLogLoaderPrompt(
          "We failed to read txId " + expectedTxId, recovery,
          "skipping the bad section in the log");
      in.resync();
      return null;
    }
  }

  private boolean checkTxId(FSEditLogOp op, long expectedTxId,
      MetaRecoveryContext recovery) throws IOException {
    if (!op.hasTransactionId()) {
      return true;
    }
    long txId = op.getTransactionId();
    if (txId > expectedTxId) {
      MetaRecoveryContext.editLogLoaderPrompt(
          "There appears to be a gap in the edit log.  We expected txid "
              + expectedTxId + ", but got txid " + txId + ".",
          recovery, "ignoring missing transaction IDs");
      return true;
    } else if (txId < expectedTxId) {
      MetaRecoveryContext.editLogLoaderPrompt(
          "There appears to be an out-of-order edit in the edit log.  We "
              + "expected txid " + expectedTxId + ", but got txid " + txId
              + ".",
          recovery, "skipping the out-of-order edit");
      return false;
    }
    return true;
  }