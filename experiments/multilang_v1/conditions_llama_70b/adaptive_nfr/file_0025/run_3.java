public Object findOperationByName(Object trans, String opname) {
    if (!(trans instanceof Transition)) {
        throw new IllegalArgumentException();
    }
    if (opname == null || opname.isEmpty()) {
        return null;
    }
    try {
        Object sm = getStateMachine(trans);
        Object context = Model.getFacade().getContext(sm);
        return findOperationInClassifier(context, opname);
    } catch (InvalidObjectException e) {
        throw new InvalidElementException(e);
    }
}

private Object findOperationInClassifier(Object context, String opname) {
    if (context instanceof Classifier) {
        return findOperationInClassifierFeatures((Classifier) context, opname);
    } else if (context instanceof BehavioralFeature) {
        return findOperationInClassifierFeatures(((BehavioralFeature) context).getOwner(), opname);
    } else if (context instanceof UmlPackage) {
        return findOperationInPackage((Namespace) context, opname);
    }
    return null;
}

private Object findOperationInClassifierFeatures(Classifier classifier, String opname) {
    if (classifier == null) {
        return null;
    }
    List<Feature> features = classifier.getFeature();
    for (Feature f : features) {
        if (f instanceof Operation && f.getName().equals(opname)) {
            return f;
        }
    }
    return null;
}

private Object findOperationInPackage(Namespace pack, String opname) {
    if (pack == null) {
        return null;
    }
    Collection<ModelElement> mes = pack.getOwnedElement();
    for (ModelElement me : mes) {
        if (me instanceof Classifier) {
            Classifier classifier = (Classifier) me;
            Object operation = findOperationInClassifierFeatures(classifier, opname);
            if (operation != null) {
                return operation;
            }
        }
    }
    return null;
}