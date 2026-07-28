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
    private static final EnumMap<FSEditLogOpCodes, EditLogOpHandler> HANDLERS =
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
      return HANDLERS.get(opCode);
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
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class UpdateBlocksOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      UpdateBlocksOp updateOp = (UpdateBlocksOp) op;
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
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class AddBlockOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      AddBlockOp addBlockOp = (AddBlockOp) op;
      String path = renameReservedPathsOnUpgrade(addBlockOp.getPath(), logVersion);
      if (FSNamesystem.LOG.isDebugEnabled()) {
        FSNamesystem.LOG.debug(op.opCode + ": " + path +
            " new block id : " + addBlockOp.getLastBlock().getBlockId());
      }
      INodeFile oldFile = INodeFile.valueOf(fsDir.getINode(path), path);
      // add the new block to the INodeFile
      addNewBlock(fsDir, addBlockOp, oldFile);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class SetReplicationOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetReplicationOp setReplicationOp = (SetReplicationOp) op;
      short replication = fsNamesys.getBlockManager().adjustReplication(
          setReplicationOp.replication);
      FSDirAttrOp.unprotectedSetReplication(fsDir, renameReservedPathsOnUpgrade(
          setReplicationOp.path, logVersion), replication, null);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class ConcatDeleteOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      ConcatDeleteOp concatDeleteOp = (ConcatDeleteOp) op;
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
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class RenameOldOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      RenameOldOp renameOp = (RenameOldOp) op;
      final String src = renameReservedPathsOnUpgrade(renameOp.src, logVersion);
      final String dst = renameReservedPathsOnUpgrade(renameOp.dst, logVersion);
      FSDirRenameOp.renameForEditLog(fsDir, src, dst, renameOp.timestamp);
      
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class DeleteOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      DeleteOp deleteOp = (DeleteOp) op;
      FSDirDeleteOp.deleteForEditLog(
          fsDir, renameReservedPathsOnUpgrade(deleteOp.path, logVersion),
          deleteOp.timestamp);
      
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(deleteOp.rpcClientId, deleteOp.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class MkdirOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      MkdirOp mkdirOp = (MkdirOp) op;
      long inodeId = getAndUpdateLastInodeId(mkdirOp.inodeId, logVersion,
          lastInodeId);
      FSDirMkdirOp.mkdirForEditLog(fsDir, inodeId,
          renameReservedPathsOnUpgrade(mkdirOp.path, logVersion),
          mkdirOp.permissions, mkdirOp.aclEntries, mkdirOp.timestamp);
      return inodeId;
    }
  }

  // ... other handlers ...

  private static class SetGenstampV1OpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetGenstampV1Op setGenstampV1Op = (SetGenstampV1Op) op;
      fsNamesys.getBlockIdManager().setGenerationStampV1(
          setGenstampV1Op.genStampV1);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class SetPermissionsOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetPermissionsOp setPermissionsOp = (SetPermissionsOp) op;
      FSDirAttrOp.unprotectedSetPermission(fsDir, renameReservedPathsOnUpgrade(
          setPermissionsOp.src, logVersion), setPermissionsOp.permissions);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class SetOwnerOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetOwnerOp setOwnerOp = (SetOwnerOp) op;
      FSDirAttrOp.unprotectedSetOwner(
          fsDir, renameReservedPathsOnUpgrade(setOwnerOp.src, logVersion),
          setOwnerOp.username, setOwnerOp.groupname);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class SetNSQuotaOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetNSQuotaOp setNSQuotaOp = (SetNSQuotaOp) op;
      FSDirAttrOp.unprotectedSetQuota(
          fsDir, renameReservedPathsOnUpgrade(setNSQuotaOp.src, logVersion),
          setNSQuotaOp.nsQuota, HdfsConstants.QUOTA_DONT_SET, null);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class ClearNSQuotaOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      ClearNSQuotaOp clearNSQuotaOp = (ClearNSQuotaOp) op;
      FSDirAttrOp.unprotectedSetQuota(
          fsDir, renameReservedPathsOnUpgrade(clearNSQuotaOp.src, logVersion),
          HdfsConstants.QUOTA_RESET, HdfsConstants.QUOTA_DONT_SET, null);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class SetQuotaOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetQuotaOp setQuotaOp = (SetQuotaOp) op;
      FSDirAttrOp.unprotectedSetQuota(fsDir,
          renameReservedPathsOnUpgrade(setQuotaOp.src, logVersion),
          setQuotaOp.nsQuota, setQuotaOp.dsQuota, null);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class SetQuotaByStorageTypeOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetQuotaByStorageTypeOp setQuotaByStorageTypeOp =
          (SetQuotaByStorageTypeOp) op;
      FSDirAttrOp.unprotectedSetQuota(fsDir,
          renameReservedPathsOnUpgrade(setQuotaByStorageTypeOp.src, logVersion),
          HdfsConstants.QUOTA_DONT_SET, setQuotaByStorageTypeOp.dsQuota,
          setQuotaByStorageTypeOp.type);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class TimesOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      TimesOp timesOp = (TimesOp) op;
      FSDirAttrOp.unprotectedSetTimes(
          fsDir, renameReservedPathsOnUpgrade(timesOp.path, logVersion),
          timesOp.mtime, timesOp.atime, true);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class SymlinkOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SymlinkOp symlinkOp = (SymlinkOp) op;
      if (!FileSystem.areSymlinksEnabled()) {
        throw new IOException("Symlinks not supported - please remove symlink before upgrading to this version of HDFS");
      }
      long inodeId = getAndUpdateLastInodeId(symlinkOp.inodeId, logVersion,
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
      return inodeId;
    }
  }

  // ... other handlers ...

  private static class RenameOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      RenameOp renameOp = (RenameOp) op;
      FSDirRenameOp.renameForEditLog(fsDir,
          renameReservedPathsOnUpgrade(renameOp.src, logVersion),
          renameReservedPathsOnUpgrade(renameOp.dst, logVersion),
          renameOp.timestamp, renameOp.options);
      
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class GetDelegationTokenOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      GetDelegationTokenOp getDelegationTokenOp
        = (GetDelegationTokenOp)op;

      fsNamesys.getDelegationTokenSecretManager()
        .addPersistedDelegationToken(getDelegationTokenOp.token,
                                     getDelegationTokenOp.expiryTime);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class RenewDelegationTokenOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      RenewDelegationTokenOp renewDelegationTokenOp
        = (RenewDelegationTokenOp)op;
      fsNamesys.getDelegationTokenSecretManager()
        .updatePersistedTokenRenewal(renewDelegationTokenOp.token,
                                     renewDelegationTokenOp.expiryTime);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class CancelDelegationTokenOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      CancelDelegationTokenOp cancelDelegationTokenOp
        = (CancelDelegationTokenOp)op;
      fsNamesys.getDelegationTokenSecretManager()
          .updatePersistedTokenCancellation(
              cancelDelegationTokenOp.token);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class UpdateMasterKeyOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      UpdateMasterKeyOp updateMasterKeyOp = (UpdateMasterKeyOp) op;
      fsNamesys.getDelegationTokenSecretManager()
        .updatePersistedMasterKey(updateMasterKeyOp.key);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class ReassignLeaseOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      ReassignLeaseOp reassignLeaseOp = (ReassignLeaseOp) op;

      Lease lease = fsNamesys.leaseManager.getLease(
          reassignLeaseOp.leaseHolder);
      final String path =
          renameReservedPathsOnUpgrade(reassignLeaseOp.path, logVersion);
      INodeFile pendingFile = fsDir.getINode(path).asFile();
      Preconditions.checkState(pendingFile.isUnderConstruction());
      fsNamesys.reassignLeaseInternal(lease,
          path, reassignLeaseOp.newHolder, pendingFile);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class StartLogSegmentOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      // no data in here currently.
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class EndLogSegmentOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      // no data in here currently.
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class CreateSnapshotOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
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
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class DeleteSnapshotOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
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
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class RenameSnapshotOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
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
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class AllowSnapshotOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      AllowSnapshotOp allowSnapshotOp = (AllowSnapshotOp) op;
      final String snapshotRoot =
          renameReservedPathsOnUpgrade(allowSnapshotOp.snapshotRoot, logVersion);
      fsNamesys.getSnapshotManager().setSnapshottable(
          snapshotRoot, false);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class DisallowSnapshotOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      DisallowSnapshotOp disallowSnapshotOp = (DisallowSnapshotOp) op;
      final String snapshotRoot =
          renameReservedPathsOnUpgrade(disallowSnapshotOp.snapshotRoot,
              logVersion);
      fsNamesys.getSnapshotManager().resetSnapshottable(
          snapshotRoot);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class SetGenstampV2OpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetGenstampV2Op setGenstampV2Op = (SetGenstampV2Op) op;
      fsNamesys.getBlockIdManager().setGenerationStampV2(
          setGenstampV2Op.genStampV2);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class AllocateBlockIdOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      AllocateBlockIdOp allocateBlockIdOp = (AllocateBlockIdOp) op;
      fsNamesys.getBlockIdManager().setLastAllocatedBlockId(
          allocateBlockIdOp.blockId);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class RollingUpgradeStartOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      if (startOpt == StartupOption.ROLLINGUPGRADE) {
        final RollingUpgradeStartupOption rollingUpgradeOpt
            = startOpt.getRollingUpgradeStartupOption(); 
        if (rollingUpgradeOpt == RollingUpgradeStartupOption.ROLLBACK) {
          throw new RollingUpgradeOp.RollbackException();
        } else if (rollingUpgradeOpt == RollingUpgradeStartupOption.DOWNGRADE) {
          //ignore upgrade marker
          return INodeId.GRANDFATHER_INODE_ID;
        }
      }
      // start rolling upgrade
      final long startTime = ((RollingUpgradeOp) op).getTime();
      fsNamesys.startRollingUpgradeInternal(startTime);
      fsNamesys.triggerRollbackCheckpoint();
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class RollingUpgradeFinalizeOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
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
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class AddCacheDirectiveOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      AddCacheDirectiveInfoOp addOp = (AddCacheDirectiveInfoOp) op;
      CacheDirectiveInfo result = fsNamesys.
          getCacheManager().addDirectiveFromEditLog(addOp.directive);
      if (toAddRetryCache) {
        Long id = result.getId();
        fsNamesys.addCacheEntryWithPayload(op.rpcClientId, op.rpcCallId, id);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class ModifyCacheDirectiveOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      ModifyCacheDirectiveInfoOp modifyOp =
          (ModifyCacheDirectiveInfoOp) op;
      fsNamesys.getCacheManager().modifyDirectiveFromEditLog(
          modifyOp.directive);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class RemoveCacheDirectiveOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      RemoveCacheDirectiveInfoOp removeOp =
          (RemoveCacheDirectiveInfoOp) op;
      fsNamesys.getCacheManager().removeDirective(removeOp.id, null);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class AddCachePoolOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      AddCachePoolOp addOp = (AddCachePoolOp) op;
      fsNamesys.getCacheManager().addCachePool(addOp.info);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class ModifyCachePoolOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      ModifyCachePoolOp modifyOp = (ModifyCachePoolOp) op;
      fsNamesys.getCacheManager().modifyCachePool(modifyOp.info);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class RemoveCachePoolOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      RemoveCachePoolOp removeOp = (RemoveCachePoolOp) op;
      fsNamesys.getCacheManager().removeCachePool(removeOp.poolName);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class SetAclOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetAclOp setAclOp = (SetAclOp) op;
      FSDirAclOp.unprotectedSetAcl(fsDir, setAclOp.src, setAclOp.aclEntries,
          true);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class SetXAttrOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetXAttrOp setXAttrOp = (SetXAttrOp) op;
      FSDirXAttrOp.unprotectedSetXAttrs(fsDir, setXAttrOp.src,
                                        setXAttrOp.xAttrs,
                                        EnumSet.of(XAttrSetFlag.CREATE,
                                                   XAttrSetFlag.REPLACE));
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(setXAttrOp.rpcClientId, setXAttrOp.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class RemoveXAttrOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      RemoveXAttrOp removeXAttrOp = (RemoveXAttrOp) op;
      FSDirXAttrOp.unprotectedRemoveXAttrs(fsDir, removeXAttrOp.src,
                                           removeXAttrOp.xAttrs);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(removeXAttrOp.rpcClientId,
            removeXAttrOp.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class TruncateOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      TruncateOp truncateOp = (TruncateOp) op;
      fsDir.unprotectedTruncate(truncateOp.src, truncateOp.clientName,
          truncateOp.clientMachine, truncateOp.newLength, truncateOp.timestamp,
          truncateOp.truncateBlock);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // ... other handlers ...

  private static class SetStoragePolicyOpHandler implements EditLogOpHandler {
    @Override
    public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetStoragePolicyOp setStoragePolicyOp = (SetStoragePolicyOp) op;
      final String path = renameReservedPathsOnUpgrade(setStoragePolicyOp.path,
          logVersion);
      final INodesInPath iip = fsDir.getINodesInPath4Write(path);
      FSDirAttrOp.unprotectedSetStoragePolicy(
          fsDir, fsNamesys.getBlockManager(), iip,
          setStoragePolicyOp.policyId);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }