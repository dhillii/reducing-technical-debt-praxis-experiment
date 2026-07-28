private void processArgs(String[] args) {
    ArgumentProcessorRegistry processorRegistry = ArgumentProcessorRegistry.getInstance();
    boolean justPrintUsage = false;
    boolean justPrintVersion = false;
    boolean justPrintDiagnostics = false;

    for (int i = 0; i < args.length; i++) {
        String arg = args[i];

        if (arg.equals("-help") || arg.equals("-h")) {
            justPrintUsage = true;
        } else if (arg.equals("-version")) {
            justPrintVersion = true;
        } else if (arg.equals("-diagnostics")) {
            justPrintDiagnostics = true;
        } else if (arg.equals("-quiet") || arg.equals("-q")) {
            msgOutputLevel = Project.MSG_WARN;
        } else if (arg.equals("-verbose") || arg.equals("-v")) {
            msgOutputLevel = Project.MSG_VERBOSE;
        } else if (arg.equals("-debug") || arg.equals("-d")) {
            msgOutputLevel = Project.MSG_DEBUG;
        } else if (arg.equals("-silent") || arg.equals("-S")) {
            silent = true;
        } else if (arg.equals("-noinput")) {
            allowInput = false;
        } else if (arg.equals("-logfile") || arg.equals("-l")) {
            handleLogfileArgument(args, i);
        } else if (arg.equals("-buildfile") || arg.equals("-file") || arg.equals("-f")) {
            handleBuildfileArgument(args, i);
        } else if (arg.equals("-listener")) {
            handleListenerArgument(args, i);
        } else if (arg.startsWith("-D")) {
            handleDefineArgument(args, i);
        } else if (arg.equals("-logger")) {
            handleLoggerArgument(args, i);
        } else if (arg.equals("-inputhandler")) {
            handleInputHandlerArgument(args, i);
        } else if (arg.equals("-emacs") || arg.equals("-e")) {
            emacsMode = true;
        } else if (arg.equals("-projecthelp") || arg.equals("-p")) {
            projectHelp = true;
        } else if (arg.equals("-find") || arg.equals("-s")) {
            handleFindArgument(args, i);
        } else if (arg.startsWith("-propertyfile")) {
            handlePropertyFileArgument(args, i);
        } else if (arg.equals("-k") || arg.equals("-keep-going")) {
            keepGoingMode = true;
        } else if (arg.equals("-nice")) {
            handleNiceArgument(args, i);
        } else if (LAUNCH_COMMANDS.contains(arg)) {
            throw new BuildException("Ant's Main method is being handed an option " + arg + " that is only for the launcher class.");
        } else if (arg.equals("-autoproxy")) {
            proxy = true;
        } else if (arg.startsWith("-")) {
            handleUnknownArgument(args, i, processorRegistry);
        } else {
            targets.addElement(arg);
        }
    }

    if (justPrintUsage || justPrintVersion || justPrintDiagnostics) {
        if (justPrintUsage) {
            printUsage();
        }
        if (justPrintDiagnostics) {
            Diagnostics.doReport(System.out, msgOutputLevel);
        }
        if (justPrintVersion) {
            printVersion(msgOutputLevel);
        }
        return;
    }

    if (buildFile == null) {
        if (searchForFile) {
            buildFile = findBuildFile(System.getProperty("user.dir"), searchForThis);
            if (buildFile == null) {
                throw new BuildException("Could not locate a build file!");
            }
        } else {
            buildFile = findDefaultBuildFile();
        }
    }

    if (!buildFile.exists()) {
        throw new BuildException("Buildfile: " + buildFile + " does not exist!");
    }

    if (buildFile.isDirectory()) {
        File whatYouMeant = new File(buildFile, "build.xml");
        if (whatYouMeant.isFile()) {
            buildFile = whatYouMeant;
        } else {
            throw new BuildException("What? Buildfile: " + buildFile + " is a dir!");
        }
    }

    buildFile = FileUtils.getFileUtils().normalize(buildFile.getAbsolutePath());

    loadPropertyFiles();

    if (msgOutputLevel >= Project.MSG_INFO) {
        System.out.println("Buildfile: " + buildFile);
    }

    readyToRun = true;
}

