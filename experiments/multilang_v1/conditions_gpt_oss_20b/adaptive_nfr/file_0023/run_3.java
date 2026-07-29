public Collection<Classifier> getClassifierRoles(Object role) {
        if (role == null) {
            return Collections.emptySet();
        }
        if (!(role instanceof ClassifierRole)) {
            throw new IllegalArgumentException();
        }
        ClassifierRole classifierRole = (ClassifierRole) role;
        List<Classifier> roles = new ArrayList<>();
        try {
            Collection<AssociationEnd> ends = Model.getFacade().getAssociationEnds(role);
            if (ends.isEmpty()) {
                return roles;
            }
            for (AssociationEnd end : ends) {
                if (!isAssociationEndRole(end)) {
                    continue;
                }
                UmlAssociation assoc = end.getAssociation();
                for (AssociationEnd end2 : assoc.getConnection()) {
                    Classifier classifier = end2.getParticipant();
                    if (isClassifierRoleAndNotSame(classifier, classifierRole)) {
                        roles.add(classifier);
                    }
                }
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        return roles;
    }

    /**
     * Determines whether the given association end is an {@link AssociationEndRole}.
     *
     * @param end the association end to test
     * @return {@code true} if {@code end} is an {@link AssociationEndRole}
     */
    private boolean isAssociationEndRole(AssociationEnd end) {
        return end instanceof AssociationEndRole;
    }

    /**
     * Determines whether the given classifier is a {@link ClassifierRole}
     * and is not the same instance as the specified role.
     *
     * @param classifier the classifier to test
     * @param role the role to compare against
     * @return {@code true} if {@code classifier} is a {@link ClassifierRole}
     * and not the same instance as {@code role}
     */
    private boolean isClassifierRoleAndNotSame(Classifier classifier, ClassifierRole role) {
        return classifier instanceof ClassifierRole && classifier != role;
    }