private static final String USAGE_SEPARATOR = "] | \n\t[";
  
private static final String USAGE = "Usage: java NameNode [" 
      + StartupOption.BACKUP.getName() + USAGE_SEPARATOR
      + StartupOption.CHECKPOINT.getName() + USAGE_SEPARATOR
      + StartupOption.FORMAT.getName() + " [" 
      + StartupOption.CLUSTERID.getName() + " cid ] [" 
      + StartupOption.FORCE.getName() + "] [" 
      + StartupOption.NONINTERACTIVE.getName() + "] ]" + USAGE_SEPARATOR
      + StartupOption.UPGRADE.getName() + " [" 
      + StartupOption.CLUSTERID.getName() + " cid]" 
      + " [" + StartupOption.RENAMERESERVED.getName() + "<k-v pairs>] ]" + USAGE_SEPARATOR
      + StartupOption.UPGRADEONLY.getName() + " [" 
      + StartupOption.CLUSTERID.getName() + " cid]" 
      + " [" + StartupOption.RENAMERESERVED.getName() + "<k-v pairs>] ]" + USAGE_SEPARATOR
      + StartupOption.ROLLBACK.getName() + "]" + USAGE_SEPARATOR
      + StartupOption.ROLLINGUPGRADE.getName() + " " 
      + RollingUpgradeStartupOption.getAllOptionString() + " ]" + USAGE_SEPARATOR
      + StartupOption.FINALIZE.getName() + "]" + USAGE_SEPARATOR
      + StartupOption.IMPORT.getName() + "]" + USAGE_SEPARATOR
      + StartupOption.INITIALIZESHAREDEDITS.getName() + "]" + USAGE_SEPARATOR
      + StartupOption.BOOTSTRAPSTANDBY.getName() + "]" + USAGE_SEPARATOR
      + StartupOption.RECOVER.getName() + " [ " 
      + StartupOption.FORCE.getName() + "] ]" + USAGE_SEPARATOR
      + StartupOption.METADATAVERSION.getName() + " ] " + " ]";