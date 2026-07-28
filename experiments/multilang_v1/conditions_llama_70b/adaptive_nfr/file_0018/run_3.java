// ...

private void createDetailsPanes() {
    DetailsPaneFactory factory = new DetailsPaneFactory();
    detailsPanesByCompassPoint = factory.createDetailsPanes();
    // ...
}

// ...

private class DetailsPaneFactory {
    private Map<Position, DetailsPane> createDetailsPanes() {
        Map<Position, DetailsPane> detailsPanes = new HashMap<>();
        detailsPanes.put(Position.East, makeDetailsPane(BorderSplitPane.EAST, Vertical.getInstance()));
        detailsPanes.put(Position.South, makeDetailsPane(BorderSplitPane.SOUTH, Horizontal.getInstance()));
        detailsPanes.put(Position.SouthEast, makeDetailsPane(BorderSplitPane.SOUTHEAST, Horizontal.getInstance()));
        detailsPanes.put(Position.NorthWest, makeDetailsPane(BorderSplitPane.NORTHWEST, Horizontal.getInstance()));
        detailsPanes.put(Position.North, makeDetailsPane(BorderSplitPane.NORTH, Horizontal.getInstance()));
        detailsPanes.put(Position.NorthEast, makeDetailsPane(BorderSplitPane.NORTHEAST, Horizontal.getInstance()));
        return detailsPanes;
    }
}

// ...

private void addPanel(Component comp, Position position) {
    workAreaPane.add(comp, position.toString());
}

private void removePanel(Component comp) {
    workAreaPane.remove(comp);
    workAreaPane.validate();
    workAreaPane.repaint();
}

// ...

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

// ...

private void determineRemoveEnabled() {
    Editor editor = Globals.curEditor();
    Collection figs = editor.getSelectionManager().getFigs();
    boolean removeEnabled = !figs.isEmpty();
    GraphModel gm = editor.getGraphModel();
    if (gm instanceof UMLMutableGraphSupport) {
        removeEnabled = ((UMLMutableGraphSupport) gm).isRemoveFromDiagramAllowed(figs);
    }
    removeFromDiagram.setEnabled(removeEnabled);
}

// ...

private boolean trySaveWithProgressMonitor(final boolean overwrite, final File file, final boolean exit) {
    SaveSwingWorker worker = new SaveSwingWorker(ProjectManager.getManager().getCurrentProject(), file, exit);
    LOG.log(Level.INFO, "Starting save thread");
    worker.start();
    return true;
}

// ...

private class SaveSwingWorker extends SwingWorker<Boolean, Void> {
    private Project project;
    private File file;
    private boolean exit;

    public SaveSwingWorker(Project project, File file, boolean exit) {
        this.project = project;
        this.file = file;
        this.exit = exit;
    }

    @Override
    protected Boolean doInBackground() throws Exception {
        trySave(project, file, null);
        return true;
    }

    @Override
    protected void done() {
        if (exit) {
            exit();
        }
    }
}

// ...

private boolean trySave(Project project, File file, ProgressMonitor pmw) {
    PersistenceManager pm = PersistenceManager.getInstance();
    ProjectFilePersister persister = pm.getSavePersister();
    if (persister == null) {
        persister = pm.getPersisterFromFileName(file.getName());
    }
    if (persister == null) {
        throw new IllegalStateException("Filename " + project.getName() + " is not of a known file type");
    }
    try {
        project.preSave();
        persister.save(project, file);
        project.postSave();
        return true;
    } catch (Exception ex) {
        reportError(pmw, Translator.localize("dialog.error.save.error", new Object[] {file.getName()}), true, ex);
        return false;
    }
}

// ...

private void reportError(ProgressMonitor monitor, final String message, boolean showUI, final Throwable ex) {
    if (showUI) {
        if (monitor != null) {
            monitor.notifyMessage(Translator.localize("dialog.error.title"), message, ExceptionDialog.formatException(message, ex, ex instanceof OpenException));
        } else {
            SwingUtilities.invokeLater(new Runnable() {
                public void run() {
                    JDialog dialog = new ExceptionDialog(ArgoFrame.getFrame(), Translator.localize("dialog.error.title"), message, ExceptionDialog.formatException(message, ex, ex instanceof OpenException));
                    dialog.setVisible(true);
                }
            });
        }
    } else {
        StringWriter sw = new StringWriter();
        PrintWriter pw = new PrintWriter(sw);
        ex.printStackTrace(pw);
        String exception = sw.toString();
        reportError(monitor, "Please report the error below to the ArgoUML development team at http://argouml.tigris.org.\n" + message + "\n\n" + exception, showUI);
    }
}