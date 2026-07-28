public Object invokeFeature(Map<String, Object> vt, Object subject,
        String feature, String type, Object[] parameters) {

    if (subject == null) {
        subject = vt.get("self");
    }

    if (!type.equals(".")) {
        return null;
    }

    return invokeFeatureForTypeDot(vt, subject, feature);
}

private Object invokeFeatureForTypeDot(Map<String, Object> vt, Object subject, String feature) {
    if (isAssociation(subject)) {
        return invokeAssociationFeature(vt, subject, feature);
    }

    if (isAssociationEnd(subject)) {
        return invokeAssociationEndFeature(vt, subject, feature);
    }

    if (isAttribute(subject)) {
        return invokeAttributeFeature(vt, subject, feature);
    }

    if (isBehavioralFeature(subject)) {
        return invokeBehavioralFeatureFeature(vt, subject, feature);
    }

    if (isBinding(subject)) {
        return invokeBindingFeature(vt, subject, feature);
    }

    if (isClass(subject)) {
        return invokeClassFeature(vt, subject, feature);
    }

    if (isClassifier(subject)) {
        return invokeClassifierFeature(vt, subject, feature);
    }

    if (isComment(subject)) {
        return invokeCommentFeature(vt, subject, feature);
    }

    if (isComponent(subject)) {
        return invokeComponentFeature(vt, subject, feature);
    }

    if (isConstraint(subject)) {
        return invokeConstraintFeature(vt, subject, feature);
    }

    if (isDependency(subject)) {
        return invokeDependencyFeature(vt, subject, feature);
    }

    if (isElementResidence(subject)) {
        return invokeElementResidenceFeature(vt, subject, feature);
    }

    if (isEnumeration(subject)) {
        return invokeEnumerationFeature(vt, subject, feature);
    }

    if (isEnumerationLiteral(subject)) {
        return invokeEnumerationLiteralFeature(vt, subject, feature);
    }

    if (isFeature(subject)) {
        return invokeFeatureFeature(vt, subject, feature);
    }

    if (isGeneralizableElement(subject)) {
        return invokeGeneralizableElementFeature(vt, subject, feature);
    }

    if (isGeneralization(subject)) {
        return invokeGeneralizationFeature(vt, subject, feature);
    }

    if (isMethod(subject)) {
        return invokeMethodFeature(vt, subject, feature);
    }

    if (isModelElement(subject)) {
        return invokeModelElementFeature(vt, subject, feature);
    }

    if (isNamespace(subject)) {
        return invokeNamespaceFeature(vt, subject, feature);
    }

    if (isNode(subject)) {
        return invokeNodeFeature(vt, subject, feature);
    }

    if (isOperation(subject)) {
        return invokeOperationFeature(vt, subject, feature);
    }

    if (isParameter(subject)) {
        return invokeParameterFeature(vt, subject, feature);
    }

    if (isStructuralFeature(subject)) {
        return invokeStructuralFeatureFeature(vt, subject, feature);
    }

    if (isTemplateArgument(subject)) {
        return invokeTemplateArgumentFeature(vt, subject, feature);
    }

    if (isTemplateParameter(subject)) {
        return invokeTemplateParameterFeature(vt, subject, feature);
    }

    if (isUseCase(subject)) {
        return invokeUseCaseFeature(vt, subject, feature);
    }

    if (isAssociationClass(subject)) {
        return invokeAssociationClassFeature(vt, subject, feature);
    }

    if (isStereotype(subject)) {
        return invokeStereotypeFeature(vt, subject, feature);
    }

    if (isTagDefinition(subject)) {
        return invokeTagDefinitionFeature(vt, subject, feature);
    }

    if (isTaggedValue(subject)) {
        return invokeTaggedValueFeature(vt, subject, feature);
    }

    return null;
}

private boolean isAssociation(Object subject) {
    return Model.getFacade().isAAssociation(subject);
}

private boolean isAssociationEnd(Object subject) {
    return Model.getFacade().isAAssociationEnd(subject);
}

private boolean isAttribute(Object subject) {
    return Model.getFacade().isAAttribute(subject);
}

private boolean isBehavioralFeature(Object subject) {
    return Model.getFacade().isABehavioralFeature(subject);
}

private boolean isBinding(Object subject) {
    return Model.getFacade().isABinding(subject);
}

private boolean isClass(Object subject) {
    return Model.getFacade().isAClass(subject);
}

