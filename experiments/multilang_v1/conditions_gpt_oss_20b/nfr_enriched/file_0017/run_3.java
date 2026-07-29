package org.argouml.profile.internal.ocl.uml14;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

import org.argouml.model.Model;
import org.argouml.profile.internal.ocl.DefaultOclEvaluator;
import org.argouml.profile.internal.ocl.InvalidOclException;
import org.argouml.profile.internal.ocl.ModelInterpreter;

/**
 * Model Access.
 *
 * @author maurelio1234
 */
public class ModelAccessModelInterpreter implements ModelInterpreter {

    /**
     * Logger.
     */
    private static final Logger LOG =
        Logger.getLogger(ModelAccessModelInterpreter.class.getName());

    private static Uml14ModelInterpreter uml14mi = new Uml14ModelInterpreter();

    /**
     * {@inheritDoc}
     */
    @SuppressWarnings("unchecked")
    public Object invokeFeature(Map<String, Object> vt, Object subject,
            String feature, String type, Object[] parameters) {

        if (subject == null) {
            subject = vt.get("self");
        }

        Object result = handleAssociation(vt, subject, feature, type);
        if (result != null) return result;

        result = handleAssociationEnd(vt, subject, feature, type);
        if (result != null) return result;

        result = handleAttribute(vt, subject, feature, type);
        if (result != null) return result;

        result = handleBehavioralFeature(vt, subject, feature, type);
        if (result != null) return result;

        result = handleBinding(vt, subject, feature, type);
        if (result != null) return result;

        result = handleClass(vt, subject, feature, type);
        if (result != null) return result;

        result = handleClassifier(vt, subject, feature, type);
        if (result != null) return result;

        result = handleComment(vt, subject, feature, type);
        if (result != null) return result;

        result = handleComponent(vt, subject, feature, type);
        if (result != null) return result;

        result = handleConstraint(vt, subject, feature, type);
        if (result != null) return result;

        result = handleDependency(vt, subject, feature, type);
        if (result != null) return result;

        result = handleElementResidence(vt, subject, feature, type);
        if (result != null) return result;

        result = handleEnumeration(vt, subject, feature, type);
        if (result != null) return result;

        result = handleEnumerationLiteral(vt, subject, feature, type);
        if (result != null) return result;

        result = handleFeature(vt, subject, feature, type);
        if (result != null) return result;

        result = handleGeneralizableElement(vt, subject, feature, type);
        if (result != null) return result;

        result = handleGeneralization(vt, subject, feature, type);
        if (result != null) return result;

        result = handleMethod(vt, subject, feature, type);
        if (result != null) return result;

        result = handleModelElement(vt, subject, feature, type);
        if (result != null) return result;

        result = handleNamespace(vt, subject, feature, type);
        if (result != null) return result;

        result = handleNode(vt, subject, feature, type);
        if (result != null) return result;

        result = handleOperation(vt, subject, feature, type);
        if (result != null) return result;

        result = handleParameter(vt, subject, feature, type);
        if (result != null) return result;

        result = handleStructuralFeature(vt, subject, feature, type);
        if (result != null) return result;

        result = handleTemplateArgument(vt, subject, feature, type);
        if (result != null) return result;

        result = handleTemplateParameter(vt, subject, feature, type);
        if (result != null) return result;

        result = handleUseCase(vt, subject, feature, type);
        if (result != null) return result;

        result = handleAssociationClass(vt, subject, feature, type);
        if (result != null) return result;

        result = handleStereotype(vt, subject, feature, type);
        if (result != null) return result;

        result = handleTagDefinition(vt, subject, feature, type);
        if (result != null) return result;

        result = handleTaggedValue(vt, subject, feature, type);
        if (result != null) return result;

        return null;
    }

    /**
     * Handle Association features.
     */
    private Object handleAssociation(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAAssociation(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        if ("connection".equals(feature)) {
            return new ArrayList<Object>(Model.getFacade()
                    .getConnections(subject));
        }
        if ("allConnections".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getConnections(subject));
        }
        return null;
    }

