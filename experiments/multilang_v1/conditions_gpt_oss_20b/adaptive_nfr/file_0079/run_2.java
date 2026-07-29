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

  private final EnumMap<FSEditLogOpCodes, OpHandler> handlers =
      new EnumMap<>(FSEditLogOpCodes.class);

  public FSEditLogLoader(FSNamesystem fsNamesys, long lastAppliedTxId) {
    this.fsNamesys = fsNamesys;
    this.lastAppliedTxId = lastAppliedTxId;
    initHandlers();
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

  private interface OpHandler {
    long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId) throws IOException;
  }

  private void initHandlers() {
    handlers.put(FSEditLogOpCodes.OP_ADD, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        AddCloseOp addCloseOp = (AddCloseOp)op;
        final String path =
            renameReservedPathsOnUpgrade(addCloseOp.path, logVersion);
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
          assert addCloseOp.blocks.length == 0;
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
          boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
          if (toAddRetryCache) {
            HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
                fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, newFile,
                BlockStoragePolicySuite.ID_UNSPECIFIED, Snapshot.CURRENT_STATE_ID,
                false, iip);
            fsNamesys.addCacheEntryWithPayload(addCloseOp.rpcClientId,
                addCloseOp.rpcCallId, stat);
          }
        } else {
          boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
          if (!oldFile.isUnderConstruction()) {
            if (FSNamesystem.LOG.isDebugEnabled()) {
              FSNamesystem.LOG.debug("Reopening an already-closed file " +
                  "for append");
            }
            LocatedBlock lb = fsNamesys.prepareFileForAppend(path, iip,
                addCloseOp.clientName, addCloseOp.clientMachine, false, false,
                false);
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
        newFile.setAccessTime(addCloseOp.atime, Snapshot.CURRENT_STATE_ID);
        newFile.setModificationTime(addCloseOp.mtime, Snapshot.CURRENT_STATE_ID);
        updateBlocks(fsDir, addCloseOp, iip, newFile);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_CLOSE, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
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
        file.setAccessTime(addCloseOp.atime, Snapshot.CURRENT_STATE_ID);
        file.setModificationTime(addCloseOp.mtime, Snapshot.CURRENT_STATE_ID);
        updateBlocks(fsDir, addCloseOp, iip, file);
        if (!file.isUnderConstruction() &&
            logVersion <= LayoutVersion.BUGFIX_HDFS_2991_VERSION) {
          throw new IOException(
              "File is not under construction: " + path);
        }
        if (file.isUnderConstruction()) {
          fsNamesys.leaseManager.removeLeaseWithPrefixPath(path);
          file.toCompleteFile(file.getModificationTime());
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_APPEND, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
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
          boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
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
    });

    handlers.put(FSEditLogOpCodes.OP_UPDATE_BLOCKS, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        UpdateBlocksOp updateOp = (UpdateBlocksOp)op;
        final String path =
            renameReservedPathsOnUpgrade(updateOp.path, logVersion);
        if (FSNamesystem.LOG.isDebugEnabled()) {
          FSNamesystem.LOG.debug(op.opCode + ": " + path +
              " numblocks : " + updateOp.blocks.length);
        }
        INodesInPath iip = fsDir.getINodesInPath(path, true);
        INodeFile oldFile = INodeFile.valueOf(iip.getLastINode(), path);
        updateBlocks(fsDir, updateOp, iip, oldFile);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(updateOp.rpcClientId, updateOp.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_ADD_BLOCK, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        AddBlockOp addBlockOp = (AddBlockOp) op;
        String path = renameReservedPathsOnUpgrade(addBlockOp.getPath(), logVersion);
        if (FSNamesystem.LOG.isDebugEnabled()) {
          FSNamesystem.LOG.debug(op.opCode + ": " + path +
              " new block id : " + addBlockOp.getLastBlock().getBlockId());
        }
        INodeFile oldFile = INodeFile.valueOf(fsDir.getINode(path), path);
        addNewBlock(fsDir, addBlockOp, oldFile);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SET_REPLICATION, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        SetReplicationOp setReplicationOp = (SetReplicationOp)op;
        short replication = fsNamesys.getBlockManager().adjustReplication(
            setReplicationOp.replication);
        FSDirAttrOp.unprotectedSetReplication(fsDir, renameReservedPathsOnUpgrade(
            setReplicationOp.path, logVersion), replication, null);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_CONCAT_DELETE, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
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
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(concatDeleteOp.rpcClientId,
              concatDeleteOp.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_RENAME_OLD, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        RenameOldOp renameOp = (RenameOldOp)op;
        final String src = renameReservedPathsOnUpgrade(renameOp.src, logVersion);
        final String dst = renameReservedPathsOnUpgrade(renameOp.dst, logVersion);
        FSDirRenameOp.renameForEditLog(fsDir, src, dst, renameOp.timestamp);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_DELETE, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        DeleteOp deleteOp = (DeleteOp)op;
        FSDirDeleteOp.deleteForEditLog(
            fsDir, renameReservedPathsOnUpgrade(deleteOp.path, logVersion),
            deleteOp.timestamp);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(deleteOp.rpcClientId, deleteOp.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_MKDIR, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        MkdirOp mkdirOp = (MkdirOp)op;
        long inodeId = getAndUpdateLastInodeId(mkdirOp.inodeId, logVersion,
            lastInodeId);
        FSDirMkdirOp.mkdirForEditLog(fsDir, inodeId,
            renameReservedPathsOnUpgrade(mkdirOp.path, logVersion),
            mkdirOp.permissions, mkdirOp.aclEntries, mkdirOp.timestamp);
        return inodeId;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SET_GENSTAMP_V1, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        SetGenstampV1Op setGenstampV1Op = (SetGenstampV1Op)op;
        fsNamesys.getBlockIdManager().setGenerationStampV1(
            setGenstampV1Op.genStampV1);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SET_PERMISSIONS, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        SetPermissionsOp setPermissionsOp = (SetPermissionsOp)op;
        FSDirAttrOp.unprotectedSetPermission(fsDir, renameReservedPathsOnUpgrade(
            setPermissionsOp.src, logVersion), setPermissionsOp.permissions);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SET_OWNER, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        SetOwnerOp setOwnerOp = (SetOwnerOp)op;
        FSDirAttrOp.unprotectedSetOwner(
            fsDir, renameReservedPathsOnUpgrade(setOwnerOp.src, logVersion),
            setOwnerOp.username, setOwnerOp.groupname);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SET_NS_QUOTA, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        SetNSQuotaOp setNSQuotaOp = (SetNSQuotaOp)op;
        FSDirAttrOp.unprotectedSetQuota(
            fsDir, renameReservedPathsOnUpgrade(setNSQuotaOp.src, logVersion),
            setNSQuotaOp.nsQuota, HdfsConstants.QUOTA_DONT_SET, null);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_CLEAR_NS_QUOTA, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        ClearNSQuotaOp clearNSQuotaOp = (ClearNSQuotaOp)op;
        FSDirAttrOp.unprotectedSetQuota(
            fsDir, renameReservedPathsOnUpgrade(clearNSQuotaOp.src, logVersion),
            HdfsConstants.QUOTA_RESET, HdfsConstants.QUOTA_DONT_SET, null);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SET_QUOTA, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        SetQuotaOp setQuotaOp = (SetQuotaOp) op;
        FSDirAttrOp.unprotectedSetQuota(fsDir,
            renameReservedPathsOnUpgrade(setQuotaOp.src, logVersion),
            setQuotaOp.nsQuota, setQuotaOp.dsQuota, null);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SET_QUOTA_BY_STORAGETYPE, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        FSEditLogOp.SetQuotaByStorageTypeOp setQuotaByStorageTypeOp =
          (FSEditLogOp.SetQuotaByStorageTypeOp) op;
        FSDirAttrOp.unprotectedSetQuota(fsDir,
          renameReservedPathsOnUpgrade(setQuotaByStorageTypeOp.src, logVersion),
          HdfsConstants.QUOTA_DONT_SET, setQuotaByStorageTypeOp.dsQuota,
          setQuotaByStorageTypeOp.type);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_TIMES, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        TimesOp timesOp = (TimesOp)op;
        FSDirAttrOp.unprotectedSetTimes(
            fsDir, renameReservedPathsOnUpgrade(timesOp.path, logVersion),
            timesOp.mtime, timesOp.atime, true);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SYMLINK, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
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
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(symlinkOp.rpcClientId, symlinkOp.rpcCallId);
        }
        return inodeId;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_RENAME, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        RenameOp renameOp = (RenameOp)op;
        FSDirRenameOp.renameForEditLog(fsDir,
            renameReservedPathsOnUpgrade(renameOp.src, logVersion),
            renameReservedPathsOnUpgrade(renameOp.dst, logVersion),
            renameOp.timestamp, renameOp.options);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_GET_DELEGATION_TOKEN, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        GetDelegationTokenOp getDelegationTokenOp
          = (GetDelegationTokenOp)op;
        fsNamesys.getDelegationTokenSecretManager()
          .addPersistedDelegationToken(getDelegationTokenOp.token,
                                       getDelegationTokenOp.expiryTime);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_RENEW_DELEGATION_TOKEN, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        RenewDelegationTokenOp renewDelegationTokenOp
          = (RenewDelegationTokenOp)op;
        fsNamesys.getDelegationTokenSecretManager()
          .updatePersistedTokenRenewal(renewDelegationTokenOp.token,
                                       renewDelegationTokenOp.expiryTime);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_CANCEL_DELEGATION_TOKEN, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        CancelDelegationTokenOp cancelDelegationTokenOp
          = (CancelDelegationTokenOp)op;
        fsNamesys.getDelegationTokenSecretManager()
            .updatePersistedTokenCancellation(
                cancelDelegationTokenOp.token);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_UPDATE_MASTER_KEY, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        UpdateMasterKeyOp updateMasterKeyOp = (UpdateMasterKeyOp)op;
        fsNamesys.getDelegationTokenSecretManager()
          .updatePersistedMasterKey(updateMasterKeyOp.key);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_REASSIGN_LEASE, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        ReassignLeaseOp reassignLeaseOp = (ReassignLeaseOp)op;
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
    });

    handlers.put(FSEditLogOpCodes.OP_START_LOG_SEGMENT, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_END_LOG_SEGMENT, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_CREATE_SNAPSHOT, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        CreateSnapshotOp createSnapshotOp = (CreateSnapshotOp) op;
        final String snapshotRoot =
            renameReservedPathsOnUpgrade(createSnapshotOp.snapshotRoot,
                logVersion);
        INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
        String path = fsNamesys.getSnapshotManager().createSnapshot(iip,
            snapshotRoot, createSnapshotOp.snapshotName);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntryWithPayload(createSnapshotOp.rpcClientId,
              createSnapshotOp.rpcCallId, path);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_DELETE_SNAPSHOT, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
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
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(deleteSnapshotOp.rpcClientId,
              deleteSnapshotOp.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_RENAME_SNAPSHOT, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        RenameSnapshotOp renameSnapshotOp = (RenameSnapshotOp) op;
        final String snapshotRoot =
            renameReservedPathsOnUpgrade(renameSnapshotOp.snapshotRoot,
                logVersion);
        INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
        fsNamesys.getSnapshotManager().renameSnapshot(iip,
            snapshotRoot, renameSnapshotOp.snapshotOldName,
            renameSnapshotOp.snapshotNewName);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(renameSnapshotOp.rpcClientId,
              renameSnapshotOp.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_ALLOW_SNAPSHOT, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        AllowSnapshotOp allowSnapshotOp = (AllowSnapshotOp) op;
        final String snapshotRoot =
            renameReservedPathsOnUpgrade(allowSnapshotOp.snapshotRoot, logVersion);
        fsNamesys.getSnapshotManager().setSnapshottable(
            snapshotRoot, false);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_DISALLOW_SNAPSHOT, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        DisallowSnapshotOp disallowSnapshotOp = (DisallowSnapshotOp) op;
        final String snapshotRoot =
            renameReservedPathsOnUpgrade(disallowSnapshotOp.snapshotRoot,
                logVersion);
        fsNamesys.getSnapshotManager().resetSnapshottable(
            snapshotRoot);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SET_GENSTAMP_V2, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        SetGenstampV2Op setGenstampV2Op = (SetGenstampV2Op) op;
        fsNamesys.getBlockIdManager().setGenerationStampV2(
            setGenstampV2Op.genStampV2);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_ALLOCATE_BLOCK_ID, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        AllocateBlockIdOp allocateBlockIdOp = (AllocateBlockIdOp) op;
        fsNamesys.getBlockIdManager().setLastAllocatedBlockId(
            allocateBlockIdOp.blockId);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_ROLLING_UPGRADE_START, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        if (startOpt == StartupOption.ROLLINGUPGRADE) {
          final RollingUpgradeStartupOption rollingUpgradeOpt
              = startOpt.getRollingUpgradeStartupOption(); 
          if (rollingUpgradeOpt == RollingUpgradeStartupOption.ROLLBACK) {
            throw new RollingUpgradeOp.RollbackException();
          } else if (rollingUpgradeOpt == RollingUpgradeStartupOption.DOWNGRADE) {
            break;
          }
        }
        final long startTime = ((RollingUpgradeOp) op).getTime();
        fsNamesys.startRollingUpgradeInternal(startTime);
        fsNamesys.triggerRollbackCheckpoint();
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_ROLLING_UPGRADE_FINALIZE, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        final long finalizeTime = ((RollingUpgradeOp) op).getTime();
        if (fsNamesys.isRollingUpgrade()) {
          fsNamesys.finalizeRollingUpgradeInternal(finalizeTime);
        }
        fsNamesys.getFSImage().updateStorageVersion();
        fsNamesys.getFSImage().renameCheckpoint(NameNodeFile.IMAGE_ROLLBACK,
            NameNodeFile.IMAGE);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_ADD_CACHE_DIRECTIVE, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        AddCacheDirectiveInfoOp addOp = (AddCacheDirectiveInfoOp) op;
        CacheDirectiveInfo result = fsNamesys.
            getCacheManager().addDirectiveFromEditLog(addOp.directive);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          Long id = result.getId();
          fsNamesys.addCacheEntryWithPayload(op.rpcClientId, op.rpcCallId, id);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_MODIFY_CACHE_DIRECTIVE, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        ModifyCacheDirectiveInfoOp modifyOp =
            (ModifyCacheDirectiveInfoOp) op;
        fsNamesys.getCacheManager().modifyDirectiveFromEditLog(
            modifyOp.directive);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_REMOVE_CACHE_DIRECTIVE, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        RemoveCacheDirectiveInfoOp removeOp =
            (RemoveCacheDirectiveInfoOp) op;
        fsNamesys.getCacheManager().removeDirective(removeOp.id, null);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_ADD_CACHE_POOL, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        AddCachePoolOp addOp = (AddCachePoolOp) op;
        fsNamesys.getCacheManager().addCachePool(addOp.info);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_MODIFY_CACHE_POOL, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        ModifyCachePoolOp modifyOp = (ModifyCachePoolOp) op;
        fsNamesys.getCacheManager().modifyCachePool(modifyOp.info);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_REMOVE_CACHE_POOL, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        RemoveCachePoolOp removeOp = (RemoveCachePoolOp) op;
        fsNamesys.getCacheManager().removeCachePool(removeOp.poolName);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SET_ACL, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        SetAclOp setAclOp = (SetAclOp) op;
        FSDirAclOp.unprotectedSetAcl(fsDir, setAclOp.src, setAclOp.aclEntries,
            true);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SET_XATTR, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        SetXAttrOp setXAttrOp = (SetXAttrOp) op;
        FSDirXAttrOp.unprotectedSetXAttrs(fsDir, setXAttrOp.src,
                                          setXAttrOp.xAttrs,
                                          EnumSet.of(XAttrSetFlag.CREATE,
                                                     XAttrSetFlag.REPLACE));
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(setXAttrOp.rpcClientId, setXAttrOp.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_REMOVE_XATTR, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        RemoveXAttrOp removeXAttrOp = (RemoveXAttrOp) op;
        FSDirXAttrOp.unprotectedRemoveXAttrs(fsDir, removeXAttrOp.src,
                                             removeXAttrOp.xAttrs);
        boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
        if (toAddRetryCache) {
          fsNamesys.addCacheEntry(removeXAttrOp.rpcClientId,
              removeXAttrOp.rpcCallId);
        }
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_TRUNCATE, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        TruncateOp truncateOp = (TruncateOp) op;
        fsDir.unprotectedTruncate(truncateOp.src, truncateOp.clientName,
            truncateOp.clientMachine, truncateOp.newLength, truncateOp.timestamp,
            truncateOp.truncateBlock);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });

    handlers.put(FSEditLogOpCodes.OP_SET_STORAGE_POLICY, new OpHandler() {
      @Override
      public long handle(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
          int logVersion, long lastInodeId) throws IOException {
        SetStoragePolicyOp setStoragePolicyOp = (SetStoragePolicyOp) op;
        final String path = renameReservedPathsOnUpgrade(setStoragePolicyOp.path,
            logVersion);
        final INodesInPath iip = fsDir.getINodesInPath4Write(path);
        FSDirAttrOp.unprotectedSetStoragePolicy(
            fsDir, fsNamesys.getBlockManager(), iip,
            setStoragePolicyOp.policyId);
        return INodeId.GRANDFATHER_INODE_ID;
      }
    });
  }

  private long applyEditLogOp(FSEditLogOp op, FSDirectory fsDir,
      StartupOption startOpt, int logVersion, long lastInodeId) throws IOException {
    OpHandler handler = handlers.get(op.opCode);
    if (handler == null) {
      throw new IOException("Invalid operation read " + op.opCode);
    }
    return handler.handle(op, fsDir, startOpt, logVersion, lastInodeId);
  }

  // Remaining methods unchanged...
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

  // ... rest of the class remains unchanged
}