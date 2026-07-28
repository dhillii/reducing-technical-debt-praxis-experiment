private long applyEditLogOp(FSEditLogOp op, FSDirectory fsDir,
      StartupOption startOpt, int logVersion, long lastInodeId) throws IOException {
    long inodeId = INodeId.GRANDFATHER_INODE_ID;
    if (LOG.isTraceEnabled()) {
      LOG.trace("replaying edit log: " + op);
    }
    final boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();

    EditLogOpHandler handler = EditLogOpHandlers.getHandler(op.opCode);
    if (handler == null) {
      throw new IOException("Invalid operation read " + op.opCode);
    }
    return handler.apply(op, fsDir, startOpt, logVersion, lastInodeId, toAddRetryCache);
  }

  private interface EditLogOpHandler {
    long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException;
  }

  private static class EditLogOpHandlers {
    private static final EnumMap<FSEditLogOpCodes, EditLogOpHandler> handlers =
        new EnumMap<FSEditLogOpCodes, EditLogOpHandler>(FSEditLogOpCodes.class) {
          {
            put(OP_ADD, new AddOpHandler());
            put(OP_CLOSE, new CloseOpHandler());
            put(OP_APPEND, new AppendOpHandler());
            put(OP_UPDATE_BLOCKS, new UpdateBlocksOpHandler());
            put(OP_ADD_BLOCK, new AddBlockOpHandler());
            put(OP_SET_REPLICATION, new SetReplicationOpHandler());
            put(OP_CONCAT_DELETE, new ConcatDeleteOpHandler());
            put(OP_RENAME_OLD, new RenameOldOpHandler());
            put(OP_DELETE, new DeleteOpHandler());
            put(OP_MKDIR, new MkdirOpHandler());
            put(OP_SET_GENSTAMP_V1, new SetGenstampV1OpHandler());
            put(OP_SET_PERMISSIONS, new SetPermissionsOpHandler());
            put(OP_SET_OWNER, new SetOwnerOpHandler());
            put(OP_SET_NS_QUOTA, new SetNSQuotaOpHandler());
            put(OP_CLEAR_NS_QUOTA, new ClearNSQuotaOpHandler());
            put(OP_SET_QUOTA, new SetQuotaOpHandler());
            put(OP_SET_QUOTA_BY_STORAGETYPE, new SetQuotaByStorageTypeOpHandler());
            put(OP_TIMES, new TimesOpHandler());
            put(OP_SYMLINK, new SymlinkOpHandler());
            put(OP_RENAME, new RenameOpHandler());
            put(OP_GET_DELEGATION_TOKEN, new GetDelegationTokenOpHandler());
            put(OP_RENEW_DELEGATION_TOKEN, new RenewDelegationTokenOpHandler());
            put(OP_CANCEL_DELEGATION_TOKEN, new CancelDelegationTokenOpHandler());
            put(OP_UPDATE_MASTER_KEY, new UpdateMasterKeyOpHandler());
            put(OP_REASSIGN_LEASE, new ReassignLeaseOpHandler());
            put(OP_START_LOG_SEGMENT, new StartLogSegmentOpHandler());
            put(OP_END_LOG_SEGMENT, new EndLogSegmentOpHandler());
            put(OP_CREATE_SNAPSHOT, new CreateSnapshotOpHandler());
            put(OP_DELETE_SNAPSHOT, new DeleteSnapshotOpHandler());
            put(OP_RENAME_SNAPSHOT, new RenameSnapshotOpHandler());
            put(OP_ALLOW_SNAPSHOT, new AllowSnapshotOpHandler());
            put(OP_DISALLOW_SNAPSHOT, new DisallowSnapshotOpHandler());
            put(OP_SET_GENSTAMP_V2, new SetGenstampV2OpHandler());
            put(OP_ALLOCATE_BLOCK_ID, new AllocateBlockIdOpHandler());
            put(OP_ROLLING_UPGRADE_START, new RollingUpgradeStartOpHandler());
            put(OP_ROLLING_UPGRADE_FINALIZE, new RollingUpgradeFinalizeOpHandler());
            put(OP_ADD_CACHE_DIRECTIVE, new AddCacheDirectiveOpHandler());
            put(OP_MODIFY_CACHE_DIRECTIVE, new ModifyCacheDirectiveOpHandler());
            put(OP_REMOVE_CACHE_DIRECTIVE, new RemoveCacheDirectiveOpHandler());
            put(OP_ADD_CACHE_POOL, new AddCachePoolOpHandler());
            put(OP_MODIFY_CACHE_POOL, new ModifyCachePoolOpHandler());
            put(OP_REMOVE_CACHE_POOL, new RemoveCachePoolOpHandler());
            put(OP_SET_ACL, new SetAclOpHandler());
            put(OP_SET_XATTR, new SetXAttrOpHandler());
            put(OP_REMOVE_XATTR, new RemoveXAttrOpHandler());
            put(OP_TRUNCATE, new TruncateOpHandler());
            put(OP_SET_STORAGE_POLICY, new SetStoragePolicyOpHandler());
          }
        };

    static EditLogOpHandler getHandler(FSEditLogOpCodes opCode) {
      return handlers.get(opCode);
    }
  }

  private static class AddOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      AddCloseOp addCloseOp = (AddCloseOp) op;
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
      return inodeId;
    }
  }

  private static class CloseOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      AddCloseOp addCloseOp = (AddCloseOp) op;
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
      return 0;
    }
  }

  // ... other handlers ...

  private static class SetStoragePolicyOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetStoragePolicyOp setStoragePolicyOp = (SetStoragePolicyOp) op;
      final String path =
          renameReservedPathsOnUpgrade(setStoragePolicyOp.path, logVersion);
      final INodesInPath iip = fsDir.getINodesInPath4Write(path);
      FSDirAttrOp.unprotectedSetStoragePolicy(
          fsDir, fsNamesys.getBlockManager(), iip,
          setStoragePolicyOp.policyId);
      return 0;
    }
  }