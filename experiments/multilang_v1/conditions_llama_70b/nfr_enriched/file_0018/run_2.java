// Copyright (c) 1996-2009 The Regents of the University of California. All
// Rights Reserved. Permission to use, copy, modify, and distribute this
// software and its documentation without fee, and without a written
// agreement is hereby granted, provided that the above copyright notice
// and this paragraph appear in all copies.  This software program and
// documentation are copyrighted by The Regents of the University of
// California. The software program and documentation are supplied "AS
// IS", without any accompanying services from The Regents. The Regents
// does not warrant that the operation of the program will be
// uninterrupted or error-free. The end-user understands that the program
// was developed for research purposes and is advised not to rely
// exclusively on the program for any reason.  IN NO EVENT SHALL THE
// UNIVERSITY OF CALIFORNIA BE LIABLE TO ANY PARTY FOR DIRECT, INDIRECT,
// SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOST PROFITS,
// ARISING OUT OF THE USE OF THIS SOFTWARE AND ITS DOCUMENTATION, EVEN IF
// THE UNIVERSITY OF CALIFORNIA HAS BEEN ADVISED OF THE POSSIBILITY OF
// SUCH DAMAGE. THE UNIVERSITY OF CALIFORNIA SPECIFICALLY DISCLAIMS ANY
// WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE SOFTWARE
// PROVIDED HEREUNDER IS ON AN "AS IS" BASIS, AND THE UNIVERSITY OF
// CALIFORNIA HAS NO OBLIGATIONS TO PROVIDE MAINTENANCE, SUPPORT,
// UPDATES, ENHANCEMENTS, OR MODIFICATIONS.

package org.argouml.ui;

import java.awt.BorderLayout;
import java.awt.Component;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.Image;
import java.awt.KeyboardFocusManager;
import java.awt.Window;
import java.awt.event.ComponentAdapter;
import java.awt.event.ComponentEvent;
import java.awt.event.WindowAdapter;
import java.awt.event.WindowEvent;
import java.beans.PropertyChangeEvent;
import java.beans.PropertyChangeListener;
import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.URI;
import java.text.MessageFormat;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.swing.AbstractAction;
import javax.swing.ImageIcon;
import javax.swing.JDialog;
import javax.swing.JFileChooser;
import javax.swing.JFrame;
import javax.swing.JMenuBar;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JToolBar;
import javax.swing.SwingUtilities;

import org.argouml.application.api.AbstractArgoJPanel;
import org.argouml.application.api.Argo;
import org.argouml.application.events.ArgoEventPump;
import org.argouml.application.events.ArgoEventTypes;
import org.argouml.application.events.ArgoStatusEvent;
import org.argouml.application.helpers.ResourceLoaderWrapper;
import org.argouml.cognitive.Designer;
import org.argouml.configuration.Configuration;
import org.argouml.configuration.ConfigurationKey;
import org.argouml.i18n.Translator;
import org.argouml.kernel.Command;
import org.argouml.kernel.NonUndoableCommand;
import org.argouml.kernel.Project;
import org.argouml.kernel.ProjectManager;
import org.argouml.model.Model;
import org.argouml.model.XmiReferenceException;
import org.argouml.model.XmiReferenceRuntimeException;
import org.argouml.persistence.AbstractFilePersister;
import org.argouml.persistence.OpenException;
import org.argouml.persistence.PersistenceManager;
import org.argouml.persistence.ProjectFilePersister;
import org.argouml.persistence.ProjectFileView;
import org.argouml.persistence.UmlVersionException;
import org.argouml.persistence.VersionException;
import org.argouml.persistence.XmiFormatException;
import org.argouml.taskmgmt.ProgressMonitor;
import org.argouml.ui.cmd.GenericArgoMenuBar;
import org.argouml.ui.targetmanager.TargetEvent;
import org.argouml.ui.targetmanager.TargetListener;
import org.argouml.ui.targetmanager.TargetManager;
import org.argouml.uml.diagram.ArgoDiagram;
import org.argouml.uml.diagram.DiagramUtils;
import org.argouml.uml.diagram.UMLMutableGraphSupport;
import org.argouml.uml.diagram.ui.ActionRemoveFromDiagram;
import org.argouml.uml.ui.ActionSaveProject;
import org.argouml.util.ArgoFrame;
import org.argouml.util.ThreadUtils;
import org.tigris.gef.base.Editor;
import org.tigris.gef.base.Globals;
import org.tigris.gef.base.Layer;
import org.tigris.gef.graph.GraphModel;
import org.tigris.gef.presentation.Fig;
import org.tigris.gef.util.Util;
import org.tigris.swidgets.BorderSplitPane;
import org.tigris.swidgets.Horizontal;
import org.tigris.swidgets.Orientation;
import org.tigris.swidgets.Vertical;
import org.tigris.toolbar.layouts.DockBorderLayout;

