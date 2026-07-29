public Object buildConnection(Object elementType, Object fromElement,
            Object fromStyle, Object toElement, Object toStyle,
            Object unidirectional, Object namespace)
        throws IllegalModelElementConnectionException {

        if (!isConnectionValid(elementType, fromElement, toElement, true)) {
            throw new IllegalModelElementConnectionException("Cannot make a "
                    + elementType.getClass().getName() + " between a "
                    + fromElement.getClass().getName() + " and a "
                    + toElement.getClass().getName());
        }

        boolean uni = (unidirectional instanceof Boolean)
            ? ((Boolean) unidirectional).booleanValue() : false;

        Object connection = null;

        if (elementType == metaTypes.getAssociation()) {
            connection = buildAssociationConnection(fromElement, fromStyle,
                    toElement, toStyle, uni);
        } else if (elementType == metaTypes.getAssociationEnd()) {
            connection = buildAssociationEndConnection(fromElement, toElement);
        } else if (elementType == metaTypes.getAssociationClass()) {
            connection = buildAssociationClassConnection(fromElement, toElement);
        } else if (elementType == metaTypes.getAssociationRole()) {
            connection = buildAssociationRoleConnection(fromElement, fromStyle,
                    toElement, toStyle, uni);
        } else if (elementType == metaTypes.getGeneralization()) {
            connection = buildGeneralizationConnection(fromElement, toElement);
        } else if (elementType == metaTypes.getPackageImport()) {
            connection = buildPackageImportConnection(fromElement, toElement);
        } else if (elementType == metaTypes.getUsage()) {
            connection = buildUsageConnection(fromElement, toElement);
        } else if (elementType == metaTypes.getDependency()) {
            connection = buildDependencyConnection(fromElement, toElement);
        } else if (elementType == metaTypes.getAbstraction()) {
            connection = buildAbstractionConnection(fromElement, toElement,
                    namespace);
        } else if (elementType == metaTypes.getLink()) {
            connection = buildLinkConnection(fromElement, toElement);
        } else if (elementType == metaTypes.getExtend()) {
            connection = buildExtendConnection(toElement, fromElement);
        } else if (elementType == metaTypes.getInclude()) {
            connection = buildIncludeConnection(fromElement, toElement);
        } else if (elementType == metaTypes.getTransition()) {
            connection = buildTransitionConnection(fromElement, toElement);
        }

        if (connection == null) {
            throw new IllegalModelElementConnectionException("Cannot make a "
                    + elementType.getClass().getName() + " between a "
                    + fromElement.getClass().getName() + " and a "
                    + toElement.getClass().getName());
        }

        return connection;
    }

    /**
     * Build an Association connection.
     */
    private Object buildAssociationConnection(Object fromElement, Object fromStyle,
            Object toElement, Object toStyle, boolean uni) {
        return getCore().buildAssociation(fromElement, fromStyle, toElement,
                toStyle, uni);
    }

    /**
     * Build an AssociationEnd connection.
     */
    private Object buildAssociationEndConnection(Object fromElement, Object toElement) {
        if (fromElement instanceof UmlAssociation) {
            return getCore().buildAssociationEnd(toElement, fromElement);
        } else if (fromElement instanceof Classifier) {
            return getCore().buildAssociationEnd(fromElement, toElement);
        }
        return null;
    }

    /**
     * Build an AssociationClass connection.
     */
    private Object buildAssociationClassConnection(Object fromElement, Object toElement) {
        return getCore().buildAssociationClass(fromElement, toElement);
    }

    /**
     * Build an AssociationRole connection.
     */
    private Object buildAssociationRoleConnection(Object fromElement, Object fromStyle,
            Object toElement, Object toStyle, boolean uni) {
        return getCollaborations().buildAssociationRole(fromElement, fromStyle,
                toElement, toStyle, uni);
    }

    /**
     * Build a Generalization connection.
     */
    private Object buildGeneralizationConnection(Object fromElement, Object toElement) {
        return getCore().buildGeneralization(fromElement, toElement);
    }

    /**
     * Build a PackageImport connection.
     */
    private Object buildPackageImportConnection(Object fromElement, Object toElement) {
        return getCore().buildPackageImport(fromElement, toElement);
    }

    /**
     * Build a Usage connection.
     */
    private Object buildUsageConnection(Object fromElement, Object toElement) {
        return getCore().buildUsage(fromElement, toElement);
    }

    /**
     * Build a Dependency connection.
     */
    private Object buildDependencyConnection(Object fromElement, Object toElement) {
        return getCore().buildDependency(fromElement, toElement);
    }

    /**
     * Build an Abstraction (Realization) connection.
     */
    private Object buildAbstractionConnection(Object fromElement, Object toElement,
            Object namespace) {
        return getCore().buildRealization(fromElement, toElement, namespace);
    }

    /**
     * Build a Link connection.
     */
    private Object buildLinkConnection(Object fromElement, Object toElement) {
        return getCommonBehavior().buildLink(fromElement, toElement);
    }

    /**
     * Build an Extend connection.
     */
    private Object buildExtendConnection(Object fromElement, Object toElement) {
        return getUseCases().buildExtend(toElement, fromElement);
    }

    /**
     * Build an Include connection.
     */
    private Object buildIncludeConnection(Object fromElement, Object toElement) {
        return getUseCases().buildInclude(fromElement, toElement);
    }

    /**
     * Build a Transition connection.
     */
    private Object buildTransitionConnection(Object fromElement, Object toElement) {
        return getStateMachines().buildTransition(fromElement, toElement);
    }