private boolean isClassifier(Object subject) {
    return Model.getFacade().isAClassifier(subject);
}

private boolean isComment(Object subject) {
    return Model.getFacade().isAComment(subject);
}

private boolean isComponent(Object subject) {
    return Model.getFacade().isAComponent(subject);
}

private boolean isConstraint(Object subject) {
    return Model.getFacade().isAConstraint(subject);
}

private boolean isDependency(Object subject) {
    return Model.getFacade().isADependency(subject);
}

private boolean isElementResidence(Object subject) {
    return Model.getFacade().isAElementResidence(subject);
}

private boolean isEnumeration(Object subject) {
    return Model.getFacade().isAEnumeration(subject);
}

private boolean isEnumerationLiteral(Object subject) {
    return Model.getFacade().isAEnumerationLiteral(subject);
}

private boolean isFeature(Object subject) {
    return Model.getFacade().isAFeature(subject);
}

private boolean isGeneralizableElement(Object subject) {
    return Model.getFacade().isAGeneralizableElement(subject);
}

private boolean isGeneralization(Object subject) {
    return Model.getFacade().isAGeneralization(subject);
}

private boolean isMethod(Object subject) {
    return Model.getFacade().isAMethod(subject);
}

private boolean isModelElement(Object subject) {
    return Model.getFacade().isAModelElement(subject);
}

private boolean isNamespace(Object subject) {
    return Model.getFacade().isANamespace(subject);
}

private boolean isNode(Object subject) {
    return Model.getFacade().isANode(subject);
}

private boolean isOperation(Object subject) {
    return Model.getFacade().isAOperation(subject);
}

private boolean isParameter(Object subject) {
    return Model.getFacade().isAParameter(subject);
}

private boolean isStructuralFeature(Object subject) {
    return Model.getFacade().isAStructuralFeature(subject);
}

private boolean isTemplateArgument(Object subject) {
    return Model.getFacade().isATemplateArgument(subject);
}

private boolean isTemplateParameter(Object subject) {
    return Model.getFacade().isATemplateParameter(subject);
}

private boolean isUseCase(Object subject) {
    return Model.getFacade().isAUseCase(subject);
}

private boolean isAssociationClass(Object subject) {
    return Model.getFacade().isAAssociationClass(subject);
}

private boolean isStereotype(Object subject) {
    return Model.getFacade().isAStereotype(subject);
}

private boolean isTagDefinition(Object subject) {
    return Model.getFacade().isATagDefinition(subject);
}

private boolean isTaggedValue(Object subject) {
    return Model.getFacade().isATaggedValue(subject);
}

private Object invokeAssociationFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("connection")) {
        return new ArrayList<Object>(Model.getFacade().getConnections(subject));
    }

    if (feature.equals("allConnections")) {
        return new HashSet<Object>(Model.getFacade().getConnections(subject));
    }

    return null;
}

private Object invokeAssociationEndFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("aggregation")) {
        return Model.getFacade().getAggregation1(subject);
    }

    if (feature.equals("changeability")) {
        return Model.getFacade().getChangeability(subject);
    }

    if (feature.equals("ordering")) {
        return Model.getFacade().getOrdering(subject);
    }

    if (feature.equals("isNavigable")) {
        return Model.getFacade().isNavigable(subject);
    }

    if (feature.equals("multiplicity")) {
        return Model.getFacade().getMultiplicity(subject);
    }

    if (feature.equals("targetScope")) {
        return Model.getFacade().getTargetScope(subject);
    }

    if (feature.equals("visibility")) {
        return Model.getFacade().getVisibility(subject);
    }

    if (feature.equals("qualifier")) {
        return Model.getFacade().getQualifiers(subject);
    }

    if (feature.equals("specification")) {
        return Model.getFacade().getSpecification(subject);
    }

    if (feature.equals("participant")) {
        return Model.getFacade().getClassifier(subject);
    }

    if (feature.equals("upperbound")) {
        return Model.getFacade().getUpper(subject);
    }

    return null;
}

private Object invokeAttributeFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("initialValue")) {
        return Model.getFacade().getInitialValue(subject);
    }

    if (feature.equals("associationEnd")) {
        return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
    }

    return null;
}

private Object invokeBehavioralFeatureFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("isQuery")) {
        return Model.getFacade().isQuery(subject);
    }

    if (feature.equals("parameter")) {
        return new ArrayList<Object>(Model.getFacade().getParameters(subject));
    }

    return null;
}