    /**
     * Handle AssociationEnd features.
     */
    private Object handleAssociationEnd(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAAssociationEnd(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "aggregation":
                return Model.getFacade().getAggregation1(subject);
            case "changeability":
                return Model.getFacade().getChangeability(subject);
            case "ordering":
                return Model.getFacade().getOrdering(subject);
            case "isNavigable":
                return Model.getFacade().isNavigable(subject);
            case "multiplicity":
                return Model.getFacade().getMultiplicity(subject);
            case "targetScope":
                return Model.getFacade().getTargetScope(subject);
            case "visibility":
                return Model.getFacade().getVisibility(subject);
            case "qualifier":
                return Model.getFacade().getQualifiers(subject);
            case "specification":
                return Model.getFacade().getSpecification(subject);
            case "participant":
                return Model.getFacade().getClassifier(subject);
            case "upperbound":
                return Model.getFacade().getUpper(subject);
            default:
                return null;
        }
    }

    /**
     * Handle Attribute features.
     */
    private Object handleAttribute(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAAttribute(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "initialValue":
                return Model.getFacade().getInitialValue(subject);
            case "associationEnd":
                return new ArrayList<Object>(Model.getFacade()
                        .getAssociationEnds(subject));
            default:
                return null;
        }
    }

    /**
     * Handle BehavioralFeature features.
     */
    private Object handleBehavioralFeature(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isABehavioralFeature(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "isQuery":
                return Model.getFacade().isQuery(subject);
            case "parameter":
                return new ArrayList<Object>(Model.getFacade()
                        .getParameters(subject));
            default:
                return null;
        }
    }

