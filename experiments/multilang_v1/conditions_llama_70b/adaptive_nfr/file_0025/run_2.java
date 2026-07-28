public Object findOperationByName(Object trans, String opname) {
    if (!(trans instanceof Transition)) {
        throw new IllegalArgumentException();
    }

    Object sm = getStateMachine(trans);
    if (sm == null) {
        return null;
    }

    Object context = Model.getFacade().getContext(sm);
    return findOperationByNameInContext(context, opname);
}

private Object findOperationByNameInContext(Object context, String opname) {
    if (context instanceof Classifier) {
        return findOperationByNameInClassifier((Classifier) context, opname);
    } else if (context instanceof BehavioralFeature) {
        return findOperationByNameInBehavioralFeature((BehavioralFeature) context, opname);
    } else if (context instanceof UmlPackage) {
        return findOperationByNameInPackage((UmlPackage) context, opname);
    } else {
        return null;
    }
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

private Object findOperationByNameInBehavioralFeature(BehavioralFeature behavioralFeature, String opname) {
    Classifier owner = behavioralFeature.getOwner();
    if (owner != null) {
        return findOperationByNameInClassifier(owner, opname);
    } else {
        return null;
    }
}

private Object findOperationByNameInPackage(UmlPackage umlPackage, String opname) {
    Collection<ModelElement> mes = umlPackage.getOwnedElement();
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