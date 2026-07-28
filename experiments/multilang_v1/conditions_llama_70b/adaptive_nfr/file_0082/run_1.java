private static final String PIPE = " | ";
private static final String TAB = "\t";
private static final String NEWLINE = "\n";

private static final String USAGE = "Usage: java NameNode " + PIPE + NEWLINE +
    TAB + StartupOption.BACKUP.getName() + PIPE + NEWLINE +
    TAB + StartupOption.CHECKPOINT.getName() + PIPE + NEWLINE +
    TAB + StartupOption.FORMAT.getName() + " " + StartupOption.CLUSTERID.getName() +
    " cid " + StartupOption.FORCE.getName() + " " + StartupOption.NONINTERACTIVE.getName() +
    PIPE + NEWLINE +
    TAB + StartupOption.UPGRADE.getName() + " " + StartupOption.CLUSTERID.getName() +
    " cid " + StartupOption.RENAMERESERVED.getName() + "<k-v pairs>" + PIPE + NEWLINE +
    TAB + StartupOption.UPGRADEONLY.getName() + " " + StartupOption.CLUSTERID.getName() +
    " cid " + StartupOption.RENAMERESERVED.getName() + "<k-v pairs>" + PIPE + NEWLINE +
    TAB + StartupOption.ROLLBACK.getName() + PIPE + NEWLINE +
    TAB + StartupOption.ROLLINGUPGRADE.getName() + " " +
    RollingUpgradeStartupOption.getAllOptionString() + PIPE + NEWLINE +
    TAB + StartupOption.FINALIZE.getName() + PIPE + NEWLINE +
    TAB + StartupOption.IMPORT.getName() + PIPE + NEWLINE +
    TAB + StartupOption.INITIALIZESHAREDEDITS.getName() + PIPE + NEWLINE +
    TAB + StartupOption.BOOTSTRAPSTANDBY.getName() + PIPE + NEWLINE +
    TAB + StartupOption.RECOVER.getName() + " " + StartupOption.FORCE.getName() +
    PIPE + NEWLINE +
    TAB + StartupOption.METADATAVERSION.getName();