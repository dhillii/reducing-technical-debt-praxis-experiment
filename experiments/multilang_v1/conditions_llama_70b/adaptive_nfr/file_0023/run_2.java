public Collection<Classifier> getClassifierRoles(Object role) {
    if (role == null) {
        return Collections.emptySet();
    }

    if (!(role instanceof ClassifierRole)) {
        throw new IllegalArgumentException();
    }

    ClassifierRole classifierRole = (ClassifierRole) role;
    return getClassifierRolesForClassifierRole(classifierRole);
}

private Collection<Classifier> getClassifierRolesForClassifierRole(ClassifierRole classifierRole) {
    List<Classifier> roles = new ArrayList<Classifier>();
    try {
        Collection<AssociationEnd> associationEnds = Model.getFacade().getAssociationEnds(classifierRole);
        if (!associationEnds.isEmpty()) {
            for (AssociationEnd end : associationEnds) {
                if (end instanceof AssociationEndRole) {
                    UmlAssociation assoc = end.getAssociation();
                    roles.addAll(getClassifierRolesForAssociation(assoc, classifierRole));
                }
            }
        }
    } catch (InvalidObjectException e) {
        throw new InvalidElementException(e);
    }
    return roles;
}

private Collection<Classifier> getClassifierRolesForAssociation(UmlAssociation assoc, ClassifierRole classifierRole) {
    List<Classifier> roles = new ArrayList<Classifier>();
    for (AssociationEnd end2 : assoc.getConnection()) {
        Classifier classifier = end2.getParticipant();
        if (classifier != classifierRole && classifier instanceof ClassifierRole) {
            roles.add(classifier);
        }
    }
    return roles;
}