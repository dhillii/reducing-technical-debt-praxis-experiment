public class ModelAccessModelInterpreter implements ModelInterpreter {

    // ...

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
            return invokeFeatureOnMetatype(subject, feature);
        } else {
            // Handle other types
            return null;
        }
    }

    private Object invokeFeatureOnMetatype(Object subject, String feature) {
        if (Model.getFacade().isAAssociation(subject)) {
            return invokeFeatureOnAssociation(subject, feature);
        } else if (Model.getFacade().isAAssociationEnd(subject)) {
            return invokeFeatureOnAssociationEnd(subject, feature);
        } else if (Model.getFacade().isAAttribute(subject)) {
            return invokeFeatureOnAttribute(subject, feature);
        } else if (Model.getFacade().isABehavioralFeature(subject)) {
            return invokeFeatureOnBehavioralFeature(subject, feature);
        } else if (Model.getFacade().isABinding(subject)) {
            return invokeFeatureOnBinding(subject, feature);
        } else if (Model.getFacade().isAClass(subject)) {
            return invokeFeatureOnClass(subject, feature);
        } else if (Model.getFacade().isAClassifier(subject)) {
            return invokeFeatureOnClassifier(subject, feature);
        } else if (Model.getFacade().isAComment(subject)) {
            return invokeFeatureOnComment(subject, feature);
        } else if (Model.getFacade().isAComponent(subject)) {
            return invokeFeatureOnComponent(subject, feature);
        } else if (Model.getFacade().isAConstraint(subject)) {
            return invokeFeatureOnConstraint(subject, feature);
        } else if (Model.getFacade().isADependency(subject)) {
            return invokeFeatureOnDependency(subject, feature);
        } else if (Model.getFacade().isAElementResidence(subject)) {
            return invokeFeatureOnElementResidence(subject, feature);
        } else if (Model.getFacade().isAEnumeration(subject)) {
            return invokeFeatureOnEnumeration(subject, feature);
        } else if (Model.getFacade().isAEnumerationLiteral(subject)) {
            return invokeFeatureOnEnumerationLiteral(subject, feature);
        } else if (Model.getFacade().isAFeature(subject)) {
            return invokeFeatureOnFeature(subject, feature);
        } else if (Model.getFacade().isAGeneralizableElement(subject)) {
            return invokeFeatureOnGeneralizableElement(subject, feature);
        } else if (Model.getFacade().isAGeneralization(subject)) {
            return invokeFeatureOnGeneralization(subject, feature);
        } else if (Model.getFacade().isAMethod(subject)) {
            return invokeFeatureOnMethod(subject, feature);
        } else if (Model.getFacade().isAModelElement(subject)) {
            return invokeFeatureOnModelElement(subject, feature);
        } else if (Model.getFacade().isANamespace(subject)) {
            return invokeFeatureOnNamespace(subject, feature);
        } else if (Model.getFacade().isANode(subject)) {
            return invokeFeatureOnNode(subject, feature);
        } else if (Model.getFacade().isAOperation(subject)) {
            return invokeFeatureOnOperation(subject, feature);
        } else if (Model.getFacade().isAParameter(subject)) {
            return invokeFeatureOnParameter(subject, feature);
        } else if (Model.getFacade().isAStructuralFeature(subject)) {
            return invokeFeatureOnStructuralFeature(subject, feature);
        } else if (Model.getFacade().isATemplateArgument(subject)) {
            return invokeFeatureOnTemplateArgument(subject, feature);
        } else if (Model.getFacade().isATemplateParameter(subject)) {
            return invokeFeatureOnTemplateParameter(subject, feature);
        } else if (Model.getFacade().isAUseCase(subject)) {
            return invokeFeatureOnUseCase(subject, feature);
        } else if (Model.getFacade().isAAssociationClass(subject)) {
            return invokeFeatureOnAssociationClass(subject, feature);
        } else if (Model.getFacade().isAStereotype(subject)) {
            return invokeFeatureOnStereotype(subject, feature);
        } else if (Model.getFacade().isATagDefinition(subject)) {
            return invokeFeatureOnTagDefinition(subject, feature);
        } else if (Model.getFacade().isATaggedValue(subject)) {
            return invokeFeatureOnTaggedValue(subject, feature);
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnAssociation(Object subject, String feature) {
        if (feature.equals("connection")) {
            return new ArrayList<Object>(Model.getFacade().getConnections(subject));
        } else if (feature.equals("allConnections")) {
            return new HashSet<Object>(Model.getFacade().getConnections(subject));
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnAssociationEnd(Object subject, String feature) {
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

    private Object invokeFeatureOnAttribute(Object subject, String feature) {
        if (feature.equals("initialValue")) {
            return Model.getFacade().getInitialValue(subject);
        } else if (feature.equals("associationEnd")) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnBehavioralFeature(Object subject, String feature) {
        if (feature.equals("isQuery")) {
            return Model.getFacade().isQuery(subject);
        } else if (feature.equals("parameter")) {
            return new ArrayList<Object>(Model.getFacade().getParameters(subject));
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnBinding(Object subject, String feature) {
        if (feature.equals("argument")) {
            return Model.getFacade().getArguments(subject);
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnClass(Object subject, String feature) {
        if (feature.equals("isActive")) {
            return Model.getFacade().isActive(subject);
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnClassifier(Object subject, String feature) {
        if (feature.equals("feature")) {
            return new ArrayList<Object>(Model.getFacade().getFeatures(subject));
        } else if (feature.equals("association")) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        } else if (feature.equals("powertypeRange")) {
            return new HashSet<Object>(Model.getFacade().getPowertypeRanges(subject));
        } else if (feature.equals("allFeatures")) {
            return internalOcl(subject, vt, "self.feature->union(self.parent.oclAsType(Classifier).allFeatures)");
        } else if (feature.equals("allOperations")) {
            return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Operation))");
        } else if (feature.equals("allMethods")) {
            return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Method))");
        } else if (feature.equals("allAttributes")) {
            return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Attribute))");
        } else if (feature.equals("associations")) {
            return internalOcl(subject, vt, "self.association.association->asSet()");
        } else if (feature.equals("allAssociations")) {
            return internalOcl(subject, vt, "self.associations->union(self.parent.oclAsType(Classifier).allAssociations)");
        } else if (feature.equals("oppositeAssociationEnds")) {
            return internalOcl(subject, vt, "self.associations->select ( a | a.connection->select ( ae | ae.participant = self ).size = 1 )->collect ( a | a.connection->select ( ae | ae.participant <> self ) )->union ( self.associations->select ( a | a.connection->select ( ae | ae.participant = self ).size > 1 )->collect ( a | a.connection) )");
        } else if (feature.equals("allOppositeAssociationEnds")) {
            return internalOcl(subject, vt, "self.oppositeAssociationEnds->union(self.parent.allOppositeAssociationEnds )");
        } else if (feature.equals("specification")) {
            return internalOcl(subject, vt, "self.clientDependency->select(d | d.oclIsKindOf(Abstraction) and d.stereotype.name = \"realization\" and d.supplier.oclIsKindOf(Classifier)).supplier.oclAsType(Classifier)");
        } else if (feature.equals("allContents")) {
            return internalOcl(subject, vt, "self.contents->union(self.parent.allContents->select(e | e.elementOwnership.visibility = #public or true or e.elementOwnership.visibility = #protected))");
        } else if (feature.equals("allDiscriminators")) {
            return internalOcl(subject, vt, "self.generalization.discriminator->union(self.parent.oclAsType(Classifier).allDiscriminators)");
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnComment(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        } else if (feature.equals("annotatedElement")) {
            return new HashSet<Object>(Model.getFacade().getAnnotatedElements(subject));
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnComponent(Object subject, String feature) {
        if (feature.equals("deploymentLocation")) {
            return new HashSet<Object>(Model.getFacade().getDeploymentLocations(subject));
        } else if (feature.equals("resident")) {
            return new HashSet<Object>(Model.getFacade().getResidents(subject));
        } else if (feature.equals("allResidentElements")) {
            return internalOcl(subject, vt, "self.resident->union(self.parent.oclAsType(Component).allResidentElements->select( re | re.elementResidence.visibility = #public or re.elementResidence.visibility = #protected))");
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnConstraint(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        } else if (feature.equals("constrainedElement")) {
            return Model.getFacade().getConstrainedElements(subject);
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnDependency(Object subject, String feature) {
        if (feature.equals("client")) {
            return new HashSet<Object>(Model.getFacade().getClients(subject));
        } else if (feature.equals("supplier")) {
            return new HashSet<Object>(Model.getFacade().getSuppliers(subject));
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnElementResidence(Object subject, String feature) {
        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnEnumeration(Object subject, String feature) {
        if (feature.equals("literal")) {
            return Model.getFacade().getEnumerationLiterals(subject);
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnEnumerationLiteral(Object subject, String feature) {
        if (feature.equals("enumeration")) {
            return Model.getFacade().getEnumeration(subject);
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnFeature(Object subject, String feature) {
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

    private Object invokeFeatureOnGeneralizableElement(Object subject, String feature) {
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
            return internalOcl(subject, vt, "self.generalization.parent");
        } else if (feature.equals("allParents")) {
            return internalOcl(subject, vt, "self.parent->union(self.parent.allParents)");
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnGeneralization(Object subject, String feature) {
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

    private Object invokeFeatureOnMethod(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        } else if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(subject);
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnModelElement(Object subject, String feature) {
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
        } else if (feature.equals("supplier")) {
            return internalOcl(subject, vt, "self.clientDependency.supplier");
        } else if (feature.equals("allSuppliers")) {
            return internalOcl(subject, vt, "self.supplier->union(self.supplier.allSuppliers)");
        } else if (feature.equals("model")) {
            return internalOcl(subject, vt, "self.namespace->union(self.namespace.allSurroundingNamespaces)->select( ns| ns.oclIsKindOf (Model))");
        } else if (feature.equals("isTemplate")) {
            return !Model.getFacade().getTemplateParameters(subject).isEmpty();
        } else if (feature.equals("isInstantiated")) {
            return internalOcl(subject, vt, "self.clientDependency->select(oclIsKindOf(Binding))->notEmpty");
        } else if (feature.equals("templateArgument")) {
            return internalOcl(subject, vt, "self.clientDependency->select(oclIsKindOf(Binding)).oclAsType(Binding).argument");
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnNamespace(Object subject, String feature) {
        if (feature.equals("ownedElement")) {
            return new HashSet<Object>(Model.getFacade().getOwnedElements(subject));
        } else if (feature.equals("contents")) {
            return internalOcl(subject, vt, "self.ownedElement->union(self.ownedElement->select(x|x.oclIsKindOf(Namespace)).contents)");
        } else if (feature.equals("allContents")) {
            return internalOcl(subject, vt, "self.contents");
        } else if (feature.equals("allVisibleElements")) {
            return internalOcl(subject, vt, "self.allContents ->select(e |e.elementOwnership.visibility = #public)");
        } else if (feature.equals("allSurroundingNamespaces")) {
            return internalOcl(subject, vt, "self.namespace->union(self.namespace.allSurroundingNamespaces)");
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnNode(Object subject, String feature) {
        if (feature.equals("deployedComponent")) {
            return new HashSet<Object>(Model.getFacade().getDeployedComponents(subject));
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnOperation(Object subject, String feature) {
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

    private Object invokeFeatureOnParameter(Object subject, String feature) {
        if (feature.equals("defaultValue")) {
            return Model.getFacade().getDefaultValue(subject);
        } else if (feature.equals("kind")) {
            return Model.getFacade().getKind(subject);
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnStructuralFeature(Object subject, String feature) {
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

    private Object invokeFeatureOnTemplateArgument(Object subject, String feature) {
        if (feature.equals("binding")) {
            return Model.getFacade().getBinding(subject);
        } else if (feature.equals("modelElement")) {
            return Model.getFacade().getModelElement(subject);
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnTemplateParameter(Object subject, String feature) {
        if (feature.equals("defaultElement")) {
            return Model.getFacade().getDefaultElement(subject);
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnUseCase(Object subject, String feature) {
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

    private Object invokeFeatureOnAssociationClass(Object subject, String feature) {
        if (feature.equals("allConnections")) {
            return internalOcl(subject, vt, "self.connection->union(self.parent->select(s | s.oclIsKindOf(Association))->collect(a : Association | a.allConnections))->asSet()");
        } else {
            return null;
        }
    }

    private Object invokeFeatureOnStereotype(Object subject, String feature) {
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

    private Object invokeFeatureOnTagDefinition(Object subject, String feature) {
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

    private Object invokeFeatureOnTaggedValue(Object subject, String feature) {
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
}