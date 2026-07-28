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
            handleLogFile(args, i);
            i++;
        } else if (arg.equals("-buildfile") || arg.equals("-file") || arg.equals("-f")) {
            i = handleArgBuildFile(args, i);
        } else if (arg.equals("-listener")) {
            i = handleArgListener(args, i);
        } else if (arg.startsWith("-D")) {
            i = handleArgDefine(args, i);
        } else if (arg.equals("-logger")) {
            i = handleArgLogger(args, i);
        } else if (arg.equals("-inputhandler")) {
            i = handleArgInputHandler(args, i);
        } else if (arg.equals("-emacs") || arg.equals("-e")) {
            emacsMode = true;
        } else if (arg.equals("-projecthelp") || arg.equals("-p")) {
            projectHelp = true;
        } else if (arg.equals("-find") || arg.equals("-s")) {
            handleFind(args, i);
            if (i < args.length - 1) {
                i++;
            }
        } else if (arg.startsWith("-propertyfile")) {
            i = handleArgPropertyFile(args, i);
        } else if (arg.equals("-k") || arg.equals("-keep-going")) {
            keepGoingMode = true;
        } else if (arg.equals("-nice")) {
            i = handleArgNice(args, i);
        } else if (LAUNCH_COMMANDS.contains(arg)) {
            throw new BuildException("Ant's Main method is being handed an option " + arg + " that is only for the launcher class.");
        } else if (arg.equals("-autoproxy")) {
            proxy = true;
        } else if (arg.startsWith("-")) {
            handleUnknownArg(args, i, processorRegistry);
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
        buildFile = findBuildFile();
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

private void handleLogFile(String[] args, int pos) {
    try {
        File logFile = new File(args[pos + 1]);
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

private void handleFind(String[] args, int pos) {
    boolean searchForFile = true;
    String searchForThis = null;
    if (pos < args.length - 1) {
        searchForThis = args[pos + 1];
    }
    buildFile = findBuildFile(System.getProperty("user.dir"), searchForThis);
    if (buildFile == null) {
        throw new BuildException("Could not locate a build file!");
    }
}

private void handleUnknownArg(String[] args, int i, ArgumentProcessorRegistry processorRegistry) {
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

private File findBuildFile() {
    File buildFile = null;
    Iterator<ProjectHelper> it = ProjectHelperRepository.getInstance().getHelpers();
    do {
        ProjectHelper helper = it.next();
        buildFile = new File(helper.getDefaultBuildFile());
        if (msgOutputLevel >= Project.MSG_VERBOSE) {
            System.out.println("Trying the default build file: " + buildFile);
        }
    } while (!buildFile.exists() && it.hasNext());
    if (buildFile == null) {
        throw new BuildException("Could not locate a build file!");
    }
    return buildFile;
}