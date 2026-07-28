/*
 * jEdit.java - Main class of the jEdit editor
 * :tabSize=8:indentSize=8:noTabs=false:
 * :folding=explicit:collapseFolds=1:
 *
 * Copyright (C) 1998, 1999, 2000, 2001, 2002 Slava Pestov
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA  02111-1307, USA.
 */

package org.gjt.sp.jedit;

//{{{ Imports
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
//}}}

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
		int logLevel = parseCommandLine(args);
		initLog(logLevel);
		initPortFilePath();
		tryConnectToServer(args);
		showSplashIfNeeded();
		initializeSettingsDirectory();
		initializeServer();
		initializeComponents();
		startPlugins();
		loadMacrosAndStartupScripts();
		runUserScript(args);
		propertiesChanged();
		openFilesAndCreateView(args);
	} //}}}

	/** Checks that the running JVM meets the minimum version requirement. */
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

	/** Parses command line options and updates static fields accordingly. */
	private static int parseCommandLine(String[] args)
	{
		int level = Log.WARNING;
		if (args.length >= 1)
		{
			String levelStr = args[0];
			if (levelStr.length() == 1 && Character.isDigit(levelStr.charAt(0)))
			{
				level = Integer.parseInt(levelStr);
				args[0] = null;
			}
		}

		boolean endOpts = false;
		settingsDirectory = MiscUtilities.constructPath(
			System.getProperty("user.home"), ".jedit");
		portFile = "server";
		restore = true;
		gui = true;
		noPlugins = false;
		noStartupScripts = false;
		userDir = System.getProperty("user.dir");
		scriptFile = null;

		for (int i = 0; i < args.length; i++)
		{
			String arg = args[i];
			if (arg == null)
				continue;
			else if (arg.length() == 0)
				args[i] = null;
			else if (arg.startsWith("-") && !endOpts)
			{
				if (arg.equals("--"))
					endOpts = true;
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
					settingsDirectory = null;
				else if (arg.startsWith("-settings="))
					settingsDirectory = arg.substring(10);
				else if (arg.startsWith("-noserver"))
					portFile = null;
				else if (arg.equals("-server"))
					portFile = "server";
				else if (arg.startsWith("-server="))
					portFile = arg.substring(8);
				else if (arg.startsWith("-background"))
					background = true;
				else if (arg.equals("-nogui"))
					gui = false;
				else if (arg.equals("-norestore"))
					restore = false;
				else if (arg.equals("-noplugins"))
					noPlugins = true;
				else if (arg.equals("-nostartupscripts"))
					noStartupScripts = true;
				else if (arg.startsWith("-run="))
					scriptFile = arg.substring(5);
				else
				{
					System.err.println("Unknown option: " + arg);
					usage();
					System.exit(1);
				}
				args[i] = null;
			}
		}
		return level;
	}

	/** Initializes the logging system. */
	private static void initLog(int level)
	{
		Log.init(true, level);
	}

	/** Adjusts the port file path based on the settings directory. */
	private static void initPortFilePath()
	{
		if (settingsDirectory != null && portFile != null)
			portFile = MiscUtilities.constructPath(settingsDirectory, portFile);
		else
			portFile = null;
	}

	/** Attempts to connect to an already running jEdit instance. */
	private static void tryConnectToServer(String[] args)
	{
		if (portFile != null && new File(portFile).exists())
		{
			try
			{
				BufferedReader in = new BufferedReader(new FileReader(portFile));
				String check = in.readLine();
				if (!check.equals("b"))
					throw new Exception("Wrong port file format");
				int port = Integer.parseInt(in.readLine());
				int key = Integer.parseInt(in.readLine());
				in.close();

				Socket socket = new Socket(InetAddress.getByName("127.0.0.1"), port);
				DataOutputStream out = new DataOutputStream(socket.getOutputStream());
				out.writeInt(key);
				String script = makeServerScript(restore, args, scriptFile);
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

	/** Shows the splash screen unless a 'nosplash' file exists. */
	private static void showSplashIfNeeded()
	{
		if (!new File(settingsDirectory, "nosplash").exists())
			GUIUtilities.showSplashScreen();
	}

	/** Initializes the user settings directory and log writer. */
	private static void initializeSettingsDirectory()
	{
		Writer stream;
		if (settingsDirectory != null)
		{
			File dir = new File(settingsDirectory);
			if (!dir.exists())
				dir.mkdirs();
			File macrosDir = new File(settingsDirectory, "macros");
			if (!macrosDir.exists())
				macrosDir.mkdir();

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
			stream = null;

		Log.setLogWriter(stream);
		Log.log(Log.NOTICE, jEdit.class, "jEdit version " + getVersion());
		Log.log(Log.MESSAGE, jEdit.class, "Settings directory is " + settingsDirectory);
	}

	/** Initializes the edit server if required. */
	private static void initializeServer()
	{
		if (portFile != null)
		{
			server = new EditServer(portFile);
			if (!server.isOK())
				server = null;
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

	/** Performs the bulk of component initialization. */
	private static void initializeComponents()
	{
		initMisc();
		initSystemProperties();
		if (jEditHome != null)
			initSiteProperties();
		GUIUtilities.advanceSplashProgress();

		BeanShell.init();

		initUserProperties();
		initPLAF();

		if (OperatingSystem.hasJava14() && System.getProperty("jedit.nojava14") == null)
		{
			try
			{
				ClassLoader loader = jEdit.class.getClassLoader();
				Class clazz = (loader != null) ? loader.loadClass("org.gjt.sp.jedit.Java14")
						: Class.forName("org.gjt.sp.jedit.Java14");
				java.lang.reflect.Method meth = clazz.getMethod("init", new Class[0]);
				meth.invoke(null, new Object[0]);
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

		if (!noPlugins)
			initPlugins();

		if (settingsDirectory != null)
		{
			File history = new File(MiscUtilities.constructPath(settingsDirectory, "history"));
			if (history.exists())
				historyModTime = history.lastModified();
			HistoryModel.loadHistory(history);

			File recent = new File(MiscUtilities.constructPath(settingsDirectory, "recent.xml"));
			if (recent.exists())
				recentModTime = recent.lastModified();
			BufferHistory.load(recent);
		}

		GUIUtilities.advanceSplashProgress();

		sortBuffers = getBooleanProperty("sortBuffers");
		sortByName = getBooleanProperty("sortByName");

		reloadModes();

		GUIUtilities.advanceSplashProgress();

		SearchAndReplace.load();

		GUIUtilities.advanceSplashProgress();
	}

	/** Starts all loaded plugins. */
	private static void startPlugins()
	{
		for (int i = 0; i < jars.size(); i++)
			((EditPlugin.JAR) jars.elementAt(i)).getClassLoader().startAllPlugins();
	}

	/** Loads macros and runs startup scripts. */
	private static void loadMacrosAndStartupScripts()
	{
		Macros.loadMacros();

		if (!noStartupScripts && jEditHome != null)
		{
			String path = MiscUtilities.constructPath(jEditHome, "startup");
			File file = new File(path);
			if (file.exists())
				runStartupScripts(file);
		}

		if (!noStartupScripts && settingsDirectory != null)
		{
			String path = MiscUtilities.constructPath(settingsDirectory, "startup");
			File file = new File(path);
			if (!file.exists())
				file.mkdirs();
			else
				runStartupScripts(file);
		}
	}

	/** Executes a user‑specified script if the -run option was used. */
	private static void runUserScript(String[] args)
	{
		if (scriptFile != null)
		{
			scriptFile = MiscUtilities.constructPath(userDir, scriptFile);
			BeanShell.runScript(null, scriptFile, null, false);
		}
	}

	/** Opens files from the command line and creates the initial view. */
	private static void openFilesAndCreateView(String[] args)
	{
		Buffer buffer = openFiles(null, userDir, args);
		if (buffer != null)
			gui = true;

		String splitConfig = null;
		if (restore && settingsDirectory != null && jEdit.getBooleanProperty("restore")
				&& (bufferCount == 0 || jEdit.getBooleanProperty("restore.cli")))
			splitConfig = restoreOpenFiles();

		if (bufferCount == 0 && gui)
			newFile(null);

		final Buffer _buffer = buffer;
		final String _splitConfig = splitConfig;
		final boolean _gui = gui;

		GUIUtilities.advanceSplashProgress();

		SwingUtilities.invokeLater(new Runnable()
		{
			public void run()
			{
				EditBus.send(new EditorStarted(null));

				if (_gui)
				{
					View view;
					if (_buffer != null)
						view = newView(null, _buffer);
					else
						view = newView(null, _splitConfig);
				}

				VFSManager.start();

				if (server != null)
					server.start();

				GUIUtilities.hideSplashScreen();

				Log.log(Log.MESSAGE, jEdit.class, "Startup complete");

				if (pluginErrors != null)
				{
					String caption = jEdit.getProperty(
						"plugin-error.caption" + (pluginErrors.size() == 1 ? "-1" : ""),
						new Integer[] { new Integer(pluginErrors.size()) });

					new ErrorListDialog(
						jEdit.getFirstView(),
						jEdit.getProperty("plugin-error.title"),
						caption, pluginErrors, true);
					pluginErrors.removeAllElements();
				}

				Toolkit.getDefaultToolkit();
			}
		});
	}

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

			if (args[i] == null)
				script.append("null");
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
		// Add our protocols to java.net.URL's list
		System.getProperties().put("java.protocol.handler.pkgs",
			"org.gjt.sp.jedit.proto|" +
			System.getProperty("java.protocol.handler.pkgs",""));

		// Set the User-Agent string used by the java.net HTTP handler
		String userAgent = "jEdit/" + getVersion()
			+ " (Java " + System.getProperty("java.version")
			+ ". " + System.getProperty("java.vendor")
			+ "; " + System.getProperty("os.arch") + ")";
		System.getProperties().put("http.agent", userAgent);

		inputHandler = new DefaultInputHandler(null);

		/* Determine installation directory.
		 * If the jedit.home property is set, use that.
		 * Then, look for jedit.jar in the classpath.
		 * If that fails, assume this is the web start version. */
		jEditHome = System.getProperty("jedit.home");
		if (jEditHome == null)
		{
			String classpath = System.getProperty("java.class.path");
			int index = classpath.toLowerCase().indexOf("jedit.jar");
			int start = classpath.lastIndexOf(File.pathSeparator, index) + 1;
			if (classpath.equalsIgnoreCase("jedit.jar"))
			{
				jEditHome = System.getProperty("user.dir");
			}
			else if (index > start)
			{
				jEditHome = classpath.substring(start, index - 1);
			}
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
			loadProps(jEdit.class.getResourceAsStream(
				"/org/gjt/sp/jedit/jedit.props"), true);
			loadProps(jEdit.class.getResourceAsStream(
				"/org/gjt/sp/jedit/jedit_gui.props"), true);
			loadProps(jEdit.class.getResourceAsStream(
				"/org/gjt/sp/jedit/jedit_keys.props"), true);
		}
		catch (Exception e)
		{
			Log.log(Log.ERROR, jEdit.class, "Error while loading system properties!");
			Log.log(Log.ERROR, jEdit.class, "One of the following property files could not be loaded:\n"
				+ "- jedit.props\n"
				+ "- jedit_gui.props\n"
				+ "- jedit_keys.props\n"
				+ "jedit.jar is probably corrupt.");
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

		if (!(siteSettings.exists() && siteSettings.isDirectory()))
			return;

		String[] snippets = siteSettings.list();
		if (snippets == null)
			return;

		MiscUtilities.quicksort(snippets, new MiscUtilities.StringICaseCompare());

		for (int i = 0; i < snippets.length; ++i)
		{
			String snippet = snippets[i];
			if (!snippet.toLowerCase().endsWith(".props"))
				continue;

			try
			{
				String path = MiscUtilities.constructPath(siteSettingsDirectory, snippet);
				Log.log(Log.DEBUG, jEdit.class, "Loading site snippet: " + path);
				loadProps(new FileInputStream(new File(path)), true);
			}
			catch (FileNotFoundException fnf)
			{
				Log.log(Log.DEBUG, jEdit.class, fnf);
			}
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

		Reader in = new BufferedReader(new InputStreamReader(
			jEdit.class.getResourceAsStream("actions.xml")));
		builtInActionSet = new ActionSet(jEdit.getProperty("action-set.jEdit"));
		if (!loadActions("actions.xml", in, builtInActionSet))
			System.exit(1);
		addActionSet(builtInActionSet);
	} //}}}

	//{{{ initDockables() method
	/**
	 * Load info on jEdit's built-in dockable windows.
	 */
	private static void initDockables()
	{
		Reader in = new BufferedReader(new InputStreamReader(
			jEdit.class.getResourceAsStream("dockables.xml")));
		if (!DockableWindowManager.loadDockableWindows("dockables.xml", in, builtInActionSet))
			System.exit(1);
	} //}}}

	//{{{ initPlugins() method
	/**
	 * Loads plugins.
	 */
	private static void initPlugins()
	{
		if (jEditHome != null)
			loadPlugins(MiscUtilities.constructPath(jEditHome, "jars"));

		if (settingsDirectory != null)
		{
			File jarsDirectory = new File(settingsDirectory, "jars");
			if (!jarsDirectory.exists())
				jarsDirectory.mkdir();
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
			catch (FileNotFoundException fnf)
			{
				Log.log(Log.DEBUG, jEdit.class, fnf);
			}
			catch (IOException e)
			{
				Log.log(Log.ERROR, jEdit.class, e);
			}
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
			if (lf != null && lf.length() != 0)
				UIManager.setLookAndFeel(lf);
		}
		catch (Exception e)
		{
			Log.log(Log.ERROR, jEdit.class, e);
		}

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

	//{{{ runStartupScripts() method
	/**
	 * Runs scripts in the site startup directory, and user startup directory.
	 */
	private static void runStartupScripts(File directory)
	{
		if (!directory.isDirectory())
			return;

		String[] snippets = directory.list();
		if (snippets == null)
			return;

		MiscUtilities.quicksort(snippets, new MiscUtilities.StringICaseCompare());

		for (int i = 0; i < snippets.length; ++i)
		{
			String snippet = snippets[i];
			if (!snippet.toLowerCase().endsWith(".bsh"))
				continue;

			String path = new File(directory, snippet).getPath();
			BeanShell.runScript(null, path, null, false);
		}
	} //}}}

	//{{{ initProxy() method
	private static void initProxy()
	{
		boolean enabled = jEdit.getBooleanProperty("firewall.enabled");
		if (!enabled)
		{
			Log.log(Log.DEBUG, jEdit.class, "HTTP proxy disabled");
			System.getProperties().remove("proxySet");
			System.getProperties().remove("proxyHost");
			System.getProperties().remove("proxyPort");
			System.getProperties().remove("http.proxyHost");
			System.getProperties().remove("http.proxyPort");
			System.getProperties().remove("http.nonProxyHosts");
			Authenticator.setDefault(null);
		}
		else
		{
			String host = jEdit.getProperty("firewall.host");
			if (host == null)
				return;

			System.setProperty("http.proxyHost", host);
			Log.log(Log.DEBUG, jEdit.class, "HTTP proxy enabled: " + host);
			String port = jEdit.getProperty("firewall.port");
			if (port != null)
				System.setProperty("http.proxyPort", port);

			String nonProxyHosts = jEdit.getProperty("firewall.nonProxyHosts");
			if (nonProxyHosts != null)
				System.setProperty("http.nonProxyHosts", nonProxyHosts);

			String username = jEdit.getProperty("firewall.user");
			String password = jEdit.getProperty("firewall.password");
			if (password == null)
				password = "";

			if (username == null || username.length() == 0)
			{
				Log.log(Log.DEBUG, jEdit.class, "HTTP proxy without user");
				Authenticator.setDefault(new FirewallAuthenticator(null));
			}
			else
			{
				Log.log(Log.DEBUG, jEdit.class, "HTTP proxy user: " + username);
				PasswordAuthentication pw = new PasswordAuthentication(username, password.toCharArray());
				Authenticator.setDefault(new FirewallAuthenticator(pw));
			}
		}
	} //}}}

	//{{{ FirewallAuthenticator class
	static class FirewallAuthenticator extends Authenticator
	{
		PasswordAuthentication pw;

		public FirewallAuthenticator(PasswordAuthentication pw)
		{
			this.pw = pw;
		}

		protected PasswordAuthentication getPasswordAuthentication()
		{
			return pw;
		}
	} //}}}

	//{{{ getNotLoadedPluginJARs() method
	private static void getNotLoadedPluginJARs(Vector returnValue,
		String dir, String[] list)
	{
		loop: for (int i = 0; i < list.length; i++)
		{
			String name = list[i];
			if (!name.toLowerCase().endsWith(".jar"))
				continue loop;

			String path = MiscUtilities.constructPath(dir, name);

			for (int j = 0; j < jars.size(); j++)
			{
				EditPlugin.JAR jar = (EditPlugin.JAR) jars.elementAt(j);
				String jarPath = jar.getPath();
				String jarName = MiscUtilities.getFileName(jarPath);

				if (path.equals(jarPath))
					continue loop;
				else if (!new File(jarPath).exists() && name.equals(jarName))
					continue loop;
			}
			returnValue.addElement(path);
		}
	} //}}}

	//{{{ gotoMarker() method
	private static void gotoMarker(final View view, final Buffer buffer,
		final String marker)
	{
		VFSManager.runInAWTThread(new Runnable()
		{
			public void run()
			{
				int pos;
				if (marker.startsWith("+line:"))
				{
					try
					{
						int line = Integer.parseInt(marker.substring(6));
						pos = buffer.getLineStartOffset(line - 1);
					}
					catch (Exception e)
					{
						return;
					}
				}
				else if (marker.startsWith("+marker:"))
				{
					if (marker.length() != 9)
						return;
					Marker m = buffer.getMarker(marker.charAt(8));
					if (m == null)
						return;
					pos = m.getPosition();
				}
				else
					throw new InternalError();

				if (view != null && view.getBuffer() == buffer)
					view.getTextArea().setCaretPosition(pos);
				else
					buffer.setIntegerProperty(Buffer.CARET, pos);
			}
		});
	} //}}}

	//{{{ addBufferToList() method
	private static void addBufferToList(Buffer buffer)
	{
		if (viewCount <= 1 && buffersFirst != null
			&& buffersFirst == buffersLast
			&& buffersFirst.isUntitled()
			&& !buffersFirst.isDirty())
		{
			Buffer oldBuffersFirst = buffersFirst;
			buffersFirst = buffersLast = buffer;
			EditBus.send(new BufferUpdate(oldBuffersFirst, null,
				BufferUpdate.CLOSED));
			return;
		}

		bufferCount++;

		if (buffersFirst == null)
		{
			buffersFirst = buffersLast = buffer;
			return;
		}
		else if (sortBuffers)
		{
			String name1 = (sortByName ? buffer.toString() : buffer.getPath());
			Buffer _buffer = buffersFirst;
			while (_buffer != null)
			{
				String name2 = (sortByName ? _buffer.toString() : _buffer.getPath());
				if (MiscUtilities.compareStrings(name1, name2, true) <= 0)
				{
					buffer.next = _buffer;
					buffer.prev = _buffer.prev;
					_buffer.prev = buffer;
					if (_buffer != buffersFirst)
						buffer.prev.next = buffer;
					else
						buffersFirst = buffer;
					return;
				}
				_buffer = _buffer.next;
			}
		}
		buffer.prev = buffersLast;
		buffersLast.next = buffer;
		buffersLast = buffer;
	} //}}}

	//{{{ removeBufferFromList() method
	private static void removeBufferFromList(Buffer buffer)
	{
		synchronized (bufferListLock)
		{
			bufferCount--;

			if (buffer == buffersFirst && buffer == buffersLast)
			{
				buffersFirst = buffersLast = null;
				return;
			}

			if (buffer == buffersFirst)
			{
				buffersFirst = buffer.next;
				buffer.next.prev = null;
			}
			else
			{
				buffer.prev.next = buffer.next;
			}

			if (buffer == buffersLast)
			{
				buffersLast = buffersLast.prev;
				buffer.prev.next = null;
			}
			else
			{
				buffer.next.prev = buffer.prev;
			}

			buffer.next = buffer.prev = null;
		}
	} //}}}

	//{{{ addViewToList() method
	private static void addViewToList(View view)
	{
		viewCount++;

		if (viewsFirst == null)
			viewsFirst = viewsLast = view;
		else
		{
			view.prev = viewsLast;
			viewsLast.next = view;
			viewsLast = view;
		}
	} //}}}

	//{{{ removeViewFromList() method
	private static void removeViewFromList(View view)
	{
		viewCount--;

		if (viewsFirst == viewsLast)
		{
			viewsFirst = viewsLast = null;
			return;
		}

		if (view == viewsFirst)
		{
			viewsFirst = view.next;
			view.next.prev = null;
		}
		else
		{
			view.prev.next = view.next;
		}

		if (view == viewsLast)
		{
			viewsLast = viewsLast.prev;
			view.prev.next = null;
		}
		else
		{
			view.next.prev = view.prev;
		}
	} //}}}

	//{{{ closeView() method
	/**
	 * closeView() used by exit().
	 */
	private static void closeView(View view, boolean callExit)
	{
		if (viewsFirst == viewsLast && callExit)
			exit(view, false);
		else
		{
			EditBus.send(new ViewUpdate(view, ViewUpdate.CLOSED));
			view.close();
			removeViewFromList(view);
		}
	} //}}}

	//{{{ loadModeCatalog() method
	/**
	 * Loads a mode catalog file.
	 * @since jEdit 3.2pre2
	 */
	private static void loadModeCatalog(String path, boolean resource)
	{
		Log.log(Log.MESSAGE, jEdit.class, "Loading mode catalog file " + path);
		ModeCatalogHandler handler = new ModeCatalogHandler(
			MiscUtilities.getParentOfPath(path), resource);
		XmlParser parser = new XmlParser();
		parser.setHandler(handler);
		try
		{
			InputStream _in;
			if (resource)
				_in = jEdit.class.getResourceAsStream(path);
			else
				_in = new FileInputStream(path);
			BufferedReader in = new BufferedReader(new InputStreamReader(_in));
			parser.parse(null, null, in);
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
		if (!(file.exists() && file.isDirectory()))
			return;
		String[] plugins = file.list();
		if (plugins == null)
			return;

		MiscUtilities.quicksort(plugins, new MiscUtilities.StringICaseCompare());
		for (int i = 0; i < plugins.length; i++)
		{
			String plugin = plugins[i];
			if (!plugin.toLowerCase().endsWith(".jar"))
				continue;

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
			if (shortcut1 != null)
				inputHandler.addKeyBinding(shortcut1, action);
			String shortcut2 = jEdit.getProperty(action.getName() + ".shortcut2");
			if (shortcut2 != null)
				inputHandler.addKeyBinding(shortcut2, action);
		}
	} //}}}

	//{{{ Private members

	//{{{ Static variables
	private static String jEditHome;
	private static String settingsDirectory;
	private static String portFile;
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

	private static boolean restore;
	private static boolean gui;
	private static boolean noPlugins;
	private static boolean noStartupScripts;
	private static String scriptFile;
	private static String userDir;

	private jEdit() {}

	//{{{ usage() method
	// (already defined above)
	//}}}

	//{{{ version() method
	// (already defined above)
	//}}}

	//{{{ makeServerScript() method
	// (already defined above)
	//}}}

	//{{{ initMisc() method
	// (already defined above)
	//}}}

	//{{{ initSystemProperties() method
	// (already defined above)
	//}}}

	//{{{ initSiteProperties() method
	// (already defined above)
	//}}}

	//{{{ initActions() method
	// (already defined above)
	//}}}

	//{{{ initDockables() method
	// (already defined above)
	//}}}

	//{{{ initPlugins() method
	// (already defined above)
	//}}}

	//{{{ initUserProperties() method
	// (already defined above)
	//}}}

	//{{{ initPLAF() method
	// (already defined above)
	//}}}

	//{{{ runStartupScripts() method
	// (already defined above)
	//}}}

	//{{{ initProxy() method
	// (already defined above)
	//}}}

	//{{{ FirewallAuthenticator class
	// (already defined above)
	//}}}

	//{{{ getNotLoadedPluginJARs() method
	// (already defined above)
	//}}}

	//{{{ gotoMarker() method
	// (already defined above)
	//}}}

	//{{{ addBufferToList() method
	// (already defined above)
	//}}}

	//{{{ removeBufferFromList() method
	// (already defined above)
	//}}}

	//{{{ addViewToList() method
	// (already defined above)
	//}}}

	//{{{ removeViewFromList() method
	// (already defined above)
	//}}}

	//{{{ closeView() method
	// (already defined above)
	//}}}

	//{{{ loadModeCatalog() method
	// (already defined above)
	//}}}

	//{{{ loadPlugins() method
	// (already defined above)
	//}}}

	//{{{ initKeyBindings() method
	// (already defined above)
	//}}}

	//}}}
}