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

    @SuppressWarnings("unchecked")
    public Object invokeFeature(Map<String, Object> vt, Object subject,
            String feature, String type, Object[] parameters) {

        if (subject == null) {
            subject = vt.get("self");
        }

        if (!type.equals(".")) {
            return null;
        }

        if (Model.getFacade().isAAssociation(subject)) {
            return handleAssociation(subject, feature);
        }

        if (Model.getFacade().isAAssociationEnd(subject)) {
            return handleAssociationEnd(subject, feature);
        }

        if (Model.getFacade().isAAttribute(subject)) {
            return handleAttribute(subject, feature);
        }

        if (Model.getFacade().isABehavioralFeature(subject)) {
            return handleBehavioralFeature(subject, feature);
        }

        if (Model.getFacade().isABinding(subject)) {
            return handleBinding(subject, feature);
        }

        if (Model.getFacade().isAClass(subject)) {
            return handleClass(subject, feature);
        }

        if (Model.getFacade().isAClassifier(subject)) {
            return handleClassifier(subject, feature, vt);
        }

        if (Model.getFacade().isAComment(subject)) {
            return handleComment(subject, feature);
        }

        if (Model.getFacade().isAComponent(subject)) {
            return handleComponent(subject, feature, vt);
        }

        if (Model.getFacade().isAConstraint(subject)) {
            return handleConstraint(subject, feature);
        }

        if (Model.getFacade().isADependency(subject)) {
            return handleDependency(subject, feature);
        }

        if (Model.getFacade().isAElementResidence(subject)) {
            return handleElementResidence(subject, feature);
        }

        if (Model.getFacade().isAEnumeration(subject)) {
            return handleEnumeration(subject, feature);
        }

        if (Model.getFacade().isAEnumerationLiteral(subject)) {
            return handleEnumerationLiteral(subject, feature);
        }

        if (Model.getFacade().isAFeature(subject)) {
            return handleFeature(subject, feature);
        }

        if (Model.getFacade().isAGeneralizableElement(subject)) {
            return handleGeneralizableElement(subject, feature, vt);
        }

        if (Model.getFacade().isAGeneralization(subject)) {
            return handleGeneralization(subject, feature);
        }

        if (Model.getFacade().isAMethod(subject)) {
            return handleMethod(subject, feature);
        }

        if (Model.getFacade().isAModelElement(subject)) {
            return handleModelElement(subject, feature, vt);
        }

        if (Model.getFacade().isANamespace(subject)) {
            return handleNamespace(subject, feature, vt);
        }

        if (Model.getFacade().isANode(subject)) {
            return handleNode(subject, feature);
        }

        if (Model.getFacade().isAOperation(subject)) {
            return handleOperation(subject, feature);
        }

        if (Model.getFacade().isAParameter(subject)) {
            return handleParameter(subject, feature);
        }

        if (Model.getFacade().isAStructuralFeature(subject)) {
            return handleStructuralFeature(subject, feature);
        }

        if (Model.getFacade().isATemplateArgument(subject)) {
            return handleTemplateArgument(subject, feature);
        }

        if (Model.getFacade().isATemplateParameter(subject)) {
            return handleTemplateParameter(subject, feature);
        }

        if (Model.getFacade().isAUseCase(subject)) {
            return handleUseCase(subject, feature);
        }

        if (Model.getFacade().isAAssociationClass(subject)) {
            return handleAssociationClass(subject, feature, vt);
        }

        if (Model.getFacade().isAStereotype(subject)) {
            return handleStereotype(subject, feature);
        }

        if (Model.getFacade().isATagDefinition(subject)) {
            return handleTagDefinition(subject, feature);
        }

        if (Model.getFacade().isATaggedValue(subject)) {
            return handleTaggedValue(subject, feature);
        }

        return null;
    }

    private Object handleAssociation(Object subject, String feature) {
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

    private Object handleAssociationEnd(Object subject, String feature) {
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

    private Object handleAttribute(Object subject, String feature) {
        if (feature.equals("initialValue")) {
            return Model.getFacade().getInitialValue(subject);
        }
        if (feature.equals("associationEnd")) {
            return new ArrayList<Object>(Model.getFacade()
                    .getAssociationEnds(subject));
        }
        return null;
    }

    private Object handleBehavioralFeature(Object subject, String feature) {
        if (feature.equals("isQuery")) {
            return Model.getFacade().isQuery(subject);
        }
        if (feature.equals("parameter")) {
            return new ArrayList<Object>(Model.getFacade()
                    .getParameters(subject));
        }
        return null;
    }

    private Object handleBinding(Object subject, String feature) {
        if (feature.equals("argument")) {
            return Model.getFacade().getArguments(subject);
        }
        return null;
    }

    private Object handleClass(Object subject, String feature) {
        if (feature.equals("isActive")) {
            return Model.getFacade().isActive(subject);
        }
        return null;
    }

    private Object handleClassifier(Object subject, String feature, Map<String, Object> vt) {
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
            return internalOcl(subject, vt, "self.feature->union("
                    + "self.parent.oclAsType(Classifier).allFeatures)");
        }
        if (feature.equals("allOperations")) {
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Operation))");
        }
        if (feature.equals("allMethods")) {
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Method))");
        }
        if (feature.equals("allAttributes")) {
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Attribute))");
        }
        if (feature.equals("associations")) {
            return internalOcl(subject, vt,
                    "self.association.association->asSet()");
        }
        if (feature.equals("allAssociations")) {
            return internalOcl(
                    subject,
                    vt,
                  "self.associations->union("
                + "self.parent.oclAsType(Classifier).allAssociations)");
        }
        if (feature.equals("oppositeAssociationEnds")) {
            return internalOcl(subject, vt,
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
                    vt,
                    "self.oppositeAssociationEnds->"
                  + "union(self.parent.allOppositeAssociationEnds )");
        }
        if (feature.equals("specification")) {
            return internalOcl(
                    subject,
                    vt,
                    "self.clientDependency->"
                    + "select(d |"
                    + "d.oclIsKindOf(Abstraction)"
                    + "and d.stereotype.name = \"realization\" "
                    + "and d.supplier.oclIsKindOf(Classifier))"
                    + ".supplier.oclAsType(Classifier)");
        }
        if (feature.equals("allContents")) {
            return internalOcl(subject, vt,
                "self.contents->union("
                + "self.parent.allContents->select(e |"
                + "e.elementOwnership.visibility = #public or true or "
                + " e.elementOwnership.visibility = #protected))");
        }
        if (feature.equals("allDiscriminators")) {
            return internalOcl(subject, vt,
                "self.generalization.discriminator->"
                + "union(self.parent.oclAsType(Classifier)."
                + "allDiscriminators)");
        }
        return null;
    }

    private Object handleComment(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("annotatedElement")) {
            return new HashSet<Object>(Model.getFacade()
                    .getAnnotatedElements(subject));
        }
        return null;
    }

    private Object handleComponent(Object subject, String feature, Map<String, Object> vt) {
        if (feature.equals("deploymentLocation")) {
            return new HashSet<Object>(Model.getFacade()
                    .getDeploymentLocations(subject));
        }
        if (feature.equals("resident")) {
            return new HashSet<Object>(Model.getFacade()
                    .getResidents(subject));
        }
        if (feature.equals("allResidentElements")) {
            return internalOcl(subject, vt,
                "self.resident->union("
                + "self.parent.oclAsType(Component)."
                + "allResidentElements->select( re |"
                + "re.elementResidence.visibility = #public or "
                + "re.elementResidence.visibility = #protected))");
        }
        return null;
    }

    private Object handleConstraint(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("constrainedElement")) {
            return Model.getFacade().getConstrainedElements(subject);
        }
        return null;
    }

    private Object handleDependency(Object subject, String feature) {
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

    private Object handleElementResidence(Object subject, String feature) {
        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        }
        return null;
    }

    private Object handleEnumeration(Object subject, String feature) {
        if (feature.equals("literal")) {
            return Model.getFacade().getEnumerationLiterals(subject);
        }
        return null;
    }

    private Object handleEnumerationLiteral(Object subject, String feature) {
        if (feature.equals("enumeration")) {
            return Model.getFacade().getEnumeration(subject);
        }
        return null;
    }

    private Object handleFeature(Object subject, String feature) {
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

    private Object handleGeneralizableElement(Object subject, String feature, Map<String, Object> vt) {
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
            return internalOcl(subject, vt,
                    "self.generalization.parent");
        }
        if (feature.equals("allParents")) {
            return internalOcl(subject, vt,
                    "self.parent->union(self.parent.allParents)");
        }
        return null;
    }

    private Object handleGeneralization(Object subject, String feature) {
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

    private Object handleMethod(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(subject);
        }
        return null;
    }

    private Object handleModelElement(Object subject, String feature, Map<String, Object> vt) {
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

    private Object handleNamespace(Object subject, String feature, Map<String, Object> vt) {
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

    private Object handleNode(Object subject, String feature) {
        if (feature.equals("deployedComponent")) {
            return new HashSet<Object>(Model.getFacade()
                    .getDeployedComponents(subject));
        }
        return null;
    }

    private Object handleOperation(Object subject, String feature) {
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

    private Object handleParameter(Object subject, String feature) {
        if (feature.equals("defaultValue")) {
            return Model.getFacade().getDefaultValue(subject);
        }
        if (feature.equals("kind")) {
            return Model.getFacade().getKind(subject);
        }
        return null;
    }

    private Object handleStructuralFeature(Object subject, String feature) {
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

    private Object handleTemplateArgument(Object subject, String feature) {
        if (feature.equals("binding")) {
            return Model.getFacade().getBinding(subject);
        }
        if (feature.equals("modelElement")) {
            return Model.getFacade().getModelElement(subject);
        }
        return null;
    }

    private Object handleTemplateParameter(Object subject, String feature) {
        if (feature.equals("defaultElement")) {
            return Model.getFacade().getDefaultElement(subject);
        }
        return null;
    }

    private Object handleUseCase(Object subject, String feature) {
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

    private Object handleAssociationClass(Object subject, String feature, Map<String, Object> vt) {
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

    private Object handleStereotype(Object subject, String feature) {
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

    private Object handleTagDefinition(Object subject, String feature) {
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

    private Object handleTaggedValue(Object subject, String feature) {
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