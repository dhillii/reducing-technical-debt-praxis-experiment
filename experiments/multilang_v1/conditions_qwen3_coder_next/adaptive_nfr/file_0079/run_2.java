@SuppressWarnings("deprecation")
  private long applyEditLogOp(FSEditLogOp op, FSDirectory fsDir,
      StartupOption startOpt, int logVersion, long lastInodeId) throws IOException {
    long inodeId = INodeId.GRANDFATHER_INODE_ID;
    if (LOG.isTraceEnabled()) {
      LOG.trace("replaying edit log: " + op);
    }
    final boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();

    // Strategy mapping: opcode → handler
    EditLogOpHandler handler = strategyMap.get(op.opCode);
    if (handler == null) {
      throw new IOException("Invalid operation read " + op.opCode);
    }
    return handler.apply(op, fsDir, startOpt, logVersion, lastInodeId, toAddRetryCache);
  }

  // Strategy handler interface
  private interface EditLogOpHandler {
    long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException;
  }

  // Strategy dispatch table — initialized at class load time
  private static final EnumMap<FSEditLogOpCodes, EditLogOpHandler> strategyMap = new EnumMap<>(FSEditLogOpCodes.class);

  static {
    // Initialize strategies
    strategyMap.put(FSEditLogOpCodes.OP_ADD, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleAddOp(op, fsDir, startOpt, logVersion, lastInodeId, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_CLOSE, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleCloseOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_APPEND, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleAppendOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_UPDATE_BLOCKS, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleUpdateBlocksOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_ADD_BLOCK, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleAddBlockOp(op, fsDir, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SET_REPLICATION, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSetReplicationOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_CONCAT_DELETE, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleConcatDeleteOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_RENAME_OLD, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleRenameOldOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_DELETE, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleDeleteOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_MKDIR, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleMkdirOp(op, fsDir, logVersion, lastInodeId, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SET_GENSTAMP_V1, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSetGenstampV1Op(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SET_PERMISSIONS, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSetPermissionsOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SET_OWNER, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSetOwnerOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SET_NS_QUOTA, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSetNSSquotaOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_CLEAR_NS_QUOTA, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleClearNSSquotaOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SET_QUOTA, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSetQuotaOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SET_QUOTA_BY_STORAGETYPE, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSetQuotaByStorageTypeOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_TIMES, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleTimesOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SYMLINK, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSymlinkOp(op, fsDir, logVersion, lastInodeId, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_RENAME, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleRenameOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_GET_DELEGATION_TOKEN, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleGetDelegationTokenOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_RENEW_DELEGATION_TOKEN, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleRenewDelegationTokenOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_CANCEL_DELEGATION_TOKEN, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleCancelDelegationTokenOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_UPDATE_MASTER_KEY, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleUpdateMasterKeyOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_REASSIGN_LEASE, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleReassignLeaseOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_START_LOG_SEGMENT, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleLogSegmentBoundaryOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_END_LOG_SEGMENT, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleLogSegmentBoundaryOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_CREATE_SNAPSHOT, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleCreateSnapshotOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_DELETE_SNAPSHOT, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleDeleteSnapshotOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_RENAME_SNAPSHOT, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleRenameSnapshotOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_ALLOW_SNAPSHOT, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleAllowSnapshotOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_DISALLOW_SNAPSHOT, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleDisallowSnapshotOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SET_GENSTAMP_V2, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSetGenstampV2Op(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_ALLOCATE_BLOCK_ID, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleAllocateBlockIdOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_ROLLING_UPGRADE_START, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleRollingUpgradeStartOp(op, fsDir, startOpt, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_ROLLING_UPGRADE_FINALIZE, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleRollingUpgradeFinalizeOp(op, fsDir, startOpt, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_ADD_CACHE_DIRECTIVE, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleAddCacheDirectiveOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_MODIFY_CACHE_DIRECTIVE, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleModifyCacheDirectiveOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_REMOVE_CACHE_DIRECTIVE, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleRemoveCacheDirectiveOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_ADD_CACHE_POOL, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleAddCachePoolOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_MODIFY_CACHE_POOL, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleModifyCachePoolOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_REMOVE_CACHE_POOL, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleRemoveCachePoolOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SET_ACL, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSetAclOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SET_XATTR, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSetXAttrOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_REMOVE_XATTR, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleRemoveXAttrOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_TRUNCATE, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleTruncateOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
    strategyMap.put(FSEditLogOpCodes.OP_SET_STORAGE_POLICY, new EditLogOpHandler() {
      @Override
      public long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
        return handleSetStoragePolicyOp(op, fsDir, logVersion, toAddRetryCache);
      }
    });
  }

  private long handleAddOp(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
      int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
    AddCloseOp addCloseOp = (AddCloseOp) op;
    final String path = renameReservedPathsOnUpgrade(addCloseOp.path, logVersion);
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
      final short replication = fsNamesys.getBlockManager().adjustReplication(addCloseOp.replication);
      assert addCloseOp.blocks.length == 0;

      long inodeId = getAndUpdateLastInodeId(addCloseOp.inodeId, logVersion, lastInodeId);
      newFile = fsDir.addFileForEditLog(inodeId, iip.getExistingINodes(), iip.getLastLocalName(),
          addCloseOp.permissions, addCloseOp.aclEntries, addCloseOp.xAttrs, replication,
          addCloseOp.mtime, addCloseOp.atime, addCloseOp.blockSize, true,
          addCloseOp.clientName, addCloseOp.clientMachine, addCloseOp.storagePolicyId);
      iip = INodesInPath.replace(iip, iip.length() - 1, newFile);
      fsNamesys.leaseManager.addLease(addCloseOp.clientName, path);

      if (toAddRetryCache) {
        HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(fsNamesys.dir, path,
            HdfsFileStatus.EMPTY_NAME, newFile, BlockStoragePolicySuite.ID_UNSPECIFIED,
            Snapshot.CURRENT_STATE_ID, false, iip);
        fsNamesys.addCacheEntryWithPayload(addCloseOp.rpcClientId, addCloseOp.rpcCallId, stat);
      }
    } else {
      if (!oldFile.isUnderConstruction()) {
        if (FSNamesystem.LOG.isDebugEnabled()) {
          FSNamesystem.LOG.debug("Reopening an already-closed file for append");
        }
        LocatedBlock lb = fsNamesys.prepareFileForAppend(path, iip,
            addCloseOp.clientName, addCloseOp.clientMachine, false, false, false);
        if (toAddRetryCache) {
          HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(fsNamesys.dir, path,
              HdfsFileStatus.EMPTY_NAME, newFile, BlockStoragePolicySuite.ID_UNSPECIFIED,
              Snapshot.CURRENT_STATE_ID, false, iip);
          fsNamesys.addCacheEntryWithPayload(addCloseOp.rpcClientId, addCloseOp.rpcCallId,
              new LastBlockWithStatus(lb, stat));
        }
      }
    }

    newFile.setAccessTime(addCloseOp.atime, Snapshot.CURRENT_STATE_ID);
    newFile.setModificationTime(addCloseOp.mtime, Snapshot.CURRENT_STATE_ID);
    updateBlocks(fsDir, addCloseOp, iip, newFile);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleCloseOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    AddCloseOp addCloseOp = (AddCloseOp) op;
    final String path = renameReservedPathsOnUpgrade(addCloseOp.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " numblocks : " + addCloseOp.blocks.length +
          " clientHolder " + addCloseOp.clientName +
          " clientMachine " + addCloseOp.clientMachine);
    }

    INodesInPath iip = fsDir.getINodesInPath(path, true);
    INodeFile file = INodeFile.valueOf(iip.getLastINode(), path);

    file.setAccessTime(addCloseOp.atime, Snapshot.CURRENT_STATE_ID);
    file.setModificationTime(addCloseOp.mtime, Snapshot.CURRENT_STATE_ID);
    updateBlocks(fsDir, addCloseOp, iip, file);

    if (!file.isUnderConstruction() &&
        logVersion <= LayoutVersion.BUGFIX_HDFS_2991_VERSION) {
      throw new IOException("File is not under construction: " + path);
    }

    if (file.isUnderConstruction()) {
      fsNamesys.leaseManager.removeLeaseWithPrefixPath(path);
      file.toCompleteFile(file.getModificationTime());
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleAppendOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    AppendOp appendOp = (AppendOp) op;
    final String path = renameReservedPathsOnUpgrade(appendOp.path, logVersion);
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
          appendOp.clientName, appendOp.clientMachine, appendOp.newBlock, false, false);
      if (toAddRetryCache) {
        HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(fsNamesys.dir, path,
            HdfsFileStatus.EMPTY_NAME, file, BlockStoragePolicySuite.ID_UNSPECIFIED,
            Snapshot.CURRENT_STATE_ID, false, iip);
        fsNamesys.addCacheEntryWithPayload(appendOp.rpcClientId, appendOp.rpcCallId,
            new LastBlockWithStatus(lb, stat));
      }
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleUpdateBlocksOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    UpdateBlocksOp updateOp = (UpdateBlocksOp) op;
    final String path = renameReservedPathsOnUpgrade(updateOp.path, logVersion);
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
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleAddBlockOp(FSEditLogOp op, FSDirectory fsDir,
      boolean toAddRetryCache) throws IOException {
    AddBlockOp addBlockOp = (AddBlockOp) op;
    String path = renameReservedPathsOnUpgrade(addBlockOp.getPath(), fsNamesys.getFSImage().getStorage().getLayoutVersion());
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " new block id : " + addBlockOp.getLastBlock().getBlockId());
    }
    INodeFile oldFile = INodeFile.valueOf(fsDir.getINode(path), path);
    addNewBlock(fsDir, addBlockOp, oldFile);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetReplicationOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    SetReplicationOp setReplicationOp = (SetReplicationOp) op;
    short replication = fsNamesys.getBlockManager().adjustReplication(setReplicationOp.replication);
    FSDirAttrOp.unprotectedSetReplication(fsDir, renameReservedPathsOnUpgrade(
        setReplicationOp.path, logVersion), replication, null);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleConcatDeleteOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    ConcatDeleteOp concatDeleteOp = (ConcatDeleteOp) op;
    String trg = renameReservedPathsOnUpgrade(concatDeleteOp.trg, logVersion);
    String[] srcs = new String[concatDeleteOp.srcs.length];
    for (int i = 0; i < srcs.length; i++) {
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
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRenameOldOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    RenameOldOp renameOp = (RenameOldOp) op;
    final String src = renameReservedPathsOnUpgrade(renameOp.src, logVersion);
    final String dst = renameReservedPathsOnUpgrade(renameOp.dst, logVersion);
    FSDirRenameOp.renameForEditLog(fsDir, src, dst, renameOp.timestamp);

    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleDeleteOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    DeleteOp deleteOp = (DeleteOp) op;
    FSDirDeleteOp.deleteForEditLog(fsDir, renameReservedPathsOnUpgrade(deleteOp.path, logVersion),
        deleteOp.timestamp);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(deleteOp.rpcClientId, deleteOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleMkdirOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      long lastInodeId, boolean toAddRetryCache) throws IOException {
    MkdirOp mkdirOp = (MkdirOp) op;
    long inodeId = getAndUpdateLastInodeId(mkdirOp.inodeId, logVersion, lastInodeId);
    FSDirMkdirOp.mkdirForEditLog(fsDir, inodeId,
        renameReservedPathsOnUpgrade(mkdirOp.path, logVersion),
        mkdirOp.permissions, mkdirOp.aclEntries, mkdirOp.timestamp);
    return inodeId;
  }

  private long handleSetGenstampV1Op(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    SetGenstampV1Op setGenstampV1Op = (SetGenstampV1Op) op;
    fsNamesys.getBlockIdManager().setGenerationStampV1(setGenstampV1Op.genStampV1);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetPermissionsOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    SetPermissionsOp setPermissionsOp = (SetPermissionsOp) op;
    FSDirAttrOp.unprotectedSetPermission(fsDir, renameReservedPathsOnUpgrade(
        setPermissionsOp.src, logVersion), setPermissionsOp.permissions);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetOwnerOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    SetOwnerOp setOwnerOp = (SetOwnerOp) op;
    FSDirAttrOp.unprotectedSetOwner(fsDir, renameReservedPathsOnUpgrade(setOwnerOp.src, logVersion),
        setOwnerOp.username, setOwnerOp.groupname);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetNSSquotaOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    SetNSQuotaOp setNSQuotaOp = (SetNSQuotaOp) op;
    FSDirAttrOp.unprotectedSetQuota(fsDir, renameReservedPathsOnUpgrade(setNSQuotaOp.src, logVersion),
        setNSQuotaOp.nsQuota, HdfsConstants.QUOTA_DONT_SET, null);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleClearNSSquotaOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    ClearNSQuotaOp clearNSQuotaOp = (ClearNSQuotaOp) op;
    FSDirAttrOp.unprotectedSetQuota(fsDir, renameReservedPathsOnUpgrade(clearNSQuotaOp.src, logVersion),
        HdfsConstants.QUOTA_RESET, HdfsConstants.QUOTA_DONT_SET, null);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetQuotaOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    SetQuotaOp setQuotaOp = (SetQuotaOp) op;
    FSDirAttrOp.unprotectedSetQuota(fsDir, renameReservedPathsOnUpgrade(setQuotaOp.src, logVersion),
        setQuotaOp.nsQuota, setQuotaOp.dsQuota, null);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetQuotaByStorageTypeOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSEditLogOp.SetQuotaByStorageTypeOp setQuotaByStorageTypeOp =
        (FSEditLogOp.SetQuotaByStorageTypeOp) op;
    FSDirAttrOp.unprotectedSetQuota(fsDir,
        renameReservedPathsOnUpgrade(setQuotaByStorageTypeOp.src, logVersion),
        HdfsConstants.QUOTA_DONT_SET, setQuotaByStorageTypeOp.dsQuota,
        setQuotaByStorageTypeOp.type);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleTimesOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    TimesOp timesOp = (TimesOp) op;
    FSDirAttrOp.unprotectedSetTimes(fsDir, renameReservedPathsOnUpgrade(timesOp.path, logVersion),
        timesOp.mtime, timesOp.atime, true);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSymlinkOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      long lastInodeId, boolean toAddRetryCache) throws IOException {
    if (!FileSystem.areSymlinksEnabled()) {
      throw new IOException("Symlinks not supported - please remove symlink before upgrading to this version of HDFS");
    }
    SymlinkOp symlinkOp = (SymlinkOp) op;
    long inodeId = getAndUpdateLastInodeId(symlinkOp.inodeId, logVersion, lastInodeId);
    final String path = renameReservedPathsOnUpgrade(symlinkOp.path, logVersion);
    final INodesInPath iip = fsDir.getINodesInPath(path, false);
    FSDirSymlinkOp.unprotectedAddSymlink(fsDir, iip.getExistingINodes(),
        iip.getLastLocalName(), inodeId, symlinkOp.value, symlinkOp.mtime,
        symlinkOp.atime, symlinkOp.permissionStatus);

    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(symlinkOp.rpcClientId, symlinkOp.rpcCallId);
    }
    return inodeId;
  }

  private long handleRenameOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
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

  private long handleGetDelegationTokenOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    GetDelegationTokenOp getDelegationTokenOp = (GetDelegationTokenOp) op;
    fsNamesys.getDelegationTokenSecretManager()
        .addPersistedDelegationToken(getDelegationTokenOp.token,
            getDelegationTokenOp.expiryTime);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRenewDelegationTokenOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    RenewDelegationTokenOp renewDelegationTokenOp = (RenewDelegationTokenOp) op;
    fsNamesys.getDelegationTokenSecretManager()
        .updatePersistedTokenRenewal(renewDelegationTokenOp.token,
            renewDelegationTokenOp.expiryTime);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleCancelDelegationTokenOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    CancelDelegationTokenOp cancelDelegationTokenOp = (CancelDelegationTokenOp) op;
    fsNamesys.getDelegationTokenSecretManager()
        .updatePersistedTokenCancellation(cancelDelegationTokenOp.token);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleUpdateMasterKeyOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    UpdateMasterKeyOp updateMasterKeyOp = (UpdateMasterKeyOp) op;
    fsNamesys.getDelegationTokenSecretManager()
        .updatePersistedMasterKey(updateMasterKeyOp.key);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleReassignLeaseOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    ReassignLeaseOp reassignLeaseOp = (ReassignLeaseOp) op;
    Lease lease = fsNamesys.leaseManager.getLease(reassignLeaseOp.leaseHolder);
    final String path = renameReservedPathsOnUpgrade(reassignLeaseOp.path, logVersion);
    INodeFile pendingFile = fsDir.getINode(path).asFile();
    Preconditions.checkState(pendingFile.isUnderConstruction());
    fsNamesys.reassignLeaseInternal(lease, path, reassignLeaseOp.newHolder, pendingFile);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleLogSegmentBoundaryOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) {
    // no-op for log segment boundaries
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleCreateSnapshotOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    CreateSnapshotOp createSnapshotOp = (CreateSnapshotOp) op;
    final String snapshotRoot = renameReservedPathsOnUpgrade(createSnapshotOp.snapshotRoot, logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    String path = fsNamesys.getSnapshotManager().createSnapshot(iip,
        snapshotRoot, createSnapshotOp.snapshotName);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntryWithPayload(createSnapshotOp.rpcClientId,
          createSnapshotOp.rpcCallId, path);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleDeleteSnapshotOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    DeleteSnapshotOp deleteSnapshotOp = (DeleteSnapshotOp) op;
    BlocksMapUpdateInfo collectedBlocks = new BlocksMapUpdateInfo();
    List<INode> removedINodes = new ChunkedArrayList<>();
    final String snapshotRoot = renameReservedPathsOnUpgrade(deleteSnapshotOp.snapshotRoot, logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    fsNamesys.getSnapshotManager().deleteSnapshot(iip, deleteSnapshotOp.snapshotName,
        collectedBlocks, removedINodes);
    fsNamesys.removeBlocksAndUpdateSafemodeTotal(collectedBlocks);
    collectedBlocks.clear();
    fsNamesys.dir.removeFromInodeMap(removedINodes);
    removedINodes.clear();
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(deleteSnapshotOp.rpcClientId, deleteSnapshotOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRenameSnapshotOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    RenameSnapshotOp renameSnapshotOp = (RenameSnapshotOp) op;
    final String snapshotRoot = renameReservedPathsOnUpgrade(renameSnapshotOp.snapshotRoot, logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    fsNamesys.getSnapshotManager().renameSnapshot(iip,
        snapshotRoot, renameSnapshotOp.snapshotOldName,
        renameSnapshotOp.snapshotNewName);

    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(renameSnapshotOp.rpcClientId, renameSnapshotOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleAllowSnapshotOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    AllowSnapshotOp allowSnapshotOp = (AllowSnapshotOp) op;
    final String snapshotRoot = renameReservedPathsOnUpgrade(allowSnapshotOp.snapshotRoot, logVersion);
    fsNamesys.getSnapshotManager().setSnapshottable(snapshotRoot, false);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleDisallowSnapshotOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    DisallowSnapshotOp disallowSnapshotOp = (DisallowSnapshotOp) op;
    final String snapshotRoot = renameReservedPathsOnUpgrade(disallowSnapshotOp.snapshotRoot, logVersion);
    fsNamesys.getSnapshotManager().resetSnapshottable(snapshotRoot);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetGenstampV2Op(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    SetGenstampV2Op setGenstampV2Op = (SetGenstampV2Op) op;
    fsNamesys.getBlockIdManager().setGenerationStampV2(setGenstampV2Op.genStampV2);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleAllocateBlockIdOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    AllocateBlockIdOp allocateBlockIdOp = (AllocateBlockIdOp) op;
    fsNamesys.getBlockIdManager().setLastAllocatedBlockId(allocateBlockIdOp.blockId);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRollingUpgradeStartOp(FSEditLogOp op, FSDirectory fsDir,
      StartupOption startOpt, int logVersion, boolean toAddRetryCache) throws IOException {
    if (startOpt == StartupOption.ROLLINGUPGRADE) {
      final RollingUpgradeStartupOption rollingUpgradeOpt =
          startOpt.getRollingUpgradeStartupOption();
      if (rollingUpgradeOpt == RollingUpgradeStartupOption.ROLLBACK) {
        throw new FSEditLogOp.RollbackException();
      } else if (rollingUpgradeOpt == RollingUpgradeStartupOption.DOWNGRADE) {
        break;
      }
    }
    final long startTime = ((RollingUpgradeOp) op).getTime();
    fsNamesys.startRollingUpgradeInternal(startTime);
    fsNamesys.triggerRollbackCheckpoint();
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRollingUpgradeFinalizeOp(FSEditLogOp op, FSDirectory fsDir,
      StartupOption startOpt, int logVersion, boolean toAddRetryCache) throws IOException {
    final long finalizeTime = ((RollingUpgradeOp) op).getTime();
    if (fsNamesys.isRollingUpgrade()) {
      fsNamesys.finalizeRollingUpgradeInternal(finalizeTime);
    }
    fsNamesys.getFSImage().updateStorageVersion();
    fsNamesys.getFSImage().renameCheckpoint(NameNodeFile.IMAGE_ROLLBACK, NameNodeFile.IMAGE);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleAddCacheDirectiveOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    AddCacheDirectiveInfoOp addOp = (AddCacheDirectiveInfoOp) op;
    CacheDirectiveInfo result = fsNamesys.getCacheManager().addDirectiveFromEditLog(addOp.directive);
    if (toAddRetryCache) {
      Long id = result.getId();
      fsNamesys.addCacheEntryWithPayload(op.rpcClientId, op.rpcCallId, id);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleModifyCacheDirectiveOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    ModifyCacheDirectiveInfoOp modifyOp = (ModifyCacheDirectiveInfoOp) op;
    fsNamesys.getCacheManager().modifyDirectiveFromEditLog(modifyOp.directive);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRemoveCacheDirectiveOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    RemoveCacheDirectiveInfoOp removeOp = (RemoveCacheDirectiveInfoOp) op;
    fsNamesys.getCacheManager().removeDirective(removeOp.id, null);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleAddCachePoolOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    AddCachePoolOp addOp = (AddCachePoolOp) op;
    fsNamesys.getCacheManager().addCachePool(addOp.info);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleModifyCachePoolOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    ModifyCachePoolOp modifyOp = (ModifyCachePoolOp) op;
    fsNamesys.getCacheManager().modifyCachePool(modifyOp.info);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRemoveCachePoolOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    RemoveCachePoolOp removeOp = (RemoveCachePoolOp) op;
    fsNamesys.getCacheManager().removeCachePool(removeOp.poolName);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetAclOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    SetAclOp setAclOp = (SetAclOp) op;
    FSDirAclOp.unprotectedSetAcl(fsDir, setAclOp.src, setAclOp.aclEntries, true);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetXAttrOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    SetXAttrOp setXAttrOp = (SetXAttrOp) op;
    FSDirXAttrOp.unprotectedSetXAttrs(fsDir, setXAttrOp.src,
        setXAttrOp.xAttrs, EnumSet.of(XAttrSetFlag.CREATE, XAttrSetFlag.REPLACE));
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(setXAttrOp.rpcClientId, setXAttrOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRemoveXAttrOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    RemoveXAttrOp removeXAttrOp = (RemoveXAttrOp) op;
    FSDirXAttrOp.unprotectedRemoveXAttrs(fsDir, removeXAttrOp.src, removeXAttrOp.xAttrs);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(removeXAttrOp.rpcClientId, removeXAttrOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleTruncateOp(FSEditLogOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    TruncateOp truncateOp = (TruncateOp) op;
    fsDir.unprotectedTruncate(truncateOp.src, truncateOp.clientName,
        truncateOp.clientMachine, truncateOp.newLength, truncateOp.timestamp,
        truncateOp.truncateBlock);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetStoragePolicyOp(FSEditLogOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    SetStoragePolicyOp setStoragePolicyOp = (SetStoragePolicyOp) op;
    final String path = renameReservedPathsOnUpgrade(setStoragePolicyOp.path, logVersion);
    final INodesInPath iip = fsDir.getINodesInPath4Write(path);
    FSDirAttrOp.unprotectedSetStoragePolicy(fsDir, fsNamesys.getBlockManager(), iip,
        setStoragePolicyOp.policyId);
    return INodeId.GRANDFATHER_INODE_ID;
  }