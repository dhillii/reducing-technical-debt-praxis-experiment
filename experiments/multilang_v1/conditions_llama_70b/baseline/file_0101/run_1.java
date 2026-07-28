public static void main(String[] args) {
    checkJavaVersion();
    parseCommandLine(args);
    initializeSettings();
    connectToServer();
    createAndShowGUI(args);
}

private static void checkJavaVersion() {
    String javaVersion = System.getProperty("java.version");
    if (javaVersion.compareTo("1.3") < 0) {
        System.err.println("You are running Java version " + javaVersion + ".");
        System.err.println("jEdit requires Java 1.3 or later.");
        System.exit(1);
    }
}

private static void parseCommandLine(String[] args) {
    int level = Log.WARNING;
    if (args.length >= 1) {
        String levelStr = args[0];
        if (levelStr.length() == 1 && Character.isDigit(levelStr.charAt(0))) {
            level = Integer.parseInt(levelStr);
            args[0] = null;
        }
    }

    // ...
}

private static void initializeSettings() {
    settingsDirectory = MiscUtilities.constructPath(System.getProperty("user.home"), ".jedit");
    // ...
}

private static void connectToServer() {
    if (portFile != null && new File(portFile).exists()) {
        // ...
    }
}

private static void createAndShowGUI(String[] args) {
    // ...
    SwingUtilities.invokeLater(new Runnable() {
        public void run() {
            // ...
        }
    });
}