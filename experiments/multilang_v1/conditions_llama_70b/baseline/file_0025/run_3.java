public Object findOperationByName(Object trans, String opname) {
    if (!(trans instanceof Transition)) {
        throw new IllegalArgumentException();
    }
    try {
        Object sm = getStateMachine(trans);
        Object context = Model.getFacade().getContext(sm);
        return findOperationByNameInClassifier(context, opname);
    } catch (InvalidObjectException e) {
        throw new InvalidElementException(e);
    }
}

private Object findOperationByNameInClassifier(Object context, String opname) {
    if (context instanceof Classifier) {
        return findOperationByNameInClassifierFeatures((Classifier) context, opname);
    } else if (context instanceof BehavioralFeature) {
        return findOperationByNameInClassifierFeatures(((BehavioralFeature) context).getOwner(), opname);
    } else if (context instanceof UmlPackage) {
        return findOperationByNameInPackage((Namespace) context, opname);
    }
    return null;
}

private Object findOperationByNameInClassifierFeatures(Classifier classifier, String opname) {
    List<Feature> features = classifier.getFeature();
    for (Feature f : features) {
        if (f instanceof Operation && f.getName().equals(opname)) {
            return f;
        }
    }
    return null;
}

private Object findOperationByNameInPackage(Namespace pack, String opname) {
    Collection<ModelElement> mes = pack.getOwnedElement();
    for (ModelElement me : mes) {
        if (me instanceof Classifier) {
            Classifier classifier = (Classifier) me;
            Object operation = findOperationByNameInClassifierFeatures(classifier, opname);
            if (operation != null) {
                return operation;
            }
        }
    }
    return null;
}