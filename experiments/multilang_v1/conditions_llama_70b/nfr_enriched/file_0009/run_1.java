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
        // but -find then search for it
        if (searchForFile) {
            if (searchForThis != null) {
                buildFile = findBuildFile(System.getProperty("user.dir"), searchForThis);
                if (buildFile == null) {
                    throw new BuildException("Could not locate a build file!");
                }
            } else {
                // no search file specified: so search an existing default file
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
            // no build file specified: so search an existing default file
            Iterator<ProjectHelper> it = ProjectHelperRepository.getInstance().getHelpers();
            do {
                ProjectHelper helper = it.next();
                buildFile = new File(helper.getDefaultBuildFile());
                if (msgOutputLevel >= Project.MSG_VERBOSE) {
                    System.out.println("Trying the default build file: " + buildFile);
                }
            } while (!buildFile.exists() && it.hasNext());
        }
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

    if (logTo != null) {
        out = logTo;
        err = logTo;
        System.setOut(out);
        System.setErr(err);
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
        try {
            File logFile = new File(args[pos + 1]);
            pos++;
            logTo = new PrintStream(new FileOutputStream(logFile));
            isLogFileUsed = true;
        } catch (IOException ioe) {
            String msg = "Cannot write on the specified log file. "
                    + "Make sure the path exists and you have write "
                    + "permissions.";
            throw new BuildException(msg);
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            String msg = "You must specify a log file when "
                    + "using the -log argument";
            throw new BuildException(msg);
        }
    } else if (arg.equals("-buildfile") || arg.equals("-file")
            || arg.equals("-f")) {
        return handleArgBuildFile(args, pos);
    } else if (arg.equals("-listener")) {
        return handleArgListener(args, pos);
    } else if (arg.startsWith("-D")) {
        return handleArgDefine(args, pos);
    } else if (arg.equals("-logger")) {
        return handleArgLogger(args, pos);
    } else if (arg.equals("-inputhandler")) {
        return handleArgInputHandler(args, pos);
    } else if (arg.equals("-emacs") || arg.equals("-e")) {
        emacsMode = true;
    } else if (arg.equals("-projecthelp") || arg.equals("-p")) {
        // set the flag to display the targets and quit
        projectHelp = true;
    } else if (arg.equals("-find") || arg.equals("-s")) {
        searchForFile = true;
        // eat up next arg if present, default to build.xml
        if (pos < args.length - 1) {
            searchForThis = args[++pos];
        }
    } else if (arg.startsWith("-propertyfile")) {
        return handleArgPropertyFile(args, pos);
    } else if (arg.equals("-k") || arg.equals("-keep-going")) {
        keepGoingMode = true;
    } else if (arg.equals("-nice")) {
        return handleArgNice(args, pos);
    } else if (LAUNCH_COMMANDS.contains(arg)) {
        //catch script/ant mismatch with a meaningful message
        //we could ignore it, but there are likely to be other
        //version problems, so we stamp down on the configuration now
        String msg = "Ant's Main method is being handed "
                + "an option " + arg + " that is only for the launcher class."
                + "\nThis can be caused by a version mismatch between "
                + "the ant script/.bat file and Ant itself.";
        throw new BuildException(msg);
    } else if (arg.equals("-autoproxy")) {
        proxy = true;
    } else if (arg.startsWith("-")) {
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
            // we don't have any more args to recognize!
            String msg = "Unknown argument: " + arg;
            System.err.println(msg);
            printUsage();
            throw new BuildException("");
        }
    } else {
        // if it's no other arg, it may be the target
        targets.addElement(arg);
    }
    return pos;
}