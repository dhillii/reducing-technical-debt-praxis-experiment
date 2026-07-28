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

/**
 * Find an operation by name in the given context.
 * 
 * @param context The context to search in
 * @param opname The name of the operation to find
 * @return The operation if found, null otherwise
 */
private Object findOperationByNameInContext(Object context, String opname) {
    Classifier classifier = getClassifierFromContext(context);
    if (classifier != null) {
        return findOperationByNameInClassifier(classifier, opname);
    }
    Namespace namespace = getNamespaceFromContext(context);
    if (namespace != null) {
        return findOperationByNameInNamespace(namespace, opname);
    }
    return null;
}

/**
 * Get the classifier from the given context.
 * 
 * @param context The context to get the classifier from
 * @return The classifier if found, null otherwise
 */
private Classifier getClassifierFromContext(Object context) {
    if (context instanceof Classifier) {
        return (Classifier) context;
    }
    if (context instanceof BehavioralFeature) {
        return ((BehavioralFeature) context).getOwner();
    }
    return null;
}

/**
 * Get the namespace from the given context.
 * 
 * @param context The context to get the namespace from
 * @return The namespace if found, null otherwise
 */
private Namespace getNamespaceFromContext(Object context) {
    if (context instanceof UmlPackage) {
        return (Namespace) context;
    }
    Classifier classifier = getClassifierFromContext(context);
    if (classifier != null) {
        Namespace namespace = classifier.getNamespace();
        while (namespace instanceof Classifier) {
            namespace = namespace.getNamespace();
        }
        return namespace;
    }
    return null;
}

/**
 * Find an operation by name in the given classifier.
 * 
 * @param classifier The classifier to search in
 * @param opname The name of the operation to find
 * @return The operation if found, null otherwise
 */
private Object findOperationByNameInClassifier(Classifier classifier, String opname) {
    List<Feature> features = classifier.getFeature();
    for (Feature f : features) {
        if (f instanceof Operation) {
            String on = f.getName();
            if (on.equals(opname)) {
                return f;
            }
        }
    }
    return null;
}

/**
 * Find an operation by name in the given namespace.
 * 
 * @param namespace The namespace to search in
 * @param opname The name of the operation to find
 * @return The operation if found, null otherwise
 */
private Object findOperationByNameInNamespace(Namespace namespace, String opname) {
    Collection<ModelElement> mes = namespace.getOwnedElement();
    for (ModelElement me : mes) {
        if (me instanceof Classifier) {
            Classifier classifier = (Classifier) me;
            List<Feature> features = classifier.getFeature();
            for (Feature f : features) {
                if (f instanceof Operation) {
                    String on = f.getName();
                    if (on.equals(opname)) {
                        return f;
                    }
                }
            }
        }
    }
    return null;
}