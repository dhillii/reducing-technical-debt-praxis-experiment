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
    if (LOG.isTraceEnabled()) {
      LOG.trace("replaying edit log: " + op);
    }
    final boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();

    switch (op.opCode) {
    case OP_ADD: {
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
        inodeId = getAndUpdateLastInodeId(addCloseOp.inodeId, logVersion, lastInodeId);
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
        if (toAddRetryCache) {
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
          if (toAddRetryCache) {
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
      break;
    }
    case OP_CLOSE: {
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
      break;
    }
    case OP_APPEND: {
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
        if (toAddRetryCache) {
          HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
              fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, file,
              BlockStoragePolicySuite.ID_UNSPECIFIED,
              Snapshot.CURRENT_STATE_ID, false, iip);
          fsNamesys.addCacheEntryWithPayload(appendOp.rpcClientId,
              appendOp.rpcCallId, new LastBlockWithStatus(lb, stat));
        }
      }
      break;
    }
    case OP_UPDATE_BLOCKS: {
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
      
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(updateOp.rpcClientId, updateOp.rpcCallId);
      }
      break;
    }
    case OP_ADD_BLOCK: {
      AddBlockOp addBlockOp = (AddBlockOp) op;
      String path = renameReservedPathsOnUpgrade(addBlockOp.getPath(), logVersion);
      if (FSNamesystem.LOG.isDebugEnabled()) {
        FSNamesystem.LOG.debug(op.opCode + ": " + path +
            " new block id : " + addBlockOp.getLastBlock().getBlockId());
      }
      INodeFile oldFile = INodeFile.valueOf(fsDir.getINode(path), path);
      // add the new block to the INodeFile
      addNewBlock(fsDir, addBlockOp, oldFile);
      break;
    }
    case OP_SET_REPLICATION: {
      SetReplicationOp setReplicationOp = (SetReplicationOp)op;
      short replication = fsNamesys.getBlockManager().adjustReplication(
          setReplicationOp.replication);
      FSDirAttrOp.unprotectedSetReplication(fsDir, renameReservedPathsOnUpgrade(
          setReplicationOp.path, logVersion), replication, null);
      break;
    }
    case OP_CONCAT_DELETE: {
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
      
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(concatDeleteOp.rpcClientId,
            concatDeleteOp.rpcCallId);
      }
      break;
    }
    case OP_RENAME_OLD: {
      RenameOldOp renameOp = (RenameOldOp)op;
      final String src = renameReservedPathsOnUpgrade(renameOp.src, logVersion);
      final String dst = renameReservedPathsOnUpgrade(renameOp.dst, logVersion);
      FSDirRenameOp.renameForEditLog(fsDir, src, dst, renameOp.timestamp);
      
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
      }
      break;
    }
    case OP_DELETE: {
      DeleteOp deleteOp = (DeleteOp)op;
      FSDirDeleteOp.deleteForEditLog(
          fsDir, renameReservedPathsOnUpgrade(deleteOp.path, logVersion),
          deleteOp.timestamp);
      
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(deleteOp.rpcClientId, deleteOp.rpcCallId);
      }
      break;
    }
    case OP_MKDIR: {
      MkdirOp mkdirOp = (MkdirOp)op;
      inodeId = getAndUpdateLastInodeId(mkdirOp.inodeId, logVersion,
          lastInodeId);
      FSDirMkdirOp.mkdirForEditLog(fsDir, inodeId,
          renameReservedPathsOnUpgrade(mkdirOp.path, logVersion),
          mkdirOp.permissions, mkdirOp.aclEntries, mkdirOp.timestamp);
      break;
    }
    case OP_SET_GENSTAMP_V1: {
      SetGenstampV1Op setGenstampV1Op = (SetGenstampV1Op)op;
      fsNamesys.getBlockIdManager().setGenerationStampV1(
          setGenstampV1Op.genStampV1);
      break;
    }
    case OP_SET_PERMISSIONS: {
      SetPermissionsOp setPermissionsOp = (SetPermissionsOp)op;
      FSDirAttrOp.unprotectedSetPermission(fsDir, renameReservedPathsOnUpgrade(
          setPermissionsOp.src, logVersion), setPermissionsOp.permissions);
      break;
    }
    case OP_SET_OWNER: {
      SetOwnerOp setOwnerOp = (SetOwnerOp)op;
      FSDirAttrOp.unprotectedSetOwner(
          fsDir, renameReservedPathsOnUpgrade(setOwnerOp.src, logVersion),
          setOwnerOp.username, setOwnerOp.groupname);
      break;
    }
    case OP_SET_NS_QUOTA: {
      SetNSQuotaOp setNSQuotaOp = (SetNSQuotaOp)op;
      FSDirAttrOp.unprotectedSetQuota(
          fsDir, renameReservedPathsOnUpgrade(setNSQuotaOp.src, logVersion),
          setNSQuotaOp.nsQuota, HdfsConstants.QUOTA_DONT_SET, null);
      break;
    }
    case OP_CLEAR_NS_QUOTA: {
      ClearNSQuotaOp clearNSQuotaOp = (ClearNSQuotaOp)op;
      FSDirAttrOp.unprotectedSetQuota(
          fsDir, renameReservedPathsOnUpgrade(clearNSQuotaOp.src, logVersion),
          HdfsConstants.QUOTA_RESET, HdfsConstants.QUOTA_DONT_SET, null);
      break;
    }

    case OP_SET_QUOTA:
      SetQuotaOp setQuotaOp = (SetQuotaOp) op;
      FSDirAttrOp.unprotectedSetQuota(fsDir,
          renameReservedPathsOnUpgrade(setQuotaOp.src, logVersion),
          setQuotaOp.nsQuota, setQuotaOp.dsQuota, null);
      break;

    case OP_SET_QUOTA_BY_STORAGETYPE:
        FSEditLogOp.SetQuotaByStorageTypeOp setQuotaByStorageTypeOp =
          (FSEditLogOp.SetQuotaByStorageTypeOp) op;
        FSDirAttrOp.unprotectedSetQuota(fsDir,
          renameReservedPathsOnUpgrade(setQuotaByStorageTypeOp.src, logVersion),
          HdfsConstants.QUOTA_DONT_SET, setQuotaByStorageTypeOp.dsQuota,
          setQuotaByStorageTypeOp.type);
        break;

    case OP_TIMES: {
      TimesOp timesOp = (TimesOp)op;
      FSDirAttrOp.unprotectedSetTimes(
          fsDir, renameReservedPathsOnUpgrade(timesOp.path, logVersion),
          timesOp.mtime, timesOp.atime, true);
      break;
    }
    case OP_SYMLINK: {
      if (!FileSystem.areSymlinksEnabled()) {
        throw new IOException("Symlinks not supported - please remove symlink before upgrading to this version of HDFS");
      }
      SymlinkOp symlinkOp = (SymlinkOp)op;
      inodeId = getAndUpdateLastInodeId(symlinkOp.inodeId, logVersion,
          lastInodeId);
      final String path = renameReservedPathsOnUpgrade(symlinkOp.path,
          logVersion);
      final INodesInPath iip = fsDir.getINodesInPath(path, false);
      FSDirSymlinkOp.unprotectedAddSymlink(fsDir, iip.getExistingINodes(),
          iip.getLastLocalName(), inodeId, symlinkOp.value, symlinkOp.mtime,
          symlinkOp.atime, symlinkOp.permissionStatus);
      
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(symlinkOp.rpcClientId, symlinkOp.rpcCallId);
      }
      break;
    }
    case OP_RENAME: {
      RenameOp renameOp = (RenameOp)op;
      FSDirRenameOp.renameForEditLog(fsDir,
          renameReservedPathsOnUpgrade(renameOp.src, logVersion),
          renameReservedPathsOnUpgrade(renameOp.dst, logVersion),
          renameOp.timestamp, renameOp.options);
      
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
      }
      break;
    }
    case OP_GET_DELEGATION_TOKEN: {
      GetDelegationTokenOp getDelegationTokenOp
        = (GetDelegationTokenOp)op;

      fsNamesys.getDelegationTokenSecretManager()
        .addPersistedDelegationToken(getDelegationTokenOp.token,
                                     getDelegationTokenOp.expiryTime);
      break;
    }
    case OP_RENEW_DELEGATION_TOKEN: {
      RenewDelegationTokenOp renewDelegationTokenOp
        = (RenewDelegationTokenOp)op;
      fsNamesys.getDelegationTokenSecretManager()
        .updatePersistedTokenRenewal(renewDelegationTokenOp.token,
                                     renewDelegationTokenOp.expiryTime);
      break;
    }
    case OP_CANCEL_DELEGATION_TOKEN: {
      CancelDelegationTokenOp cancelDelegationTokenOp
        = (CancelDelegationTokenOp)op;
      fsNamesys.getDelegationTokenSecretManager()
          .updatePersistedTokenCancellation(
              cancelDelegationTokenOp.token);
      break;
    }
    case OP_UPDATE_MASTER_KEY: {
      UpdateMasterKeyOp updateMasterKeyOp = (UpdateMasterKeyOp)op;
      fsNamesys.getDelegationTokenSecretManager()
        .updatePersistedMasterKey(updateMasterKeyOp.key);
      break;
    }
    case OP_REASSIGN_LEASE: {
      ReassignLeaseOp reassignLeaseOp = (ReassignLeaseOp)op;

      Lease lease = fsNamesys.leaseManager.getLease(
          reassignLeaseOp.leaseHolder);
      final String path =
          renameReservedPathsOnUpgrade(reassignLeaseOp.path, logVersion);
      INodeFile pendingFile = fsDir.getINode(path).asFile();
      Preconditions.checkState(pendingFile.isUnderConstruction());
      fsNamesys.reassignLeaseInternal(lease,
          path, reassignLeaseOp.newHolder, pendingFile);
      break;
    }
    case OP_START_LOG_SEGMENT:
    case OP_END_LOG_SEGMENT: {
      // no data in here currently.
      break;
    }
    case OP_CREATE_SNAPSHOT: {
      CreateSnapshotOp createSnapshotOp = (CreateSnapshotOp) op;
      final String snapshotRoot =
          renameReservedPathsOnUpgrade(createSnapshotOp.snapshotRoot,
              logVersion);
      INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
      String path = fsNamesys.getSnapshotManager().createSnapshot(iip,
          snapshotRoot, createSnapshotOp.snapshotName);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntryWithPayload(createSnapshotOp.rpcClientId,
            createSnapshotOp.rpcCallId, path);
      }
      break;
    }
    case OP_DELETE_SNAPSHOT: {
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
      
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(deleteSnapshotOp.rpcClientId,
            deleteSnapshotOp.rpcCallId);
      }
      break;
    }
    case OP_RENAME_SNAPSHOT: {
      RenameSnapshotOp renameSnapshotOp = (RenameSnapshotOp) op;
      final String snapshotRoot =
          renameReservedPathsOnUpgrade(renameSnapshotOp.snapshotRoot,
              logVersion);
      INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
      fsNamesys.getSnapshotManager().renameSnapshot(iip,
          snapshotRoot, renameSnapshotOp.snapshotOldName,
          renameSnapshotOp.snapshotNewName);
      
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(renameSnapshotOp.rpcClientId,
            renameSnapshotOp.rpcCallId);
      }
      break;
    }
    case OP_ALLOW_SNAPSHOT: {
      AllowSnapshotOp allowSnapshotOp = (AllowSnapshotOp) op;
      final String snapshotRoot =
          renameReservedPathsOnUpgrade(allowSnapshotOp.snapshotRoot, logVersion);
      fsNamesys.getSnapshotManager().setSnapshottable(
          snapshotRoot, false);
      break;
    }
    case OP_DISALLOW_SNAPSHOT: {
      DisallowSnapshotOp disallowSnapshotOp = (DisallowSnapshotOp) op;
      final String snapshotRoot =
          renameReservedPathsOnUpgrade(disallowSnapshotOp.snapshotRoot,
              logVersion);
      fsNamesys.getSnapshotManager().resetSnapshottable(
          snapshotRoot);
      break;
    }
    case OP_SET_GENSTAMP_V2: {
      SetGenstampV2Op setGenstampV2Op = (SetGenstampV2Op) op;
      fsNamesys.getBlockIdManager().setGenerationStampV2(
          setGenstampV2Op.genStampV2);
      break;
    }
    case OP_ALLOCATE_BLOCK_ID: {
      AllocateBlockIdOp allocateBlockIdOp = (AllocateBlockIdOp) op;
      fsNamesys.getBlockIdManager().setLastAllocatedBlockId(
          allocateBlockIdOp.blockId);
      break;
    }
    case OP_ROLLING_UPGRADE_START: {
      if (startOpt == StartupOption.ROLLINGUPGRADE) {
        final RollingUpgradeStartupOption rollingUpgradeOpt
            = startOpt.getRollingUpgradeStartupOption(); 
        if (rollingUpgradeOpt == RollingUpgradeStartupOption.ROLLBACK) {
          throw new RollingUpgradeOp.RollbackException();
        } else if (rollingUpgradeOpt == RollingUpgradeStartupOption.DOWNGRADE) {
          //ignore upgrade marker
          break;
        }
      }
      // start rolling upgrade
      final long startTime = ((RollingUpgradeOp) op).getTime();
      fsNamesys.startRollingUpgradeInternal(startTime);
      fsNamesys.triggerRollbackCheckpoint();
      break;
    }
    case OP_ROLLING_UPGRADE_FINALIZE: {
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
      break;
    }
    case OP_ADD_CACHE_DIRECTIVE: {
      AddCacheDirectiveInfoOp addOp = (AddCacheDirectiveInfoOp) op;
      CacheDirectiveInfo result = fsNamesys.
          getCacheManager().addDirectiveFromEditLog(addOp.directive);
      if (toAddRetryCache) {
        Long id = result.getId();
        fsNamesys.addCacheEntryWithPayload(op.rpcClientId, op.rpcCallId, id);
      }
      break;
    }
    case OP_MODIFY_CACHE_DIRECTIVE: {
      ModifyCacheDirectiveInfoOp modifyOp =
          (ModifyCacheDirectiveInfoOp) op;
      fsNamesys.getCacheManager().modifyDirectiveFromEditLog(
          modifyOp.directive);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      break;
    }
    case OP_REMOVE_CACHE_DIRECTIVE: {
      RemoveCacheDirectiveInfoOp removeOp =
          (RemoveCacheDirectiveInfoOp) op;
      fsNamesys.getCacheManager().removeDirective(removeOp.id, null);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      break;
    }
    case OP_ADD_CACHE_POOL: {
      AddCachePoolOp addOp = (AddCachePoolOp) op;
      fsNamesys.getCacheManager().addCachePool(addOp.info);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      break;
    }
    case OP_MODIFY_CACHE_POOL: {
      ModifyCachePoolOp modifyOp = (ModifyCachePoolOp) op;
      fsNamesys.getCacheManager().modifyCachePool(modifyOp.info);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      break;
    }
    case OP_REMOVE_CACHE_POOL: {
      RemoveCachePoolOp removeOp = (RemoveCachePoolOp) op;
      fsNamesys.getCacheManager().removeCachePool(removeOp.poolName);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      break;
    }
    case OP_SET_ACL: {
      SetAclOp setAclOp = (SetAclOp) op;
      FSDirAclOp.unprotectedSetAcl(fsDir, setAclOp.src, setAclOp.aclEntries,
          true);
      break;
    }
    case OP_SET_XATTR: {
      SetXAttrOp setXAttrOp = (SetXAttrOp) op;
      FSDirXAttrOp.unprotectedSetXAttrs(fsDir, setXAttrOp.src,
                                        setXAttrOp.xAttrs,
                                        EnumSet.of(XAttrSetFlag.CREATE,
                                                   XAttrSetFlag.REPLACE));
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(setXAttrOp.rpcClientId, setXAttrOp.rpcCallId);
      }
      break;
    }
    case OP_REMOVE_XATTR: {
      RemoveXAttrOp removeXAttrOp = (RemoveXAttrOp) op;
      FSDirXAttrOp.unprotectedRemoveXAttrs(fsDir, removeXAttrOp.src,
                                           removeXAttrOp.xAttrs);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(removeXAttrOp.rpcClientId,
            removeXAttrOp.rpcCallId);
      }
      break;
    }
    case OP_TRUNCATE: {
      TruncateOp truncateOp = (TruncateOp) op;
      fsDir.unprotectedTruncate(truncateOp.src, truncateOp.clientName,
          truncateOp.clientMachine, truncateOp.newLength, truncateOp.timestamp,
          truncateOp.truncateBlock);
      break;
    }
    case OP_SET_STORAGE_POLICY: {
      SetStoragePolicyOp setStoragePolicyOp = (SetStoragePolicyOp) op;
      final String path = renameReservedPathsOnUpgrade(setStoragePolicyOp.path,
          logVersion);
      final INodesInPath iip = fsDir.getINodesInPath4Write(path);
      FSDirAttrOp.unprotectedSetStoragePolicy(
          fsDir, fsNamesys.getBlockManager(), iip,
          setStoragePolicyOp.policyId);
      break;
    }
    default:
      throw new IOException("Invalid operation read " + op.opCode);
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