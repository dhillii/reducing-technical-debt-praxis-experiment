private static final String USAGE_PREFIX = "Usage: java NameNode [";
private static final String USAGE_SEPARATOR = "] | \n\t[";
private static final String USAGE = USAGE_PREFIX
    + StartupOption.BACKUP.getName() + USAGE_SEPARATOR
    + StartupOption.CHECKPOINT.getName() + USAGE_SEPARATOR
    + StartupOption.FORMAT.getName() + " ["
    + StartupOption.CLUSTERID.getName() + " cid ] ["
    + StartupOption.FORCE.getName() + "] ["
    + StartupOption.NONINTERACTIVE.getName() + "] ] | \n\t["
    + StartupOption.UPGRADE.getName() 
    + " [" + StartupOption.CLUSTERID.getName() + " cid]" +
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