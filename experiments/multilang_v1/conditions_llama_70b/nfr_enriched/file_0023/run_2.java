public Collection<Classifier> getClassifierRoles(Object role) {
    if (role == null) {
        return Collections.emptySet();
    }

    if (!(role instanceof ClassifierRole)) {
        throw new IllegalArgumentException();
    }

    return getClassifierRoles((ClassifierRole) role);
}

private Collection<Classifier> getClassifierRoles(ClassifierRole role) {
    List<Classifier> roles = new ArrayList<Classifier>();
    try {
        Collection<AssociationEnd> associationEnds = 
            Model.getFacade().getAssociationEnds(role);
        roles.addAll(getClassifierRolesFromAssociationEnds(associationEnds));
    } catch (InvalidObjectException e) {
        throw new InvalidElementException(e);
    }
    return roles;
}

private Collection<Classifier> getClassifierRolesFromAssociationEnds(
        Collection<AssociationEnd> associationEnds) {
    List<Classifier> roles = new ArrayList<Classifier>();
    for (AssociationEnd end : associationEnds) {
        if (end instanceof AssociationEndRole) {
            UmlAssociation assoc = end.getAssociation();
            roles.addAll(getClassifierRolesFromAssociation(assoc, end));
        }
    }
    return roles;
}

private Collection<Classifier> getClassifierRolesFromAssociation(
        UmlAssociation assoc, AssociationEnd end) {
    List<Classifier> roles = new ArrayList<Classifier>();
    for (AssociationEnd end2 : assoc.getConnection()) {
        Classifier classifier = end2.getParticipant();
        if (classifier != end.getParticipant() 
                && classifier instanceof ClassifierRole) {
            roles.add(classifier);
        }
    }
    return roles;
}