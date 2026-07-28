@Override
public Vector getPopUpActions(MouseEvent me) {
    ActionList popUpActions = new ActionList(super.getPopUpActions(me), isReadOnly());

    // Load extra menu content
    final List<Action> modulesActions = ContextActionFactoryManager.getContextPopupActions();
    addActionsToPopUp(popUpActions, modulesActions);

    // Add separator and actions
    addSeparatorAndActions(popUpActions);

    // Add critiques menu
    addCritiquesMenu(popUpActions, me);

    // Add stereotypes submenu
    addStereotypesMenu(popUpActions);

    return popUpActions;
}

private void addActionsToPopUp(ActionList popUpActions, List<Action> modulesActions) {
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

private void addSeparatorAndActions(ActionList popUpActions) {
    popUpActions.add(new JSeparator());
    popupAddOffset = 1;
    if (removeFromDiagram) {
        popUpActions.add(ProjectActions.getInstance().getRemoveFromDiagramAction());
        popupAddOffset++;
    }
    popUpActions.add(new ActionDeleteModelElements());
    popupAddOffset++;
}

private void addCritiquesMenu(ActionList popUpActions, MouseEvent me) {
    if (TargetManager.getInstance().getTargets().size() == 1) {
        ToDoList list = Designer.theDesigner().getToDoList();
        List<ToDoItem> items = list.elementListForOffender(getOwner());
        if (items != null && items.size() > 0) {
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

private void addStereotypesMenu(ActionList popUpActions) {
    Action[] stereoActions = getApplyStereotypeActions();
    if (stereoActions != null && stereoActions.length > 0) {
        popUpActions.add(0, new JSeparator());
        ArgoJMenu stereotypes = new ArgoJMenu("menu.popup.apply-stereotypes");
        for (int i = 0; i < stereoActions.length; ++i) {
            stereotypes.addCheckItem(stereoActions[i]);
        }
        popUpActions.add(0, stereotypes);
    }
}