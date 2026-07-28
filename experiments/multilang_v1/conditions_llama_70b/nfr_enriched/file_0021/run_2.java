@Override
public Vector getPopUpActions(MouseEvent me) {
    ActionList popUpActions = createBasePopUpActions(me);
    addExtraPopUpActions(popUpActions, me);
    return popUpActions;
}

/**
 * Creates the base popup actions for this FigEdgeModelElement.
 * 
 * @param me the MouseEvent that triggered the popup menu request
 * @return the base popup actions
 */
private ActionList createBasePopUpActions(MouseEvent me) {
    ActionList popUpActions = new ActionList(super.getPopUpActions(me), isReadOnly());
    // Added this part to load the extra menu content
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

    // popupAddOffset should be equal to the number of items added here:
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
 * Adds extra popup actions specific to this FigEdgeModelElement.
 * 
 * @param popUpActions the base popup actions
 * @param me the MouseEvent that triggered the popup menu request
 */
private void addExtraPopUpActions(ActionList popUpActions, MouseEvent me) {
    if (TargetManager.getInstance().getTargets().size() == 1) {
        ToDoList list = Designer.theDesigner().getToDoList();
        List<ToDoItem> items = list.elementListForOffender(getOwner());
        if (items != null && items.size() > 0) {
            // TODO: This creates a dependency on the Critics subsystem.
            // We need a generic way for modules (including our internal
            // subsystems) to request addition of actions to the popup
            // menu. - tfm 20080430
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

    // Add stereotypes submenu
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