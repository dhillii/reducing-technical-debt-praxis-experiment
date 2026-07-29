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

        if (!".equals(type)) {
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

    private Object handleAssociationEnd(Object subject, String feature) {
        if ("aggregation".equals(feature)) {
            return Model.getFacade().getAggregation1(subject);
        }
        if ("changeability".equals(feature)) {
            return Model.getFacade().getChangeability(subject);
        }
        if ("ordering".equals(feature)) {
            return Model.getFacade().getOrdering(subject);
        }
        if ("isNavigable".equals(feature)) {
            return Model.getFacade().isNavigable(subject);
        }
        if ("multiplicity".equals(feature)) {
            return Model.getFacade().getMultiplicity(subject);
        }
        if ("targetScope".equals(feature)) {
            return Model.getFacade().getTargetScope(subject);
        }
        if ("visibility".equals(feature)) {
            return Model.getFacade().getVisibility(subject);
        }
        if ("qualifier".equals(feature)) {
            return Model.getFacade().getQualifiers(subject);
        }
        if ("specification".equals(feature)) {
            return Model.getFacade().getSpecification(subject);
        }
        if ("participant".equals(feature)) {
            return Model.getFacade().getClassifier(subject);
        }
        if ("upperbound".equals(feature)) {
            return Model.getFacade().getUpper(subject);
        }
        return null;
    }

    private Object handleAttribute(Object subject, String feature) {
        if ("initialValue".equals(feature)) {
            return Model.getFacade().getInitialValue(subject);
        }
        if ("associationEnd".equals(feature)) {
            return new ArrayList<Object>(Model.getFacade()
                    .getAssociationEnds(subject));
        }
        return null;
    }

    private Object handleBehavioralFeature(Object subject, String feature) {
        if ("isQuery".equals(feature)) {
            return Model.getFacade().isQuery(subject);
        }
        if ("parameter".equals(feature)) {
            return new ArrayList<Object>(Model.getFacade()
                    .getParameters(subject));
        }
        return null;
    }

    private Object handleBinding(Object subject, String feature) {
        if ("argument".equals(feature)) {
            return Model.getFacade().getArguments(subject);
        }
        return null;
    }

    private Object handleClass(Object subject, String feature) {
        if ("isActive".equals(feature)) {
            return Model.getFacade().isActive(subject);
        }
        return null;
    }

    private Object handleClassifier(Object subject, String feature, Map<String, Object> vt) {
        if ("feature".equals(feature)) {
            return new ArrayList<Object>(Model.getFacade()
                    .getFeatures(subject));
        }
        if ("association".equals(feature)) {
            return new ArrayList<Object>(Model.getFacade()
                    .getAssociationEnds(subject));
        }
        if ("powertypeRange".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getPowertypeRanges(subject));
        }
        if ("allFeatures".equals(feature)) {
            return internalOcl(subject, vt, "self.feature->union("
                    + "self.parent.oclAsType(Classifier).allFeatures)");
        }
        if ("allOperations".equals(feature)) {
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Operation))");
        }
        if ("allMethods".equals(feature)) {
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Method))");
        }
        if ("allAttributes".equals(feature)) {
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Attribute))");
        }
        if ("associations".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.association.association->asSet()");
        }
        if ("allAssociations".equals(feature)) {
            return internalOcl(
                    subject,
                    vt,
                    "self.associations->union("
                    + "self.parent.oclAsType(Classifier).allAssociations)");
        }
        if ("oppositeAssociationEnds".equals(feature)) {
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
        if ("allOppositeAssociationEnds".equals(feature)) {
            return internalOcl(
                    subject,
                    vt,
                    "self.oppositeAssociationEnds->"
                    + "union(self.parent.allOppositeAssociationEnds )");
        }
        if ("specification".equals(feature)) {
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
        if ("allContents".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.contents->union("
                    + "self.parent.allContents->select(e |"
                    + "e.elementOwnership.visibility = #public or true or "
                    + " e.elementOwnership.visibility = #protected))");
        }
        if ("allDiscriminators".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.generalization.discriminator->"
                    + "union(self.parent.oclAsType(Classifier)."
                    + "allDiscriminators)");
        }
        return null;
    }

    private Object handleComment(Object subject, String feature) {
        if ("body".equals(feature)) {
            return Model.getFacade().getBody(subject);
        }
        if ("annotatedElement".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getAnnotatedElements(subject));
        }
        return null;
    }

    private Object handleComponent(Object subject, String feature, Map<String, Object> vt) {
        if ("deploymentLocation".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getDeploymentLocations(subject));
        }
        if ("resident".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getResidents(subject));
        }
        if ("allResidentElements".equals(feature)) {
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
        if ("body".equals(feature)) {
            return Model.getFacade().getBody(subject);
        }
        if ("constrainedElement".equals(feature)) {
            return Model.getFacade().getConstrainedElements(subject);
        }
        return null;
    }

    private Object handleDependency(Object subject, String feature) {
        if ("client".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getClients(subject));
        }
        if ("supplier".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getSuppliers(subject));
        }
        return null;
    }

    private Object handleElementResidence(Object subject, String feature) {
        if ("visibility".equals(feature)) {
            return Model.getFacade().getVisibility(subject);
        }
        return null;
    }

    private Object handleEnumeration(Object subject, String feature) {
        if ("literal".equals(feature)) {
            return Model.getFacade().getEnumerationLiterals(subject);
        }
        return null;
    }

    private Object handleEnumerationLiteral(Object subject, String feature) {
        if ("enumeration".equals(feature)) {
            return Model.getFacade().getEnumeration(subject);
        }
        return null;
    }

    private Object handleFeature(Object subject, String feature) {
        if ("ownerScope".equals(feature)) {
            return Model.getFacade().isStatic(subject);
        }
        if ("visibility".equals(feature)) {
            return Model.getFacade().getVisibility(subject);
        }
        if ("owner".equals(feature)) {
            return Model.getFacade().getOwner(subject);
        }
        return null;
    }

    private Object handleGeneralizableElement(Object subject, String feature, Map<String, Object> vt) {
        if ("isAbstract".equals(feature)) {
            return Model.getFacade().isAbstract(subject);
        }
        if ("isLeaf".equals(feature)) {
            return Model.getFacade().isLeaf(subject);
        }
        if ("isRoot".equals(feature)) {
            return Model.getFacade().isRoot(subject);
        }
        if ("generalization".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getGeneralizations(subject));
        }
        if ("specialization".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getSpecializations(subject));
        }
        if ("parent".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.generalization.parent");
        }
        if ("allParents".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.parent->union(self.parent.allParents)");
        }
        return null;
    }

    private Object handleGeneralization(Object subject, String feature) {
        if ("discriminator".equals(feature)) {
            return Model.getFacade().getDiscriminator(subject);
        }
        if ("child".equals(feature)) {
            return Model.getFacade().getSpecific(subject);
        }
        if ("parent".equals(feature)) {
            return Model.getFacade().getGeneral(subject);
        }
        if ("powertype".equals(feature)) {
            return Model.getFacade().getPowertype(subject);
        }
        if ("specialization".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getSpecializations(subject));
        }
        return null;
    }

    private Object handleMethod(Object subject, String feature) {
        if ("body".equals(feature)) {
            return Model.getFacade().getBody(subject);
        }
        if ("specification".equals(feature)) {
            return Model.getFacade().getSpecification(subject);
        }
        return null;
    }

    private Object handleModelElement(Object subject, String feature, Map<String, Object> vt) {
        if ("name".equals(feature)) {
            String name = Model.getFacade().getName(subject);
            return name == null ? "" : name;
        }
        if ("clientDependency".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getClientDependencies(subject));
        }
        if ("constraint".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getConstraints(subject));
        }
        if ("namespace".equals(feature)) {
            return Model.getFacade().getNamespace(subject);
        }
        if ("supplierDependency".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getSupplierDependencies(subject));
        }
        if ("templateParameter".equals(feature)) {
            return Model.getFacade().getTemplateParameters(subject);
        }
        if ("stereotype".equals(feature)) {
            return Model.getFacade().getStereotypes(subject);
        }
        if ("taggedValue".equals(feature)) {
            return Model.getFacade().getTaggedValuesCollection(subject);
        }
        if ("constraint".equals(feature)) {
            return Model.getFacade().getConstraints(subject);
        }
        if ("supplier".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.clientDependency.supplier");
        }
        if ("allSuppliers".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.supplier->union(self.supplier.allSuppliers)");
        }
        if ("model".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)->"
                    + "select( ns| ns.oclIsKindOf (Model))");
        }
        if ("isTemplate".equals(feature)) {
            return !Model.getFacade().getTemplateParameters(subject)
                    .isEmpty();
        }
        if ("isInstantiated".equals(feature)) {
            return internalOcl(subject, vt, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))->notEmpty");
        }
        if ("templateArgument".equals(feature)) {
            return internalOcl(subject, vt, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))."
                    + "oclAsType(Binding).argument");
        }
        return null;
    }

    private Object handleNamespace(Object subject, String feature, Map<String, Object> vt) {
        if ("ownedElement".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getOwnedElements(subject));
        }
        if ("contents".equals(feature)) {
            return internalOcl(subject, vt, "self.ownedElement->"
                    + "union(self.ownedElement->"
                    + "select(x|x.oclIsKindOf(Namespace)).contents)");
        }
        if ("allContents".equals(feature)) {
            return internalOcl(subject, vt, "self.contents");
        }
        if ("allVisibleElements".equals(feature)) {
            return internalOcl(
                    subject,
                    vt,
                    "self.allContents ->"
                    + "select(e |e.elementOwnership.visibility = #public)");
        }
        if ("allSurroundingNamespaces".equals(feature)) {
            return internalOcl(subject, vt, "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)");
        }
        return null;
    }

    private Object handleNode(Object subject, String feature) {
        if ("deployedComponent".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getDeployedComponents(subject));
        }
        return null;
    }

    private Object handleOperation(Object subject, String feature) {
        if ("concurrency".equals(feature)) {
            return Model.getFacade().getConcurrency(subject);
        }
        if ("isAbstract".equals(feature)) {
            return Model.getFacade().isAbstract(subject);
        }
        if ("isLeaf".equals(feature)) {
            return Model.getFacade().isLeaf(subject);
        }
        if ("isRoot".equals(feature)) {
            return Model.getFacade().isRoot(subject);
        }
        return null;
    }

    private Object handleParameter(Object subject, String feature) {
        if ("defaultValue".equals(feature)) {
            return Model.getFacade().getDefaultValue(subject);
        }
        if ("kind".equals(feature)) {
            return Model.getFacade().getKind(subject);
        }
        return null;
    }

    private Object handleStructuralFeature(Object subject, String feature) {
        if ("changeability".equals(feature)) {
            return Model.getFacade().getChangeability(subject);
        }
        if ("multiplicity".equals(feature)) {
            return Model.getFacade().getMultiplicity(subject);
        }
        if ("ordering".equals(feature)) {
            return Model.getFacade().getOrdering(subject);
        }
        if ("targetScope".equals(feature)) {
            return Model.getFacade().getTargetScope(subject);
        }
        if ("type".equals(feature)) {
            return Model.getFacade().getType(subject);
        }
        return null;
    }

    private Object handleTemplateArgument(Object subject, String feature) {
        if ("binding".equals(feature)) {
            return Model.getFacade().getBinding(subject);
        }
        if ("modelElement".equals(feature)) {
            return Model.getFacade().getModelElement(subject);
        }
        return null;
    }

    private Object handleTemplateParameter(Object subject, String feature) {
        if ("defaultElement".equals(feature)) {
            return Model.getFacade().getDefaultElement(subject);
        }
        return null;
    }

    private Object handleUseCase(Object subject, String feature) {
        if ("specificationPath".equals(feature)) {
            return Model.getUseCasesHelper().getSpecificationPath(subject);
        }
        if ("allExtensionPoints".equals(feature)) {
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

    private Object handleStereotype(Object subject, String feature) {
        if ("baseClass".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getBaseClasses(subject));
        }
        if ("extendedElement".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getExtendedElements(subject));
        }
        if ("definedTag".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getTagDefinitions(subject));
        }
        return null;
    }

    private Object handleTagDefinition(Object subject, String feature) {
        if ("multiplicity".equals(feature)) {
            return Model.getFacade().getMultiplicity(subject);
        }
        if ("tagType".equals(feature)) {
            return Model.getFacade().getType(subject);
        }
        if ("typedValue".equals(feature)) {
            return new HashSet<Object>(Model.getFacade()
                    .getTypedValues(subject));
        }
        if ("owner".equals(feature)) {
            return Model.getFacade().getOwner(subject);
        }
        return null;
    }

    private Object handleTaggedValue(Object subject, String feature) {
        if ("dataValue".equals(feature)) {
            return Model.getFacade().getDataValue(subject);
        }
        if ("type".equals(feature)) {
            return Model.getFacade().getType(subject);
        }
        if ("referenceValue".equals(feature)) {
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

    public Object getBuiltInSymbol(String sym) {
        for (String name : Model.getFacade().getMetatypeNames()) {
            if (name.equals(sym)) {
                return new OclType(sym);
            }
        }
        return null;
    }

}