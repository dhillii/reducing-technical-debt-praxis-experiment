/**
 * Get the popup actions for this FigEdgeModelElement.
 * 
 * @param me the MouseEvent that triggered the popup menu request
 * @return a Vector containing a combination of these 4 types: Action, JMenu, JMenuItem, JSeparator.
 */
@Override
public Vector getPopUpActions(MouseEvent me) {
    ActionList popUpActions = new ActionList(super.getPopUpActions(me), isReadOnly());

    // Load extra menu content
    final List<Action> modulesActions = ContextActionFactoryManager.getContextPopupActions();

    // Add modules actions to popup
    addModulesActions(popUpActions, modulesActions);

    // Add separator and remove from diagram action if applicable
    addRemoveFromDiagramAction(popUpActions);

    // Add delete model elements action
    popUpActions.add(new ActionDeleteModelElements());

    // Add critiques menu if applicable
    addCritiquesMenu(popUpActions, me);

    // Add stereotypes submenu if applicable
    addStereotypesMenu(popUpActions);

    return popUpActions;
}

/**
 * Add modules actions to the popup actions list.
 * 
 * @param popUpActions the list of popup actions
 * @param modulesActions the list of modules actions
 */
private void addModulesActions(ActionList popUpActions, List<Action> modulesActions) {
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
 * Add remove from diagram action to the popup actions list if applicable.
 * 
 * @param popUpActions the list of popup actions
 */
private void addRemoveFromDiagramAction(ActionList popUpActions) {
    popUpActions.add(new JSeparator());
    popupAddOffset = 1;
    if (removeFromDiagram) {
        popUpActions.add(ProjectActions.getInstance().getRemoveFromDiagramAction());
        popupAddOffset++;
    }
}

/**
 * Add critiques menu to the popup actions list if applicable.
 * 
 * @param popUpActions the list of popup actions
 * @param me the MouseEvent that triggered the popup menu request
 */
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

/**
 * Add stereotypes menu to the popup actions list if applicable.
 * 
 * @param popUpActions the list of popup actions
 */
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