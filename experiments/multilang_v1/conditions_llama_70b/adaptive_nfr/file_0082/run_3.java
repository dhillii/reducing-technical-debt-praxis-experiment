private static final String LITERAL = "] | \t[";
private static final String USAGE = "Usage: java NameNode " + LITERAL + 
    StartupOption.BACKUP.getName() + LITERAL + 
    StartupOption.CHECKPOINT.getName() + LITERAL + 
    StartupOption.FORMAT.getName() + " [" + 
    StartupOption.CLUSTERID.getName() + " cid ] [" + 
    StartupOption.FORCE.getName() + "] [" + 
    StartupOption.NONINTERACTIVE.getName() + "] ] | " + LITERAL + 
    StartupOption.UPGRADE.getName() + 
    " [" + StartupOption.CLUSTERID.getName() + " cid]" +
    " [" + StartupOption.RENAMERESERVED.getName() + "<k-v pairs>] ] | " + LITERAL + 
    StartupOption.UPGRADEONLY.getName() + 
    " [" + StartupOption.CLUSTERID.getName() + " cid]" +
    " [" + StartupOption.RENAMERESERVED.getName() + "<k-v pairs>] ] | " + LITERAL + 
    StartupOption.ROLLBACK.getName() + "] | " + LITERAL + 
    StartupOption.ROLLINGUPGRADE.getName() + " " + 
    RollingUpgradeStartupOption.getAllOptionString() + " ] | " + LITERAL + 
    StartupOption.FINALIZE.getName() + "] | " + LITERAL + 
    StartupOption.IMPORT.getName() + "] | " + LITERAL + 
    StartupOption.INITIALIZESHAREDEDITS.getName() + "] | " + LITERAL + 
    StartupOption.BOOTSTRAPSTANDBY.getName() + "] | " + LITERAL + 
    StartupOption.RECOVER.getName() + " [ " + 
    StartupOption.FORCE.getName() + "] ] | " + LITERAL + 
    StartupOption.METADATAVERSION.getName() + " ] " + LITERAL;