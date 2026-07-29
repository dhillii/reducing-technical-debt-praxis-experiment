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
     * Invoke a feature on a subject.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @param type The type of the feature.
     * @param parameters The parameters for the feature.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    public Object invokeFeature(Map<String, Object> vt, Object subject,
            String feature, String type, Object[] parameters) {

        if (subject == null) {
            subject = vt.get("self");
        }

        if (type.equals(".")) {
            return handleDotFeature(vt, subject, feature);
        }

        return null;
    }

    /**
     * Handle the dot feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleDotFeature(Map<String, Object> vt, Object subject, String feature) {
        if (isAssociation(subject)) {
            return handleAssociationFeature(feature);
        }

        if (isAssociationEnd(subject)) {
            return handleAssociationEndFeature(feature);
        }

        if (isAttribute(subject)) {
            return handleAttributeFeature(feature);
        }

        if (isBehavioralFeature(subject)) {
            return handleBehavioralFeatureFeature(feature);
        }

        if (isBinding(subject)) {
            return handleBindingFeature(feature);
        }

        if (isClass(subject)) {
            return handleClassFeature(feature);
        }

        if (isClassifier(subject)) {
            return handleClassifierFeature(feature);
        }

        if (isComment(subject)) {
            return handleCommentFeature(feature);
        }

        if (isComponent(subject)) {
            return handleComponentFeature(feature);
        }

        if (isConstraint(subject)) {
            return handleConstraintFeature(feature);
        }

        if (isDependency(subject)) {
            return handleDependencyFeature(feature);
        }

        if (isElementResidence(subject)) {
            return handleElementResidenceFeature(feature);
        }

        if (isEnumeration(subject)) {
            return handleEnumerationFeature(feature);
        }

        if (isEnumerationLiteral(subject)) {
            return handleEnumerationLiteralFeature(feature);
        }

        if (isFeature(subject)) {
            return handleFeatureFeature(feature);
        }

        if (isGeneralizableElement(subject)) {
            return handleGeneralizableElementFeature(feature);
        }

        if (isGeneralization(subject)) {
            return handleGeneralizationFeature(feature);
        }

        if (isMethod(subject)) {
            return handleMethodFeature(feature);
        }

        if (isModelElement(subject)) {
            return handleModelElementFeature(feature);
        }

        if (isNamespace(subject)) {
            return handleNamespaceFeature(feature);
        }

        if (isNode(subject)) {
            return handleNodeFeature(feature);
        }

        if (isOperation(subject)) {
            return handleOperationFeature(feature);
        }

        if (isParameter(subject)) {
            return handleParameterFeature(feature);
        }

        if (isStructuralFeature(subject)) {
            return handleStructuralFeatureFeature(feature);
        }

        if (isTemplateArgument(subject)) {
            return handleTemplateArgumentFeature(feature);
        }

        if (isTemplateParameter(subject)) {
            return handleTemplateParameterFeature(feature);
        }

        if (isUseCase(subject)) {
            return handleUseCaseFeature(feature);
        }

        if (isAssociationClass(subject)) {
            return handleAssociationClassFeature(feature);
        }

        if (isStereotype(subject)) {
            return handleStereotypeFeature(feature);
        }

        if (isTagDefinition(subject)) {
            return handleTagDefinitionFeature(feature);
        }

        if (isTaggedValue(subject)) {
            return handleTaggedValueFeature(feature);
        }

        return null;
    }

    /**
     * Check if the subject is an association.
     *
     * @param subject The subject object.
     * @return true if the subject is an association.
     */
    private boolean isAssociation(Object subject) {
        return Model.getFacade().isAAssociation(subject);
    }

    /**
     * Check if the subject is an association end.
     *
     * @param subject The subject object.
     * @return true if the subject is an association end.
     */
    private boolean isAssociationEnd(Object subject) {
        return Model.getFacade().isAAssociationEnd(subject);
    }

    /**
     * Check if the subject is an attribute.
     *
     * @param subject The subject object.
     * @return true if the subject is an attribute.
     */
    private boolean isAttribute(Object subject) {
        return Model.getFacade().isAAttribute(subject);
    }

    /**
     * Check if the subject is a behavioral feature.
     *
     * @param subject The subject object.
     * @return true if the subject is a behavioral feature.
     */
    private boolean isBehavioralFeature(Object subject) {
        return Model.getFacade().isABehavioralFeature(subject);
    }

    /**
     * Check if the subject is a binding.
     *
     * @param subject The subject object.
     * @return true if the subject is a binding.
     */
    private boolean isBinding(Object subject) {
        return Model.getFacade().isABinding(subject);
    }

    /**
     * Check if the subject is a class.
     *
     * @param subject The subject object.
     * @return true if the subject is a class.
     */
    private boolean isClass(Object subject) {
        return Model.getFacade().isAClass(subject);
    }

    /**
     * Check if the subject is a classifier.
     *
     * @param subject The subject object.
     * @return true if the subject is a classifier.
     */
    private boolean isClassifier(Object subject) {
        return Model.getFacade().isAClassifier(subject);
    }

    /**
     * Check if the subject is a comment.
     *
     * @param subject The subject object.
     * @return true if the subject is a comment.
     */
    private boolean isComment(Object subject) {
        return Model.getFacade().isAComment(subject);
    }

    /**
     * Check if the subject is a component.
     *
     * @param subject The subject object.
     * @return true if the subject is a component.
     */
    private boolean isComponent(Object subject) {
        return Model.getFacade().isAComponent(subject);
    }

    /**
     * Check if the subject is a constraint.
     *
     * @param subject The subject object.
     * @return true if the subject is a constraint.
     */
    private boolean isConstraint(Object subject) {
        return Model.getFacade().isAConstraint(subject);
    }

    /**
     * Check if the subject is a dependency.
     *
     * @param subject The subject object.
     * @return true if the subject is a dependency.
     */
    private boolean isDependency(Object subject) {
        return Model.getFacade().isADependency(subject);
    }

    /**
     * Check if the subject is an element residence.
     *
     * @param subject The subject object.
     * @return true if the subject is an element residence.
     */
    private boolean isElementResidence(Object subject) {
        return Model.getFacade().isAElementResidence(subject);
    }

    /**
     * Check if the subject is an enumeration.
     *
     * @param subject The subject object.
     * @return true if the subject is an enumeration.
     */
    private boolean isEnumeration(Object subject) {
        return Model.getFacade().isAEnumeration(subject);
    }

    /**
     * Check if the subject is an enumeration literal.
     *
     * @param subject The subject object.
     * @return true if the subject is an enumeration literal.
     */
    private boolean isEnumerationLiteral(Object subject) {
        return Model.getFacade().isAEnumerationLiteral(subject);
    }

    /**
     * Check if the subject is a feature.
     *
     * @param subject The subject object.
     * @return true if the subject is a feature.
     */
    private boolean isFeature(Object subject) {
        return Model.getFacade().isAFeature(subject);
    }

    /**
     * Check if the subject is a generalizable element.
     *
     * @param subject The subject object.
     * @return true if the subject is a generalizable element.
     */
    private boolean isGeneralizableElement(Object subject) {
        return Model.getFacade().isAGeneralizableElement(subject);
    }

    /**
     * Check if the subject is a generalization.
     *
     * @param subject The subject object.
     * @return true if the subject is a generalization.
     */
    private boolean isGeneralization(Object subject) {
        return Model.getFacade().isAGeneralization(subject);
    }

    /**
     * Check if the subject is a method.
     *
     * @param subject The subject object.
     * @return true if the subject is a method.
     */
    private boolean isMethod(Object subject) {
        return Model.getFacade().isAMethod(subject);
    }

    /**
     * Check if the subject is a model element.
     *
     * @param subject The subject object.
     * @return true if the subject is a model element.
     */
    private boolean isModelElement(Object subject) {
        return Model.getFacade().isAModelElement(subject);
    }

    /**
     * Check if the subject is a namespace.
     *
     * @param subject The subject object.
     * @return true if the subject is a namespace.
     */
    private boolean isNamespace(Object subject) {
        return Model.getFacade().isANamespace(subject);
    }

    /**
     * Check if the subject is a node.
     *
     * @param subject The subject object.
     * @return true if the subject is a node.
     */
    private boolean isNode(Object subject) {
        return Model.getFacade().isANode(subject);
    }

    /**
     * Check if the subject is an operation.
     *
     * @param subject The subject object.
     * @return true if the subject is an operation.
     */
    private boolean isOperation(Object subject) {
        return Model.getFacade().isAOperation(subject);
    }

    /**
     * Check if the subject is a parameter.
     *
     * @param subject The subject object.
     * @return true if the subject is a parameter.
     */
    private boolean isParameter(Object subject) {
        return Model.getFacade().isAParameter(subject);
    }

    /**
     * Check if the subject is a structural feature.
     *
     * @param subject The subject object.
     * @return true if the subject is a structural feature.
     */
    private boolean isStructuralFeature(Object subject) {
        return Model.getFacade().isAStructuralFeature(subject);
    }

    /**
     * Check if the subject is a template argument.
     *
     * @param subject The subject object.
     * @return true if the subject is a template argument.
     */
    private boolean isTemplateArgument(Object subject) {
        return Model.getFacade().isATemplateArgument(subject);
    }

    /**
     * Check if the subject is a template parameter.
     *
     * @param subject The subject object.
     * @return true if the subject is a template parameter.
     */
    private boolean isTemplateParameter(Object subject) {
        return Model.getFacade().isATemplateParameter(subject);
    }

    /**
     * Check if the subject is a use case.
     *
     * @param subject The subject object.
     * @return true if the subject is a use case.
     */
    private boolean isUseCase(Object subject) {
        return Model.getFacade().isAUseCase(subject);
    }

    /**
     * Check if the subject is an association class.
     *
     * @param subject The subject object.
     * @return true if the subject is an association class.
     */
    private boolean isAssociationClass(Object subject) {
        return Model.getFacade().isAAssociationClass(subject);
    }

    /**
     * Check if the subject is a stereotype.
     *
     * @param subject The subject object.
     * @return true if the subject is a stereotype.
     */
    private boolean isStereotype(Object subject) {
        return Model.getFacade().isAStereotype(subject);
    }

    /**
     * Check if the subject is a tag definition.
     *
     * @param subject The subject object.
     * @return true if the subject is a tag definition.
     */
    private boolean isTagDefinition(Object subject) {
        return Model.getFacade().isATagDefinition(subject);
    }

    /**
     * Check if the subject is a tagged value.
     *
     * @param subject The subject object.
     * @return true if the subject is a tagged value.
     */
    private boolean isTaggedValue(Object subject) {
        return Model.getFacade().isATaggedValue(subject);
    }

    /**
     * Handle association feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleAssociationFeature(String feature) {
        if (feature.equals("connection")) {
            return new ArrayList<Object>(Model.getFacade()
                    .getConnections(null));
        }

        if (feature.equals("allConnections")) {
            return new HashSet<Object>(Model.getFacade()
                    .getConnections(null));
        }

        return null;
    }

    /**
     * Handle association end feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleAssociationEndFeature(String feature) {
        if (feature.equals("aggregation")) {
            return Model.getFacade().getAggregation1(null);
        }

        if (feature.equals("changeability")) {
            return Model.getFacade().getChangeability(null);
        }

        if (feature.equals("ordering")) {
            return Model.getFacade().getOrdering(null);
        }

        if (feature.equals("isNavigable")) {
            return Model.getFacade().isNavigable(null);
        }

        if (feature.equals("multiplicity")) {
            return Model.getFacade().getMultiplicity(null);
        }

        if (feature.equals("targetScope")) {
            return Model.getFacade().getTargetScope(null);
        }

        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(null);
        }

        if (feature.equals("qualifier")) {
            return Model.getFacade().getQualifiers(null);
        }

        if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(null);
        }

        if (feature.equals("participant")) {
            return Model.getFacade().getClassifier(null);
        }

        if (feature.equals("upperbound")) {
            return Model.getFacade().getUpper(null);
        }

        return null;
    }

    /**
     * Handle attribute feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleAttributeFeature(String feature) {
        if (feature.equals("initialValue")) {
            return Model.getFacade().getInitialValue(null);
        }

        if (feature.equals("associationEnd")) {
            return new ArrayList<Object>(Model.getFacade()
                    .getAssociationEnds(null));
        }

        return null;
    }

    /**
     * Handle behavioral feature feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleBehavioralFeatureFeature(String feature) {
        if (feature.equals("isQuery")) {
            return Model.getFacade().isQuery(null);
        }

        if (feature.equals("parameter")) {
            return new ArrayList<Object>(Model.getFacade()
                    .getParameters(null));
        }

        return null;
    }

    /**
     * Handle binding feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleBindingFeature(String feature) {
        if (feature.equals("argument")) {
            return Model.getFacade().getArguments(null);
        }

        return null;
    }

    /**
     * Handle class feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleClassFeature(String feature) {
        if (feature.equals("isActive")) {
            return Model.getFacade().isActive(null);
        }

        return null;
    }

    /**
     * Handle classifier feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleClassifierFeature(String feature) {
        if (feature.equals("feature")) {
            return new ArrayList<Object>(Model.getFacade()
                    .getFeatures(null));
        }

        if (feature.equals("association")) {
            return new ArrayList<Object>(Model.getFacade()
                    .getAssociationEnds(null));
        }

        if (feature.equals("powertypeRange")) {
            return new HashSet<Object>(Model.getFacade()
                    .getPowertypeRanges(null));
        }

        if (feature.equals("allFeatures")) {
            return internalOcl(null, null, "self.feature->union("
                    + "self.parent.oclAsType(Classifier).allFeatures)");
        }

        if (feature.equals("allOperations")) {
            return internalOcl(null, null, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Operation))");
        }

        if (feature.equals("allMethods")) {
            return internalOcl(null, null, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Method))");
        }

        if (feature.equals("allAttributes")) {
            return internalOcl(null, null, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Attribute))");
        }

        if (feature.equals("associations")) {
            return internalOcl(null, null,
                    "self.association.association->asSet()");
        }

        if (feature.equals("allAssociations")) {
            return internalOcl(
                    null,
                    null,
                  "self.associations->union("
                + "self.parent.oclAsType(Classifier).allAssociations)");
        }

        if (feature.equals("oppositeAssociationEnds")) {
            return internalOcl(null, null,
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
                    null,
                    null,
                    "self.oppositeAssociationEnds->"
                  + "union(self.parent.allOppositeAssociationEnds )");
        }

        if (feature.equals("specification")) {
            return internalOcl(
                    null,
                    null,
                    "self.clientDependency->"
                    + "select(d |"
                    + "d.oclIsKindOf(Abstraction)"
                    + "and d.stereotype.name = \"realization\" "
                    + "and d.supplier.oclIsKindOf(Classifier))"
                    + ".supplier.oclAsType(Classifier)");
        }

        if (feature.equals("allContents")) {
            return internalOcl(null, null,
                "self.contents->union("
                + "self.parent.allContents->select(e |"
                + "e.elementOwnership.visibility = #public or true or "
                + " e.elementOwnership.visibility = #protected))");
        }

        if (feature.equals("allDiscriminators")) {
            return internalOcl(null, null,
                "self.generalization.discriminator->"
                + "union(self.parent.oclAsType(Classifier)."
                + "allDiscriminators)");
        }

        return null;
    }

    /**
     * Handle comment feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleCommentFeature(String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(null);
        }

        if (feature.equals("annotatedElement")) {
            return new HashSet<Object>(Model.getFacade()
                    .getAnnotatedElements(null));
        }

        return null;
    }

    /**
     * Handle component feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleComponentFeature(String feature) {
        if (feature.equals("deploymentLocation")) {
            return new HashSet<Object>(Model.getFacade()
                    .getDeploymentLocations(null));
        }

        if (feature.equals("resident")) {
            return new HashSet<Object>(Model.getFacade()
                    .getResidents(null));
        }

        if (feature.equals("allResidentElements")) {
            return internalOcl(null, null,
                "self.resident->union("
                + "self.parent.oclAsType(Component)."
                + "allResidentElements->select( re |"
                + "re.elementResidence.visibility = #public or "
                + "re.elementResidence.visibility = #protected))");
        }

        return null;
    }

    /**
     * Handle constraint feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleConstraintFeature(String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(null);
        }

        if (feature.equals("constrainedElement")) {
            return Model.getFacade().getConstrainedElements(null);
        }

        return null;
    }

    /**
     * Handle dependency feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleDependencyFeature(String feature) {
        if (feature.equals("client")) {
            return new HashSet<Object>(Model.getFacade()
                    .getClients(null));
        }

        if (feature.equals("supplier")) {
            return new HashSet<Object>(Model.getFacade()
                    .getSuppliers(null));
        }

        return null;
    }

    /**
     * Handle element residence feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleElementResidenceFeature(String feature) {
        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(null);
        }

        return null;
    }

    /**
     * Handle enumeration feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleEnumerationFeature(String feature) {
        if (feature.equals("literal")) {
            return Model.getFacade().getEnumerationLiterals(null);
        }

        return null;
    }

    /**
     * Handle enumeration literal feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleEnumerationLiteralFeature(String feature) {
        if (feature.equals("enumeration")) {
            return Model.getFacade().getEnumeration(null);
        }

        return null;
    }

    /**
     * Handle feature feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleFeatureFeature(String feature) {
        if (feature.equals("ownerScope")) {
            return Model.getFacade().isStatic(null);
        }

        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(null);
        }

        if (feature.equals("owner")) {
            return Model.getFacade().getOwner(null);
        }

        return null;
    }

    /**
     * Handle generalizable element feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleGeneralizableElementFeature(String feature) {
        if (feature.equals("isAbstract")) {
            return Model.getFacade().isAbstract(null);
        }

        if (feature.equals("isLeaf")) {
            return Model.getFacade().isLeaf(null);
        }

        if (feature.equals("isRoot")) {
            return Model.getFacade().isRoot(null);
        }

        if (feature.equals("generalization")) {
            return new HashSet<Object>(Model.getFacade()
                    .getGeneralizations(null));
        }

        if (feature.equals("specialization")) {
            return new HashSet<Object>(Model.getFacade()
                    .getSpecializations(null));
        }

        if (feature.equals("parent")) {
            return internalOcl(null, null,
                    "self.generalization.parent");
        }

        if (feature.equals("allParents")) {
            return internalOcl(null, null,
                    "self.parent->union(self.parent.allParents)");
        }

        return null;
    }

    /**
     * Handle generalization feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleGeneralizationFeature(String feature) {
        if (feature.equals("discriminator")) {
            return Model.getFacade().getDiscriminator(null);
        }

        if (feature.equals("child")) {
            return Model.getFacade().getSpecific(null);
        }

        if (feature.equals("parent")) {
            return Model.getFacade().getGeneral(null);
        }

        if (feature.equals("powertype")) {
            return Model.getFacade().getPowertype(null);
        }

        if (feature.equals("specialization")) {
            return new HashSet<Object>(Model.getFacade()
                    .getSpecializations(null));
        }

        return null;
    }

    /**
     * Handle method feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleMethodFeature(String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(null);
        }

        if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(null);
        }

        return null;
    }

    /**
     * Handle model element feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleModelElementFeature(String feature) {
        if (feature.equals("name")) {
            String name = Model.getFacade().getName(null);
            if (name == null) {
                name = "";
            }
            return name;
        }

        if (feature.equals("clientDependency")) {
            return new HashSet<Object>(Model.getFacade()
                    .getClientDependencies(null));
        }

        if (feature.equals("constraint")) {
            return new HashSet<Object>(Model.getFacade()
                    .getConstraints(null));
        }

        if (feature.equals("namespace")) {
            return Model.getFacade().getNamespace(null);
        }

        if (feature.equals("supplierDependency")) {
            return new HashSet<Object>(Model.getFacade()
                    .getSupplierDependencies(null));
        }

        if (feature.equals("templateParameter")) {
            return Model.getFacade().getTemplateParameters(null);
        }

        if (feature.equals("stereotype")) {
            return Model.getFacade().getStereotypes(null);
        }

        if (feature.equals("taggedValue")) {
            return Model.getFacade().getTaggedValuesCollection(null);
        }

        if (feature.equals("constraint")) {
            return Model.getFacade().getConstraints(null);
        }

        if (feature.equals("supplier")) {
            return internalOcl(null, null,
                    "self.clientDependency.supplier");
        }

        if (feature.equals("allSuppliers")) {
            return internalOcl(null, null,
                    "self.supplier->union(self.supplier.allSuppliers)");
        }

        if (feature.equals("model")) {
            return internalOcl(null, null,
                    "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)->"
                    + "select( ns| ns.oclIsKindOf (Model))");
        }

        if (feature.equals("isTemplate")) {
            return !Model.getFacade().getTemplateParameters(null)
                    .isEmpty();
        }

        if (feature.equals("isInstantiated")) {
            return internalOcl(null, null, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))->notEmpty");
        }

        if (feature.equals("templateArgument")) {
            return internalOcl(null, null, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))."
                    + "oclAsType(Binding).argument");
        }

        return null;
    }

    /**
     * Handle namespace feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleNamespaceFeature(String feature) {
        if (feature.equals("ownedElement")) {
            return new HashSet<Object>(Model.getFacade()
                    .getOwnedElements(null));
        }

        if (feature.equals("contents")) {
            return internalOcl(null, null, "self.ownedElement->"
                    + "union(self.ownedElement->"
                    + "select(x|x.oclIsKindOf(Namespace)).contents)");
        }

        if (feature.equals("allContents")) {
            return internalOcl(null, null, "self.contents");
        }

        if (feature.equals("allVisibleElements")) {
            return internalOcl(
                    null,
                    null,
                  "self.allContents ->"
                + "select(e |e.elementOwnership.visibility = #public)");
        }

        if (feature.equals("allSurroundingNamespaces")) {
            return internalOcl(null, null, "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)");
        }

        return null;
    }

    /**
     * Handle node feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleNodeFeature(String feature) {
        if (feature.equals("deployedComponent")) {
            return new HashSet<Object>(Model.getFacade()
                    .getDeployedComponents(null));
        }

        return null;
    }

    /**
     * Handle operation feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleOperationFeature(String feature) {
        if (feature.equals("concurrency")) {
            return Model.getFacade().getConcurrency(null);
        }

        if (feature.equals("isAbstract")) {
            return Model.getFacade().isAbstract(null);
        }

        if (feature.equals("isLeaf")) {
            return Model.getFacade().isLeaf(null);
        }

        if (feature.equals("isRoot")) {
            return Model.getFacade().isRoot(null);
        }

        return null;
    }

    /**
     * Handle parameter feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleParameterFeature(String feature) {
        if (feature.equals("defaultValue")) {
            return Model.getFacade().getDefaultValue(null);
        }

        if (feature.equals("kind")) {
            return Model.getFacade().getKind(null);
        }

        return null;
    }

    /**
     * Handle structural feature feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleStructuralFeatureFeature(String feature) {
        if (feature.equals("changeability")) {
            return Model.getFacade().getChangeability(null);
        }

        if (feature.equals("multiplicity")) {
            return Model.getFacade().getMultiplicity(null);
        }

        if (feature.equals("ordering")) {
            return Model.getFacade().getOrdering(null);
        }

        if (feature.equals("targetScope")) {
            return Model.getFacade().getTargetScope(null);
        }

        if (feature.equals("type")) {
            return Model.getFacade().getType(null);
        }

        return null;
    }

    /**
     * Handle template argument feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleTemplateArgumentFeature(String feature) {
        if (feature.equals("binding")) {
            return Model.getFacade().getBinding(null);
        }

        if (feature.equals("modelElement")) {
            return Model.getFacade().getModelElement(null);
        }

        return null;
    }

    /**
     * Handle template parameter feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleTemplateParameterFeature(String feature) {
        if (feature.equals("defaultElement")) {
            return Model.getFacade().getDefaultElement(null);
        }

        return null;
    }

    /**
     * Handle use case feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleUseCaseFeature(String feature) {
        if (feature.equals("specificationPath")) {
            return Model.getUseCasesHelper().getSpecificationPath(null);
        }

        if (feature.equals("allExtensionPoints")) {
            Collection c = Model.getCoreHelper().getAllSupertypes(null);
            Collection result = new ArrayList(Model.getFacade().getExtensionPoints(null));
            for (Object uc : c) {
                result.addAll(Model.getFacade().getExtensionPoints(uc));
            }
            return result;
        }

        return null;
    }

    /**
     * Handle association class feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleAssociationClassFeature(String feature) {
        if (feature.equals("allConnections")) {
            return internalOcl(
                    null,
                    null,
                    "self.connection->union(self.parent->select("
                  + "s | s.oclIsKindOf(Association))->collect("
                  + "a : Association | a.allConnections))->asSet()");
        }

        return null;
    }

    /**
     * Handle stereotype feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleStereotypeFeature(String feature) {
        if (feature.equals("baseClass")) {
            return new HashSet<Object>(Model.getFacade()
                    .getBaseClasses(null));
        }

        if (feature.equals("extendedElement")) {
            return new HashSet<Object>(Model.getFacade()
                    .getExtendedElements(null));
        }

        if (feature.equals("definedTag")) {
            return new HashSet<Object>(Model.getFacade()
                    .getTagDefinitions(null));
        }

        return null;
    }

    /**
     * Handle tag definition feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleTagDefinitionFeature(String feature) {
        if (feature.equals("multiplicity")) {
            return Model.getFacade().getMultiplicity(null);
        }

        if (feature.equals("tagType")) {
            return Model.getFacade().getType(null);
        }

        if (feature.equals("typedValue")) {
            return new HashSet<Object>(Model.getFacade()
                    .getTypedValues(null));
        }

        if (feature.equals("owner")) {
            return Model.getFacade().getOwner(null);
        }

        return null;
    }

    /**
     * Handle tagged value feature.
     *
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    private Object handleTaggedValueFeature(String feature) {
        if (feature.equals("dataValue")) {
            return Model.getFacade().getDataValue(null);
        }

        if (feature.equals("type")) {
            return Model.getFacade().getType(null);
        }

        if (feature.equals("referenceValue")) {
            return new HashSet<Object>(Model.getFacade()
                    .getReferenceValue(null));
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