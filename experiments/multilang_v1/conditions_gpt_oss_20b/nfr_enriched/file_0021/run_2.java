public Vector getPopUpActions(MouseEvent me) {
    ActionList popUpActions = new ActionList(super.getPopUpActions(me), isReadOnly());
    addContextActions(popUpActions);
    addRemoveAndDeleteActions(popUpActions);
    addCritiquesMenu(popUpActions, me);
    addStereotypeSubmenu(popUpActions);
    return popUpActions;
}

/**
 * Adds context-specific actions provided by modules to the popup menu.
 *
 * @param popUpActions the ActionList to populate
 */
private void addContextActions(ActionList popUpActions) {
    List<Action> modulesActions = ContextActionFactoryManager.getContextPopupActions();
    for (Action a : modulesActions) {
        if (a instanceof List) {
            JMenu m = new JMenu((Action) a);
            popUpActions.add(m);
            for (Action subAction : (List<Action>) a) {
                m.add(subAction);
            }
        } else {
            popUpActions.add(a);
        }
    }
}

/**
 * Adds the standard remove-from-diagram and delete actions to the popup menu.
 *
 * @param popUpActions the ActionList to populate
 */
private void addRemoveAndDeleteActions(ActionList popUpActions) {
    popUpActions.add(new JSeparator());
    popupAddOffset = 1;
    if (removeFromDiagram) {
        popUpActions.add(ProjectActions.getInstance().getRemoveFromDiagramAction());
        popupAddOffset++;
    }
    popUpActions.add(new ActionDeleteModelElements());
    popupAddOffset++;
}

/**
 * Adds a critiques submenu to the popup menu if applicable.
 *
 * @param popUpActions the ActionList to populate
 * @param me the MouseEvent that triggered the popup menu request
 */
private void addCritiquesMenu(ActionList popUpActions, MouseEvent me) {
    if (TargetManager.getInstance().getTargets().size() == 1) {
        ToDoList list = Designer.theDesigner().getToDoList();
        List<ToDoItem> items = list.elementListForOffender(getOwner());
        if (items != null && !items.isEmpty()) {
            ArgoJMenu critiques = new ArgoJMenu("menu.popup.critiques");
            ToDoItem itemUnderMouse = hitClarifier(me.getX(), me.getY());
            if (itemUnderMouse != null) {
                critiques.add(new ActionGoToCritique(itemUnderMouse));
                critiques.addSeparator();
            }
            for (ToDoItem item : items) {
                if (item == itemUnderMouse) {
                    continue;
                }
                critiques.add(new ActionGoToCritique(item));
            }
            popUpActions.add(0, new JSeparator());
            popUpActions.add(0, critiques);
        }
    }
}

/**
 * Adds a stereotypes submenu to the popup menu if applicable.
 *
 * @param popUpActions the ActionList to populate
 */
private void addStereotypeSubmenu(ActionList popUpActions) {
    Action[] stereoActions = getApplyStereotypeActions();
    if (stereoActions != null && stereoActions.length > 0) {
        popUpActions.add(0, new JSeparator());
        ArgoJMenu stereotypes = new ArgoJMenu("menu.popup.apply-stereotypes");
        for (Action action : stereoActions) {
            stereotypes.addCheckItem(action);
        }
        popUpActions.add(0, stereotypes);
    }
}