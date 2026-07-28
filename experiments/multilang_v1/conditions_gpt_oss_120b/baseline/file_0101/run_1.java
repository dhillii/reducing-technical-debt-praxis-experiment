package org.gjt.sp.jedit;

import com.microstar.xml.*;
import javax.swing.plaf.metal.*;
import javax.swing.plaf.FontUIResource;
import javax.swing.text.DefaultEditorKit;
import javax.swing.text.Element;
import javax.swing.text.JTextComponent;
import javax.swing.text.Keymap;
import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.io.*;
import java.net.*;
import java.text.MessageFormat;
import java.util.*;

public class jEdit
{
	//{{{ Static configuration holder
	private static class Config
	{
		int logLevel = Log.WARNING;
		String settingsDir;
		String portFile = "server";
		boolean restore = true;
		boolean gui = true;
		boolean noPlugins = false;
		boolean noStartupScripts = false;
		String scriptFile = null;
		String[] args;
	}
	//}}}

	//{{{ getVersion() method
	public static String getVersion()
	{
		return MiscUtilities.buildToVersion(getBuild());
	}
	//}}}

	//{{{ getBuild() method
	public static String getBuild()
	{
		return "04.00.99.01";
	}
	//}}}

	//{{{ main() method
	public static void main(String[] args)
	{
		checkJavaVersion();
		Config cfg = parseCommandLine(args);
		settingsDirectory = cfg.settingsDir;
		String userDir = System.getProperty("user.dir");

		if (settingsDirectory != null && cfg.portFile != null)
			cfg.portFile = MiscUtilities.constructPath(settingsDirectory, cfg.portFile);
		else
			cfg.portFile = null;

		Log.init(true, cfg.logLevel);
		tryConnectToServer(cfg, userDir);
		showSplashIfNeeded();
		initLogWriter();
		Log.log(Log.NOTICE, jEdit.class, "jEdit version " + getVersion());
		Log.log(Log.MESSAGE, jEdit.class, "Settings directory is " + settingsDirectory);
		initServer(cfg.portFile);
		initializeComponents();
		if (!cfg.noPlugins)
			initPlugins();
		loadMacrosAndStartupScripts(cfg);
		if (cfg.scriptFile != null)
			runRunScript(cfg.scriptFile, userDir);
		propertiesChanged();
		Buffer buffer = openFiles(null, userDir, cfg.args);
		String splitConfig = null;
		if (cfg.restore && settingsDirectory != null && jEdit.getBooleanProperty("restore")
				&& (bufferCount == 0 || jEdit.getBooleanProperty("restore.cli")))
			splitConfig = restoreOpenFiles();
		if (bufferCount == 0 && cfg.gui)
			newFile(null);
		launchUI(buffer, splitConfig, cfg.gui);
	}
	//}}}

	//{{{ Helper methods
	private static void checkJavaVersion()
	{
		String javaVersion = System.getProperty("java.version");
		if (javaVersion.compareTo("1.3") < 0)
		{
			System.err.println("You are running Java version " + javaVersion + ".");
			System.err.println("jEdit requires Java 1.3 or later.");
			System.exit(1);
		}
	}

	private static Config parseCommandLine(String[] args)
	{
		Config cfg = new Config();
		cfg.args = new String[args.length];
		System.arraycopy(args, 0, cfg.args, 0, args.length);
		if (args.length >= 1 && args[0].length() == 1 && Character.isDigit(args[0].charAt(0)))
		{
			cfg.logLevel = Integer.parseInt(args[0]);
			cfg.args[0] = null;
		}
		boolean endOpts = false;
		cfg.settingsDir = MiscUtilities.constructPath(System.getProperty("user.home"), ".jedit");
		for (int i = 0; i < cfg.args.length; i++)
		{
			String arg = cfg.args[i];
			if (arg == null) continue;
			if (arg.isEmpty())
			{
				cfg.args[i] = null;
				continue;
			}
			if (arg.startsWith("-") && !endOpts)
			{
				switch (arg)
				{
					case "--": endOpts = true; break;
					case "-usage":
						version(); System.err.println(); usage(); System.exit(1); break;
					case "-version":
						version(); System.exit(1); break;
					case "-nosettings":
						cfg.settingsDir = null; break;
					default:
						if (arg.startsWith("-settings="))
							cfg.settingsDir = arg.substring(10);
						else if (arg.startsWith("-noserver"))
							cfg.portFile = null;
						else if (arg.equals("-server"))
							cfg.portFile = "server";
						else if (arg.startsWith("-server="))
							cfg.portFile = arg.substring(8);
						else if (arg.startsWith("-background"))
							background = true;
						else if (arg.equals("-nogui"))
							cfg.gui = false;
						else if (arg.equals("-norestore"))
							cfg.restore = false;
						else if (arg.equals("-noplugins"))
							cfg.noPlugins = true;
						else if (arg.equals("-nostartupscripts"))
							cfg.noStartupScripts = true;
						else if (arg.startsWith("-run="))
							cfg.scriptFile = arg.substring(5);
						else
						{
							System.err.println("Unknown option: " + arg);
							usage(); System.exit(1);
						}
						break;
				}
				cfg.args[i] = null;
			}
		}
		return cfg;
	}

