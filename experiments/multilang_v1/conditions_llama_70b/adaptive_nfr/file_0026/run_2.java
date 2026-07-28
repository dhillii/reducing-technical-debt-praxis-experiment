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

    ConnectionBuilder builder = getConnectionBuilder(elementType);
    return builder.buildConnection(fromElement, fromStyle, toElement, toStyle, unidirectional, namespace);
}

private ConnectionBuilder getConnectionBuilder(Object elementType) {
    if (elementType == metaTypes.getAssociation()) {
        return new AssociationConnectionBuilder();
    } else if (elementType == metaTypes.getAssociationEnd()) {
        return new AssociationEndConnectionBuilder();
    } else if (elementType == metaTypes.getAssociationClass()) {
        return new AssociationClassConnectionBuilder();
    } else if (elementType == metaTypes.getAssociationRole()) {
        return new AssociationRoleConnectionBuilder();
    } else if (elementType == metaTypes.getGeneralization()) {
        return new GeneralizationConnectionBuilder();
    } else if (elementType == metaTypes.getPackageImport()) {
        return new PackageImportConnectionBuilder();
    } else if (elementType == metaTypes.getUsage()) {
        return new UsageConnectionBuilder();
    } else if (elementType == metaTypes.getGeneralization()) {
        return new GeneralizationConnectionBuilder();
    } else if (elementType == metaTypes.getDependency()) {
        return new DependencyConnectionBuilder();
    } else if (elementType == metaTypes.getAbstraction()) {
        return new AbstractionConnectionBuilder();
    } else if (elementType == metaTypes.getLink()) {
        return new LinkConnectionBuilder();
    } else if (elementType == metaTypes.getExtend()) {
        return new ExtendConnectionBuilder();
    } else if (elementType == metaTypes.getInclude()) {
        return new IncludeConnectionBuilder();
    } else if (elementType == metaTypes.getTransition()) {
        return new TransitionConnectionBuilder();
    } else {
        throw new IllegalModelElementConnectionException("Cannot make a "
                + elementType.getClass().getName() + " between a "
                + fromElement.getClass().getName() + " and a "
                + toElement.getClass().getName());
    }
}

private abstract class ConnectionBuilder {
    public abstract Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace);
}

private class AssociationConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getCore().buildAssociation(fromElement, fromStyle, toElement, toStyle, (Boolean) unidirectional);
    }
}

private class AssociationEndConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        if (fromElement instanceof UmlAssociation) {
            return getCore().buildAssociationEnd(toElement, fromElement);
        } else if (fromElement instanceof Classifier) {
            return getCore().buildAssociationEnd(fromElement, toElement);
        }
        return null;
    }
}

private class AssociationClassConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getCore().buildAssociationClass(fromElement, toElement);
    }
}

private class AssociationRoleConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getCollaborations().buildAssociationRole(fromElement, fromStyle, toElement, toStyle, (Boolean) unidirectional);
    }
}

private class GeneralizationConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getCore().buildGeneralization(fromElement, toElement);
    }
}

private class PackageImportConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getCore().buildPackageImport(fromElement, toElement);
    }
}

private class UsageConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getCore().buildUsage(fromElement, toElement);
    }
}

private class DependencyConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getCore().buildDependency(fromElement, toElement);
    }
}

private class AbstractionConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getCore().buildRealization(fromElement, toElement, namespace);
    }
}

private class LinkConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getCommonBehavior().buildLink(fromElement, toElement);
    }
}

private class ExtendConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getUseCases().buildExtend(toElement, fromElement);
    }
}

private class IncludeConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getUseCases().buildInclude(fromElement, toElement);
    }
}

private class TransitionConnectionBuilder extends ConnectionBuilder {
    @Override
    public Object buildConnection(Object fromElement, Object fromStyle, Object toElement, Object toStyle, Object unidirectional, Object namespace) {
        return getStateMachines().buildTransition(fromElement, toElement);
    }
}