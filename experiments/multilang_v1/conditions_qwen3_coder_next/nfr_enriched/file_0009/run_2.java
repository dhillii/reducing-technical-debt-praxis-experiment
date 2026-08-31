String[] args, int i) {
        try {
            File logFile = new File(args[i + 1]);
            i++;
            logTo = new PrintStream(new FileOutputStream(logFile));
            isLogFileUsed = true;
            return i;
        } catch (IOException ioe) {
            throw new BuildException("Cannot write on the specified log file. "
                    + "Make sure the path exists and you have write permissions.");
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a log file when "
                    + "using the -log argument");
        }
    }

    /**
     * Handles the -buildfile, -file, -f argument.
     * @param args the command line arguments
     * @param i the current index in args
     * @return updated index
     */
    private int handleBuildFileArgument(String[] args, int i) {
        try {
            buildFile = new File(args[++i].replace('/', File.separatorChar));
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException(
                    "You must specify a buildfile when using the -buildfile argument");
        }
        return i;
    }

    /**
     * Handles the -listener argument.
     * @param args the command line arguments
     * @param i the current index in args
     * @return updated index
     */
    private int handleListenerArgument(String[] args, int i) {
        try {
            listeners.addElement(args[i + 1]);
            i++;
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a classname when "
                    + "using the -listener argument");
        }
        return i;
    }

    /**
     * Handles the -propertyfile argument.
     * @param args the command line arguments
     * @param i the current index in args
     * @return updated index
     */
    private int handlePropertyFileArgument(String[] args, int i) {
        try {
            propertyFiles.addElement(args[++i]);
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a property filename when "
                    + "using the -propertyfile argument");
        }
        return i;
    }

    /**
     * Handles the -nice argument.
     * @param args the command line arguments
     * @param i the current index in args
     * @return updated index
     */
    private int handleNiceArgument(String[] args, int i) {
        try {
            String value = args[++i];
            threadPriority = Integer.decode(value);
            if (threadPriority < Thread.MIN_PRIORITY || threadPriority > Thread.MAX_PRIORITY) {
                throw new BuildException("Niceness value is out of the range 1-10");
            }
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must supply a niceness value (1-10) after the -nice option");
        } catch (NumberFormatException e) {
            throw new BuildException("Unrecognized niceness value: " + args[i]);
        }
        return i;
    }

    /**
     * Handles the -D argument for defining properties.
     * @param args the command line arguments
     * @param i the current index in args
     * @return updated index
     */
    private int handleDefinePropertyArgument(String[] args, int i) {
        String arg = args[i];
        String name = arg.substring(2);
        String value = null;
        int posEq = name.indexOf('=');
        if (posEq > 0) {
            value = name.substring(posEq + 1);
            name = name.substring(0, posEq);
        } else if (i < args.length - 1) {
            value = args[++i];
        } else {
            throw new BuildException("Missing value for property " + name);
        }
        definedProps.put(name, value);
        return i;
    }

    /**
     * Handles the -logger argument.
     * @param args the command line arguments
     * @param i the current index in args
     * @return updated index
     */
    private int handleLoggerArgument(String[] args, int i) {
        if (loggerClassname != null) {
            throw new BuildException("Only one logger class may be specified.");
        }
        try {
            loggerClassname = args[++i];
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a classname when using the -logger argument");
        }
        return i;
    }

    /**
     * Handles the -inputhandler argument.
     * @param args the command line arguments
     * @param i the current index in args
     * @return updated index
     */
    private int handleInputHandlerArgument(String[] args, int i) {
        if (inputHandlerClassname != null) {
            throw new BuildException("Only one input handler class may be specified.");
        }
        try {
            inputHandlerClassname = args[++i];
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a classname when "
                    + "using the -inputhandler argument");
        }
        return i;
    }

    /**
     * Handles the -find/-s argument.
     * @param args the command line arguments
     * @param i the current index in args
     * @param searchForThis array with one element to store the next search path
     * @return updated index
     */
    private int handleFindArgument(String[] args, int i, String[] searchForThis) {
        searchForFile = true;
        if (i < args.length - 1) {
            searchForThis[0] = args[++i];
        }
        return i;
    }

    /**
     * Determines if the given argument is handled by the launcher.
     * @param arg the argument to check
     * @throws BuildException if a launcher-only option is encountered
     */
    private void validateLauncherArgument(String arg) {
        if (LAUNCH_COMMANDS.contains(arg)) {
            String msg = "Ant's Main method is being handed an option " + arg
                    + " that is only for the launcher class."
                    + "\nThis can be caused by a version mismatch between "
                    + "the ant script/.bat file and Ant itself.";
            throw new BuildException(msg);
        }
    }

    /**
     * Processes unknown command-line arguments using registered argument processors.
     * @param args the command line arguments
     * @param i the current index in args
     * @return updated index, or -1 if argument was unhandled
     */
    private int processUnknownArgument(String[] args, int i) {
        ArgumentProcessorRegistry registry = ArgumentProcessorRegistry.getInstance();
        for (ArgumentProcessor processor : registry.getProcessors()) {
            int newI = processor.readArguments(args, i);
            if (newI != -1) {
                List<String> extraArgs = extraArguments.computeIfAbsent(processor.getClass(),
                        k -> new ArrayList<>());
                for (int j = i; j <= newI && j < args.length; j++) {
                    extraArgs.add(args[j]);
                }
                return newI;
            }
        }
        return -1;
    }

    /**
     * Extracts and validates the build file location after searching.
     * @throws BuildException if build file not found or invalid
     */
    private void finalizeBuildFile() {
        if (buildFile == null) {
            searchBuildFile();
        }

        if (!buildFile.exists()) {
            throw new BuildException("Buildfile: " + buildFile + " does not exist!");
        }

        if (buildFile.isDirectory()) {
            File candidate = new File(buildFile, "build.xml");
            buildFile = candidate.isFile() ? candidate
                    : buildFile;
            if (!buildFile.exists()) {
                throw new BuildException("Build failed");
            }
        }

        buildFile = FileUtils.getFileUtils().normalize(buildFile.getAbsolutePath());
    }

    /**
     * Searches for build file using default strategies if none was provided.
     */
    private void searchBuildFile() {
        if (searchForFile) {
            searchBuildFileUsingSearchPath();
        } else {
            searchDefaultBuildFile();
        }
    }

    /**
     * Searches for the build file using the -find logic and user-provided or default suffix.
     */
    private void searchBuildFileUsingSearchPath() {
        String suffix = (searchForThis != null) ? searchForThis
                : findDefaultBuildFileSuffix();

        buildFile = findBuildFile(System.getProperty("user.dir"), suffix);
        if (buildFile == null) {
            throw new BuildException("Could not locate a build file!");
        }
    }

    /**
     * Returns the default build file suffix based on registered ProjectHelpers.
     * @return suffix string
     */
    private String findDefaultBuildFileSuffix() {
        Iterator<ProjectHelper> it = ProjectHelperRepository.getInstance().getHelpers();
        while (it.hasNext()) {
            ProjectHelper helper = it.next();
            String candidate = helper.getDefaultBuildFile();
            if (msgOutputLevel >= Project.MSG_VERBOSE) {
                System.out.println("Searching the default build file: " + candidate);
            }
            buildFile = findBuildFile(System.getProperty("user.dir"), candidate);
            if (buildFile != null) {
                return candidate;
            }
        }
        return null;
    }

    /**
     * Tries to find a build file in user.dir using registered helper defaults.
     */
    private void searchDefaultBuildFile() {
        Iterator<ProjectHelper> it = ProjectHelperRepository.getInstance().getHelpers();
        while (it.hasNext()) {
            ProjectHelper helper = it.next();
            File candidate = new File(helper.getDefaultBuildFile());
            if (msgOutputLevel >= Project.MSG_VERBOSE) {
                System.out.println("Trying the default build file: " + candidate);
            }
            if (candidate.exists()) {
                buildFile = candidate;
                return;
            }
        }
    }

    /**
     * Finds build file by traversing parent directories from start directory.
     * @param start the starting directory
     * @param suffix the filename suffix to find
     * @return File or null
     */
    private File findBuildFile(String start, String suffix) {
        if (msgOutputLevel >= Project.MSG_INFO) {
            System.out.println("Searching for " + suffix + " ...");
        }

        File dir = new File(start).getAbsoluteFile();
        File file = new File(dir, suffix);

        while (!file.exists()) {
            dir = dir.getParentFile();
            if (dir == null) {
                return null;
            }
            file = new File(dir, suffix);
        }

        return file;
    }

    /**
     * loads property files specified via -propertyfile.
     */
    private void loadAndMergePropertyFiles() {
        for (String filename : propertyFiles) {
            Properties props = new Properties();
            try (FileInputStream fis = new FileInputStream(filename)) {
                props.load(fis);
                mergeProperties(props);
            } catch (IOException e) {
                System.out.println("Could not load property file " + filename + ": " + e.getMessage());
            }
        }
    }

    /**
     * Merges external properties into definedProps, preserving -D precedence.
     * @param externalProps properties loaded from external file
     */
    private void mergeProperties(Properties externalProps) {
        for (Map.Entry<Object, Object> entry : externalProps.entrySet()) {
            String key = (String) entry.getKey();
            if (!definedProps.containsKey(key)) {
                definedProps.put(key, entry.getValue());
            }
        }
    }

    /**
     * Configures logging streams based on -logfile or silent flags.
     */
    private void configureLogging() {
        if (logTo != null) {
            out = logTo;
            err = logTo;
            System.setOut(out);
            System.setErr(err);
        } else if (silent) {
            msgOutputLevel = Project.MSG_WARN;
            emacsMode = true;
        }
        readyToRun = true;
    }

    /**
     * Builds and executes the target project.
     * @param coreLoader classloader to use for core classes
     * @throws BuildException if build fails
     */
    private void executeBuild(ClassLoader coreLoader) throws BuildException {
        if (!readyToRun) {
            return;
        }

        configureProject_processors(coreLoader);

        Project project = new Project();
        project.setCoreLoader(coreLoader);

        handleErrorWhileBuilding(project);
    }

    /**
     * Sets up and handles exceptions during project construction and build.
     * @param project the Ant Project instance
     */
    private void handleErrorWhileBuilding(Project project) {
        Throwable error = null;

        try {
            addBuildListeners(project);
            addInputHandler(project);

            captureIOState();

            try {
                setupProjectEnvironment(project);
                configureProject_main(project);
                executeBuildLogic(project);
            } finally {
                restoreIOState();
            }
        } catch (RuntimeException | Error e) {
            error = e;
            throw e;
        } finally {
            logBuildCompletion(project, error);
        }
    }

    /**
     * Captures current standard I/O streams before redirection.
     */
    private void captureIOState() {
        savedOut = System.out;
        savedErr = System.err;
        savedIn = System.in;
    }

    /**
     * Restores original standard I/O streams after build.
     */
    private void restoreIOState() {
        System.setOut(savedOut);
        System.setErr(savedErr);
        System.setIn(savedIn);
    }

    /**
     * Sets up project environment: input, output, logging, proxy, thread priority.
     * @param project the Ant Project instance
     */
    private void setupProjectEnvironment(Project project) {
        if (allowInput) {
            project.setDefaultInputStream(System.in);
        }

        System.setIn(new DemuxInputStream(project));
        System.setOut(new PrintStream(new DemuxOutputStream(project, false)));
        System.setErr(new PrintStream(new DemuxOutputStream(project, true)));

        if (!projectHelp) {
            project.fireBuildStarted();
        }

        if (threadPriority != null) {
            try {
                project.log("Setting Ant's thread priority to " + threadPriority, Project.MSG_VERBOSE);
                Thread.currentThread().setPriority(threadPriority.intValue());
            } catch (SecurityException ignored) {
                project.log("A security manager refused to set the -nice value");
            }
        }

        setProperties(project);
        project.setKeepGoingMode(keepGoingMode);

        if (proxy) {
            ProxySetup proxySetup = new ProxySetup(project);
            proxySetup.enableProxies();
        }
    }

    /**
     * Runs argument processor prepareConfigure and configures project with build file.
     * @param project the Ant Project instance
     */
    private void configureProject_main(Project project) {
        ArgumentProcessorRegistry registry = ArgumentProcessorRegistry.getInstance();
        for (ArgumentProcessor processor : registry.getProcessors()) {
            List<String> extraArgs = extraArguments.get(processor.getClass());
            if (extraArgs != null) {
                processor.prepareConfigure(project, extraArgs);
            }
        }

        ProjectHelper.configureProject(project, buildFile);

        for (ArgumentProcessor processor : registry.getProcessors()) {
            List<String> extraArgs = extraArguments.get(processor.getClass());
            if (extraArgs != null && processor.handleArg(project, extraArgs)) {
                return;
            }
        }
    }

    /**
     * Executes targets based on projectHelp flag or provided targets.
     * @param project the Ant Project instance
     */
    private void executeBuildLogic(Project project) {
        if (projectHelp) {
            printDescription(project);
            printTargets(project, msgOutputLevel > Project.MSG_INFO,
                    msgOutputLevel > Project.MSG_VERBOSE);
            return;
        }

        if (targets.isEmpty() && project.getDefaultTarget() != null) {
            targets.addElement(project.getDefaultTarget());
        }

        project.executeTargets(targets);
    }

    /**
     * Logs build completion and handles any final exception logging.
     * @param project the Ant Project instance
     * @param error the error thrown during build
     */
    private void logBuildCompletion(Project project, Throwable error) {
        if (!projectHelp) {
            try {
                project.fireBuildFinished(error);
            } catch (Throwable t) {
                System.err.println("Caught an exception while logging the end of the build. Exception was:");
                t.printStackTrace();
                if (error != null) {
                    System.err.println("There has been an error prior to that:");
                    error.printStackTrace();
                }
                throw new BuildException(t);
            }
        } else if (error != null) {
            project.log(error.toString(), Project.MSG_ERR);
        }
    }

    /**
     * Handles processor setup for early exits (e.g. argument-only processors).
     * @param coreLoader the classloader
     */
    private void configureProject_processors(ClassLoader coreLoader) {
        ArgumentProcessorRegistry registry = ArgumentProcessorRegistry.getInstance();
        for (ArgumentProcessor processor : registry.getProcessors()) {
            List<String> extraArgs = extraArguments.get(processor.getClass());
            if (extraArgs != null && processor.handleArg(extraArgs)) {
                return;
            }
        }
    }

    /**
     * Sets resolved user properties on the Project instance.
     * @param project the Ant Project instance
     */
    private void setProperties(final Project project) {
        project.init();
        PropertyHelper propertyHelper = PropertyHelper.getPropertyHelper(project);

        ResolvePropertyMap resolver = new ResolvePropertyMap(project,
                NOPROPERTIES, propertyHelper.getExpanders());
        Map<String, Object> props = definedProps.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> (Object) e.getValue()));

        resolver.resolveAllProperties(props, null, false);

        props.forEach((key, value) -> project.setUserProperty(key, String.valueOf(value)));

        project.setUserProperty(MagicNames.ANT_FILE, buildFile.getAbsolutePath());
        project.setUserProperty(MagicNames.ANT_FILE_TYPE, MagicNames.ANT_FILE_TYPE_FILE);
    }

    /**
     * Adds listeners specified on the command line and the default logger.
     * @param project the Ant Project instance
     */
    protected void addBuildListeners(Project project) {
        project.addBuildListener(createLogger());

        for (int i = 0; i < listeners.size(); i++) {
            String className = listeners.get(i);
            BuildListener listener = ClasspathUtils.newInstance(className,
                    Main.class.getClassLoader(), BuildListener.class);
            project.setProjectReference(listener);
            project.addBuildListener(listener);
        }
    }

    /**
     * Adds the configured InputHandler to the Project.
     * @param project the Ant Project instance
     * @throws BuildException if InputHandler cannot be instantiated
     */
    private void addInputHandler(Project project) throws BuildException {
        InputHandler handler = (inputHandlerClassname == null)
                ? new DefaultInputHandler()
                : ClasspathUtils.newInstance(inputHandlerClassname,
                        Main.class.getClassLoader(), InputHandler.class);
        project.setInputHandler(handler);
        project.setProjectReference(handler);
    }

    /**
     * Creates the appropriate BuildLogger based on configuration.
     * @return BuildLogger instance
     */
    private BuildLogger createLogger() {
        if (silent) {
            return new SilentLogger();
        }

        if (loggerClassname != null) {
            try {
                return ClasspathUtils.newInstance(loggerClassname,
                        Main.class.getClassLoader(), BuildLogger.class);
            } catch (BuildException e) {
                System.err.println("The specified logger class " + loggerClassname
                        + " could not be used because " + e.getMessage());
                throw new RuntimeException("Logger instantiation failed");
            }
        }

        return new DefaultLogger();
    }

    /**
     * Helper to find the insertion index for target names in sorted Vector.
     * @param names list of target names
     * @param name new name to insert
     * @return index at which to insert
     */
    private static int findTargetPosition(Vector<String> names, String name) {
        int size = names.size();
        for (int i = 0; i < size; i++) {
            if (name.compareTo(names.get(i)) < 0) {
                return i;
            }
        }
        return size;
    }

    /**
     * Removes duplicate targets from the map, keeping shortest name.
     * @param targets map of target name to Target
     * @return filtered map
     */
    private static Map<String, Target> removeDuplicateTargets(Map<String, Target> targets) {
        Map<Location, Target> locationMap = new HashMap<>();
        for (Entry<String, Target> entry : targets.entrySet()) {
            Target t = entry.getValue();
            Target existing = locationMap.get(t.getLocation());
            if (existing == null || existing.getName().length() > t.getName().length()) {
                locationMap.put(t.getLocation(), t);
            }
        }
        Map<String, Target> result = new HashMap<>();
        locationMap.forEach((loc, t) -> result.put(t.getName(), t));
        return result;
    }

    /**
     * Prints target list with optional descriptions and dependencies.
     */
    private static void printTargets(Project project, Vector<String> names,
                                     Vector<String> descriptions, Vector<Enumeration<String>> dependencies,
                                     String heading, int maxlen) {
        String separator = System.lineSeparator();
        String padding = " ".repeat(Math.max(0, maxlen + 4));
        StringBuilder output = new StringBuilder();
        output.append(heading).append(separator).append(separator);

        for (int i = 0; i < names.size(); i++) {
            String target = names.get(i);
            output.append(" ").append(target);
            if (descriptions != null) {
                String desc = descriptions.get(i);
                int padLen = maxlen - target.length() + 2;
                output.append(padding.substring(0, Math.max(0, padLen))).append(desc);
            }
            output.append(separator);
            if (dependencies != null && !dependencies.isEmpty()) {
                Enumeration<String> deps = dependencies.get(i);
                if (deps.hasMoreElements()) {
                    output.append("   depends on: ");
                    while (deps.hasMoreElements()) {
                        output.append(deps.nextElement());
                        if (deps.hasMoreElements()) {
                            output.append(", ");
                        }
                    }
                    output.append(separator);
                }
            }
        }

        project.log(output.toString(), Project.MSG_WARN);
    }

    /**
     * Prints descriptions and filtered list of project targets.
     */
    private static void printTargets(Project project, boolean printSub,
                                     boolean printDeps) {
        Map<String, Target> targets = removeDuplicateTargets(project.getTargets());
        Vector<String> topNames = new Vector<>();
        Vector<String> topDesc = new Vector<>();
        Vector<Enumeration<String>> topDeps = new Vector<>();
        Vector<String> subNames = new Vector<>();
        Vector<Enumeration<String>> subDeps = new Vector<>();

        int maxLength = 0;

        for (Target t : targets.values()) {
            String name = t.getName();
            if (name.isEmpty()) continue;

            String desc = t.getDescription();
            if (desc == null) {
                int pos = findTargetPosition(subNames, name);
                subNames.insertElementAt(name, pos);
                if (printDeps) {
                    subDeps.insertElementAt(t.getDependencies(), pos);
                }
            } else {
                int pos = findTargetPosition(topNames, name);
                topNames.insertElementAt(name, pos);
                topDesc.insertElementAt(desc, pos);
                maxLength = Math.max(maxLength, name.length());
                if (printDeps) {
                    topDeps.insertElementAt(t.getDependencies(), pos);
                }
            }
        }

        printTargets(project, topNames, topDesc, topDeps, "Main targets:", maxLength);

        if (topNames.isEmpty()) {
            printSub = true;
        }
        if (printSub) {
            printTargets(project, subNames, null, subDeps, "Other targets:", 0);
        }

        String defaultTarget = project.getDefaultTarget();
        if (defaultTarget != null && !"".equals(defaultTarget)) {
            project.log("Default target: " + defaultTarget);
        }
    }

    /**
     * Prints project description if present.
     */
    private static void printDescription(Project project) {
        String desc = project.getDescription();
        if (desc != null) {
            project.log(desc);
        }
    }

    /**
     * Prints usage information to stdout.
     */
    private static void printUsage() {
        String[] lines = {
            "ant [options] [target [target2 [target3] ...]]",
            "Options:",
            "  -help, -h              print this message",
            "  -projecthelp, -p       print project help information",
            "  -version               print the version information and exit",
            "  -diagnostics           print information that might be helpful to diagnose or report problems.",
            "  -quiet, -q             be extra quiet",
            "  -silent, -S            print nothing but task outputs and build failures",
            "  -verbose, -v           be extra verbose",
            "  -debug, -d             print debugging information",
            "  -emacs, -e             produce logging information without adornments",
            "  -lib <path>            specifies a path to search for jars and classes",
            "  -logfile <file>        use given file for log",
            "    -l     <file>                ''",
            "  -logger <classname>    the class which is to perform logging",
            "  -listener <classname>  add an instance of class as a project listener",
            "  -noinput               do not allow interactive input",
            "  -buildfile <file>      use given buildfile",
            "    -file    <file>              ''",
            "    -f       <file>              ''",
            "  -D<property>=<value>   use value for given property",
            "  -keep-going, -k        execute all targets that do not depend on failed target(s)",
            "  -propertyfile <name>   load all properties from file with -D properties taking precedence",
            "  -inputhandler <class>  the class which will handle input requests",
            "  -find <file>           (s)earch for buildfile towards the root of the filesystem and use it",
            "    -s  <file>           ''",
            "  -nice  number          A niceness value for the main thread: 1 (lowest) to 10 (highest); 5 is the default",
            "  -nouserlib             Run ant without using the jar files from ${user.home}/.ant/lib",
            "  -noclasspath           Run ant without using CLASSPATH",
            "  -autoproxy             Java1.5+: use the OS proxy settings",
            "  -main <class>          override Ant's normal entry point"
        };
        for (String line : lines) {
            System.out.println(line);
        }
        ArgumentProcessorRegistry registry = ArgumentProcessorRegistry.getInstance();
        for (ArgumentProcessor processor : registry.getProcessors()) {
            processor.printUsage(System.out);
        }
    }

    /**
     * Prints the Ant version.
     * @param logLevel logging level
     * @throws BuildException if version cannot be loaded
     */
    private static void printVersion(int logLevel) throws BuildException {
        System.out.println(getAntVersion());
    }

    /**
     * Returns the Ant version string, caching it after first load.
     * @return version string
     * @throws BuildException if found version info is invalid
     */
    public static synchronized String getAntVersion() throws BuildException {
        if (antVersion == null) {
            try (InputStream in = Main.class.getResourceAsStream("/org/apache/tools/ant/version.txt")) {
                Properties p = new Properties();
                p.load(in);
                antVersion = "Apache Ant(TM) version " + p.getProperty("VERSION")
                        + " compiled on " + p.getProperty("DATE");
            } catch (IOException | NullPointerException e) {
                throw new BuildException("Could not load the version information: "
                        + e.getMessage(), e);
            }
        }
        return antVersion;
    }

}