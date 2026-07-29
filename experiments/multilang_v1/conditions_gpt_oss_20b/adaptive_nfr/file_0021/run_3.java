public Vector getPopUpActions(MouseEvent me) {
    ActionList popUpActions =
        new ActionList(super.getPopUpActions(me), isReadOnly());

    addModuleActions(popUpActions);
    addSeparatorAndOffset(popUpActions, 1);
    addRemoveFromDiagramAction(popUpActions);
    addDeleteAction(popUpActions);
    addCritiquesSubmenu(popUpActions, me);
    addStereotypesSubmenu(popUpActions);
    return popUpActions;
}

/**
 * Adds the module actions provided by {@link ContextActionFactoryManager}
 * to the popup menu.
 *
 * @param popUpActions the action list to populate
 */
private void addModuleActions(ActionList popUpActions) {
    List<Action> modulesActions =
        ContextActionFactoryManager.getContextPopupActions();
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
 * Adds a separator to the popup menu and updates {@code popupAddOffset}
 * by the specified amount.
 *
 * @param popUpActions the action list to modify
 * @param offset the number of items added after the separator
 */
private void addSeparatorAndOffset(ActionList popUpActions, int offset) {
    popUpActions.add(new JSeparator());
    popupAddOffset = offset;
}

/**
 * Adds the "Remove from Diagram" action if allowed.
 *
 * @param popUpActions the action list to modify
 */
private void addRemoveFromDiagramAction(ActionList popUpActions) {
    if (removeFromDiagram) {
        popUpActions.add(
            ProjectActions.getInstance().getRemoveFromDiagramAction());
        popupAddOffset++;
    }
}

/**
 * Adds the "Delete Model Elements" action.
 *
 * @param popUpActions the action list to modify
 */
private void addDeleteAction(ActionList popUpActions) {
    popUpActions.add(new ActionDeleteModelElements());
    popupAddOffset++;
}

/**
 * Adds the critiques submenu if there is a single target and
 * there are critiques for the owner.
 *
 * @param popUpActions the action list to modify
 * @param me the mouse event that triggered the popup
 */
private void addCritiquesSubmenu(ActionList popUpActions, MouseEvent me) {
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
 * Adds the stereotypes submenu if there are applicable actions.
 *
 * @param popUpActions the action list to modify
 */
private void addStereotypesSubmenu(ActionList popUpActions) {
    Action[] stereoActions = getApplyStereotypeActions();
    if (stereoActions != null && stereoActions.length > 0) {
        popUpActions.add(0, new JSeparator());
        ArgoJMenu stereotypes = new ArgoJMenu(
                "menu.popup.apply-stereotypes");
        for (Action action : stereoActions) {
            stereotypes.addCheckItem(action);
        }
        popUpActions.add(0, stereotypes);
    }
}