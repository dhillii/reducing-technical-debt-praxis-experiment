/*
 *  Licensed to the Apache Software Foundation (ASF) under one or more
 *  contributor license agreements.  See the NOTICE file distributed with
 *  this work for additional information regarding copyright ownership.
 *  The ASF licenses this file to You under the Apache License, Version 2.0
 *  (the "License"); you may not use this file except in compliance with
 *  the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

package org.apache.tools.ant;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.Vector;

import org.apache.tools.ant.input.DefaultInputHandler;
import org.apache.tools.ant.input.InputHandler;
import org.apache.tools.ant.launch.AntMain;
import org.apache.tools.ant.listener.SilentLogger;
import org.apache.tools.ant.property.GetProperty;
import org.apache.tools.ant.property.ResolvePropertyMap;
import org.apache.tools.ant.util.ClasspathUtils;
import org.apache.tools.ant.util.FileUtils;
import org.apache.tools.ant.util.ProxySetup;

/**
 * Command line entry point into Ant. This class is entered via the
 * canonical `public static void main` entry point and reads the
 * command line arguments. It then assembles and executes an Ant
 * project.
 * <p>
 * If you integrating Ant into some other tool, this is not the class
 * to use as an entry point. Please see the source code of this
 * class to see how it manipulates the Ant project classes.
 *
 */
public class Main implements AntMain {

    /**
     * A Set of args that are handled by the launcher and should
     * not be seen by Main.
     */
    private static final Set<String> LAUNCH_COMMANDS = Collections
            .unmodifiableSet(new HashSet<String>(Arrays.asList("-lib", "-cp", "-noclasspath",
                    "--noclasspath", "-nouserlib", "-main")));

    /** The default build file name. {@value} */
    public static final String DEFAULT_BUILD_FILENAME = "build.xml";

    /** Our current message output status. Follows Project.MSG_XXX. */
    private int msgOutputLevel = Project.MSG_INFO;

    /** File that we are using for configuration. */
    private File buildFile; /* null */

    /** Stream to use for logging. */
    private static PrintStream out = System.out;

    /** Stream that we are using for logging error messages. */
    private static PrintStream err = System.err;

    /** The build targets. */
    private Vector<String> targets = new Vector<String>();

    /** Set of properties that can be used by tasks. */
    private Properties definedProps = new Properties();

    /** Names of classes to add as listeners to project. */
    private Vector<String> listeners = new Vector<String>(1);

    /** File names of property files to load on startup. */
    private Vector<String> propertyFiles = new Vector<String>(1);

    /** Indicates whether this build is to support interactive input */
    private boolean allowInput = true;

    /** keep going mode */
    private boolean keepGoingMode = false;

    /**
     * The Ant logger class. There may be only one logger. It will have
     * the right to use the 'out' PrintStream. The class must implements the
     * BuildLogger interface.
     */
    private String loggerClassname = null;

    /**
     * The Ant InputHandler class.  There may be only one input
     * handler.
     */
    private String inputHandlerClassname = null;

    /**
     * Whether or not output to the log is to be unadorned.
     */
    private boolean emacsMode = false;

    /**
     * Whether or not log output should be reduced to the minimum
     */
    private boolean silent = false;

    /**
     * Whether or not this instance has successfully been
     * constructed and is ready to run.
     */
    private boolean readyToRun = false;

    /**
     * Whether or not we should only parse and display the project help
     * information.
     */
    private boolean projectHelp = false;

    /**
     * Whether or not a logfile is being used. This is used to
     * check if the output streams must be closed.
     */
    private static boolean isLogFileUsed = false;

    /**
     * optional thread priority
     */
    private Integer threadPriority = null;

    /**
     * proxy flag: default is false
     */
    private boolean proxy = false;

    private Map<Class<?>, List<String>> extraArguments = new HashMap<Class<?>, List<String>>();

    private static final GetProperty NOPROPERTIES = new GetProperty(){
        public Object getProperty(String aName) {
            // No existing property takes precedence
            return null;
        }};

    private static void printMessage(Throwable t) {
        String message = t.getMessage();
        if (message != null) {
            System.err.println(message);
        }
    }

