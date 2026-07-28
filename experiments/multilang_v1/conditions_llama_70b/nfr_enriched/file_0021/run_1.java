@Override
public Vector getPopUpActions(MouseEvent me) {
    ActionList popUpActions = new ActionList(super.getPopUpActions(me), isReadOnly());
    addModuleActions(popUpActions);
    addSeparatorAndRemoveActions(popUpActions);
    addCritiqueActions(popUpActions, me);
    addStereotypeActions(popUpActions);
    return popUpActions;
}

/**
 * Adds actions from modules to the popup actions list.
 * 
 * @param popUpActions the list of popup actions
 */
private void addModuleActions(ActionList popUpActions) {
    final List<Action> modulesActions = ContextActionFactoryManager.getContextPopupActions();
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
 * Adds a separator and remove actions to the popup actions list.
 * 
 * @param popUpActions the list of popup actions
 */
private void addSeparatorAndRemoveActions(ActionList popUpActions) {
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
 * Adds critique actions to the popup actions list.
 * 
 * @param popUpActions the list of popup actions
 * @param me the mouse event
 */
private void addCritiqueActions(ActionList popUpActions, MouseEvent me) {
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

/**
 * Adds stereotype actions to the popup actions list.
 * 
 * @param popUpActions the list of popup actions
 */
private void addStereotypeActions(ActionList popUpActions) {
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