    /**
     * Handle Binding features.
     */
    private Object handleBinding(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isABinding(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        if ("argument".equals(feature)) {
            return Model.getFacade().getArguments(subject);
        }
        return null;
    }

    /**
     * Handle Class features.
     */
    private Object handleClass(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAClass(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        if ("isActive".equals(feature)) {
            return Model.getFacade().isActive(subject);
        }
        return null;
    }

    /**
     * Handle Classifier features.
     */
    private Object handleClassifier(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAClassifier(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "feature":
                return new ArrayList<Object>(Model.getFacade()
                        .getFeatures(subject));
            case "association":
                return new ArrayList<Object>(Model.getFacade()
                        .getAssociationEnds(subject));
            case "powertypeRange":
                return new HashSet<Object>(Model.getFacade()
                        .getPowertypeRanges(subject));
            case "allFeatures":
                return internalOcl(subject, vt,
                        "self.feature->union("
                        + "self.parent.oclAsType(Classifier).allFeatures)");
            case "allOperations":
                return internalOcl(subject, vt,
                        "self.allFeatures->"
                        + "select(f | f.oclIsKindOf(Operation))");
            case "allMethods":
                return internalOcl(subject, vt,
                        "self.allFeatures->"
                        + "select(f | f.oclIsKindOf(Method))");
            case "allAttributes":
                return internalOcl(subject, vt,
                        "self.allFeatures->"
                        + "select(f | f.oclIsKindOf(Attribute))");
            case "associations":
                return internalOcl(subject, vt,
                        "self.association.association->asSet()");
            case "allAssociations":
                return internalOcl(subject, vt,
                        "self.associations->union("
                        + "self.parent.oclAsType(Classifier).allAssociations)");
            case "oppositeAssociationEnds":
                return internalOcl(subject, vt,
                        "self.associations->select ( a | a.connection->select "
                        + "( ae | ae.participant = self ).size = 1 )->"
                        + "collect ( a | a.connection->"
                        + "select ( ae | ae.participant <> self ) )->"
                        + "union ( self.associations->"
                        + "select ( a | a.connection->select ( ae |"
                        + "ae.participant = self ).size > 1 )->"
                        + "collect ( a | a.connection) )");
            case "allOppositeAssociationEnds":
                return internalOcl(subject, vt,
                        "self.oppositeAssociationEnds->"
                        + "union(self.parent.allOppositeAssociationEnds )");
            case "specification":
                return internalOcl(subject, vt,
                        "self.clientDependency->"
                        + "select(d |"
                        + "d.oclIsKindOf(Abstraction)"
                        + "and d.stereotype.name = \"realization\" "
                        + "and d.supplier.oclIsKindOf(Classifier))"
                        + ".supplier.oclAsType(Classifier)");
            case "allContents":
                return internalOcl(subject, vt,
                        "self.contents->union("
                        + "self.parent.allContents->select(e |"
                        + "e.elementOwnership.visibility = #public or true or "
                        + " e.elementOwnership.visibility = #protected))");
            case "allDiscriminators":
                return internalOcl(subject, vt,
                        "self.generalization.discriminator->"
                        + "union(self.parent.oclAsType(Classifier)."
                        + "allDiscriminators)");
            default:
                return null;
        }
    }

    /**
     * Handle Comment features.
     */
    private Object handleComment(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAComment(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "body":
                return Model.getFacade().getBody(subject);
            case "annotatedElement":
                return new HashSet<Object>(Model.getFacade()
                        .getAnnotatedElements(subject));
            default:
                return null;
        }
    }

    /**
     * Handle Component features.
     */
    private Object handleComponent(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAComponent(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "deploymentLocation":
                return new HashSet<Object>(Model.getFacade()
                        .getDeploymentLocations(subject));
            case "resident":
                return new HashSet<Object>(Model.getFacade()
                        .getResidents(subject));
            case "allResidentElements":
                return internalOcl(subject, vt,
                        "self.resident->union("
                        + "self.parent.oclAsType(Component)."
                        + "allResidentElements->select( re |"
                        + "re.elementResidence.visibility = #public or "
                        + "re.elementResidence.visibility = #protected))");
            default:
                return null;
        }
    }

    /**
     * Handle Constraint features.
     */
    private Object handleConstraint(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAConstraint(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "body":
                return Model.getFacade().getBody(subject);
            case "constrainedElement":
                return Model.getFacade().getConstrainedElements(subject);
            default:
                return null;
        }
    }

    /**
     * Handle Dependency features.
     */
    private Object handleDependency(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isADependency(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "client":
                return new HashSet<Object>(Model.getFacade()
                        .getClients(subject));
            case "supplier":
                return new HashSet<Object>(Model.getFacade()
                        .getSuppliers(subject));
            default:
                return null;
        }
    }

    /**
     * Handle ElementResidence features.
     */
    private Object handleElementResidence(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAElementResidence(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        if ("visibility".equals(feature)) {
            return Model.getFacade().getVisibility(subject);
        }
        return null;
    }

    /**
     * Handle Enumeration features.
     */
    private Object handleEnumeration(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAEnumeration(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        if ("literal".equals(feature)) {
            return Model.getFacade().getEnumerationLiterals(subject);
        }
        return null;
    }

    /**
     * Handle EnumerationLiteral features.
     */
    private Object handleEnumerationLiteral(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAEnumerationLiteral(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        if ("enumeration".equals(feature)) {
            return Model.getFacade().getEnumeration(subject);
        }
        return null;
    }

    /**
     * Handle Feature features.
     */
    private Object handleFeature(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAFeature(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "ownerScope":
                return Model.getFacade().isStatic(subject);
            case "visibility":
                return Model.getFacade().getVisibility(subject);
            case "owner":
                return Model.getFacade().getOwner(subject);
            default:
                return null;
        }
    }

    /**
     * Handle GeneralizableElement features.
     */
    private Object handleGeneralizableElement(Map<String, Object> vt,
            Object subject, String feature, String type) {
        if (!Model.getFacade().isAGeneralizableElement(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "isAbstract":
                return Model.getFacade().isAbstract(subject);
            case "isLeaf":
                return Model.getFacade().isLeaf(subject);
            case "isRoot":
                return Model.getFacade().isRoot(subject);
            case "generalization":
                return new HashSet<Object>(Model.getFacade()
                        .getGeneralizations(subject));
            case "specialization":
                return new HashSet<Object>(Model.getFacade()
                        .getSpecializations(subject));
            case "parent":
                return internalOcl(subject, vt,
                        "self.generalization.parent");
            case "allParents":
                return internalOcl(subject, vt,
                        "self.parent->union(self.parent.allParents)");
            default:
                return null;
        }
    }

    /**
     * Handle Generalization features.
     */
    private Object handleGeneralization(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAGeneralization(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "discriminator":
                return Model.getFacade().getDiscriminator(subject);
            case "child":
                return Model.getFacade().getSpecific(subject);
            case "parent":
                return Model.getFacade().getGeneral(subject);
            case "powertype":
                return Model.getFacade().getPowertype(subject);
            case "specialization":
                return new HashSet<Object>(Model.getFacade()
                        .getSpecializations(subject));
            default:
                return null;
        }
    }

    /**
     * Handle Method features.
     */
    private Object handleMethod(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAMethod(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "body":
                return Model.getFacade().getBody(subject);
            case "specification":
                return Model.getFacade().getSpecification(subject);
            default:
                return null;
        }
    }

    /**
     * Handle ModelElement features.
     */
    private Object handleModelElement(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAModelElement(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "name":
                String name = Model.getFacade().getName(subject);
                return name == null ? "" : name;
            case "clientDependency":
                return new HashSet<Object>(Model.getFacade()
                        .getClientDependencies(subject));
            case "constraint":
                return new HashSet<Object>(Model.getFacade()
                        .getConstraints(subject));
            case "namespace":
                return Model.getFacade().getNamespace(subject);
            case "supplierDependency":
                return new HashSet<Object>(Model.getFacade()
                        .getSupplierDependencies(subject));
            case "templateParameter":
                return Model.getFacade().getTemplateParameters(subject);
            case "stereotype":
                return Model.getFacade().getStereotypes(subject);
            case "taggedValue":
                return Model.getFacade().getTaggedValuesCollection(subject);
            case "supplier":
                return internalOcl(subject, vt,
                        "self.clientDependency.supplier");
            case "allSuppliers":
                return internalOcl(subject, vt,
                        "self.supplier->union(self.supplier.allSuppliers)");
            case "model":
                return internalOcl(subject, vt,
                        "self.namespace->"
                        + "union(self.namespace.allSurroundingNamespaces)->"
                        + "select( ns| ns.oclIsKindOf (Model))");
            case "isTemplate":
                return !Model.getFacade().getTemplateParameters(subject)
                        .isEmpty();
            case "isInstantiated":
                return internalOcl(subject, vt,
                        "self.clientDependency->"
                        + "select(oclIsKindOf(Binding))->notEmpty");
            case "templateArgument":
                return internalOcl(subject, vt,
                        "self.clientDependency->"
                        + "select(oclIsKindOf(Binding))."
                        + "oclAsType(Binding).argument");
            default:
                return null;
        }
    }

    /**
     * Handle Namespace features.
     */
    private Object handleNamespace(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isANamespace(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "ownedElement":
                return new HashSet<Object>(Model.getFacade()
                        .getOwnedElements(subject));
            case "contents":
                return internalOcl(subject, vt,
                        "self.ownedElement->"
                        + "union(self.ownedElement->"
                        + "select(x|x.oclIsKindOf(Namespace)).contents)");
            case "allContents":
                return internalOcl(subject, vt, "self.contents");
            case "allVisibleElements":
                return internalOcl(subject, vt,
                        "self.allContents ->"
                        + "select(e |e.elementOwnership.visibility = #public)");
            case "allSurroundingNamespaces":
                return internalOcl(subject, vt,
                        "self.namespace->"
                        + "union(self.namespace.allSurroundingNamespaces)");
            default:
                return null;
        }
    }

    /**
     * Handle Node features.
     */
    private Object handleNode(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isANode(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        if ("deployedComponent".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getDeployedComponents(subject));
        }
        return null;
    }

    /**
     * Handle Operation features.
     */
    private Object handleOperation(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAOperation(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "concurrency":
                return Model.getFacade().getConcurrency(subject);
            case "isAbstract":
                return Model.getFacade().isAbstract(subject);
            case "isLeaf":
                return Model.getFacade().isLeaf(subject);
            case "isRoot":
                return Model.getFacade().isRoot(subject);
            default:
                return null;
        }
    }

    /**
     * Handle Parameter features.
     */
    private Object handleParameter(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAParameter(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "defaultValue":
                return Model.getFacade().getDefaultValue(subject);
            case "kind":
                return Model.getFacade().getKind(subject);
            default:
                return null;
        }
    }

    /**
     * Handle StructuralFeature features.
     */
    private Object handleStructuralFeature(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAStructuralFeature(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "changeability":
                return Model.getFacade().getChangeability(subject);
            case "multiplicity":
                return Model.getFacade().getMultiplicity(subject);
            case "ordering":
                return Model.getFacade().getOrdering(subject);
            case "targetScope":
                return Model.getFacade().getTargetScope(subject);
            case "type":
                return Model.getFacade().getType(subject);
            default:
                return null;
        }
    }

    /**
     * Handle TemplateArgument features.
     */
    private Object handleTemplateArgument(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isATemplateArgument(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "binding":
                return Model.getFacade().getBinding(subject);
            case "modelElement":
                return Model.getFacade().getModelElement(subject);
            default:
                return null;
        }
    }

    /**
     * Handle TemplateParameter features.
     */
    private Object handleTemplateParameter(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isATemplateParameter(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        if ("defaultElement".equals(feature)) {
            return Model.getFacade().getDefaultElement(subject);
        }
        return null;
    }

    /**
     * Handle UseCase features.
     */
    private Object handleUseCase(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAUseCase(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "specificationPath":
                return Model.getUseCasesHelper().getSpecificationPath(subject);
            case "allExtensionPoints":
                Collection c = Model.getCoreHelper().getAllSupertypes(subject);
                Collection result = new ArrayList(Model.getFacade()
                        .getExtensionPoints(subject));
                for (Object uc : c) {
                    result.addAll(Model.getFacade().getExtensionPoints(uc));
                }
                return result;
            default:
                return null;
        }
    }

    /**
     * Handle AssociationClass features.
     */
    private Object handleAssociationClass(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAAssociationClass(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        if ("allConnections".equals(feature)) {
            return internalOcl(
                    subject,
                    vt,
                    "self.connection->union(self.parent->select("
                    + "s | s.oclIsKindOf(Association))->collect("
                    + "a : Association | a.allConnections))->asSet()");
        }
        return null;
    }

    /**
     * Handle Stereotype features.
     */
    private Object handleStereotype(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isAStereotype(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "baseClass":
                return new HashSet<Object>(Model.getFacade()
                        .getBaseClasses(subject));
            case "extendedElement":
                return new HashSet<Object>(Model.getFacade()
                        .getExtendedElements(subject));
            case "definedTag":
                return new HashSet<Object>(Model.getFacade()
                        .getTagDefinitions(subject));
            default:
                return null;
        }
    }

    /**
     * Handle TagDefinition features.
     */
    private Object handleTagDefinition(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isATagDefinition(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "multiplicity":
                return Model.getFacade().getMultiplicity(subject);
            case "tagType":
                return Model.getFacade().getType(subject);
            case "typedValue":
                return new HashSet<Object>(Model.getFacade()
                        .getTypedValues(subject));
            case "owner":
                return Model.getFacade().getOwner(subject);
            default:
                return null;
        }
    }

    /**
     * Handle TaggedValue features.
     */
    private Object handleTaggedValue(Map<String, Object> vt, Object subject,
            String feature, String type) {
        if (!Model.getFacade().isATaggedValue(subject)) {
            return null;
        }
        if (!".equals(type)) {
            return null;
        }
        switch (feature) {
            case "dataValue":
                return Model.getFacade().getDataValue(subject);
            case "type":
                return Model.getFacade().getType(subject);
            case "referenceValue":
                return new HashSet<Object>(Model.getFacade()
                        .getReferenceValue(subject));
            default:
                return null;
        }
    }

    private Object internalOcl(Object subject, Map<String, Object> vt,
            String ocl) {
        try {
            Object oldSelf = vt.get("self");

            vt.put("self", subject);
            Object ret = DefaultOclEvaluator.getInstance().evaluate(vt,
                    uml14mi, ocl);
            vt.put("self", oldSelf);
            return ret;
        } catch (InvalidOclException e) {
            LOG.log(Level.SEVERE, "Exception", e);
            return null;
        }
    }

    /**
     * Add the metamodel-metaclasses as built-in symbols
     *
     * @param sym the symbol
     * @return the value of the symbol
     * @see org.argouml.profile.internal.ocl.ModelInterpreter#getBuiltInSymbol(java.lang.String)
     */
    public Object getBuiltInSymbol(String sym) {
        for (String name : Model.getFacade().getMetatypeNames()) {
            if (name.equals(sym)) {
                return new OclType(sym);
            }
        }
        return null;
    }

}