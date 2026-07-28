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
          + " loaded in " + (monotonicNow() - startTime) / 1000 + " seconds");
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
        FSEditLogOp op = readNextOp(in, recentOpcodeOffsets, expectedTxId, recovery);
        if (op == null) {
          break;
        }
        if (shouldSkipOp(op, expectedTxId, recovery)) {
          continue;
        }
        long inodeId = applyAndTrack(op, fsDir, startOpt, in.getVersion(true), lastInodeId);
        if (inodeId > lastInodeId) {
          lastInodeId = inodeId;
        }
        incrOpCount(op.opCode, opCounts, step, counter);
        updateTxIdTracking(op, expectedStartingTxId);
        logProgressIfNeeded(op, numTxns, lastLogTime);
        numEdits++;
        totalEdits++;
      }
    } catch (RollingUpgradeOp.RollbackException e) {
      LOG.info("Stopped at OP_START_ROLLING_UPGRADE for rollback.");
    } catch (MetaRecoveryContext.RequestStopException e) {
      MetaRecoveryContext.LOG.warn("Stopped reading edit log at " +
          in.getPosition() + "/" + in.length());
    } finally {
      fsNamesys.dir.resetLastInodeId(lastInodeId);
      if (closeOnExit) {
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
   * Reads the next operation from the stream handling errors and resync.
   */
  private FSEditLogOp readNextOp(EditLogInputStream in,
      long[] recentOpcodeOffsets, long expectedTxId,
      MetaRecoveryContext recovery) throws IOException {
    try {
      FSEditLogOp op = in.readOp();
      if (op == null) {
        return null;
      }
      recentOpcodeOffsets[(int) (numEdits % recentOpcodeOffsets.length)] = in.getPosition();
      return op;
    } catch (Throwable e) {
      check203UpgradeFailure(in.getVersion(true), e);
      String errorMessage = formatEditLogReplayError(in, recentOpcodeOffsets, expectedTxId);
      FSImage.LOG.error(errorMessage, e);
      if (recovery == null) {
        throw new EditLogInputException(errorMessage, e, totalEdits);
      }
      MetaRecoveryContext.editLogLoaderPrompt(
          "We failed to read txId " + expectedTxId,
          recovery, "skipping the bad section in the log");
      in.resync();
      return null; // caller will continue loop
    }
  }

  /**
   * Determines whether the current operation should be skipped due to
   * transaction id gaps or ordering issues.
   */
  private boolean shouldSkipOp(FSEditLogOp op, long expectedTxId,
      MetaRecoveryContext recovery) throws IOException {
    if (!op.hasTransactionId()) {
      return false;
    }
    long txId = op.getTransactionId();
    if (txId > expectedTxId) {
      MetaRecoveryContext.editLogLoaderPrompt(
          "There appears to be a gap in the edit log.  We expected txid "
              + expectedTxId + ", but got txid " + txId + ".",
          recovery, "ignoring missing transaction IDs");
      return false;
    }
    if (txId < expectedTxId) {
      MetaRecoveryContext.editLogLoaderPrompt(
          "There appears to be an out-of-order edit in the edit log.  We "
              + "expected txid " + expectedTxId + ", but got txid " + txId + ".",
          recovery, "skipping the out-of-order edit");
      return true;
    }
    return false;
  }

  /**
   * Applies the operation and returns the inode id that may have been allocated.
   */
  private long applyAndTrack(FSEditLogOp op, FSDirectory fsDir,
      StartupOption startOpt, int logVersion, long lastInodeId) throws IOException {
    try {
      if (LOG.isTraceEnabled()) {
        LOG.trace("op=" + op + ", startOpt=" + startOpt
            + ", totalEdits=" + totalEdits);
      }
      return applyEditLogOp(op, fsDir, startOpt, logVersion, lastInodeId);
    } catch (RollingUpgradeOp.RollbackException e) {
      throw e;
    } catch (Throwable e) {
      LOG.error("Encountered exception on operation " + op, e);
      if (recovery == null) {
        throw e instanceof IOException ? (IOException) e : new IOException(e);
      }
      MetaRecoveryContext.editLogLoaderPrompt("Failed to apply edit log operation "
          + op + ": error " + e.getMessage(), recovery, "applying edits");
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  /**
   * Updates transaction id tracking variables after a successful operation.
   */
  private void updateTxIdTracking(FSEditLogOp op, long expectedStartingTxId) {
    if (op.hasTransactionId()) {
      lastAppliedTxId = op.getTransactionId();
      expectedTxId = lastAppliedTxId + 1;
    } else {
      expectedTxId = lastAppliedTxId = expectedStartingTxId;
    }
  }

  /**
   * Logs progress periodically based on transaction count.
   */
  private void logProgressIfNeeded(FSEditLogOp op, long numTxns, long lastLogTime) {
    if (!op.hasTransactionId()) {
      return;
    }
    long now = monotonicNow();
    if (now - lastLogTime > REPLAY_TRANSACTION_LOG_INTERVAL) {
      long deltaTxId = lastAppliedTxId - expectedStartingTxId + 1;
      int percent = Math.round((float) deltaTxId / numTxns * 100);
      LOG.info("replaying edit log: " + deltaTxId + "/" + numTxns
          + " transactions completed. (" + percent + "%)");
    }
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

  // ... (rest of the original class unchanged) 

  // The remaining methods (applyEditLogOp, addNewBlock, updateBlocks,
  // dumpOpCounts, incrOpCount, check203UpgradeFailure, validateEditLog,
  // scanEditLog, EditLogValidation, PositionTrackingInputStream,
  // getLastAppliedTxId, createStartupProgressStep) are unchanged from the
  // original source.
}