    public static void start(String[] args, Properties additionalUserProperties,
                             ClassLoader coreLoader) {
        Main m = new Main();
        m.startAnt(args, additionalUserProperties, coreLoader);
    }

    public void startAnt(String[] args, Properties additionalUserProperties,
                         ClassLoader coreLoader) {

        try {
            processArgs(args);
        } catch (Throwable exc) {
            handleLogfile();
            printMessage(exc);
            exit(1);
            return;
        }

        if (additionalUserProperties != null) {
            for (java.util.Enumeration<?> e = additionalUserProperties.keys();
                    e.hasMoreElements();) {
                String key = (String) e.nextElement();
                definedProps.put(key, additionalUserProperties.getProperty(key));
            }
        }

        int exitCode = 1;
        try {
            try {
                runBuild(coreLoader);
                exitCode = 0;
            } catch (ExitStatusException ese) {
                exitCode = ese.getStatus();
                if (exitCode != 0) {
                    throw ese;
                }
            }
        } catch (BuildException be) {
            if (err != System.err) {
                printMessage(be);
            }
        } catch (Throwable exc) {
            exc.printStackTrace();
            printMessage(exc);
        } finally {
            handleLogfile();
        }
        exit(exitCode);
    }

    protected void exit(int exitCode) {
        System.exit(exitCode);
    }

    private static void handleLogfile() {
        if (isLogFileUsed) {
            FileUtils.close(out);
            FileUtils.close(err);
        }
    }

    public static void main(String[] args) {
        start(args, null, null);
    }

    public Main() {
    }

    protected Main(String[] args) throws BuildException {
        processArgs(args);
    }

