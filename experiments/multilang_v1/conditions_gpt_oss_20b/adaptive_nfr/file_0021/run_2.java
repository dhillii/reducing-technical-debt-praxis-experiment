public abstract class FigEdgeModelElement
    extends FigEdgePoly
    implements
        VetoableChangeListener,
        DelayedVChangeListener,
        MouseListener,
        KeyListener,
        PropertyChangeListener,
        ArgoNotationEventListener,
        NotationRenderer,
        ArgoDiagramAppearanceEventListener,
        Highlightable,
        IItemUID,
        ArgoFig,
        Clarifiable,
        DiagramElement,
        Owned {

    // ... existing fields and methods ...

    /**
     * {@inheritDoc}
     */
    @Override
    public Vector getPopUpActions(MouseEvent me) {
        ActionList popUpActions =
            new ActionList(super.getPopUpActions(me), isReadOnly());

        addModulesActions(popUpActions);
        addSeparator(popUpActions);
        popupAddOffset = 1;
        addRemoveFromDiagramAction(popUpActions);
        addDeleteAction(popUpActions);
        addCritiquesMenu(popUpActions, me);
        addStereotypeMenu(popUpActions);

        return popUpActions;
    }

    /**
     * Adds the context module actions to the popup menu.
     *
     * @param popUpActions the action list to populate
     */
    private void addModulesActions(ActionList popUpActions) {
        final List<Action> modulesActions =
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
     * Adds a separator to the popup menu.
     *
     * @param popUpActions the action list to populate
     */
    private void addSeparator(ActionList popUpActions) {
        popUpActions.add(new JSeparator());
    }

    /**
     * Adds the remove-from-diagram action if allowed.
     *
     * @param popUpActions the action list to populate
     */
    private void addRemoveFromDiagramAction(ActionList popUpActions) {
        if (removeFromDiagram) {
            popUpActions.add(
                ProjectActions.getInstance().getRemoveFromDiagramAction());
            popupAddOffset++;
        }
    }

    /**
     * Adds the delete-model-elements action.
     *
     * @param popUpActions the action list to populate
     */
    private void addDeleteAction(ActionList popUpActions) {
        popUpActions.add(new ActionDeleteModelElements());
        popupAddOffset++;
    }

    /**
     * Adds the critiques submenu if applicable.
     *
     * @param popUpActions the action list to populate
     * @param me the mouse event that triggered the popup
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
     * Adds the stereotypes submenu if applicable.
     *
     * @param popUpActions the action list to populate
     */
    private void addStereotypeMenu(ActionList popUpActions) {
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

    // ... remaining existing methods ...
}