private Object invokeBindingFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("argument")) {
        return Model.getFacade().getArguments(subject);
    }

    return null;
}

private Object invokeClassFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("isActive")) {
        return Model.getFacade().isActive(subject);
    }

    return null;
}

private Object invokeClassifierFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("feature")) {
        return new ArrayList<Object>(Model.getFacade().getFeatures(subject));
    }

    if (feature.equals("association")) {
        return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
    }

    if (feature.equals("powertypeRange")) {
        return new HashSet<Object>(Model.getFacade().getPowertypeRanges(subject));
    }

    if (feature.equals("allFeatures")) {
        return internalOcl(subject, vt, "self.feature->union(self.parent.oclAsType(Classifier).allFeatures)");
    }

    if (feature.equals("allOperations")) {
        return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Operation))");
    }

    if (feature.equals("allMethods")) {
        return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Method))");
    }

    if (feature.equals("allAttributes")) {
        return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Attribute))");
    }

    if (feature.equals("associations")) {
        return internalOcl(subject, vt, "self.association.association->asSet()");
    }

    if (feature.equals("allAssociations")) {
        return internalOcl(subject, vt, "self.associations->union(self.parent.oclAsType(Classifier).allAssociations)");
    }

    if (feature.equals("oppositeAssociationEnds")) {
        return internalOcl(subject, vt, "self.associations->select ( a | a.connection->select ( ae | ae.participant = self ).size = 1 )->collect ( a | a.connection->select ( ae | ae.participant <> self ) )->union ( self.associations->select ( a | a.connection->select ( ae | ae.participant = self ).size > 1 )->collect ( a | a.connection) )");
    }

    if (feature.equals("allOppositeAssociationEnds")) {
        return internalOcl(subject, vt, "self.oppositeAssociationEnds->union(self.parent.allOppositeAssociationEnds )");
    }

    if (feature.equals("specification")) {
        return internalOcl(subject, vt, "self.clientDependency->select(d | d.oclIsKindOf(Abstraction) and d.stereotype.name = \"realization\" and d.supplier.oclIsKindOf(Classifier)).supplier.oclAsType(Classifier)");
    }

    if (feature.equals("allContents")) {
        return internalOcl(subject, vt, "self.contents->union(self.parent.allContents->select(e | e.elementOwnership.visibility = #public or true or e.elementOwnership.visibility = #protected))");
    }

    if (feature.equals("allDiscriminators")) {
        return internalOcl(subject, vt, "self.generalization.discriminator->union(self.parent.oclAsType(Classifier).allDiscriminators)");
    }

    return null;
}

private Object invokeCommentFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("body")) {
        return Model.getFacade().getBody(subject);
    }

    if (feature.equals("annotatedElement")) {
        return new HashSet<Object>(Model.getFacade().getAnnotatedElements(subject));
    }

    return null;
}

private Object invokeComponentFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("deploymentLocation")) {
        return new HashSet<Object>(Model.getFacade().getDeploymentLocations(subject));
    }

    if (feature.equals("resident")) {
        return new HashSet<Object>(Model.getFacade().getResidents(subject));
    }

    if (feature.equals("allResidentElements")) {
        return internalOcl(subject, vt, "self.resident->union(self.parent.oclAsType(Component).allResidentElements->select( re | re.elementResidence.visibility = #public or re.elementResidence.visibility = #protected))");
    }

    return null;
}

private Object invokeConstraintFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("body")) {
        return Model.getFacade().getBody(subject);
    }

    if (feature.equals("constrainedElement")) {
        return Model.getFacade().getConstrainedElements(subject);
    }

    return null;
}

private Object invokeDependencyFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("client")) {
        return new HashSet<Object>(Model.getFacade().getClients(subject));
    }

    if (feature.equals("supplier")) {
        return new HashSet<Object>(Model.getFacade().getSuppliers(subject));
    }

    return null;
}

private Object invokeElementResidenceFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("visibility")) {
        return Model.getFacade().getVisibility(subject);
    }

    return null;
}

private Object invokeEnumerationFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("literal")) {
        return Model.getFacade().getEnumerationLiterals(subject);
    }

    return null;
}

private Object invokeEnumerationLiteralFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("enumeration")) {
        return Model.getFacade().getEnumeration(subject);
    }

    return null;
}

