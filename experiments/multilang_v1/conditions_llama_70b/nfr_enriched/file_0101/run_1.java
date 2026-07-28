public static void main(String[] args) {
    checkJavaVersion();
    parseCommandLine(args);
    initializeSettings();
    connectToServer();
    initializeGUI();
    openFiles(args);
    createView();
    startServer();
    logStartupComplete();
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
    // Parse command line arguments
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
    // Initialize settings directory
    settingsDirectory = MiscUtilities.constructPath(System.getProperty("user.home"), ".jedit");
    // ...
}

private static void connectToServer() {
    // Try connecting to another running jEdit instance
    if (portFile != null && new File(portFile).exists()) {
        // ...
    }
}

private static void initializeGUI() {
    // Don't show splash screen if there is a file named 'nosplash' in the settings directory
    if (!new File(settingsDirectory, "nosplash").exists()) {
        GUIUtilities.showSplashScreen();
    }
    // ...
}

private static void openFiles(String[] args) {
    // Open files specified on command line
    Buffer buffer = openFiles(null, System.getProperty("user.dir"), args);
    // ...
}

private static void createView() {
    // Create the view and hide the splash screen
    final Buffer _buffer = buffer;
    final String _splitConfig = splitConfig;
    final boolean _gui = gui;

    GUIUtilities.advanceSplashProgress();

    SwingUtilities.invokeLater(new Runnable() {
        public void run() {
            // ...
        }
    });
}

private static void startServer() {
    // Start edit server
    if (server != null) {
        server.start();
    }
}

private static void logStartupComplete() {
    Log.log(Log.MESSAGE, jEdit.class, "Startup complete");
}