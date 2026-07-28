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
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
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




    /**
     * Prints the message of the Throwable if it (the message) is not
     * <code>null</code>.
     *
     * @param t Throwable to print the message of.
     *          Must not be <code>null</code>.
     */
    private static void printMessage(Throwable t) {
        String message = t.getMessage();
        if (message != null) {
            System.err.println(message);
        }
    }

    /**
     * Creates a new instance of this class using the
     * arguments specified, gives it any extra user properties which have been
     * specified, and then runs the build using the classloader provided.
     *
     * @param args Command line arguments. Must not be <code>null</code>.
     * @param additionalUserProperties Any extra properties to use in this
     *        build. May be <code>null</code>, which is the equivalent to
     *        passing in an empty set of properties.
     * @param coreLoader Classloader used for core classes. May be
     *        <code>null</code> in which case the system classloader is used.
     */
    public static void start(String[] args, Properties additionalUserProperties,
                             ClassLoader coreLoader) {
        Main m = new Main();
        m.startAnt(args, additionalUserProperties, coreLoader);
    }

    /**
     * Start Ant
     * @param args command line args
     * @param additionalUserProperties properties to set beyond those that
     *        may be specified on the args list
     * @param coreLoader - not used
     *
     * @since Ant 1.6
     */
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
            for (Enumeration<?> e = additionalUserProperties.keys();
                    e.hasMoreElements();) {
                String key = (String) e.nextElement();
                String property = additionalUserProperties.getProperty(key);
                definedProps.put(key, property);
            }
        }

        // expect the worst
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

    /**
     * This operation is expected to call {@link System#exit(int)}, which
     * is what the base version does.
     * However, it is possible to do something else.
     * @param exitCode code to exit with
     */
    protected void exit(int exitCode) {
        System.exit(exitCode);
    }

    /**
     * Close logfiles, if we have been writing to them.
     *
     * @since Ant 1.6
     */
    private static void handleLogfile() {
        if (isLogFileUsed) {
            FileUtils.close(out);
            FileUtils.close(err);
        }
    }

    /**
     * Command line entry point. This method kicks off the building
     * of a project object and executes a build using either a given
     * target or the default target.
     *
     * @param args Command line arguments. Must not be <code>null</code>.
     */
    public static void main(String[] args) {
        start(args, null, null);
    }

    /**
     * Constructor used when creating Main for later arg processing
     * and startup
     */
    public Main() {
    }

    /**
     * Sole constructor, which parses and deals with command line
     * arguments.
     *
     * @param args Command line arguments. Must not be <code>null</code>.
     *
     * @exception BuildException if the specified build file doesn't exist
     *                           or is a directory.
     *
     * @deprecated since 1.6.x
     */
    protected Main(String[] args) throws BuildException {
        processArgs(args);
    }

    /**
     * Process command line arguments.
     * When ant is started from Launcher, launcher-only arguments do not get
     * passed through to this routine.
     *
     * @param args the command line arguments.
     *
     * @since Ant 1.6
     */
    private void processArgs(String[] args) {
        String searchForThis = null;
        boolean searchForFile = false;
        PrintStream logTo = null;

        boolean justPrintUsage = false;
        boolean justPrintVersion = false;
        boolean justPrintDiagnostics = false;

        ArgumentProcessorRegistry processorRegistry = ArgumentProcessorRegistry.getInstance();

        for (int i = 0; i < args.length; i++) {
            String arg = args[i];

            if (isHelp(arg)) {
                justPrintUsage = true;
                continue;
            }
            if (isVersion(arg)) {
                justPrintVersion = true;
                continue;
            }
            if (isDiagnostics(arg)) {
                justPrintDiagnostics = true;
                continue;
            }
            if (isQuiet(arg)) {
                msgOutputLevel = Project.MSG_WARN;
                continue;
            }
            if (isVerbose(arg)) {
                msgOutputLevel = Project.MSG_VERBOSE;
                continue;
            }
            if (isDebug(arg)) {
                msgOutputLevel = Project.MSG_DEBUG;
                continue;
            }
            if (isSilent(arg)) {
                silent = true;
                continue;
            }
            if (isNoInput(arg)) {
                allowInput = false;
                continue;
            }
            if (isLogFile(arg)) {
                i = handleLogFile(args, i);
                logTo = out; // set later after loop
                continue;
            }
            if (isBuildFile(arg)) {
                i = handleArgBuildFile(args, i);
                continue;
            }
            if (isListener(arg)) {
                i = handleArgListener(args, i);
                continue;
            }
            if (isDefine(arg)) {
                i = handleArgDefine(args, i);
                continue;
            }
            if (isLogger(arg)) {
                i = handleArgLogger(args, i);
                continue;
            }
            if (isInputHandler(arg)) {
                i = handleArgInputHandler(args, i);
                continue;
            }
            if (isEmacs(arg)) {
                emacsMode = true;
                continue;
            }
            if (isProjectHelp(arg)) {
                projectHelp = true;
                continue;
            }
            if (isFind(arg)) {
                searchForFile = true;
                if (i < args.length - 1) {
                    searchForThis = args[++i];
                }
                continue;
            }
            if (isPropertyFile(arg)) {
                i = handleArgPropertyFile(args, i);
                continue;
            }
            if (isKeepGoing(arg)) {
                keepGoingMode = true;
                continue;
            }
            if (isNice(arg)) {
                i = handleArgNice(args, i);
                continue;
            }
            if (isLaunchCommand(arg)) {
                throw new BuildException(
                        "Ant's Main method is being handed "
                        + "an option " + arg + " that is only for the launcher class."
                        + "\nThis can be caused by a version mismatch between "
                        + "the ant script/.bat file and Ant itself.");
            }
            if (isAutoProxy(arg)) {
                proxy = true;
                continue;
            }
            if (arg.startsWith("-")) {
                i = handleCustomArgument(processorRegistry, args, i);
                continue;
            }
            // non‑option argument – treat as target
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

        resolveBuildFile(searchForFile, searchForThis);

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

    /** Guard clause for help flag. */
    private boolean isHelp(String arg) {
        return "-help".equals(arg) || "-h".equals(arg);
    }

    /** Guard clause for version flag. */
    private boolean isVersion(String arg) {
        return "-version".equals(arg);
    }

    /** Guard clause for diagnostics flag. */
    private boolean isDiagnostics(String arg) {
        return "-diagnostics".equals(arg);
    }

    /** Guard clause for quiet flag. */
    private boolean isQuiet(String arg) {
        return "-quiet".equals(arg) || "-q".equals(arg);
    }

    /** Guard clause for verbose flag. */
    private boolean isVerbose(String arg) {
        return "-verbose".equals(arg) || "-v".equals(arg);
    }

    /** Guard clause for debug flag. */
    private boolean isDebug(String arg) {
        return "-debug".equals(arg) || "-d".equals(arg);
    }

    /** Guard clause for silent flag. */
    private boolean isSilent(String arg) {
        return "-silent".equals(arg) || "-S".equals(arg);
    }

    /** Guard clause for no‑input flag. */
    private boolean isNoInput(String arg) {
        return "-noinput".equals(arg);
    }

    /** Guard clause for logfile flag. */
    private boolean isLogFile(String arg) {
        return "-logfile".equals(arg) || "-l".equals(arg);
    }

    /** Guard clause for buildfile flag. */
    private boolean isBuildFile(String arg) {
        return "-buildfile".equals(arg) || "-file".equals(arg) || "-f".equals(arg);
    }

    /** Guard clause for listener flag. */
    private boolean isListener(String arg) {
        return "-listener".equals(arg);
    }

    /** Guard clause for property definition flag. */
    private boolean isDefine(String arg) {
        return arg.startsWith("-D");
    }

    /** Guard clause for logger flag. */
    private boolean isLogger(String arg) {
        return "-logger".equals(arg);
    }

    /** Guard clause for inputhandler flag. */
    private boolean isInputHandler(String arg) {
        return "-inputhandler".equals(arg);
    }

    /** Guard clause for emacs flag. */
    private boolean isEmacs(String arg) {
        return "-emacs".equals(arg) || "-e".equals(arg);
    }

    /** Guard clause for project‑help flag. */
    private boolean isProjectHelp(String arg) {
        return "-projecthelp".equals(arg) || "-p".equals(arg);
    }

    /** Guard clause for find flag. */
    private boolean isFind(String arg) {
        return "-find".equals(arg) || "-s".equals(arg);
    }

    /** Guard clause for property‑file flag. */
    private boolean isPropertyFile(String arg) {
        return arg.startsWith("-propertyfile");
    }

    /** Guard clause for keep‑going flag. */
    private boolean isKeepGoing(String arg) {
        return "-k".equals(arg) || "-keep-going".equals(arg);
    }

    /** Guard clause for nice flag. */
    private boolean isNice(String arg) {
        return "-nice".equals(arg);
    }

    /** Guard clause for launcher‑only commands. */
    private boolean isLaunchCommand(String arg) {
        return LAUNCH_COMMANDS.contains(arg);
    }

    /** Guard clause for autoproxy flag. */
    private boolean isAutoProxy(String arg) {
        return "-autoproxy".equals(arg);
    }

    /** Handles the -logfile argument and returns the new index. */
    private int handleLogFile(String[] args, int i) {
        try {
            File logFile = new File(args[i + 1]);
            PrintStream ps = new PrintStream(new FileOutputStream(logFile));
            isLogFileUsed = true;
            return i + 1;
        } catch (IOException ioe) {
            throw new BuildException("Cannot write on the specified log file. "
                    + "Make sure the path exists and you have write permissions.");
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a log file when using the -log argument");
        }
    }

    /** Handles custom arguments processed by registered ArgumentProcessors. */
    private int handleCustomArgument(ArgumentProcessorRegistry registry, String[] args, int i) {
        String arg = args[i];
        boolean processed = false;
        for (ArgumentProcessor processor : registry.getProcessors()) {
            int newI = processor.readArguments(args, i);
            if (newI != -1) {
                List<String> extraArgs = extraArguments.get(processor.getClass());
                if (extraArgs == null) {
                    extraArgs = new ArrayList<String>();
                    extraArguments.put(processor.getClass(), extraArgs);
                }
                for (int j = i; j < newI && j < args.length; j++) {
                    extraArgs.add(args[j]);
                }
                processed = true;
                i = newI - 1; // loop will ++i
                break;
            }
        }
        if (!processed) {
            System.err.println("Unknown argument: " + arg);
            printUsage();
            throw new BuildException("");
        }
        return i;
    }

    /** Resolves the build file based on search flags. */
    private void resolveBuildFile(boolean searchForFile, String searchForThis) {
        if (buildFile == null) {
            if (searchForFile) {
                if (searchForThis != null) {
                    buildFile = findBuildFile(System.getProperty("user.dir"), searchForThis);
                    if (buildFile == null) {
                        throw new BuildException("Could not locate a build file!");
                    }
                } else {
                    Iterator<ProjectHelper> it = ProjectHelperRepository.getInstance().getHelpers();
                    while (true) {
                        ProjectHelper helper = it.next();
                        searchForThis = helper.getDefaultBuildFile();
                        if (msgOutputLevel >= Project.MSG_VERBOSE) {
                            System.out.println("Searching the default build file: " + searchForThis);
                        }
                        buildFile = findBuildFile(System.getProperty("user.dir"), searchForThis);
                        if (buildFile != null) {
                            break;
                        }
                        if (!it.hasNext()) {
                            throw new BuildException("Could not locate a build file!");
                        }
                    }
                }
            } else {
                Iterator<ProjectHelper> it = ProjectHelperRepository.getInstance().getHelpers();
                while (true) {
                    ProjectHelper helper = it.next();
                    buildFile = new File(helper.getDefaultBuildFile());
                    if (msgOutputLevel >= Project.MSG_VERBOSE) {
                        System.out.println("Trying the default build file: " + buildFile);
                    }
                    if (buildFile.exists() || !it.hasNext()) {
                        break;
                    }
                }
            }
        }
    }

    // --------------------------------------------------------
    //    Methods for handling the command line arguments
    // --------------------------------------------------------

    /** Handle the -buildfile, -file, -f argument */
    private int handleArgBuildFile(String[] args, int pos) {
        try {
            buildFile = new File(
                args[++pos].replace('/', File.separatorChar));
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException(
                "You must specify a buildfile when using the -buildfile argument");
        }
        return pos;
    }

    /** Handle -listener argument */
    private int handleArgListener(String[] args, int pos) {
        try {
            listeners.addElement(args[pos + 1]);
            pos++;
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            String msg = "You must specify a classname when "
                + "using the -listener argument";
            throw new BuildException(msg);
        }
        return pos;
    }

    /** Handler -D argument */
    private int handleArgDefine(String[] args, int argPos) {
        String arg = args[argPos];
        String name = arg.substring(2);
        String value;
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
        return argPos;
    }

    /** Handle the -logger argument. */
    private int handleArgLogger(String[] args, int pos) {
        if (loggerClassname != null) {
            throw new BuildException(
                "Only one logger class may be specified.");
        }
        try {
            loggerClassname = args[++pos];
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException(
                "You must specify a classname when using the -logger argument");
        }
        return pos;
    }

    /** Handle the -inputhandler argument. */
    private int handleArgInputHandler(String[] args, int pos) {
        if (inputHandlerClassname != null) {
            throw new BuildException("Only one input handler class may "
                                     + "be specified.");
        }
        try {
            inputHandlerClassname = args[++pos];
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException("You must specify a classname when"
                                     + " using the -inputhandler"
                                     + " argument");
        }
        return pos;
    }

    /** Handle the -propertyfile argument. */
    private int handleArgPropertyFile(String[] args, int pos) {
        try {
            propertyFiles.addElement(args[++pos]);
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            String msg = "You must specify a property filename when "
                + "using the -propertyfile argument";
            throw new BuildException(msg);
        }
        return pos;
    }

    /** Handle the -nice argument. */
    private int handleArgNice(String[] args, int pos) {
        try {
            threadPriority = Integer.decode(args[++pos]);
        } catch (ArrayIndexOutOfBoundsException aioobe) {
            throw new BuildException(
                "You must supply a niceness value (1-10)"
                + " after the -nice option");
        } catch (NumberFormatException e) {
            throw new BuildException("Unrecognized niceness value: "
                                     + args[pos]);
        }

        if (threadPriority.intValue() < Thread.MIN_PRIORITY
            || threadPriority.intValue() > Thread.MAX_PRIORITY) {
            throw new BuildException(
                "Niceness value is out of the range 1-10");
        }
        return pos;
    }

    // --------------------------------------------------------
    //    other methods
    // --------------------------------------------------------

    /** Load the property files specified by -propertyfile */
    private void loadPropertyFiles() {
        for (String filename : propertyFiles) {
            Properties props = new Properties();
            FileInputStream fis = null;
            try {
                fis = new FileInputStream(filename);
                props.load(fis);
            } catch (IOException e) {
                System.out.println("Could not load property file "
                                   + filename + ": " + e.getMessage());
            } finally {
                FileUtils.close(fis);
            }

            Enumeration<?> propertyNames = props.propertyNames();
            while (propertyNames.hasMoreElements()) {
                String name = (String) propertyNames.nextElement();
                if (definedProps.getProperty(name) == null) {
                    definedProps.put(name, props.getProperty(name));
                }
            }
        }
    }

    /**
     * Helper to get the parent file for a given file.
     * <p>
     * Added to simulate File.getParentFile() from JDK 1.2.
     * @deprecated since 1.6.x
     *
     * @param file   File to find parent of. Must not be <code>null</code>.
     * @return       Parent file or null if none
     */
    private File getParentFile(File file) {
        File parent = file.getParentFile();

        if (parent != null && msgOutputLevel >= Project.MSG_VERBOSE) {
            System.out.println("Searching in " + parent.getAbsolutePath());
        }

        return parent;
    }

    /**
     * Search parent directories for the build file.
     *
     * @param start  Leaf directory of search.
     *               Must not be <code>null</code>.
     * @param suffix  Suffix filename to look for in parents.
     *                Must not be <code>null</code>.
     *
     * @return A handle to the build file if one is found, <code>null</code> if not
     */
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

    /**
     * Executes the build. If the constructor for this instance failed
     * (e.g. returned after issuing a warning), this method returns
     * immediately.
     *
     * @param coreLoader The classloader to use to find core classes.
     *                   May be <code>null</code>, in which case the
     *                   system classloader is used.
     *
     * @exception BuildException if the build fails
     */
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
                        project.log("Setting Ant's thread priority to "
                                + threadPriority, Project.MSG_VERBOSE);
                        Thread.currentThread().setPriority(threadPriority.intValue());
                    } catch (SecurityException swallowed) {
                        project.log("A security manager refused to set the -nice value");
                    }
                }

                setProperties(project);
                project.setKeepGoingMode(keepGoingMode);
                if (proxy) {
                    ProxySetup proxySetup = new ProxySetup(project);
                    proxySetup.enableProxies();
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
                    System.err.println("Caught an exception while logging the"
                                       + " end of the build.  Exception was:");
                    t.printStackTrace();
                    if (error != null) {
                        System.err.println("There has been an error prior to"
                                           + " that:");
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

        ResolvePropertyMap resolver = new ResolvePropertyMap(project,
                NOPROPERTIES, propertyHelper.getExpanders());
        resolver.resolveAllProperties(props, null, false);

        for (Entry<String, Object> ent : props.entrySet()) {
            String arg = ent.getKey();
            Object value = ent.getValue();
            project.setUserProperty(arg, String.valueOf(value));
        }

        project.setUserProperty(MagicNames.ANT_FILE,
                                buildFile.getAbsolutePath());
        project.setUserProperty(MagicNames.ANT_FILE_TYPE,
                                MagicNames.ANT_FILE_TYPE_FILE);
    }

    /**
     * Adds the listeners specified in the command line arguments,
     * along with the default listener, to the specified project.
     *
     * @param project The project to add listeners to.
     *                Must not be <code>null</code>.
     */
    protected void addBuildListeners(Project project) {

        project.addBuildListener(createLogger());

        final int count = listeners.size();
        for (int i = 0; i < count; i++) {
            String className = (String) listeners.elementAt(i);
            BuildListener listener =
                    (BuildListener) ClasspathUtils.newInstance(className,
                            Main.class.getClassLoader(), BuildListener.class);
            project.setProjectReference(listener);
            project.addBuildListener(listener);
        }
    }

    /**
     * Creates the InputHandler and adds it to the project.
     *
     * @param project the project instance.
     *
     * @exception BuildException if a specified InputHandler
     *                           implementation could not be loaded.
     */
    private void addInputHandler(Project project) throws BuildException {
        InputHandler handler;
        if (inputHandlerClassname == null) {
            handler = new DefaultInputHandler();
        } else {
            handler = (InputHandler) ClasspathUtils.newInstance(
                    inputHandlerClassname, Main.class.getClassLoader(),
                    InputHandler.class);
            project.setProjectReference(handler);
        }
        project.setInputHandler(handler);
    }

    /**
     * Creates the default build logger for sending build events to the ant
     * log.
     *
     * @return the logger instance for this build.
     */
    private BuildLogger createLogger() {
        BuildLogger logger;
        if (silent) {
            logger = new SilentLogger();
            msgOutputLevel = Project.MSG_WARN;
            emacsMode = true;
        } else if (loggerClassname != null) {
            try {
                logger = (BuildLogger) ClasspathUtils.newInstance(
                        loggerClassname, Main.class.getClassLoader(),
                        BuildLogger.class);
            } catch (BuildException e) {
                System.err.println("The specified logger class "
                    + loggerClassname
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

    /**
     * Prints the usage information for this class to <code>System.out</code>.
     */
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

    /**
     * Prints the Ant version information to <code>System.out</code>.
     *
     * @exception BuildException if the version information is unavailable
     */
    private static void printVersion(int logLevel) throws BuildException {
        System.out.println(getAntVersion());
    }

    /**
     * Cache of the Ant version information when it has been loaded.
     */
    private static String antVersion = null;

    /**
     * Returns the Ant version information, if available. Once the information
     * has been loaded once, it's cached and returned from the cache on future
     * calls.
     *
     * @return the Ant version information as a String
     *         (always non-<code>null</code>)
     *
     * @exception BuildException if the version information is unavailable
     */
    public static synchronized String getAntVersion() throws BuildException {
        if (antVersion == null) {
            try {
                Properties props = new Properties();
                InputStream in =
                    Main.class.getResourceAsStream("/org/apache/tools/ant/version.txt");
                props.load(in);
                in.close();

                StringBuilder msg = new StringBuilder();
                msg.append("Apache Ant(TM) version ");
                msg.append(props.getProperty("VERSION"));
                msg.append(" compiled on ");
                msg.append(props.getProperty("DATE"));
                antVersion = msg.toString();
            } catch (IOException ioe) {
                throw new BuildException("Could not load the version information:"
                                         + ioe.getMessage());
            } catch (NullPointerException npe) {
                throw new BuildException("Could not load the version information.");
            }
        }
        return antVersion;
    }

     /**
      * Prints the description of a project (if there is one) to
      * <code>System.out</code>.
      *
      * @param project The project to display a description of.
      *                Must not be <code>null</code>.
      */
    private static void printDescription(Project project) {
       if (project.getDescription() != null) {
          project.log(project.getDescription());
       }
    }

    /**
     * Targets in imported files with a project name
     * and not overloaded by the main build file will
     * be in the target map twice. This method
     * removes the duplicate target.
     * @param targets the targets to filter.
     * @return the filtered targets.
     */
    private static Map<String, Target> removeDuplicateTargets(Map<String, Target> targets) {
        Map<Location, Target> locationMap = new HashMap<Location, Target>();
        for (Entry<String, Target> entry : targets.entrySet()) {
            String name = entry.getKey();
            Target target = entry.getValue();
            Target otherTarget = locationMap.get(target.getLocation());
            if (otherTarget == null
                || otherTarget.getName().length() > name.length()) {
                locationMap.put(
                    target.getLocation(), target);
            }
        }
        Map<String, Target> ret = new HashMap<String, Target>();
        for (Target target : locationMap.values()) {
            ret.put(target.getName(), target);
        }
        return ret;
    }

    /**
     * Prints a list of all targets in the specified project to
     * <code>System.out</code>, optionally including subtargets.
     *
     * @param project The project to display a description of.
     *                Must not be <code>null</code>.
     * @param printSubTargets Whether or not subtarget names should also be
     *                        printed.
     */
    private static void printTargets(Project project, boolean printSubTargets,
            boolean printDependencies) {
        int maxLength = 0;
        Map<String, Target> ptargets = removeDuplicateTargets(project.getTargets());
        Vector<String> topNames = new Vector<String>();
        Vector<String> topDescriptions = new Vector<String>();
        Vector<Enumeration<String>> topDependencies = new Vector<Enumeration<String>>();
        Vector<String> subNames = new Vector<String>();
        Vector<Enumeration<String>> subDependencies = new Vector<Enumeration<String>>();

        for (Target currentTarget : ptargets.values()) {
            String targetName = currentTarget.getName();
            if (targetName.equals("")) {
                continue;
            }
            String targetDescription = currentTarget.getDescription();
            if (targetDescription == null) {
                int pos = findTargetPosition(subNames, targetName);
                subNames.insertElementAt(targetName, pos);
                if (printDependencies) {
                    subDependencies.insertElementAt(currentTarget.getDependencies(), pos);
                }
            } else {
                int pos = findTargetPosition(topNames, targetName);
                topNames.insertElementAt(targetName, pos);
                topDescriptions.insertElementAt(targetDescription, pos);
                if (targetName.length() > maxLength) {
                    maxLength = targetName.length();
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

    /**
     * Searches for the correct place to insert a name into a list so as
     * to keep the list sorted alphabetically.
     *
     * @param names The current list of names. Must not be <code>null</code>.
     * @param name  The name to find a place for.
     *              Must not be <code>null</code>.
     *
     * @return the correct place in the list for the given name
     */
    private static int findTargetPosition(Vector<String> names, String name) {
        final int size = names.size();
        int res = size;
        for (int i = 0; i < size && res == size; i++) {
            if (name.compareTo(names.elementAt(i)) < 0) {
                res = i;
            }
        }
        return res;
    }

    /**
     * Writes a formatted list of target names to <code>System.out</code>
     * with an optional description.
     *
     *
     * @param project the project instance.
     * @param names The names to be printed.
     *              Must not be <code>null</code>.
     * @param descriptions The associated target descriptions.
     *                     May be <code>null</code>, in which case
     *                     no descriptions are displayed.
     *                     If non-<code>null</code>, this should have
     *                     as many elements as <code>names</code>.
     * @param topDependencies The list of dependencies for each target.
     *                        The dependencies are listed as a non null
     *                        enumeration of String.
     * @param heading The heading to display.
     *                Should not be <code>null</code>.
     * @param maxlen The maximum length of the names of the targets.
     *               If descriptions are given, they are padded to this
     *               position so they line up (so long as the names really
     *               <i>are</i> shorter than this).
     */
    private static void printTargets(Project project, Vector<String> names,
                                     Vector<String> descriptions, Vector<Enumeration<String>> dependencies,
                                     String heading,
                                     int maxlen) {
        String lSep = System.getProperty("line.separator");
        String spaces = "    ";
        while (spaces.length() <= maxlen) {
            spaces += spaces;
        }
        StringBuilder msg = new StringBuilder();
        msg.append(heading).append(lSep).append(lSep);
        final int size = names.size();
        for (int i = 0; i < size; i++) {
            msg.append(" ").append(names.elementAt(i));
            if (descriptions != null) {
                msg.append(
                    spaces.substring(0, maxlen - names.elementAt(i).length() + 2));
                msg.append(descriptions.elementAt(i));
            }
            msg.append(lSep);
            if (!dependencies.isEmpty()) {
                Enumeration<String> deps = dependencies.elementAt(i);
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