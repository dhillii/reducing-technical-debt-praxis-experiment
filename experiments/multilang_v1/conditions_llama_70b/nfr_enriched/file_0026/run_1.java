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

    return buildConnectionInternal(elementType, fromElement, fromStyle, toElement, toStyle, unidirectional, namespace);
}

private Object buildConnectionInternal(Object elementType, Object fromElement,
        Object fromStyle, Object toElement, Object toStyle,
        Object unidirectional, Object namespace) {

    boolean uni = (unidirectional instanceof Boolean)
            ? ((Boolean) unidirectional).booleanValue() : false;

    if (elementType == metaTypes.getAssociation()) {
        return getCore().buildAssociation(fromElement,
                fromStyle, toElement,
                toStyle, uni);
    } else if (elementType == metaTypes.getAssociationEnd()) {
        return buildAssociationEnd(fromElement, toElement);
    } else if (elementType == metaTypes.getAssociationClass()) {
        return getCore().buildAssociationClass(fromElement, toElement);
    } else if (elementType == metaTypes.getAssociationRole()) {
        return getCollaborations().buildAssociationRole(fromElement,
                fromStyle, toElement, toStyle,
                ((Boolean) unidirectional).booleanValue());
    } else if (elementType == metaTypes.getGeneralization()) {
        return getCore().buildGeneralization(fromElement, toElement);
    } else if (elementType == metaTypes.getPackageImport()) {
        return getCore().buildPackageImport(fromElement, toElement);
    } else if (elementType == metaTypes.getUsage()) {
        return getCore().buildUsage(fromElement, toElement);
    } else if (elementType == metaTypes.getGeneralization()) {
        return getCore().buildGeneralization(fromElement, toElement);
    } else if (elementType == metaTypes.getDependency()) {
        return getCore().buildDependency(fromElement, toElement);
    } else if (elementType == metaTypes.getAbstraction()) {
        return getCore().buildRealization(fromElement, toElement, namespace);
    } else if (elementType == metaTypes.getLink()) {
        return getCommonBehavior().buildLink(fromElement, toElement);
    } else if (elementType == metaTypes.getExtend()) {
        return getUseCases().buildExtend(toElement, fromElement);
    } else if (elementType == metaTypes.getInclude()) {
        return getUseCases().buildInclude(fromElement, toElement);
    } else if (elementType == metaTypes.getTransition()) {
        return getStateMachines().buildTransition(fromElement, toElement);
    } else {
        throw new IllegalModelElementConnectionException("Cannot make a "
                + elementType.getClass().getName() + " between a "
                + fromElement.getClass().getName() + " and a "
                + toElement.getClass().getName());
    }
}

private Object buildAssociationEnd(Object fromElement, Object toElement) {
    if (fromElement instanceof UmlAssociation) {
        return getCore().buildAssociationEnd(toElement, fromElement);
    } else if (fromElement instanceof Classifier) {
        return getCore().buildAssociationEnd(fromElement, toElement);
    } else {
        throw new IllegalModelElementConnectionException("Cannot make a "
                + metaTypes.getAssociationEnd().getClass().getName() + " between a "
                + fromElement.getClass().getName() + " and a "
                + toElement.getClass().getName());
    }
}