private void handleLogfileArgument(String[] args, int i) {
    try {
        File logFile = new File(args[i + 1]);
        i++;
        PrintStream logTo = new PrintStream(new FileOutputStream(logFile));
        isLogFileUsed = true;
        out = logTo;
        err = logTo;
        System.setOut(out);
        System.setErr(err);
    } catch (IOException ioe) {
        throw new BuildException("Cannot write on the specified log file. Make sure the path exists and you have write permissions.");
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a log file when using the -log argument");
    }
}

private void handleBuildfileArgument(String[] args, int i) {
    try {
        buildFile = new File(args[++i].replace('/', File.separatorChar));
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a buildfile when using the -buildfile argument");
    }
}

private void handleListenerArgument(String[] args, int i) {
    try {
        listeners.addElement(args[i + 1]);
        i++;
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a classname when using the -listener argument");
    }
}

private void handleDefineArgument(String[] args, int i) {
    String arg = args[i];
    String name = arg.substring(2, arg.length());
    String value = null;
    int posEq = name.indexOf("=");
    if (posEq > 0) {
        value = name.substring(posEq + 1);
        name = name.substring(0, posEq);
    } else if (i < args.length - 1) {
        value = args[++i];
    } else {
        throw new BuildException("Missing value for property " + name);
    }
    definedProps.put(name, value);
}

private void handleLoggerArgument(String[] args, int i) {
    if (loggerClassname != null) {
        throw new BuildException("Only one logger class may be specified.");
    }
    try {
        loggerClassname = args[++i];
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a classname when using the -logger argument");
    }
}

private void handleInputHandlerArgument(String[] args, int i) {
    if (inputHandlerClassname != null) {
        throw new BuildException("Only one input handler class may be specified.");
    }
    try {
        inputHandlerClassname = args[++i];
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a classname when using the -inputhandler argument");
    }
}

private void handleFindArgument(String[] args, int i) {
    searchForFile = true;
    if (i < args.length - 1) {
        searchForThis = args[++i];
    }
}

private void handlePropertyFileArgument(String[] args, int i) {
    try {
        propertyFiles.addElement(args[++i]);
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a property filename when using the -propertyfile argument");
    }
}

private void handleNiceArgument(String[] args, int i) {
    try {
        threadPriority = Integer.decode(args[++i]);
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must supply a niceness value (1-10) after the -nice option");
    } catch (NumberFormatException e) {
        throw new BuildException("Unrecognized niceness value: " + args[i]);
    }
    if (threadPriority.intValue() < Thread.MIN_PRIORITY || threadPriority.intValue() > Thread.MAX_PRIORITY) {
        throw new BuildException("Niceness value is out of the range 1-10");
    }
}

private void handleUnknownArgument(String[] args, int i, ArgumentProcessorRegistry processorRegistry) {
    boolean processed = false;
    for (ArgumentProcessor processor : processorRegistry.getProcessors()) {
        int newI = processor.readArguments(args, i);
        if (newI != -1) {
            List<String> extraArgs = extraArguments.get(processor.getClass());
            if (extraArgs == null) {
                extraArgs = new ArrayList<String>();
                extraArguments.put(processor.getClass(), extraArgs);
            }
            for (; i < newI && i < args.length; i++) {
                extraArgs.add(args[i]);
            }
            processed = true;
            break;
        }
    }
    if (!processed) {
        String msg = "Unknown argument: " + args[i];
        System.err.println(msg);
        printUsage();
        throw new BuildException("");
    }
}

private File findDefaultBuildFile() {
    Iterator<ProjectHelper> it = ProjectHelperRepository.getInstance().getHelpers();
    do {
        ProjectHelper helper = it.next();
        buildFile = new File(helper.getDefaultBuildFile());
        if (msgOutputLevel >= Project.MSG_VERBOSE) {
            System.out.println("Trying the default build file: " + buildFile);
        }
    } while (!buildFile.exists() && it.hasNext());
    return buildFile;
}