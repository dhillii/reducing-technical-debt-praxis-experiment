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

        if (type.equals(".")) {
            return handleFeature(subject, feature);
        }

        return null;
    }

    private Object handleFeature(Object subject, String feature) {
        if (subject == null) {
            return null;
        }

        if (Model.getFacade().isAAssociation(subject)) {
            return handleAssociationFeature(subject, feature);
        }

        if (Model.getFacade().isAAssociationEnd(subject)) {
            return handleAssociationEndFeature(subject, feature);
        }

        if (Model.getFacade().isAAttribute(subject)) {
            return handleAttributeFeature(subject, feature);
        }

        if (Model.getFacade().isABehavioralFeature(subject)) {
            return handleBehavioralFeatureFeature(subject, feature);
        }

        if (Model.getFacade().isABinding(subject)) {
            return handleBindingFeature(subject, feature);
        }

        if (Model.getFacade().isAClass(subject)) {
            return handleClassFeature(subject, feature);
        }

        if (Model.getFacade().isAClassifier(subject)) {
            return handleClassifierFeature(subject, feature);
        }

        if (Model.getFacade().isAComment(subject)) {
            return handleCommentFeature(subject, feature);
        }

        if (Model.getFacade().isAComponent(subject)) {
            return handleComponentFeature(subject, feature);
        }

        if (Model.getFacade().isAConstraint(subject)) {
            return handleConstraintFeature(subject, feature);
        }

        if (Model.getFacade().isADependency(subject)) {
            return handleDependencyFeature(subject, feature);
        }

        if (Model.getFacade().isAElementResidence(subject)) {
            return handleElementResidenceFeature(subject, feature);
        }

        if (Model.getFacade().isAEnumeration(subject)) {
            return handleEnumerationFeature(subject, feature);
        }

        if (Model.getFacade().isAEnumerationLiteral(subject)) {
            return handleEnumerationLiteralFeature(subject, feature);
        }

        if (Model.getFacade().isAFeature(subject)) {
            return handleFeatureFeature(subject, feature);
        }

        if (Model.getFacade().isAGeneralizableElement(subject)) {
            return handleGeneralizableElementFeature(subject, feature);
        }

        if (Model.getFacade().isAGeneralization(subject)) {
            return handleGeneralizationFeature(subject, feature);
        }

        if (Model.getFacade().isAMethod(subject)) {
            return handleMethodFeature(subject, feature);
        }

        if (Model.getFacade().isAModelElement(subject)) {
            return handleModelElementFeature(subject, feature);
        }

        if (Model.getFacade().isANamespace(subject)) {
            return handleNamespaceFeature(subject, feature);
        }

        if (Model.getFacade().isANode(subject)) {
            return handleNodeFeature(subject, feature);
        }

        if (Model.getFacade().isAOperation(subject)) {
            return handleOperationFeature(subject, feature);
        }

        if (Model.getFacade().isAParameter(subject)) {
            return handleParameterFeature(subject, feature);
        }

        if (Model.getFacade().isAStructuralFeature(subject)) {
            return handleStructuralFeatureFeature(subject, feature);
        }

        if (Model.getFacade().isATemplateArgument(subject)) {
            return handleTemplateArgumentFeature(subject, feature);
        }

        if (Model.getFacade().isATemplateParameter(subject)) {
            return handleTemplateParameterFeature(subject, feature);
        }

        if (Model.getFacade().isAUseCase(subject)) {
            return handleUseCaseFeature(subject, feature);
        }

        if (Model.getFacade().isAAssociationClass(subject)) {
            return handleAssociationClassFeature(subject, feature);
        }

        if (Model.getFacade().isAStereotype(subject)) {
            return handleStereotypeFeature(subject, feature);
        }

        if (Model.getFacade().isATagDefinition(subject)) {
            return handleTagDefinitionFeature(subject, feature);
        }

        if (Model.getFacade().isATaggedValue(subject)) {
            return handleTaggedValueFeature(subject, feature);
        }

        return null;
    }

    private Object handleAssociationFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("connection")) {
                return new ArrayList<Object>(Model.getFacade()
                        .getConnections(subject));
            }

            if (feature.equals("allConnections")) {
                return new HashSet<Object>(Model.getFacade()
                        .getConnections(subject));
            }
        }
        return null;
    }

    private Object handleAssociationEndFeature(Object subject, String feature) {
        if (feature.equals(".")) {
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
        }
        return null;
    }

    private Object handleAttributeFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("initialValue")) {
                return Model.getFacade().getInitialValue(subject);
            }
            if (feature.equals("associationEnd")) {
                return new ArrayList<Object>(Model.getFacade()
                        .getAssociationEnds(subject));
            }
        }
        return null;
    }

    private Object handleBehavioralFeatureFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("isQuery")) {
                return Model.getFacade().isQuery(subject);
            }
            if (feature.equals("parameter")) {
                return new ArrayList<Object>(Model.getFacade()
                        .getParameters(subject));
            }
        }
        return null;
    }

    private Object handleBindingFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("argument")) {
                return Model.getFacade().getArguments(subject);
            }
        }
        return null;
    }

    private Object handleClassFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("isActive")) {
                return Model.getFacade().isActive(subject);
            }
        }
        return null;
    }

    private Object handleClassifierFeature(Object subject, String feature) {
        if (feature.equals(".")) {
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
                return internalOcl(subject, "self.feature->union("
                        + "self.parent.oclAsType(Classifier).allFeatures)");
            }

            if (feature.equals("allOperations")) {
                return internalOcl(subject, "self.allFeatures->"
                        + "select(f | f.oclIsKindOf(Operation))");
            }

            if (feature.equals("allMethods")) {
                return internalOcl(subject, "self.allFeatures->"
                        + "select(f | f.oclIsKindOf(Method))");
            }

            if (feature.equals("allAttributes")) {
                return internalOcl(subject, "self.allFeatures->"
                        + "select(f | f.oclIsKindOf(Attribute))");
            }

            if (feature.equals("associations")) {
                return internalOcl(subject, "self.association.association->asSet()");
            }

            if (feature.equals("allAssociations")) {
                return internalOcl(
                        subject,
                        "self.associations->union("
                    + "self.parent.oclAsType(Classifier).allAssociations)");
            }

            if (feature.equals("oppositeAssociationEnds")) {
                return internalOcl(subject,
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
                        "self.oppositeAssociationEnds->"
                      + "union(self.parent.allOppositeAssociationEnds )");
            }

            if (feature.equals("specification")) {
                return internalOcl(
                        subject,
                        "self.clientDependency->"
                        + "select(d |"
                        + "d.oclIsKindOf(Abstraction)"
                        + "and d.stereotype.name = \"realization\" "
                        + "and d.supplier.oclIsKindOf(Classifier))"
                        + ".supplier.oclAsType(Classifier)");
            }

            if (feature.equals("allContents")) {
                return internalOcl(subject,
                    "self.contents->union("
                    + "self.parent.allContents->select(e |"
                    + "e.elementOwnership.visibility = #public or true or "
                    + " e.elementOwnership.visibility = #protected))");
            }

            if (feature.equals("allDiscriminators")) {
                return internalOcl(subject,
                    "self.generalization.discriminator->"
                    + "union(self.parent.oclAsType(Classifier)."
                    + "allDiscriminators)");
            }
        }
        return null;
    }

    private Object handleCommentFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("body")) {
                return Model.getFacade().getBody(subject);
            }
            if (feature.equals("annotatedElement")) {
                return new HashSet<Object>(Model.getFacade()
                        .getAnnotatedElements(subject));
            }
        }
        return null;
    }

    private Object handleComponentFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("deploymentLocation")) {
                return new HashSet<Object>(Model.getFacade()
                        .getDeploymentLocations(subject));
            }
            if (feature.equals("resident")) {
                return new HashSet<Object>(Model.getFacade()
                        .getResidents(subject));
            }
            if (feature.equals("allResidentElements")) {
                return internalOcl(subject,
                    "self.resident->union("
                    + "self.parent.oclAsType(Component)."
                    + "allResidentElements->select( re |"
                    + "re.elementResidence.visibility = #public or "
                    + "re.elementResidence.visibility = #protected))");
            }
        }
        return null;
    }

    private Object handleConstraintFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("body")) {
                return Model.getFacade().getBody(subject);
            }
            if (feature.equals("constrainedElement")) {
                return Model.getFacade().getConstrainedElements(subject);
            }
        }
        return null;
    }

    private Object handleDependencyFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("client")) {
                return new HashSet<Object>(Model.getFacade()
                        .getClients(subject));
            }
            if (feature.equals("supplier")) {
                return new HashSet<Object>(Model.getFacade()
                        .getSuppliers(subject));
            }
        }
        return null;
    }

    private Object handleElementResidenceFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("visibility")) {
                return Model.getFacade().getVisibility(subject);
            }
        }
        return null;
    }

    private Object handleEnumerationFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("literal")) {
                return Model.getFacade().getEnumerationLiterals(subject);
            }
        }
        return null;
    }

    private Object handleEnumerationLiteralFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("enumeration")) {
                return Model.getFacade().getEnumeration(subject);
            }
        }
        return null;
    }

    private Object handleFeatureFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("ownerScope")) {
                return Model.getFacade().isStatic(subject);
            }
            if (feature.equals("visibility")) {
                return Model.getFacade().getVisibility(subject);
            }
            if (feature.equals("owner")) {
                return Model.getFacade().getOwner(subject);
            }
        }
        return null;
    }

    private Object handleGeneralizableElementFeature(Object subject, String feature) {
        if (feature.equals(".")) {
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
                return internalOcl(subject, "self.generalization.parent");
            }

            if (feature.equals("allParents")) {
                return internalOcl(subject, "self.parent->union(self.parent.allParents)");
            }
        }
        return null;
    }

    private Object handleGeneralizationFeature(Object subject, String feature) {
        if (feature.equals(".")) {
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
        }
        return null;
    }

    private Object handleMethodFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("body")) {
                return Model.getFacade().getBody(subject);
            }
            if (feature.equals("specification")) {
                return Model.getFacade().getSpecification(subject);
            }
        }
        return null;
    }

    private Object handleModelElementFeature(Object subject, String feature) {
        if (feature.equals(".")) {
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
            if (feature.equals("constraint")) {
                return Model.getFacade().getConstraints(subject);
            }
            if (feature.equals("supplier")) {
                return internalOcl(subject, "self.clientDependency.supplier");
            }
            if (feature.equals("allSuppliers")) {
                return internalOcl(subject, "self.supplier->union(self.supplier.allSuppliers)");
            }
            if (feature.equals("model")) {
                return internalOcl(subject, "self.namespace->"
                        + "union(self.namespace.allSurroundingNamespaces)->"
                        + "select( ns| ns.oclIsKindOf (Model))");
            }
            if (feature.equals("isTemplate")) {
                return !Model.getFacade().getTemplateParameters(subject)
                        .isEmpty();
            }
            if (feature.equals("isInstantiated")) {
                return internalOcl(subject, "self.clientDependency->"
                        + "select(oclIsKindOf(Binding))->notEmpty");
            }
            if (feature.equals("templateArgument")) {
                return internalOcl(subject, "self.clientDependency->"
                        + "select(oclIsKindOf(Binding))."
                        + "oclAsType(Binding).argument");
            }
        }
        return null;
    }

    private Object handleNamespaceFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("ownedElement")) {
                return new HashSet<Object>(Model.getFacade()
                        .getOwnedElements(subject));
            }
            if (feature.equals("contents")) {
                return internalOcl(subject, "self.ownedElement->"
                        + "union(self.ownedElement->"
                        + "select(x|x.oclIsKindOf(Namespace)).contents)");
            }
            if (feature.equals("allContents")) {
                return internalOcl(subject, "self.contents");
            }
            if (feature.equals("allVisibleElements")) {
                return internalOcl(
                        subject,
                        "self.allContents ->"
                    + "select(e |e.elementOwnership.visibility = #public)");
            }
            if (feature.equals("allSurroundingNamespaces")) {
                return internalOcl(subject, "self.namespace->"
                        + "union(self.namespace.allSurroundingNamespaces)");
            }
        }
        return null;
    }

    private Object handleNodeFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("deployedComponent")) {
                return new HashSet<Object>(Model.getFacade()
                        .getDeployedComponents(subject));
            }
        }
        return null;
    }

    private Object handleOperationFeature(Object subject, String feature) {
        if (feature.equals(".")) {
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
        }
        return null;
    }

    private Object handleParameterFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("defaultValue")) {
                return Model.getFacade().getDefaultValue(subject);
            }
            if (feature.equals("kind")) {
                return Model.getFacade().getKind(subject);
            }
        }
        return null;
    }

    private Object handleStructuralFeatureFeature(Object subject, String feature) {
        if (feature.equals(".")) {
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
        }
        return null;
    }

    private Object handleTemplateArgumentFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("binding")) {
                return Model.getFacade().getBinding(subject);
            }
            if (feature.equals("modelElement")) {
                return Model.getFacade().getModelElement(subject);
            }
        }
        return null;
    }

    private Object handleTemplateParameterFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("defaultElement")) {
                return Model.getFacade().getDefaultElement(subject);
            }
        }
        return null;
    }

    private Object handleUseCaseFeature(Object subject, String feature) {
        if (feature.equals(".")) {
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
        }
        return null;
    }

    private Object handleAssociationClassFeature(Object subject, String feature) {
        if (feature.equals(".")) {
            if (feature.equals("allConnections")) {
                return internalOcl(
                        subject,
                        "self.connection->union(self.parent->select("
                      + "s | s.oclIsKindOf(Association))->collect("
                      + "a : Association | a.allConnections))->asSet()");
            }
        }
        return null;
    }

    private Object handleStereotypeFeature(Object subject, String feature) {
        if (feature.equals(".")) {
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
        }
        return null;
    }

    private Object handleTagDefinitionFeature(Object subject, String feature) {
        if (feature.equals(".")) {
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
        }
        return null;
    }

    private Object handleTaggedValueFeature(Object subject, String feature) {
        if (feature.equals(".")) {
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
        }
        return null;
    }

    private Object internalOcl(Object subject, String ocl) {
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