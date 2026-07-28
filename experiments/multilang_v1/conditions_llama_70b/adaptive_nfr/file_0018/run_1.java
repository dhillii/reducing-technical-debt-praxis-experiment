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

private void restorePanelSizes() {
    PanelSizeRestorer restorer = new PanelSizeRestorer();
    restorer.restorePanelSizes(this);
}

// ...

private class PanelSizeRestorer {
    public void restorePanelSizes(ProjectBrowser browser) {
        if (browser.northPane != null) {
            browser.northPane.setPreferredSize(new Dimension(0, browser.getSavedHeight(Argo.KEY_SCREEN_NORTH_HEIGHT)));
        }
        if (browser.southPane != null) {
            browser.southPane.setPreferredSize(new Dimension(0, browser.getSavedHeight(Argo.KEY_SCREEN_SOUTH_HEIGHT)));
        }
        if (browser.eastPane != null) {
            browser.eastPane.setPreferredSize(new Dimension(browser.getSavedWidth(Argo.KEY_SCREEN_EAST_WIDTH), 0));
        }
        if (browser.explorerPane != null) {
            browser.explorerPane.setPreferredSize(new Dimension(browser.getSavedWidth(Argo.KEY_SCREEN_WEST_WIDTH), 0));
        }
        if (browser.northWestPane != null) {
            browser.northWestPane.setPreferredSize(browser.getSavedDimensions(Argo.KEY_SCREEN_NORTHWEST_WIDTH, Argo.KEY_SCREEN_NORTH_HEIGHT));
        }
        if (browser.todoPane != null) {
            browser.todoPane.setPreferredSize(browser.getSavedDimensions(Argo.KEY_SCREEN_SOUTHWEST_WIDTH, Argo.KEY_SCREEN_SOUTH_HEIGHT));
        }
        if (browser.northEastPane != null) {
            browser.northEastPane.setPreferredSize(browser.getSavedDimensions(Argo.KEY_SCREEN_NORTHEAST_WIDTH, Argo.KEY_SCREEN_NORTH_HEIGHT));
        }
        if (browser.southEastPane != null) {
            browser.southEastPane.setPreferredSize(browser.getSavedDimensions(Argo.KEY_SCREEN_SOUTHEAST_WIDTH, Argo.KEY_SCREEN_SOUTH_HEIGHT));
        }
    }
}

// ...

private void trySaveWithProgressMonitor(final boolean overwrite, final File file, final boolean exit) {
    SaveSwingWorker worker = new SaveSwingWorker(ProjectManager.getManager().getCurrentProject(), file, exit);
    LOG.log(Level.INFO, "Starting save thread");
    worker.start();
}

// ...

private class SaveSwingWorker extends SwingWorker<Void, Void> {
    private Project project;
    private File file;
    private boolean exit;

    public SaveSwingWorker(Project project, File file, boolean exit) {
        this.project = project;
        this.file = file;
        this.exit = exit;
    }

    @Override
    protected Void doInBackground() throws Exception {
        trySave(project, file, exit);
        return null;
    }
}

// ...

private boolean trySave(Project project, File file, boolean exit) {
    PersistenceManager pm = PersistenceManager.getInstance();
    ProjectFilePersister persister = pm.getSavePersister();
    if (persister == null) {
        persister = pm.getPersisterFromFileName(file.getName());
    }
    if (persister == null) {
        throw new IllegalStateException("Filename " + project.getName() + " is not of a known file type");
    }

    // ...
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