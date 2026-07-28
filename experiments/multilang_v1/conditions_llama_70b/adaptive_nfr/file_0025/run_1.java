public Object findOperationByName(Object trans, String opname) {
    if (!(trans instanceof Transition)) {
        throw new IllegalArgumentException();
    }
    if (opname == null || opname.isEmpty()) {
        return null;
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
    Namespace namespace = classifier.getNamespace();
    if (namespace != null) {
        return findOperationByNameInNamespace(namespace, opname);
    }
    return null;
}

private Object findOperationByNameInBehavioralFeature(BehavioralFeature behavioralFeature, String opname) {
    Classifier owner = behavioralFeature.getOwner();
    if (owner != null) {
        return findOperationByNameInClassifier(owner, opname);
    }
    return null;
}

private Object findOperationByNameInPackage(UmlPackage umlPackage, String opname) {
    Collection<ModelElement> ownedElements = umlPackage.getOwnedElement();
    for (ModelElement me : ownedElements) {
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

private Object findOperationByNameInNamespace(Namespace namespace, String opname) {
    if (namespace instanceof Classifier) {
        return findOperationByNameInClassifier((Classifier) namespace, opname);
    } else if (namespace instanceof UmlPackage) {
        return findOperationByNameInPackage((UmlPackage) namespace, opname);
    }
    return null;
}