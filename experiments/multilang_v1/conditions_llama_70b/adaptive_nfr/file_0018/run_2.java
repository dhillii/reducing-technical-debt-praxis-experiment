// Refactored code for ProjectBrowser.java

// ...

// Extracted method to handle project loading
private Project loadProjectInternal(File file, ProgressMonitor pmw) {
    PersistenceManager pm = PersistenceManager.getInstance();
    Project oldProject = ProjectManager.getManager().getCurrentProject();
    if (oldProject != null) {
        // Remove the old project first.  It's wasteful to create a temp
        // empty project, but too much of ArgoUML depends on having a
        // current project
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

    try {
        ProjectFilePersister persister = pm.getPersisterFromFileName(file.getName());
        if (persister == null) {
            throw new IllegalStateException("Filename " + file.getName() + " is not of a known file type");
        }

        if (pmw != null) {
            persister.addProgressListener(pmw);
        }

        project = persister.doLoad(file);

        if (pmw != null) {
            persister.removeProgressListener(pmw);
        }
        ThreadUtils.checkIfInterrupted();

        // Let's save this project in the mru list
        this.addFileSaved(file);
        // Let's save this project as the last used one
        // in the configuration file
        Configuration.setString(Argo.KEY_MOST_RECENT_PROJECT_FILE, file.getCanonicalPath());

        updateStatus(Translator.localize("statusmsg.bar.open-project-status-read", new Object[] {file.getName(), }));
        success = true;
    } catch (Exception ex) {
        reportError(pmw, Translator.localize("dialog.error.open.error", new Object[] {file.getName()}), true, ex);
    } finally {
        try {
            if (!success) {
                project = ProjectManager.getManager().makeEmptyProject();
            }
            ProjectManager.getManager().setCurrentProject(project);
            if (oldProject != null) {
                ProjectManager.getManager().removeProject(oldProject);
            }

            project.getProjectSettings().init();

            Command cmd = new NonUndoableCommand() {
                public Object execute() {
                    // This is temporary. Load project
                    // should create a new project
                    // with its own UndoManager and so
                    // there should be no Command
                    return null;
                }
            };
            project.getUndoManager().addCommand(cmd);

            LOG.log(Level.INFO, "There are {0} diagrams in the current project", project.getDiagramList().size());

            Designer.enableCritiquing();
        } finally {
            // Make sure save action is always reinstated
            this.saveAction = rememberedSaveAction;

            // We clear the save-required flag on the Swing event thread
            // in the hopes that it gets done after any other background
            // work (listener updates) that is being done there
            SwingUtilities.invokeLater(new Runnable() {
                public void run() {
                    ProjectManager.getManager().setSaveAction(rememberedSaveAction);
                    rememberedSaveAction.setEnabled(false);
                }
            });
        }
    }
    return success ? project : null;
}

// Refactored method to load project with progress monitor
public boolean loadProject(File file, boolean showUI, ProgressMonitor pmw) {
    return loadProjectInternal(file, pmw) != null;
}

// Refactored method to load project with progress monitor and return project
public Project loadProject2(File file, boolean showUI, ProgressMonitor pmw) {
    return loadProjectInternal(file, pmw);
}

// ...

// Extracted method to handle project saving
private boolean trySaveInternal(File file, ProgressMonitor pmw, Project project) {
    PersistenceManager pm = PersistenceManager.getInstance();
    ProjectFilePersister persister = null;

    try {
        String sStatus = MessageFormat.format(Translator.localize("statusmsg.bar.save-project-status-writing"), new Object[] {file});
        updateStatus(sStatus);

        persister = pm.getSavePersister();
        pm.setSavePersister(null);
        if (persister == null) {
            persister = pm.getPersisterFromFileName(file.getName());
        }
        if (persister == null) {
            throw new IllegalStateException("Filename " + project.getName() + " is not of a known file type");
        }

        testSimulateErrors();

        // Repair any errors in the project
        String report = project.repair();
        if (report.length() > 0) {
            // TODO: i18n
            report = "An inconsistency has been detected when saving the model." + "These have been repaired and are reported below. " + "The save will continue with the model having been " + "amended as described.\n" + report;
            reportError(pmw, Translator.localize("dialog.repair") + report, true);
        }

        if (pmw != null) {
            pmw.updateProgress(25);
            persister.addProgressListener(pmw);
        }

        project.preSave();
        persister.save(project, file);
        project.postSave();

        ArgoEventPump.fireEvent(new ArgoStatusEvent(ArgoEventTypes.STATUS_PROJECT_SAVED, this, file.getAbsolutePath()));
        LOG.fine("setting most recent project file to " + file.getCanonicalPath());

        /*
         * notification of menu bar
         */
        if (saveAction != null) {
            // Bob says - not sure how saveAction could be null here but
            // NPE has been reported. See issue 6233. As Tom comments
            // elsewhere we should be listening for file save events.
            // That would allow us to have a final saveAction instance
            // that can never be null
            saveAction.setEnabled(false);
        }

        addFileSaved(file);

        Configuration.setString(Argo.KEY_MOST_RECENT_PROJECT_FILE, file.getCanonicalPath());

        return true;
    } catch (Exception ex) {
        String sMessage = MessageFormat.format(Translator.localize("optionpane.save-project-general-exception"), new Object[] {ex.getMessage()});

        JOptionPane.showMessageDialog(this, sMessage, Translator.localize("optionpane.save-project-general-exception-title"), JOptionPane.ERROR_MESSAGE);

        reportError(pmw, Translator.localize("dialog.error.save.error", new Object[] {file.getName()}), true, ex);

        LOG.log(Level.SEVERE, sMessage, ex);
    }
    return false;
}

// Refactored method to try save project
public boolean trySave(boolean overwrite, File file, ProgressMonitor pmw) {
    return trySaveInternal(file, pmw, ProjectManager.getManager().getCurrentProject());
}

// ...

// Extracted method to handle target changed
private void targetChangedInternal(Object target) {
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

// Refactored method to handle target added
public void targetAdded(TargetEvent e) {
    targetChangedInternal(e.getNewTarget());
}

// Refactored method to handle target removed
public void targetRemoved(TargetEvent e) {
    targetChangedInternal(e.getNewTarget());
}

// Refactored method to handle target set
public void targetSet(TargetEvent e) {
    targetChangedInternal(e.getNewTarget());
}

// ...