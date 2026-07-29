@Override
public Vector getPopUpActions(MouseEvent me) {
    ActionList popUpActions = new ActionList(super.getPopUpActions(me), isReadOnly());
    addModuleActions(popUpActions);
    addRemoveFromDiagramActions(popUpActions);
    addCritiques(popUpActions, me);
    addStereotypeActions(popUpActions);
    return popUpActions;
}

private void addModuleActions(ActionList popUpActions) {
    List<?> modulesActions = ContextActionFactoryManager.getContextPopupActions();
    for (Object a : modulesActions) {
        if (a instanceof List) {
            @SuppressWarnings("unchecked")
            List<Action> subActions = (List<Action>) a;
            JMenu m = new JMenu(subActions.get(0));
            popUpActions.add(m);
            for (Action subAction : subActions) {
                m.add(subAction);
            }
        } else if (a instanceof Action) {
            popUpActions.add((Action) a);
        }
    }
}

private void addRemoveFromDiagramActions(ActionList popUpActions) {
    popUpActions.add(new JSeparator());
    int offset = 1;
    if (removeFromDiagram) {
        popUpActions.add(ProjectActions.getInstance().getRemoveFromDiagramAction());
        offset++;
    }
    popUpActions.add(new ActionDeleteModelElements());
    offset++;
    popupAddOffset = offset;
}

private void addCritiques(ActionList popUpActions, MouseEvent me) {
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

private void addStereotypeActions(ActionList popUpActions) {
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