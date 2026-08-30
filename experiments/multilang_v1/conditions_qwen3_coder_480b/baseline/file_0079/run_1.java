/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.apache.hadoop.hdfs.server.namenode;

import static org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.TruncateOp;
import static org.apache.hadoop.hdfs.server.namenode.FSImageFormat.renameReservedPathsOnUpgrade;
import static org.apache.hadoop.util.Time.monotonicNow;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.classification.InterfaceAudience;
import org.apache.hadoop.classification.InterfaceStability;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.XAttrSetFlag;
import org.apache.hadoop.hdfs.protocol.LocatedBlock;
import org.apache.hadoop.hdfs.server.blockmanagement.BlockStoragePolicySuite;
import org.apache.hadoop.hdfs.protocol.Block;
import org.apache.hadoop.hdfs.protocol.CacheDirectiveInfo;
import org.apache.hadoop.hdfs.protocol.HdfsConstants;
import org.apache.hadoop.hdfs.protocol.HdfsFileStatus;
import org.apache.hadoop.hdfs.protocol.LastBlockWithStatus;
import org.apache.hadoop.hdfs.protocol.LayoutVersion;
import org.apache.hadoop.hdfs.protocol.LocatedBlock;
import org.apache.hadoop.hdfs.server.blockmanagement.BlockInfoContiguous;
import org.apache.hadoop.hdfs.server.blockmanagement.BlockInfoContiguousUnderConstruction;
import org.apache.hadoop.hdfs.server.common.HdfsServerConstants.RollingUpgradeStartupOption;
import org.apache.hadoop.hdfs.server.common.HdfsServerConstants.StartupOption;
import org.apache.hadoop.hdfs.server.common.Storage;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.AddBlockOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.AddCacheDirectiveInfoOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.AddCachePoolOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.AddCloseOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.AllocateBlockIdOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.AllowSnapshotOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.AppendOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.BlockListUpdatingOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.CancelDelegationTokenOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.ClearNSQuotaOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.ConcatDeleteOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.CreateSnapshotOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.DeleteOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.DeleteSnapshotOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.DisallowSnapshotOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.GetDelegationTokenOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.MkdirOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.ModifyCacheDirectiveInfoOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.ModifyCachePoolOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.ReassignLeaseOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.RemoveCacheDirectiveInfoOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.RemoveCachePoolOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.RemoveXAttrOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.RenameOldOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.RenameOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.RenameSnapshotOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.RenewDelegationTokenOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SetAclOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.RollingUpgradeOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SetGenstampV1Op;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SetGenstampV2Op;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SetNSQuotaOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SetOwnerOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SetPermissionsOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SetQuotaOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SetReplicationOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SetStoragePolicyOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SetXAttrOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SymlinkOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.TimesOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.UpdateBlocksOp;
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.UpdateMasterKeyOp;
import org.apache.hadoop.hdfs.server.namenode.INode.BlocksMapUpdateInfo;
import org.apache.hadoop.hdfs.server.namenode.LeaseManager.Lease;
import org.apache.hadoop.hdfs.server.namenode.NNStorage.NameNodeFile;
import org.apache.hadoop.hdfs.server.namenode.snapshot.Snapshot;
import org.apache.hadoop.hdfs.server.namenode.startupprogress.Phase;
import org.apache.hadoop.hdfs.server.namenode.startupprogress.StartupProgress;
import org.apache.hadoop.hdfs.server.namenode.startupprogress.StartupProgress.Counter;
import org.apache.hadoop.hdfs.server.namenode.startupprogress.Step;
import org.apache.hadoop.hdfs.util.Holder;
import org.apache.hadoop.util.ChunkedArrayList;

import com.google.common.base.Joiner;
import com.google.common.base.Preconditions;

@InterfaceAudience.Private
@InterfaceStability.Evolving
public class FSEditLogLoader {
  static final Log LOG = LogFactory.getLog(FSEditLogLoader.class.getName());
  static final long REPLAY_TRANSACTION_LOG_INTERVAL = 1000; // 1sec

  private final FSNamesystem fsNamesys;
  private long lastAppliedTxId;
  /** Total number of end transactions loaded. */
  private int totalEdits = 0;
  
  public FSEditLogLoader(FSNamesystem fsNamesys, long lastAppliedTxId) {
    this.fsNamesys = fsNamesys;
    this.lastAppliedTxId = lastAppliedTxId;
  }
  
  long loadFSEdits(EditLogInputStream edits, long expectedStartingTxId)
      throws IOException {
    return loadFSEdits(edits, expectedStartingTxId, null, null);
  }

