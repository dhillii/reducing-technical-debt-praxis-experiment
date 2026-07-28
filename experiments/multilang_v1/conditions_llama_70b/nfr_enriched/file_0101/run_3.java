public static void main(String[] args) {
    checkJavaVersion();
    parseCommandLine(args);
    connectToServer();
    initializeSettingsDirectory();
    initializeServer();
    getThingsRolling();
    openFiles();
    createView();
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

private static void connectToServer() {
    // Try connecting to another running jEdit instance
    if (portFile != null && new File(portFile).exists()) {
        // ...
    }
}

private static void initializeSettingsDirectory() {
    // Initialize settings directory
    if (settingsDirectory != null) {
        File _settingsDirectory = new File(settingsDirectory);
        if (!_settingsDirectory.exists()) {
            _settingsDirectory.mkdirs();
        }
        // ...
    }
}

private static void initializeServer() {
    // Initialize server
    if (portFile != null) {
        server = new EditServer(portFile);
        if (!server.isOK()) {
            server = null;
        }
    } else {
        if (background) {
            background = false;
            System.err.println("You cannot specify both the -background and -noserver switches");
        }
    }
}

private static void getThingsRolling() {
    // Get things rolling
    initMisc();
    initSystemProperties();
    if (jEditHome != null) {
        initSiteProperties();
    }
    // ...
}

private static void openFiles() {
    // Open files
    Buffer buffer = openFiles(null, userDir, args);
    if (buffer != null) {
        // files specified on command line; force initial view to open
        gui = true;
    }
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