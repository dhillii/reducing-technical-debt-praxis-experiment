@Override
public Vector getPopUpActions(MouseEvent me) {
    ActionList popUpActions = getBasePopUpActions(me);
    popUpActions = addModuleActions(popUpActions);
    popUpActions = addSeparatorAndRemoveActions(popUpActions);
    popUpActions = addCritiqueActions(popUpActions, me);
    popUpActions = addStereotypeActions(popUpActions);
    return popUpActions;
}

/**
 * Get the base popup actions from the superclass.
 * 
 * @param me the MouseEvent that triggered the popup menu request
 * @return a Vector containing the base popup actions
 */
private ActionList getBasePopUpActions(MouseEvent me) {
    return new ActionList(super.getPopUpActions(me), isReadOnly());
}

/**
 * Add module actions to the popup actions.
 * 
 * @param popUpActions the current popup actions
 * @return the updated popup actions
 */
private ActionList addModuleActions(ActionList popUpActions) {
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
    return popUpActions;
}

/**
 * Add a separator and remove actions to the popup actions.
 * 
 * @param popUpActions the current popup actions
 * @return the updated popup actions
 */
private ActionList addSeparatorAndRemoveActions(ActionList popUpActions) {
    popUpActions.add(new JSeparator());
    popupAddOffset = 1;
    if (removeFromDiagram) {
        popUpActions.add(ProjectActions.getInstance().getRemoveFromDiagramAction());
        popupAddOffset++;
    }
    popUpActions.add(new ActionDeleteModelElements());
    popupAddOffset++;
    return popUpActions;
}

/**
 * Add critique actions to the popup actions.
 * 
 * @param popUpActions the current popup actions
 * @param me the MouseEvent that triggered the popup menu request
 * @return the updated popup actions
 */
private ActionList addCritiqueActions(ActionList popUpActions, MouseEvent me) {
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
    return popUpActions;
}

/**
 * Add stereotype actions to the popup actions.
 * 
 * @param popUpActions the current popup actions
 * @return the updated popup actions
 */
private ActionList addStereotypeActions(ActionList popUpActions) {
    Action[] stereoActions = getApplyStereotypeActions();
    if (stereoActions != null && stereoActions.length > 0) {
        popUpActions.add(0, new JSeparator());
        ArgoJMenu stereotypes = new ArgoJMenu("menu.popup.apply-stereotypes");
        for (int i = 0; i < stereoActions.length; ++i) {
            stereotypes.addCheckItem(stereoActions[i]);
        }
        popUpActions.add(0, stereotypes);
    }
    return popUpActions;
}