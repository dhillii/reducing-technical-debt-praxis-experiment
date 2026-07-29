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
	//{{{ CmdOptions class
	/**
	 * Holds parsed command line options.
	 */
	private static class CmdOptions
	{
		int level = Log.WARNING;
		String settingsDirectory;
		String portFile;
		boolean background;
		boolean gui = true;
		boolean restore = true;
		boolean noPlugins;
		boolean noStartupScripts;
		String scriptFile;
		String userDir;
	}
	//}}}

	//{{{ main() method
	/**
	 * The main method of the jEdit application.
	 * This should never be invoked directly.
	 * @param args The command line arguments
	 */
	public static void main(String[] args)
	{
		checkJavaVersion();

		CmdOptions opts = parseCommandLine(args);

		// set static fields
		settingsDirectory = opts.settingsDirectory;
		portFile = opts.portFile;
		background = opts.background;
		gui = opts.gui;
		restore = opts.restore;
		noPlugins = opts.noPlugins;
		noStartupScripts = opts.noStartupScripts;
		scriptFile = opts.scriptFile;
		userDir = opts.userDir;

		Log.init(true,opts.level);

		initServer(opts);
		tryConnectToServer(opts,args);

		if(!new File(settingsDirectory,"nosplash").exists())
			GUIUtilities.showSplashScreen();

		Writer stream = initSettingsDirectory(opts);
		Log.setLogWriter(stream);
		Log.log(Log.NOTICE,jEdit.class,"jEdit version " + getVersion());
		Log.log(Log.MESSAGE,jEdit.class,"Settings directory is " + settingsDirectory);

		startApplication(opts,args);
	} //}}}

	//{{{ checkJavaVersion() method
	private static void checkJavaVersion()
	{
		String javaVersion = System.getProperty("java.version");
		if(javaVersion.compareTo("1.3") < 0)
		{
			System.err.println("You are running Java version "
				+ javaVersion + ".");
			System.err.println("jEdit requires Java 1.3 or later.");
			System.exit(1);
		}
	} //}}}

	//{{{ parseCommandLine() method
	private static CmdOptions parseCommandLine(String[] args)
	{
		CmdOptions opts = new CmdOptions();

		opts.settingsDirectory = MiscUtilities.constructPath(
			System.getProperty("user.home"),".jedit");
		opts.portFile = "server";

		if(args.length >= 1)
		{
			String levelStr = args[0];
			if(levelStr.length() == 1 && Character.isDigit(levelStr.charAt(0)))
			{
				opts.level = Integer.parseInt(levelStr);
				args[0] = null;
			}
		}

		boolean endOpts = false;
		for(int i = 0; i < args.length; i++)
		{
			String arg = args[i];
			if(arg == null)
				continue;
			else if(arg.length() == 0)
				args[i] = null;
			else if(arg.startsWith("-") && !endOpts)
			{
				if(arg.equals("--"))
					endOpts = true;
				else if(arg.equals("-usage"))
				{
					version();
					System.err.println();
					usage();
					System.exit(1);
				}
				else if(arg.equals("-version"))
				{
					version();
					System.exit(1);
				}
				else if(arg.equals("-nosettings"))
					opts.settingsDirectory = null;
				else if(arg.startsWith("-settings="))
					opts.settingsDirectory = arg.substring(10);
				else if(arg.startsWith("-noserver"))
					opts.portFile = null;
				else if(arg.equals("-server"))
					opts.portFile = "server";
				else if(arg.startsWith("-server="))
					opts.portFile = arg.substring(8);
				else if(arg.startsWith("-background"))
					opts.background = true;
				else if(arg.equals("-nogui"))
					opts.gui = false;
				else if(arg.equals("-norestore"))
					opts.restore = false;
				else if(arg.equals("-noplugins"))
					opts.noPlugins = true;
				else if(arg.equals("-nostartupscripts"))
					opts.noStartupScripts = true;
				else if(arg.startsWith("-run="))
					opts.scriptFile = arg.substring(5);
				else
				{
					System.err.println("Unknown option: " + arg);
					usage();
					System.exit(1);
				}
				args[i] = null;
			}
		}

		if(opts.settingsDirectory != null && opts.portFile != null)
			opts.portFile = MiscUtilities.constructPath(opts.settingsDirectory,opts.portFile);
		else
			opts.portFile = null;

		opts.userDir = System.getProperty("user.dir");

		return opts;
	} //}}}

	//{{{ initServer() method
	private static void initServer(CmdOptions opts)
	{
		if(opts.portFile != null)
		{
			server = new EditServer(opts.portFile);
			if(!server.isOK())
				server = null;
		}
		else
		{
			if(opts.background)
			{
				opts.background = false;
				System.err.println("You cannot specify both the"
					+ " -background and -noserver switches");
			}
		}
	} //}}}

	//{{{ tryConnectToServer() method
	private static void tryConnectToServer(CmdOptions opts, String[] args)
	{
		if(opts.portFile != null && new File(opts.portFile).exists())
		{
			int port, key;
			try
			{
				BufferedReader in = new BufferedReader(new FileReader(opts.portFile));
				String check = in.readLine();
				if(!check.equals("b"))
					throw new Exception("Wrong port file format");

				port = Integer.parseInt(in.readLine());
				key = Integer.parseInt(in.readLine());
				in.close();

				Socket socket = new Socket(InetAddress.getByName("127.0.0.1"),port);
				DataOutputStream out = new DataOutputStream(
					socket.getOutputStream());
				out.writeInt(key);

				String script = makeServerScript(opts.restore,args,opts.scriptFile);

				out.writeUTF(script);

				out.close();

				System.exit(0);
			}
			catch(Exception e)
			{
				Log.log(Log.NOTICE,jEdit.class,"An error occurred"
					+ " while connecting to the jEdit server instance.");
				Log.log(Log.NOTICE,jEdit.class,"This probably means that"
					+ " jEdit crashed and/or exited abnormally");
				Log.log(Log.NOTICE,jEdit.class,"the last time it was run.");
				Log.log(Log.NOTICE,jEdit.class,"If you don't"
					+ " know what this means, don't worry.");
				Log.log(Log.NOTICE,jEdit.class,e);
			}
		}
	} //}}}

	//{{{ initSettingsDirectory() method
	private static Writer initSettingsDirectory(CmdOptions opts)
	{
		Writer stream;
		if(opts.settingsDirectory != null)
		{
			File _settingsDirectory = new File(opts.settingsDirectory);
			if(!_settingsDirectory.exists())
				_settingsDirectory.mkdirs();
			File _macrosDirectory = new File(opts.settingsDirectory,"macros");
			if(!_macrosDirectory.exists())
				_macrosDirectory.mkdir();

			String logPath = MiscUtilities.constructPath(
				opts.settingsDirectory,"activity.log");

			backupSettingsFile(new File(logPath));

			try
			{
				stream = new BufferedWriter(new FileWriter(logPath));
			}
			catch(Exception e)
			{
				e.printStackTrace();
				stream = null;
			}
		}
		else
		{
			stream = null;
		}
		return stream;
	} //}}}

	//{{{ startApplication() method
	private static void startApplication(CmdOptions opts, String[] args)
	{
		initMisc();
		initSystemProperties();
		if(jEditHome != null)
			initSiteProperties();
		GUIUtilities.advanceSplashProgress();

		BeanShell.init();

		initUserProperties();
		initPLAF();

		if(OperatingSystem.hasJava14()
			&& System.getProperty("jedit.nojava14") == null)
		{
			try
			{
				ClassLoader loader = jEdit.class.getClassLoader();
				Class clazz;
				if(loader != null)
					clazz = loader.loadClass("org.gjt.sp.jedit.Java14");
				else
					clazz = Class.forName("org.gjt.sp.jedit.Java14");
				java.lang.reflect.Method meth = clazz
					.getMethod("init",new Class[0]);
				meth.invoke(null,new Object[0]);
			}
			catch(Exception e)
			{
				Log.log(Log.ERROR,jEdit.class,e);
				System.exit(1);
			}
		}

		initActions();
		initDockables();

		GUIUtilities.advanceSplashProgress();

		VFSManager.init();

		if(!opts.noPlugins)
			initPlugins();

		if(opts.settingsDirectory != null)
		{
			File history = new File(MiscUtilities.constructPath(
				opts.settingsDirectory,"history"));
			if(history.exists())
				historyModTime = history.lastModified();
			HistoryModel.loadHistory(history);

			File recent = new File(MiscUtilities.constructPath(
				opts.settingsDirectory,"recent.xml"));
			if(recent.exists())
				recentModTime = recent.lastModified();
			BufferHistory.load(recent);
		}

		GUIUtilities.advanceSplashProgress();

		// Buffer sort
		sortBuffers = getBooleanProperty("sortBuffers");
		sortByName = getBooleanProperty("sortByName");

		reloadModes();

		GUIUtilities.advanceSplashProgress();

		SearchAndReplace.load();

		GUIUtilities.advanceSplashProgress();

		// Start plugins
		for(int i = 0; i < jars.size(); i++)
		{
			((EditPlugin.JAR)jars.elementAt(i)).getClassLoader()
				.startAllPlugins();
		}

		// Load macros and run startup scripts
		Macros.loadMacros();

		if(!opts.noStartupScripts && jEditHome != null)
		{
			String path = MiscUtilities.constructPath(jEditHome,"startup");
			File file = new File(path);
			if(file.exists())
				runStartupScripts(file);
		}

		if(!opts.noStartupScripts && opts.settingsDirectory != null)
		{
			String path = MiscUtilities.constructPath(opts.settingsDirectory,"startup");
			File file = new File(path);
			if(!file.exists())
				file.mkdirs();
			else
				runStartupScripts(file);
		}

		// Run script specified with -run=
		if(opts.scriptFile != null)
		{
			String scriptFile = MiscUtilities.constructPath(opts.userDir,opts.scriptFile);
			BeanShell.runScript(null,scriptFile,null,false);
		}

		propertiesChanged();

		GUIUtilities.advanceSplashProgress();

		// Open files
		Buffer buffer = openFiles(null,opts.userDir,args);
		if(buffer != null)
		{
			opts.gui = true;
		}

		String splitConfig = null;

		if(opts.restore && opts.settingsDirectory != null
			&& jEdit.getBooleanProperty("restore")
			&& (bufferCount == 0 || jEdit.getBooleanProperty("restore.cli")))
		{
			splitConfig = restoreOpenFiles();
		}

		if(bufferCount == 0 && opts.gui)
			newFile(null);

		// Create the view and hide splash screen.
		final Buffer _buffer = buffer;
		final String _splitConfig = splitConfig;
		final boolean _gui = opts.gui;

		GUIUtilities.advanceSplashProgress();

		SwingUtilities.invokeLater(new Runnable() {
			public void run()
			{
				EditBus.send(new EditorStarted(null));

				if(_gui)
				{
					View view;
					if(_buffer != null)
						view = newView(null,_buffer);
					else
						view = newView(null,_splitConfig);
				}

				// Start I/O threads
				VFSManager.start();

				// Start edit server
				if(server != null)
					server.start();

				GUIUtilities.hideSplashScreen();

				Log.log(Log.MESSAGE,jEdit.class,"Startup "
					+ "complete");

				// Report any plugin errors
				if(pluginErrors != null)
				{
					String caption = jEdit.getProperty(
						"plugin-error.caption" + (pluginErrors.size() == 1
						? "-1" : ""),new Integer[] {
						new Integer(pluginErrors.size()) });

					new ErrorListDialog(
						jEdit.getFirstView(),
						jEdit.getProperty("plugin-error.title"),
						caption,pluginErrors,true);
					pluginErrors.removeAllElements();
				}

				Toolkit.getDefaultToolkit();
			}
		});
	} //}}}

	//{{{ Property methods
	// ... (unchanged)
	//}}}

	//{{{ Plugin management methods
	// ... (unchanged)
	//}}}

	//{{{ Action methods
	// ... (unchanged)
	//}}}

	//{{{ Edit mode methods
	// ... (unchanged)
	//}}}

	//{{{ Buffer creation methods
	// ... (unchanged)
	//}}}

	//{{{ Buffer management methods
	// ... (unchanged)
	//}}}

	//{{{ View methods
	// ... (unchanged)
	//}}}

	//{{{ Miscellaneous methods
	// ... (unchanged)
	//}}}

	//{{{ Package-private members
	// ... (unchanged)
	//}}}

	//{{{ Private members
	// ... (unchanged)
	//}}}
}