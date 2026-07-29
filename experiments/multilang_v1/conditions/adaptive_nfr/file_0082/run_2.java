private static final String USAGE_SEPARATOR = "] | \n\t[";

private static final String USAGE = "Usage: java NameNode ["
    + StartupOption.BACKUP.getName() + USAGE_SEPARATOR
    + StartupOption.CHECKPOINT.getName() + USAGE_SEPARATOR
    + StartupOption.FORMAT.getName() + " ["
    + StartupOption.CLUSTERID.getName() + " cid ] ["
    + StartupOption.FORCE.getName() + "] ["
    + StartupOption.NONINTERACTIVE.getName() + "] ] | \n\t["
    + StartupOption.UPGRADE.getName() + 
      " [" + StartupOption.CLUSTERID.getName() + " cid]" +
      " [" + StartupOption.RENAMERESERVED.getName() + "<k-v pairs>] ] | \n\t["
    + StartupOption.UPGRADEONLY.getName() + 
      " [" + StartupOption.CLUSTERID.getName() + " cid]" +
      " [" + StartupOption.RENAMERESERVED.getName() + "<k-v pairs>] ] | \n\t["
    + StartupOption.ROLLBACK.getName() + USAGE_SEPARATOR
    + StartupOption.ROLLINGUPGRADE.getName() + " "
    + RollingUpgradeStartupOption.getAllOptionString() + " ] | \n\t["
    + StartupOption.FINALIZE.getName() + USAGE_SEPARATOR
    + StartupOption.IMPORT.getName() + USAGE_SEPARATOR
    + StartupOption.INITIALIZESHAREDEDITS.getName() + USAGE_SEPARATOR
    + StartupOption.BOOTSTRAPSTANDBY.getName() + USAGE_SEPARATOR
    + StartupOption.RECOVER.getName() + " [ "
    + StartupOption.FORCE.getName() + "] ] | \n\t["
    + StartupOption.METADATAVERSION.getName() + " ] "
    + " ]";