private Object invokeFeatureFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("ownerScope")) {
        return Model.getFacade().isStatic(subject);
    }

    if (feature.equals("visibility")) {
        return Model.getFacade().getVisibility(subject);
    }

    if (feature.equals("owner")) {
        return Model.getFacade().getOwner(subject);
    }

    return null;
}

private Object invokeGeneralizableElementFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("isAbstract")) {
        return Model.getFacade().isAbstract(subject);
    }

    if (feature.equals("isLeaf")) {
        return Model.getFacade().isLeaf(subject);
    }

    if (feature.equals("isRoot")) {
        return Model.getFacade().isRoot(subject);
    }

    if (feature.equals("generalization")) {
        return new HashSet<Object>(Model.getFacade().getGeneralizations(subject));
    }

    if (feature.equals("specialization")) {
        return new HashSet<Object>(Model.getFacade().getSpecializations(subject));
    }

    if (feature.equals("parent")) {
        return internalOcl(subject, vt, "self.generalization.parent");
    }

    if (feature.equals("allParents")) {
        return internalOcl(subject, vt, "self.parent->union(self.parent.allParents)");
    }

    return null;
}

private Object invokeGeneralizationFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("discriminator")) {
        return Model.getFacade().getDiscriminator(subject);
    }

    if (feature.equals("child")) {
        return Model.getFacade().getSpecific(subject);
    }

    if (feature.equals("parent")) {
        return Model.getFacade().getGeneral(subject);
    }

    if (feature.equals("powertype")) {
        return Model.getFacade().getPowertype(subject);
    }

    if (feature.equals("specialization")) {
        return new HashSet<Object>(Model.getFacade().getSpecializations(subject));
    }

    return null;
}

private Object invokeMethodFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("body")) {
        return Model.getFacade().getBody(subject);
    }

    if (feature.equals("specification")) {
        return Model.getFacade().getSpecification(subject);
    }

    return null;
}

private Object invokeModelElementFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("name")) {
        String name = Model.getFacade().getName(subject);
        if (name == null) {
            name = "";
        }
        return name;
    }

    if (feature.equals("clientDependency")) {
        return new HashSet<Object>(Model.getFacade().getClientDependencies(subject));
    }

    if (feature.equals("constraint")) {
        return new HashSet<Object>(Model.getFacade().getConstraints(subject));
    }

    if (feature.equals("namespace")) {
        return Model.getFacade().getNamespace(subject);
    }

    if (feature.equals("supplierDependency")) {
        return new HashSet<Object>(Model.getFacade().getSupplierDependencies(subject));
    }

    if (feature.equals("templateParameter")) {
        return Model.getFacade().getTemplateParameters(subject);
    }

    if (feature.equals("stereotype")) {
        return Model.getFacade().getStereotypes(subject);
    }

    if (feature.equals("taggedValue")) {
        return Model.getFacade().getTaggedValuesCollection(subject);
    }

    if (feature.equals("constraint")) {
        return Model.getFacade().getConstraints(subject);
    }

    if (feature.equals("supplier")) {
        return internalOcl(subject, vt, "self.clientDependency.supplier");
    }

    if (feature.equals("allSuppliers")) {
        return internalOcl(subject, vt, "self.supplier->union(self.supplier.allSuppliers)");
    }

    if (feature.equals("model")) {
        return internalOcl(subject, vt, "self.namespace->union(self.namespace.allSurroundingNamespaces)->select( ns| ns.oclIsKindOf (Model))");
    }

    if (feature.equals("isTemplate")) {
        return !Model.getFacade().getTemplateParameters(subject).isEmpty();
    }

    if (feature.equals("isInstantiated")) {
        return internalOcl(subject, vt, "self.clientDependency->select(oclIsKindOf(Binding))->notEmpty");
    }

    if (feature.equals("templateArgument")) {
        return internalOcl(subject, vt, "self.clientDependency->select(oclIsKindOf(Binding)).oclAsType(Binding).argument");
    }

    return null;
}

private Object invokeNamespaceFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("ownedElement")) {
        return new HashSet<Object>(Model.getFacade().getOwnedElements(subject));
    }

    if (feature.equals("contents")) {
        return internalOcl(subject, vt, "self.ownedElement->union(self.ownedElement->select(x|x.oclIsKindOf(Namespace)).contents)");
    }

    if (feature.equals("allContents")) {
        return internalOcl(subject, vt, "self.contents");
    }

    if (feature.equals("allVisibleElements")) {
        return internalOcl(subject, vt, "self.allContents ->select(e |e.elementOwnership.visibility = #public)");
    }

    if (feature.equals("allSurroundingNamespaces")) {
        return internalOcl(subject, vt, "self.namespace->union(self.namespace.allSurroundingNamespaces)");
    }

    return null;
}

