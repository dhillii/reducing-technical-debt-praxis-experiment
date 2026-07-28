private static final String REMOVE_EVENT = "remove";

// ...

/* Listen to machine deletion,
 * to delete the diagram. */
Model.getPump().addModelEventListener(this, theStateMachine,
        new String[] {REMOVE_EVENT, "namespace"});

// ...

@Override
public void propertyChange(PropertyChangeEvent evt) {
    if ((evt.getSource() == theStateMachine)
            && (evt instanceof DeleteInstanceEvent)
            && REMOVE_EVENT.equals(evt.getPropertyName())) {
        Model.getPump().removeModelEventListener(this,
                theStateMachine, new String[] {REMOVE_EVENT, "namespace"});
        if (getProject() != null) {
            getProject().moveToTrash(this);
        } else {
            DiagramFactory.getInstance().removeDiagram(this);
        }
    }
    // ...
}