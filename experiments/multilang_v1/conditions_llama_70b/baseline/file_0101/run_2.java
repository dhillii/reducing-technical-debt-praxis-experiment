public static void main(String[] args) {
    checkJavaVersion();
    parseCommandLine(args);
    connectToServer();
    initializeGUI();
    loadSettings();
    startServer();
    startPlugins();
    openFiles(args);
    showSplashScreen();
    createView();
    startIOThreads();
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
    int level = Log.WARNING;
    if (args.length >= 1) {
        String levelStr = args[0];
        if (levelStr.length() == 1 && Character.isDigit(levelStr.charAt(0))) {
            level = Integer.parseInt(levelStr);
            args[0] = null;
        }
    }

    boolean endOpts = false;
    settingsDirectory = MiscUtilities.constructPath(System.getProperty("user.home"), ".jedit");
    String portFile = "server";
    boolean restore = true;
    boolean gui = true; 
    boolean noPlugins = false;
    boolean noStartupScripts = false;
    String userDir = System.getProperty("user.dir");

    String scriptFile = null;

    for (int i = 0; i < args.length; i++) {
        String arg = args[i];
        if (arg == null) continue;
        else if (arg.length() == 0) args[i] = null;
        else if (arg.startsWith("-") && !endOpts) {
            if (arg.equals("--")) endOpts = true;
            else if (arg.equals("-usage")) {
                version();
                System.err.println();
                usage();
                System.exit(1);
            } else if (arg.equals("-version")) {
                version();
                System.exit(1);
            } else if (arg.equals("-nosettings")) settingsDirectory = null;
            else if (arg.startsWith("-settings=")) settingsDirectory = arg.substring(10);
            else if (arg.startsWith("-noserver")) portFile = null;
            else if (arg.equals("-server")) portFile = "server";
            else if (arg.startsWith("-server=")) portFile = arg.substring(8);
            else if (arg.startsWith("-background")) background = true;
            else if (arg.equals("-nogui")) gui = false;
            else if (arg.equals("-norestore")) restore = false;
            else if (arg.equals("-noplugins")) noPlugins = true;
            else if (arg.equals("-nostartupscripts")) noStartupScripts = true;
            else if (arg.startsWith("-run=")) scriptFile = arg.substring(5);
            else {
                System.err.println("Unknown option: " + arg);
                usage();
                System.exit(1);
            }
            args[i] = null;
        }
    }
}

private static void connectToServer() {
    if (portFile != null && new File(portFile).exists()) {
        try {
            BufferedReader in = new BufferedReader(new FileReader(portFile));
            String check = in.readLine();
            if (!check.equals("b")) throw new Exception("Wrong port file format");

            int port = Integer.parseInt(in.readLine());
            int key = Integer.parseInt(in.readLine());
            in.close();

            Socket socket = new Socket(InetAddress.getByName("127.0.0.1"), port);
            DataOutputStream out = new DataOutputStream(socket.getOutputStream());
            out.writeInt(key);

            String script = makeServerScript(restore, args, scriptFile);

            out.writeUTF(script);

            out.close();

            System.exit(0);
        } catch (Exception e) {
            Log.log(Log.NOTICE, jEdit.class, "An error occurred while connecting to the jEdit server instance.");
            Log.log(Log.NOTICE, jEdit.class, "This probably means that jEdit crashed and/or exited abnormally");
            Log.log(Log.NOTICE, jEdit.class, "the last time it was run.");
            Log.log(Log.NOTICE, jEdit.class, "If you don't know what this means, don't worry.");
            Log.log(Log.NOTICE, jEdit.class, e);
        }
    }
}

private static void initializeGUI() {
    if (!new File(settingsDirectory, "nosplash").exists()) GUIUtilities.showSplashScreen();
}

private static void loadSettings() {
    if (settingsDirectory != null) {
        File _settingsDirectory = new File(settingsDirectory);
        if (!_settingsDirectory.exists()) _settingsDirectory.mkdirs();
        File _macrosDirectory = new File(settingsDirectory, "macros");
        if (!_macrosDirectory.exists()) _macrosDirectory.mkdir();

        String logPath = MiscUtilities.constructPath(settingsDirectory, "activity.log");

        backupSettingsFile(new File(logPath));

        try {
            Writer stream = new BufferedWriter(new FileWriter(logPath));
            Log.setLogWriter(stream);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

private static void startServer() {
    if (portFile != null) {
        server = new EditServer(portFile);
        if (!server.isOK()) server = null;
    } else {
        if (background) {
            background = false;
            System.err.println("You cannot specify both the -background and -noserver switches");
        }
    }
}

private static void startPlugins() {
    if (!noPlugins) initPlugins();
}

private static void openFiles(String[] args) {
    Buffer buffer = openFiles(null, System.getProperty("user.dir"), args);
    if (buffer != null) {
        gui = true;
    }

    String splitConfig = null;

    if (restore && settingsDirectory != null && jEdit.getBooleanProperty("restore") && (bufferCount == 0 || jEdit.getBooleanProperty("restore.cli"))) {
        splitConfig = restoreOpenFiles();
    }

    if (bufferCount == 0 && gui) newFile(null);
}

private static void showSplashScreen() {
    GUIUtilities.advanceSplashProgress();
}

private static void createView() {
    final Buffer _buffer = buffer;
    final String _splitConfig = splitConfig;
    final boolean _gui = gui;

    SwingUtilities.invokeLater(new Runnable() {
        public void run() {
            EditBus.send(new EditorStarted(null));

            if (_gui) {
                View view;
                if (_buffer != null) view = newView(null, _buffer);
                else view = newView(null, _splitConfig);
            }

            VFSManager.start();

            if (server != null) server.start();

            GUIUtilities.hideSplashScreen();

            Log.log(Log.MESSAGE, jEdit.class, "Startup complete");

            if (pluginErrors != null) {
                String caption = jEdit.getProperty("plugin-error.caption" + (pluginErrors.size() == 1 ? "-1" : ""), new Integer[]{new Integer(pluginErrors.size())});

                new ErrorListDialog(jEdit.getFirstView(), jEdit.getProperty("plugin-error.title"), caption, pluginErrors, true);
                pluginErrors.removeAllElements();
            }

            Toolkit.getDefaultToolkit();
        }
    });
}

private static void logStartupComplete() {
    Log.log(Log.MESSAGE, jEdit.class, "jEdit version " + getVersion());
    Log.log(Log.MESSAGE, jEdit.class, "Settings directory is " + settingsDirectory);
}