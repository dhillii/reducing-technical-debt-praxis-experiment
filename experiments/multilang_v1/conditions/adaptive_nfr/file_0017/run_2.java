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

    /*
     * @see org.argouml.profile.internal.ocl.ModelInterpreter#invokeFeature(java.util.Map,
     *      java.lang.Object, java.lang.String, java.lang.String,
     *      java.lang.Object[])
     */
    @SuppressWarnings("unchecked")
    public Object invokeFeature(Map<String, Object> vt, Object subject,
            String feature, String type, Object[] parameters) {

        if (subject == null) {
            subject = vt.get("self");
        }

        if (!type.equals(".")) {
            return null;
        }

        Object result = handleAssociation(subject, feature);
        if (result != null) return result;

        result = handleAssociationEnd(subject, feature);
        if (result != null) return result;

        result = handleAttribute(subject, feature);
        if (result != null) return result;

        result = handleBehavioralFeature(subject, feature);
        if (result != null) return result;

        result = handleBinding(subject, feature);
        if (result != null) return result;

        result = handleClass(subject, feature);
        if (result != null) return result;

        result = handleClassifier(subject, feature);
        if (result != null) return result;

        result = handleComment(subject, feature);
        if (result != null) return result;

        result = handleComponent(subject, feature);
        if (result != null) return result;

        result = handleConstraint(subject, feature);
        if (result != null) return result;

        result = handleDependency(subject, feature);
        if (result != null) return result;

        result = handleElementResidence(subject, feature);
        if (result != null) return result;

        result = handleEnumeration(subject, feature);
        if (result != null) return result;

        result = handleEnumerationLiteral(subject, feature);
        if (result != null) return result;

        result = handleFeature(subject, feature);
        if (result != null) return result;

        result = handleGeneralizableElement(subject, feature);
        if (result != null) return result;

        result = handleGeneralization(subject, feature);
        if (result != null) return result;

        result = handleMethod(subject, feature);
        if (result != null) return result;

        result = handleModelElement(subject, feature, vt);
        if (result != null) return result;

        result = handleNamespace(subject, feature, vt);
        if (result != null) return result;

        result = handleNode(subject, feature);
        if (result != null) return result;

        result = handleOperation(subject, feature);
        if (result != null) return result;

        result = handleParameter(subject, feature);
        if (result != null) return result;

        result = handleStructuralFeature(subject, feature);
        if (result != null) return result;

        result = handleTemplateArgument(subject, feature);
        if (result != null) return result;

        result = handleTemplateParameter(subject, feature);
        if (result != null) return result;

        result = handleUseCase(subject, feature);
        if (result != null) return result;

        result = handleAssociationClass(subject, feature, vt);
        if (result != null) return result;

        result = handleStereotype(subject, feature);
        if (result != null) return result;

        result = handleTagDefinition(subject, feature);
        if (result != null) return result;

        result = handleTaggedValue(subject, feature);
        if (result != null) return result;

        return null;
    }

    /**
     * Handle Association features.
     */
    private Object handleAssociation(Object subject, String feature) {
        if (!Model.getFacade().isAAssociation(subject)) {
            return null;
        }
        if (feature.equals("connection")) {
            return new ArrayList<Object>(Model.getFacade()
                    .getConnections(subject));
        }
        if (feature.equals("allConnections")) {
            return new HashSet<Object>(Model.getFacade()
                    .getConnections(subject));
        }
        return null;
    }

    /**
     * Handle AssociationEnd features.
     */
    private Object handleAssociationEnd(Object subject, String feature) {
        if (!Model.getFacade().isAAssociationEnd(subject)) {
            return null;
        }
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

    /**
     * Handle Attribute features.
     */
    private Object handleAttribute(Object subject, String feature) {
        if (!Model.getFacade().isAAttribute(subject)) {
            return null;
        }
        if (feature.equals("initialValue")) {
            return Model.getFacade().getInitialValue(subject);
        }
        if (feature.equals("associationEnd")) {
            return new ArrayList<Object>(Model.getFacade()
                    .getAssociationEnds(subject));
        }
        return null;
    }

    /**
     * Handle BehavioralFeature features.
     */
    private Object handleBehavioralFeature(Object subject, String feature) {
        if (!Model.getFacade().isABehavioralFeature(subject)) {
            return null;
        }
        if (feature.equals("isQuery")) {
            return Model.getFacade().isQuery(subject);
        }
        if (feature.equals("parameter")) {
            return new ArrayList<Object>(Model.getFacade()
                    .getParameters(subject));
        }
        return null;
    }

    /**
     * Handle Binding features.
     */
    private Object handleBinding(Object subject, String feature) {
        if (!Model.getFacade().isABinding(subject)) {
            return null;
        }
        if (feature.equals("argument")) {
            return Model.getFacade().getArguments(subject);
        }
        return null;
    }

    /**
     * Handle Class features.
     */
    private Object handleClass(Object subject, String feature) {
        if (!Model.getFacade().isAClass(subject)) {
            return null;
        }
        if (feature.equals("isActive")) {
            return Model.getFacade().isActive(subject);
        }
        return null;
    }

    /**
     * Handle Classifier features.
     */
    private Object handleClassifier(Object subject, String feature) {
        if (!Model.getFacade().isAClassifier(subject)) {
            return null;
        }
        if (feature.equals("feature")) {
            return new ArrayList<Object>(Model.getFacade()
                    .getFeatures(subject));
        }
        if (feature.equals("association")) {
            return new ArrayList<Object>(Model.getFacade()
                  .getAssociationEnds(subject));
        }
        if (feature.equals("powertypeRange")) {
            return new HashSet<Object>(Model.getFacade()
                    .getPowertypeRanges(subject));
        }
        if (feature.equals("allFeatures")) {
            return internalOcl(subject, null, "self.feature->union("
                    + "self.parent.oclAsType(Classifier).allFeatures)");
        }
        if (feature.equals("allOperations")) {
            return internalOcl(subject, null, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Operation))");
        }
        if (feature.equals("allMethods")) {
            return internalOcl(subject, null, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Method))");
        }
        if (feature.equals("allAttributes")) {
            return internalOcl(subject, null, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Attribute))");
        }
        if (feature.equals("associations")) {
            return internalOcl(subject, null,
                    "self.association.association->asSet()");
        }
        if (feature.equals("allAssociations")) {
            return internalOcl(
                    subject,
                    null,
                  "self.associations->union("
                + "self.parent.oclAsType(Classifier).allAssociations)");
        }
        if (feature.equals("oppositeAssociationEnds")) {
            return internalOcl(subject, null,
                "self.associations->select ( a | a.connection->select "
                    + "( ae | ae.participant = self ).size = 1 )->"
                    + "collect ( a | a.connection->"
                    + "select ( ae | ae.participant <> self ) )->"
                    + "union ( self.associations->"
                    + "select ( a | a.connection->select ( ae |"
                    + "ae.participant = self ).size > 1 )->"
                    + "collect ( a | a.connection) )");
        }
        if (feature.equals("allOppositeAssociationEnds")) {
            return internalOcl(
                    subject,
                    null,
                    "self.oppositeAssociationEnds->"
                  + "union(self.parent.allOppositeAssociationEnds )");
        }
        if (feature.equals("specification")) {
            return internalOcl(
                    subject,
                    null,
                    "self.clientDependency->"
                    + "select(d |"
                    + "d.oclIsKindOf(Abstraction)"
                    + "and d.stereotype.name = \"realization\" "
                    + "and d.supplier.oclIsKindOf(Classifier))"
                    + ".supplier.oclAsType(Classifier)");
        }
        if (feature.equals("allContents")) {
            return internalOcl(subject, null,
                "self.contents->union("
                + "self.parent.allContents->select(e |"
                + "e.elementOwnership.visibility = #public or true or "
                + " e.elementOwnership.visibility = #protected))");
        }
        if (feature.equals("allDiscriminators")) {
            return internalOcl(subject, null,
                "self.generalization.discriminator->"
                + "union(self.parent.oclAsType(Classifier)."
                + "allDiscriminators)");
        }
        return null;
    }

    /**
     * Handle Comment features.
     */
    private Object handleComment(Object subject, String feature) {
        if (!Model.getFacade().isAComment(subject)) {
            return null;
        }
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("annotatedElement")) {
            return new HashSet<Object>(Model.getFacade()
                    .getAnnotatedElements(subject));
        }
        return null;
    }

    /**
     * Handle Component features.
     */
    private Object handleComponent(Object subject, String feature) {
        if (!Model.getFacade().isAComponent(subject)) {
            return null;
        }
        if (feature.equals("deploymentLocation")) {
            return new HashSet<Object>(Model.getFacade()
                    .getDeploymentLocations(subject));
        }
        if (feature.equals("resident")) {
            return new HashSet<Object>(Model.getFacade()
                    .getResidents(subject));
        }
        if (feature.equals("allResidentElements")) {
            return internalOcl(subject, null,
                "self.resident->union("
                + "self.parent.oclAsType(Component)."
                + "allResidentElements->select( re |"
                + "re.elementResidence.visibility = #public or "
                + "re.elementResidence.visibility = #protected))");
        }
        return null;
    }

    /**
     * Handle Constraint features.
     */
    private Object handleConstraint(Object subject, String feature) {
        if (!Model.getFacade().isAConstraint(subject)) {
            return null;
        }
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("constrainedElement")) {
            return Model.getFacade().getConstrainedElements(subject);
        }
        return null;
    }

    /**
     * Handle Dependency features.
     */
    private Object handleDependency(Object subject, String feature) {
        if (!Model.getFacade().isADependency(subject)) {
            return null;
        }
        if (feature.equals("client")) {
            return new HashSet<Object>(Model.getFacade()
                    .getClients(subject));
        }
        if (feature.equals("supplier")) {
            return new HashSet<Object>(Model.getFacade()
                    .getSuppliers(subject));
        }
        return null;
    }

    /**
     * Handle ElementResidence features.
     */
    private Object handleElementResidence(Object subject, String feature) {
        if (!Model.getFacade().isAElementResidence(subject)) {
            return null;
        }
        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        }
        return null;
    }

    /**
     * Handle Enumeration features.
     */
    private Object handleEnumeration(Object subject, String feature) {
        if (!Model.getFacade().isAEnumeration(subject)) {
            return null;
        }
        if (feature.equals("literal")) {
            return Model.getFacade().getEnumerationLiterals(subject);
        }
        return null;
    }

    /**
     * Handle EnumerationLiteral features.
     */
    private Object handleEnumerationLiteral(Object subject, String feature) {
        if (!Model.getFacade().isAEnumerationLiteral(subject)) {
            return null;
        }
        if (feature.equals("enumeration")) {
            return Model.getFacade().getEnumeration(subject);
        }
        return null;
    }

    /**
     * Handle Feature features.
     */
    private Object handleFeature(Object subject, String feature) {
        if (!Model.getFacade().isAFeature(subject)) {
            return null;
        }
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

    /**
     * Handle GeneralizableElement features.
     */
    private Object handleGeneralizableElement(Object subject, String feature) {
        if (!Model.getFacade().isAGeneralizableElement(subject)) {
            return null;
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
        if (feature.equals("generalization")) {
            return new HashSet<Object>(Model.getFacade()
                    .getGeneralizations(subject));
        }
        if (feature.equals("specialization")) {
            return new HashSet<Object>(Model.getFacade()
                    .getSpecializations(subject));
        }
        if (feature.equals("parent")) {
            return internalOcl(subject, null,
                    "self.generalization.parent");
        }
        if (feature.equals("allParents")) {
            return internalOcl(subject, null,
                    "self.parent->union(self.parent.allParents)");
        }
        return null;
    }

    /**
     * Handle Generalization features.
     */
    private Object handleGeneralization(Object subject, String feature) {
        if (!Model.getFacade().isAGeneralization(subject)) {
            return null;
        }
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
            return new HashSet<Object>(Model.getFacade()
                    .getSpecializations(subject));
        }
        return null;
    }

    /**
     * Handle Method features.
     */
    private Object handleMethod(Object subject, String feature) {
        if (!Model.getFacade().isAMethod(subject)) {
            return null;
        }
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(subject);
        }
        return null;
    }

    /**
     * Handle ModelElement features.
     */
    private Object handleModelElement(Object subject, String feature, Map<String, Object> vt) {
        if (!Model.getFacade().isAModelElement(subject)) {
            return null;
        }
        if (feature.equals("name")) {
            String name = Model.getFacade().getName(subject);
            if (name == null) {
                name = "";
            }
            return name;
        }
        if (feature.equals("clientDependency")) {
            return new HashSet<Object>(Model.getFacade()
                    .getClientDependencies(subject));
        }
        if (feature.equals("constraint")) {
            return new HashSet<Object>(Model.getFacade()
                    .getConstraints(subject));
        }
        if (feature.equals("namespace")) {
            return Model.getFacade().getNamespace(subject);
        }
        if (feature.equals("supplierDependency")) {
            return new HashSet<Object>(Model.getFacade()
                    .getSupplierDependencies(subject));
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
        if (feature.equals("supplier")) {
            return internalOcl(subject, vt,
                    "self.clientDependency.supplier");
        }
        if (feature.equals("allSuppliers")) {
            return internalOcl(subject, vt,
                    "self.supplier->union(self.supplier.allSuppliers)");
        }
        if (feature.equals("model")) {
            return internalOcl(subject, vt,
                    "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)->"
                    + "select( ns| ns.oclIsKindOf (Model))");
        }
        if (feature.equals("isTemplate")) {
            return !Model.getFacade().getTemplateParameters(subject)
                    .isEmpty();
        }
        if (feature.equals("isInstantiated")) {
            return internalOcl(subject, vt, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))->notEmpty");
        }
        if (feature.equals("templateArgument")) {
            return internalOcl(subject, vt, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))."
                    + "oclAsType(Binding).argument");
        }
        return null;
    }

    /**
     * Handle Namespace features.
     */
    private Object handleNamespace(Object subject, String feature, Map<String, Object> vt) {
        if (!Model.getFacade().isANamespace(subject)) {
            return null;
        }
        if (feature.equals("ownedElement")) {
            return new HashSet<Object>(Model.getFacade()
                    .getOwnedElements(subject));
        }
        if (feature.equals("contents")) {
            return internalOcl(subject, vt, "self.ownedElement->"
                    + "union(self.ownedElement->"
                    + "select(x|x.oclIsKindOf(Namespace)).contents)");
        }
        if (feature.equals("allContents")) {
            return internalOcl(subject, vt, "self.contents");
        }
        if (feature.equals("allVisibleElements")) {
            return internalOcl(
                    subject,
                    vt,
                  "self.allContents ->"
                + "select(e |e.elementOwnership.visibility = #public)");
        }
        if (feature.equals("allSurroundingNamespaces")) {
            return internalOcl(subject, vt, "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)");
        }
        return null;
    }

    /**
     * Handle Node features.
     */
    private Object handleNode(Object subject, String feature) {
        if (!Model.getFacade().isANode(subject)) {
            return null;
        }
        if (feature.equals("deployedComponent")) {
            return new HashSet<Object>(Model.getFacade()
                    .getDeployedComponents(subject));
        }
        return null;
    }

    /**
     * Handle Operation features.
     */
    private Object handleOperation(Object subject, String feature) {
        if (!Model.getFacade().isAOperation(subject)) {
            return null;
        }
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

    /**
     * Handle Parameter features.
     */
    private Object handleParameter(Object subject, String feature) {
        if (!Model.getFacade().isAParameter(subject)) {
            return null;
        }
        if (feature.equals("defaultValue")) {
            return Model.getFacade().getDefaultValue(subject);
        }
        if (feature.equals("kind")) {
            return Model.getFacade().getKind(subject);
        }
        return null;
    }

    /**
     * Handle StructuralFeature features.
     */
    private Object handleStructuralFeature(Object subject, String feature) {
        if (!Model.getFacade().isAStructuralFeature(subject)) {
            return null;
        }
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

    /**
     * Handle TemplateArgument features.
     */
    private Object handleTemplateArgument(Object subject, String feature) {
        if (!Model.getFacade().isATemplateArgument(subject)) {
            return null;
        }
        if (feature.equals("binding")) {
            return Model.getFacade().getBinding(subject);
        }
        if (feature.equals("modelElement")) {
            return Model.getFacade().getModelElement(subject);
        }
        return null;
    }

    /**
     * Handle TemplateParameter features.
     */
    private Object handleTemplateParameter(Object subject, String feature) {
        if (!Model.getFacade().isATemplateParameter(subject)) {
            return null;
        }
        if (feature.equals("defaultElement")) {
            return Model.getFacade().getDefaultElement(subject);
        }
        return null;
    }

    /**
     * Handle UseCase features.
     */
    private Object handleUseCase(Object subject, String feature) {
        if (!Model.getFacade().isAUseCase(subject)) {
            return null;
        }
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

    /**
     * Handle AssociationClass features.
     */
    private Object handleAssociationClass(Object subject, String feature, Map<String, Object> vt) {
        if (!Model.getFacade().isAAssociationClass(subject)) {
            return null;
        }
        if (feature.equals("allConnections")) {
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
    private Object handleStereotype(Object subject, String feature) {
        if (!Model.getFacade().isAStereotype(subject)) {
            return null;
        }
        if (feature.equals("baseClass")) {
            return new HashSet<Object>(Model.getFacade()
                    .getBaseClasses(subject));
        }
        if (feature.equals("extendedElement")) {
            return new HashSet<Object>(Model.getFacade()
                    .getExtendedElements(subject));
        }
        if (feature.equals("definedTag")) {
            return new HashSet<Object>(Model.getFacade()
                    .getTagDefinitions(subject));
        }
        return null;
    }

    /**
     * Handle TagDefinition features.
     */
    private Object handleTagDefinition(Object subject, String feature) {
        if (!Model.getFacade().isATagDefinition(subject)) {
            return null;
        }
        if (feature.equals("multiplicity")) {
            return Model.getFacade().getMultiplicity(subject);
        }
        if (feature.equals("tagType")) {
            return Model.getFacade().getType(subject);
        }
        if (feature.equals("typedValue")) {
            return new HashSet<Object>(Model.getFacade()
                    .getTypedValues(subject));
        }
        if (feature.equals("owner")) {
            return Model.getFacade().getOwner(subject);
        }
        return null;
    }

    /**
     * Handle TaggedValue features.
     */
    private Object handleTaggedValue(Object subject, String feature) {
        if (!Model.getFacade().isATaggedValue(subject)) {
            return null;
        }
        if (feature.equals("dataValue")) {
            return Model.getFacade().getDataValue(subject);
        }
        if (feature.equals("type")) {
            return Model.getFacade().getType(subject);
        }
        if (feature.equals("referenceValue")) {
            return new HashSet<Object>(Model.getFacade()
                    .getReferenceValue(subject));
        }
        return null;
    }

    private Object internalOcl(Object subject, Map<String, Object> vt,
            String ocl) {
        try {
            Object oldSelf = null;
            if (vt != null) {
                oldSelf = vt.get("self");
                vt.put("self", subject);
            }
            Object ret = DefaultOclEvaluator.getInstance().evaluate(vt,
                    uml14mi, ocl);
            if (vt != null) {
                vt.put("self", oldSelf);
            }
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