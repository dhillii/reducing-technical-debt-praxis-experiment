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
import org.gjt.sp.jedit.browser.VFSBrowser;
import org.gjt.sp.jedit.msg.*;
import org.gjt.sp.jedit.gui.*;
import org.gjt.sp.jedit.io.*;
import org.gjt.sp.jedit.search.SearchAndReplace;
import org.gjt.sp.jedit.syntax.*;
import org.gjt.sp.jedit.textarea.*;
import org.gjt.sp.util.Log;

/**
 * The main class of the jEdit text editor.
 * @author Slava Pestov
 * @version $Id$
 */
public class jEdit
{
	//{{{ getVersion() method
	/**
	 * Returns the jEdit version as a human-readable string.
	 */
	public static String getVersion()
	{
		return MiscUtilities.buildToVersion(getBuild());
	} //}}}

	//{{{ getBuild() method
	/**
	 * Returns the internal version. MiscUtilities.compareStrings() can be used
	 * to compare different internal versions.
	 */
	public static String getBuild()
	{
		// (major).(minor).(<99 = preX, 99 = final).(bug fix)
		return "04.00.99.01";
	} //}}}

	//{{{ main() method
	/**
	 * The main method of the jEdit application.
	 * This should never be invoked directly.
	 * @param args The command line arguments
	 */
	public static void main(String[] args)
	{
		checkJavaVersion();
		Config cfg = parseCommandLine(args);
		initLog(cfg);
		tryConnectToServer(cfg, args);
		showSplashIfNeeded();
		initializeSettingsDirectory();
		Log.setLogWriter(cfg.logWriter);
		Log.log(Log.NOTICE, jEdit.class, "jEdit version " + getVersion());
		Log.log(Log.MESSAGE, jEdit.class, "Settings directory is " + settingsDirectory);
		initializeServer();
		initMisc();
		initSystemProperties();
		if (jEditHome != null) initSiteProperties();
		GUIUtilities.advanceSplashProgress();
		BeanShell.init();
		initUserProperties();
		initPLAF();
		initJava14Support();
		initActions();
		initDockables();
		GUIUtilities.advanceSplashProgress();
		VFSManager.init();
		if (!cfg.noPlugins) initPlugins();
		loadHistoryAndRecent();
		GUIUtilities.advanceSplashProgress();
		initializeBufferSorting();
		reloadModes();
		GUIUtilities.advanceSplashProgress();
		SearchAndReplace.load();
		GUIUtilities.advanceSplashProgress();
		startPlugins();
		loadMacrosAndStartupScripts(cfg);
		runScriptIfNeeded(cfg);
		propertiesChanged();
		GUIUtilities.advanceSplashProgress();
		Buffer buffer = openFiles(null, cfg.userDir, cfg.remainingArgs);
		prepareInitialView(buffer, cfg);
	} //}}}

	//{{{ Helper methods for main

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

	private static class Config
	{
		int level = Log.WARNING;
		String portFile = "server";
		boolean restore = true;
		boolean gui = true;
		boolean noPlugins = false;
		boolean noStartupScripts = false;
		String scriptFile = null;
		String userDir = System.getProperty("user.dir");
		String[] remainingArgs;
		Writer logWriter = null;
	}

	private static Config parseCommandLine(String[] args)
	{
		Config cfg = new Config();
		boolean endOpts = false;
		settingsDirectory = MiscUtilities.constructPath(
			System.getProperty("user.home"), ".jedit");

		for (int i = 0; i < args.length; i++)
		{
			String arg = args[i];
			if (arg == null) continue;
			if (arg.length() == 0) { args[i] = null; continue; }

			if (arg.startsWith("-") && !endOpts)
			{
				if (arg.equals("--"))
				{
					endOpts = true;
				}
				else if (arg.equals("-usage"))
				{
					version();
					System.err.println();
					usage();
					System.exit(1);
				}
				else if (arg.equals("-version"))
				{
					version();
					System.exit(1);
				}
				else if (arg.equals("-nosettings"))
				{
					settingsDirectory = null;
				}
				else if (arg.startsWith("-settings="))
				{
					settingsDirectory = arg.substring(10);
				}
				else if (arg.startsWith("-noserver"))
				{
					cfg.portFile = null;
				}
				else if (arg.equals("-server"))
				{
					cfg.portFile = "server";
				}
				else if (arg.startsWith("-server="))
				{
					cfg.portFile = arg.substring(8);
				}
				else if (arg.startsWith("-background"))
				{
					background = true;
				}
				else if (arg.equals("-nogui"))
				{
					cfg.gui = false;
				}
				else if (arg.equals("-norestore"))
				{
					cfg.restore = false;
				}
				else if (arg.equals("-noplugins"))
				{
					cfg.noPlugins = true;
				}
				else if (arg.equals("-nostartupscripts"))
				{
					cfg.noStartupScripts = true;
				}
				else if (arg.startsWith("-run="))
				{
					cfg.scriptFile = arg.substring(5);
				}
				else
				{
					System.err.println("Unknown option: " + arg);
					usage();
					System.exit(1);
				}
				args[i] = null;
			}
		}
		cfg.remainingArgs = args;
		return cfg;
	}

