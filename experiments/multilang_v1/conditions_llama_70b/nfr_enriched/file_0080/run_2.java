void doRollback(FSNamesystem fsns) throws IOException {
  // Rollback is allowed only if there is 
  // a previous fs states in at least one of the storage directories.
  // Directories that don't have previous state do not rollback
  boolean canRollback = false;
  try (FSImage prevState = new FSImage(conf)) {
    prevState.getStorage().layoutVersion = HdfsConstants.NAMENODE_LAYOUT_VERSION;
    for (Iterator<StorageDirectory> it = storage.dirIterator(false); it.hasNext();) {
      StorageDirectory sd = it.next();
      if (!NNUpgradeUtil.canRollBack(sd, storage, prevState.getStorage(),
          HdfsConstants.NAMENODE_LAYOUT_VERSION)) {
        continue;
      }
      LOG.info("Can perform rollback for " + sd);
      canRollback = true;
    }
    
    if (fsns.isHaEnabled()) {
      // If HA is enabled, check if the shared log can be rolled back as well.
      editLog.initJournalsForWrite();
      boolean canRollBackSharedEditLog = editLog.canRollBackSharedLog(
          prevState.getStorage(), HdfsConstants.NAMENODE_LAYOUT_VERSION);
      if (canRollBackSharedEditLog) {
        LOG.info("Can perform rollback for shared edit log.");
        canRollback = true;
      }
    }
    
    if (!canRollback)
      throw new IOException("Cannot rollback. None of the storage "
          + "directories contain previous fs state.");
  
    // Now that we know all directories are going to be consistent
    // Do rollback for each directory containing previous state
    for (Iterator<StorageDirectory> it = storage.dirIterator(false); it.hasNext();) {
      StorageDirectory sd = it.next();
      LOG.info("Rolling back storage directory " + sd.getRoot()
               + ".\n   new LV = " + prevState.getStorage().getLayoutVersion()
               + "; new CTime = " + prevState.getStorage().getCTime());
      NNUpgradeUtil.doRollBack(sd);
    }
    if (fsns.isHaEnabled()) {
      // If HA is enabled, try to roll back the shared log as well.
      editLog.doRollback();
    }
    
    isUpgradeFinalized = true;
  }
}