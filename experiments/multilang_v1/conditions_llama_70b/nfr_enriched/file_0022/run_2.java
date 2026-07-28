private Property buildAssociationEndInternal(final Association assoc,
        final String name, final Type type,
        final Integer[] multi, final Stereotype stereo,
        final Boolean navigable, final Boolean order,
        final AggregationKind aggregation, 
        final Object changeable, final VisibilityKind visibility) {
    // The attribute 'targetScope' of an AssociationEnd in UML1.x is no
    // longer supported in UML2.x

    Property property = createAssociationEnd();
    property.setType((Type) type);
    property.setAssociation((Association) assoc);
    if (name != null) {
        property.setName(name);
    }
    if (navigable != null) {
        property.setIsNavigable(navigable);
        if (!(Boolean) navigable) {
            ((Association) assoc).getOwnedEnds().add(property);
        }
    }
    if (aggregation != null) {
        property.setAggregation((AggregationKind) aggregation);
    }
    if (visibility != null) {
        property.setVisibility((VisibilityKind) visibility);
    }
    if (multi != null) {
        if (multi[0] != null) {
            property.setLower(multi[0]);
        }
        if (multi[1] != null) {
            property.setUpper(multi[1]);
        }
    }
    if (order != null) {
        property.setIsOrdered((Boolean) order);
    }
    if (changeable != null) {
        property.setIsReadOnly((Boolean) changeable);
    }
    if (stereo != null) {
        if (property.isStereotypeApplicable((Stereotype) stereo)) {
            property.applyStereotype((Stereotype) stereo);
        } 
    }
    return property;
}

private void setAssociationEndProperties(Property property, 
        final String name, final Type type, 
        final Integer[] multi, final Stereotype stereo, 
        final Boolean navigable, final Boolean order, 
        final AggregationKind aggregation, 
        final Object changeable, final VisibilityKind visibility) {
    if (name != null) {
        property.setName(name);
    }
    property.setType((Type) type);
    if (navigable != null) {
        property.setIsNavigable(navigable);
    }
    if (aggregation != null) {
        property.setAggregation((AggregationKind) aggregation);
    }
    if (visibility != null) {
        property.setVisibility((VisibilityKind) visibility);
    }
    if (multi != null) {
        if (multi[0] != null) {
            property.setLower(multi[0]);
        }
        if (multi[1] != null) {
            property.setUpper(multi[1]);
        }
    }
    if (order != null) {
        property.setIsOrdered((Boolean) order);
    }
    if (changeable != null) {
        property.setIsReadOnly((Boolean) changeable);
    }
    if (stereo != null) {
        if (property.isStereotypeApplicable((Stereotype) stereo)) {
            property.applyStereotype((Stereotype) stereo);
        } 
    }
}

private Property createAndConfigureAssociationEnd(final Association assoc, 
        final String name, final Type type, 
        final Integer[] multi, final Stereotype stereo, 
        final Boolean navigable, final Boolean order, 
        final AggregationKind aggregation, 
        final Object changeable, final VisibilityKind visibility) {
    Property property = createAssociationEnd();
    property.setAssociation((Association) assoc);
    setAssociationEndProperties(property, name, type, multi, stereo, navigable, order, aggregation, changeable, visibility);
    return property;
}

private Property buildAssociationEnd(final Object assoc, final String name,
        final Object type, final Object multi, final Object stereo,
        final Boolean navigable, final Object order,
        final Object aggregation, final Object scope,
        final Object changeable, final Object visibility) {
    // The attribute 'targetScope' of an AssociationEnd in UML1.x is no
    // longer supported in UML2.x
    if (!(assoc instanceof Association)) {
        throw new IllegalArgumentException(
                "The assoc must be instance of Association."); 
    }
    if (!(type instanceof Type)) {
        throw new IllegalArgumentException(
                "The type of the property " + 
                "must be instance of Type."); 
    }
    if (aggregation != null && !(aggregation instanceof AggregationKind)) {
        throw new IllegalArgumentException(
                "The aggregation of the property " + 
                "must be instance of AggregationKind."); 
    }
    if (visibility != null && !(visibility instanceof VisibilityKind)) {
        throw new IllegalArgumentException(
                "The visibility of the property must" + 
                " be instance of VisibilityKind."); 
    }
    if (!(multi instanceof MultiplicityElement)) {
        throw new IllegalArgumentException(
                "The multilicity of the property must" + 
                " be instance of MultiplicityElement."); 
    }
    MultiplicityElement m = (MultiplicityElement) multi;
    final int lower = m.getLower();
    final int upper = m.getUpper();
    if ((order != null && !(order instanceof Boolean))
            || (changeable != null && !(changeable instanceof Boolean))) {
        throw new IllegalArgumentException(
                "The isOrdered, isReadOnly attributes of " + 
                "the property must be instances of Boolean."); 
    }
    if (stereo != null && !(stereo instanceof Stereotype)) {
        throw new IllegalArgumentException(
                "stereo must be instance of Stereotype."); 
    }
    RunnableClass run = new RunnableClass() {
        public void run() {
            Property property = createAndConfigureAssociationEnd(
                    (Association) assoc, name, (Type) type,
                    new Integer[] {lower, upper}, (Stereotype) stereo,
                    navigable, (Boolean) order,
                    (AggregationKind) aggregation,
                    changeable, (VisibilityKind) visibility);
            getParams().add(property);
        }
    };
    modelImpl.getModelEventPump().getRootContainer().setHoldEvents(true);
    ChangeCommand cmd = new ChangeCommand(
            modelImpl, run,
            "Create the association end # of the association #");
    editingDomain.getCommandStack().execute(cmd);
    if (run.getParams().isEmpty()) {
        editingDomain.getCommandStack().undo();
        editingDomain.getCommandStack().flush();
        modelImpl.getModelEventPump().getRootContainer().clearHeldEvents();
        modelImpl.getModelEventPump().getRootContainer().setHoldEvents(
                false);
        throw new UnsupportedOperationException(
                "This stereotype cannot be applied " + 
                "to the association end."); 
    }
    cmd.setObjects(run.getParams().get(0), assoc);
    modelImpl.getModelEventPump().getRootContainer().setHoldEvents(false);

    return (Property) run.getParams().get(0);
}