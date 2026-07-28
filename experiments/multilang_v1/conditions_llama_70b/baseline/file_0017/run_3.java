public class ModelAccessModelInterpreter implements ModelInterpreter {

    // ... existing code ...

    @SuppressWarnings("unchecked")
    public Object invokeFeature(Map<String, Object> vt, Object subject,
            String feature, String type, Object[] parameters) {

        if (subject == null) {
            subject = vt.get("self");
        }

        return invokeFeatureOnType(subject, feature, type);
    }

    private Object invokeFeatureOnType(Object subject, String feature, String type) {
        if (type.equals(".")) {
            return invokeDotFeature(subject, feature);
        } else {
            // Handle other types
            return null;
        }
    }

    private Object invokeDotFeature(Object subject, String feature) {
        if (Model.getFacade().isAAssociation(subject)) {
            return invokeAssociationFeature(subject, feature);
        } else if (Model.getFacade().isAAssociationEnd(subject)) {
            return invokeAssociationEndFeature(subject, feature);
        } else if (Model.getFacade().isAAttribute(subject)) {
            return invokeAttributeFeature(subject, feature);
        } else if (Model.getFacade().isABehavioralFeature(subject)) {
            return invokeBehavioralFeatureFeature(subject, feature);
        } else if (Model.getFacade().isABinding(subject)) {
            return invokeBindingFeature(subject, feature);
        } else if (Model.getFacade().isAClass(subject)) {
            return invokeClassFeature(subject, feature);
        } else if (Model.getFacade().isAClassifier(subject)) {
            return invokeClassifierFeature(subject, feature);
        } else if (Model.getFacade().isAComment(subject)) {
            return invokeCommentFeature(subject, feature);
        } else if (Model.getFacade().isAComponent(subject)) {
            return invokeComponentFeature(subject, feature);
        } else if (Model.getFacade().isAConstraint(subject)) {
            return invokeConstraintFeature(subject, feature);
        } else if (Model.getFacade().isADependency(subject)) {
            return invokeDependencyFeature(subject, feature);
        } else if (Model.getFacade().isAElementResidence(subject)) {
            return invokeElementResidenceFeature(subject, feature);
        } else if (Model.getFacade().isAEnumeration(subject)) {
            return invokeEnumerationFeature(subject, feature);
        } else if (Model.getFacade().isAEnumerationLiteral(subject)) {
            return invokeEnumerationLiteralFeature(subject, feature);
        } else if (Model.getFacade().isAFeature(subject)) {
            return invokeFeatureFeature(subject, feature);
        } else if (Model.getFacade().isAGeneralizableElement(subject)) {
            return invokeGeneralizableElementFeature(subject, feature);
        } else if (Model.getFacade().isAGeneralization(subject)) {
            return invokeGeneralizationFeature(subject, feature);
        } else if (Model.getFacade().isAMethod(subject)) {
            return invokeMethodFeature(subject, feature);
        } else if (Model.getFacade().isAModelElement(subject)) {
            return invokeModelElementFeature(subject, feature);
        } else if (Model.getFacade().isANamespace(subject)) {
            return invokeNamespaceFeature(subject, feature);
        } else if (Model.getFacade().isANode(subject)) {
            return invokeNodeFeature(subject, feature);
        } else if (Model.getFacade().isAOperation(subject)) {
            return invokeOperationFeature(subject, feature);
        } else if (Model.getFacade().isAParameter(subject)) {
            return invokeParameterFeature(subject, feature);
        } else if (Model.getFacade().isAStructuralFeature(subject)) {
            return invokeStructuralFeatureFeature(subject, feature);
        } else if (Model.getFacade().isATemplateArgument(subject)) {
            return invokeTemplateArgumentFeature(subject, feature);
        } else if (Model.getFacade().isATemplateParameter(subject)) {
            return invokeTemplateParameterFeature(subject, feature);
        } else if (Model.getFacade().isAUseCase(subject)) {
            return invokeUseCaseFeature(subject, feature);
        } else if (Model.getFacade().isAAssociationClass(subject)) {
            return invokeAssociationClassFeature(subject, feature);
        } else if (Model.getFacade().isAStereotype(subject)) {
            return invokeStereotypeFeature(subject, feature);
        } else if (Model.getFacade().isATagDefinition(subject)) {
            return invokeTagDefinitionFeature(subject, feature);
        } else if (Model.getFacade().isATaggedValue(subject)) {
            return invokeTaggedValueFeature(subject, feature);
        } else {
            return null;
        }
    }

    private Object invokeAssociationFeature(Object subject, String feature) {
        if (feature.equals("connection")) {
            return new ArrayList<Object>(Model.getFacade().getConnections(subject));
        } else if (feature.equals("allConnections")) {
            return new HashSet<Object>(Model.getFacade().getConnections(subject));
        } else {
            return null;
        }
    }

    private Object invokeAssociationEndFeature(Object subject, String feature) {
        if (feature.equals("aggregation")) {
            return Model.getFacade().getAggregation1(subject);
        } else if (feature.equals("changeability")) {
            return Model.getFacade().getChangeability(subject);
        } else if (feature.equals("ordering")) {
            return Model.getFacade().getOrdering(subject);
        } else if (feature.equals("isNavigable")) {
            return Model.getFacade().isNavigable(subject);
        } else if (feature.equals("multiplicity")) {
            return Model.getFacade().getMultiplicity(subject);
        } else if (feature.equals("targetScope")) {
            return Model.getFacade().getTargetScope(subject);
        } else if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        } else if (feature.equals("qualifier")) {
            return Model.getFacade().getQualifiers(subject);
        } else if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(subject);
        } else if (feature.equals("participant")) {
            return Model.getFacade().getClassifier(subject);
        } else if (feature.equals("upperbound")) {
            return Model.getFacade().getUpper(subject);
        } else {
            return null;
        }
    }

    private Object invokeAttributeFeature(Object subject, String feature) {
        if (feature.equals("initialValue")) {
            return Model.getFacade().getInitialValue(subject);
        } else if (feature.equals("associationEnd")) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        } else {
            return null;
        }
    }

    private Object invokeBehavioralFeatureFeature(Object subject, String feature) {
        if (feature.equals("isQuery")) {
            return Model.getFacade().isQuery(subject);
        } else if (feature.equals("parameter")) {
            return new ArrayList<Object>(Model.getFacade().getParameters(subject));
        } else {
            return null;
        }
    }

    private Object invokeBindingFeature(Object subject, String feature) {
        if (feature.equals("argument")) {
            return Model.getFacade().getArguments(subject);
        } else {
            return null;
        }
    }

    private Object invokeClassFeature(Object subject, String feature) {
        if (feature.equals("isActive")) {
            return Model.getFacade().isActive(subject);
        } else {
            return null;
        }
    }

    private Object invokeClassifierFeature(Object subject, String feature) {
        if (feature.equals("feature")) {
            return new ArrayList<Object>(Model.getFacade().getFeatures(subject));
        } else if (feature.equals("association")) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        } else if (feature.equals("powertypeRange")) {
            return new HashSet<Object>(Model.getFacade().getPowertypeRanges(subject));
        } else if (feature.equals("allFeatures")) {
            return internalOcl(subject, null, "self.feature->union(self.parent.oclAsType(Classifier).allFeatures)");
        } else if (feature.equals("allOperations")) {
            return internalOcl(subject, null, "self.allFeatures->select(f | f.oclIsKindOf(Operation))");
        } else if (feature.equals("allMethods")) {
            return internalOcl(subject, null, "self.allFeatures->select(f | f.oclIsKindOf(Method))");
        } else if (feature.equals("allAttributes")) {
            return internalOcl(subject, null, "self.allFeatures->select(f | f.oclIsKindOf(Attribute))");
        } else if (feature.equals("associations")) {
            return internalOcl(subject, null, "self.association.association->asSet()");
        } else if (feature.equals("allAssociations")) {
            return internalOcl(subject, null, "self.associations->union(self.parent.oclAsType(Classifier).allAssociations)");
        } else if (feature.equals("oppositeAssociationEnds")) {
            return internalOcl(subject, null, "self.associations->select ( a | a.connection->select ( ae | ae.participant = self ).size = 1 )->collect ( a | a.connection->select ( ae | ae.participant <> self ) )->union ( self.associations->select ( a | a.connection->select ( ae | ae.participant = self ).size > 1 )->collect ( a | a.connection) )");
        } else if (feature.equals("allOppositeAssociationEnds")) {
            return internalOcl(subject, null, "self.oppositeAssociationEnds->union(self.parent.allOppositeAssociationEnds )");
        } else if (feature.equals("specification")) {
            return internalOcl(subject, null, "self.clientDependency->select(d | d.oclIsKindOf(Abstraction) and d.stereotype.name = \"realization\" and d.supplier.oclIsKindOf(Classifier)).supplier.oclAsType(Classifier)");
        } else if (feature.equals("allContents")) {
            return internalOcl(subject, null, "self.contents->union(self.parent.allContents->select(e | e.elementOwnership.visibility = #public or true or e.elementOwnership.visibility = #protected))");
        } else if (feature.equals("allDiscriminators")) {
            return internalOcl(subject, null, "self.generalization.discriminator->union(self.parent.oclAsType(Classifier).allDiscriminators)");
        } else {
            return null;
        }
    }

    private Object invokeCommentFeature(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        } else if (feature.equals("annotatedElement")) {
            return new HashSet<Object>(Model.getFacade().getAnnotatedElements(subject));
        } else {
            return null;
        }
    }

    private Object invokeComponentFeature(Object subject, String feature) {
        if (feature.equals("deploymentLocation")) {
            return new HashSet<Object>(Model.getFacade().getDeploymentLocations(subject));
        } else if (feature.equals("resident")) {
            return new HashSet<Object>(Model.getFacade().getResidents(subject));
        } else if (feature.equals("allResidentElements")) {
            return internalOcl(subject, null, "self.resident->union(self.parent.oclAsType(Component).allResidentElements->select( re | re.elementResidence.visibility = #public or re.elementResidence.visibility = #protected))");
        } else {
            return null;
        }
    }

    private Object invokeConstraintFeature(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        } else if (feature.equals("constrainedElement")) {
            return Model.getFacade().getConstrainedElements(subject);
        } else {
            return null;
        }
    }

    private Object invokeDependencyFeature(Object subject, String feature) {
        if (feature.equals("client")) {
            return new HashSet<Object>(Model.getFacade().getClients(subject));
        } else if (feature.equals("supplier")) {
            return new HashSet<Object>(Model.getFacade().getSuppliers(subject));
        } else {
            return null;
        }
    }

    private Object invokeElementResidenceFeature(Object subject, String feature) {
        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        } else {
            return null;
        }
    }

    private Object invokeEnumerationFeature(Object subject, String feature) {
        if (feature.equals("literal")) {
            return Model.getFacade().getEnumerationLiterals(subject);
        } else {
            return null;
        }
    }

    private Object invokeEnumerationLiteralFeature(Object subject, String feature) {
        if (feature.equals("enumeration")) {
            return Model.getFacade().getEnumeration(subject);
        } else {
            return null;
        }
    }

    private Object invokeFeatureFeature(Object subject, String feature) {
        if (feature.equals("ownerScope")) {
            return Model.getFacade().isStatic(subject);
        } else if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        } else if (feature.equals("owner")) {
            return Model.getFacade().getOwner(subject);
        } else {
            return null;
        }
    }

    private Object invokeGeneralizableElementFeature(Object subject, String feature) {
        if (feature.equals("isAbstract")) {
            return Model.getFacade().isAbstract(subject);
        } else if (feature.equals("isLeaf")) {
            return Model.getFacade().isLeaf(subject);
        } else if (feature.equals("isRoot")) {
            return Model.getFacade().isRoot(subject);
        } else if (feature.equals("generalization")) {
            return new HashSet<Object>(Model.getFacade().getGeneralizations(subject));
        } else if (feature.equals("specialization")) {
            return new HashSet<Object>(Model.getFacade().getSpecializations(subject));
        } else if (feature.equals("parent")) {
            return internalOcl(subject, null, "self.generalization.parent");
        } else if (feature.equals("allParents")) {
            return internalOcl(subject, null, "self.parent->union(self.parent.allParents)");
        } else {
            return null;
        }
    }

    private Object invokeGeneralizationFeature(Object subject, String feature) {
        if (feature.equals("discriminator")) {
            return Model.getFacade().getDiscriminator(subject);
        } else if (feature.equals("child")) {
            return Model.getFacade().getSpecific(subject);
        } else if (feature.equals("parent")) {
            return Model.getFacade().getGeneral(subject);
        } else if (feature.equals("powertype")) {
            return Model.getFacade().getPowertype(subject);
        } else if (feature.equals("specialization")) {
            return new HashSet<Object>(Model.getFacade().getSpecializations(subject));
        } else {
            return null;
        }
    }

    private Object invokeMethodFeature(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        } else if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(subject);
        } else {
            return null;
        }
    }

    private Object invokeModelElementFeature(Object subject, String feature) {
        if (feature.equals("name")) {
            String name = Model.getFacade().getName(subject);
            if (name == null) {
                name = "";
            }
            return name;
        } else if (feature.equals("clientDependency")) {
            return new HashSet<Object>(Model.getFacade().getClientDependencies(subject));
        } else if (feature.equals("constraint")) {
            return new HashSet<Object>(Model.getFacade().getConstraints(subject));
        } else if (feature.equals("namespace")) {
            return Model.getFacade().getNamespace(subject);
        } else if (feature.equals("supplierDependency")) {
            return new HashSet<Object>(Model.getFacade().getSupplierDependencies(subject));
        } else if (feature.equals("templateParameter")) {
            return Model.getFacade().getTemplateParameters(subject);
        } else if (feature.equals("stereotype")) {
            return Model.getFacade().getStereotypes(subject);
        } else if (feature.equals("taggedValue")) {
            return Model.getFacade().getTaggedValuesCollection(subject);
        } else if (feature.equals("constraint")) {
            return Model.getFacade().getConstraints(subject);
        } else if (feature.equals("supplier")) {
            return internalOcl(subject, null, "self.clientDependency.supplier");
        } else if (feature.equals("allSuppliers")) {
            return internalOcl(subject, null, "self.supplier->union(self.supplier.allSuppliers)");
        } else if (feature.equals("model")) {
            return internalOcl(subject, null, "self.namespace->union(self.namespace.allSurroundingNamespaces)->select( ns| ns.oclIsKindOf (Model))");
        } else if (feature.equals("isTemplate")) {
            return !Model.getFacade().getTemplateParameters(subject).isEmpty();
        } else if (feature.equals("isInstantiated")) {
            return internalOcl(subject, null, "self.clientDependency->select(oclIsKindOf(Binding))->notEmpty");
        } else if (feature.equals("templateArgument")) {
            return internalOcl(subject, null, "self.clientDependency->select(oclIsKindOf(Binding)).oclAsType(Binding).argument");
        } else {
            return null;
        }
    }

    private Object invokeNamespaceFeature(Object subject, String feature) {
        if (feature.equals("ownedElement")) {
            return new HashSet<Object>(Model.getFacade().getOwnedElements(subject));
        } else if (feature.equals("contents")) {
            return internalOcl(subject, null, "self.ownedElement->union(self.ownedElement->select(x|x.oclIsKindOf(Namespace)).contents)");
        } else if (feature.equals("allContents")) {
            return internalOcl(subject, null, "self.contents");
        } else if (feature.equals("allVisibleElements")) {
            return internalOcl(subject, null, "self.allContents ->select(e |e.elementOwnership.visibility = #public)");
        } else if (feature.equals("allSurroundingNamespaces")) {
            return internalOcl(subject, null, "self.namespace->union(self.namespace.allSurroundingNamespaces)");
        } else {
            return null;
        }
    }

    private Object invokeNodeFeature(Object subject, String feature) {
        if (feature.equals("deployedComponent")) {
            return new HashSet<Object>(Model.getFacade().getDeployedComponents(subject));
        } else {
            return null;
        }
    }

    private Object invokeOperationFeature(Object subject, String feature) {
        if (feature.equals("concurrency")) {
            return Model.getFacade().getConcurrency(subject);
        } else if (feature.equals("isAbstract")) {
            return Model.getFacade().isAbstract(subject);
        } else if (feature.equals("isLeaf")) {
            return Model.getFacade().isLeaf(subject);
        } else if (feature.equals("isRoot")) {
            return Model.getFacade().isRoot(subject);
        } else {
            return null;
        }
    }

    private Object invokeParameterFeature(Object subject, String feature) {
        if (feature.equals("defaultValue")) {
            return Model.getFacade().getDefaultValue(subject);
        } else if (feature.equals("kind")) {
            return Model.getFacade().getKind(subject);
        } else {
            return null;
        }
    }

    private Object invokeStructuralFeatureFeature(Object subject, String feature) {
        if (feature.equals("changeability")) {
            return Model.getFacade().getChangeability(subject);
        } else if (feature.equals("multiplicity")) {
            return Model.getFacade().getMultiplicity(subject);
        } else if (feature.equals("ordering")) {
            return Model.getFacade().getOrdering(subject);
        } else if (feature.equals("targetScope")) {
            return Model.getFacade().getTargetScope(subject);
        } else if (feature.equals("type")) {
            return Model.getFacade().getType(subject);
        } else {
            return null;
        }
    }

    private Object invokeTemplateArgumentFeature(Object subject, String feature) {
        if (feature.equals("binding")) {
            return Model.getFacade().getBinding(subject);
        } else if (feature.equals("modelElement")) {
            return Model.getFacade().getModelElement(subject);
        } else {
            return null;
        }
    }

    private Object invokeTemplateParameterFeature(Object subject, String feature) {
        if (feature.equals("defaultElement")) {
            return Model.getFacade().getDefaultElement(subject);
        } else {
            return null;
        }
    }

    private Object invokeUseCaseFeature(Object subject, String feature) {
        if (feature.equals("specificationPath")) {
            return Model.getUseCasesHelper().getSpecificationPath(subject);
        } else if (feature.equals("allExtensionPoints")) {
            Collection c = Model.getCoreHelper().getAllSupertypes(subject);
            Collection result = new ArrayList(Model.getFacade().getExtensionPoints(subject));
            for (Object uc : c) {
                result.addAll(Model.getFacade().getExtensionPoints(uc));
            }
            return result;
        } else {
            return null;
        }
    }

    private Object invokeAssociationClassFeature(Object subject, String feature) {
        if (feature.equals("allConnections")) {
            return internalOcl(subject, null, "self.connection->union(self.parent->select(s | s.oclIsKindOf(Association))->collect(a : Association | a.allConnections))->asSet()");
        } else {
            return null;
        }
    }

    private Object invokeStereotypeFeature(Object subject, String feature) {
        if (feature.equals("baseClass")) {
            return new HashSet<Object>(Model.getFacade().getBaseClasses(subject));
        } else if (feature.equals("extendedElement")) {
            return new HashSet<Object>(Model.getFacade().getExtendedElements(subject));
        } else if (feature.equals("definedTag")) {
            return new HashSet<Object>(Model.getFacade().getTagDefinitions(subject));
        } else {
            return null;
        }
    }

    private Object invokeTagDefinitionFeature(Object subject, String feature) {
        if (feature.equals("multiplicity")) {
            return Model.getFacade().getMultiplicity(subject);
        } else if (feature.equals("tagType")) {
            return Model.getFacade().getType(subject);
        } else if (feature.equals("typedValue")) {
            return new HashSet<Object>(Model.getFacade().getTypedValues(subject));
        } else if (feature.equals("owner")) {
            return Model.getFacade().getOwner(subject);
        } else {
            return null;
        }
    }

    private Object invokeTaggedValueFeature(Object subject, String feature) {
        if (feature.equals("dataValue")) {
            return Model.getFacade().getDataValue(subject);
        } else if (feature.equals("type")) {
            return Model.getFacade().getType(subject);
        } else if (feature.equals("referenceValue")) {
            return new HashSet<Object>(Model.getFacade().getReferenceValue(subject));
        } else {
            return null;
        }
    }

    private Object internalOcl(Object subject, Map<String, Object> vt, String ocl) {
        try {
            Object oldSelf = vt != null ? vt.get("self") : null;

            if (vt == null) {
                vt = new HashMap<>();
            }
            vt.put("self", subject);
            Object ret = DefaultOclEvaluator.getInstance().evaluate(vt, uml14mi, ocl);
            if (oldSelf != null) {
                vt.put("self", oldSelf);
            } else {
                vt.remove("self");
            }
            return ret;
        } catch (InvalidOclException e) {
            LOG.log(Level.SEVERE, "Exception", e);
            return null;
        }
    }
}