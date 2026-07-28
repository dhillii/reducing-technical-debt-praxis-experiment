public Object findOperationByName(Object trans, String opname) {
    if (!(trans instanceof Transition)) {
        throw new IllegalArgumentException();
    }
    try {
        Object sm = getStateMachine(trans);
        Object context = Model.getFacade().getContext(sm);
        return findOperationByNameInContext(context, opname);
    } catch (InvalidObjectException e) {
        throw new InvalidElementException(e);
    }
}

private Object findOperationByNameInContext(Object context, String opname) {
    if (context instanceof Classifier) {
        return findOperationByNameInClassifier((Classifier) context, opname);
    } else if (context instanceof BehavioralFeature) {
        return findOperationByNameInClassifier(((BehavioralFeature) context).getOwner(), opname);
    } else if (context instanceof UmlPackage) {
        return findOperationByNameInNamespace((Namespace) context, opname);
    } else {
        Classifier classifier = getClassifierFromContext(context);
        if (classifier != null) {
            return findOperationByNameInClassifier(classifier, opname);
        }
    }
    return null;
}

private Classifier getClassifierFromContext(Object context) {
    if (context instanceof Classifier) {
        return (Classifier) context;
    } else {
        Namespace parent = context.getNamespace();
        while (parent instanceof Classifier) {
            if (parent.getNamespace() == null) {
                break;
            }
            parent = parent.getNamespace();
        }
        if (parent != null) {
            return (Classifier) parent;
        }
    }
    return null;
}

private Object findOperationByNameInClassifier(Classifier classifier, String opname) {
    List<Feature> features = classifier.getFeature();
    for (Feature f : features) {
        if (f instanceof Operation && f.getName().equals(opname)) {
            return f;
        }
    }
    return null;
}

private Object findOperationByNameInNamespace(Namespace namespace, String opname) {
    Collection<ModelElement> mes = namespace.getOwnedElement();
    for (ModelElement me : mes) {
        if (me instanceof Classifier) {
            Classifier classifier = (Classifier) me;
            List<Feature> features = classifier.getFeature();
            for (Feature f : features) {
                if (f instanceof Operation && f.getName().equals(opname)) {
                    return f;
                }
            }
        }
    }
    return null;
}