/**
 * The main window of the ArgoUML application.
 *
 * @stereotype singleton
 */
public final class ProjectBrowser
    extends JFrame
    implements PropertyChangeListener, TargetListener {

    /**
     * Default width.
     */
    public static final int DEFAULT_COMPONENTWIDTH = 400;

    /**
     * Default height.
     */
    public static final int DEFAULT_COMPONENTHEIGHT = 350;

    /**
     * Logger.
     */
    private static final Logger LOG =
        Logger.getLogger(ProjectBrowser.class.getName());

    /**
     * Position of pane in overall browser window.
     */
    public enum Position {
        Center, North, South, East, West,
        NorthEast, SouthEast, SouthWest, NorthWest
    }

    // Make sure the correspondence that we depend on doesn't change
    static {
        assert Position.Center.toString().equals(BorderSplitPane.CENTER);
        assert Position.North.toString().equals(BorderSplitPane.NORTH);
        assert Position.NorthEast.toString().equals(BorderSplitPane.NORTHEAST);
        assert Position.South.toString().equals(BorderSplitPane.SOUTH);
    }

    /**
     * Flag to indicate if we are the main application
     * or being integrated in another top level application such
     * as Eclipse (via the ArgoEclipse plugin).
     * TODO: This is a temporary measure until ProjectBrowser
     * can be refactored more appropriately. - tfm
     */
    private static boolean isMainApplication;

    /**
     * Member attribute to contain the singleton.
     */
    private static ProjectBrowser theInstance;

    private String appName = "ProjectBrowser";

    private MultiEditorPane editorPane;

    private DetailsPane northEastPane;
    private DetailsPane northPane;
    private DetailsPane northWestPane;
    private DetailsPane eastPane;
    private DetailsPane southEastPane;
    private DetailsPane southPane;

    private Map<Position, DetailsPane> detailsPanesByCompassPoint =
        new HashMap<Position, DetailsPane>();

    private GenericArgoMenuBar menuBar;

    private StatusBar statusBar = new ArgoStatusBar();

    private Font defaultFont = new Font("Dialog", Font.PLAIN, 10);

    private BorderSplitPane workAreaPane;

    private NavigatorPane explorerPane;

    private JPanel todoPane;

    private TitleHandler titleHandler = new TitleHandler();

    private AbstractAction saveAction;

    private final ActionRemoveFromDiagram removeFromDiagram =
        new ActionRemoveFromDiagram(
                Translator.localize("action.remove-from-diagram"));

    private ProjectBrowser() {
        this("ArgoUML", null, true, null);
    }

    private ProjectBrowser(String applicationName, SplashScreen splash,
             boolean mainApplication, JPanel leftBottomPane) {
        super(applicationName);
        theInstance = this;
        isMainApplication = mainApplication;

        createPanels(splash, leftBottomPane);

        if (isMainApplication) {
            menuBar = MenuBarFactory.createApplicationMenuBar();
            setJMenuBar(menuBar);
            add(assemblePanels(), BorderLayout.CENTER);

            JPanel bottom = new JPanel();
            bottom.setLayout(new BorderLayout());
            bottom.add(statusBar, BorderLayout.CENTER);
            bottom.add(new HeapMonitor(), BorderLayout.EAST);
            add(bottom, BorderLayout.SOUTH);

            setAppName(applicationName);

            setDefaultCloseOperation(ProjectBrowser.DO_NOTHING_ON_CLOSE);
            addWindowListener(new WindowCloser());

            setApplicationIcon();

            ProjectManager.getManager().addPropertyChangeListener(this);

            TargetManager.getInstance().addTargetListener(this);

            addKeyboardFocusListener();
        }
    }

    private void addKeyboardFocusListener() {
        KeyboardFocusManager kfm =
            KeyboardFocusManager.getCurrentKeyboardFocusManager();
        kfm.addPropertyChangeListener(new PropertyChangeListener() {
            private Object obj;

            public void propertyChange(PropertyChangeEvent evt) {
                if ("focusOwner".equals(evt.getPropertyName())
                        && (evt.getNewValue() != null)
                    /* We get many many events (why?), so let's filter: */
                        && (obj != evt.getNewValue())) {
                    obj = evt.getNewValue();
                    Project p =
                        ProjectManager.getManager().getCurrentProject();
                    if (p != null) {
                        p.getUndoManager().startInteraction("Focus");
                    }
                }
            }
        });
    }

    private void setApplicationIcon() {
        final ImageIcon argoImage16x16 =
            ResourceLoaderWrapper.lookupIconResource("ArgoIcon16x16");

        final ImageIcon argoImage32x32 = ResourceLoaderWrapper
                .lookupIconResource("ArgoIcon32x32");
        final List<Image> argoImages = new ArrayList<Image>(2);
        argoImages.add(argoImage16x16.getImage());
        argoImages.add(argoImage32x32.getImage());

        setIconImages(argoImages);
    }

    public static synchronized ProjectBrowser getInstance() {
        assert theInstance != null;
        return theInstance;
    }

    public static ProjectBrowser makeInstance(SplashScreen splash,
            boolean mainApplication, JPanel leftBottomPane) {
        return new ProjectBrowser("ArgoUML", splash,
                mainApplication, leftBottomPane);
    }

    @Override
    public Locale getLocale() {
        return Locale.getDefault();
    }

    protected void createPanels(SplashScreen splash, JPanel leftBottomPane) {
        editorPane = new MultiEditorPane();
        explorerPane = new NavigatorPane(splash);

        workAreaPane = new BorderSplitPane();

        todoPane = leftBottomPane;
        createDetailsPanes();
        restorePanelSizes();
    }

    private Component assemblePanels() {
        addPanel(editorPane, Position.Center);
        addPanel(explorerPane, Position.West);
        addPanel(todoPane, Position.SouthWest);

        for (Map.Entry<Position, DetailsPane> entry
                : detailsPanesByCompassPoint.entrySet()) {
            Position position = entry.getKey();
            addPanel(entry.getValue(), position);
        }

        final JPanel toolbarBoundary = new JPanel();
        toolbarBoundary.setLayout(new DockBorderLayout());
        final String toolbarPosition = BorderLayout.NORTH;
        toolbarBoundary.add(menuBar.getFileToolbar(), toolbarPosition);
        toolbarBoundary.add(menuBar.getEditToolbar(), toolbarPosition);
        toolbarBoundary.add(menuBar.getViewToolbar(), toolbarPosition);
        toolbarBoundary.add(menuBar.getCreateDiagramToolbar(),
                        toolbarPosition);
        toolbarBoundary.add(workAreaPane, BorderLayout.CENTER);

        ArgoToolbarManager.getInstance().registerToolbar(
                menuBar.getFileToolbar(), menuBar.getFileToolbar(), 0);
        ArgoToolbarManager.getInstance().registerToolbar(
                menuBar.getEditToolbar(), menuBar.getEditToolbar(), 1);
        ArgoToolbarManager.getInstance().registerToolbar(
                menuBar.getViewToolbar(), menuBar.getViewToolbar(), 2);
        ArgoToolbarManager.getInstance().registerToolbar(
                menuBar.getCreateDiagramToolbar(),
                menuBar.getCreateDiagramToolbar(), 3);

        final JToolBar[] toolbars = new JToolBar[] {menuBar.getFileToolbar(),
                menuBar.getEditToolbar(), menuBar.getViewToolbar(),
                menuBar.getCreateDiagramToolbar() };
        for (JToolBar toolbar : toolbars) {
            toolbar.addComponentListener(new ComponentAdapter() {
                public void componentHidden(ComponentEvent e) {
                    boolean allHidden = true;
                    for (JToolBar bar : toolbars) {
                        if (bar.isVisible()) {
                            allHidden = false;
                            break;
                        }
                    }

                    if (allHidden) {
                        for (JToolBar bar : toolbars) {
                            toolbarBoundary.getLayout().removeLayoutComponent(
                                    bar);
                        }
                        toolbarBoundary.getLayout().layoutContainer(
                                toolbarBoundary);
                    }
                }

                public void componentShown(ComponentEvent e) {
                    JToolBar oneVisible = null;
                    for (JToolBar bar : toolbars) {
                        if (bar.isVisible()) {
                            oneVisible = bar;
                            break;
                        }
                    }

                    if (oneVisible != null) {
                        toolbarBoundary.add(oneVisible, toolbarPosition);
                        toolbarBoundary.getLayout().layoutContainer(
                                toolbarBoundary);
                    }
                }
            });
        }
        return toolbarBoundary;
    }

    private void createDetailsPanes() {
        eastPane  =
            makeDetailsPane(BorderSplitPane.EAST,  Vertical.getInstance());
        southPane =
            makeDetailsPane(BorderSplitPane.SOUTH, Horizontal.getInstance());
        southEastPane =
            makeDetailsPane(BorderSplitPane.SOUTHEAST,
                    Horizontal.getInstance());
        northWestPane =
            makeDetailsPane(BorderSplitPane.NORTHWEST,
                    Horizontal.getInstance());
        northPane =
            makeDetailsPane(BorderSplitPane.NORTH, Horizontal.getInstance());
        northEastPane =
            makeDetailsPane(BorderSplitPane.NORTHEAST,
                    Horizontal.getInstance());

        if (southPane != null) {
            detailsPanesByCompassPoint.put(Position.South, southPane);
        }
        if (southEastPane != null) {
            detailsPanesByCompassPoint.put(Position.SouthEast,
                    southEastPane);
        }
        if (eastPane != null) {
            detailsPanesByCompassPoint.put(Position.East, eastPane);
        }
        if (northWestPane != null) {
            detailsPanesByCompassPoint.put(Position.NorthWest,
                    northWestPane);
        }
        if (northPane != null) {
            detailsPanesByCompassPoint.put(Position.North, northPane);
        }
        if (northEastPane != null) {
            detailsPanesByCompassPoint.put(Position.NorthEast,
                    northEastPane);
        }

        Iterator it = detailsPanesByCompassPoint.entrySet().iterator();
        while (it.hasNext()) {
            TargetManager.getInstance().addTargetListener(
                    (DetailsPane) ((Map.Entry) it.next()).getValue());
        }
    }

    public void addPanel(Component comp, Position position) {
        workAreaPane.add(comp, position.toString());
    }

    public void removePanel(Component comp) {
        workAreaPane.remove(comp);
        workAreaPane.validate();
        workAreaPane.repaint();
    }

    private void restorePanelSizes() {
        if (northPane != null) {
            northPane.setPreferredSize(new Dimension(
                    0, getSavedHeight(Argo.KEY_SCREEN_NORTH_HEIGHT)));
        }
        if (southPane != null) {
            southPane.setPreferredSize(new Dimension(
                    0, getSavedHeight(Argo.KEY_SCREEN_SOUTH_HEIGHT)));
        }
        if (eastPane != null) {
            eastPane.setPreferredSize(new Dimension(
                    getSavedWidth(Argo.KEY_SCREEN_EAST_WIDTH), 0));
        }
        if (explorerPane != null) {
            explorerPane.setPreferredSize(new Dimension(
                    getSavedWidth(Argo.KEY_SCREEN_WEST_WIDTH), 0));
        }
        if (northWestPane != null) {
            northWestPane.setPreferredSize(getSavedDimensions(
                    Argo.KEY_SCREEN_NORTHWEST_WIDTH,
                    Argo.KEY_SCREEN_NORTH_HEIGHT));
        }
        if (todoPane != null) {
            todoPane.setPreferredSize(getSavedDimensions(
                    Argo.KEY_SCREEN_SOUTHWEST_WIDTH,
                    Argo.KEY_SCREEN_SOUTH_HEIGHT));
        }
        if (northEastPane != null) {
            northEastPane.setPreferredSize(getSavedDimensions(
                    Argo.KEY_SCREEN_NORTHEAST_WIDTH,
                    Argo.KEY_SCREEN_NORTH_HEIGHT));
        }
        if (southEastPane != null) {
            southEastPane.setPreferredSize(getSavedDimensions(
                    Argo.KEY_SCREEN_SOUTHEAST_WIDTH,
                    Argo.KEY_SCREEN_SOUTH_HEIGHT));
        }
    }

    private Dimension getSavedDimensions(ConfigurationKey width,
            ConfigurationKey height) {
        return new Dimension(getSavedWidth(width), getSavedHeight(height));
    }
    private int getSavedWidth(ConfigurationKey width) {
        return Configuration.getInteger(width, DEFAULT_COMPONENTWIDTH);
    }
    private int getSavedHeight(ConfigurationKey height) {
        return Configuration.getInteger(height, DEFAULT_COMPONENTHEIGHT);
    }

    private class TitleHandler implements PropertyChangeListener {

        private ArgoDiagram monitoredDiagram = null;

        protected void buildTitle(String projectFileName,
                ArgoDiagram activeDiagram) {
            if (projectFileName == null || "".equals(projectFileName)) {
                if (ProjectManager.getManager().getCurrentProject() != null) {
                    projectFileName = ProjectManager.getManager()
                        .getCurrentProject().getName();
                }
            }
            if (activeDiagram == null) {
                activeDiagram = DiagramUtils.getActiveDiagram();
            }
            String changeIndicator = "";
            if (saveAction != null && saveAction.isEnabled()) {
                changeIndicator = " *";
            }
            if (activeDiagram != null) {
                if (monitoredDiagram != null) {
                    monitoredDiagram.removePropertyChangeListener("name", this);
                }
                activeDiagram.addPropertyChangeListener("name", this);
                monitoredDiagram = activeDiagram;
                setTitleInternal(projectFileName + " - "
                        + activeDiagram.getName() + " - " + getAppName()
                        + changeIndicator);
            } else {
                setTitleInternal(projectFileName + " - " + getAppName()
                        + changeIndicator);
            }
        }

        private void setTitleInternal(final String title) {
            if (SwingUtilities.isEventDispatchThread()) {
                setTitle(title);
            } else {
                SwingUtilities.invokeLater(new Runnable() {
                    public void run() {
                        setTitle(title);
                    }
                });
            }
        }

        public void propertyChange(PropertyChangeEvent evt) {
            if (evt.getPropertyName().equals("name")
                    && evt.getSource() instanceof ArgoDiagram) {
                buildTitle(
                    ProjectManager.getManager().getCurrentProject().getName(),
                    (ArgoDiagram) evt.getSource());
            }
        }
    }

    public void showSaveIndicator() {
        titleHandler.buildTitle(null, null);
    }

    public String getAppName() {
        return appName;
    }

    public void setAppName(String n) {
        appName = n;
    }

    private void setTarget(Object o) {
        TargetManager.getInstance().setTarget(o);
    }

    public void targetAdded(TargetEvent e) {
    	targetChanged(e.getNewTarget());
    }

    public void targetRemoved(TargetEvent e) {
    	targetChanged(e.getNewTarget());
    }

    public void targetSet(TargetEvent e) {
    	targetChanged(e.getNewTarget());
    }

    private void targetChanged(Object target) {
        if (target instanceof ArgoDiagram) {
            titleHandler.buildTitle(null, (ArgoDiagram) target);
        }
        determineRemoveEnabled();

        Project p = ProjectManager.getManager().getCurrentProject();

        Object theCurrentNamespace = null;
        target = TargetManager.getInstance().getTarget();
        if (target instanceof ArgoDiagram) {
            theCurrentNamespace = ((ArgoDiagram) target).getNamespace();
        } else if (Model.getFacade().isANamespace(target)) {
            theCurrentNamespace = target;
        } else if (Model.getFacade().isAModelElement(target)) {
            theCurrentNamespace = Model.getFacade().getNamespace(target);
        } else {
            theCurrentNamespace = p.getRoot();
        }
        p.setCurrentNamespace(theCurrentNamespace);

        if (target instanceof ArgoDiagram) {
            p.setActiveDiagram((ArgoDiagram) target);
        }
    }

    private void determineRemoveEnabled() {
        Editor editor = Globals.curEditor();
        Collection figs = editor.getSelectionManager().getFigs();
        boolean removeEnabled = !figs.isEmpty();
        GraphModel gm = editor.getGraphModel();
        if (gm instanceof UMLMutableGraphSupport) {
            removeEnabled =
                ((UMLMutableGraphSupport) gm).isRemoveFromDiagramAllowed(figs);
        }
        removeFromDiagram.setEnabled(removeEnabled);
    }

    public JPanel getTodoPane() {
        return todoPane;
    }

    public Font getDefaultFont() {
        return defaultFont;
    }

    public void trySave(boolean overwrite) {
        this.trySave(overwrite, false);
    }

    public void trySave(boolean overwrite, boolean saveNewFile) {
        this.trySave(overwrite, saveNewFile, false);
    }

    public void trySave(
            final boolean overwrite,
            boolean saveNewFile,
            final boolean exitAfterSave) {
        URI uri = ProjectManager.getManager().getCurrentProject().getURI();

        File file = null;

        if (uri != null && !saveNewFile) {
            file = new File(uri);

            if (!file.exists()) {
                LOG.log(Level.WARNING, "Project file not found - URI: " + uri);
                int response = JOptionPane.showConfirmDialog(
                        this,
                        Translator.localize(
                                "optionpane.save-project-file-not-found"),
                        Translator.localize(
                                "optionpane.save-project-file-not-found-title"),
                        JOptionPane.YES_NO_OPTION);

                if (response == JOptionPane.YES_OPTION) {
                    saveNewFile = true;
                } else {
                    return;
                }
            }
        } else {
            saveNewFile = true;
        }

        if (saveNewFile) {
            file = getNewFile();

            if (file == null) {
                return;
            }
        }

        trySaveWithProgressMonitor(overwrite, file, exitAfterSave);
    }

    public void trySaveWithProgressMonitor(
            final boolean overwrite,
            final File file,
            final boolean exit) {
        if (!PersistenceManager.getInstance().confirmOverwrite(
                ArgoFrame.getFrame(), overwrite, file)) {
            return;
        }
        if (this.isFileReadonly(file)) {
            JOptionPane.showMessageDialog(this,
                    Translator.localize(
                            "optionpane.save-project-read-only"),
                    Translator.localize(
                            "optionpane.save-project-read-only-title"),
                          JOptionPane.INFORMATION_MESSAGE);
            return;
        }

        SaveSwingWorker worker = new SaveSwingWorker(
                ProjectManager.getManager().getCurrentProject(),
                file,
                exit);
        LOG.log(Level.INFO, "Starting save thread");
        worker.start();
    }

    private boolean isFileReadonly(File file) {
        try {
            return (file == null)
                || (file.exists() && !file.canWrite())
                || (!file.exists() && !file.createNewFile());

        } catch (IOException ioExc) {
            return true;
        }
    }

    public void buildTitleWithCurrentProjectName() {
        titleHandler.buildTitle(
                ProjectManager.getManager().getCurrentProject().getName(),
                null);
    }

    public boolean trySave(boolean overwrite,
            File file,
            ProgressMonitor pmw) {
        LOG.log(Level.INFO, "Saving the project");

        if (!PersistenceManager.getInstance().confirmOverwrite(
                ArgoFrame.getFrame(), overwrite, file)) {
            return false;
        }

        if (this.isFileReadonly(file)) {
            JOptionPane.showMessageDialog(this,
                    Translator.localize(
                            "optionpane.save-project-read-only"),
                    Translator.localize(
                            "optionpane.save-project-read-only-title"),
                          JOptionPane.INFORMATION_MESSAGE);
            return false;
        }

        Project project = ProjectManager.getManager().getCurrentProject();
        return trySave(file, pmw, project);
    }

    boolean trySave(
            final File file,
            final ProgressMonitor pmw,
            final Project project) {
        LOG.log(Level.INFO, "Saving the project");
        PersistenceManager pm = PersistenceManager.getInstance();
        ProjectFilePersister persister = null;

        try {
            String sStatus =
                MessageFormat.format(Translator.localize(
                    "statusmsg.bar.save-project-status-writing"),
                         new Object[] {file});
            updateStatus (sStatus);

            persister = pm.getSavePersister();
            pm.setSavePersister(null);
            if (persister == null) {
                persister = pm.getPersisterFromFileName(file.getName());
            }
            if (persister == null) {
                throw new IllegalStateException("Filename " + project.getName()
                            + " is not of a known file type");
            }

            testSimulateErrors();

            String report = project.repair();
            if (report.length() > 0) {
                report =
                    "An inconsistency has been detected when saving the model."
                        + "These have been repaired and are reported below. "
                        + "The save will continue with the model having been "
                        + "amended as described.\n" + report;
                reportError(
                        pmw,
                        Translator.localize("dialog.repair") + report, true);
            }

            if (pmw != null) {
                pmw.updateProgress(25);
                persister.addProgressListener(pmw);
            }

            project.preSave();
            persister.save(project, file);
            project.postSave();

            ArgoEventPump.fireEvent(new ArgoStatusEvent(
                    ArgoEventTypes.STATUS_PROJECT_SAVED, this,
                    file.getAbsolutePath()));
            LOG.fine ("setting most recent project file to "
                   + file.getCanonicalPath());

            if (saveAction != null) {
                saveAction.setEnabled(false);
            }

            addFileSaved(file);

            Configuration.setString(Argo.KEY_MOST_RECENT_PROJECT_FILE,
                        file.getCanonicalPath());

            return true;
        } catch (Exception ex) {
            String sMessage =
                MessageFormat.format(Translator.localize(
                    "optionpane.save-project-general-exception"),
                         new Object[] {ex.getMessage()});

            JOptionPane.showMessageDialog(this, sMessage,
                    Translator.localize(
                    "optionpane.save-project-general-exception-title"),
                          JOptionPane.ERROR_MESSAGE);

            reportError(
                    pmw,
                    Translator.localize(
                            "dialog.error.save.error",
                            new Object[] {file.getName()}),
                    true, ex);

            LOG.log(Level.SEVERE,sMessage, ex);
        }

        return false;
    }

    private void testSimulateErrors() {
        if (false) {
            Layer lay =
                Globals.curEditor().getLayerManager().getActiveLayer();
            List figs = lay.getContentsNoEdges();
            Fig fig = (Fig) figs.get(0);
            LOG.log(Level.SEVERE, "Setting owner of "
                    + fig.getClass().getName() + " to null");
            fig.setOwner(null);
        }
    }

    private void reportError(ProgressMonitor monitor, final String message,
            boolean showUI) {
        if (showUI) {
            if (monitor != null) {
                monitor.notifyMessage(
                        Translator.localize("dialog.error.title"),
                        Translator.localize("dialog.error.open.save.error"),
                        message);
            } else {
                SwingUtilities.invokeLater(new Runnable() {
                    public void run() {
                        JDialog dialog =
                            new ExceptionDialog(
                                    ArgoFrame.getFrame(),
                                    Translator.localize("dialog.error.title"),
                                    Translator.localize(
                                            "dialog.error.open.save.error"),
                                    message);
                        dialog.setVisible(true);
                    }
                });
            }
        } else {
            System.err.print(message);
        }
    }

    private void reportError(ProgressMonitor monitor, final String message,
            boolean showUI, final Throwable ex) {
        if (showUI) {
            if (monitor != null) {
                monitor.notifyMessage(
                        Translator.localize("dialog.error.title"),
                        message,
                        ExceptionDialog.formatException(
                                message, ex, ex instanceof OpenException));
            } else {
                SwingUtilities.invokeLater(new Runnable() {
                    public void run() {
                        JDialog dialog =
                            new ExceptionDialog(
                                    ArgoFrame.getFrame(),
                                    Translator.localize("dialog.error.title"),
                                    message,
                                    ExceptionDialog.formatException(
                                                message, ex,
                                                ex instanceof OpenException));
                        dialog.setVisible(true);
                    }
                });
            }
        } else {
            StringWriter sw = new StringWriter();
            PrintWriter pw = new PrintWriter(sw);
            ex.printStackTrace(pw);
            String exception = sw.toString();
            reportError(monitor, "Please report the error below to the ArgoUML"
                    + "development team at http://argouml.tigris.org.\n"
                    + message + "\n\n" + exception, showUI);
        }
    }

    private void addFileSaved(File file) throws IOException {
        GenericArgoMenuBar menu = (GenericArgoMenuBar) getJMenuBar();
        if (menu != null) {
            menu.addFileSaved(file.getCanonicalPath());
        }
    }

    public boolean askConfirmationAndSave() {
        ProjectBrowser pb = ProjectBrowser.getInstance();
        Project p = ProjectManager.getManager().getCurrentProject();

        if (p != null && saveAction.isEnabled()) {
            String t =
                MessageFormat.format(Translator.localize(
                        "optionpane.open-project-save-changes-to"),
                        new Object[] {p.getName()});

            int response =
                JOptionPane.showConfirmDialog(pb, t, t,
                    JOptionPane.YES_NO_CANCEL_OPTION);

            if (response == JOptionPane.CANCEL_OPTION
                    || response == JOptionPane.CLOSED_OPTION) {
                return false;
            }
            if (response == JOptionPane.YES_OPTION) {
                trySave(ProjectManager.getManager().getCurrentProject() != null
                        && ProjectManager.getManager().getCurrentProject()
                                .getURI() != null);
                if (saveAction.isEnabled()) {
                    return false;
                }
            }
        }
        return true;
    }

    public void loadProjectWithProgressMonitor(File file, boolean showUI) {
        LoadSwingWorker worker = new LoadSwingWorker(file, showUI);
        worker.start();
    }

    public boolean loadProject(File file, boolean showUI,
            ProgressMonitor pmw) {
        return (loadProject2(file, showUI, pmw) != null);
    }

    public Project loadProject2(File file, boolean showUI,
            ProgressMonitor pmw) {
        LOG.log(Level.INFO, "Loading project.");

        PersistenceManager pm = PersistenceManager.getInstance();
        Project oldProject = ProjectManager.getManager().getCurrentProject();
        if (oldProject != null) {
            Project p = ProjectManager.getManager().makeEmptyProject();
            ProjectManager.getManager().setCurrentProject(p);
            ProjectManager.getManager().removeProject(oldProject);
            oldProject = p;
        }

        boolean success = false;

        Designer.disableCritiquing();
        Designer.clearCritiquing();
        clearDialogs();
        Project project = null;

        if (!(file.canRead())) {
            reportError(pmw, "File not found " + file + ".", showUI);
            Designer.enableCritiquing();
            success = false;
        } else {
            ProjectFilePersister persister =
                pm.getPersisterFromFileName(file.getName());
            if (persister == null) {
                throw new IllegalStateException("Filename "
                        + file.getName()
                        + " is not of a known file type");
            }

            if (pmw != null) {
                persister.addProgressListener(pmw);
            }

            project = persister.doLoad(file);

            if (pmw != null) {
                persister.removeProgressListener(pmw);
            }
            ThreadUtils.checkIfInterrupted();

            this.addFileSaved(file);
            Configuration.setString(Argo.KEY_MOST_RECENT_PROJECT_FILE,
                        file.getCanonicalPath());

            updateStatus(
                    Translator.localize(
                            "statusmsg.bar.open-project-status-read",
                            new Object[] {file.getName(), }));
            success = true;
        }

        if (!success) {
            project =
                ProjectManager.getManager().makeEmptyProject();
        }
        ProjectManager.getManager().setCurrentProject(project);
        if (oldProject != null) {
            ProjectManager.getManager().removeProject(oldProject);
        }

        project.getProjectSettings().init();

        Command cmd = new NonUndoableCommand() {
            public Object execute() {
                return null;
            }
        };
        project.getUndoManager().addCommand(cmd);

        LOG.log(Level.INFO,
                "There are {0} diagrams in the current project",
                project.getDiagramList().size());

        Designer.enableCritiquing();
        return project;
    }

    public void clearDialogs() {
        Window[] windows = getOwnedWindows();
        for (int i = 0; i < windows.length; i++) {
            if (!(windows[i] instanceof FindDialog)) {
                windows[i].dispose();
            }
        }
        FindDialog.getInstance().reset();
    }

    public AbstractAction getSaveAction() {
        return saveAction;
    }

    public AbstractAction getRemoveFromDiagramAction() {
        return removeFromDiagram;
    }

    protected File getNewFile() {
        ProjectBrowser pb = ProjectBrowser.getInstance();
        Project p = ProjectManager.getManager().getCurrentProject();

        JFileChooser chooser = null;
        URI uri = p.getURI();

        if (uri != null) {
            File projectFile = new File(uri);
            if (projectFile.length() > 0) {
                chooser = new JFileChooser(projectFile);
            } else {
                chooser = new JFileChooser();
            }
            chooser.setSelectedFile(projectFile);
        } else {
            chooser = new JFileChooser();
        }

        String sChooserTitle =
            Translator.localize("filechooser.save-as-project");
        chooser.setDialogTitle(sChooserTitle + " " + p.getName());

        chooser.setFileView(ProjectFileView.getInstance());

        chooser.setAcceptAllFileFilterUsed(false);

        PersistenceManager.getInstance().setSaveFileChooserFilters(
                chooser,
                uri != null ? Util.URIToFilename(uri.toString()) : null);

        int retval = chooser.showSaveDialog(pb);
        if (retval == JFileChooser.APPROVE_OPTION) {
            File theFile = chooser.getSelectedFile();
            AbstractFilePersister filter =
                (AbstractFilePersister) chooser.getFileFilter();
            if (theFile != null) {
                Configuration.setString(
                        PersistenceManager.KEY_PROJECT_NAME_PATH,
                        PersistenceManager.getInstance().getBaseName(
                                theFile.getPath()));
                String name = theFile.getName();
                if (!name.endsWith("." + filter.getExtension())) {
                    theFile =
                        new File(
                            theFile.getParent(),
                            name + "." + filter.getExtension());
                }
            }
            PersistenceManager.getInstance().setSavePersister(filter);
            return theFile;
        }
        return null;
    }

    private static final long serialVersionUID = 6974246679451284917L;
}