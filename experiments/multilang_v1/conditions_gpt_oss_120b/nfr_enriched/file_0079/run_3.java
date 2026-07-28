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
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied.  See the License for the specific language governing
 * permissions and limitations under the License.
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

    long[] recentOpcodeOffsets = new long[4];
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
          FSEditLogOp op = readNextOp(in, recentOpcodeOffsets, expectedTxId, recovery);
          if (op == null) {
            break;
          }
          recentOpcodeOffsets[(int)(numEdits % recentOpcodeOffsets.length)] =
            in.getPosition();

          if (op.hasTransactionId()) {
            handleTransactionIdGap(op, expectedTxId, recovery);
          }

          long inodeId = applyAndTrack(op, fsDir, startOpt,
              in.getVersion(true), lastInodeId);
          if (lastInodeId < inodeId) {
            lastInodeId = inodeId;
          }

          incrOpCount(op.opCode, opCounts, step, counter);
          updateTxIdState(op, expectedStartingTxId);
          if (op.hasTransactionId()) {
            lastLogTime = maybeLogProgress(lastLogTime, numTxns, expectedStartingTxId);
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

  /**
   * Reads the next operation from the stream, handling errors and recovery.
   */
  private FSEditLogOp readNextOp(EditLogInputStream in,
      long[] recentOpcodeOffsets, long expectedTxId,
      MetaRecoveryContext recovery) throws IOException {
    try {
      FSEditLogOp op = in.readOp();
      if (op == null) {
        return null;
      }
      return op;
    } catch (Throwable e) {
      check203UpgradeFailure(in.getVersion(true), e);
      String errorMessage = formatEditLogReplayError(in, recentOpcodeOffsets, expectedTxId);
      FSImage.LOG.error(errorMessage, e);
      if (recovery == null) {
        throw new EditLogInputException(errorMessage, e, 0);
      }
      MetaRecoveryContext.editLogLoaderPrompt(
          "We failed to read txId " + expectedTxId,
          recovery, "skipping the bad section in the log");
      in.resync();
      // retry after resync
      return readNextOp(in, recentOpcodeOffsets, expectedTxId, recovery);
    }
  }

  /**
   * Handles gaps or out‑of‑order transaction IDs.
   */
  private void handleTransactionIdGap(FSEditLogOp op, long expectedTxId,
      MetaRecoveryContext recovery) {
    long txId = op.getTransactionId();
    if (txId > expectedTxId) {
      MetaRecoveryContext.editLogLoaderPrompt("There appears " +
          "to be a gap in the edit log.  We expected txid " +
          expectedTxId + ", but got txid " + txId + ".", recovery,
          "ignoring missing transaction IDs");
    } else if (txId < expectedTxId) {
      MetaRecoveryContext.editLogLoaderPrompt("There appears " +
          "to be an out-of-order edit in the edit log.  We " +
          "expected txid " + expectedTxId + ", but got txid " + txId + ".", recovery,
          "skipping the out-of-order edit");
      throw new RuntimeException("skip");
    }
  }

  /**
   * Applies the operation and returns the highest inode ID seen.
   */
  private long applyAndTrack(FSEditLogOp op, FSDirectory fsDir,
      StartupOption startOpt, int logVersion, long lastInodeId) throws IOException {
    try {
      long inodeId = applyEditLogOp(op, fsDir, startOpt, logVersion, lastInodeId);
      return inodeId;
    } catch (RollingUpgradeOp.RollbackException e) {
      throw e;
    } catch (Throwable e) {
      LOG.error("Encountered exception on operation " + op, e);
      throw e instanceof IOException ? (IOException) e : new IOException(e);
    }
  }

  /**
   * Updates transaction‑ID state after a successful operation.
   */
  private void updateTxIdState(FSEditLogOp op, long expectedStartingTxId) {
    if (op.hasTransactionId()) {
      lastAppliedTxId = op.getTransactionId();
      expectedTxId = lastAppliedTxId + 1;
    } else {
      expectedTxId = lastAppliedTxId = expectedStartingTxId;
    }
  }

  /**
   * Logs progress periodically.
   */
  private long maybeLogProgress(long lastLogTime, long numTxns,
      long expectedStartingTxId) {
    long now = monotonicNow();
    if (now - lastLogTime > REPLAY_TRANSACTION_LOG_INTERVAL) {
      long deltaTxId = lastAppliedTxId - expectedStartingTxId + 1;
      int percent = Math.round((float) deltaTxId / numTxns * 100);
      LOG.info("replaying edit log: " + deltaTxId + "/" + numTxns
          + " transactions completed. (" + percent + "%)");
      return now;
    }
    return lastLogTime;
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