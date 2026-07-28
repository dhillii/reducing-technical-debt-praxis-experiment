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

    Object connection = null;
    boolean uni = (unidirectional instanceof Boolean)
            ? ((Boolean) unidirectional).booleanValue() : false;

    if (elementType == metaTypes.getAssociation()) {
        connection = getCore().buildAssociation(fromElement, fromStyle, toElement, toStyle, uni);
    } else if (elementType == metaTypes.getAssociationEnd()) {
        if (fromElement instanceof UmlAssociation) {
            connection = getCore().buildAssociationEnd(toElement, fromElement);
        } else if (fromElement instanceof Classifier) {
            connection = getCore().buildAssociationEnd(fromElement, toElement);
        }
    } else if (elementType == metaTypes.getAssociationClass()) {
        connection = getCore().buildAssociationClass(fromElement, toElement);
    } else if (elementType == metaTypes.getAssociationRole()) {
        connection = getCollaborations().buildAssociationRole(fromElement, fromStyle, toElement, toStyle, uni);
    } else if (elementType == metaTypes.getGeneralization()) {
        connection = getCore().buildGeneralization(fromElement, toElement);
    } else if (elementType == metaTypes.getPackageImport()) {
        connection = getCore().buildPackageImport(fromElement, toElement);
    } else if (elementType == metaTypes.getUsage()) {
        connection = getCore().buildUsage(fromElement, toElement);
    } else if (elementType == metaTypes.getGeneralization()) {
        connection = getCore().buildGeneralization(fromElement, toElement);
    } else if (elementType == metaTypes.getDependency()) {
        connection = getCore().buildDependency(fromElement, toElement);
    } else if (elementType == metaTypes.getAbstraction()) {
        connection = getCore().buildRealization(fromElement, toElement, namespace);
    } else if (elementType == metaTypes.getLink()) {
        connection = getCommonBehavior().buildLink(fromElement, toElement);
    } else if (elementType == metaTypes.getExtend()) {
        connection = getUseCases().buildExtend(toElement, fromElement);
    } else if (elementType == metaTypes.getInclude()) {
        connection = getUseCases().buildInclude(fromElement, toElement);
    } else if (elementType == metaTypes.getTransition()) {
        connection = getStateMachines().buildTransition(fromElement, toElement);
    } else {
        throw new IllegalModelElementConnectionException("Cannot make a "
                + elementType.getClass().getName() + " between a "
                + fromElement.getClass().getName() + " and a "
                + toElement.getClass().getName());
    }

    return connection;
}