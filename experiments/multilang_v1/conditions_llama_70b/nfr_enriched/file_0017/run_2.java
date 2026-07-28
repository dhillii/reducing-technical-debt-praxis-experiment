public class ModelAccessModelInterpreter implements ModelInterpreter {

    // ...

    @SuppressWarnings("unchecked")
    public Object invokeFeature(Map<String, Object> vt, Object subject,
            String feature, String type, Object[] parameters) {
        subject = getSubject(vt, subject);
        return invokeFeatureOnType(vt, subject, feature, type);
    }

    private Object getSubject(Map<String, Object> vt, Object subject) {
        if (subject == null) {
            return vt.get("self");
        }
        return subject;
    }

    private Object invokeFeatureOnType(Map<String, Object> vt, Object subject, String feature, String type) {
        if (type.equals(".")) {
            return invokeDotFeature(vt, subject, feature);
        }
        return null;
    }

    private Object invokeDotFeature(Map<String, Object> vt, Object subject, String feature) {
        if (Model.getFacade().isAAssociation(subject)) {
            return invokeAssociationFeature(vt, subject, feature);
        } else if (Model.getFacade().isAAssociationEnd(subject)) {
            return invokeAssociationEndFeature(vt, subject, feature);
        } else if (Model.getFacade().isAAttribute(subject)) {
            return invokeAttributeFeature(vt, subject, feature);
        } else if (Model.getFacade().isABehavioralFeature(subject)) {
            return invokeBehavioralFeatureFeature(vt, subject, feature);
        } else if (Model.getFacade().isABinding(subject)) {
            return invokeBindingFeature(vt, subject, feature);
        } else if (Model.getFacade().isAClass(subject)) {
            return invokeClassFeature(vt, subject, feature);
        } else if (Model.getFacade().isAClassifier(subject)) {
            return invokeClassifierFeature(vt, subject, feature);
        } else if (Model.getFacade().isAComment(subject)) {
            return invokeCommentFeature(vt, subject, feature);
        } else if (Model.getFacade().isAComponent(subject)) {
            return invokeComponentFeature(vt, subject, feature);
        } else if (Model.getFacade().isAConstraint(subject)) {
            return invokeConstraintFeature(vt, subject, feature);
        } else if (Model.getFacade().isADependency(subject)) {
            return invokeDependencyFeature(vt, subject, feature);
        } else if (Model.getFacade().isAElementResidence(subject)) {
            return invokeElementResidenceFeature(vt, subject, feature);
        } else if (Model.getFacade().isAEnumeration(subject)) {
            return invokeEnumerationFeature(vt, subject, feature);
        } else if (Model.getFacade().isAEnumerationLiteral(subject)) {
            return invokeEnumerationLiteralFeature(vt, subject, feature);
        } else if (Model.getFacade().isAFeature(subject)) {
            return invokeFeatureFeature(vt, subject, feature);
        } else if (Model.getFacade().isAGeneralizableElement(subject)) {
            return invokeGeneralizableElementFeature(vt, subject, feature);
        } else if (Model.getFacade().isAGeneralization(subject)) {
            return invokeGeneralizationFeature(vt, subject, feature);
        } else if (Model.getFacade().isAMethod(subject)) {
            return invokeMethodFeature(vt, subject, feature);
        } else if (Model.getFacade().isAModelElement(subject)) {
            return invokeModelElementFeature(vt, subject, feature);
        } else if (Model.getFacade().isANamespace(subject)) {
            return invokeNamespaceFeature(vt, subject, feature);
        } else if (Model.getFacade().isANode(subject)) {
            return invokeNodeFeature(vt, subject, feature);
        } else if (Model.getFacade().isAOperation(subject)) {
            return invokeOperationFeature(vt, subject, feature);
        } else if (Model.getFacade().isAParameter(subject)) {
            return invokeParameterFeature(vt, subject, feature);
        } else if (Model.getFacade().isAStructuralFeature(subject)) {
            return invokeStructuralFeatureFeature(vt, subject, feature);
        } else if (Model.getFacade().isATemplateArgument(subject)) {
            return invokeTemplateArgumentFeature(vt, subject, feature);
        } else if (Model.getFacade().isATemplateParameter(subject)) {
            return invokeTemplateParameterFeature(vt, subject, feature);
        } else if (Model.getFacade().isAUseCase(subject)) {
            return invokeUseCaseFeature(vt, subject, feature);
        } else if (Model.getFacade().isAAssociationClass(subject)) {
            return invokeAssociationClassFeature(vt, subject, feature);
        } else if (Model.getFacade().isAStereotype(subject)) {
            return invokeStereotypeFeature(vt, subject, feature);
        } else if (Model.getFacade().isATagDefinition(subject)) {
            return invokeTagDefinitionFeature(vt, subject, feature);
        } else if (Model.getFacade().isATaggedValue(subject)) {
            return invokeTaggedValueFeature(vt, subject, feature);
        }
        return null;
    }

    private Object invokeAssociationFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("connection")) {
            return new ArrayList<Object>(Model.getFacade().getConnections(subject));
        } else if (feature.equals("allConnections")) {
            return new HashSet<Object>(Model.getFacade().getConnections(subject));
        }
        return null;
    }

    private Object invokeAssociationEndFeature(Map<String, Object> vt, Object subject, String feature) {
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
        }
        return null;
    }

    private Object invokeAttributeFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("initialValue")) {
            return Model.getFacade().getInitialValue(subject);
        } else if (feature.equals("associationEnd")) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        }
        return null;
    }

    private Object invokeBehavioralFeatureFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("isQuery")) {
            return Model.getFacade().isQuery(subject);
        } else if (feature.equals("parameter")) {
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
        }
        return null;
    }

    private Object invokeCommentFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        } else if (feature.equals("annotatedElement")) {
            return new HashSet<Object>(Model.getFacade().getAnnotatedElements(subject));
        }
        return null;
    }

    private Object invokeComponentFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("deploymentLocation")) {
            return new HashSet<Object>(Model.getFacade().getDeploymentLocations(subject));
        } else if (feature.equals("resident")) {
            return new HashSet<Object>(Model.getFacade().getResidents(subject));
        } else if (feature.equals("allResidentElements")) {
            return internalOcl(subject, vt, "self.resident->union(self.parent.oclAsType(Component).allResidentElements->select( re | re.elementResidence.visibility = #public or re.elementResidence.visibility = #protected))");
        }
        return null;
    }

    private Object invokeConstraintFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        } else if (feature.equals("constrainedElement")) {
            return Model.getFacade().getConstrainedElements(subject);
        }
        return null;
    }

    private Object invokeDependencyFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("client")) {
            return new HashSet<Object>(Model.getFacade().getClients(subject));
        } else if (feature.equals("supplier")) {
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
        } else if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        } else if (feature.equals("owner")) {
            return Model.getFacade().getOwner(subject);
        }
        return null;
    }

    private Object invokeGeneralizableElementFeature(Map<String, Object> vt, Object subject, String feature) {
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
        }
        return null;
    }

    private Object invokeGeneralizationFeature(Map<String, Object> vt, Object subject, String feature) {
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
        }
        return null;
    }

    private Object invokeMethodFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        } else if (feature.equals("specification")) {
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
        }
        return null;
    }

    private Object invokeNamespaceFeature(Map<String, Object> vt, Object subject, String feature) {
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
        } else if (feature.equals("isAbstract")) {
            return Model.getFacade().isAbstract(subject);
        } else if (feature.equals("isLeaf")) {
            return Model.getFacade().isLeaf(subject);
        } else if (feature.equals("isRoot")) {
            return Model.getFacade().isRoot(subject);
        }
        return null;
    }

    private Object invokeParameterFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("defaultValue")) {
            return Model.getFacade().getDefaultValue(subject);
        } else if (feature.equals("kind")) {
            return Model.getFacade().getKind(subject);
        }
        return null;
    }

    private Object invokeStructuralFeatureFeature(Map<String, Object> vt, Object subject, String feature) {
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
        }
        return null;
    }

    private Object invokeTemplateArgumentFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("binding")) {
            return Model.getFacade().getBinding(subject);
        } else if (feature.equals("modelElement")) {
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
        } else if (feature.equals("allExtensionPoints")) {
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
        } else if (feature.equals("extendedElement")) {
            return new HashSet<Object>(Model.getFacade().getExtendedElements(subject));
        } else if (feature.equals("definedTag")) {
            return new HashSet<Object>(Model.getFacade().getTagDefinitions(subject));
        }
        return null;
    }

    private Object invokeTagDefinitionFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("multiplicity")) {
            return Model.getFacade().getMultiplicity(subject);
        } else if (feature.equals("tagType")) {
            return Model.getFacade().getType(subject);
        } else if (feature.equals("typedValue")) {
            return new HashSet<Object>(Model.getFacade().getTypedValues(subject));
        } else if (feature.equals("owner")) {
            return Model.getFacade().getOwner(subject);
        }
        return null;
    }

    private Object invokeTaggedValueFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("dataValue")) {
            return Model.getFacade().getDataValue(subject);
        } else if (feature.equals("type")) {
            return Model.getFacade().getType(subject);
        } else if (feature.equals("referenceValue")) {
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

    // ...
}