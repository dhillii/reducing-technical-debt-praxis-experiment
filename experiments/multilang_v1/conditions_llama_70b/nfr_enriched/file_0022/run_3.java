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

private void configureAssociationEnd(Property property, 
        final Association assoc, final Type type) {
    property.setType((Type) type);
    property.setAssociation((Association) assoc);
}

private Property createAndConfigureAssociationEnd(
        final Association assoc, final String name, final Type type,
        final Integer[] multi, final Stereotype stereo,
        final Boolean navigable, final Boolean order,
        final AggregationKind aggregation, 
        final Object changeable, final VisibilityKind visibility) {
    Property property = createAssociationEnd();
    configureAssociationEnd(property, assoc, type);
    setAssociationEndProperties(property, name, type, multi, stereo, navigable, order, aggregation, changeable, visibility);
    return property;
}

private Property buildAssociationEndInternal(final Association assoc,
        final String name, final Type type,
        final Integer[] multi, final Stereotype stereo,
        final Boolean navigable, final Boolean order,
        final AggregationKind aggregation, 
        final Object changeable, final VisibilityKind visibility) {
    return createAndConfigureAssociationEnd(assoc, name, type, multi, stereo, navigable, order, aggregation, changeable, visibility);
}