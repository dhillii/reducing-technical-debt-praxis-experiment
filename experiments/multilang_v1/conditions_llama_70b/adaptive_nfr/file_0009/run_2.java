private void processArgs(String[] args) {
    if (args == null) {
        throw new NullPointerException("Arguments cannot be null");
    }

    String searchForThis = null;
    boolean searchForFile = false;
    PrintStream logTo = null;

    ArgumentProcessorRegistry processorRegistry = ArgumentProcessorRegistry.getInstance();

    for (int i = 0; i < args.length; i++) {
        String arg = args[i];

        if (isHelpArgument(arg)) {
            printUsage();
            return;
        } else if (isVersionArgument(arg)) {
            printVersion(msgOutputLevel);
            return;
        } else if (isDiagnosticsArgument(arg)) {
            Diagnostics.doReport(System.out, msgOutputLevel);
            return;
        } else if (isQuietArgument(arg)) {
            msgOutputLevel = Project.MSG_WARN;
        } else if (isVerboseArgument(arg)) {
            msgOutputLevel = Project.MSG_VERBOSE;
        } else if (isDebugArgument(arg)) {
            msgOutputLevel = Project.MSG_DEBUG;
        } else if (isSilentArgument(arg)) {
            silent = true;
        } else if (isNoInputArgument(arg)) {
            allowInput = false;
        } else if (isLogFileArgument(arg)) {
            logTo = handleLogFileArgument(args, i);
            i++;
        } else if (isBuildFileArgument(arg)) {
            buildFile = handleBuildFileArgument(args, i);
            i++;
        } else if (isListenerArgument(arg)) {
            handleListenerArgument(args, i);
            i++;
        } else if (isDefineArgument(arg)) {
            handleDefineArgument(args, i);
            i++;
        } else if (isLoggerArgument(arg)) {
            handleLoggerArgument(args, i);
            i++;
        } else if (isInputHandlerArgument(arg)) {
            handleInputHandlerArgument(args, i);
            i++;
        } else if (isPropertyFileArgument(arg)) {
            handlePropertyFileArgument(args, i);
            i++;
        } else if (isKeepGoingArgument(arg)) {
            keepGoingMode = true;
        } else if (isFindArgument(arg)) {
            searchForFile = true;
            if (i < args.length - 1) {
                searchForThis = args[++i];
            }
        } else if (isNiceArgument(arg)) {
            handleNiceArgument(args, i);
            i++;
        } else if (isAutoproxyArgument(arg)) {
            proxy = true;
        } else if (isLaunchCommand(arg)) {
            throw new BuildException("Ant's Main method is being handed an option " + arg + " that is only for the launcher class.");
        } else if (isUnknownArgument(arg)) {
            System.err.println("Unknown argument: " + arg);
            printUsage();
            throw new BuildException("");
        } else {
            targets.addElement(arg);
        }
    }

    if (msgOutputLevel >= Project.MSG_VERBOSE) {
        printVersion(msgOutputLevel);
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

    buildFile = FileUtils.getFileUtils().normalize(buildFile.getAbsolutePath());

    loadPropertyFiles();

    if (msgOutputLevel >= Project.MSG_INFO) {
        System.out.println("Buildfile: " + buildFile);
    }

    if (logTo != null) {
        out = logTo;
        err = logTo;
        System.setOut(out);
        System.setErr(err);
    }

    readyToRun = true;
}

private boolean isHelpArgument(String arg) {
    return arg.equals("-help") || arg.equals("-h");
}

private boolean isVersionArgument(String arg) {
    return arg.equals("-version");
}

private boolean isDiagnosticsArgument(String arg) {
    return arg.equals("-diagnostics");
}

private boolean isQuietArgument(String arg) {
    return arg.equals("-quiet") || arg.equals("-q");
}

private boolean isVerboseArgument(String arg) {
    return arg.equals("-verbose") || arg.equals("-v");
}

private boolean isDebugArgument(String arg) {
    return arg.equals("-debug") || arg.equals("-d");
}

private boolean isSilentArgument(String arg) {
    return arg.equals("-silent") || arg.equals("-S");
}

private boolean isNoInputArgument(String arg) {
    return arg.equals("-noinput");
}

private boolean isLogFileArgument(String arg) {
    return arg.equals("-logfile") || arg.equals("-l");
}

private PrintStream handleLogFileArgument(String[] args, int pos) {
    try {
        File logFile = new File(args[pos + 1]);
        return new PrintStream(new FileOutputStream(logFile));
    } catch (IOException ioe) {
        throw new BuildException("Cannot write on the specified log file. Make sure the path exists and you have write permissions.");
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a log file when using the -log argument");
    }
}

private boolean isBuildFileArgument(String arg) {
    return arg.equals("-buildfile") || arg.equals("-file") || arg.equals("-f");
}

private File handleBuildFileArgument(String[] args, int pos) {
    try {
        return new File(args[pos + 1].replace('/', File.separatorChar));
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a buildfile when using the -buildfile argument");
    }
}

private boolean isListenerArgument(String arg) {
    return arg.equals("-listener");
}

private void handleListenerArgument(String[] args, int pos) {
    try {
        listeners.addElement(args[pos + 1]);
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a classname when using the -listener argument");
    }
}

private boolean isDefineArgument(String arg) {
    return arg.startsWith("-D");
}

private void handleDefineArgument(String[] args, int argPos) {
    String arg = args[argPos];
    String name = arg.substring(2, arg.length());
    String value = null;
    int posEq = name.indexOf("=");
    if (posEq > 0) {
        value = name.substring(posEq + 1);
        name = name.substring(0, posEq);
    } else if (argPos < args.length - 1) {
        value = args[++argPos];
    } else {
        throw new BuildException("Missing value for property " + name);
    }
    definedProps.put(name, value);
}

private boolean isLoggerArgument(String arg) {
    return arg.equals("-logger");
}

private void handleLoggerArgument(String[] args, int pos) {
    try {
        loggerClassname = args[++pos];
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a classname when using the -logger argument");
    }
}

private boolean isInputHandlerArgument(String arg) {
    return arg.equals("-inputhandler");
}

private void handleInputHandlerArgument(String[] args, int pos) {
    try {
        inputHandlerClassname = args[++pos];
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a classname when using the -inputhandler argument");
    }
}

private boolean isPropertyFileArgument(String arg) {
    return arg.startsWith("-propertyfile");
}

private void handlePropertyFileArgument(String[] args, int pos) {
    try {
        propertyFiles.addElement(args[++pos]);
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must specify a property filename when using the -propertyfile argument");
    }
}

private boolean isKeepGoingArgument(String arg) {
    return arg.equals("-k") || arg.equals("-keep-going");
}

private boolean isFindArgument(String arg) {
    return arg.equals("-find") || arg.equals("-s");
}

private boolean isNiceArgument(String arg) {
    return arg.equals("-nice");
}

private void handleNiceArgument(String[] args, int pos) {
    try {
        threadPriority = Integer.decode(args[++pos]);
    } catch (ArrayIndexOutOfBoundsException aioobe) {
        throw new BuildException("You must supply a niceness value (1-10) after the -nice option");
    } catch (NumberFormatException e) {
        throw new BuildException("Unrecognized niceness value: " + args[pos]);
    }

    if (threadPriority.intValue() < Thread.MIN_PRIORITY || threadPriority.intValue() > Thread.MAX_PRIORITY) {
        throw new BuildException("Niceness value is out of the range 1-10");
    }
}

private boolean isAutoproxyArgument(String arg) {
    return arg.equals("-autoproxy");
}

private boolean isLaunchCommand(String arg) {
    return LAUNCH_COMMANDS.contains(arg);
}

private boolean isUnknownArgument(String arg) {
    return arg.startsWith("-");
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