  /**
   * Load an edit log, and apply the changes to the in-memory structure
   * This is where we apply edits that we've been writing to disk all
   * along.
   */
  long loadFSEdits(EditLogInputStream edits, long expectedStartingTxId,
      StartupOption startOpt, MetaRecoveryContext recovery) throws IOException {
    StartupProgress prog = NameNode.getStartupProgress();
    Step step = createStartupProgressStep(edits);
    prog.beginStep(Phase.LOADING_EDITS, step);
    fsNamesys.writeLock();
    try {
      long startTime = monotonicNow();
      FSImage.LOG.info("Start loading edits file " + edits.getName());
      long numEdits = loadEditRecords(edits, false, expectedStartingTxId,
          startOpt, recovery);
      FSImage.LOG.info("Edits file " + edits.getName() 
          + " of size " + edits.length() + " edits # " + numEdits 
          + " loaded in " + (monotonicNow()-startTime)/1000 + " seconds");
      return numEdits;
    } finally {
      edits.close();
      fsNamesys.writeUnlock();
      prog.endStep(Phase.LOADING_EDITS, step);
    }
  }

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
    final boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();

    switch (op.opCode) {
    case OP_ADD: 
      return handleAddOp((AddCloseOp)op, fsDir, logVersion, lastInodeId, toAddRetryCache);
    case OP_CLOSE: 
      return handleCloseOp((AddCloseOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_APPEND: 
      return handleAppendOp((AppendOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_UPDATE_BLOCKS: 
      return handleUpdateBlocksOp((UpdateBlocksOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_ADD_BLOCK: 
      return handleAddBlockOp((AddBlockOp)op, fsDir, logVersion);
    case OP_SET_REPLICATION: 
      return handleSetReplicationOp((SetReplicationOp)op, fsDir);
    case OP_CONCAT_DELETE: 
      return handleConcatDeleteOp((ConcatDeleteOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_RENAME_OLD: 
      return handleRenameOldOp((RenameOldOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_DELETE: 
      return handleDeleteOp((DeleteOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_MKDIR: 
      return handleMkdirOp((MkdirOp)op, fsDir, logVersion, lastInodeId);
    case OP_SET_GENSTAMP_V1: 
      return handleSetGenstampV1Op((SetGenstampV1Op)op);
    case OP_SET_PERMISSIONS: 
      return handleSetPermissionsOp((SetPermissionsOp)op, fsDir);
    case OP_SET_OWNER: 
      return handleSetOwnerOp((SetOwnerOp)op, fsDir);
    case OP_SET_NS_QUOTA: 
      return handleSetNSQuotaOp((SetNSQuotaOp)op, fsDir);
    case OP_CLEAR_NS_QUOTA: 
      return handleClearNSQuotaOp((ClearNSQuotaOp)op, fsDir);
    case OP_SET_QUOTA:
      return handleSetQuotaOp((SetQuotaOp)op, fsDir);
    case OP_SET_QUOTA_BY_STORAGETYPE:
      return handleSetQuotaByStorageTypeOp((FSEditLogOp.SetQuotaByStorageTypeOp)op, fsDir);
    case OP_TIMES: 
      return handleTimesOp((TimesOp)op, fsDir);
    case OP_SYMLINK: 
      return handleSymlinkOp((SymlinkOp)op, fsDir, logVersion, lastInodeId, toAddRetryCache);
    case OP_RENAME: 
      return handleRenameOp((RenameOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_GET_DELEGATION_TOKEN: 
      return handleGetDelegationTokenOp((GetDelegationTokenOp)op);
    case OP_RENEW_DELEGATION_TOKEN: 
      return handleRenewDelegationTokenOp((RenewDelegationTokenOp)op);
    case OP_CANCEL_DELEGATION_TOKEN: 
      return handleCancelDelegationTokenOp((CancelDelegationTokenOp)op);
    case OP_UPDATE_MASTER_KEY: 
      return handleUpdateMasterKeyOp((UpdateMasterKeyOp)op);
    case OP_REASSIGN_LEASE: 
      return handleReassignLeaseOp((ReassignLeaseOp)op, fsDir, logVersion);
    case OP_START_LOG_SEGMENT:
    case OP_END_LOG_SEGMENT: 
      return handleStartEndLogSegmentOp();
    case OP_CREATE_SNAPSHOT: 
      return handleCreateSnapshotOp((CreateSnapshotOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_DELETE_SNAPSHOT: 
      return handleDeleteSnapshotOp((DeleteSnapshotOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_RENAME_SNAPSHOT: 
      return handleRenameSnapshotOp((RenameSnapshotOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_ALLOW_SNAPSHOT: 
      return handleAllowSnapshotOp((AllowSnapshotOp)op, fsDir, logVersion);
    case OP_DISALLOW_SNAPSHOT: 
      return handleDisallowSnapshotOp((DisallowSnapshotOp)op, fsDir, logVersion);
    case OP_SET_GENSTAMP_V2: 
      return handleSetGenstampV2Op((SetGenstampV2Op)op);
    case OP_ALLOCATE_BLOCK_ID: 
      return handleAllocateBlockIdOp((AllocateBlockIdOp)op);
    case OP_ROLLING_UPGRADE_START: 
      return handleRollingUpgradeStartOp(op, startOpt);
    case OP_ROLLING_UPGRADE_FINALIZE: 
      return handleRollingUpgradeFinalizeOp(op);
    case OP_ADD_CACHE_DIRECTIVE: 
      return handleAddCacheDirectiveOp((AddCacheDirectiveInfoOp)op, toAddRetryCache);
    case OP_MODIFY_CACHE_DIRECTIVE: 
      return handleModifyCacheDirectiveOp((ModifyCacheDirectiveInfoOp)op, toAddRetryCache);
    case OP_REMOVE_CACHE_DIRECTIVE: 
      return handleRemoveCacheDirectiveOp((RemoveCacheDirectiveInfoOp)op, toAddRetryCache);
    case OP_ADD_CACHE_POOL: 
      return handleAddCachePoolOp((AddCachePoolOp)op, toAddRetryCache);
    case OP_MODIFY_CACHE_POOL: 
      return handleModifyCachePoolOp((ModifyCachePoolOp)op, toAddRetryCache);
    case OP_REMOVE_CACHE_POOL: 
      return handleRemoveCachePoolOp((RemoveCachePoolOp)op, toAddRetryCache);
    case OP_SET_ACL: 
      return handleSetAclOp((SetAclOp)op, fsDir);
    case OP_SET_XATTR: 
      return handleSetXAttrOp((SetXAttrOp)op, fsDir, toAddRetryCache);
    case OP_REMOVE_XATTR: 
      return handleRemoveXAttrOp((RemoveXAttrOp)op, fsDir, toAddRetryCache);
    case OP_TRUNCATE: 
      return handleTruncateOp((TruncateOp)op, fsDir);
    case OP_SET_STORAGE_POLICY: 
      return handleSetStoragePolicyOp((SetStoragePolicyOp)op, fsDir, logVersion);
    default:
      throw new IOException("Invalid operation read " + op.opCode);
    }
  }

  private long handleAddOp(AddCloseOp addCloseOp, FSDirectory fsDir, int logVersion, 
      long lastInodeId, boolean toAddRetryCache) throws IOException {
    long inodeId = INodeId.GRANDFATHER_INODE_ID;
    final String path = renameReservedPathsOnUpgrade(addCloseOp.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(FSEditLogOpCodes.OP_ADD + ": " + path +
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
    return inodeId;
  }

  private long handleCloseOp(AddCloseOp addCloseOp, FSDirectory fsDir, int logVersion, 
      boolean toAddRetryCache) throws IOException {
    final String path = renameReservedPathsOnUpgrade(addCloseOp.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(FSEditLogOpCodes.OP_CLOSE + ": " + path +
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

  private long handleAppendOp(AppendOp appendOp, FSDirectory fsDir, int logVersion, 
      boolean toAddRetryCache) throws IOException {
    final String path = renameReservedPathsOnUpgrade(appendOp.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(FSEditLogOpCodes.OP_APPEND + ": " + path +
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
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleUpdateBlocksOp(UpdateBlocksOp updateOp, FSDirectory fsDir, 
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String path = renameReservedPathsOnUpgrade(updateOp.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(FSEditLogOpCodes.OP_UPDATE_BLOCKS + ": " + path +
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

  private long handleAddBlockOp(AddBlockOp addBlockOp, FSDirectory fsDir, 
      int logVersion) throws IOException {
    String path = renameReservedPathsOnUpgrade(addBlockOp.getPath(), logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(FSEditLogOpCodes.OP_ADD_BLOCK + ": " + path +
          " new block id : " + addBlockOp.getLastBlock().getBlockId());
    }
    INodeFile oldFile = INodeFile.valueOf(fsDir.getINode(path), path);
    // add the new block to the INodeFile
    addNewBlock(fsDir, addBlockOp, oldFile);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetReplicationOp(SetReplicationOp setReplicationOp, 
      FSDirectory fsDir) throws IOException {
    short replication = fsNamesys.getBlockManager().adjustReplication(
        setReplicationOp.replication);
    FSDirAttrOp.unprotectedSetReplication(fsDir, setReplicationOp.path, 
        replication, null);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleConcatDeleteOp(ConcatDeleteOp concatDeleteOp, FSDirectory fsDir, 
      int logVersion, boolean toAddRetryCache) throws IOException {
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
    FSDirConcatOp.unprotectedConcat(fsDir, targetIIP, srcFiles,
        concatDeleteOp.timestamp);
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(concatDeleteOp.rpcClientId,
          concatDeleteOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRenameOldOp(RenameOldOp renameOp, FSDirectory fsDir, 
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String src = renameReservedPathsOnUpgrade(renameOp.src, logVersion);
    final String dst = renameReservedPathsOnUpgrade(renameOp.dst, logVersion);
    FSDirRenameOp.renameForEditLog(fsDir, src, dst, renameOp.timestamp);
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleDeleteOp(DeleteOp deleteOp, FSDirectory fsDir, 
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirDeleteOp.deleteForEditLog(
        fsDir, renameReservedPathsOnUpgrade(deleteOp.path, logVersion),
        deleteOp.timestamp);
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(deleteOp.rpcClientId, deleteOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleMkdirOp(MkdirOp mkdirOp, FSDirectory fsDir, 
      int logVersion, long lastInodeId) throws IOException {
    long inodeId = getAndUpdateLastInodeId(mkdirOp.inodeId, logVersion,
        lastInodeId);
    FSDirMkdirOp.mkdirForEditLog(fsDir, inodeId,
        renameReservedPathsOnUpgrade(mkdirOp.path, logVersion),
        mkdirOp.permissions, mkdirOp.aclEntries, mkdirOp.timestamp);
    return inodeId;
  }

  private long handleSetGenstampV1Op(SetGenstampV1Op setGenstampV1Op) 
      throws IOException {
    fsNamesys.getBlockIdManager().setGenerationStampV1(
        setGenstampV1Op.genStampV1);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetPermissionsOp(SetPermissionsOp setPermissionsOp, 
      FSDirectory fsDir) throws IOException {
    FSDirAttrOp.unprotectedSetPermission(fsDir, setPermissionsOp.src, 
        setPermissionsOp.permissions);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetOwnerOp(SetOwnerOp setOwnerOp, FSDirectory fsDir) 
      throws IOException {
    FSDirAttrOp.unprotectedSetOwner(
        fsDir, setOwnerOp.src, setOwnerOp.username, setOwnerOp.groupname);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetNSQuotaOp(SetNSQuotaOp setNSQuotaOp, FSDirectory fsDir) 
      throws IOException {
    FSDirAttrOp.unprotectedSetQuota(
        fsDir, setNSQuotaOp.src, setNSQuotaOp.nsQuota, 
        HdfsConstants.QUOTA_DONT_SET, null);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleClearNSQuotaOp(ClearNSQuotaOp clearNSQuotaOp, 
      FSDirectory fsDir) throws IOException {
    FSDirAttrOp.unprotectedSetQuota(
        fsDir, clearNSQuotaOp.src, HdfsConstants.QUOTA_RESET, 
        HdfsConstants.QUOTA_DONT_SET, null);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetQuotaOp(SetQuotaOp setQuotaOp, FSDirectory fsDir) 
      throws IOException {
    FSDirAttrOp.unprotectedSetQuota(fsDir, setQuotaOp.src,
        setQuotaOp.nsQuota, setQuotaOp.dsQuota, null);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetQuotaByStorageTypeOp(
      FSEditLogOp.SetQuotaByStorageTypeOp setQuotaByStorageTypeOp, 
      FSDirectory fsDir) throws IOException {
    FSDirAttrOp.unprotectedSetQuota(fsDir, setQuotaByStorageTypeOp.src,
        HdfsConstants.QUOTA_DONT_SET, setQuotaByStorageTypeOp.dsQuota,
        setQuotaByStorageTypeOp.type);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleTimesOp(TimesOp timesOp, FSDirectory fsDir) 
      throws IOException {
    FSDirAttrOp.unprotectedSetTimes(
        fsDir, timesOp.path, timesOp.mtime, timesOp.atime, true);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSymlinkOp(SymlinkOp symlinkOp, FSDirectory fsDir, 
      int logVersion, long lastInodeId, boolean toAddRetryCache) 
      throws IOException {
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

  private long handleRenameOp(RenameOp renameOp, FSDirectory fsDir, 
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirRenameOp.renameForEditLog(fsDir,
        renameReservedPathsOnUpgrade(renameOp.src, logVersion),
        renameReservedPathsOnUpgrade(renameOp.dst, logVersion),
        renameOp.timestamp, renameOp.options);
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleGetDelegationTokenOp(GetDelegationTokenOp getDelegationTokenOp) 
      throws IOException {
    fsNamesys.getDelegationTokenSecretManager()
      .addPersistedDelegationToken(getDelegationTokenOp.token,
                                   getDelegationTokenOp.expiryTime);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRenewDelegationTokenOp(RenewDelegationTokenOp renewDelegationTokenOp) 
      throws IOException {
    fsNamesys.getDelegationTokenSecretManager()
      .updatePersistedTokenRenewal(renewDelegationTokenOp.token,
                                   renewDelegationTokenOp.expiryTime);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleCancelDelegationTokenOp(CancelDelegationTokenOp cancelDelegationTokenOp) 
      throws IOException {
    fsNamesys.getDelegationTokenSecretManager()
        .updatePersistedTokenCancellation(
            cancelDelegationTokenOp.token);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleUpdateMasterKeyOp(UpdateMasterKeyOp updateMasterKeyOp) 
      throws IOException {
    fsNamesys.getDelegationTokenSecretManager()
      .updatePersistedMasterKey(updateMasterKeyOp.key);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleReassignLeaseOp(ReassignLeaseOp reassignLeaseOp, 
      FSDirectory fsDir, int logVersion) throws IOException {
    Lease lease = fsNamesys.leaseManager.getLease(
        reassignLeaseOp.leaseHolder);
    final String path = renameReservedPathsOnUpgrade(reassignLeaseOp.path, logVersion);
    INodeFile pendingFile = fsDir.getINode(path).asFile();
    Preconditions.checkState(pendingFile.isUnderConstruction());
    fsNamesys.reassignLeaseInternal(lease,
        path, reassignLeaseOp.newHolder, pendingFile);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleStartEndLogSegmentOp() throws IOException {
    // no data in here currently.
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleCreateSnapshotOp(CreateSnapshotOp createSnapshotOp, 
      FSDirectory fsDir, int logVersion, boolean toAddRetryCache) 
      throws IOException {
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

  private long handleDeleteSnapshotOp(DeleteSnapshotOp deleteSnapshotOp, 
      FSDirectory fsDir, int logVersion, boolean toAddRetryCache) 
      throws IOException {
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

  private long handleRenameSnapshotOp(RenameSnapshotOp renameSnapshotOp, 
      FSDirectory fsDir, int logVersion, boolean toAddRetryCache) 
      throws IOException {
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

  private long handleAllowSnapshotOp(AllowSnapshotOp allowSnapshotOp, 
      FSDirectory fsDir, int logVersion) throws IOException {
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(allowSnapshotOp.snapshotRoot, logVersion);
    fsNamesys.getSnapshotManager().setSnapshottable(
        snapshotRoot, false);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleDisallowSnapshotOp(DisallowSnapshotOp disallowSnapshotOp, 
      FSDirectory fsDir, int logVersion) throws IOException {
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(disallowSnapshotOp.snapshotRoot,
            logVersion);
    fsNamesys.getSnapshotManager().resetSnapshottable(
        snapshotRoot);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetGenstampV2Op(SetGenstampV2Op setGenstampV2Op) 
      throws IOException {
    fsNamesys.getBlockIdManager().setGenerationStampV2(
        setGenstampV2Op.genStampV2);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleAllocateBlockIdOp(AllocateBlockIdOp allocateBlockIdOp) 
      throws IOException {
    fsNamesys.getBlockIdManager().setLastAllocatedBlockId(
        allocateBlockIdOp.blockId);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRollingUpgradeStartOp(FSEditLogOp op, StartupOption startOpt) 
      throws IOException {
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

  private long handleRollingUpgradeFinalizeOp(FSEditLogOp op) throws IOException {
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

  private long handleAddCacheDirectiveOp(AddCacheDirectiveInfoOp addOp, 
      boolean toAddRetryCache) throws IOException {
    CacheDirectiveInfo result = fsNamesys.
        getCacheManager().addDirectiveFromEditLog(addOp.directive);
    if (toAddRetryCache) {
      Long id = result.getId();
      fsNamesys.addCacheEntryWithPayload(addOp.rpcClientId, addOp.rpcCallId, id);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleModifyCacheDirectiveOp(ModifyCacheDirectiveInfoOp modifyOp, 
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().modifyDirectiveFromEditLog(
        modifyOp.directive);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(modifyOp.rpcClientId, modifyOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRemoveCacheDirectiveOp(RemoveCacheDirectiveInfoOp removeOp, 
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().removeDirective(removeOp.id, null);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(removeOp.rpcClientId, removeOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleAddCachePoolOp(AddCachePoolOp addOp, boolean toAddRetryCache) 
      throws IOException {
    fsNamesys.getCacheManager().addCachePool(addOp.info);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(addOp.rpcClientId, addOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleModifyCachePoolOp(ModifyCachePoolOp modifyOp, 
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().modifyCachePool(modifyOp.info);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(modifyOp.rpcClientId, modifyOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRemoveCachePoolOp(RemoveCachePoolOp removeOp, 
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().removeCachePool(removeOp.poolName);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(removeOp.rpcClientId, removeOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetAclOp(SetAclOp setAclOp, FSDirectory fsDir) 
      throws IOException {
    FSDirAclOp.unprotectedSetAcl(fsDir, setAclOp.src, setAclOp.aclEntries,
        true);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetXAttrOp(SetXAttrOp setXAttrOp, FSDirectory fsDir, 
      boolean toAddRetryCache) throws IOException {
    FSDirXAttrOp.unprotectedSetXAttrs(fsDir, setXAttrOp.src,
                                      setXAttrOp.xAttrs,
                                      EnumSet.of(XAttrSetFlag.CREATE,
                                                 XAttrSetFlag.REPLACE));
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(setXAttrOp.rpcClientId, setXAttrOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleRemoveXAttrOp(RemoveXAttrOp removeXAttrOp, FSDirectory fsDir, 
      boolean toAddRetryCache) throws IOException {
    FSDirXAttrOp.unprotectedRemoveXAttrs(fsDir, removeXAttrOp.src,
                                         removeXAttrOp.xAttrs);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(removeXAttrOp.rpcClientId,
          removeXAttrOp.rpcCallId);
    }
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleTruncateOp(TruncateOp truncateOp, FSDirectory fsDir) 
      throws IOException {
    fsDir.unprotectedTruncate(truncateOp.src, truncateOp.clientName,
        truncateOp.clientMachine, truncateOp.newLength, truncateOp.timestamp,
        truncateOp.truncateBlock);
    return INodeId.GRANDFATHER_INODE_ID;
  }

  private long handleSetStoragePolicyOp(SetStoragePolicyOp setStoragePolicyOp, 
      FSDirectory fsDir, int logVersion) throws IOException {
    final String path = renameReservedPathsOnUpgrade(setStoragePolicyOp.path,
        logVersion);
    final INodesInPath iip = fsDir.getINodesInPath4Write(path);
    FSDirAttrOp.unprotectedSetStoragePolicy(
        fsDir, fsNamesys.getBlockManager(), iip,
        setStoragePolicyOp.policyId);
    return INodeId.GRANDFATHER_INODE_ID;
  }
  
  private static String formatEditLogReplayError(EditLogInputStream in,
      long recentOpcodeOffsets[], long txid) {
    StringBuilder sb = new StringBuilder();
    sb.append("Error replaying edit log at offset " + in.getPosition());
    sb.append(".  Expected transaction ID was ").append(txid);
    if (recentOpcodeOffsets[0] != -1) {
      Arrays.sort(recentOpcodeOffsets);
      sb.append("\nRecent opcode offsets:");
      for (long offset : recentOpcodeOffsets) {
        if (offset != -1) {
          sb.append(' ').append(offset);
        }
      }
    }
    return sb.toString();
  }

  /**
   * Add a new block into the given INodeFile
   */
  private void addNewBlock(FSDirectory fsDir, AddBlockOp op, INodeFile file)
      throws IOException {
    BlockInfoContiguous[] oldBlocks = file.getBlocks();
    Block pBlock = op.getPenultimateBlock();
    Block newBlock= op.getLastBlock();
    
    if (pBlock != null) { // the penultimate block is not null
      Preconditions.checkState(oldBlocks != null && oldBlocks.length > 0);
      // compare pBlock with the last block of oldBlocks
      Block oldLastBlock = oldBlocks[oldBlocks.length - 1];
      if (oldLastBlock.getBlockId() != pBlock.getBlockId()
          || oldLastBlock.getGenerationStamp() != pBlock.getGenerationStamp()) {
        throw new IOException(
            "Mismatched block IDs or generation stamps for the old last block of file "
                + op.getPath() + ", the old last block is " + oldLastBlock
                + ", and the block read from editlog is " + pBlock);
      }
      
      oldLastBlock.setNumBytes(pBlock.getNumBytes());
      if (oldLastBlock instanceof BlockInfoContiguousUnderConstruction) {
        fsNamesys.getBlockManager().forceCompleteBlock(file,
            (BlockInfoContiguousUnderConstruction) oldLastBlock);
        fsNamesys.getBlockManager().processQueuedMessagesForBlock(pBlock);
      }
    } else { // the penultimate block is null
      Preconditions.checkState(oldBlocks == null || oldBlocks.length == 0);
    }
    // add the new block
    BlockInfoContiguous newBI = new BlockInfoContiguousUnderConstruction(
          newBlock, file.getBlockReplication());
    fsNamesys.getBlockManager().addBlockCollection(newBI, file);
    file.addBlock(newBI);
    fsNamesys.getBlockManager().processQueuedMessagesForBlock(newBlock);
  }
  
  /**
   * Update in-memory data structures with new block information.
   * @throws IOException
   */
  private void updateBlocks(FSDirectory fsDir, BlockListUpdatingOp op,
      INodesInPath iip, INodeFile file) throws IOException {
    // Update its block list
    BlockInfoContiguous[] oldBlocks = file.getBlocks();
    Block[] newBlocks = op.getBlocks();
    String path = op.getPath();
    
    // Are we only updating the last block's gen stamp.
    boolean isGenStampUpdate = oldBlocks.length == newBlocks.length;
    
    // First, update blocks in common
    for (int i = 0; i < oldBlocks.length && i < newBlocks.length; i++) {
      BlockInfoContiguous oldBlock = oldBlocks[i];
      Block newBlock = newBlocks[i];
      
      boolean isLastBlock = i == newBlocks.length - 1;
      if (oldBlock.getBlockId() != newBlock.getBlockId() ||
          (oldBlock.getGenerationStamp() != newBlock.getGenerationStamp() && 
              !(isGenStampUpdate && isLastBlock))) {
        throw new IOException("Mismatched block IDs or generation stamps, " +
            "attempting to replace block " + oldBlock + " with " + newBlock +
            " as block # " + i + "/" + newBlocks.length + " of " +
            path);
      }
      
      oldBlock.setNumBytes(newBlock.getNumBytes());
      boolean changeMade =
        oldBlock.getGenerationStamp() != newBlock.getGenerationStamp();
      oldBlock.setGenerationStamp(newBlock.getGenerationStamp());
      
      if (oldBlock instanceof BlockInfoContiguousUnderConstruction &&
          (!isLastBlock || op.shouldCompleteLastBlock())) {
        changeMade = true;
        fsNamesys.getBlockManager().forceCompleteBlock(file,
            (BlockInfoContiguousUnderConstruction) oldBlock);
      }
      if (changeMade) {
        // The state or gen-stamp of the block has changed. So, we may be
        // able to process some messages from datanodes that we previously
        // were unable to process.
        fsNamesys.getBlockManager().processQueuedMessagesForBlock(newBlock);
      }
    }
    
    if (newBlocks.length < oldBlocks.length) {
      // We're removing a block from the file, e.g. abandonBlock(...)
      if (!file.isUnderConstruction()) {
        throw new IOException("Trying to remove a block from file " +
            path + " which is not under construction.");
      }
      if (newBlocks.length != oldBlocks.length - 1) {
        throw new IOException("Trying to remove more than one block from file "
            + path);
      }
      Block oldBlock = oldBlocks[oldBlocks.length - 1];
      boolean removed = fsDir.unprotectedRemoveBlock(path, iip, file, oldBlock);
      if (!removed && !(op instanceof UpdateBlocksOp)) {
        throw new IOException("Trying to delete non-existant block " + oldBlock);
      }
    } else if (newBlocks.length > oldBlocks.length) {
      // We're adding blocks
      for (int i = oldBlocks.length; i < newBlocks.length; i++) {
        Block newBlock = newBlocks[i];
        BlockInfoContiguous newBI;
        if (!op.shouldCompleteLastBlock()) {
          // TODO: shouldn't this only be true for the last block?
          // what about an old-version fsync() where fsync isn't called
          // until several blocks in?
          newBI = new BlockInfoContiguousUnderConstruction(
              newBlock, file.getBlockReplication());
        } else {
          // OP_CLOSE should add finalized blocks. This code path
          // is only executed when loading edits written by prior
          // versions of Hadoop. Current versions always log
          // OP_ADD operations as each block is allocated.
          newBI = new BlockInfoContiguous(newBlock, file.getBlockReplication());
        }
        fsNamesys.getBlockManager().addBlockCollection(newBI, file);
        file.addBlock(newBI);
        fsNamesys.getBlockManager().processQueuedMessagesForBlock(newBlock);
      }
    }
  }

  private static void dumpOpCounts(
      EnumMap<FSEditLogOpCodes, Holder<Integer>> opCounts) {
    StringBuilder sb = new StringBuilder();
    sb.append("Summary of operations loaded from edit log:\n  ");
    Joiner.on("\n  ").withKeyValueSeparator("=").appendTo(sb, opCounts);
    FSImage.LOG.debug(sb.toString());
  }

  private void incrOpCount(FSEditLogOpCodes opCode,
      EnumMap<FSEditLogOpCodes, Holder<Integer>> opCounts, Step step,
      Counter counter) {
    Holder<Integer> holder = opCounts.get(opCode);
    if (holder == null) {
      holder = new Holder<Integer>(1);
      opCounts.put(opCode, holder);
    } else {
      holder.held++;
    }
    counter.increment();
  }

  /**
   * Throw appropriate exception during upgrade from 203, when editlog loading
   * could fail due to opcode conflicts.
   */
  private void check203UpgradeFailure(int logVersion, Throwable e)
      throws IOException {
    // 0.20.203 version version has conflicting opcodes with the later releases.
    // The editlog must be emptied by restarting the namenode, before proceeding
    // with the upgrade.
    if (Storage.is203LayoutVersion(logVersion)
        && logVersion != HdfsConstants.NAMENODE_LAYOUT_VERSION) {
      String msg = "During upgrade failed to load the editlog version "
          + logVersion + " from release 0.20.203. Please go back to the old "
          + " release and restart the namenode. This empties the editlog "
          + " and saves the namespace. Resume the upgrade after this step.";
      throw new IOException(msg, e);
    }
  }
  
  /**
   * Find the last valid transaction ID in the stream.
   * If there are invalid or corrupt transactions in the middle of the stream,
   * validateEditLog will skip over them.
   * This reads through the stream but does not close it.
   */
  static EditLogValidation validateEditLog(EditLogInputStream in) {
    long lastPos = 0;
    long lastTxId = HdfsConstants.INVALID_TXID;
    long numValid = 0;
    FSEditLogOp op = null;
    while (true) {
      lastPos = in.getPosition();
      try {
        if ((op = in.readOp()) == null) {
          break;
        }
      } catch (Throwable t) {
        FSImage.LOG.warn("Caught exception after reading " + numValid +
            " ops from " + in + " while determining its valid length." +
            "Position was " + lastPos, t);
        in.resync();
        FSImage.LOG.warn("After resync, position is " + in.getPosition());
        continue;
      }
      if (lastTxId == HdfsConstants.INVALID_TXID
          || op.getTransactionId() > lastTxId) {
        lastTxId = op.getTransactionId();
      }
      numValid++;
    }
    return new EditLogValidation(lastPos, lastTxId, false);
  }

  static EditLogValidation scanEditLog(EditLogInputStream in) {
    long lastPos = 0;
    long lastTxId = HdfsConstants.INVALID_TXID;
    long numValid = 0;
    FSEditLogOp op = null;
    while (true) {
      lastPos = in.getPosition();
      try {
        if ((op = in.readOp()) == null) { // TODO
          break;
        }
      } catch (Throwable t) {
        FSImage.LOG.warn("Caught exception after reading " + numValid +
            " ops from " + in + " while determining its valid length." +
            "Position was " + lastPos, t);
        in.resync();
        FSImage.LOG.warn("After resync, position is " + in.getPosition());
        continue;
      }
      if (lastTxId == HdfsConstants.INVALID_TXID
          || op.getTransactionId() > lastTxId) {
        lastTxId = op.getTransactionId();
      }
      numValid++;
    }
    return new EditLogValidation(lastPos, lastTxId, false);
  }

  static class EditLogValidation {
    private final long validLength;
    private final long endTxId;
    private final boolean hasCorruptHeader;

    EditLogValidation(long validLength, long endTxId,
        boolean hasCorruptHeader) {
      this.validLength = validLength;
      this.endTxId = endTxId;
      this.hasCorruptHeader = hasCorruptHeader;
    }

    long getValidLength() { return validLength; }

    long getEndTxId() { return endTxId; }

    boolean hasCorruptHeader() { return hasCorruptHeader; }
  }

  /**
   * Stream wrapper that keeps track of the current stream position.
   * 
   * This stream also allows us to set a limit on how many bytes we can read
   * without getting an exception.
   */
  public static class PositionTrackingInputStream extends FilterInputStream
      implements StreamLimiter {
    private long curPos = 0;
    private long markPos = -1;
    private long limitPos = Long.MAX_VALUE;

    public PositionTrackingInputStream(InputStream is) {
      super(is);
    }

    private void checkLimit(long amt) throws IOException {
      long extra = (curPos + amt) - limitPos;
      if (extra > 0) {
        throw new IOException("Tried to read " + amt + " byte(s) past " +
            "the limit at offset " + limitPos);
      }
    }
    
    @Override
    public int read() throws IOException {
      checkLimit(1);
      int ret = super.read();
      if (ret != -1) curPos++;
      return ret;
    }

    @Override
    public int read(byte[] data) throws IOException {
      checkLimit(data.length);
      int ret = super.read(data);
      if (ret > 0) curPos += ret;
      return ret;
    }

    @Override
    public int read(byte[] data, int offset, int length) throws IOException {
      checkLimit(length);
      int ret = super.read(data, offset, length);
      if (ret > 0) curPos += ret;
      return ret;
    }

    @Override
    public void setLimit(long limit) {
      limitPos = curPos + limit;
    }

    @Override
    public void clearLimit() {
      limitPos = Long.MAX_VALUE;
    }

    @Override
    public void mark(int limit) {
      super.mark(limit);
      markPos = curPos;
    }

    @Override
    public void reset() throws IOException {
      if (markPos == -1) {
        throw new IOException("Not marked!");
      }
      super.reset();
      curPos = markPos;
      markPos = -1;
    }

    public long getPos() {
      return curPos;
    }
    
    @Override
    public long skip(long amt) throws IOException {
      long extra = (curPos + amt) - limitPos;
      if (extra > 0) {
        throw new IOException("Tried to skip " + extra + " bytes past " +
            "the limit at offset " + limitPos);
      }
      long ret = super.skip(amt);
      curPos += ret;
      return ret;
    }
  }

  public long getLastAppliedTxId() {
    return lastAppliedTxId;
  }

  /**
   * Creates a Step used for updating startup progress, populated with
   * information from the given edits.  The step always includes the log's name.
   * If the log has a known length, then the length is included in the step too.
   * 
   * @param edits EditLogInputStream to use for populating step
   * @return Step populated with information from edits
   * @throws IOException thrown if there is an I/O error
   */
  private static Step createStartupProgressStep(EditLogInputStream edits)
      throws IOException {
    long length = edits.length();
    String name = edits.getCurrentStreamName();
    return length != -1 ? new Step(name, length) : new Step(name);
  }
}