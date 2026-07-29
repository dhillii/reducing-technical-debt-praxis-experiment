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

        if (elementType == metaTypes.getAssociation()) {
            boolean uni = Boolean.TRUE.equals(unidirectional);
            return getCore().buildAssociation(fromElement, fromStyle,
                    toElement, toStyle, uni);
        }

        if (elementType == metaTypes.getAssociationEnd()) {
            if (fromElement instanceof UmlAssociation) {
                return getCore().buildAssociationEnd(toElement, fromElement);
            }
            if (fromElement instanceof Classifier) {
                return getCore().buildAssociationEnd(fromElement, toElement);
            }
        }

        if (elementType == metaTypes.getAssociationClass()) {
            return getCore().buildAssociationClass(fromElement, toElement);
        }

        if (elementType == metaTypes.getAssociationRole()) {
            boolean uni = Boolean.TRUE.equals(unidirectional);
            return getCollaborations().buildAssociationRole(fromElement,
                    fromStyle, toElement, toStyle, uni);
        }

        if (elementType == metaTypes.getGeneralization()) {
            return getCore().buildGeneralization(fromElement, toElement);
        }

        if (elementType == metaTypes.getPackageImport()) {
            return getCore().buildPackageImport(fromElement, toElement);
        }

        if (elementType == metaTypes.getUsage()) {
            return getCore().buildUsage(fromElement, toElement);
        }

        if (elementType == metaTypes.getDependency()) {
            return getCore().buildDependency(fromElement, toElement);
        }

        if (elementType == metaTypes.getAbstraction()) {
            return getCore().buildRealization(fromElement, toElement, namespace);
        }

        if (elementType == metaTypes.getLink()) {
            return getCommonBehavior().buildLink(fromElement, toElement);
        }

        if (elementType == metaTypes.getExtend()) {
            return getUseCases().buildExtend(toElement, fromElement);
        }

        if (elementType == metaTypes.getInclude()) {
            return getUseCases().buildInclude(fromElement, toElement);
        }

        if (elementType == metaTypes.getTransition()) {
            return getStateMachines().buildTransition(fromElement, toElement);
        }

        throw new IllegalModelElementConnectionException("Cannot make a "
                + elementType.getClass().getName() + " between a "
                + fromElement.getClass().getName() + " and a "
                + toElement.getClass().getName());
    }