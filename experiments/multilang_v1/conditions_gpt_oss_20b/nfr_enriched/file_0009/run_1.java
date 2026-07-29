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
 *
 */
public class Main implements AntMain {

    private static final Set<String> LAUNCH_COMMANDS = Collections
            .unmodifiableSet(new HashSet<String>(Arrays.asList("-lib", "-cp", "-noclasspath",
                    "--noclasspath", "-nouserlib", "-main")));

    public static final String DEFAULT_BUILD_FILENAME = "build.xml";

    private int msgOutputLevel = Project.MSG_INFO;
    private File buildFile;
    private static PrintStream out = System.out;
    private static PrintStream err = System.err;
    private Vector<String> targets = new Vector<String>();
    private Properties definedProps = new Properties();
    private Vector<String> listeners = new Vector<String>(1);
    private Vector<String> propertyFiles = new Vector<String>(1);
    private boolean allowInput = true;
    private boolean keepGoingMode = false;
    private String loggerClassname = null;
    private String inputHandlerClassname = null;
    private boolean emacsMode = false;
    private boolean silent = false;
    private boolean readyToRun = false;
    private boolean projectHelp = false;
    private static boolean isLogFileUsed = false;
    private Integer threadPriority = null;
    private boolean proxy = false;
    private Map<Class<?>, List<String>> extraArguments = new HashMap<Class<?>, List<String>>();

    private static final GetProperty NOPROPERTIES = new GetProperty() {
        public Object getProperty(String aName) {
            return null;
        }
    };

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
            for (Enumeration<?> e = additionalUserProperties.keys();
                    e.hasMoreElements();) {
                String key = (String) e.nextElement();
                String property = additionalUserProperties.getProperty(key);
                definedProps.put(key, property);
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
     */
    private void processArgs(String[] args) {
        initOptionFlags();
        ArgumentProcessorRegistry processorRegistry = ArgumentProcessorRegistry.getInstance();

        for (int i = 0; i < args.length; i++) {
            String arg = args[i];
            if (isKnownOption(arg)) {
                i = handleKnownOption(arg, i, args);
            } else if (arg.startsWith("-")) {
                i = handleUnknownOption(arg, i, args, processorRegistry);
            } else {
                targets.addElement(arg);
            }
        }

        handlePostProcessing();
    }

    private void initOptionFlags() {
        justPrintUsage = false;
        justPrintVersion = false;
        justPrintDiagnostics = false;
    }

    private boolean isKnownOption(String arg) {
        return arg.equals("-help") || arg.equals("-h") || arg.equals("-version")
                || arg.equals("-diagnostics") || arg.equals("-quiet")
                || arg.equals("-q") || arg.equals("-verbose") || arg.equals("-v")
                || arg.equals("-debug") || arg.equals("-d") || arg.equals("-silent")
                || arg.equals("-S") || arg.equals("-noinput") || arg.equals("-logfile")
                || arg.equals("-l") || arg.equals("-buildfile") || arg.equals("-file")
                || arg.equals("-f") || arg.equals("-listener") || arg.startsWith("-D")
                || arg.equals("-logger") || arg.equals("-inputhandler") || arg.equals("-emacs")
                || arg.equals("-e") || arg.equals("-projecthelp") || arg.equals("-p")
                || arg.equals("-find") || arg.equals("-s") || arg.startsWith("-propertyfile")
                || arg.equals("-k") || arg.equals("-keep-going") || arg.equals("-nice")
                || arg.equals("-autoproxy") || arg.equals("-main");
    }

    private int handleKnownOption(String arg, int i, String[] args) {
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
            case "-quiet":
            case "-q":
                msgOutputLevel = Project.MSG_WARN;
                break;
            case "-verbose":
            case "-v":
                msgOutputLevel = Project.MSG_VERBOSE;
                break;
            case "-debug":
            case "-d":
                msgOutputLevel = Project.MSG_DEBUG;
                break;
            case "-silent":
            case "-S":
                silent = true;
                break;
            case "-noinput":
                allowInput = false;
                break;
            case "-logfile":
            case "-l":
                i = handleLogfileOption(args, i);
                break;
            case "-buildfile":
            case "-file":
            case "-f":
                i = handleArgBuildFile(args, i);
                break;
            case "-listener":
                i = handleArgListener(args, i);
                break;
            case "-D":
                i = handleArgDefine(args, i);
                break;
            case "-logger":
                i = handleArgLogger(args, i);
                break;
            case "-inputhandler":
                i = handleArgInputHandler(args, i);
                break;
            case "-emacs":
            case "-e":
                emacsMode = true;
                break;
            case "-projecthelp":
            case "-p":
                projectHelp = true;
                break;
            case "-find":
            case "-s":
                searchForFile = true;
                if (i < args.length - 1) {
                    searchForThis = args[++i];
                }
                break;
            case "-propertyfile":
                i = handleArgPropertyFile(args, i);
                break;
            case "-k":
            case "-keep-going":
                keepGoingMode = true;
                break;
            case "-nice":
                i = handleArgNice(args, i);
                break;
            case "-autoproxy":
                proxy = true;
                break;
            case "-main":
                // handled by launcher
                break;
            default:
                // should not reach here
                break;
        }
        return i;
    }