    /**
     * Process command line arguments.
     *
     * @param args the command line arguments.
     *
     * @since Ant 1.6
     */
    private void processArgs(String[] args) {
        PrintStream logTo = null;
        boolean justPrintUsage = false;
        boolean justPrintVersion = false;
        boolean justPrintDiagnostics = false;

        ArgumentProcessorRegistry processorRegistry = ArgumentProcessorRegistry.getInstance();

        for (int i = 0; i < args.length; i++) {
            String arg = args[i];

            if (handleSimpleFlags(arg)) {
                switch (arg) {
                    case "-help":
                    case "-h":
                        justPrintUsage = true;
                        break;
                    case "-version":
                        justPrintVersion = true;
                        break;
                    case "-diagnostics":
                        justPrintDiagnostics = true;
                        break;
                }
                continue;
            }

            if (arg.equals("-logfile") || arg.equals("-l")) {
                i = handleLogFile(args, i);
                logTo = out; // set later after loop
                continue;
            }

            if (arg.equals("-buildfile") || arg.equals("-file") || arg.equals("-f")) {
                i = handleArgBuildFile(args, i);
                continue;
            }

            if (arg.equals("-listener")) {
                i = handleArgListener(args, i);
                continue;
            }

            if (arg.startsWith("-D")) {
                i = handleArgDefine(args, i);
                continue;
            }

            if (arg.equals("-logger")) {
                i = handleArgLogger(args, i);
                continue;
            }

            if (arg.equals("-inputhandler")) {
                i = handleArgInputHandler(args, i);
                continue;
            }

            if (arg.equals("-find") || arg.equals("-s")) {
                i = handleFind(args, i);
                continue;
            }

            if (arg.startsWith("-propertyfile")) {
                i = handleArgPropertyFile(args, i);
                continue;
            }

            if (arg.equals("-k") || arg.equals("-keep-going")) {
                keepGoingMode = true;
                continue;
            }

            if (arg.equals("-nice")) {
                i = handleArgNice(args, i);
                continue;
            }

            if (LAUNCH_COMMANDS.contains(arg)) {
                throw new BuildException("Ant's Main method is being handed "
                        + "an option " + arg + " that is only for the launcher class."
                        + "\nThis can be caused by a version mismatch between "
                        + "the ant script/.bat file and Ant itself.");
            }

            if (arg.equals("-autoproxy")) {
                proxy = true;
                continue;
            }

            if (arg.startsWith("-")) {
                i = handleCustomProcessor(args, i, processorRegistry);
                continue;
            }

            // treat as target
            targets.addElement(arg);
        }

        if (msgOutputLevel >= Project.MSG_VERBOSE || justPrintVersion) {
            printVersion(msgOutputLevel);
        }

        if (justPrintUsage || justPrintVersion || justPrintDiagnostics) {
            if (justPrintUsage) {
                printUsage();
            }
            if (justPrintDiagnostics) {
                Diagnostics.doReport(System.out, msgOutputLevel);
            }
            return;
        }

        resolveBuildFile();

        if (!buildFile.exists()) {
            System.out.println("Buildfile: " + buildFile + " does not exist!");
            throw new BuildException("Build failed");
        }

        if (buildFile.isDirectory()) {
            File candidate = new File(buildFile, "build.xml");
            if (candidate.isFile()) {
                buildFile = candidate;
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

    private boolean handleSimpleFlags(String arg) {
        return arg.equals("-help") || arg.equals("-h") ||
               arg.equals("-version") || arg.equals("-diagnostics") ||
               arg.equals("-quiet") || arg.equals("-q") ||
               arg.equals("-verbose") || arg.equals("-v") ||
               arg.equals("-debug") || arg.equals("-d") ||
               arg.equals("-silent") || arg.equals("-S") ||
               arg.equals("-noinput") || arg.equals("-emacs") ||
               arg.equals("-e") || arg.equals("-projecthelp") ||
               arg.equals("-p");
    }

    private int handleLogFile(String[] args, int index) {
        try {
            File logFile = new File(args[index + 1]);
            out = new PrintStream(new FileOutputStream(logFile));
            err = out;
            isLogFileUsed = true;
            return index + 1;
        } catch (IOException ioe) {
            throw new BuildException("Cannot write on the specified log file. "
                    + "Make sure the path exists and you have write permissions.");
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a log file when using the -log argument");
        }
    }

    private int handleFind(String[] args, int index) {
        // -find consumes optional filename
        if (index < args.length - 1) {
            index++;
            // store filename for later search
            searchForFile = true;
            searchForThis = args[index];
        } else {
            searchForFile = true;
            searchForThis = null;
        }
        return index;
    }

    private void resolveBuildFile() {
        if (buildFile != null) {
            return;
        }
        if (searchForFile) {
            if (searchForThis != null) {
                buildFile = findBuildFile(System.getProperty("user.dir"), searchForThis);
                if (buildFile == null) {
                    throw new BuildException("Could not locate a build file!");
                }
            } else {
                Iterator<ProjectHelper> it = ProjectHelperRepository.getInstance().getHelpers();
                while (it.hasNext()) {
                    ProjectHelper helper = it.next();
                    String defaultName = helper.getDefaultBuildFile();
                    if (msgOutputLevel >= Project.MSG_VERBOSE) {
                        System.out.println("Searching the default build file: " + defaultName);
                    }
                    buildFile = findBuildFile(System.getProperty("user.dir"), defaultName);
                    if (buildFile != null) {
                        break;
                    }
                }
                if (buildFile == null) {
                    throw new BuildException("Could not locate a build file!");
                }
            }
        } else {
            Iterator<ProjectHelper> it = ProjectHelperRepository.getInstance().getHelpers();
            while (it.hasNext()) {
                ProjectHelper helper = it.next();
                buildFile = new File(helper.getDefaultBuildFile());
                if (msgOutputLevel >= Project.MSG_VERBOSE) {
                    System.out.println("Trying the default build file: " + buildFile);
                }
                if (buildFile.exists()) {
                    break;
                }
            }
        }
    }

    private int handleCustomProcessor(String[] args, int index,
                                      ArgumentProcessorRegistry registry) {
        ArgumentProcessor processor = null;
        for (ArgumentProcessor p : registry.getProcessors()) {
            int newI = p.readArguments(args, index);
            if (newI != -1) {
                processor = p;
                index = newI - 1; // loop will increment
                break;
            }
        }
        if (processor == null) {
            System.err.println("Unknown argument: " + args[index]);
            printUsage();
            throw new BuildException("");
        }
        List<String> extraArgs = extraArguments.computeIfAbsent(
                processor.getClass(), k -> new ArrayList<>());
        for (int j = index + 1; j < index + 1 + (processor.readArguments(args, index) - index); j++) {
            if (j < args.length) {
                extraArgs.add(args[j]);
            }
        }
        return index;
    }

    // --------------------------------------------------------
    //    Methods for handling the command line arguments
    // --------------------------------------------------------

    private int handleArgBuildFile(String[] args, int pos) {
        try {
            buildFile = new File(args[++pos].replace('/', File.separatorChar));
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException(
                "You must specify a buildfile when using the -buildfile argument");
        }
        return pos;
    }

    private int handleArgListener(String[] args, int pos) {
        try {
            listeners.addElement(args[pos + 1]);
            pos++;
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a classname when using the -listener argument");
        }
        return pos;
    }

    private int handleArgDefine(String[] args, int argPos) {
        String arg = args[argPos];
        String name = arg.substring(2);
        String value;
        int eq = name.indexOf('=');
        if (eq > 0) {
            value = name.substring(eq + 1);
            name = name.substring(0, eq);
        } else if (argPos < args.length - 1) {
            value = args[++argPos];
        } else {
            throw new BuildException("Missing value for property " + name);
        }
        definedProps.put(name, value);
        return argPos;
    }

    private int handleArgLogger(String[] args, int pos) {
        if (loggerClassname != null) {
            throw new BuildException("Only one logger class may be specified.");
        }
        try {
            loggerClassname = args[++pos];
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a classname when using the -logger argument");
        }
        return pos;
    }

    private int handleArgInputHandler(String[] args, int pos) {
        if (inputHandlerClassname != null) {
            throw new BuildException("Only one input handler class may be specified.");
        }
        try {
            inputHandlerClassname = args[++pos];
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a classname when using the -inputhandler argument");
        }
        return pos;
    }

    private int handleArgPropertyFile(String[] args, int pos) {
        try {
            propertyFiles.addElement(args[++pos]);
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a property filename when using the -propertyfile argument");
        }
        return pos;
    }

    private int handleArgNice(String[] args, int pos) {
        try {
            threadPriority = Integer.decode(args[++pos]);
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must supply a niceness value (1-10) after the -nice option");
        } catch (NumberFormatException e) {
            throw new BuildException("Unrecognized niceness value: " + args[pos]);
        }
        if (threadPriority < Thread.MIN_PRIORITY || threadPriority > Thread.MAX_PRIORITY) {
            throw new BuildException("Niceness value is out of the range 1-10");
        }
        return pos;
    }

    // --------------------------------------------------------
    //    other methods
    // --------------------------------------------------------

    private void loadPropertyFiles() {
        for (String filename : propertyFiles) {
            Properties props = new Properties();
            FileInputStream fis = null;
            try {
                fis = new FileInputStream(filename);
                props.load(fis);
            } catch (IOException e) {
                System.out.println("Could not load property file " + filename + ": " + e.getMessage());
            } finally {
                FileUtils.close(fis);
            }
            for (java.util.Enumeration<?> e = props.propertyNames(); e.hasMoreElements();) {
                String name = (String) e.nextElement();
                if (definedProps.getProperty(name) == null) {
                    definedProps.put(name, props.getProperty(name));
                }
            }
        }
    }

    private File getParentFile(File file) {
        File parent = file.getParentFile();
        if (parent != null && msgOutputLevel >= Project.MSG_VERBOSE) {
            System.out.println("Searching in " + parent.getAbsolutePath());
        }
        return parent;
    }

    private File findBuildFile(String start, String suffix) {
        if (msgOutputLevel >= Project.MSG_INFO) {
            System.out.println("Searching for " + suffix + " ...");
        }
        File parent = new File(new File(start).getAbsolutePath());
        File file = new File(parent, suffix);
        while (!file.exists()) {
            parent = getParentFile(parent);
            if (parent == null) {
                return null;
            }
            file = new File(parent, suffix);
        }
        return file;
    }

    private void runBuild(ClassLoader coreLoader) throws BuildException {
        if (!readyToRun) {
            return;
        }
        ArgumentProcessorRegistry processorRegistry = ArgumentProcessorRegistry.getInstance();
        for (ArgumentProcessor processor : processorRegistry.getProcessors()) {
            List<String> extraArgs = extraArguments.get(processor.getClass());
            if (extraArgs != null && processor.handleArg(extraArgs)) {
                return;
            }
        }
        final Project project = new Project();
        project.setCoreLoader(coreLoader);
        Throwable error = null;
        try {
            addBuildListeners(project);
            addInputHandler(project);
            PrintStream savedErr = System.err;
            PrintStream savedOut = System.out;
            InputStream savedIn = System.in;
            SecurityManager oldsm = System.getSecurityManager();
            try {
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
                        Thread.currentThread().setPriority(threadPriority);
                    } catch (SecurityException swallowed) {
                        project.log("A security manager refused to set the -nice value");
                    }
                }
                setProperties(project);
                project.setKeepGoingMode(keepGoingMode);
                if (proxy) {
                    new ProxySetup(project).enableProxies();
                }
                for (ArgumentProcessor processor : processorRegistry.getProcessors()) {
                    List<String> extraArgs = extraArguments.get(processor.getClass());
                    if (extraArgs != null) {
                        processor.prepareConfigure(project, extraArgs);
                    }
                }
                ProjectHelper.configureProject(project, buildFile);
                for (ArgumentProcessor processor : processorRegistry.getProcessors()) {
                    List<String> extraArgs = extraArguments.get(processor.getClass());
                    if (extraArgs != null && processor.handleArg(project, extraArgs)) {
                        return;
                    }
                }
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
            } finally {
                if (oldsm != null) {
                    System.setSecurityManager(oldsm);
                }
                System.setOut(savedOut);
                System.setErr(savedErr);
                System.setIn(savedIn);
            }
        } catch (RuntimeException exc) {
            error = exc;
            throw exc;
        } catch (Error e) {
            error = e;
            throw e;
        } finally {
            if (!projectHelp) {
                try {
                    project.fireBuildFinished(error);
                } catch (Throwable t) {
                    System.err.println("Caught an exception while logging the end of the build.  Exception was:");
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
    }

    private void setProperties(final Project project) {
        project.init();
        PropertyHelper propertyHelper = PropertyHelper.getPropertyHelper(project);
        @SuppressWarnings({ "rawtypes", "unchecked" })
        Map raw = new HashMap(definedProps);
        @SuppressWarnings("unchecked")
        Map<String, Object> props = raw;
        ResolvePropertyMap resolver = new ResolvePropertyMap(project, NOPROPERTIES, propertyHelper.getExpanders());
        resolver.resolveAllProperties(props, null, false);
        for (Map.Entry<String, Object> ent : props.entrySet()) {
            project.setUserProperty(ent.getKey(), String.valueOf(ent.getValue()));
        }
        project.setUserProperty(MagicNames.ANT_FILE, buildFile.getAbsolutePath());
        project.setUserProperty(MagicNames.ANT_FILE_TYPE, MagicNames.ANT_FILE_TYPE_FILE);
    }

    protected void addBuildListeners(Project project) {
        project.addBuildListener(createLogger());
        for (int i = 0; i < listeners.size(); i++) {
            String className = listeners.elementAt(i);
            BuildListener listener = (BuildListener) ClasspathUtils.newInstance(className,
                    Main.class.getClassLoader(), BuildListener.class);
            project.setProjectReference(listener);
            project.addBuildListener(listener);
        }
    }

    private void addInputHandler(Project project) throws BuildException {
        InputHandler handler = (inputHandlerClassname == null) ? new DefaultInputHandler()
                : (InputHandler) ClasspathUtils.newInstance(inputHandlerClassname,
                        Main.class.getClassLoader(), InputHandler.class);
        if (inputHandlerClassname != null) {
            project.setProjectReference(handler);
        }
        project.setInputHandler(handler);
    }

    private BuildLogger createLogger() {
        BuildLogger logger;
        if (silent) {
            logger = new SilentLogger();
            msgOutputLevel = Project.MSG_WARN;
            emacsMode = true;
        } else if (loggerClassname != null) {
            try {
                logger = (BuildLogger) ClasspathUtils.newInstance(loggerClassname,
                        Main.class.getClassLoader(), BuildLogger.class);
            } catch (BuildException e) {
                System.err.println("The specified logger class " + loggerClassname
                        + " could not be used because " + e.getMessage());
                throw new RuntimeException();
            }
        } else {
            logger = new DefaultLogger();
        }
        logger.setMessageOutputLevel(msgOutputLevel);
        logger.setOutputPrintStream(out);
        logger.setErrorPrintStream(err);
        logger.setEmacsMode(emacsMode);
        return logger;
    }

    private static void printUsage() {
        System.out.println("ant [options] [target [target2 [target3] ...]]");
        System.out.println("Options: ");
        System.out.println("  -help, -h              print this message");
        System.out.println("  -projecthelp, -p       print project help information");
        System.out.println("  -version               print the version information and exit");
        System.out.println("  -diagnostics           print information that might be helpful to");
        System.out.println("                         diagnose or report problems.");
        System.out.println("  -quiet, -q             be extra quiet");
        System.out.println("  -silent, -S            print nothing but task outputs and build failures");
        System.out.println("  -verbose, -v           be extra verbose");
        System.out.println("  -debug, -d             print debugging information");
        System.out.println("  -emacs, -e             produce logging information without adornments");
        System.out.println("  -lib <path>            specifies a path to search for jars and classes");
        System.out.println("  -logfile <file>        use given file for log");
        System.out.println("    -l     <file>                ''");
        System.out.println("  -logger <classname>    the class which is to perform logging");
        System.out.println("  -listener <classname>  add an instance of class as a project listener");
        System.out.println("  -noinput               do not allow interactive input");
        System.out.println("  -buildfile <file>      use given buildfile");
        System.out.println("    -file    <file>              ''");
        System.out.println("    -f       <file>              ''");
        System.out.println("  -D<property>=<value>   use value for given property");
        System.out.println("  -keep-going, -k        execute all targets that do not depend");
        System.out.println("                         on failed target(s)");
        System.out.println("  -propertyfile <name>   load all properties from file with -D");
        System.out.println("                         properties taking precedence");
        System.out.println("  -inputhandler <class>  the class which will handle input requests");
        System.out.println("  -find <file>           (s)earch for buildfile towards the root of");
        System.out.println("    -s  <file>           the filesystem and use it");
        System.out.println("  -nice  number          A niceness value for the main thread:"
                + "                         1 (lowest) to 10 (highest); 5 is the default");
        System.out.println("  -nouserlib             Run ant without using the jar files from"
                + "                         ${user.home}/.ant/lib");
        System.out.println("  -noclasspath           Run ant without using CLASSPATH");
        System.out.println("  -autoproxy             Java1.5+: use the OS proxy settings");
        System.out.println("  -main <class>          override Ant's normal entry point");
        for (ArgumentProcessor processor : ArgumentProcessorRegistry.getInstance().getProcessors()) {
            processor.printUsage(System.out);
        }
    }

    private static void printVersion(int logLevel) throws BuildException {
        System.out.println(getAntVersion());
    }

    private static String antVersion = null;

    public static synchronized String getAntVersion() throws BuildException {
        if (antVersion == null) {
            try {
                Properties props = new Properties();
                InputStream in = Main.class.getResourceAsStream("/org/apache/tools/ant/version.txt");
                props.load(in);
                in.close();
                StringBuilder msg = new StringBuilder();
                msg.append("Apache Ant(TM) version ").append(props.getProperty("VERSION"));
                msg.append(" compiled on ").append(props.getProperty("DATE"));
                antVersion = msg.toString();
            } catch (IOException ioe) {
                throw new BuildException("Could not load the version information:" + ioe.getMessage());
            } catch (NullPointerException npe) {
                throw new BuildException("Could not load the version information.");
            }
        }
        return antVersion;
    }

    private static void printDescription(Project project) {
        if (project.getDescription() != null) {
            project.log(project.getDescription());
        }
    }

    private static Map<String, Target> removeDuplicateTargets(Map<String, Target> targets) {
        Map<Location, Target> locationMap = new HashMap<>();
        for (Map.Entry<String, Target> entry : targets.entrySet()) {
            String name = entry.getKey();
            Target target = entry.getValue();
            Target other = locationMap.get(target.getLocation());
            if (other == null || other.getName().length() > name.length()) {
                locationMap.put(target.getLocation(), target);
            }
        }
        Map<String, Target> ret = new HashMap<>();
        for (Target t : locationMap.values()) {
            ret.put(t.getName(), t);
        }
        return ret;
    }

    private static void printTargets(Project project, boolean printSubTargets,
            boolean printDependencies) {
        int maxLength = 0;
        Map<String, Target> ptargets = removeDuplicateTargets(project.getTargets());
        Vector<String> topNames = new Vector<>();
        Vector<String> topDescriptions = new Vector<>();
        Vector<java.util.Enumeration<String>> topDependencies = new Vector<>();
        Vector<String> subNames = new Vector<>();
        Vector<java.util.Enumeration<String>> subDependencies = new Vector<>();

        for (Target currentTarget : ptargets.values()) {
            String name = currentTarget.getName();
            if ("".equals(name)) {
                continue;
            }
            String desc = currentTarget.getDescription();
            if (desc == null) {
                int pos = findTargetPosition(subNames, name);
                subNames.insertElementAt(name, pos);
                if (printDependencies) {
                    subDependencies.insertElementAt(currentTarget.getDependencies(), pos);
                }
            } else {
                int pos = findTargetPosition(topNames, name);
                topNames.insertElementAt(name, pos);
                topDescriptions.insertElementAt(desc, pos);
                if (name.length() > maxLength) {
                    maxLength = name.length();
                }
                if (printDependencies) {
                    topDependencies.insertElementAt(currentTarget.getDependencies(), pos);
                }
            }
        }

        printTargets(project, topNames, topDescriptions, topDependencies,
                "Main targets:", maxLength);
        if (topNames.isEmpty()) {
            printSubTargets = true;
        }
        if (printSubTargets) {
            printTargets(project, subNames, null, subDependencies, "Other targets:", 0);
        }

        String defaultTarget = project.getDefaultTarget();
        if (defaultTarget != null && !"".equals(defaultTarget)) {
            project.log("Default target: " + defaultTarget);
        }
    }

    private static int findTargetPosition(Vector<String> names, String name) {
        int size = names.size();
        for (int i = 0; i < size; i++) {
            if (name.compareTo(names.elementAt(i)) < 0) {
                return i;
            }
        }
        return size;
    }

    private static void printTargets(Project project, Vector<String> names,
                                     Vector<String> descriptions, Vector<java.util.Enumeration<String>> dependencies,
                                     String heading, int maxlen) {
        String lSep = System.getProperty("line.separator");
        String spaces = "    ";
        while (spaces.length() <= maxlen) {
            spaces += spaces;
        }
        StringBuilder msg = new StringBuilder();
        msg.append(heading).append(lSep).append(lSep);
        for (int i = 0; i < names.size(); i++) {
            msg.append(" ").append(names.elementAt(i));
            if (descriptions != null) {
                msg.append(spaces.substring(0, maxlen - names.elementAt(i).length() + 2));
                msg.append(descriptions.elementAt(i));
            }
            msg.append(lSep);
            if (!dependencies.isEmpty()) {
                java.util.Enumeration<String> deps = dependencies.elementAt(i);
                if (deps.hasMoreElements()) {
                    msg.append("   depends on: ");
                    while (deps.hasMoreElements()) {
                        msg.append(deps.nextElement());
                        if (deps.hasMoreElements()) {
                            msg.append(", ");
                        }
                    }
                    msg.append(lSep);
                }
            }
        }
        project.log(msg.toString(), Project.MSG_WARN);
    }
}