	private static void tryConnectToServer(Config cfg, String userDir)
	{
		if (cfg.portFile == null) return;
		File pf = new File(cfg.portFile);
		if (!pf.exists()) return;
		try (BufferedReader in = new BufferedReader(new FileReader(pf)))
		{
			if (!"b".equals(in.readLine()))
				throw new Exception("Wrong port file format");
			int port = Integer.parseInt(in.readLine());
			int key = Integer.parseInt(in.readLine());
			Socket socket = new Socket(InetAddress.getByName("127.0.0.1"), port);
			DataOutputStream out = new DataOutputStream(socket.getOutputStream());
			out.writeInt(key);
			String script = makeServerScript(cfg.restore, cfg.args, cfg.scriptFile);
			out.writeUTF(script);
			out.close();
			System.exit(0);
		}
		catch (Exception e)
		{
			Log.log(Log.NOTICE, jEdit.class, "An error occurred while connecting to the jEdit server instance.");
			Log.log(Log.NOTICE, jEdit.class, "This probably means that jEdit crashed and/or exited abnormally the last time it was run.");
			Log.log(Log.NOTICE, jEdit.class, "If you don't know what this means, don't worry.");
			Log.log(Log.NOTICE, jEdit.class, e);
		}
	}

	private static void showSplashIfNeeded()
	{
		if (settingsDirectory != null && !new File(settingsDirectory, "nosplash").exists())
			GUIUtilities.showSplashScreen();
	}

	private static void initLogWriter()
	{
		Writer stream = null;
		if (settingsDirectory != null)
		{
			File dir = new File(settingsDirectory);
			if (!dir.exists()) dir.mkdirs();
			File macros = new File(settingsDirectory, "macros");
			if (!macros.exists()) macros.mkdir();
			String logPath = MiscUtilities.constructPath(settingsDirectory, "activity.log");
			backupSettingsFile(new File(logPath));
			try { stream = new BufferedWriter(new FileWriter(logPath)); }
			catch (Exception e) { e.printStackTrace(); }
		}
		Log.setLogWriter(stream);
	}

	private static void initServer(String portFile)
	{
		if (portFile != null)
		{
			server = new EditServer(portFile);
			if (!server.isOK()) server = null;
		}
		else if (background)
		{
			background = false;
			System.err.println("You cannot specify both the -background and -noserver switches");
		}
	}

	private static void initializeComponents()
	{
		initMisc();
		initSystemProperties();
		if (jEditHome != null) initSiteProperties();
		GUIUtilities.advanceSplashProgress();
		BeanShell.init();
		initUserProperties();
		initPLAF();
		if (OperatingSystem.hasJava14() && System.getProperty("jedit.nojava14") == null)
		{
			try
			{
				ClassLoader loader = jEdit.class.getClassLoader();
				Class<?> clazz = (loader != null) ? loader.loadClass("org.gjt.sp.jedit.Java14") : Class.forName("org.gjt.sp.jedit.Java14");
				clazz.getMethod("init", new Class[0]).invoke(null, new Object[0]);
			}
			catch (Exception e)
			{
				Log.log(Log.ERROR, jEdit.class, e);
				System.exit(1);
			}
		}
		initActions();
		initDockables();
		GUIUtilities.advanceSplashProgress();
		VFSManager.init();
		if (settingsDirectory != null) loadHistoryAndRecent();
		GUIUtilities.advanceSplashProgress();
		sortBuffers = getBooleanProperty("sortBuffers");
		sortByName = getBooleanProperty("sortByName");
		reloadModes();
		GUIUtilities.advanceSplashProgress();
		SearchAndReplace.load();
		GUIUtilities.advanceSplashProgress();
	}

	private static void loadHistoryAndRecent()
	{
		File history = new File(MiscUtilities.constructPath(settingsDirectory, "history"));
		if (history.exists()) historyModTime = history.lastModified();
		HistoryModel.loadHistory(history);
		File recent = new File(MiscUtilities.constructPath(settingsDirectory, "recent.xml"));
		if (recent.exists()) recentModTime = recent.lastModified();
		BufferHistory.load(recent);
	}

	private static void loadMacrosAndStartupScripts(Config cfg)
	{
		Macros.loadMacros();
		if (!cfg.noStartupScripts && jEditHome != null)
			runStartupScripts(new File(MiscUtilities.constructPath(jEditHome, "startup")));
		if (!cfg.noStartupScripts && settingsDirectory != null)
		{
			File dir = new File(MiscUtilities.constructPath(settingsDirectory, "startup"));
			if (!dir.exists()) dir.mkdirs();
			else runStartupScripts(dir);
		}
	}

	private static void runRunScript(String scriptFile, String userDir)
	{
		String path = MiscUtilities.constructPath(userDir, scriptFile);
		BeanShell.runScript(null, path, null, false);
	}

