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
        roles.addAll(getClassifierRolesFromAssociationEnds(associationEnds, role));
    } catch (InvalidObjectException e) {
        throw new InvalidElementException(e);
    }
    return roles;
}

/**
 * Returns a collection of classifiers that are connected to the given role
 * through association ends.
 * 
 * @param associationEnds the association ends to check
 * @param role the role to get connected classifiers for
 * @return a collection of classifiers
 */
private Collection<Classifier> getClassifierRolesFromAssociationEnds(
        Collection<AssociationEnd> associationEnds, ClassifierRole role) {
    List<Classifier> roles = new ArrayList<Classifier>();
    for (AssociationEnd end : associationEnds) {
        if (end instanceof AssociationEndRole) {
            UmlAssociation assoc = end.getAssociation();
            roles.addAll(getClassifierRolesFromAssociation(assoc, role));
        }
    }
    return roles;
}

/**
 * Returns a collection of classifiers that are connected to the given role
 * through the given association.
 * 
 * @param assoc the association to check
 * @param role the role to get connected classifiers for
 * @return a collection of classifiers
 */
private Collection<Classifier> getClassifierRolesFromAssociation(
        UmlAssociation assoc, ClassifierRole role) {
    List<Classifier> roles = new ArrayList<Classifier>();
    for (AssociationEnd end2 : assoc.getConnection()) {
        Classifier classifier = end2.getParticipant();
        if (classifier != role && classifier instanceof ClassifierRole) {
            roles.add(classifier);
        }
    }
    return roles;
}