private static final String REMOVE_EVENT = "remove";
private static final String NAMESPACE_EVENT = "namespace";

// ...

public void setup(Object namespace, Object machine) {
    setNamespace(namespace);

    theStateMachine = machine;

    StateDiagramGraphModel gm = createGraphModel();
    gm.setHomeModel(namespace);
    if (theStateMachine != null) {
        gm.setMachine(theStateMachine);
    }
    StateDiagramRenderer rend = new StateDiagramRenderer(); // singleton

    LayerPerspective lay = new LayerPerspectiveMutable(
            Model.getFacade().getName(namespace), gm);
    lay.setGraphNodeRenderer(rend);
    lay.setGraphEdgeRenderer(rend);
    setLayer(lay);

    /* Listen to machine deletion,
     * to delete the diagram. */
    Model.getPump().addModelEventListener(this, theStateMachine,
            new String[] {REMOVE_EVENT, NAMESPACE_EVENT});
}

// ...

@Override
public void propertyChange(PropertyChangeEvent evt) {
    if ((evt.getSource() == theStateMachine)
            && (evt instanceof DeleteInstanceEvent)
            && REMOVE_EVENT.equals(evt.getPropertyName())) {
        Model.getPump().removeModelEventListener(this,
                theStateMachine, new String[] {REMOVE_EVENT, NAMESPACE_EVENT});
        if (getProject() != null) {
            getProject().moveToTrash(this);
        } else {
            DiagramFactory.getInstance().removeDiagram(this);
        }
    }
    if (evt.getSource() == theStateMachine
            && NAMESPACE_EVENT.equals(evt.getPropertyName())) {
        Object newNamespace = evt.getNewValue();
        if (newNamespace != null // this in case we are being deleted
                && getNamespace() != newNamespace) {
            /* The namespace of the statemachine is changed! */
            setNamespace(newNamespace);
            ((UMLMutableGraphSupport) getGraphModel())
                            .setHomeModel(newNamespace);
        }
    }
}