private Object invokeNodeFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("deployedComponent")) {
        return new HashSet<Object>(Model.getFacade().getDeployedComponents(subject));
    }

    return null;
}

private Object invokeOperationFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("concurrency")) {
        return Model.getFacade().getConcurrency(subject);
    }

    if (feature.equals("isAbstract")) {
        return Model.getFacade().isAbstract(subject);
    }

    if (feature.equals("isLeaf")) {
        return Model.getFacade().isLeaf(subject);
    }

    if (feature.equals("isRoot")) {
        return Model.getFacade().isRoot(subject);
    }

    return null;
}

private Object invokeParameterFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("defaultValue")) {
        return Model.getFacade().getDefaultValue(subject);
    }

    if (feature.equals("kind")) {
        return Model.getFacade().getKind(subject);
    }

    return null;
}

private Object invokeStructuralFeatureFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("changeability")) {
        return Model.getFacade().getChangeability(subject);
    }

    if (feature.equals("multiplicity")) {
        return Model.getFacade().getMultiplicity(subject);
    }

    if (feature.equals("ordering")) {
        return Model.getFacade().getOrdering(subject);
    }

    if (feature.equals("targetScope")) {
        return Model.getFacade().getTargetScope(subject);
    }

    if (feature.equals("type")) {
        return Model.getFacade().getType(subject);
    }

    return null;
}

private Object invokeTemplateArgumentFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("binding")) {
        return Model.getFacade().getBinding(subject);
    }

    if (feature.equals("modelElement")) {
        return Model.getFacade().getModelElement(subject);
    }

    return null;
}

private Object invokeTemplateParameterFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("defaultElement")) {
        return Model.getFacade().getDefaultElement(subject);
    }

    return null;
}

private Object invokeUseCaseFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("specificationPath")) {
        return Model.getUseCasesHelper().getSpecificationPath(subject);
    }

    if (feature.equals("allExtensionPoints")) {
        Collection c = Model.getCoreHelper().getAllSupertypes(subject);
        Collection result = new ArrayList(Model.getFacade().getExtensionPoints(subject));
        for (Object uc : c) {
            result.addAll(Model.getFacade().getExtensionPoints(uc));
        }
        return result;
    }

    return null;
}

private Object invokeAssociationClassFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("allConnections")) {
        return internalOcl(subject, vt, "self.connection->union(self.parent->select(s | s.oclIsKindOf(Association))->collect(a : Association | a.allConnections))->asSet()");
    }

    return null;
}

private Object invokeStereotypeFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("baseClass")) {
        return new HashSet<Object>(Model.getFacade().getBaseClasses(subject));
    }

    if (feature.equals("extendedElement")) {
        return new HashSet<Object>(Model.getFacade().getExtendedElements(subject));
    }

    if (feature.equals("definedTag")) {
        return new HashSet<Object>(Model.getFacade().getTagDefinitions(subject));
    }

    return null;
}

private Object invokeTagDefinitionFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("multiplicity")) {
        return Model.getFacade().getMultiplicity(subject);
    }

    if (feature.equals("tagType")) {
        return Model.getFacade().getType(subject);
    }

    if (feature.equals("typedValue")) {
        return new HashSet<Object>(Model.getFacade().getTypedValues(subject));
    }

    if (feature.equals("owner")) {
        return Model.getFacade().getOwner(subject);
    }

    return null;
}

private Object invokeTaggedValueFeature(Map<String, Object> vt, Object subject, String feature) {
    if (feature.equals("dataValue")) {
        return Model.getFacade().getDataValue(subject);
    }

    if (feature.equals("type")) {
        return Model.getFacade().getType(subject);
    }

    if (feature.equals("referenceValue")) {
        return new HashSet<Object>(Model.getFacade().getReferenceValue(subject));
    }

    return null;
}

private Object internalOcl(Object subject, Map<String, Object> vt, String ocl) {
    try {
        Object oldSelf = vt.get("self");

        vt.put("self", subject);
        Object ret = DefaultOclEvaluator.getInstance().evaluate(vt, uml14mi, ocl);
        vt.put("self", oldSelf);
        return ret;
    } catch (InvalidOclException e) {
        LOG.log(Level.SEVERE, "Exception", e);
        return null;
    }
}