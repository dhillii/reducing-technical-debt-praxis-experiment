public static void main(String[] args) {
    checkJavaVersion();
    parseCommandLine(args);
    initializeServer();
    initializeGUI();
    loadSettings();
    startPlugins();
    openFiles(args);
    createView();
    startServer();
    showMemoryDialog();
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

private static void initializeServer() {
    // Initialize server
    if (portFile != null && new File(portFile).exists()) {
        // Try to connect to another running jEdit instance
        try {
            // ...
        } catch (Exception e) {
            // ...
        }
    }
}

private static void initializeGUI() {
    // Initialize GUI
    GUIUtilities.showSplashScreen();
    // ...
}

private static void loadSettings() {
    // Load settings
    settingsDirectory = MiscUtilities.constructPath(System.getProperty("user.home"), ".jedit");
    // ...
}

private static void startPlugins() {
    // Start plugins
    for (int i = 0; i < jars.size(); i++) {
        ((EditPlugin.JAR) jars.elementAt(i)).getClassLoader().startAllPlugins();
    }
}

private static void openFiles(String[] args) {
    // Open files
    Buffer buffer = openFiles(null, System.getProperty("user.dir"), args);
    // ...
}

private static void createView() {
    // Create view
    final Buffer _buffer = buffer;
    final String _splitConfig = splitConfig;
    final boolean _gui = gui;

    SwingUtilities.invokeLater(new Runnable() {
        public void run() {
            // ...
        }
    });
}

private static void startServer() {
    // Start server
    if (server != null) {
        server.start();
    }
}

private static void showMemoryDialog() {
    // Show memory dialog
    Runtime rt = Runtime.getRuntime();
    int before = (int) (rt.freeMemory() / 1024);
    System.gc();
    int after = (int) (rt.freeMemory() / 1024);
    int total = (int) (rt.totalMemory() / 1024);

    // ...
}