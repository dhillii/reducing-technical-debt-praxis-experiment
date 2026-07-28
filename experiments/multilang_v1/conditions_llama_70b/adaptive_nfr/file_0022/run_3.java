private Property buildAssociationEndInternal(final AssociationEndParameters params) {
    Property property = createAssociationEnd();
    property.setType(params.getType());
    property.setAssociation(params.getAssociation());
    if (params.getName() != null) {
        property.setName(params.getName());
    }
    if (params.getNavigable() != null) {
        property.setIsNavigable(params.getNavigable());
        if (!(Boolean) params.getNavigable()) {
            ((Association) params.getAssociation()).getOwnedEnds().add(property);
        }
    }
    if (params.getAggregation() != null) {
        property.setAggregation(params.getAggregation());
    }
    if (params.getVisibility() != null) {
        property.setVisibility(params.getVisibility());
    }
    if (params.getMulti() != null) {
        if (params.getMulti()[0] != null) {
            property.setLower(params.getMulti()[0]);
        }
        if (params.getMulti()[1] != null) {
            property.setUpper(params.getMulti()[1]);
        }
    }
    if (params.getOrder() != null) {
        property.setIsOrdered(params.getOrder());
    }
    if (params.getChangeable() != null) {
        property.setIsReadOnly(params.getChangeable());
    }
    if (params.getStereo() != null) {
        if (property.isStereotypeApplicable(params.getStereo())) {
            property.applyStereotype(params.getStereo());
        } 
    }
    return property;
}

private static class AssociationEndParameters {
    private final Association association;
    private final String name;
    private final Type type;
    private final Integer[] multi;
    private final Stereotype stereo;
    private final Boolean navigable;
    private final Boolean order;
    private final AggregationKind aggregation;
    private final Boolean changeable;
    private final VisibilityKind visibility;

    public AssociationEndParameters(Association association, String name, Type type, Integer[] multi, Stereotype stereo, Boolean navigable, Boolean order, AggregationKind aggregation, Boolean changeable, VisibilityKind visibility) {
        this.association = association;
        this.name = name;
        this.type = type;
        this.multi = multi;
        this.stereo = stereo;
        this.navigable = navigable;
        this.order = order;
        this.aggregation = aggregation;
        this.changeable = changeable;
        this.visibility = visibility;
    }

    public Association getAssociation() {
        return association;
    }

    public String getName() {
        return name;
    }

    public Type getType() {
        return type;
    }

    public Integer[] getMulti() {
        return multi;
    }

    public Stereotype getStereo() {
        return stereo;
    }

    public Boolean getNavigable() {
        return navigable;
    }

    public Boolean getOrder() {
        return order;
    }

    public AggregationKind getAggregation() {
        return aggregation;
    }

    public Boolean getChangeable() {
        return changeable;
    }

    public VisibilityKind getVisibility() {
        return visibility;
    }
}

private Property buildAssociationEnd(final Object assoc, final String name, final Object type, final Object multi, final Object stereo, final Boolean navigable, final Object order, final Object aggregation, final Object scope, final Object changeable, final Object visibility) {
    AssociationEndParameters params = new AssociationEndParameters(
            (Association) assoc, 
            name, 
            (Type) type, 
            (Integer[]) multi, 
            (Stereotype) stereo, 
            navigable, 
            (Boolean) order, 
            (AggregationKind) aggregation, 
            (Boolean) changeable, 
            (VisibilityKind) visibility);
    return buildAssociationEndInternal(params);
}