    private int handleUnknownOption(String arg, int i, String[] args,
                                    ArgumentProcessorRegistry processorRegistry) {
        if (LAUNCH_COMMANDS.contains(arg)) {
            String msg = "Ant's Main method is being handed "
                    + "an option " + arg + " that is only for the launcher class."
                    + "\nThis can be caused by a version mismatch between "
                    + "the ant script/.bat file and Ant itself.";
            throw new BuildException(msg);
        }

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
            String msg = "Unknown argument: " + arg;
            System.err.println(msg);
            printUsage();
            throw new BuildException("");
        }
        return i;
    }

    private void handlePostProcessing() {
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

        findBuildFileIfNeeded();
        validateBuildFile();
        normalizeBuildFile();
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

    private void findBuildFileIfNeeded() {
        if (buildFile == null) {
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
        }
    }

    private void validateBuildFile() {
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
    }

    private void normalizeBuildFile() {
        buildFile = FileUtils.getFileUtils().normalize(buildFile.getAbsolutePath());
    }

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

    private int handleLogfileOption(String[] args, int i) {
        try {
            File logFile = new File(args[i + 1]);
            i++;
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
        return i;
    }

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

    private int handleArgDefine(String[] args, int argPos) {
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
            throw new BuildException("Missing value for property "
                    + name);
        }
        definedProps.put(name, value);
        return argPos;
    }

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

    private void runBuild(ClassLoader coreLoader) throws BuildException {
        if (!readyToRun) {
            return;
        }

        ArgumentProcessorRegistry processorRegistry = ArgumentProcessorRegistry.getInstance();

        for (ArgumentProcessor processor : processorRegistry.getProcessors()) {
            List<String> extraArgs = extraArguments.get(processor.getClass());
            if (extraArgs != null) {
                if (processor.handleArg(extraArgs)) {
                    return;
                }
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
                    if (extraArgs != null) {
                        if (processor.handleArg(project, extraArgs)) {
                            return;
                        }
                    }
                }

                if (projectHelp) {
                    printDescription(project);
                    printTargets(project, msgOutputLevel > Project.MSG_INFO,
                            msgOutputLevel > Project.MSG_VERBOSE);
                    return;
                }

                if (targets.size() == 0) {
                    if (project.getDefaultTarget() != null) {
                        targets.addElement(project.getDefaultTarget());
                    }
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

    private void addInputHandler(Project project) throws BuildException {
        InputHandler handler = null;
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

    private BuildLogger createLogger() {
        BuildLogger logger = null;
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
                InputStream in =
                        Main.class.getResourceAsStream("/org/apache/tools/ant/version.txt");
                props.load(in);
                in.close();

                StringBuffer msg = new StringBuffer();
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

    private static void printDescription(Project project) {
        if (project.getDescription() != null) {
            project.log(project.getDescription());
        }
    }

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
        if (topNames.size() == 0) {
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
        final int size = names.size();
        int res = size;
        for (int i = 0; i < size && res == size; i++) {
            if (name.compareTo(names.elementAt(i)) < 0) {
                res = i;
            }
        }
        return res;
    }

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
        msg.append(heading + lSep + lSep);
        final int size = names.size();
        for (int i = 0; i < size; i++) {
            msg.append(" ");
            msg.append(names.elementAt(i));
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