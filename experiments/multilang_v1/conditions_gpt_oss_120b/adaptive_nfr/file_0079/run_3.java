/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  You may obtain a copy of the
 * License at
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

  private final EnumMap<FSEditLogOpCodes, OpHandler> opHandlers =
      new EnumMap<FSEditLogOpCodes, OpHandler>(FSEditLogOpCodes.class);

  public FSEditLogLoader(FSNamesystem fsNamesys, long lastAppliedTxId) {
    this.fsNamesys = fsNamesys;
    this.lastAppliedTxId = lastAppliedTxId;
    initHandlers();
  }

  private void initHandlers() {
    opHandlers.put(FSEditLogOpCodes.OP_ADD, new AddHandler());
    opHandlers.put(FSEditLogOpCodes.OP_CLOSE, new CloseHandler());
    opHandlers.put(FSEditLogOpCodes.OP_APPEND, new AppendHandler());
    opHandlers.put(FSEditLogOpCodes.OP_UPDATE_BLOCKS, new UpdateBlocksHandler());
    opHandlers.put(FSEditLogOpCodes.OP_ADD_BLOCK, new AddBlockHandler());
    opHandlers.put(FSEditLogOpCodes.OP_SET_REPLICATION, new SetReplicationHandler());
    opHandlers.put(FSEditLogOpCodes.OP_CONCAT_DELETE, new ConcatDeleteHandler());
    opHandlers.put(FSEditLogOpCodes.OP_RENAME_OLD, new RenameOldHandler());
    opHandlers.put(FSEditLogOpCodes.OP_DELETE, new DeleteHandler());
    opHandlers.put(FSEditLogOpCodes.OP_MKDIR, new MkdirHandler());
    opHandlers.put(FSEditLogOpCodes.OP_SET_GENSTAMP_V1, new SetGenstampV1Handler());
    opHandlers.put(FSEditLogOpCodes.OP_SET_PERMISSIONS, new SetPermissionsHandler());
    opHandlers.put(FSEditLogOpCodes.OP_SET_OWNER, new SetOwnerHandler());
    opHandlers.put(FSEditLogOpCodes.OP_SET_NS_QUOTA, new SetNSQuotaHandler());
    opHandlers.put(FSEditLogOpCodes.OP_CLEAR_NS_QUOTA, new ClearNSQuotaHandler());
    opHandlers.put(FSEditLogOpCodes.OP_SET_QUOTA, new SetQuotaHandler());
    opHandlers.put(FSEditLogOpCodes.OP_SET_QUOTA_BY_STORAGETYPE, new SetQuotaByStorageTypeHandler());
    opHandlers.put(FSEditLogOpCodes.OP_TIMES, new TimesHandler());
    opHandlers.put(FSEditLogOpCodes.OP_SYMLINK, new SymlinkHandler());
    opHandlers.put(FSEditLogOpCodes.OP_RENAME, new RenameHandler());
    opHandlers.put(FSEditLogOpCodes.OP_GET_DELEGATION_TOKEN, new GetDelegationTokenHandler());
    opHandlers.put(FSEditLogOpCodes.OP_RENEW_DELEGATION_TOKEN, new RenewDelegationTokenHandler());
    opHandlers.put(FSEditLogOpCodes.OP_CANCEL_DELEGATION_TOKEN, new CancelDelegationTokenHandler());
    opHandlers.put(FSEditLogOpCodes.OP_UPDATE_MASTER_KEY, new UpdateMasterKeyHandler());
    opHandlers.put(FSEditLogOpCodes.OP_REASSIGN_LEASE, new ReassignLeaseHandler());
    opHandlers.put(FSEditLogOpCodes.OP_START_LOG_SEGMENT, new NoOpHandler());
    opHandlers.put(FSEditLogOpCodes.OP_END_LOG_SEGMENT, new NoOpHandler());
    opHandlers.put(FSEditLogOpCodes.OP_CREATE_SNAPSHOT, new CreateSnapshotHandler());
    opHandlers.put(FSEditLogOpCodes.OP_DELETE_SNAPSHOT, new DeleteSnapshotHandler());
    opHandlers.put(FSEditLogOpCodes.OP_RENAME_SNAPSHOT, new RenameSnapshotHandler());
    opHandlers.put(FSEditLogOpCodes.OP_ALLOW_SNAPSHOT, new AllowSnapshotHandler());
    opHandlers.put(FSEditLogOpCodes.OP_DISALLOW_SNAPSHOT, new DisallowSnapshotHandler());
    opHandlers.put(FSEditLogOpCodes.OP_SET_GENSTAMP_V2, new SetGenstampV2Handler());
    opHandlers.put(FSEditLogOpCodes.OP_ALLOCATE_BLOCK_ID, new AllocateBlockIdHandler());
    opHandlers.put(FSEditLogOpCodes.OP_ROLLING_UPGRADE_START, new RollingUpgradeStartHandler());
    opHandlers.put(FSEditLogOpCodes.OP_ROLLING_UPGRADE_FINALIZE, new RollingUpgradeFinalizeHandler());
    opHandlers.put(FSEditLogOpCodes.OP_ADD_CACHE_DIRECTIVE, new AddCacheDirectiveHandler());
    opHandlers.put(FSEditLogOpCodes.OP_MODIFY_CACHE_DIRECTIVE, new ModifyCacheDirectiveHandler());
    opHandlers.put(FSEditLogOpCodes.OP_REMOVE_CACHE_DIRECTIVE, new RemoveCacheDirectiveHandler());
    opHandlers.put(FSEditLogOpCodes.OP_ADD_CACHE_POOL, new AddCachePoolHandler());
    opHandlers.put(FSEditLogOpCodes.OP_MODIFY_CACHE_POOL, new ModifyCachePoolHandler());
    opHandlers.put(FSEditLogOpCodes.OP_REMOVE_CACHE_POOL, new RemoveCachePoolHandler());
    opHandlers.put(FSEditLogOpCodes.OP_SET_ACL, new SetAclHandler());
    opHandlers.put(FSEditLogOpCodes.OP_SET_XATTR, new SetXAttrHandler());
    opHandlers.put(FSEditLogOpCodes.OP_REMOVE_XATTR, new RemoveXAttrHandler());
    opHandlers.put(FSEditLogOpCodes.OP_TRUNCATE, new TruncateHandler());
    opHandlers.put(FSEditLogOpCodes.OP_SET_STORAGE_POLICY, new SetStoragePolicyHandler());
  }

  private interface OpHandler {
    long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException;
  }

  // -----------------------------------------------------------------
  // Handlers for each opcode (only core logic moved, behavior unchanged)
  // -----------------------------------------------------------------

  private class AddHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      AddCloseOp addCloseOp = (AddCloseOp) op;
      String path = renameReservedPathsOnUpgrade(addCloseOp.path, logVersion);
      INodesInPath iip = fsDir.getINodesInPath(path, true);
      INodeFile oldFile = INodeFile.valueOf(iip.getLastINode(), path, true);
      if (oldFile != null && addCloseOp.overwrite) {
        FSDirDeleteOp.deleteForEditLog(fsDir, path, addCloseOp.mtime);
        iip = INodesInPath.replace(iip, iip.length() - 1, null);
        oldFile = null;
      }
      INodeFile newFile = oldFile;
      if (oldFile == null) {
        short replication = fsNamesys.getBlockManager()
            .adjustReplication(addCloseOp.replication);
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
        if (toAddRetryCache) {
          HdfsFileStatus stat = FSDirStatAndListingOp.createFileStatus(
              fsNamesys.dir, path, HdfsFileStatus.EMPTY_NAME, newFile,
              BlockStoragePolicySuite.ID_UNSPECIFIED, Snapshot.CURRENT_STATE_ID,
              false, iip);
          fsNamesys.addCacheEntryWithPayload(addCloseOp.rpcClientId,
              addCloseOp.rpcCallId, stat);
        }
      } else {
        if (!oldFile.isUnderConstruction()) {
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
      return inodeId;
    }
  }

  private class CloseHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      AddCloseOp addCloseOp = (AddCloseOp) op;
      String path = renameReservedPathsOnUpgrade(addCloseOp.path, logVersion);
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
  }

  private class AppendHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      AppendOp appendOp = (AppendOp) op;
      String path = renameReservedPathsOnUpgrade(appendOp.path, logVersion);
      INodesInPath iip = fsDir.getINodesInPath4Write(path);
      INodeFile file = INodeFile.valueOf(iip.getLastINode(), path);
      if (!file.isUnderConstruction()) {
        LocatedBlock lb = fsNamesys.prepareFileForAppend(path, iip,
            appendOp.clientName, appendOp.clientMachine, appendOp.newBlock,
            false, false);
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
  }

  private class UpdateBlocksHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      UpdateBlocksOp updateOp = (UpdateBlocksOp) op;
      String path = renameReservedPathsOnUpgrade(updateOp.path, logVersion);
      INodesInPath iip = fsDir.getINodesInPath(path, true);
      INodeFile oldFile = INodeFile.valueOf(iip.getLastINode(), path);
      updateBlocks(fsDir, updateOp, iip, oldFile);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(updateOp.rpcClientId, updateOp.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class AddBlockHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      AddBlockOp addBlockOp = (AddBlockOp) op;
      String path = renameReservedPathsOnUpgrade(addBlockOp.getPath(), logVersion);
      INodeFile oldFile = INodeFile.valueOf(fsDir.getINode(path), path);
      addNewBlock(fsDir, addBlockOp, oldFile);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class SetReplicationHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetReplicationOp setReplicationOp = (SetReplicationOp) op;
      short replication = fsNamesys.getBlockManager()
          .adjustReplication(setReplicationOp.replication);
      FSDirAttrOp.unprotectedSetReplication(fsDir,
          renameReservedPathsOnUpgrade(setReplicationOp.path, logVersion),
          replication, null);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class ConcatDeleteHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
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
      FSDirConcatOp.unprotectedConcat(fsDir, targetIIP, srcFiles,
          concatDeleteOp.timestamp);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(concatDeleteOp.rpcClientId,
            concatDeleteOp.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class RenameOldHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      RenameOldOp renameOp = (RenameOldOp) op;
      String src = renameReservedPathsOnUpgrade(renameOp.src, logVersion);
      String dst = renameReservedPathsOnUpgrade(renameOp.dst, logVersion);
      FSDirRenameOp.renameForEditLog(fsDir, src, dst, renameOp.timestamp);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(renameOp.rpcClientId, renameOp.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class DeleteHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      DeleteOp deleteOp = (DeleteOp) op;
      FSDirDeleteOp.deleteForEditLog(fsDir,
          renameReservedPathsOnUpgrade(deleteOp.path, logVersion),
          deleteOp.timestamp);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(deleteOp.rpcClientId, deleteOp.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class MkdirHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      MkdirOp mkdirOp = (MkdirOp) op;
      inodeId = getAndUpdateLastInodeId(mkdirOp.inodeId, logVersion, lastInodeId);
      FSDirMkdirOp.mkdirForEditLog(fsDir, inodeId,
          renameReservedPathsOnUpgrade(mkdirOp.path, logVersion),
          mkdirOp.permissions, mkdirOp.aclEntries, mkdirOp.timestamp);
      return inodeId;
    }
  }

  private class SetGenstampV1Handler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetGenstampV1Op setGenstampV1Op = (SetGenstampV1Op) op;
      fsNamesys.getBlockIdManager().setGenerationStampV1(setGenstampV1Op.genStampV1);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class SetPermissionsHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetPermissionsOp setPermissionsOp = (SetPermissionsOp) op;
      FSDirAttrOp.unprotectedSetPermission(fsDir,
          renameReservedPathsOnUpgrade(setPermissionsOp.src, logVersion),
          setPermissionsOp.permissions);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class SetOwnerHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetOwnerOp setOwnerOp = (SetOwnerOp) op;
      FSDirAttrOp.unprotectedSetOwner(fsDir,
          renameReservedPathsOnUpgrade(setOwnerOp.src, logVersion),
          setOwnerOp.username, setOwnerOp.groupname);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class SetNSQuotaHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetNSQuotaOp setNSQuotaOp = (SetNSQuotaOp) op;
      FSDirAttrOp.unprotectedSetQuota(fsDir,
          renameReservedPathsOnUpgrade(setNSQuotaOp.src, logVersion),
          setNSQuotaOp.nsQuota, HdfsConstants.QUOTA_DONT_SET, null);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class ClearNSQuotaHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      ClearNSQuotaOp clearNSQuotaOp = (ClearNSQuotaOp) op;
      FSDirAttrOp.unprotectedSetQuota(fsDir,
          renameReservedPathsOnUpgrade(clearNSQuotaOp.src, logVersion),
          HdfsConstants.QUOTA_RESET, HdfsConstants.QUOTA_DONT_SET, null);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class SetQuotaHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetQuotaOp setQuotaOp = (SetQuotaOp) op;
      FSDirAttrOp.unprotectedSetQuota(fsDir,
          renameReservedPathsOnUpgrade(setQuotaOp.src, logVersion),
          setQuotaOp.nsQuota, setQuotaOp.dsQuota, null);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class SetQuotaByStorageTypeHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      FSEditLogOp.SetQuotaByStorageTypeOp setQuotaByStorageTypeOp =
          (FSEditLogOp.SetQuotaByStorageTypeOp) op;
      FSDirAttrOp.unprotectedSetQuota(fsDir,
          renameReservedPathsOnUpgrade(setQuotaByStorageTypeOp.src, logVersion),
          HdfsConstants.QUOTA_DONT_SET, setQuotaByStorageTypeOp.dsQuota,
          setQuotaByStorageTypeOp.type);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class TimesHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      TimesOp timesOp = (TimesOp) op;
      FSDirAttrOp.unprotectedSetTimes(fsDir,
          renameReservedPathsOnUpgrade(timesOp.path, logVersion),
          timesOp.mtime, timesOp.atime, true);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class SymlinkHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      if (!FileSystem.areSymlinksEnabled()) {
        throw new IOException("Symlinks not supported - please remove symlink before upgrading to this version of HDFS");
      }
      SymlinkOp symlinkOp = (SymlinkOp) op;
      inodeId = getAndUpdateLastInodeId(symlinkOp.inodeId, logVersion, lastInodeId);
      String path = renameReservedPathsOnUpgrade(symlinkOp.path, logVersion);
      INodesInPath iip = fsDir.getINodesInPath(path, false);
      FSDirSymlinkOp.unprotectedAddSymlink(fsDir, iip.getExistingINodes(),
          iip.getLastLocalName(), inodeId, symlinkOp.value, symlinkOp.mtime,
          symlinkOp.atime, symlinkOp.permissionStatus);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(symlinkOp.rpcClientId, symlinkOp.rpcCallId);
      }
      return inodeId;
    }
  }

  private class RenameHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
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

  private class GetDelegationTokenHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      GetDelegationTokenOp getDelegationTokenOp = (GetDelegationTokenOp) op;
      fsNamesys.getDelegationTokenSecretManager()
          .addPersistedDelegationToken(getDelegationTokenOp.token,
              getDelegationTokenOp.expiryTime);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class RenewDelegationTokenHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      RenewDelegationTokenOp renewDelegationTokenOp = (RenewDelegationTokenOp) op;
      fsNamesys.getDelegationTokenSecretManager()
          .updatePersistedTokenRenewal(renewDelegationTokenOp.token,
              renewDelegationTokenOp.expiryTime);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class CancelDelegationTokenHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      CancelDelegationTokenOp cancelDelegationTokenOp = (CancelDelegationTokenOp) op;
      fsNamesys.getDelegationTokenSecretManager()
          .updatePersistedTokenCancellation(cancelDelegationTokenOp.token);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class UpdateMasterKeyHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      UpdateMasterKeyOp updateMasterKeyOp = (UpdateMasterKeyOp) op;
      fsNamesys.getDelegationTokenSecretManager()
          .updatePersistedMasterKey(updateMasterKeyOp.key);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class ReassignLeaseHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      ReassignLeaseOp reassignLeaseOp = (ReassignLeaseOp) op;
      Lease lease = fsNamesys.leaseManager.getLease(reassignLeaseOp.leaseHolder);
      String path = renameReservedPathsOnUpgrade(reassignLeaseOp.path, logVersion);
      INodeFile pendingFile = fsDir.getINode(path).asFile();
      Preconditions.checkState(pendingFile.isUnderConstruction());
      fsNamesys.reassignLeaseInternal(lease, path,
          reassignLeaseOp.newHolder, pendingFile);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class NoOpHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) {
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class CreateSnapshotHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      CreateSnapshotOp createSnapshotOp = (CreateSnapshotOp) op;
      String snapshotRoot = renameReservedPathsOnUpgrade(
          createSnapshotOp.snapshotRoot, logVersion);
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

  private class DeleteSnapshotHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      DeleteSnapshotOp deleteSnapshotOp = (DeleteSnapshotOp) op;
      BlocksMapUpdateInfo collectedBlocks = new BlocksMapUpdateInfo();
      List<INode> removedINodes = new ChunkedArrayList<INode>();
      String snapshotRoot = renameReservedPathsOnUpgrade(
          deleteSnapshotOp.snapshotRoot, logVersion);
      INodesInPath iip = fsDir.getINodesInPath4Write(snapshotRoot);
      fsNamesys.getSnapshotManager().deleteSnapshot(iip,
          deleteSnapshotOp.snapshotName, collectedBlocks, removedINodes);
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

  private class RenameSnapshotHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      RenameSnapshotOp renameSnapshotOp = (RenameSnapshotOp) op;
      String snapshotRoot = renameReservedPathsOnUpgrade(
          renameSnapshotOp.snapshotRoot, logVersion);
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

  private class AllowSnapshotHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      AllowSnapshotOp allowSnapshotOp = (AllowSnapshotOp) op;
      String snapshotRoot = renameReservedPathsOnUpgrade(
          allowSnapshotOp.snapshotRoot, logVersion);
      fsNamesys.getSnapshotManager().setSnapshottable(snapshotRoot, false);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class DisallowSnapshotHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      DisallowSnapshotOp disallowSnapshotOp = (DisallowSnapshotOp) op;
      String snapshotRoot = renameReservedPathsOnUpgrade(
          disallowSnapshotOp.snapshotRoot, logVersion);
      fsNamesys.getSnapshotManager().resetSnapshottable(snapshotRoot);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class SetGenstampV2Handler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetGenstampV2Op setGenstampV2Op = (SetGenstampV2Op) op;
      fsNamesys.getBlockIdManager().setGenerationStampV2(setGenstampV2Op.genStampV2);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class AllocateBlockIdHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      AllocateBlockIdOp allocateBlockIdOp = (AllocateBlockIdOp) op;
      fsNamesys.getBlockIdManager().setLastAllocatedBlockId(allocateBlockIdOp.blockId);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class RollingUpgradeStartHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      if (startOpt == StartupOption.ROLLINGUPGRADE) {
        RollingUpgradeStartupOption rollingUpgradeOpt = startOpt.getRollingUpgradeStartupOption();
        if (rollingUpgradeOpt == RollingUpgradeStartupOption.ROLLBACK) {
          throw new RollingUpgradeOp.RollbackException();
        } else if (rollingUpgradeOpt == RollingUpgradeStartupOption.DOWNGRADE) {
          return INodeId.GRANDFATHER_INODE_ID;
        }
      }
      long startTime = ((RollingUpgradeOp) op).getTime();
      fsNamesys.startRollingUpgradeInternal(startTime);
      fsNamesys.triggerRollbackCheckpoint();
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class RollingUpgradeFinalizeHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      long finalizeTime = ((RollingUpgradeOp) op).getTime();
      if (fsNamesys.isRollingUpgrade()) {
        fsNamesys.finalizeRollingUpgradeInternal(finalizeTime);
      }
      fsNamesys.getFSImage().updateStorageVersion();
      fsNamesys.getFSImage().renameCheckpoint(NameNodeFile.IMAGE_ROLLBACK,
          NameNodeFile.IMAGE);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class AddCacheDirectiveHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      AddCacheDirectiveInfoOp addOp = (AddCacheDirectiveInfoOp) op;
      CacheDirectiveInfo result = fsNamesys.getCacheManager()
          .addDirectiveFromEditLog(addOp.directive);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntryWithPayload(op.rpcClientId, op.rpcCallId,
            result.getId());
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class ModifyCacheDirectiveHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      ModifyCacheDirectiveInfoOp modifyOp = (ModifyCacheDirectiveInfoOp) op;
      fsNamesys.getCacheManager().modifyDirectiveFromEditLog(modifyOp.directive);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class RemoveCacheDirectiveHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      RemoveCacheDirectiveInfoOp removeOp = (RemoveCacheDirectiveInfoOp) op;
      fsNamesys.getCacheManager().removeDirective(removeOp.id, null);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class AddCachePoolHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      AddCachePoolOp addOp = (AddCachePoolOp) op;
      fsNamesys.getCacheManager().addCachePool(addOp.info);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class ModifyCachePoolHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      ModifyCachePoolOp modifyOp = (ModifyCachePoolOp) op;
      fsNamesys.getCacheManager().modifyCachePool(modifyOp.info);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class RemoveCachePoolHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      RemoveCachePoolOp removeOp = (RemoveCachePoolOp) op;
      fsNamesys.getCacheManager().removeCachePool(removeOp.poolName);
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(op.rpcClientId, op.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class SetAclHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetAclOp setAclOp = (SetAclOp) op;
      FSDirAclOp.unprotectedSetAcl(fsDir, setAclOp.src, setAclOp.aclEntries, true);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class SetXAttrHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetXAttrOp setXAttrOp = (SetXAttrOp) op;
      FSDirXAttrOp.unprotectedSetXAttrs(fsDir, setXAttrOp.src,
          setXAttrOp.xAttrs,
          EnumSet.of(XAttrSetFlag.CREATE, XAttrSetFlag.REPLACE));
      if (toAddRetryCache) {
        fsNamesys.addCacheEntry(setXAttrOp.rpcClientId, setXAttrOp.rpcCallId);
      }
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class RemoveXAttrHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
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

  private class TruncateHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      TruncateOp truncateOp = (TruncateOp) op;
      fsDir.unprotectedTruncate(truncateOp.src, truncateOp.clientName,
          truncateOp.clientMachine, truncateOp.newLength, truncateOp.timestamp,
          truncateOp.truncateBlock);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  private class SetStoragePolicyHandler implements OpHandler {
    public long apply(FSEditLogOp op, FSDirectory fsDir, int logVersion,
        long lastInodeId, boolean toAddRetryCache) throws IOException {
      SetStoragePolicyOp setStoragePolicyOp = (SetStoragePolicyOp) op;
      String path = renameReservedPathsOnUpgrade(setStoragePolicyOp.path, logVersion);
      INodesInPath iip = fsDir.getINodesInPath4Write(path);
      FSDirAttrOp.unprotectedSetStoragePolicy(fsDir,
          fsNamesys.getBlockManager(), iip, setStoragePolicyOp.policyId);
      return INodeId.GRANDFATHER_INODE_ID;
    }
  }

  // -----------------------------------------------------------------
  // Core method now delegates to handlers
  // -----------------------------------------------------------------

  @SuppressWarnings("deprecation")
  private long applyEditLogOp(FSEditLogOp op, FSDirectory fsDir,
      StartupOption startOpt, int logVersion, long lastInodeId) throws IOException {
    long inodeId = INodeId.GRANDFATHER_INODE_ID;
    if (LOG.isTraceEnabled()) {
      LOG.trace("replaying edit log: " + op);
    }
    final boolean toAddRetryCache = fsNamesys.hasRetryCache() && op.hasRpcIds();
    OpHandler handler = opHandlers.get(op.opCode);
    if (handler == null) {
      throw new IOException("Invalid operation read " + op.opCode);
    }
    inodeId = handler.apply(op, fsDir, logVersion, lastInodeId, toAddRetryCache);
    return inodeId;
  }

  // -----------------------------------------------------------------
  // Remaining unchanged methods (unchanged from original source)
  // -----------------------------------------------------------------

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

  // ... (the rest of the class remains unchanged) ...

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