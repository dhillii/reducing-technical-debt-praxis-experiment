long loadEditRecords(EditLogInputStream in, boolean closeOnExit,
      long expectedStartingTxId, StartupOption startOpt,
      MetaRecoveryContext recovery) throws IOException {
    FSDirectory fsDir = fsNamesys.dir;

    EnumMap<FSEditLogOpCodes, Holder<Integer>> opCounts =
      new EnumMap<FSEditLogOpCodes, Holder<Integer>>(FSEditLogOpCodes.class);

    if (LOG.isTraceEnabled()) {
      LOG.trace("Acquiring write lock to replay edit log");
    }

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
        try {
          FSEditLogOp op;
          try {
            op = in.readOp();
            if (op == null) {
              break;
            }
          } catch (Throwable e) {
            // Handle a problem with our input
            check203UpgradeFailure(in.getVersion(true), e);
            String errorMessage =
              formatEditLogReplayError(in, recentOpcodeOffsets, expectedTxId);
            FSImage.LOG.error(errorMessage, e);
            if (recovery == null) {
               // We will only try to skip over problematic opcodes when in
               // recovery mode.
              throw new EditLogInputException(errorMessage, e, numEdits);
            }
            MetaRecoveryContext.editLogLoaderPrompt(
                "We failed to read txId " + expectedTxId,
                recovery, "skipping the bad section in the log");
            in.resync();
            continue;
          }
          recentOpcodeOffsets[(int)(numEdits % recentOpcodeOffsets.length)] =
            in.getPosition();
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
              continue;
            }
          }
          try {
            if (LOG.isTraceEnabled()) {
              LOG.trace("op=" + op + ", startOpt=" + startOpt
                  + ", numEdits=" + numEdits + ", totalEdits=" + totalEdits);
            }
            long inodeId = applyEditLogOp(op, fsDir, startOpt,
                in.getVersion(true), lastInodeId);
            if (lastInodeId < inodeId) {
              lastInodeId = inodeId;
            }
          } catch (RollingUpgradeOp.RollbackException e) {
            throw e;
          } catch (Throwable e) {
            LOG.error("Encountered exception on operation " + op, e);
            if (recovery == null) {
              throw e instanceof IOException? (IOException)e: new IOException(e);
            }

            MetaRecoveryContext.editLogLoaderPrompt("Failed to " +
             "apply edit log operation " + op + ": error " +
             e.getMessage(), recovery, "applying edits");
          }
          // Now that the operation has been successfully decoded and
          // applied, update our bookkeeping.
          incrOpCount(op.opCode, opCounts, step, counter);
          if (op.hasTransactionId()) {
            lastAppliedTxId = op.getTransactionId();
            expectedTxId = lastAppliedTxId + 1;
          } else {
            expectedTxId = lastAppliedTxId = expectedStartingTxId;
          }
          // log progress
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
        } catch (RollingUpgradeOp.RollbackException e) {
          LOG.info("Stopped at OP_START_ROLLING_UPGRADE for rollback.");
          break;
        } catch (MetaRecoveryContext.RequestStopException e) {
          MetaRecoveryContext.LOG.warn("Stopped reading edit log at " +
              in.getPosition() + "/"  + in.length());
          break;
        }
      }
    } finally {
      fsNamesys.dir.resetLastInodeId(lastInodeId);
      if(closeOnExit) {
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
  
  // allocate and update last allocated inode id
  private long getAndUpdateLastInodeId(long inodeIdFromOp, int logVersion,
      long lastInodeId) throws IOException {
    long inodeId = inodeIdFromOp;

    if (inodeId == INodeId.GRANDFATHER_INODE_ID) {
      if (NameNodeLayoutVersion.supports(
          LayoutVersion.Feature.ADD_INODE_ID, logVersion)) {
        throw new IOException("The layout version " + logVersion
            + " supports inodeId but gave bogus inodeId");
      }
      inodeId = fsNamesys.dir.allocateNewInodeId();
    } else {
      // need to reset lastInodeId. fsnamesys gets lastInodeId firstly from
      // fsimage but editlog captures more recent inodeId allocations
      if (inodeId > lastInodeId) {
        fsNamesys.dir.resetLastInodeId(inodeId);
      }
    }
    return inodeId;
  }

  @SuppressWarnings("deprecation")
  private long applyEditLogOp(FSEditLogOp op, FSDirectory fsDir,
      StartupOption startOpt, int logVersion, long lastInodeId) throws IOException {
    long inodeId = INodeId.GRANDFATHER_INODE_ID;
    if (LOG.isTraceEnabled()) {
      LOG.trace("replaying edit log: " + op);
    }
    final boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRetryCache();
    final String path = renameReservedPathsOnUpgradeIfExists(op, logVersion);
    final boolean hasRpcIds = op.hasRpcIds();
    final EditLogOpHandler handler = getEditLogOpHandler(op.opCode);

    if (handler != null) {
      inodeId = handler.handle(op, fsDir, fsNamesys, path, startOpt, logVersion,
          lastInodeId, toAddRetryCache, hasRpcIds, inodeId);
    }

    return inodeId;
  }

  // Helper: check path if rename is required
  private static String renameReservedPathsOnUpgradeIfExists(FSEditLogOp op, int logVersion) {
    if (op instanceof RenameOldOp) {
      return renameReservedPathsOnUpgrade(((RenameOldOp)op).src, logVersion);
    } else if (op instanceof AddCloseOp) {
      return renameReservedPathsOnUpgrade(((AddCloseOp)op).path, logVersion);
    } else if (op instanceof DeleteOp) {
      return renameReservedPathsOnUpgrade(((DeleteOp)op).path, logVersion);
    } else if (op instanceof MkdirOp) {
      return renameReservedPathsOnUpgrade(((MkdirOp)op).path, logVersion);
    } else if (op instanceof UpdateBlocksOp) {
      return renameReservedPathsOnUpgrade(((UpdateBlocksOp)op).path, logVersion);
    } else if (op instanceof SetReplicationOp) {
      return renameReservedPathsOnUpgrade(((SetReplicationOp)op).path, logVersion);
    } else if (op instanceof SetPermissionsOp) {
      return renameReservedPathsOnUpgrade(((SetPermissionsOp)op).src, logVersion);
    } else if (op instanceof SetOwnerOp) {
      return renameReservedPathsOnUpgrade(((SetOwnerOp)op).src, logVersion);
    } else if (op instanceof SetNSQuotaOp) {
      return renameReservedPathsOnUpgrade(((SetNSQuotaOp)op).src, logVersion);
    } else if (op instanceof ClearNSQuotaOp) {
      return renameReservedPathsOnUpgrade(((ClearNSQuotaOp)op).src, logVersion);
    } else if (op instanceof SetQuotaOp) {
      return renameReservedPathsOnUpgrade(((SetQuotaOp)op).src, logVersion);
    } else if (op instanceof SetQuotaByStorageTypeOp) {
      return renameReservedPathsOnUpgrade(((SetQuotaByStorageTypeOp)op).src, logVersion);
    } else if (op instanceof TimesOp) {
      return renameReservedPathsOnUpgrade(((TimesOp)op).path, logVersion);
    } else if (op instanceof SymlinkOp) {
      return renameReservedPathsOnUpgrade(((SymlinkOp)op).path, logVersion);
    } else if (op instanceof RenameOp) {
      return renameReservedPathsOnUpgrade(((RenameOp)op).src, logVersion);
    } else if (op instanceof ReassignLeaseOp) {
      return renameReservedPathsOnUpgrade(((ReassignLeaseOp)op).path, logVersion);
    } else if (op instanceof CreateSnapshotOp) {
      return renameReservedPathsOnUpgrade(((CreateSnapshotOp)op).snapshotRoot, logVersion);
    } else if (op instanceof DeleteSnapshotOp) {
      return renameReservedPathsOnUpgrade(((DeleteSnapshotOp)op).snapshotRoot, logVersion);
    } else if (op instanceof RenameSnapshotOp) {
      return renameReservedPathsOnUpgrade(((RenameSnapshotOp)op).snapshotRoot, logVersion);
    } else if (op instanceof AllowSnapshotOp) {
      return renameReservedPathsOnUpgrade(((AllowSnapshotOp)op).snapshotRoot, logVersion);
    } else if (op instanceof DisallowSnapshotOp) {
      return renameReservedPathsOnUpgrade(((DisallowSnapshotOp)op).snapshotRoot, logVersion);
    } else if (op instanceof SetStoragePolicyOp) {
      return renameReservedPathsOnUpgrade(((SetStoragePolicyOp)op).path, logVersion);
    } else if (op instanceof SetAclOp) {
      return ((SetAclOp)op).src;
    } else if (op instanceof SetXAttrOp) {
      return ((SetXAttrOp)op).src;
    } else if (op instanceof RemoveXAttrOp) {
      return ((RemoveXAttrOp)op).src;
    } else if (op instanceof TruncateOp) {
      return ((TruncateOp)op).src;
    } else if (op instanceof AddBlockOp) {
      return ((AddBlockOp)op).getPath();
    } else if (op instanceof ConcatDeleteOp) {
      // No path field — skip rename
      return null;
    } else if (op instanceof AddCacheDirectiveInfoOp) {
      return null;
    } else if (op instanceof ModifyCacheDirectiveInfoOp) {
      return null;
    } else if (op instanceof RemoveCacheDirectiveInfoOp) {
      return null;
    } else if (op instanceof AddCachePoolOp) {
      return null;
    } else if (op instanceof ModifyCachePoolOp) {
      return null;
    } else if (op instanceof RemoveCachePoolOp) {
      return null;
    } else if (op instanceof RollingUpgradeOp) {
      return null;
    } else if (op instanceof AllocateBlockIdOp) {
      return null;
    } else if (op instanceof SetGenstampV1Op || op instanceof SetGenstampV2Op ||
        op instanceof UpdateMasterKeyOp || op instanceof GetDelegationTokenOp ||
        op instanceof RenewDelegationTokenOp || op instanceof CancelDelegationTokenOp) {
      return null;
    } else {
      return null;
    }
  }

  // Strategy-based dispatch: fetch handler for opCode
  private EditLogOpHandler getEditLogOpHandler(FSEditLogOpCodes opCode) {
    switch (opCode) {
    case OP_ADD: return new AddCloseOpHandler();
    case OP_CLOSE: return new AddCloseOpHandler();
    case OP_APPEND: return new AppendOpHandler();
    case OP_UPDATE_BLOCKS: return new UpdateBlocksOpHandler();
    case OP_ADD_BLOCK: return new AddBlockOpHandler();
    case OP_SET_REPLICATION: return new SetReplicationOpHandler();
    case OP_CONCAT_DELETE: return new ConcatDeleteOpHandler();
    case OP_RENAME_OLD: return new RenameOldOpHandler();
    case OP_DELETE: return new DeleteOpHandler();
    case OP_MKDIR: return new MkdirOpHandler();
    case OP_SET_GENSTAMP_V1: return new SetGenstampV1OpHandler();
    case OP_SET_PERMISSIONS: return new SetPermissionsOpHandler();
    case OP_SET_OWNER: return new SetOwnerOpHandler();
    case OP_SET_NS_QUOTA: return new SetNSQuotaOpHandler();
    case OP_CLEAR_NS_QUOTA: return new ClearNSQuotaOpHandler();
    case OP_SET_QUOTA: return new SetQuotaOpHandler();
    case OP_SET_QUOTA_BY_STORAGETYPE: return new SetQuotaByStorageTypeOpHandler();
    case OP_TIMES: return new TimesOpHandler();
    case OP_SYMLINK: return new SymlinkOpHandler();
    case OP_RENAME: return new RenameOpHandler();
    case OP_GET_DELEGATION_TOKEN: return new GetDelegationTokenOpHandler();
    case OP_RENEW_DELEGATION_TOKEN: return new RenewDelegationTokenOpHandler();
    case OP_CANCEL_DELEGATION_TOKEN: return new CancelDelegationTokenOpHandler();
    case OP_UPDATE_MASTER_KEY: return new UpdateMasterKeyOpHandler();
    case OP_REASSIGN_LEASE: return new ReassignLeaseOpHandler();
    case OP_START_LOG_SEGMENT:
    case OP_END_LOG_SEGMENT: return new NoopOpHandler();
    case OP_CREATE_SNAPSHOT: return new CreateSnapshotOpHandler();
    case OP_DELETE_SNAPSHOT: return new DeleteSnapshotOpHandler();
    case OP_RENAME_SNAPSHOT: return new RenameSnapshotOpHandler();
    case OP_ALLOW_SNAPSHOT: return new AllowSnapshotOpHandler();
    case OP_DISALLOW_SNAPSHOT: return new DisallowSnapshotOpHandler();
    case OP_SET_GENSTAMP_V2: return new SetGenstampV2OpHandler();
    case OP_ALLOCATE_BLOCK_ID: return new AllocateBlockIdOpHandler();
    case OP_ROLLING_UPGRADE_START: return new RollingUpgradeStartOpHandler();
    case OP_ROLLING_UPGRADE_FINALIZE: return new RollingUpgradeFinalizeOpHandler();
    case OP_ADD_CACHE_DIRECTIVE: return new AddCacheDirectiveOpHandler();
    case OP_MODIFY_CACHE_DIRECTIVE: return new ModifyCacheDirectiveOpHandler();
    case OP_REMOVE_CACHE_DIRECTIVE: return new RemoveCacheDirectiveOpHandler();
    case OP_ADD_CACHE_POOL: return new AddCachePoolOpHandler();
    case OP_MODIFY_CACHE_POOL: return new ModifyCachePoolOpHandler();
    case OP_REMOVE_CACHE_POOL: return new RemoveCachePoolOpHandler();
    case OP_SET_ACL: return new SetAclOpHandler();
    case OP_SET_XATTR: return new SetXAttrOpHandler();
    case OP_REMOVE_XATTR: return new RemoveXAttrOpHandler();
    case OP_TRUNCATE: return new TruncateOpHandler();
    case OP_SET_STORAGE_POLICY: return new SetStoragePolicyOpHandler();
    default:
      throw new IOException("Invalid operation read " + opCode);
    }
  }

  // Interface for all edit log operation handlers
  interface EditLogOpHandler {
    long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException;
  }

  static class NoopOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) {
      return defaultInodeId;
    }
  }

  static class AddCloseOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      AddCloseOp addCloseOp = (AddCloseOp) op;
      if (FSNamesystem.LOG.isDebugEnabled()) {
        FSNamesystem.LOG.debug(op.opCode + ": " + path +
            " numblocks : " + addCloseOp.blocks.length +
            " clientHolder " + addCloseOp.clientName +
            " clientMachine " + addCloseOp.clientMachine);
      }

      INodesInPath iip = fsDir.getINodesInPath(path, true);
      INodeFile oldFile = INodeFile.valueOf(iip.getLastINode(), path, true);
      if (oldFile != null && addCloseOp.overwrite) {
        FSDirDeleteOp.deleteForEditLog(fsDir, path, addCloseOp.mtime);
        iip = INodesInPath.replace(iip, iip.length() - 1, null);
        oldFile = null;
      }
      INodeFile newFile = oldFile;
      if (oldFile == null) {
        final short replication = fsNamesys.getBlockManager()
            .adjustReplication(addCloseOp.replication);
        long inodeId = getAndUpdateLastInodeId(addCloseOp.inodeId, logVersion, lastInodeId);
        newFile = fsDir.addFileForEditLog(inodeId, iip.getExistingINodes(),
            iip.getLastLocalName(),
            addCloseOp.permissions,
            addCloseOp.aclEntries,
            addCloseOp.xAttrs, replication,
            addCloseOp.mtime, addCloseOp.atime,
            addCloseOp.blockSize, true,
            addCloseOp.clientName,
            addCloseOp.clientMachine,
            addCloseOp.storagePolicyId);
        iip = INodesInPath.replace(iip, iip.length() - 1, newFile);
        fsNamesys.leaseManager.addLease(addCloseOp.clientName, path);
        if (toAddRetryCache) {
          HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
              fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, newFile,
              BlockStoragePolicySuite.ID_UNSPECIFIED, Snapshot.CURRENT_STATE_ID,
              false, iip);
          fsNamesys.addCacheEntryWithPayload(addCloseOp.rpcClientId,
              addCloseOp.rpcCallId, stat);
        }
      } else if (!oldFile.isUnderConstruction()) {
        LocatedBlock lb = fsNamesys.prepareFileForAppend(path, iip,
            addCloseOp.clientName, addCloseOp.clientMachine, false, false,
            false);
        if (toAddRetryCache) {
          HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
              fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, newFile,
              BlockStoragePolicySuite.ID_UNSPECIFIED,
              Snapshot.CURRENT_STATE_ID, false, iip);
          fsNamesys.addCacheEntryWithPayload(addCloseOp.rpcClientId,
              addCloseOp.rpcCallId, new LastBlockWithStatus(lb, stat));
        }
      }
      newFile.setAccessTime(addCloseOp.atime, Snapshot.CURRENT_STATE_ID);
      newFile.setModificationTime(addCloseOp.mtime, Snapshot.CURRENT_STATE_ID);
      updateBlocks(fsDir, addCloseOp, iip, newFile);
      return defaultInodeId;
    }
  }

  static class AddBlockOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      AddBlockOp addBlockOp = (AddBlockOp) op;
      if (FSNamesystem.LOG.isDebugEnabled()) {
        FSNamesystem.LOG.debug(op.opCode + ": " + path +
            " new block id : " + addBlockOp.getLastBlock().getBlockId());
      }
      INodeFile oldFile = INodeFile.valueOf(fsDir.getINode(path), path);
      addNewBlock(fsDir, addBlockOp, oldFile);
      return defaultInodeId;
    }
  }

  static class AppendOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      AppendOp appendOp = (AppendOp) op;
      if (FSNamesystem.LOG.isDebugEnabled()) {
        FSNamesystem.LOG.debug(op.opCode + ": " + path +
            " clientName " + appendOp.clientName +
            " clientMachine " + appendOp.clientMachine +
            " newBlock " + appendOp.newBlock);
      }
      INodesInPath iip = fsDir.getINodesInPath4Write(path);
      INodeFile file = INodeFile.valueOf(iip.getLastINode(), path);
      if (!file.isUnderConstruction()) {
        LocatedBlock lb = fsNamesys.prepareFileForAppend(path, iip,
            appendOp.clientName, appendOp.clientMachine, appendOp.newBlock,
            false, false);
        if (toAddRetryCache) {
          HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
              fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, file,
              BlockStoragePolicySuite.ID_UNSPECIFIED,
              Snapshot.CURRENT_STATE_ID, false, iip);
          fsNamesys.addCacheEntryWithPayload(appendOp.rpcClientId,
              appendOp.rpcCallId, new LastBlockWithStatus(lb, stat));
        }
      }
      return defaultInodeId;
    }
  }

  static class UpdateBlocksOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      UpdateBlocksOp updateOp = (UpdateBlocksOp) op;
      if (FSNamesystem.LOG.isDebugEnabled()) {
        FSNamesystem.LOG.debug(op.opCode + ": " + path +
            " numblocks : " + updateOp.blocks.length);
      }
      INodesInPath iip = fsDir.getINodesInPath(path, true);
      INodeFile oldFile = INodeFile.valueOf(iip.getLastINode(), path);
      updateBlocks(fsDir, updateOp, iip, oldFile);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(updateOp.rpcClientId, updateOp.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class SetReplicationOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      SetReplicationOp setReplicationOp = (SetReplicationOp) op;
      short replication = fsNamesys.getBlockManager().adjustReplication(
          setReplicationOp.replication);
      FSDirAttrOp.unprotectedSetReplication(fsDir, path, replication, null);
      return defaultInodeId;
    }
  }

  static class ConcatDeleteOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      ConcatDeleteOp concatDeleteOp = (ConcatDeleteOp) op;
      String trg = renameReservedPathsOnUpgrade(concatDeleteOp.trg, logVersion);
      String[] srcs = new String[concatDeleteOp.srcs.length];
      for (int i=0; i<srcs.length; i++) {
        srcs[i] = renameReservedPathsOnUpgrade(concatDeleteOp.srcs[i], logVersion);
      }
      INodesInPath targetIIP = fsDir.getINodesInPath4Write(trg);
      INodeFile[] srcFiles = new INodeFile[srcs.length];
      for (int i = 0; i < srcs.length; i++) {
        INodesInPath srcIIP = fsDir.getINodesInPath4Write(srcs[i]);
        srcFiles[i] = srcIIP.getLastINode().asFile();
      }
      FSDirConcatOp.unprotectedConcat(fsDir, targetIIP, srcFiles, concatDeleteOp.timestamp);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(concatDeleteOp.rpcClientId, concatDeleteOp.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class RenameOldOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      RenameOldOp renameOp = (RenameOldOp) op;
      FSDirRenameOp.renameForEditLog(fsDir, renameOp.src, renameOp.dst, renameOp.timestamp);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class DeleteOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      DeleteOp deleteOp = (DeleteOp) op;
      FSDirDeleteOp.deleteForEditLog(fsDir, path, deleteOp.timestamp);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(deleteOp.rpcClientId, deleteOp.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class MkdirOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      MkdirOp mkdirOp = (MkdirOp) op;
      long inodeId = getAndUpdateLastInodeId(mkdirOp.inodeId, logVersion, lastInodeId);
      FSDirMkdirOp.mkdirForEditLog(fsDir, inodeId, path, mkdirOp.permissions,
          mkdirOp.aclEntries, mkdirOp.timestamp);
      return inodeId;
    }
  }

  static class SetGenstampV1OpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      SetGenstampV1Op setGenstampV1Op = (SetGenstampV1Op) op;
      fsNamesys.getBlockIdManager().setGenerationStampV1(setGenstampV1Op.genStampV1);
      return defaultInodeId;
    }
  }

  static class SetPermissionsOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      SetPermissionsOp setPermissionsOp = (SetPermissionsOp) op;
      FSDirAttrOp.unprotectedSetPermission(fsDir, path, setPermissionsOp.permissions);
      return defaultInodeId;
    }
  }

  static class SetOwnerOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      SetOwnerOp setOwnerOp = (SetOwnerOp) op;
      FSDirAttrOp.unprotectedSetOwner(fsDir, path, setOwnerOp.username, setOwnerOp.groupname);
      return defaultInodeId;
    }
  }

  static class SetNSQuotaOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      SetNSQuotaOp setNSQuotaOp = (SetNSQuotaOp) op;
      FSDirAttrOp.unprotectedSetQuota(fsDir, path, setNSQuotaOp.nsQuota,
          HdfsConstants.QUOTA_DONT_SET, null);
      return defaultInodeId;
    }
  }

  static class ClearNSQuotaOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      ClearNSQuotaOp clearNSQuotaOp = (ClearNSQuotaOp) op;
      FSDirAttrOp.unprotectedSetQuota(fsDir, path,
          HdfsConstants.QUOTA_RESET, HdfsConstants.QUOTA_DONT_SET, null);
      return defaultInodeId;
    }
  }

  static class SetQuotaOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      SetQuotaOp setQuotaOp = (SetQuotaOp) op;
      FSDirAttrOp.unprotectedSetQuota(fsDir, path,
          setQuotaOp.nsQuota, setQuotaOp.dsQuota, null);
      return defaultInodeId;
    }
  }

  static class SetQuotaByStorageTypeOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      SetQuotaByStorageTypeOp setQuotaByStorageTypeOp =
          (SetQuotaByStorageTypeOp) op;
      FSDirAttrOp.unprotectedSetQuota(fsDir, path,
          HdfsConstants.QUOTA_DONT_SET, setQuotaByStorageTypeOp.dsQuota,
          setQuotaByStorageTypeOp.type);
      return defaultInodeId;
    }
  }

  static class TimesOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      TimesOp timesOp = (TimesOp) op;
      FSDirAttrOp.unprotectedSetTimes(fsDir, path,
          timesOp.mtime, timesOp.atime, true);
      return defaultInodeId;
    }
  }

  static class SymlinkOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      if (!FileSystem.areSymlinksEnabled()) {
        throw new IOException("Symlinks not supported");
      }
      SymlinkOp symlinkOp = (SymlinkOp) op;
      long inodeId = getAndUpdateLastInodeId(symlinkOp.inodeId, logVersion, lastInodeId);
      final INodesInPath iip = fsDir.getINodesInPath(path, false);
      FSDirSymlinkOp.unprotectedAddSymlink(fsDir, iip.getExistingINodes(),
          iip.getLastLocalName(), inodeId, symlinkOp.value, symlinkOp.mtime,
          symlinkOp.atime, symlinkOp.permissionStatus);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(symlinkOp.rpcClientId, symlinkOp.rpcCallId);
      }
      return inodeId;
    }
  }

  static class RenameOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      RenameOp renameOp = (RenameOp) op;
      FSDirRenameOp.renameForEditLog(fsDir,
          renameReservedPathsOnUpgrade(renameOp.src, logVersion),
          renameReservedPathsOnUpgrade(renameOp.dst, logVersion),
          renameOp.timestamp, renameOp.options);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class GetDelegationTokenOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      GetDelegationTokenOp getDelegationTokenOp = (GetDelegationTokenOp) op;
      fsNamesys.getDelegationTokenSecretManager()
          .addPersistedDelegationToken(getDelegationTokenOp.token,
                                       getDelegationTokenOp.expiryTime);
      return defaultInodeId;
    }
  }

  static class RenewDelegationTokenOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      RenewDelegationTokenOp renewDelegationTokenOp = (RenewDelegationTokenOp) op;
      fsNamesys.getDelegationTokenSecretManager()
          .updatePersistedTokenRenewal(renewDelegationTokenOp.token,
                                       renewDelegationTokenOp.expiryTime);
      return defaultInodeId;
    }
  }

  static class CancelDelegationTokenOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      CancelDelegationTokenOp cancelDelegationTokenOp = (CancelDelegationTokenOp) op;
      fsNamesys.getDelegationTokenSecretManager()
          .updatePersistedTokenCancellation(cancelDelegationTokenOp.token);
      return defaultInodeId;
    }
  }

  static class UpdateMasterKeyOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      UpdateMasterKeyOp updateMasterKeyOp = (UpdateMasterKeyOp) op;
      fsNamesys.getDelegationTokenSecretManager()
          .updatePersistedMasterKey(updateMasterKeyOp.key);
      return defaultInodeId;
    }
  }

  static class ReassignLeaseOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      ReassignLeaseOp reassignLeaseOp = (ReassignLeaseOp) op;
      Lease lease = fsNamesys.leaseManager.getLease(reassignLeaseOp.leaseHolder);
      INodeFile pendingFile = fsDir.getINode(path).asFile();
      Preconditions.checkState(pendingFile.isUnderConstruction());
      fsNamesys.reassignLeaseInternal(lease, path, reassignLeaseOp.newHolder, pendingFile);
      return defaultInodeId;
    }
  }

  static class CreateSnapshotOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      CreateSnapshotOp createSnapshotOp = (CreateSnapshotOp) op;
      INodesInPath iip = fsDir.getINodesInPath4Write(path);
      String snapshotPath = fsNamesys.getSnapshotManager().createSnapshot(
          iip, path, createSnapshotOp.snapshotName);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntryWithPayload(createSnapshotOp.rpcClientId,
            createSnapshotOp.rpcCallId, snapshotPath);
      }
      return defaultInodeId;
    }
  }

  static class DeleteSnapshotOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      DeleteSnapshotOp deleteSnapshotOp = (DeleteSnapshotOp) op;
      BlocksMapUpdateInfo collectedBlocks = new BlocksMapUpdateInfo();
      List<INode> removedINodes = new ChunkedArrayList<>();
      INodesInPath iip = fsDir.getINodesInPath4Write(path);
      fsNamesys.getSnapshotManager().deleteSnapshot(
          iip, deleteSnapshotOp.snapshotName,
          collectedBlocks, removedINodes);
      fsNamesys.removeBlocksAndUpdateSafemodeTotal(collectedBlocks);
      collectedBlocks.clear();
      fsNamesys.dir.removeFromInodeMap(removedINodes);
      removedINodes.clear();
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(deleteSnapshotOp.rpcClientId, deleteSnapshotOp.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class RenameSnapshotOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      RenameSnapshotOp renameSnapshotOp = (RenameSnapshotOp) op;
      INodesInPath iip = fsDir.getINodesInPath4Write(path);
      fsNamesys.getSnapshotManager().renameSnapshot(iip, path,
          renameSnapshotOp.snapshotOldName, renameSnapshotOp.snapshotNewName);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(renameSnapshotOp.rpcClientId, renameSnapshotOp.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class AllowSnapshotOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      AllowSnapshotOp allowSnapshotOp = (AllowSnapshotOp) op;
      fsNamesys.getSnapshotManager().setSnapshottable(path, false);
      return defaultInodeId;
    }
  }

  static class DisallowSnapshotOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      DisallowSnapshotOp disallowSnapshotOp = (DisallowSnapshotOp) op;
      fsNamesys.getSnapshotManager().resetSnapshottable(path);
      return defaultInodeId;
    }
  }

  static class SetGenstampV2OpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      SetGenstampV2Op setGenstampV2Op = (SetGenstampV2Op) op;
      fsNamesys.getBlockIdManager().setGenerationStampV2(setGenstampV2Op.genStampV2);
      return defaultInodeId;
    }
  }

  static class AllocateBlockIdOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      AllocateBlockIdOp allocateBlockIdOp = (AllocateBlockIdOp) op;
      fsNamesys.getBlockIdManager().setLastAllocatedBlockId(allocateBlockIdOp.blockId);
      return defaultInodeId;
    }
  }

  static class RollingUpgradeStartOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      if (startOpt == StartupOption.ROLLINGUPGRADE) {
        RollingUpgradeStartupOption rollingOpt = startOpt.getRollingUpgradeStartupOption();
        if (rollingOpt == RollingUpgradeStartupOption.ROLLBACK) {
          throw new RollingUpgradeOp.RollbackException();
        } else if (rollingOpt == RollingUpgradeStartupOption.DOWNGRADE) {
          return defaultInodeId;
        }
      }
      long startTime = ((RollingUpgradeOp)op).getTime();
      fsNamesys.startRollingUpgradeInternal(startTime);
      fsNamesys.triggerRollbackCheckpoint();
      return defaultInodeId;
    }
  }

  static class RollingUpgradeFinalizeOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      long finalizeTime = ((RollingUpgradeOp)op).getTime();
      if (fsNamesys.isRollingUpgrade()) {
        fsNamesys.finalizeRollingUpgradeInternal(finalizeTime);
      }
      fsNamesys.getFSImage().updateStorageVersion();
      fsNamesys.getFSImage().renameCheckpoint(NameNodeFile.IMAGE_ROLLBACK, NameNodeFile.IMAGE);
      return defaultInodeId;
    }
  }

  static class AddCacheDirectiveOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      AddCacheDirectiveInfoOp addOp = (AddCacheDirectiveInfoOp) op;
      CacheDirectiveInfo result = fsNamesys.getCacheManager()
          .addDirectiveFromEditLog(addOp.directive);
      if (toAddRetryCache) {
        Long id = result.getId();
        fsNamesys.addCacheEntryWithPayload(op.rpcClientId, op.rpcCallId, id);
      }
      return defaultInodeId;
    }
  }

  static class ModifyCacheDirectiveOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      ModifyCacheDirectiveInfoOp modifyOp = (ModifyCacheDirectiveInfoOp) op;
      fsNamesys.getCacheManager().modifyDirectiveFromEditLog(modifyOp.directive);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class RemoveCacheDirectiveOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      RemoveCacheDirectiveInfoOp removeOp = (RemoveCacheDirectiveInfoOp) op;
      fsNamesys.getCacheManager().removeDirective(removeOp.id, null);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class AddCachePoolOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      AddCachePoolOp addOp = (AddCachePoolOp) op;
      fsNamesys.getCacheManager().addCachePool(addOp.info);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class ModifyCachePoolOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      ModifyCachePoolOp modifyOp = (ModifyCachePoolOp) op;
      fsNamesys.getCacheManager().modifyCachePool(modifyOp.info);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class RemoveCachePoolOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      RemoveCachePoolOp removeOp = (RemoveCachePoolOp) op;
      fsNamesys.getCacheManager().removeCachePool(removeOp.poolName);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class SetAclOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      SetAclOp setAclOp = (SetAclOp) op;
      FSDirAclOp.unprotectedSetAcl(fsDir, setAclOp.src, setAclOp.aclEntries, true);
      return defaultInodeId;
    }
  }

  static class SetXAttrOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      SetXAttrOp setXAttrOp = (SetXAttrOp) op;
      FSDirXAttrOp.unprotectedSetXAttrs(fsDir, setXAttrOp.src, setXAttrOp.xAttrs,
          EnumSet.of(XAttrSetFlag.CREATE, XAttrSetFlag.REPLACE));
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(setXAttrOp.rpcClientId, setXAttrOp.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class RemoveXAttrOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      RemoveXAttrOp removeXAttrOp = (RemoveXAttrOp) op;
      FSDirXAttrOp.unprotectedRemoveXAttrs(fsDir, removeXAttrOp.src, removeXAttrOp.xAttrs);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(removeXAttrOp.rpcClientId, removeXAttrOp.rpcCallId);
      }
      return defaultInodeId;
    }
  }

  static class TruncateOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      TruncateOp truncateOp = (TruncateOp) op;
      fsDir.unprotectedTruncate(truncateOp.src, truncateOp.clientName,
          truncateOp.clientMachine, truncateOp.newLength, truncateOp.timestamp,
          truncateOp.truncateBlock);
      return defaultInodeId;
    }
  }

  static class SetStoragePolicyOpHandler implements EditLogOpHandler {
    @Override
    public long handle(FSEditLogOp op, FSDirectory fsDir, FSNamesystem fsNamesys,
        String path, StartupOption startOpt, int logVersion,
        long lastInodeId, boolean toAddRetryCache, boolean hasRpcIds,
        long defaultInodeId) throws IOException {
      SetStoragePolicyOp setStoragePolicyOp = (SetStoragePolicyOp) op;
      INodesInPath iip = fsDir.getINodesInPath4Write(path);
      FSDirAttrOp.unprotectedSetStoragePolicy(fsDir, fsNamesys.getBlockManager(), iip,
          setStoragePolicyOp.policyId);
      return defaultInodeId;
    }
  }