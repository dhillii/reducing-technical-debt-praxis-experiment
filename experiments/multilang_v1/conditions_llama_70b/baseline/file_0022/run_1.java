private Property buildAssociationEndInternal(final Association assoc,
        final String name, final Type type,
        final Integer[] multi, final Stereotype stereo,
        final Boolean navigable, final Boolean order,
        final AggregationKind aggregation, 
        final Object changeable, final VisibilityKind visibility) {
    Property property = createAssociationEnd();
    property.setType(type);
    property.setAssociation(assoc);
    if (name != null) {
        property.setName(name);
    }
    configureAssociationEnd(property, navigable, aggregation, visibility, multi, order, changeable, stereo);
    return property;
}

private void configureAssociationEnd(Property property, 
        Boolean navigable, AggregationKind aggregation, 
        VisibilityKind visibility, Integer[] multi, 
        Boolean order, Object changeable, Stereotype stereo) {
    if (navigable != null) {
        property.setIsNavigable(navigable);
        if (!(Boolean) navigable) {
            property.getAssociation().getOwnedEnds().add(property);
        }
    }
    if (aggregation != null) {
        property.setAggregation(aggregation);
    }
    if (visibility != null) {
        property.setVisibility(visibility);
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
        property.setIsOrdered(order);
    }
    if (changeable != null) {
        property.setIsReadOnly((Boolean) changeable);
    }
    if (stereo != null) {
        if (property.isStereotypeApplicable(stereo)) {
            property.applyStereotype(stereo);
        } 
    }
}