	private static void initLog(Config cfg)
	{
		if (cfg.remainingArgs.length >= 1)
		{
			String levelStr = cfg.remainingArgs[0];
			if (levelStr != null && levelStr.length() == 1 && Character.isDigit(levelStr.charAt(0)))
			{
				cfg.level = Integer.parseInt(levelStr);
				cfg.remainingArgs[0] = null;
			}
		}
		Log.init(true, cfg.level);
	}

	private static void tryConnectToServer(Config cfg, String[] args)
	{
		if (settingsDirectory != null && cfg.portFile != null)
			cfg.portFile = MiscUtilities.constructPath(settingsDirectory, cfg.portFile);
		else
			cfg.portFile = null;

		if (cfg.portFile != null && new File(cfg.portFile).exists())
		{
			try
			{
				BufferedReader in = new BufferedReader(new FileReader(cfg.portFile));
				String check = in.readLine();
				if (!check.equals("b"))
					throw new Exception("Wrong port file format");
				int port = Integer.parseInt(in.readLine());
				int key = Integer.parseInt(in.readLine());
				in.close();

				Socket socket = new Socket(InetAddress.getByName("127.0.0.1"), port);
				DataOutputStream out = new DataOutputStream(socket.getOutputStream());
				out.writeInt(key);
				String script = makeServerScript(cfg.restore, args, cfg.scriptFile);
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
	}

	private static void showSplashIfNeeded()
	{
		if (!new File(settingsDirectory, "nosplash").exists())
			GUIUtilities.showSplashScreen();
	}

	private static void initializeSettingsDirectory()
	{
		Writer stream;
		if (settingsDirectory != null)
		{
			File dir = new File(settingsDirectory);
			if (!dir.exists()) dir.mkdirs();
			File macrosDir = new File(settingsDirectory, "macros");
			if (!macrosDir.exists()) macrosDir.mkdir();

			String logPath = MiscUtilities.constructPath(settingsDirectory, "activity.log");
			backupSettingsFile(new File(logPath));

			try
			{
				stream = new BufferedWriter(new FileWriter(logPath));
			}
			catch (Exception e)
			{
				e.printStackTrace();
				stream = null;
			}
		}
		else
		{
			stream = null;
		}
		Log.setLogWriter(stream);
	}

	private static void initializeServer()
	{
		if (portFile != null)
		{
			server = new EditServer(portFile);
			if (!server.isOK()) server = null;
		}
		else
		{
			if (background)
			{
				background = false;
				System.err.println("You cannot specify both the -background and -noserver switches");
			}
		}
	}

	private static void initJava14Support()
	{
		if (OperatingSystem.hasJava14() && System.getProperty("jedit.nojava14") == null)
		{
			try
			{
				ClassLoader loader = jEdit.class.getClassLoader();
				Class clazz = (loader != null) ? loader.loadClass("org.gjt.sp.jedit.Java14") : Class.forName("org.gjt.sp.jedit.Java14");
				java.lang.reflect.Method meth = clazz.getMethod("init", new Class[0]);
				meth.invoke(null, new Object[0]);
			}
			catch (Exception e)
			{
				Log.log(Log.ERROR, jEdit.class, e);
				System.exit(1);
			}
		}
	}

	private static void loadHistoryAndRecent()
	{
		if (settingsDirectory != null)
		{
			File history = new File(MiscUtilities.constructPath(settingsDirectory, "history"));
			if (history.exists()) historyModTime = history.lastModified();
			HistoryModel.loadHistory(history);

			File recent = new File(MiscUtilities.constructPath(settingsDirectory, "recent.xml"));
			if (recent.exists()) recentModTime = recent.lastModified();
			BufferHistory.load(recent);
		}
	}

	private static void initializeBufferSorting()
	{
		sortBuffers = getBooleanProperty("sortBuffers");
		sortByName = getBooleanProperty("sortByName");
	}

	private static void startPlugins()
	{
		for (int i = 0; i < jars.size(); i++)
			((EditPlugin.JAR) jars.elementAt(i)).getClassLoader().startAllPlugins();
	}

	private static void loadMacrosAndStartupScripts(Config cfg)
	{
		Macros.loadMacros();

		if (!cfg.noStartupScripts && jEditHome != null)
		{
			String path = MiscUtilities.constructPath(jEditHome, "startup");
			File file = new File(path);
			if (file.exists()) runStartupScripts(file);
		}

		if (!cfg.noStartupScripts && settingsDirectory != null)
		{
			String path = MiscUtilities.constructPath(settingsDirectory, "startup");
			File file = new File(path);
			if (!file.exists()) file.mkdirs();
			else runStartupScripts(file);
		}
	}

	private static void runScriptIfNeeded(Config cfg)
	{
		if (cfg.scriptFile != null)
		{
			String scriptPath = MiscUtilities.constructPath(cfg.userDir, cfg.scriptFile);
			BeanShell.runScript(null, scriptPath, null, false);
		}
	}

	private static void prepareInitialView(Buffer buffer, Config cfg)
	{
		String splitConfig = null;
		if (cfg.restore && settingsDirectory != null && getBooleanProperty("restore")
			&& (bufferCount == 0 || getBooleanProperty("restore.cli")))
		{
			splitConfig = restoreOpenFiles();
		}
		if (bufferCount == 0 && cfg.gui) newFile(null);
		final Buffer _buffer = buffer;
		final String _splitConfig = splitConfig;
		final boolean _gui = cfg.gui;
		GUIUtilities.advanceSplashProgress();
		SwingUtilities.invokeLater(new Runnable()
		{
			public void run()
			{
				EditBus.send(new EditorStarted(null));
				if (_gui)
				{
					View view;
					if (_buffer != null) view = newView(null, _buffer);
					else view = newView(null, _splitConfig);
				}
				VFSManager.start();
				if (server != null) server.start();
				GUIUtilities.hideSplashScreen();
				Log.log(Log.MESSAGE, jEdit.class, "Startup complete");
				if (pluginErrors != null)
				{
					String caption = jEdit.getProperty(
						"plugin-error.caption" + (pluginErrors.size() == 1 ? "-1" : ""),
						new Integer[] { new Integer(pluginErrors.size()) });
					new ErrorListDialog(jEdit.getFirstView(),
						jEdit.getProperty("plugin-error.title"),
						caption, pluginErrors, true);
					pluginErrors.removeAllElements();
				}
				Toolkit.getDefaultToolkit();
			}
		});
	} //}}}

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
	} //}}}

	//{{{ version() method
	private static void version()
	{
		System.out.println("jEdit " + getVersion());
	} //}}}

	//{{{ makeServerScript() method
	/**
	 * Creates a BeanShell script that can be sent to a running edit server.
	 */
	private static String makeServerScript(boolean restore,
		String[] args, String scriptFile)
	{
		StringBuffer script = new StringBuffer();
		String userDir = System.getProperty("user.dir");
		script.append("parent = \"");
		script.append(MiscUtilities.charsToEscapes(userDir));
		script.append("\";\n");
		script.append("args = new String[");
		script.append(args.length);
		script.append("];\n");
		for (int i = 0; i < args.length; i++)
		{
			script.append("args[");
			script.append(i);
			script.append("] = ");
			if (args[i] == null) script.append("null");
			else
			{
				script.append('"');
				script.append(MiscUtilities.charsToEscapes(args[i]));
				script.append('"');
			}
			script.append(";\n");
		}
		script.append("EditServer.handleClient(" + restore + ",parent,args);\n");
		if (scriptFile != null)
		{
			scriptFile = MiscUtilities.constructPath(userDir, scriptFile);
			script.append("BeanShell.runScript(null,\""
				+ MiscUtilities.charsToEscapes(scriptFile)
				+ "\",null,false);\n");
		}
		return script.toString();
	} //}}}

	//{{{ initMisc() method
	/**
	 * Initialise various objects, register protocol handlers.
	 */
	private static void initMisc()
	{
		System.getProperties().put("java.protocol.handler.pkgs",
			"org.gjt.sp.jedit.proto|" + System.getProperty("java.protocol.handler.pkgs", ""));
		String userAgent = "jEdit/" + getVersion()
			+ " (Java " + System.getProperty("java.version")
			+ ". " + System.getProperty("java.vendor")
			+ "; " + System.getProperty("os.arch") + ")";
		System.getProperties().put("http.agent", userAgent);
		inputHandler = new DefaultInputHandler(null);
		jEditHome = System.getProperty("jedit.home");
		if (jEditHome == null)
		{
			String classpath = System.getProperty("java.class.path");
			int index = classpath.toLowerCase().indexOf("jedit.jar");
			int start = classpath.lastIndexOf(File.pathSeparator, index) + 1;
			if (classpath.equalsIgnoreCase("jedit.jar"))
				jEditHome = System.getProperty("user.dir");
			else if (index > start)
				jEditHome = classpath.substring(start, index - 1);
			else
			{
				jEditHome = System.getProperty("user.dir");
				Log.log(Log.WARNING, jEdit.class, "jedit.jar not in class path!");
				Log.log(Log.WARNING, jEdit.class, "Assuming jEdit is installed in " + jEditHome + ".");
				Log.log(Log.WARNING, jEdit.class, "Override with jedit.home system property.");
			}
		}
		Log.log(Log.MESSAGE, jEdit.class, "jEdit home directory is " + jEditHome);
		jars = new Vector();
		EditBus.addToBus(new SettingsReloader());
		SwingUtilities.invokeLater(new Runnable()
		{
			public void run()
			{
				Thread.currentThread().setContextClassLoader(new JARClassLoader());
			}
		});
	} //}}}

	//{{{ initSystemProperties() method
	/**
	 * Load system properties.
	 */
	private static void initSystemProperties()
	{
		defaultProps = props = new Properties();
		try
		{
			loadProps(jEdit.class.getResourceAsStream("/org/gjt/sp/jedit/jedit.props"), true);
			loadProps(jEdit.class.getResourceAsStream("/org/gjt/sp/jedit/jedit_gui.props"), true);
			loadProps(jEdit.class.getResourceAsStream("/org/gjt/sp/jedit/jedit_keys.props"), true);
		}
		catch (Exception e)
		{
			Log.log(Log.ERROR, jEdit.class, "Error while loading system properties!");
			Log.log(Log.ERROR, jEdit.class, "One of the following property files could not be loaded:\n- jedit.props\n- jedit_gui.props\n- jedit_keys.props\njedit.jar is probably corrupt.");
			Log.log(Log.ERROR, jEdit.class, e);
			System.exit(1);
		}
	} //}}}

	//{{{ initSiteProperties() method
	/**
	 * Load site properties.
	 */
	private static void initSiteProperties()
	{
		String siteSettingsDirectory = MiscUtilities.constructPath(jEditHome, "properties");
		File siteSettings = new File(siteSettingsDirectory);
		if (!(siteSettings.exists() && siteSettings.isDirectory())) return;
		String[] snippets = siteSettings.list();
		if (snippets == null) return;
		MiscUtilities.quicksort(snippets, new MiscUtilities.StringICaseCompare());
		for (int i = 0; i < snippets.length; ++i)
		{
			String snippet = snippets[i];
			if (!snippet.toLowerCase().endsWith(".props")) continue;
			try
			{
				String path = MiscUtilities.constructPath(siteSettingsDirectory, snippet);
				Log.log(Log.DEBUG, jEdit.class, "Loading site snippet: " + path);
				loadProps(new FileInputStream(new File(path)), true);
			}
			catch (FileNotFoundException fnf) { Log.log(Log.DEBUG, jEdit.class, fnf); }
			catch (IOException e)
			{
				Log.log(Log.ERROR, jEdit.class, "Cannot load site snippet " + snippet);
				Log.log(Log.ERROR, jEdit.class, e);
			}
		}
	} //}}}

	//{{{ initActions() method
	/**
	 * Load actions.
	 */
	private static void initActions()
	{
		actionSets = new Vector();
		Reader in = new BufferedReader(new InputStreamReader(jEdit.class.getResourceAsStream("actions.xml")));
		builtInActionSet = new ActionSet(jEdit.getProperty("action-set.jEdit"));
		if (!loadActions("actions.xml", in, builtInActionSet)) System.exit(1);
		addActionSet(builtInActionSet);
	} //}}}

	//{{{ initDockables() method
	/**
	 * Load info on jEdit's built-in dockable windows.
	 */
	private static void initDockables()
	{
		Reader in = new BufferedReader(new InputStreamReader(jEdit.class.getResourceAsStream("dockables.xml")));
		if (!DockableWindowManager.loadDockableWindows("dockables.xml", in, builtInActionSet)) System.exit(1);
	} //}}}

	//{{{ initPlugins() method
	/**
	 * Loads plugins.
	 */
	private static void initPlugins()
	{
		if (jEditHome != null) loadPlugins(MiscUtilities.constructPath(jEditHome, "jars"));
		if (settingsDirectory != null)
		{
			File jarsDirectory = new File(settingsDirectory, "jars");
			if (!jarsDirectory.exists()) jarsDirectory.mkdir();
			loadPlugins(jarsDirectory.getPath());
		}
	} //}}}

	//{{{ initUserProperties() method
	/**
	 * Loads user properties.
	 */
	private static void initUserProperties()
	{
		props = new Properties(defaultProps);
		if (settingsDirectory != null)
		{
			File file = new File(MiscUtilities.constructPath(settingsDirectory, "properties"));
			propsModTime = file.lastModified();
			try
			{
				loadProps(new FileInputStream(file), false);
			}
			catch (FileNotFoundException fnf) { Log.log(Log.DEBUG, jEdit.class, fnf); }
			catch (IOException e) { Log.log(Log.ERROR, jEdit.class, e); }
		}
	} //}}}

	//{{{ initPLAF() method
	/**
	 * Sets the Swing look and feel.
	 */
	private static void initPLAF()
	{
		theme = new JEditMetalTheme();
		theme.propertiesChanged();
		MetalLookAndFeel.setCurrentTheme(theme);
		try
		{
			String lf = getProperty("lookAndFeel");
			if (lf != null && lf.length() != 0) UIManager.setLookAndFeel(lf);
		}
		catch (Exception e) { Log.log(Log.ERROR, jEdit.class, e); }
		UIDefaults defaults = UIManager.getDefaults();
		if (jEdit.getBooleanProperty("textColors"))
		{
			Color background = new javax.swing.plaf.ColorUIResource(jEdit.getColorProperty("view.bgColor"));
			Color foreground = new javax.swing.plaf.ColorUIResource(jEdit.getColorProperty("view.fgColor"));
			Color caretColor = new javax.swing.plaf.ColorUIResource(jEdit.getColorProperty("view.caretColor"));
			Color selectionColor = new javax.swing.plaf.ColorUIResource(jEdit.getColorProperty("view.selectionColor"));
			String[] prefixes = { "TextField", "TextArea", "List", "Table" };
			for (int i = 0; i < prefixes.length; i++)
			{
				String prefix = prefixes[i];
				defaults.put(prefix + ".disabledBackground", background);
				defaults.put(prefix + ".background", background);
				defaults.put(prefix + ".disabledForeground", foreground);
				defaults.put(prefix + ".foreground", foreground);
				defaults.put(prefix + ".caretForeground", caretColor);
				defaults.put(prefix + ".selectionForeground", foreground);
				defaults.put(prefix + ".selectionBackground", selectionColor);
			}
			defaults.put("Tree.background", background);
			defaults.put("Tree.foreground", foreground);
			defaults.put("Tree.textBackground", background);
			defaults.put("Tree.textForeground", foreground);
			defaults.put("Tree.selectionForeground", foreground);
			defaults.put("Tree.selectionBackground", selectionColor);
		}
		defaults.remove("SplitPane.border");
		defaults.remove("SplitPaneDivider.border");
	} //}}}

	//{{{ loadPlugins() method
	/**
	 * Loads all plugins in a directory.
	 * @param directory The directory
	 */
	private static void loadPlugins(String directory)
	{
		Log.log(Log.NOTICE, jEdit.class, "Loading plugins from " + directory);
		File file = new File(directory);
		if (!(file.exists() && file.isDirectory())) return;
		String[] plugins = file.list();
		if (plugins == null) return;
		MiscUtilities.quicksort(plugins, new MiscUtilities.StringICaseCompare());
		for (int i = 0; i < plugins.length; i++)
		{
			String plugin = plugins[i];
			if (!plugin.toLowerCase().endsWith(".jar")) continue;
			String path = MiscUtilities.constructPath(directory, plugin);
			if (plugin.equals("EditBuddy.jar") || plugin.equals("PluginManager.jar")
				|| plugin.equals("Firewall.jar") || plugin.equals("Tidy.jar"))
			{
				pluginError(path, "plugin-error.obsolete", null);
				continue;
			}
			try
			{
				Log.log(Log.DEBUG, jEdit.class, "Scanning JAR file: " + path);
				new JARClassLoader(path);
			}
			catch (IOException io)
			{
				Log.log(Log.ERROR, jEdit.class, "Cannot load plugin " + plugin);
				Log.log(Log.ERROR, jEdit.class, io);
				String[] args = { io.toString() };
				pluginError(path, "plugin-error.load-error", args);
			}
		}
	} //}}}

	//{{{ initKeyBindings() method
	/**
	 * Loads all key bindings from the properties.
	 * @since 3.1pre1
	 */
	private static void initKeyBindings()
	{
		inputHandler.removeAllKeyBindings();
		EditAction[] actions = getActions();
		for (int i = 0; i < actions.length; i++)
		{
			EditAction action = actions[i];
			String shortcut1 = jEdit.getProperty(action.getName() + ".shortcut");
			if (shortcut1 != null) inputHandler.addKeyBinding(shortcut1, action);
			String shortcut2 = jEdit.getProperty(action.getName() + ".shortcut2");
			if (shortcut2 != null) inputHandler.addKeyBinding(shortcut2, action);
		}
	} //}}}

	//{{{ Private members

	//{{{ Static variables
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

	// buffer link list
	private static boolean sortBuffers;
	private static boolean sortByName;
	private static int bufferCount;
	private static Buffer buffersFirst;
	private static Buffer buffersLast;

	// makes openTemporary() thread-safe
	private static Object bufferListLock = new Object();

	// view link list
	private static int viewCount;
	private static View viewsFirst;
	private static View viewsLast;
	//}}}

	private jEdit() {}

	//{{{ loadProps() method
	/* package-private */ static void loadProps(InputStream in, boolean def) throws IOException
	{
		in = new BufferedInputStream(in);
		if (def) defaultProps.load(in);
		else props.load(in);
		in.close();
	} //}}}

	//{{{ loadActions() method
	static boolean loadActions(String path, Reader in, ActionSet actionSet)
	{
		try
		{
			Log.log(Log.DEBUG, jEdit.class, "Loading actions from " + path);
			ActionListHandler ah = new ActionListHandler(path, actionSet);
			XmlParser parser = new XmlParser();
			parser.setHandler(ah);
			parser.parse(null, null, in);
			return true;
		}
		catch (XmlException xe)
		{
			int line = xe.getLine();
			String message = xe.getMessage();
			Log.log(Log.ERROR, jEdit.class, path + ":" + line + ": " + message);
		}
		catch (Exception e)
		{
			Log.log(Log.ERROR, jEdit.class, e);
		}
		return false;
	} //}}}

	//{{{ pluginError() method
	static void pluginError(final String path, String messageProp, Object[] args)
	{
		if (pluginErrors == null) pluginErrors = new Vector();
		pluginErrors.addElement(new ErrorListDialog.ErrorEntry(path, messageProp, args));
	} //}}}

	//{{{ backupSettingsFile() method
	/**
	 * Backs up the specified file in the settings directory.
	 * You should call this on any settings files your plugin writes.
	 * @param file The file
	 * @since jEdit 4.0pre1
	 */
	public static void backupSettingsFile(File file)
	{
		if (settingsDirectory == null) return;
		String backupDir = MiscUtilities.constructPath(settingsDirectory, "settings-backup");
		File dir = new File(backupDir);
		if (!dir.exists()) dir.mkdirs();
		MiscUtilities.saveBackup(file, 5, null, "~", backupDir);
	} //}}}

	//{{{ Other existing methods omitted for brevity (properties, plugins, buffers, views, etc.) }}
	//}}}
}