	private static void launchUI(Buffer buffer, String splitConfig, boolean gui)
	{
		final Buffer b = buffer;
		final String sc = splitConfig;
		final boolean g = gui;
		GUIUtilities.advanceSplashProgress();
		SwingUtilities.invokeLater(() ->
		{
			EditBus.send(new EditorStarted(null));
			if (g)
			{
				View view = (b != null) ? newView(null, b) : newView(null, sc);
			}
			VFSManager.start();
			if (server != null) server.start();
			GUIUtilities.hideSplashScreen();
			Log.log(Log.MESSAGE, jEdit.class, "Startup complete");
			if (pluginErrors != null) showPluginErrors();
			Toolkit.getDefaultToolkit();
		});
	}

	private static void showPluginErrors()
	{
		String caption = jEdit.getProperty("plugin-error.caption" + (pluginErrors.size() == 1 ? "-1" : ""), new Integer[]{ pluginErrors.size() });
		new ErrorListDialog(jEdit.getFirstView(), jEdit.getProperty("plugin-error.title"), caption, pluginErrors, true);
		pluginErrors.removeAllElements();
	}
	//}}}

	//{{{ Property methods (unchanged) }}
	// ... (the rest of the original class unchanged) ...

	//{{{ usage() method
	private static void usage()
	{
		System.out.println("Usage: jedit [<options>] [<files>]");
		System.out.println("	<file> +marker:<marker>: Positions caret at marker <marker>");
		System.out.println("	<file> +line:<line>: Positions caret at line number <line>");
		System.out.println("	--: End of options");
		System.out.println("	-background: Run in background mode");
		System.out.println("	-nogui: Only if running in background mode; don't open initial view");
		System.out.println("	-norestore: Don't restore previously open files");
		System.out.println("	-run=<script>: Run the specified BeanShell script");
		System.out.println("	-server: Read/write server info from/to $HOME/.jedit/server");
		System.out.println("	-server=<name>: Read/write server info from/to $HOME/.jedit/<name>");
		System.out.println("	-noserver: Don't start edit server");
		System.out.println("	-settings=<path>: Load user-specific settings from <path>");
		System.out.println("	-nosettings: Don't load user-specific settings");
		System.out.println("	-noplugins: Don't load any plugins");
		System.out.println("	-nostartupscripts: Don't run startup scripts");
		System.out.println("	-version: Print jEdit version and exit");
		System.out.println("	-usage: Print this message and exit");
		System.out.println();
		System.out.println("To set minimum activity log level, specify a number as the first command line parameter (1-9, 1 = print everything, 9 = fatal errors only)");
		System.out.println();
		System.out.println("Report bugs to Slava Pestov <slava@jedit.org>.");
	}
	//}}}

	//{{{ version() method
	private static void version()
	{
		System.out.println("jEdit " + getVersion());
	}
	//}}}

	//{{{ makeServerScript() method
	private static String makeServerScript(boolean restore, String[] args, String scriptFile)
	{
		StringBuilder script = new StringBuilder();
		String userDir = System.getProperty("user.dir");
		script.append("parent = \"").append(MiscUtilities.charsToEscapes(userDir)).append("\";\n");
		script.append("args = new String[").append(args.length).append("];\n");
		for (int i = 0; i < args.length; i++)
		{
			script.append("args[").append(i).append("] = ");
			if (args[i] == null) script.append("null");
			else script.append('"').append(MiscUtilities.charsToEscapes(args[i])).append('"');
			script.append(";\n");
		}
		script.append("EditServer.handleClient(").append(restore).append(",parent,args);\n");
		if (scriptFile != null)
		{
			scriptFile = MiscUtilities.constructPath(userDir, scriptFile);
			script.append("BeanShell.runScript(null,\"").append(MiscUtilities.charsToEscapes(scriptFile)).append("\",null,false);\n");
		}
		return script.toString();
	}
	//}}}

	//{{{ Private members (unchanged) }}
	private static String jEditHome;
	private static String settingsDirectory;
	private static long propsModTime, historyModTime, recentModTime;
	private static Properties defaultProps;
	private static Properties props;
	private static EditServer server;
	private static boolean background;
	private static Vector actionSets;
	private static ActionSet builtInActionSet;
	private static Vector pluginErrors;
	private static Vector jars;
	private static Vector modes;
	private static Vector recent;
	private static boolean saveCaret;
	private static InputHandler inputHandler;
	private static JEditMetalTheme theme;
	private static boolean sortBuffers;
	private static boolean sortByName;
	private static int bufferCount;
	private static Buffer buffersFirst;
	private static Buffer buffersLast;
	private static Object bufferListLock = new Object();
	private static int viewCount;
	private static View viewsFirst;
	private static View viewsLast;
	//}}}

	private jEdit() {}
	//{{{ Rest of original class (methods unchanged) }}
	// ... (All other methods from the original source remain unchanged) ...
	//}}}
}