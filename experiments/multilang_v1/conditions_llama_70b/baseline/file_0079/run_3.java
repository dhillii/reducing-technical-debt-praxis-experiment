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
        FSEditLogOp op = readOp(in, recentOpcodeOffsets, expectedTxId, recovery);
        if (op == null) {
          break;
        }
        applyEditLogOp(op, fsDir, startOpt, in.getVersion(true), lastInodeId);
        incrOpCount(op.opCode, opCounts, step, counter);
        if (op.hasTransactionId()) {
          lastAppliedTxId = op.getTransactionId();
          expectedTxId = lastAppliedTxId + 1;
        } else {
          expectedTxId = lastAppliedTxId = expectedStartingTxId;
        }
        logProgress(op, lastAppliedTxId, expectedStartingTxId, numTxns, lastLogTime);
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

      if (FSImage.LOG.isDebugEnabled()) {
        dumpOpCounts(opCounts);
      }
    }
    return numEdits;
  }

  private FSEditLogOp readOp(EditLogInputStream in, long recentOpcodeOffsets[], long expectedTxId, MetaRecoveryContext recovery) throws IOException {
    try {
      FSEditLogOp op = in.readOp();
      if (op == null) {
        return null;
      }
      recentOpcodeOffsets[(int)(totalEdits % recentOpcodeOffsets.length)] =
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
          return readOp(in, recentOpcodeOffsets, expectedTxId, recovery);
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
      return readOp(in, recentOpcodeOffsets, expectedTxId, recovery);
    }
  }

  private void applyEditLogOp(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt, int logVersion, long lastInodeId) throws IOException {
    long inodeId = INodeId.GRANDFATHER_INODE_ID;
    try {
      switch (op.opCode) {
        case OP_ADD:
          applyAddOp(op, fsDir, startOpt, logVersion, lastInodeId);
          break;
        case OP_CLOSE:
          applyCloseOp(op, fsDir, logVersion);
          break;
        case OP_APPEND:
          applyAppendOp(op, fsDir, logVersion);
          break;
        case OP_UPDATE_BLOCKS:
          applyUpdateBlocksOp(op, fsDir, logVersion, lastInodeId);
          break;
        case OP_ADD_BLOCK:
          applyAddBlockOp(op, fsDir, logVersion);
          break;
        case OP_SET_REPLICATION:
          applySetReplicationOp(op, fsDir, logVersion);
          break;
        case OP_CONCAT_DELETE:
          applyConcatDeleteOp(op, fsDir, logVersion);
          break;
        case OP_RENAME_OLD:
          applyRenameOldOp(op, fsDir, logVersion);
          break;
        case OP_DELETE:
          applyDeleteOp(op, fsDir, logVersion);
          break;
        case OP_MKDIR:
          applyMkdirOp(op, fsDir, logVersion, lastInodeId);
          break;
        case OP_SET_GENSTAMP_V1:
          applySetGenstampV1Op(op, fsDir);
          break;
        case OP_SET_PERMISSIONS:
          applySetPermissionsOp(op, fsDir, logVersion);
          break;
        case OP_SET_OWNER:
          applySetOwnerOp(op, fsDir, logVersion);
          break;
        case OP_SET_NS_QUOTA:
          applySetNSQuotaOp(op, fsDir, logVersion);
          break;
        case OP_CLEAR_NS_QUOTA:
          applyClearNSQuotaOp(op, fsDir, logVersion);
          break;
        case OP_SET_QUOTA:
          applySetQuotaOp(op, fsDir, logVersion);
          break;
        case OP_SET_QUOTA_BY_STORAGETYPE:
          applySetQuotaByStorageTypeOp(op, fsDir, logVersion);
          break;
        case OP_TIMES:
          applyTimesOp(op, fsDir, logVersion);
          break;
        case OP_SYMLINK:
          applySymlinkOp(op, fsDir, logVersion, lastInodeId);
          break;
        case OP_RENAME:
          applyRenameOp(op, fsDir, logVersion);
          break;
        case OP_GET_DELEGATION_TOKEN:
          applyGetDelegationTokenOp(op, fsDir);
          break;
        case OP_RENEW_DELEGATION_TOKEN:
          applyRenewDelegationTokenOp(op, fsDir);
          break;
        case OP_CANCEL_DELEGATION_TOKEN:
          applyCancelDelegationTokenOp(op, fsDir);
          break;
        case OP_UPDATE_MASTER_KEY:
          applyUpdateMasterKeyOp(op, fsDir);
          break;
        case OP_REASSIGN_LEASE:
          applyReassignLeaseOp(op, fsDir, logVersion);
          break;
        case OP_START_LOG_SEGMENT:
        case OP_END_LOG_SEGMENT:
          break;
        case OP_CREATE_SNAPSHOT:
          applyCreateSnapshotOp(op, fsDir, logVersion);
          break;
        case OP_DELETE_SNAPSHOT:
          applyDeleteSnapshotOp(op, fsDir, logVersion);
          break;
        case OP_RENAME_SNAPSHOT:
          applyRenameSnapshotOp(op, fsDir, logVersion);
          break;
        case OP_ALLOW_SNAPSHOT:
          applyAllowSnapshotOp(op, fsDir, logVersion);
          break;
        case OP_DISALLOW_SNAPSHOT:
          applyDisallowSnapshotOp(op, fsDir, logVersion);
          break;
        case OP_SET_GENSTAMP_V2:
          applySetGenstampV2Op(op, fsDir);
          break;
        case OP_ALLOCATE_BLOCK_ID:
          applyAllocateBlockIdOp(op, fsDir);
          break;
        case OP_ROLLING_UPGRADE_START:
          applyRollingUpgradeStartOp(op, fsDir, startOpt);
          break;
        case OP_ROLLING_UPGRADE_FINALIZE:
          applyRollingUpgradeFinalizeOp(op, fsDir);
          break;
        case OP_ADD_CACHE_DIRECTIVE:
          applyAddCacheDirectiveOp(op, fsDir);
          break;
        case OP_MODIFY_CACHE_DIRECTIVE:
          applyModifyCacheDirectiveOp(op, fsDir);
          break;
        case OP_REMOVE_CACHE_DIRECTIVE:
          applyRemoveCacheDirectiveOp(op, fsDir);
          break;
        case OP_ADD_CACHE_POOL:
          applyAddCachePoolOp(op, fsDir);
          break;
        case OP_MODIFY_CACHE_POOL:
          applyModifyCachePoolOp(op, fsDir);
          break;
        case OP_REMOVE_CACHE_POOL:
          applyRemoveCachePoolOp(op, fsDir);
          break;
        case OP_SET_ACL:
          applySetAclOp(op, fsDir, logVersion);
          break;
        case OP_SET_XATTR:
          applySetXAttrOp(op, fsDir, logVersion);
          break;
        case OP_REMOVE_XATTR:
          applyRemoveXAttrOp(op, fsDir, logVersion);
          break;
        case OP_TRUNCATE:
          applyTruncateOp(op, fsDir, logVersion);
          break;
        case OP_SET_STORAGE_POLICY:
          applySetStoragePolicyOp(op, fsDir, logVersion);
          break;
        default:
          throw new IOException("Invalid operation read " + op.opCode);
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
    return inodeId;
  }

  private void logProgress(FSEditLogOp op, long lastAppliedTxId, long expectedStartingTxId, long numTxns, long lastLogTime) {
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

  private void applyAddOp(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt, int logVersion, long lastInodeId) throws IOException {
    AddCloseOp addCloseOp = (AddCloseOp)op;
    final String path =
        renameReservedPathsOnUpgrade(addCloseOp.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " numblocks : " + addCloseOp.blocks.length +
          " clientHolder " + addCloseOp.clientName +
          " clientMachine " + addCloseOp.clientMachine);
    }

    // There are 3 cases here:
    // 1. OP_ADD to create a new file
    // 2. OP_ADD to update file blocks
    // 3. OP_ADD to open file for append (old append)

    // See if the file already exists (persistBlocks call)
    INodesInPath iip = fsDir.getINodesInPath(path, true);
    INodeFile oldFile = INodeFile.valueOf(iip.getLastINode(), path, true);
    if (oldFile != null && addCloseOp.overwrite) {
      // This is OP_ADD with overwrite
      FSDirDeleteOp.deleteForEditLog(fsDir, path, addCloseOp.mtime);
      iip = INodesInPath.replace(iip, iip.length() - 1, null);
      oldFile = null;
    }
    INodeFile newFile = oldFile;
    if (oldFile == null) { // this is OP_ADD on a new file (case 1)
      // versions > 0 support per file replication
      // get name and replication
      final short replication = fsNamesys.getBlockManager()
          .adjustReplication(addCloseOp.replication);
      assert addCloseOp.blocks.length == 0;

      // add to the file tree
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

      // add the op into retry cache if necessary
      if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
        HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
            fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, newFile,
            BlockStoragePolicySuite.ID_UNSPECIFIED, Snapshot.CURRENT_STATE_ID,
            false, iip);
        fsNamesys.addCacheEntryWithPayload(addCloseOp.rpcClientId,
            addCloseOp.rpcCallId, stat);
      }
    } else { // This is OP_ADD on an existing file (old append)
      if (!oldFile.isUnderConstruction()) {
        // This is case 3: a call to append() on an already-closed file.
        if (FSNamesystem.LOG.isDebugEnabled()) {
          FSNamesystem.LOG.debug("Reopening an already-closed file " +
              "for append");
        }
        LocatedBlock lb = fsNamesys.prepareFileForAppend(path, iip,
            addCloseOp.clientName, addCloseOp.clientMachine, false, false,
            false);
        // add the op into retry cache if necessary
        if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
          HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
              fsNamesys.dir, path,
              HdfsFileStatus.EMPTY_NAME, newFile,
              BlockStoragePolicySuite.ID_UNSPECIFIED,
              Snapshot.CURRENT_STATE_ID, false, iip);
          fsNamesys.addCacheEntryWithPayload(addCloseOp.rpcClientId,
              addCloseOp.rpcCallId, new LastBlockWithStatus(lb, stat));
        }
      }
    }
    // Fall-through for case 2.
    // Regardless of whether it's a new file or an updated file,
    // update the block list.

    // Update the salient file attributes.
    newFile.setAccessTime(addCloseOp.atime, Snapshot.CURRENT_STATE_ID);
    newFile.setModificationTime(addCloseOp.mtime, Snapshot.CURRENT_STATE_ID);
    updateBlocks(fsDir, addCloseOp, iip, newFile);
  }

  private void applyCloseOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    AddCloseOp addCloseOp = (AddCloseOp)op;
    final String path =
        renameReservedPathsOnUpgrade(addCloseOp.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " numblocks : " + addCloseOp.blocks.length +
          " clientHolder " + addCloseOp.clientName +
          " clientMachine " + addCloseOp.clientMachine);
    }

    final INodesInPath iip = fsDir.getINodesInPath(path, true);
    final INodeFile file = INodeFile.valueOf(iip.getLastINode(), path);

    // Update the salient file attributes.
    file.setAccessTime(addCloseOp.atime, Snapshot.CURRENT_STATE_ID);
    file.setModificationTime(addCloseOp.mtime, Snapshot.CURRENT_STATE_ID);
    updateBlocks(fsDir, addCloseOp, iip, file);

    // Now close the file
    if (!file.isUnderConstruction() &&
        logVersion <= LayoutVersion.BUGFIX_HDFS_2991_VERSION) {
      // There was a bug (HDFS-2991) in hadoop < 0.23.1 where OP_CLOSE
      // could show up twice in a row. But after that version, this
      // should be fixed, so we should treat it as an error.
      throw new IOException(
          "File is not under construction: " + path);
    }
    // One might expect that you could use removeLease(holder, path) here,
    // but OP_CLOSE doesn't serialize the holder. So, remove by path.
    if (file.isUnderConstruction()) {
      fsNamesys.leaseManager.removeLeaseWithPrefixPath(path);
      file.toCompleteFile(file.getModificationTime());
    }
  }

  private void applyAppendOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    AppendOp appendOp = (AppendOp) op;
    final String path = renameReservedPathsOnUpgrade(appendOp.path,
        logVersion);
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
      // add the op into retry cache if necessary
      if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
        HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
            fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, file,
            BlockStoragePolicySuite.ID_UNSPECIFIED,
            Snapshot.CURRENT_STATE_ID, false, iip);
        fsNamesys.addCacheEntryWithPayload(appendOp.rpcClientId,
            appendOp.rpcCallId, new LastBlockWithStatus(lb, stat));
      }
    }
  }

  private void applyUpdateBlocksOp(FSEditLogOp op, FSDirectory fsDir, int logVersion, long lastInodeId) throws IOException {
    UpdateBlocksOp updateOp = (UpdateBlocksOp)op;
    final String path =
        renameReservedPathsOnUpgrade(updateOp.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " numblocks : " + updateOp.blocks.length);
    }
    INodesInPath iip = fsDir.getINodesInPath(path, true);
    INodeFile oldFile = INodeFile.valueOf(iip.getLastINode(), path);
    // Update in-memory data structures
    updateBlocks(fsDir, updateOp, iip, oldFile);
    
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(updateOp.rpcClientId, updateOp.rpcCallId);
    }
  }

  private void applyAddBlockOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    AddBlockOp addBlockOp = (AddBlockOp) op;
    String path = renameReservedPathsOnUpgrade(addBlockOp.getPath(), logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " new block id : " + addBlockOp.getLastBlock().getBlockId());
    }
    INodeFile oldFile = INodeFile.valueOf(fsDir.getINode(path), path);
    // add the new block to the INodeFile
    addNewBlock(fsDir, addBlockOp, oldFile);
  }

  private void applySetReplicationOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    SetReplicationOp setReplicationOp = (SetReplicationOp)op;
    short replication = fsNamesys.getBlockManager().adjustReplication(
        setReplicationOp.replication);
    FSDirAttrOp.unprotectedSetReplication(fsDir, renameReservedPathsOnUpgrade(
        setReplicationOp.path, logVersion), replication, null);
  }

  private void applyConcatDeleteOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    ConcatDeleteOp concatDeleteOp = (ConcatDeleteOp)op;
    String trg = renameReservedPathsOnUpgrade(concatDeleteOp.trg, logVersion);
    String[] srcs = new String[concatDeleteOp.srcs.length];
    for (int i=0; i<srcs.length; i++) {
      srcs[i] =
          renameReservedPathsOnUpgrade(concatDeleteOp.srcs[i], logVersion);
    }
    INodesInPath targetIIP = fsDir.getINodesInPath4Write(trg);
    INodeFile[] srcFiles = new INodeFile[srcs.length];
    for (int i = 0; i < srcs.length; i++) {
      INodesInPath srcIIP = fsDir.getINodesInPath4Write(srcs[i]);
      srcFiles[i] = srcIIP.getLastINode().asFile();
    }
    FSDirConcatOp.unprotectedConcat(fsDir, targetIIP, srcFiles,
        concatDeleteOp.timestamp);
    
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(concatDeleteOp.rpcClientId,
          concatDeleteOp.rpcCallId);
    }
  }

  private void applyRenameOldOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    RenameOldOp renameOp = (RenameOldOp)op;
    final String src = renameReservedPathsOnUpgrade(renameOp.src, logVersion);
    final String dst = renameReservedPathsOnUpgrade(renameOp.dst, logVersion);
    FSDirRenameOp.renameForEditLog(fsDir, src, dst, renameOp.timestamp);
    
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
    }
  }

  private void applyDeleteOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    DeleteOp deleteOp = (DeleteOp)op;
    FSDirDeleteOp.deleteForEditLog(
        fsDir, renameReservedPathsOnUpgrade(deleteOp.path, logVersion),
        deleteOp.timestamp);
    
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(deleteOp.rpcClientId, deleteOp.rpcCallId);
    }
  }

  private void applyMkdirOp(FSEditLogOp op, FSDirectory fsDir, int logVersion, long lastInodeId) throws IOException {
    MkdirOp mkdirOp = (MkdirOp)op;
    long inodeId = getAndUpdateLastInodeId(mkdirOp.inodeId, logVersion,
        lastInodeId);
    FSDirMkdirOp.mkdirForEditLog(fsDir, inodeId,
        renameReservedPathsOnUpgrade(mkdirOp.path, logVersion),
        mkdirOp.permissions, mkdirOp.aclEntries, mkdirOp.timestamp);
  }

  private void applySetGenstampV1Op(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    SetGenstampV1Op setGenstampV1Op = (SetGenstampV1Op)op;
    fsNamesys.getBlockIdManager().setGenerationStampV1(
        setGenstampV1Op.genStampV1);
  }

  private void applySetPermissionsOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    SetPermissionsOp setPermissionsOp = (SetPermissionsOp)op;
    FSDirAttrOp.unprotectedSetPermission(fsDir, renameReservedPathsOnUpgrade(
        setPermissionsOp.src, logVersion), setPermissionsOp.permissions);
  }

  private void applySetOwnerOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    SetOwnerOp setOwnerOp = (SetOwnerOp)op;
    FSDirAttrOp.unprotectedSetOwner(
        fsDir, renameReservedPathsOnUpgrade(setOwnerOp.src, logVersion),
        setOwnerOp.username, setOwnerOp.groupname);
  }

  private void applySetNSQuotaOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    SetNSQuotaOp setNSQuotaOp = (SetNSQuotaOp)op;
    FSDirAttrOp.unprotectedSetQuota(
        fsDir, renameReservedPathsOnUpgrade(setNSQuotaOp.src, logVersion),
        setNSQuotaOp.nsQuota, HdfsConstants.QUOTA_DONT_SET, null);
  }

  private void applyClearNSQuotaOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    ClearNSQuotaOp clearNSQuotaOp = (ClearNSQuotaOp)op;
    FSDirAttrOp.unprotectedSetQuota(
        fsDir, renameReservedPathsOnUpgrade(clearNSQuotaOp.src, logVersion),
        HdfsConstants.QUOTA_RESET, HdfsConstants.QUOTA_DONT_SET, null);
  }

  private void applySetQuotaOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    SetQuotaOp setQuotaOp = (SetQuotaOp) op;
    FSDirAttrOp.unprotectedSetQuota(fsDir,
        renameReservedPathsOnUpgrade(setQuotaOp.src, logVersion),
        setQuotaOp.nsQuota, setQuotaOp.dsQuota, null);
  }

  private void applySetQuotaByStorageTypeOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    FSEditLogOp.SetQuotaByStorageTypeOp setQuotaByStorageTypeOp =
      (FSEditLogOp.SetQuotaByStorageTypeOp) op;
    FSDirAttrOp.unprotectedSetQuota(fsDir,
      renameReservedPathsOnUpgrade(setQuotaByStorageTypeOp.src, logVersion),
      HdfsConstants.QUOTA_DONT_SET, setQuotaByStorageTypeOp.dsQuota,
      setQuotaByStorageTypeOp.type);
  }

  private void applyTimesOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    TimesOp timesOp = (TimesOp)op;
    FSDirAttrOp.unprotectedSetTimes(
        fsDir, renameReservedPathsOnUpgrade(timesOp.path, logVersion),
        timesOp.mtime, timesOp.atime, true);
  }

  private void applySymlinkOp(FSEditLogOp op, FSDirectory fsDir, int logVersion, long lastInodeId) throws IOException {
    if (!FileSystem.areSymlinksEnabled()) {
      throw new IOException("Symlinks not supported - please remove symlink before upgrading to this version of HDFS");
    }
    SymlinkOp symlinkOp = (SymlinkOp)op;
    long inodeId = getAndUpdateLastInodeId(symlinkOp.inodeId, logVersion,
        lastInodeId);
    final String path = renameReservedPathsOnUpgrade(symlinkOp.path,
        logVersion);
    final INodesInPath iip = fsDir.getINodesInPath(path, false);
    FSDirSymlinkOp.unprotectedAddSymlink(fsDir, iip.getExistingINodes(),
        iip.getLastLocalName(), inodeId, symlinkOp.value, symlinkOp.mtime,
        symlinkOp.atime, symlinkOp.permissionStatus);
    
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(symlinkOp.rpcClientId, symlinkOp.rpcCallId);
    }
  }

  private void applyRenameOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    RenameOp renameOp = (RenameOp)op;
    FSDirRenameOp.renameForEditLog(fsDir,
        renameReservedPathsOnUpgrade(renameOp.src, logVersion),
        renameReservedPathsOnUpgrade(renameOp.dst, logVersion),
        renameOp.timestamp, renameOp.options);
    
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
    }
  }

  private void applyGetDelegationTokenOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    GetDelegationTokenOp getDelegationTokenOp
      = (GetDelegationTokenOp)op;

    fsNamesys.getDelegationTokenSecretManager()
      .addPersistedDelegationToken(getDelegationTokenOp.token,
                                   getDelegationTokenOp.expiryTime);
  }

  private void applyRenewDelegationTokenOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    RenewDelegationTokenOp renewDelegationTokenOp
      = (RenewDelegationTokenOp)op;
    fsNamesys.getDelegationTokenSecretManager()
      .updatePersistedTokenRenewal(renewDelegationTokenOp.token,
                                   renewDelegationTokenOp.expiryTime);
  }

  private void applyCancelDelegationTokenOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    CancelDelegationTokenOp cancelDelegationTokenOp
      = (CancelDelegationTokenOp)op;
    fsNamesys.getDelegationTokenSecretManager()
        .updatePersistedTokenCancellation(
            cancelDelegationTokenOp.token);
  }

  private void applyUpdateMasterKeyOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    UpdateMasterKeyOp updateMasterKeyOp = (UpdateMasterKeyOp)op;
    fsNamesys.getDelegationTokenSecretManager()
      .updatePersistedMasterKey(updateMasterKeyOp.key);
  }

  private void applyReassignLeaseOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    ReassignLeaseOp reassignLeaseOp = (ReassignLeaseOp)op;

    Lease lease = fsNamesys.leaseManager.getLease(
        reassignLeaseOp.leaseHolder);
    final String path =
        renameReservedPathsOnUpgrade(reassignLeaseOp.path, logVersion);
    INodeFile pendingFile = fsDir.getINode(path).asFile();
    Preconditions.checkState(pendingFile.isUnderConstruction());
    fsNamesys.reassignLeaseInternal(lease,
        path, reassignLeaseOp.newHolder, pendingFile);
  }

  private void applyCreateSnapshotOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    CreateSnapshotOp createSnapshotOp = (CreateSnapshotOp) op;
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(createSnapshotOp.snapshotRoot,
            logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    String path = fsNamesys.getSnapshotManager().createSnapshot(iip,
        snapshotRoot, createSnapshotOp.snapshotName);
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntryWithPayload(createSnapshotOp.rpcClientId,
          createSnapshotOp.rpcCallId, path);
    }
  }

  private void applyDeleteSnapshotOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    DeleteSnapshotOp deleteSnapshotOp = (DeleteSnapshotOp) op;
    BlocksMapUpdateInfo collectedBlocks = new BlocksMapUpdateInfo();
    List<INode> removedINodes = new ChunkedArrayList<INode>();
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(deleteSnapshotOp.snapshotRoot,
            logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    fsNamesys.getSnapshotManager().deleteSnapshot(
        iip, deleteSnapshotOp.snapshotName,
        collectedBlocks, removedINodes);
    fsNamesys.removeBlocksAndUpdateSafemodeTotal(collectedBlocks);
    collectedBlocks.clear();
    fsNamesys.dir.removeFromInodeMap(removedINodes);
    removedINodes.clear();
    
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(deleteSnapshotOp.rpcClientId,
          deleteSnapshotOp.rpcCallId);
    }
  }

  private void applyRenameSnapshotOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    RenameSnapshotOp renameSnapshotOp = (RenameSnapshotOp) op;
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(renameSnapshotOp.snapshotRoot,
            logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    fsNamesys.getSnapshotManager().renameSnapshot(iip,
        snapshotRoot, renameSnapshotOp.snapshotOldName,
        renameSnapshotOp.snapshotNewName);
    
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(renameSnapshotOp.rpcClientId,
          renameSnapshotOp.rpcCallId);
    }
  }

  private void applyAllowSnapshotOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    AllowSnapshotOp allowSnapshotOp = (AllowSnapshotOp) op;
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(allowSnapshotOp.snapshotRoot, logVersion);
    fsNamesys.getSnapshotManager().setSnapshottable(
        snapshotRoot, false);
  }

  private void applyDisallowSnapshotOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    DisallowSnapshotOp disallowSnapshotOp = (DisallowSnapshotOp) op;
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(disallowSnapshotOp.snapshotRoot,
            logVersion);
    fsNamesys.getSnapshotManager().resetSnapshottable(
        snapshotRoot);
  }

  private void applySetGenstampV2Op(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    SetGenstampV2Op setGenstampV2Op = (SetGenstampV2Op) op;
    fsNamesys.getBlockIdManager().setGenerationStampV2(
        setGenstampV2Op.genStampV2);
  }

  private void applyAllocateBlockIdOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    AllocateBlockIdOp allocateBlockIdOp = (AllocateBlockIdOp) op;
    fsNamesys.getBlockIdManager().setLastAllocatedBlockId(
        allocateBlockIdOp.blockId);
  }

  private void applyRollingUpgradeStartOp(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt) throws IOException {
    if (startOpt == StartupOption.ROLLINGUPGRADE) {
      final RollingUpgradeStartupOption rollingUpgradeOpt
          = startOpt.getRollingUpgradeStartupOption(); 
      if (rollingUpgradeOpt == RollingUpgradeStartupOption.ROLLBACK) {
        throw new RollingUpgradeOp.RollbackException();
      } else if (rollingUpgradeOpt == RollingUpgradeStartupOption.DOWNGRADE) {
        //ignore upgrade marker
        return;
      }
    }
    // start rolling upgrade
    final long startTime = ((RollingUpgradeOp) op).getTime();
    fsNamesys.startRollingUpgradeInternal(startTime);
    fsNamesys.triggerRollbackCheckpoint();
  }

  private void applyRollingUpgradeFinalizeOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    final long finalizeTime = ((RollingUpgradeOp) op).getTime();
    if (fsNamesys.isRollingUpgrade()) {
      // Only do it when NN is actually doing rolling upgrade.
      // We can get FINALIZE without corresponding START, if NN is restarted
      // before this op is consumed and a new checkpoint is created.
      fsNamesys.finalizeRollingUpgradeInternal(finalizeTime);
    }
    fsNamesys.getFSImage().updateStorageVersion();
    fsNamesys.getFSImage().renameCheckpoint(NameNodeFile.IMAGE_ROLLBACK,
        NameNodeFile.IMAGE);
  }

  private void applyAddCacheDirectiveOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    AddCacheDirectiveInfoOp addOp = (AddCacheDirectiveInfoOp) op;
    CacheDirectiveInfo result = fsNamesys.
        getCacheManager().addDirectiveFromEditLog(addOp.directive);
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      Long id = result.getId();
      fsNamesys.addCacheEntryWithPayload(op.rpcClientId, op.rpcCallId, id);
    }
  }

  private void applyModifyCacheDirectiveOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    ModifyCacheDirectiveInfoOp modifyOp =
        (ModifyCacheDirectiveInfoOp) op;
    fsNamesys.getCacheManager().modifyDirectiveFromEditLog(
        modifyOp.directive);
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applyRemoveCacheDirectiveOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    RemoveCacheDirectiveInfoOp removeOp =
        (RemoveCacheDirectiveInfoOp) op;
    fsNamesys.getCacheManager().removeDirective(removeOp.id, null);
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applyAddCachePoolOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    AddCachePoolOp addOp = (AddCachePoolOp) op;
    fsNamesys.getCacheManager().addCachePool(addOp.info);
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applyModifyCachePoolOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    ModifyCachePoolOp modifyOp = (ModifyCachePoolOp) op;
    fsNamesys.getCacheManager().modifyCachePool(modifyOp.info);
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applyRemoveCachePoolOp(FSEditLogOp op, FSDirectory fsDir) throws IOException {
    RemoveCachePoolOp removeOp = (RemoveCachePoolOp) op;
    fsNamesys.getCacheManager().removeCachePool(removeOp.poolName);
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applySetAclOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    SetAclOp setAclOp = (SetAclOp) op;
    FSDirAclOp.unprotectedSetAcl(fsDir, setAclOp.src, setAclOp.aclEntries,
        true);
  }

  private void applySetXAttrOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    SetXAttrOp setXAttrOp = (SetXAttrOp) op;
    FSDirXAttrOp.unprotectedSetXAttrs(fsDir, setXAttrOp.src,
                                    setXAttrOp.xAttrs,
                                    EnumSet.of(XAttrSetFlag.CREATE,
                                               XAttrSetFlag.REPLACE));
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(setXAttrOp.rpcClientId, setXAttrOp.rpcCallId);
    }
  }

  private void applyRemoveXAttrOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    RemoveXAttrOp removeXAttrOp = (RemoveXAttrOp) op;
    FSDirXAttrOp.unprotectedRemoveXAttrs(fsDir, removeXAttrOp.src,
                                       removeXAttrOp.xAttrs);
    if (fsNamesys.hasRetryCache() && op.hasRpcIds()) {
      fsNamesys.addCacheEntry(removeXAttrOp.rpcClientId,
          removeXAttrOp.rpcCallId);
    }
  }

  private void applyTruncateOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    TruncateOp truncateOp = (TruncateOp) op;
    fsDir.unprotectedTruncate(truncateOp.src, truncateOp.clientName,
        truncateOp.clientMachine, truncateOp.newLength, truncateOp.timestamp,
        truncateOp.truncateBlock);
  }

  private void applySetStoragePolicyOp(FSEditLogOp op, FSDirectory fsDir, int logVersion) throws IOException {
    SetStoragePolicyOp setStoragePolicyOp = (SetStoragePolicyOp) op;
    final String path = renameReservedPathsOnUpgrade(setStoragePolicyOp.path,
        logVersion);
    final INodesInPath iip = fsDir.getINodesInPath4Write(path);
    FSDirAttrOp.unprotectedSetStoragePolicy(
        fsDir, fsNamesys.getBlockManager(), iip,
        setStoragePolicyOp.policyId);
  }