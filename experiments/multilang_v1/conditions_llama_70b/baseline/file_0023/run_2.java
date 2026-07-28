public Collection<Classifier> getClassifierRoles(Object role) {
    if (role == null) {
        return Collections.emptySet();
    }

    if (!(role instanceof ClassifierRole)) {
        throw new IllegalArgumentException();
    }

    ClassifierRole classifierRole = (ClassifierRole) role;
    List<Classifier> roles = new ArrayList<Classifier>();

    try {
        Collection<AssociationEnd> associationEnds = Model.getFacade().getAssociationEnds(classifierRole);
        if (!associationEnds.isEmpty()) {
            for (AssociationEnd end : associationEnds) {
                if (end instanceof AssociationEndRole) {
                    UmlAssociation assoc = end.getAssociation();
                    roles.addAll(getClassifierRolesFromAssociation(assoc, classifierRole));
                }
            }
        }
    } catch (InvalidObjectException e) {
        throw new InvalidElementException(e);
    }
    return roles;
}

private Collection<Classifier> getClassifierRolesFromAssociation(UmlAssociation assoc, ClassifierRole classifierRole) {
    List<Classifier> roles = new ArrayList<Classifier>();
    for (AssociationEnd end : assoc.getConnection()) {
        Classifier classifier = end.getParticipant();
        if (classifier != classifierRole && classifier instanceof ClassifierRole) {
            roles.add(classifier);
        }
    }
    return roles;
}