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

  private final EnumMap<FSEditLogOpCodes, OpHandler> opHandlers =
      new EnumMap<FSEditLogOpCodes, OpHandler>(FSEditLogOpCodes.class);

  public FSEditLogLoader(FSNamesystem fsNamesys, long lastAppliedTxId) {
    this.fsNamesys = fsNamesys;
    this.lastAppliedTxId = lastAppliedTxId;
    initHandlers();
  }

  private void initHandlers() {
    opHandlers.put(FSEditLogOpCodes.OP_ADD,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            return handleAdd((AddCloseOp) op, fsDir, startOpt, logVersion,
                lastInodeId, toAddRetryCache);
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_CLOSE,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleClose((AddCloseOp) op, fsDir, logVersion, toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_APPEND,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleAppend((AppendOp) op, fsDir, logVersion, toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_UPDATE_BLOCKS,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleUpdateBlocks((UpdateBlocksOp) op, fsDir, logVersion,
                toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_ADD_BLOCK,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleAddBlock((AddBlockOp) op, fsDir, logVersion);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SET_REPLICATION,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleSetReplication((SetReplicationOp) op, fsDir, logVersion);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_CONCAT_DELETE,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleConcatDelete((ConcatDeleteOp) op, fsDir, logVersion,
                toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_RENAME_OLD,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleRenameOld((RenameOldOp) op, fsDir, logVersion, toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_DELETE,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleDelete((DeleteOp) op, fsDir, logVersion, toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_MKDIR,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            return handleMkdir((MkdirOp) op, fsDir, logVersion, lastInodeId);
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SET_GENSTAMP_V1,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) {
            fsNamesys.getBlockIdManager()
                .setGenerationStampV1(((SetGenstampV1Op) op).genStampV1);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SET_PERMISSIONS,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            SetPermissionsOp p = (SetPermissionsOp) op;
            FSDirAttrOp.unprotectedSetPermission(fsDir,
                renameReservedPathsOnUpgrade(p.src, logVersion), p.permissions);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SET_OWNER,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            SetOwnerOp p = (SetOwnerOp) op;
            FSDirAttrOp.unprotectedSetOwner(fsDir,
                renameReservedPathsOnUpgrade(p.src, logVersion),
                p.username, p.groupname);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SET_NS_QUOTA,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            SetNSQuotaOp p = (SetNSQuotaOp) op;
            FSDirAttrOp.unprotectedSetQuota(fsDir,
                renameReservedPathsOnUpgrade(p.src, logVersion),
                p.nsQuota, HdfsConstants.QUOTA_DONT_SET, null);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_CLEAR_NS_QUOTA,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            ClearNSQuotaOp p = (ClearNSQuotaOp) op;
            FSDirAttrOp.unprotectedSetQuota(fsDir,
                renameReservedPathsOnUpgrade(p.src, logVersion),
                HdfsConstants.QUOTA_RESET, HdfsConstants.QUOTA_DONT_SET, null);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SET_QUOTA,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            SetQuotaOp p = (SetQuotaOp) op;
            FSDirAttrOp.unprotectedSetQuota(fsDir,
                renameReservedPathsOnUpgrade(p.src, logVersion),
                p.nsQuota, p.dsQuota, null);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SET_QUOTA_BY_STORAGETYPE,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            FSEditLogOp.SetQuotaByStorageTypeOp p =
                (FSEditLogOp.SetQuotaByStorageTypeOp) op;
            FSDirAttrOp.unprotectedSetQuota(fsDir,
                renameReservedPathsOnUpgrade(p.src, logVersion),
                HdfsConstants.QUOTA_DONT_SET, p.dsQuota, p.type);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_TIMES,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            TimesOp p = (TimesOp) op;
            FSDirAttrOp.unprotectedSetTimes(fsDir,
                renameReservedPathsOnUpgrade(p.path, logVersion),
                p.mtime, p.atime, true);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SYMLINK,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            return handleSymlink((SymlinkOp) op, fsDir, logVersion,
                lastInodeId, toAddRetryCache);
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_RENAME,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleRename((RenameOp) op, fsDir, logVersion, toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_GET_DELEGATION_TOKEN,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) {
            GetDelegationTokenOp p = (GetDelegationTokenOp) op;
            fsNamesys.getDelegationTokenSecretManager()
                .addPersistedDelegationToken(p.token, p.expiryTime);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_RENEW_DELEGATION_TOKEN,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) {
            RenewDelegationTokenOp p = (RenewDelegationTokenOp) op;
            fsNamesys.getDelegationTokenSecretManager()
                .updatePersistedTokenRenewal(p.token, p.expiryTime);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_CANCEL_DELEGATION_TOKEN,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) {
            CancelDelegationTokenOp p = (CancelDelegationTokenOp) op;
            fsNamesys.getDelegationTokenSecretManager()
                .updatePersistedTokenCancellation(p.token);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_UPDATE_MASTER_KEY,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) {
            UpdateMasterKeyOp p = (UpdateMasterKeyOp) op;
            fsNamesys.getDelegationTokenSecretManager()
                .updatePersistedMasterKey(p.key);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_REASSIGN_LEASE,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleReassignLease((ReassignLeaseOp) op, fsDir, logVersion);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_START_LOG_SEGMENT,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) {
            // No data to process.
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_END_LOG_SEGMENT,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) {
            // No data to process.
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_CREATE_SNAPSHOT,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleCreateSnapshot((CreateSnapshotOp) op, fsDir, logVersion,
                toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_DELETE_SNAPSHOT,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleDeleteSnapshot((DeleteSnapshotOp) op, fsDir, logVersion,
                toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_RENAME_SNAPSHOT,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleRenameSnapshot((RenameSnapshotOp) op, fsDir, logVersion,
                toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_ALLOW_SNAPSHOT,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            AllowSnapshotOp p = (AllowSnapshotOp) op;
            fsNamesys.getSnapshotManager().setSnapshottable(
                renameReservedPathsOnUpgrade(p.snapshotRoot, logVersion), false);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_DISALLOW_SNAPSHOT,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            DisallowSnapshotOp p = (DisallowSnapshotOp) op;
            fsNamesys.getSnapshotManager().resetSnapshottable(
                renameReservedPathsOnUpgrade(p.snapshotRoot, logVersion));
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SET_GENSTAMP_V2,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) {
            SetGenstampV2Op p = (SetGenstampV2Op) op;
            fsNamesys.getBlockIdManager().setGenerationStampV2(p.genStampV2);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_ALLOCATE_BLOCK_ID,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) {
            AllocateBlockIdOp p = (AllocateBlockIdOp) op;
            fsNamesys.getBlockIdManager().setLastAllocatedBlockId(p.blockId);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_ROLLING_UPGRADE_START,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleRollingUpgradeStart((RollingUpgradeOp) op, startOpt);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_ROLLING_UPGRADE_FINALIZE,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleRollingUpgradeFinalize((RollingUpgradeOp) op);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_ADD_CACHE_DIRECTIVE,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleAddCacheDirective((AddCacheDirectiveInfoOp) op,
                toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_MODIFY_CACHE_DIRECTIVE,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleModifyCacheDirective((ModifyCacheDirectiveInfoOp) op,
                toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_REMOVE_CACHE_DIRECTIVE,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleRemoveCacheDirective((RemoveCacheDirectiveInfoOp) op,
                toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_ADD_CACHE_POOL,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleAddCachePool((AddCachePoolOp) op, toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_MODIFY_CACHE_POOL,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleModifyCachePool((ModifyCachePoolOp) op, toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_REMOVE_CACHE_POOL,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            handleRemoveCachePool((RemoveCachePoolOp) op, toAddRetryCache);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SET_ACL,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) {
            SetAclOp p = (SetAclOp) op;
            FSDirAclOp.unprotectedSetAcl(fsDir, p.src, p.aclEntries, true);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SET_XATTR,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            SetXAttrOp p = (SetXAttrOp) op;
            FSDirXAttrOp.unprotectedSetXAttrs(fsDir, p.src, p.xAttrs,
                EnumSet.of(XAttrSetFlag.CREATE, XAttrSetFlag.REPLACE));
            if (toAddRetryCache) {
              fsNamesys.addCacheEntry(p.rpcClientId, p.rpcCallId);
            }
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_REMOVE_XATTR,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            RemoveXAttrOp p = (RemoveXAttrOp) op;
            FSDirXAttrOp.unprotectedRemoveXAttrs(fsDir, p.src, p.xAttrs);
            if (toAddRetryCache) {
              fsNamesys.addCacheEntry(p.rpcClientId, p.rpcCallId);
            }
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_TRUNCATE,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            TruncateOp p = (TruncateOp) op;
            fsDir.unprotectedTruncate(p.src, p.clientName, p.clientMachine,
                p.newLength, p.timestamp, p.truncateBlock);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
    opHandlers.put(FSEditLogOpCodes.OP_SET_STORAGE_POLICY,
        new OpHandler() {
          public long apply(FSEditLogOp op, FSDirectory fsDir,
              StartupOption startOpt, int logVersion, long lastInodeId,
              boolean toAddRetryCache) throws IOException {
            SetStoragePolicyOp p = (SetStoragePolicyOp) op;
            String path = renameReservedPathsOnUpgrade(p.path, logVersion);
            INodesInPath iip = fsDir.getINodesInPath4Write(path);
            FSDirAttrOp.unprotectedSetStoragePolicy(fsDir,
                fsNamesys.getBlockManager(), iip, p.policyId);
            return INodeId.GRANDFATHER_INODE_ID;
          }
        });
  }

  interface OpHandler {
    long apply(FSEditLogOp op, FSDirectory fsDir, StartupOption startOpt,
        int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException;
  }

  @SuppressWarnings("deprecation")
  private long applyEditLogOp(FSEditLogOp op, FSDirectory fsDir,
      StartupOption startOpt, int logVersion, long lastInodeId) throws IOException {
    long inodeId = INodeId.GRANDFATHER_INODE_ID;
    if (LOG.isTraceEnabled()) {
      LOG.trace("replaying edit log: " + op);
    }
    boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
    OpHandler handler = opHandlers.get(op.opCode);
    if (handler == null) {
      throw new IOException("Invalid operation read " + op.opCode);
    }
    inodeId = handler.apply(op, fsDir, startOpt, logVersion, lastInodeId,
        toAddRetryCache);
    return inodeId;
  }

  private long handleAdd(AddCloseOp op, FSDirectory fsDir,
      StartupOption startOpt, int logVersion, long lastInodeId,
      boolean toAddRetryCache) throws IOException {
    final String path = renameReservedPathsOnUpgrade(op.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " numblocks : " + op.blocks.length +
          " clientHolder " + op.clientName +
          " clientMachine " + op.clientMachine);
    }
    INodesInPath iip = fsDir.getINodesInPath(path, true);
    INodeFile oldFile = INodeFile.valueOf(iip.getLastINode(), path, true);
    if (oldFile != null && op.overwrite) {
      FSDirDeleteOp.deleteForEditLog(fsDir, path, op.mtime);
      iip = INodesInPath.replace(iip, iip.length() - 1, null);
      oldFile = null;
    }
    INodeFile newFile = oldFile;
    long inodeId = INodeId.GRANDFATHER_INODE_ID;
    if (oldFile == null) {
      final short replication = fsNamesys.getBlockManager()
          .adjustReplication(op.replication);
      assert op.blocks.length == 0;
      inodeId = getAndUpdateLastInodeId(op.inodeId, logVersion, lastInodeId);
      newFile = fsDir.addFileForEditLog(inodeId, iip.getExistingINodes(),
          iip.getLastLocalName(),
          op.permissions, op.aclEntries, op.xAttrs, replication,
          op.mtime, op.atime, op.blockSize, true,
          op.clientName, op.clientMachine, op.storagePolicyId);
      iip = INodesInPath.replace(iip, iip.length() - 1, newFile);
      fsNamesys.leaseManager.addLease(op.clientName, path);
      if (toAddRetryCache) {
        HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
            fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, newFile,
            BlockStoragePolicySuite.ID_UNSPECIFIED, Snapshot.CURRENT_STATE_ID,
            false, iip);
        fsNamesys.addCacheEntryWithPayload(op.rpcClientId,
            op.rpcCallId, stat);
      }
    } else {
      if (!oldFile.isUnderConstruction()) {
        LocatedBlock lb = fsNamesys.prepareFileForAppend(path, iip,
            op.clientName, op.clientMachine, false, false, false);
        if (toAddRetryCache) {
          HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
              fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, newFile,
              BlockStoragePolicySuite.ID_UNSPECIFIED,
              Snapshot.CURRENT_STATE_ID, false, iip);
          fsNamesys.addCacheEntryWithPayload(op.rpcClientId,
              op.rpcCallId, new LastBlockWithStatus(lb, stat));
        }
      }
    }
    newFile.setAccessTime(op.atime, Snapshot.CURRENT_STATE_ID);
    newFile.setModificationTime(op.mtime, Snapshot.CURRENT_STATE_ID);
    updateBlocks(fsDir, op, iip, newFile);
    return inodeId;
  }

  private void handleClose(AddCloseOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String path = renameReservedPathsOnUpgrade(op.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " numblocks : " + op.blocks.length +
          " clientHolder " + op.clientName +
          " clientMachine " + op.clientMachine);
    }
    INodesInPath iip = fsDir.getINodesInPath(path, true);
    INodeFile file = INodeFile.valueOf(iip.getLastINode(), path);
    file.setAccessTime(op.atime, Snapshot.CURRENT_STATE_ID);
    file.setModificationTime(op.mtime, Snapshot.CURRENT_STATE_ID);
    updateBlocks(fsDir, op, iip, file);
    if (!file.isUnderConstruction() &&
        logVersion <= LayoutVersion.BUGFIX_HDFS_2991_VERSION) {
      throw new IOException("File is not under construction: " + path);
    }
    if (file.isUnderConstruction()) {
      fsNamesys.leaseManager.removeLeaseWithPrefixPath(path);
      file.toCompleteFile(file.getModificationTime());
    }
  }

  private void handleAppend(AppendOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
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
          op.clientName, op.clientMachine, op.newBlock, false, false);
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

  private void handleUpdateBlocks(UpdateBlocksOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String path = renameReservedPathsOnUpgrade(op.path, logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " numblocks : " + op.blocks.length);
    }
    INodesInPath iip = fsDir.getINodesInPath(path, true);
    INodeFile oldFile = INodeFile.valueOf(iip.getLastINode(), path);
    updateBlocks(fsDir, op, iip, oldFile);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void handleAddBlock(AddBlockOp op, FSDirectory fsDir,
      int logVersion) throws IOException {
    String path = renameReservedPathsOnUpgrade(op.getPath(), logVersion);
    if (FSNamesystem.LOG.isDebugEnabled()) {
      FSNamesystem.LOG.debug(op.opCode + ": " + path +
          " new block id : " + op.getLastBlock().getBlockId());
    }
    INodeFile oldFile = INodeFile.valueOf(fsDir.getINode(path), path);
    addNewBlock(fsDir, op, oldFile);
  }

  private void handleSetReplication(SetReplicationOp op, FSDirectory fsDir,
      int logVersion) throws IOException {
    short replication = fsNamesys.getBlockManager()
        .adjustReplication(op.replication);
    FSDirAttrOp.unprotectedSetReplication(fsDir,
        renameReservedPathsOnUpgrade(op.path, logVersion), replication, null);
  }

  private void handleConcatDelete(ConcatDeleteOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    String trg = renameReservedPathsOnUpgrade(op.trg, logVersion);
    String[] srcs = new String[op.srcs.length];
    for (int i = 0; i < srcs.length; i++) {
      srcs[i] = renameReservedPathsOnUpgrade(op.srcs[i], logVersion);
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

  private void handleRenameOld(RenameOldOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    final String src = renameReservedPathsOnUpgrade(op.src, logVersion);
    final String dst = renameReservedPathsOnUpgrade(op.dst, logVersion);
    FSDirRenameOp.renameForEditLog(fsDir, src, dst, op.timestamp);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void handleDelete(DeleteOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirDeleteOp.deleteForEditLog(fsDir,
        renameReservedPathsOnUpgrade(op.path, logVersion), op.timestamp);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private long handleMkdir(MkdirOp op, FSDirectory fsDir,
      int logVersion, long lastInodeId) throws IOException {
    long inodeId = getAndUpdateLastInodeId(op.inodeId, logVersion,
        lastInodeId);
    FSDirMkdirOp.mkdirForEditLog(fsDir, inodeId,
        renameReservedPathsOnUpgrade(op.path, logVersion),
        op.permissions, op.aclEntries, op.timestamp);
    return inodeId;
  }

  private long handleSymlink(SymlinkOp op, FSDirectory fsDir,
      int logVersion, long lastInodeId, boolean toAddRetryCache) throws IOException {
    if (!FileSystem.areSymlinksEnabled()) {
      throw new IOException("Symlinks not supported - please remove symlink before upgrading to this version of HDFS");
    }
    long inodeId = getAndUpdateLastInodeId(op.inodeId, logVersion,
        lastInodeId);
    final String path = renameReservedPathsOnUpgrade(op.path, logVersion);
    final INodesInPath iip = fsDir.getINodesInPath(path, false);
    FSDirSymlinkOp.unprotectedAddSymlink(fsDir, iip.getExistingINodes(),
        iip.getLastLocalName(), inodeId, op.value, op.mtime,
        op.atime, op.permissionStatus);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
    return inodeId;
  }

  private void handleRename(RenameOp op, FSDirectory fsDir,
      int logVersion, boolean toAddRetryCache) throws IOException {
    FSDirRenameOp.renameForEditLog(fsDir,
        renameReservedPathsOnUpgrade(op.src, logVersion),
        renameReservedPathsOnUpgrade(op.dst, logVersion),
        op.timestamp, op.options);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void handleReassignLease(ReassignLeaseOp op, FSDirectory fsDir,
      int logVersion) throws IOException {
    Lease lease = fsNamesys.leaseManager.getLease(op.leaseHolder);
    final String path = renameReservedPathsOnUpgrade(op.path, logVersion);
    INodeFile pendingFile = fsDir.getINode(path).asFile();
    Preconditions.checkState(pendingFile.isUnderConstruction());
    fsNamesys.reassignLeaseInternal(lease, path, op.newHolder, pendingFile);
  }

  private void handleRollingUpgradeStart(RollingUpgradeOp op,
      StartupOption startOpt) throws IOException {
    if (startOpt == StartupOption.ROLLINGUPGRADE) {
      RollingUpgradeStartupOption rollingUpgradeOpt =
          startOpt.getRollingUpgradeStartupOption();
      if (rollingUpgradeOpt == RollingUpgradeStartupOption.ROLLBACK) {
        throw new RollingUpgradeOp.RollbackException();
      } else if (rollingUpgradeOpt == RollingUpgradeStartupOption.DOWNGRADE) {
        return;
      }
    }
    fsNamesys.startRollingUpgradeInternal(op.getTime());
    fsNamesys.triggerRollbackCheckpoint();
  }

  private void handleRollingUpgradeFinalize(RollingUpgradeOp op)
      throws IOException {
    long finalizeTime = op.getTime();
    if (fsNamesys.isRollingUpgrade()) {
      fsNamesys.finalizeRollingUpgradeInternal(finalizeTime);
    }
    fsNamesys.getFSImage().updateStorageVersion();
    fsNamesys.getFSImage().renameCheckpoint(NameNodeFile.IMAGE_ROLLBACK,
        NameNodeFile.IMAGE);
  }

  private void handleAddCacheDirective(AddCacheDirectiveInfoOp op,
      boolean toAddRetryCache) throws IOException {
    CacheDirectiveInfo result = fsNamesys.getCacheManager()
        .addDirectiveFromEditLog(op.directive);
    if (toAddRetryCache) {
      Long id = result.getId();
      fsNamesys.addCacheEntryWithPayload(op.rpcClientId, op.rpcCallId, id);
    }
  }

  private void handleModifyCacheDirective(ModifyCacheDirectiveInfoOp op,
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().modifyDirectiveFromEditLog(op.directive);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void handleRemoveCacheDirective(RemoveCacheDirectiveInfoOp op,
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().removeDirective(op.id, null);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void handleAddCachePool(AddCachePoolOp op,
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().addCachePool(op.info);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void handleModifyCachePool(ModifyCachePoolOp op,
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().modifyCachePool(op.info);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void handleRemoveCachePool(RemoveCachePoolOp op,
      boolean toAddRetryCache) throws IOException {
    fsNamesys.getCacheManager().removeCachePool(op.poolName);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void handleCreateSnapshot(CreateSnapshotOp op,
      FSDirectory fsDir, int logVersion, boolean toAddRetryCache) throws IOException {
    String snapshotRoot = renameReservedPathsOnUpgrade(op.snapshotRoot,
        logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    String path = fsNamesys.getSnapshotManager().createSnapshot(iip,
        snapshotRoot, op.snapshotName);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntryWithPayload(op.rpcClientId,
          op.rpcCallId, path);
    }
  }

  private void handleDeleteSnapshot(DeleteSnapshotOp op,
      FSDirectory fsDir, int logVersion, boolean toAddRetryCache) throws IOException {
    BlocksMapUpdateInfo collectedBlocks = new BlocksMapUpdateInfo();
    List<INode> removedINodes = new ChunkedArrayList<INode>();
    String snapshotRoot = renameReservedPathsOnUpgrade(op.snapshotRoot,
        logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    fsNamesys.getSnapshotManager().deleteSnapshot(iip, op.snapshotName,
        collectedBlocks, removedINodes);
    fsNamesys.removeBlocksAndUpdateSafemodeTotal(collectedBlocks);
    collectedBlocks.clear();
    fsNamesys.dir.removeFromInodeMap(removedINodes);
    removedINodes.clear();
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
  }

  private void handleRenameSnapshot(RenameSnapshotOp op,
      FSDirectory fsDir, int logVersion, boolean toAddRetryCache) throws IOException {
    String snapshotRoot = renameReservedPathsOnUpgrade(op.snapshotRoot,
        logVersion);
    INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
    fsNamesys.getSnapshotManager().renameSnapshot(iip,
        snapshotRoot, op.snapshotOldName, op.snapshotNewName);
    if (toAddRetryCache) {
      fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
    }
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
      if (inodeId > lastInodeId) {
        fsNamesys.dir.resetLastInodeId(inodeId);
      }
    }
    return inodeId;
  }

  /**
   * Add a new block into the given INodeFile
   */
  private void addNewBlock(FSDirectory fsDir, AddBlockOp op, INodeFile file)
      throws IOException {
    BlockInfoContiguous[] oldBlocks = file.getBlocks();
    Block pBlock = op.getPenultimateBlock();
    Block newBlock = op.getLastBlock();

    if (pBlock != null) {
      Preconditions.checkState(oldBlocks != null && oldBlocks.length > 0);
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
    } else {
      Preconditions.checkState(oldBlocks == null || oldBlocks.length == 0);
    }
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
    BlockInfoContiguous[] oldBlocks = file.getBlocks();
    Block[] newBlocks = op.getBlocks();
    String path = op.getPath();

    boolean isGenStampUpdate = oldBlocks.length == newBlocks.length;

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
        fsNamesys.getBlockManager().processQueuedMessagesForBlock(newBlock);
      }
    }

    if (newBlocks.length < oldBlocks.length) {
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
      for (int i = oldBlocks.length; i < newBlocks.length; i++) {
        Block newBlock = newBlocks[i];
        BlockInfoContiguous newBI;
        if (!op.shouldCompleteLastBlock()) {
          newBI = new BlockInfoContiguousUnderConstruction(
              newBlock, file.getBlockReplication());
        } else {
          newBI = new BlockInfoContiguous(newBlock, file.getBlockReplication());
        }
        fsNamesys.getBlockManager().addBlockCollection(newBI, file);
        file.addBlock(newBI);
        fsNamesys.getBlockManager().processQueuedMessagesForBlock(newBlock);
      }
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

  private void check203UpgradeFailure(int logVersion, Throwable e)
      throws IOException {
    if (Storage.is203LayoutVersion(logVersion)
        && logVersion != HdfsConstants.NAMENODE_LAYOUT_VERSION) {
      String msg = "During upgrade failed to load the editlog version "
          + logVersion + " from release 0.20.203. Please go back to the old "
          + " release and restart the namenode. This empties the editlog "
          + " and saves the namespace. Resume the upgrade after this step.";
      throw new IOException(msg, e);
    }
  }

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
            " ops from " + in + " while determining its valid length."
            + "Position was " + lastPos, t);
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
        if ((op = in.readOp()) == null) {
          break;
        }
      } catch (Throwable t) {
        FSImage.LOG.warn("Caught exception after reading " + numValid +
            " ops from " + in + " while determining its valid length."
            + "Position was " + lastPos, t);
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

  private static Step createStartupProgressStep(EditLogInputStream edits)
      throws IOException {
    long length = edits.length();
    String name = edits.getCurrentStreamName();
    return length != -1 ? new Step(name, length) : new Step(name);
  }
}