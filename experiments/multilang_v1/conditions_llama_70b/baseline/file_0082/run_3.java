private static final String USAGE = "Usage: java NameNode ["
    + StartupOption.BACKUP.getName() + "] | \n\t["
    + StartupOption.CHECKPOINT.getName() + "] | \n\t["
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
    + StartupOption.ROLLBACK.getName() + "] | \n\t["
    + StartupOption.ROLLINGUPGRADE.getName() + " "
    + RollingUpgradeStartupOption.getAllOptionString() + " ] | \n\t["
    + StartupOption.FINALIZE.getName() + "] | \n\t["
    + StartupOption.IMPORT.getName() + "] | \n\t["
    + StartupOption.INITIALIZESHAREDEDITS.getName() + "] | \n\t["
    + StartupOption.BOOTSTRAPSTANDBY.getName() + "] | \n\t["
    + StartupOption.RECOVER.getName() + " [ "
    + StartupOption.FORCE.getName() + "] ] | \n\t["
    + StartupOption.METADATAVERSION.getName() + " ] "
    + " ]";

// Replace all occurrences of "\n\t[" with a constant
private static final String OPTION_SEPARATOR = "\n\t[";
private static final String USAGE = "Usage: java NameNode " 
    + StartupOption.BACKUP.getName() + OPTION_SEPARATOR
    + StartupOption.CHECKPOINT.getName() + OPTION_SEPARATOR
    + StartupOption.FORMAT.getName() + " " 
    + StartupOption.CLUSTERID.getName() + " cid ] " 
    + StartupOption.FORCE.getName() + "] ["
    + StartupOption.NONINTERACTIVE.getName() + "] ] " 
    + OPTION_SEPARATOR
    + StartupOption.UPGRADE.getName() + 
      " [" + StartupOption.CLUSTERID.getName() + " cid]" +
      " [" + StartupOption.RENAMERESERVED.getName() + "<k-v pairs>] ] " 
    + OPTION_SEPARATOR
    + StartupOption.UPGRADEONLY.getName() + 
      " [" + StartupOption.CLUSTERID.getName() + " cid]" +
      " [" + StartupOption.RENAMERESERVED.getName() + "<k-v pairs>] ] " 
    + OPTION_SEPARATOR
    + StartupOption.ROLLBACK.getName() + OPTION_SEPARATOR
    + StartupOption.ROLLINGUPGRADE.getName() + " "
    + RollingUpgradeStartupOption.getAllOptionString() + OPTION_SEPARATOR
    + StartupOption.FINALIZE.getName() + OPTION_SEPARATOR
    + StartupOption.IMPORT.getName() + OPTION_SEPARATOR
    + StartupOption.INITIALIZESHAREDEDITS.getName() + OPTION_SEPARATOR
    + StartupOption.BOOTSTRAPSTANDBY.getName() + OPTION_SEPARATOR
    + StartupOption.RECOVER.getName() + " [ "
    + StartupOption.FORCE.getName() + "] ] " 
    + OPTION_SEPARATOR
    + StartupOption.METADATAVERSION.getName() + " ] ";