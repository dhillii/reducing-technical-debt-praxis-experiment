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
        } else {
            i = processArgument(args, i, processorRegistry);
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

    // if buildFile was not specified on the command line,
    if (buildFile == null) {
        buildFile = findBuildFile();
    }

    // make sure buildfile exists
    if (!buildFile.exists()) {
        System.out.println("Buildfile: " + buildFile + " does not exist!");
        throw new BuildException("Build failed");
    }

    if (buildFile.isDirectory()) {
        File whatYouMeant = new File(buildFile, "build.xml");
        if (whatYouMeant.isFile()) {
            buildFile = whatYouMeant;
        } else {
            System.out.println("What? Buildfile: " + buildFile + " is a dir!");
            throw new BuildException("Build failed");
        }
    }

    // Normalize buildFile for re-import detection
    buildFile = FileUtils.getFileUtils().normalize(buildFile.getAbsolutePath());

    // Load the property files specified by -propertyfile
    loadPropertyFiles();

    if (msgOutputLevel >= Project.MSG_INFO) {
        System.out.println("Buildfile: " + buildFile);
    }

    readyToRun = true;
}

private int processArgument(String[] args, int pos, ArgumentProcessorRegistry processorRegistry) {
    String arg = args[pos];
    if (arg.equals("-quiet") || arg.equals("-q")) {
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
        return handleLogfileArgument(args, pos);
    } else if (arg.equals("-buildfile") || arg.equals("-file") || arg.equals("-f")) {
        return handleBuildFileArgument(args, pos);
    } else if (arg.equals("-listener")) {
        return handleListenerArgument(args, pos);
    } else if (arg.startsWith("-D")) {
        return handleDefineArgument(args, pos);
    } else if (arg.equals("-logger")) {
        return handleLoggerArgument(args, pos);
    } else if (arg.equals("-inputhandler")) {
        return handleInputHandlerArgument(args, pos);
    } else if (arg.equals("-emacs") || arg.equals("-e")) {
        emacsMode = true;
    } else if (arg.equals("-projecthelp") || arg.equals("-p")) {
        projectHelp = true;
    } else if (arg.equals("-find") || arg.equals("-s")) {
        return handleFindArgument(args, pos);
    } else if (arg.startsWith("-propertyfile")) {
        return handlePropertyFileArgument(args, pos);
    } else if (arg.equals("-k") || arg.equals("-keep-going")) {
        keepGoingMode = true;
    } else if (arg.equals("-nice")) {
        return handleNiceArgument(args, pos);
    } else if (LAUNCH_COMMANDS.contains(arg)) {
        throw new BuildException("Ant's Main method is being handed an option " + arg + " that is only for the launcher class.");
    } else if (arg.equals("-autoproxy")) {
        proxy = true;
    } else if (arg.startsWith("-")) {
        return handleUnknownArgument(args, pos, processorRegistry);
    } else {
        targets.addElement(arg);
    }
    return pos;
}

private int handleLogfileArgument(String[] args, int pos) {
    try {
        File logFile = new File(args[++pos]);
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
    return pos;
}

private int handleBuildFileArgument(String[] args, int pos) {
    try {
        buildFile = new File(args[++pos].replace('/', File.separatorChar));
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a buildfile when using the -buildfile argument");
    }
    return pos;
}

private int handleListenerArgument(String[] args, int pos) {
    try {
        listeners.addElement(args[++pos]);
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a classname when using the -listener argument");
    }
    return pos;
}

private int handleDefineArgument(String[] args, int pos) {
    String arg = args[pos];
    String name = arg.substring(2, arg.length());
    String value = null;
    int posEq = name.indexOf("=");
    if (posEq > 0) {
        value = name.substring(posEq + 1);
        name = name.substring(0, posEq);
    } else if (pos < args.length - 1) {
        value = args[++pos];
    } else {
        throw new BuildException("Missing value for property " + name);
    }
    definedProps.put(name, value);
    return pos;
}

private int handleLoggerArgument(String[] args, int pos) {
    try {
        loggerClassname = args[++pos];
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a classname when using the -logger argument");
    }
    return pos;
}

private int handleInputHandlerArgument(String[] args, int pos) {
    try {
        inputHandlerClassname = args[++pos];
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a classname when using the -inputhandler argument");
    }
    return pos;
}

private int handleFindArgument(String[] args, int pos) {
    searchForFile = true;
    if (pos < args.length - 1) {
        searchForThis = args[++pos];
    }
    return pos;
}

private int handlePropertyFileArgument(String[] args, int pos) {
    try {
        propertyFiles.addElement(args[++pos]);
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a property filename when using the -propertyfile argument");
    }
    return pos;
}

private int handleNiceArgument(String[] args, int pos) {
    try {
        threadPriority = Integer.decode(args[++pos]);
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must supply a niceness value (1-10) after the -nice option");
    } catch (NumberFormatException e) {
        throw new BuildException("Unrecognized niceness value: " + args[pos]);
    }
    return pos;
}

private int handleUnknownArgument(String[] args, int pos, ArgumentProcessorRegistry processorRegistry) {
    boolean processed = false;
    for (ArgumentProcessor processor : processorRegistry.getProcessors()) {
        int newI = processor.readArguments(args, pos);
        if (newI != -1) {
            List<String> extraArgs = extraArguments.get(processor.getClass());
            if (extraArgs == null) {
                extraArgs = new ArrayList<String>();
                extraArguments.put(processor.getClass(), extraArgs);
            }
            for (; pos < newI && pos < args.length; pos++) {
                extraArgs.add(args[pos]);
            }
            processed = true;
            break;
        }
    }
    if (!processed) {
        throw new BuildException("Unknown argument: " + args[pos]);
    }
    return pos;
}

private File findBuildFile() {
    if (searchForFile) {
        if (searchForThis != null) {
            buildFile = findBuildFile(System.getProperty("user.dir"), searchForThis);
            if (buildFile == null) {
                throw new BuildException("Could not locate a build file!");
            }
        } else {
            Iterator<ProjectHelper> it = ProjectHelperRepository.getInstance().getHelpers();
            do {
                ProjectHelper helper = it.next();
                searchForThis = helper.getDefaultBuildFile();
                if (msgOutputLevel >= Project.MSG_VERBOSE) {
                    System.out.println("Searching the default build file: " + searchForThis);
                }
                buildFile = findBuildFile(System.getProperty("user.dir"), searchForThis);
            } while (buildFile == null && it.hasNext());
            if (buildFile == null) {
                throw new BuildException("Could not locate a build file!");
            }
        }
    } else {
        Iterator<ProjectHelper> it = ProjectHelperRepository.getInstance().getHelpers();
        do {
            ProjectHelper helper = it.next();
            buildFile = new File(helper.getDefaultBuildFile());
            if (msgOutputLevel >= Project.MSG_VERBOSE) {
                System.out.println("Trying the default build file: " + buildFile);
            }
        } while (!buildFile.exists() && it.hasNext());
    }
    return buildFile;
}