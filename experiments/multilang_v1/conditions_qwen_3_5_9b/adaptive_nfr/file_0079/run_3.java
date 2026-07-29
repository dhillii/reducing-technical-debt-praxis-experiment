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
import org.apache.hadoop.hdfs.server.namenode.FSEditLogOp.SetQuotaByStorageTypeOp;
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
      return applyAddOp((AddCloseOp)op, fsDir, logVersion, lastInodeId, toAddRetryCache);
    case OP_CLOSE:
      return applyCloseOp((AddCloseOp)op, fsDir, logVersion, lastInodeId, toAddRetryCache);
    case OP_APPEND:
      applyAppendOp((AppendOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_UPDATE_BLOCKS:
      applyUpdateBlocksOp((UpdateBlocksOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_ADD_BLOCK:
      applyAddBlockOp((AddBlockOp)op, fsDir, logVersion, lastInodeId, toAddRetryCache);
      return inodeId;
    case OP_SET_REPLICATION:
      applySetReplicationOp((SetReplicationOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_CONCAT_DELETE:
      applyConcatDeleteOp((ConcatDeleteOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_RENAME_OLD:
      applyRenameOldOp((RenameOldOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_DELETE:
      applyDeleteOp((DeleteOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_MKDIR:
      return applyMkdirOp((MkdirOp)op, fsDir, logVersion, lastInodeId, toAddRetryCache);
    case OP_SET_GENSTAMP_V1:
      applySetGenstampV1Op((SetGenstampV1Op)op);
      return inodeId;
    case OP_SET_PERMISSIONS:
      applySetPermissionsOp((SetPermissionsOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_SET_OWNER:
      applySetOwnerOp((SetOwnerOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_SET_NS_QUOTA:
      applySetNSQuotaOp((SetNSQuotaOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_CLEAR_NS_QUOTA:
      applyClearNSQuotaOp((ClearNSQuotaOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_SET_QUOTA:
      applySetQuotaOp((SetQuotaOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_SET_QUOTA_BY_STORAGETYPE:
      applySetQuotaByStorageTypeOp((SetQuotaByStorageTypeOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_TIMES:
      applyTimesOp((TimesOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_SYMLINK:
      return applySymlinkOp((SymlinkOp)op, fsDir, logVersion, lastInodeId, toAddRetryCache);
    case OP_RENAME:
      applyRenameOp((RenameOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_GET_DELEGATION_TOKEN:
      applyGetDelegationTokenOp((GetDelegationTokenOp)op);
      return inodeId;
    case OP_RENEW_DELEGATION_TOKEN:
      applyRenewDelegationTokenOp((RenewDelegationTokenOp)op);
      return inodeId;
    case OP_CANCEL_DELEGATION_TOKEN:
      applyCancelDelegationTokenOp((CancelDelegationTokenOp)op);
      return inodeId;
    case OP_UPDATE_MASTER_KEY:
      applyUpdateMasterKeyOp((UpdateMasterKeyOp)op);
      return inodeId;
    case OP_REASSIGN_LEASE:
      applyReassignLeaseOp((ReassignLeaseOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_START_LOG_SEGMENT:
    case OP_END_LOG_SEGMENT:
      // no data in here currently.
      return inodeId;
    case OP_CREATE_SNAPSHOT:
      return applyCreateSnapshotOp((CreateSnapshotOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_DELETE_SNAPSHOT:
      return applyDeleteSnapshotOp((DeleteSnapshotOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_RENAME_SNAPSHOT:
      return applyRenameSnapshotOp((RenameSnapshotOp)op, fsDir, logVersion, toAddRetryCache);
    case OP_ALLOW_SNAPSHOT:
      applyAllowSnapshotOp((AllowSnapshotOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_DISALLOW_SNAPSHOT:
      applyDisallowSnapshotOp((DisallowSnapshotOp)op, fsDir, logVersion, toAddRetryCache);
      return inodeId;
    case OP_SET_GENSTAMP_V2:
      applySetGenstampV2Op((SetGenstampV2Op)op);
      return inodeId;
    case OP_ALLOCATE_BLOCK_ID:
      applyAllocateBlockIdOp((AllocateBlockIdOp)op);
      return inodeId;
    case OP_ROLLING_UPGRADE_START:
      return applyRollingUpgradeStartOp(startOpt, op, toAddRetryCache);
    case OP_ROLLING_UPGRADE_FINALIZE:
      applyRollingUpgradeFinalizeOp(op, toAddRetryCache);
      return inodeId;
    case OP_ADD_CACHE_DIRECTIVE:
      return applyAddCacheDirectiveOp((AddCacheDirectiveInfoOp)op, toAddRetryCache);
    case OP_MODIFY_CACHE_DIRECTIVE:
      applyModifyCacheDirectiveOp((ModifyCacheDirectiveInfoOp)op, toAddRetryCache);
      return inodeId;
    case OP_REMOVE_CACHE_DIRECTIVE:
      applyRemoveCacheDirectiveOp((RemoveCacheDirectiveInfoOp)op, toAddRetryCache);
      return inodeId;
    case OP_ADD_CACHE_POOL:
      return applyAddCachePoolOp((AddCachePoolOp)op, toAddRetryCache);
    case OP_MODIFY_CACHE_POOL:
      applyModifyCachePoolOp((ModifyCachePoolOp)op, toAddRetryCache);
      return inodeId;
    case OP_REMOVE_CACHE_POOL:
      applyRemoveCachePoolOp((RemoveCachePoolOp)op, toAddRetryCache);
      return inodeId;
    case OP_SET_ACL:
      applySetAclOp((SetAclOp)op, fsDir, toAddRetryCache);
      return inodeId;
    case OP_SET_XATTR:
      applySetXAttrOp((SetXAttrOp)op, fsDir, toAddRetryCache);
      return inodeId;
    case OP_REMOVE_XATTR:
      applyRemoveXAttrOp((RemoveXAttrOp)op, fsDir, toAddRetryCache);
      return inodeId;
    case OP_TRUNCATE:
      applyTruncateOp((TruncateOp)op, fsDir, toAddRetryCache);
      return inodeId;
    case OP_SET_STORAGE_POLICY:
      return applySetStoragePolicyOp((SetStoragePolicyOp)op, fsDir, logVersion, toAddRetryCache);
    default:
      throw new IOException("Invalid operation read " + op.opCode);
    }
  }
  
  private long applyAddOp(AddCloseOp op, FSDirectory fsDir, int logVersion,
      long lastInodeId, boolean toAddRetryCache) throws IOException {
    final String path = renameReservedPathsOnUpgrade(op.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " numblocks : " + op.blocks.length +
          " clientHolder " + op.clientName +
          " clientMachine " + op.clientMachine);
    }
    // There are 3 cases here:
    // 1. OP_ADD to create a new file
    // 2. OP_ADD to update file blocks
    // 3. OP_ADD to open file for append (old append)

    // See if the file already exists (persistBlocks call)
    INodesInPath iip = fsDir.getINodesInPath(path, true);
    INodeFile oldFile = INodeFile.valueOf(iip.getLastINode(), path, true);
    if (oldFile != null && op.overwrite) {
      // This is OP_ADD with overwrite
      FSDirDeleteOp.deleteForEditLog(fsDir, path, op.mtime);
      iip = INodesInPath.replace(iip, iip.length() - 1, null);
      oldFile = null;
    }
    INodeFile newFile = oldFile;
    if (oldFile == null) { // this is OP_ADD on a new file (case 1)
      // versions > 0 support per file replication
      // get name and replication
      final short replication = fsNamesys.getBlockManager()
          .adjustReplication(op.replication);
      assert op.blocks.length == 0;

      // add to the file tree
      inodeId = getAndUpdateLastInodeId(op.inodeId, logVersion, lastInodeId);
      newFile = fsDir.addFileForEditLog(inodeId, iip.getExistingINodes(),
          iip.getLastLocalName(),
          op.permissions,
          op.aclEntries,
          op.xAttrs, replication,
          op.mtime, op.atime,
          op.blockSize, true,
          op.clientName,
          op.clientMachine,
          op.storagePolicyId);
      iip = INodesInPath.replace(iip, iip.length() - 1, newFile);
      fsNamesys.leaseManager.addLease(op.clientName, path);

      // add the op into retry cache if necessary
      if (toAddRetryCache) {
        HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
            fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, newFile,
            BlockStoragePolicySuite.ID_UNSPECIFIED, Snapshot.CURRENT_STATE_ID,
            false, iip);
        fsNamesys.addCacheEntryWithPayload(op.rpcClientId,
            op.rpcCallId, stat);
      }
    } else { // This is OP_ADD on an existing file (old append)
      if (!oldFile.isUnderConstruction()) {
        // This is case 3: a call to append() on an already-closed file.
        if (FSNamesystem.LOG.isDebugEnabled()) {
          FSNamesystem.LOG.debug("Reopening an already-closed file " +
              "for append");
        }
        LocatedBlock lb = fsNamesys.prepareFileForAppend(path, iip,
            op.clientName, op.clientMachine, false, false,
            false);
        // add the op into retry cache if necessary
        if (toAddRetryCache) {
          HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
              fsNamesys.dir, path,
              HdfsFileStatus.EMPTY_NAME, newFile,
              BlockStoragePolicySuite.ID_UNSPECIFIED,
              Snapshot.CURRENT_STATE_ID, false, iip);
          fsNamesys.addCacheEntryWithPayload(op.rpcClientId,
              op.rpcCallId, new LastBlockWithStatus(lb, stat));
        }
      }
    }
    // Fall-through for case 2.
    // Regardless of whether it's a new file or an updated file,
    // update the block list.
    
    // Update the salient file attributes.
    newFile.setAccessTime(op.atime, Snapshot.CURRENT_STATE_ID);
    newFile.setModificationTime(op.mtime, Snapshot.CURRENT_STATE_ID);
    updateBlocks(fsDir, op, iip, newFile);
    return inodeId;
  }

  private long applyCloseOp(AddCloseOp op, FSDirectory fsDir, int logVersion,
      long lastInodeId, boolean toAddRetryCache) throws IOException {
    final String path = renameReservedPathsOnUpgrade(op.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " numblocks : " + op.blocks.length +
          " clientHolder " + op.clientName +
          " clientMachine " + op.clientMachine);
    }

    final INodesInPath iip = fsDir.getINodesInPath(path, true);
    final INodeFile file = INodeFile.valueOf(iip.getLastINode(), path);

    // Update the salient file attributes.
    file.setAccessTime(op.atime, Snapshot.CURRENT_STATE_ID);
    file.setModificationTime(op.mtime, Snapshot.CURRENT_STATE_ID);
    updateBlocks(fsDir, op, iip, file);

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
    return inodeId;
  }

  private void applyAppendOp(AppendOp op, FSDirectory fsDir, int logVersion,
      boolean toAddRetryCache) throws IOException {
    final String path = renameReservedPathsOnUpgrade(op.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " clientName " + op.clientName +
          " clientMachine " + op.clientMachine +
          " newBlock " + op.newBlock);
    }
    INodesInPath iip = fsDir.getINodesInPath4Write(path);
    INodeFile file = INodeFile.valueOf(iip.getLastINode(), path);
    if (!file.isUnderConstruction()) {
      LocatedBlock lb = fsNamesys.prepareFileForAppend(path, iip,
          op.clientName, op.clientMachine, op.newBlock,
          false, false);
      // add the op into retry cache if necessary
      if (toAddRetryCache) {
        HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
            fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, file,
            BlockStoragePolicySuite.ID_UNSPECIFIED,
            Snapshot.CURRENT_STATE_ID, false, iip);
        fsNamesys.addCacheEntryWithPayload(op.rpcClientId,
            op.rpcCallId, new LastBlockWithStatus(lb, stat));
      }
    }
  }

  private void applyUpdateBlocksOp(UpdateBlocksOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String path = renameReservedPathsOnUpgrade(op.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " numblocks : " + op.blocks.length);
    }
    INodesInPath iip = fsDir.getINodesInPath(path, true);
    INodeFile oldFile = INodeFile.valueOf(iip.getLastINode(), path);
    // Update in-memory data structures
    updateBlocks(fsDir, op, iip, oldFile);
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applyAddBlockOp(AddBlockOp op, FSDirectory fsDir, int logVersion,
      long lastInodeId, boolean toAddRetryCache) throws IOException {
    String path = renameReservedPathsOnUpgrade(op.getPath(), logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " new block id : " + op.getLastBlock().getBlockId());
    }
    INodeFile oldFile = INodeFile.valueOf(fsDir.getINode(path), path);
    // add the new block to the INodeFile
    addNewBlock(fsDir, op, oldFile);
  }

  private void applySetReplicationOp(SetReplicationOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    short replication = fsNamesys.getBlockManager().adjustReplication(
        op.replication);
    FSDirAttrOp.unprotectedSetReplication(fsDir, renameReservedPathsOnUpgrade(
        op.path, logVersion), replication, null);
  }

  private void applyConcatDeleteOp(ConcatDeleteOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    String trg = renameReservedPathsOnUpgrade(op.trg, logVersion);
    String[] srcs = new String[op.srcs.length];
    for (int i=0; i<srcs.length; i++) {
      srcs[i] =
          renameReservedPathsOnUpgrade(op.srcs[i], logVersion);
    }
    INodesInPath targetIIP = fsDir.getINodesInPath4Write(trg);
    INodeFile[] srcFiles = new INodeFile[srcs.length];
    for (int i = 0; i < srcs.length; i++) {
      INodesInPath srcIIP = fsDir.getINodesInPath4Write(srcs[i]);
      srcFiles[i] = srcIIP.getLastINode().asFile();
    }
    FSDirConcatOp.unprotectedConcat(fsDir, targetIIP, srcFiles,
        op.timestamp);
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applyRenameOldOp(RenameOldOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String src = renameReservedPathsOnUpgrade(op.src, logVersion);
    final String dst = renameReservedPathsOnUpgrade(op.dst, logVersion);
    FSDirRenameOp.renameForEditLog(fsDir, src, dst, op.timestamp);
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applyDeleteOp(DeleteOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirDeleteOp.deleteForEditLog(
        fsDir, renameReservedPathsOnUpgrade(op.path, logVersion),
        op.timestamp);
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private long applyMkdirOp(MkdirOp op, FSDirectory fsDir, int logVersion,
      long lastInodeId, boolean toAddRetryCache) throws IOException {
    inodeId = getAndUpdateLastInodeId(op.inodeId, logVersion,
        lastInodeId);
    FSDirMkdirOp.mkdirForEditLog(fsDir, inodeId,
        renameReservedPathsOnUpgrade(op.path, logVersion),
        op.permissions, op.aclEntries, op.timestamp);
    return inodeId;
  }

  private void applySetGenstampV1Op(SetGenstampV1Op op) throws IOException {
    fsNamesys.getBlockIdManager().setGenerationStampV1(
        op.genStampV1);
  }

  private void applySetPermissionsOp(SetPermissionsOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirAttrOp.unprotectedSetPermission(fsDir, renameReservedPathsOnUpgrade(
        op.src, logVersion), op.permissions);
  }

  private void applySetOwnerOp(SetOwnerOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirAttrOp.unprotectedSetOwner(
        fsDir, renameReservedPathsOnUpgrade(op.src, logVersion),
        op.username, op.groupname);
  }

  private void applySetNSQuotaOp(SetNSQuotaOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirAttrOp.unprotectedSetQuota(
        fsDir, renameReservedPathsOnUpgrade(op.src, logVersion),
        op.nsQuota, HdfsConstants.QUOTA_DONT_SET, null);
  }

  private void applyClearNSQuotaOp(ClearNSQuotaOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirAttrOp.unprotectedSetQuota(
        fsDir, renameReservedPathsOnUpgrade(op.src, logVersion),
        HdfsConstants.QUOTA_RESET, HdfsConstants.QUOTA_DONT_SET, null);
  }

  private void applySetQuotaOp(SetQuotaOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirAttrOp.unprotectedSetQuota(fsDir,
        renameReservedPathsOnUpgrade(op.src, logVersion),
        op.nsQuota, op.dsQuota, null);
  }

  private void applySetQuotaByStorageTypeOp(SetQuotaByStorageTypeOp op,
      FSDirectory fsDir, int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirAttrOp.unprotectedSetQuota(fsDir,
      renameReservedPathsOnUpgrade(op.src, logVersion),
      HdfsConstants.QUOTA_DONT_SET, op.dsQuota,
      op.type);
  }

  private void applyTimesOp(TimesOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirAttrOp.unprotectedSetTimes(
        fsDir, renameReservedPathsOnUpgrade(op.path, logVersion),
        op.mtime, op.atime, true);
  }

  private long applySymlinkOp(SymlinkOp op, FSDirectory fsDir, int logVersion,
      long lastInodeId, boolean toAddRetryCache) throws IOException {
    if (!FileSystem.areSymlinksEnabled()) {
      throw new IOException("Symlinks not supported - please remove symlink before upgrading to this version of HDFS");
    }
    inodeId = getAndUpdateLastInodeId(op.inodeId, logVersion,
        lastInodeId);
    final String path = renameReservedPathsOnUpgrade(op.path,
        logVersion);
    final INodesInPath iip = fsDir.getINodesInPath(path, false);
    FSDirSymlinkOp.unprotectedAddSymlink(fsDir, iip.getExistingINodes(),
        iip.getLastLocalName(), inodeId, op.value, op.mtime,
        op.atime, op.permissionStatus);
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
    return inodeId;
  }

  private void applyRenameOp(RenameOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirRenameOp.renameForEditLog(fsDir,
        renameReservedPathsOnUpgrade(op.src, logVersion),
        renameReservedPathsOnUpgrade(op.dst, logVersion),
        op.timestamp, op.options);
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applyGetDelegationTokenOp(GetDelegationTokenOp op) throws IOException {
    fsNamesys.getDelegationTokenSecretManager()
      .addPersistedDelegationToken(op.token,
         op.expiryTime);
  }

  private void applyRenewDelegationTokenOp(RenewDelegationTokenOp op) throws IOException {
    fsNamesys.getDelegationTokenSecretManager()
      .updatePersistedTokenRenewal(op.token,
         op.expiryTime);
  }

  private void applyCancelDelegationTokenOp(CancelDelegationTokenOp op) throws IOException {
    fsNamesys.getDelegationTokenSecretManager()
        .updatePersistedTokenCancellation(
            op.token);
  }

  private void applyUpdateMasterKeyOp(UpdateMasterKeyOp op) throws IOException {
    fsNamesys.getDelegationTokenSecretManager()
      .updatePersistedMasterKey(op.key);
  }

  private void applyReassignLeaseOp(ReassignLeaseOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    Lease lease = fsNamesys.leaseManager.getLease(
        op.leaseHolder);
    final String path =
        renameReservedPathsOnUpgrade(op.path, logVersion);
    INodeFile pendingFile = fsDir.getINode(path).asFile();
    Preconditions.checkState(pendingFile.isUnderConstruction());
    fsNamesys.reassignLeaseInternal(lease,
        path, op.newHolder, pendingFile);
  }

  private long applyCreateSnapshotOp(CreateSnapshotOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(op.snapshotRoot,
            logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    String path = fsNamesys.getSnapshotManager().createSnapshot(iip,
        snapshotRoot, op.snapshotName);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntryWithPayload(op.rpcClientId,
          op.rpcCallId, path);
    }
    return inodeId;
  }

  private long applyDeleteSnapshotOp(DeleteSnapshotOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    BlocksMapUpdateInfo collectedBlocks = new BlocksMapUpdateInfo();
    List<INode> removedINodes = new ChunkedArrayList<INode>();
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(op.snapshotRoot,
            logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    fsNamesys.getSnapshotManager().deleteSnapshot(
        iip, op.snapshotName,
        collectedBlocks, removedINodes);
    fsNamesys.removeBlocksAndUpdateSafemodeTotal(collectedBlocks);
    collectedBlocks.clear();
    fsNamesys.dir.removeFromInodeMap(removedINodes);
    removedINodes.clear();
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId,
          op.rpcCallId);
    }
    return inodeId;
  }

  private long applyRenameSnapshotOp(RenameSnapshotOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(op.snapshotRoot,
            logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    fsNamesys.getSnapshotManager().renameSnapshot(iip,
        snapshotRoot, op.snapshotOldName,
        op.snapshotNewName);
    
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId,
          op.rpcCallId);
    }
    return inodeId;
  }

  private void applyAllowSnapshotOp(AllowSnapshotOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(op.snapshotRoot,
            logVersion);
    fsNamesys.getSnapshotManager().setSnapshottable(
        snapshotRoot, false);
  }

  private void applyDisallowSnapshotOp(DisallowSnapshotOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String snapshotRoot =
        renameReservedPathsOnUpgrade(op.snapshotRoot,
            logVersion);
    fsNamesys.getSnapshotManager().resetSnapshottable(
        snapshotRoot);
  }

  private void applySetGenstampV2Op(SetGenstampV2Op op) throws IOException {
    fsNamesys.getBlockIdManager().setGenerationStampV2(
        op.genStampV2);
  }

  private void applyAllocateBlockIdOp(AllocateBlockIdOp op) throws IOException {
    fsNamesys.getBlockIdManager().setLastAllocatedBlockId(
        op.blockId);
  }

  private long applyRollingUpgradeStartOp(StartupOption startOpt,
      RollingUpgradeOp op, boolean toAddRetryCache) throws IOException {
    if (startOpt == StartupOption.ROLLINGUPGRADE) {
      final RollingUpgradeStartupOption rollingUpgradeOpt
          = startOpt.getRollingUpgradeStartupOption(); 
      if (rollingUpgradeOpt == RollingUpgradeStartupOption.ROLLBACK) {
        throw new RollingUpgradeOp.RollbackException();
      } else if (rollingUpgradeOpt == RollingUpgradeStartupOption.DOWNGRADE) {
        //ignore upgrade marker
        return inodeId;
      }
    }
    // start rolling upgrade
    final long startTime = op.getTime();
    fsNamesys.startRollingUpgradeInternal(startTime);
    fsNamesys.triggerRollbackCheckpoint();
    return inodeId;
  }

  private void applyRollingUpgradeFinalizeOp(RollingUpgradeOp op,
      boolean toAddRetryCache) throws IOException {
    final long finalizeTime = op.getTime();
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

  private long applyAddCacheDirectiveOp(AddCacheDirectiveInfoOp op,
      boolean toAddRetryCache) throws IOException {
    CacheDirectiveInfo result = fsNamesys.
        getCacheManager().addDirectiveFromEditLog(op.directive);
    if (toAddRetryCache) {
      Long id = result.getId();
      fsNamesys.addCacheEntryWithPayload(op.rpcClientId, op.rpcCallId, id);
    }
    return inodeId;
  }

  private void applyModifyCacheDirectiveOp(ModifyCacheDirectiveInfoOp op,
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().modifyDirectiveFromEditLog(
        op.directive);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applyRemoveCacheDirectiveOp(RemoveCacheDirectiveInfoOp op,
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().removeDirective(op.id, null);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private long applyAddCachePoolOp(AddCachePoolOp op, boolean toAddRetryCache)
      throws IOException {
    fsNamesys.getCacheManager().addCachePool(op.info);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
    return inodeId;
  }

  private void applyModifyCachePoolOp(ModifyCachePoolOp op,
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().modifyCachePool(op.info);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applyRemoveCachePoolOp(RemoveCachePoolOp op,
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().removeCachePool(op.poolName);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applySetAclOp(SetAclOp op, FSDirectory fsDir,
      boolean toAddRetryCache) throws IOException {
    FSDirAclOp.unprotectedSetAcl(fsDir, op.src, op.aclEntries,
        true);
  }

  private void applySetXAttrOp(SetXAttrOp op, FSDirectory fsDir,
      boolean toAddRetryCache) throws IOException {
    FSDirXAttrOp.unprotectedSetXAttrs(fsDir, op.src,
                                      op.xAttrs,
                                      EnumSet.of(XAttrSetFlag.CREATE,
                                                 XAttrSetFlag.REPLACE));
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void applyRemoveXAttrOp(RemoveXAttrOp op, FSDirectory fsDir,
      boolean toAddRetryCache) throws IOException {
    FSDirXAttrOp.unprotectedRemoveXAttrs(fsDir, op.src,
                                         op.xAttrs);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId,
          op.rpcCallId);
    }
  }

  private void applyTruncateOp(TruncateOp op, FSDirectory fsDir,
      boolean toAddRetryCache) throws IOException {
    fsDir.unprotectedTruncate(op.src, op.clientName,
        op.clientMachine, op.newLength, op.timestamp,
        op.truncateBlock);
  }

  private long applySetStoragePolicyOp(SetStoragePolicyOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String path = renameReservedPathsOnUpgrade(op.path,
        logVersion);
    final INodesInPath iip = fsDir.getINodesInPath4Write(path);
    FSDirAttrOp.unprotectedSetStoragePolicy(
        fsDir, fsNamesys.getBlockManager(), iip,
        op.policyId);
    return inodeId;
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