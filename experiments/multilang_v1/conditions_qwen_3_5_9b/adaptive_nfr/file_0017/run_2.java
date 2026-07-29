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
     * @param type The type.
     * @param parameters The parameters.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    public Object invokeFeature(Map<String, Object> vt, Object subject,
            String feature, String type, Object[] parameters) {

        if (subject == null) {
            subject = vt.get("self");
        }

        if (type.equals(".")) {
            return handleFeatureInvocation(vt, subject, feature);
        }

        return null;
    }

    /**
     * Handle feature invocation for a specific type.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleFeatureInvocation(Map<String, Object> vt, Object subject, String feature) {
        if (isAssociation(subject)) {
            return handleAssociationFeature(vt, subject, feature);
        }

        if (isAssociationEnd(subject)) {
            return handleAssociationEndFeature(vt, subject, feature);
        }

        if (isAttribute(subject)) {
            return handleAttributeFeature(vt, subject, feature);
        }

        if (isBehavioralFeature(subject)) {
            return handleBehavioralFeatureFeature(vt, subject, feature);
        }

        if (isBinding(subject)) {
            return handleBindingFeature(vt, subject, feature);
        }

        if (isClass(subject)) {
            return handleClassFeature(vt, subject, feature);
        }

        if (isClassifier(subject)) {
            return handleClassifierFeature(vt, subject, feature);
        }

        if (isComment(subject)) {
            return handleCommentFeature(vt, subject, feature);
        }

        if (isComponent(subject)) {
            return handleComponentFeature(vt, subject, feature);
        }

        if (isConstraint(subject)) {
            return handleConstraintFeature(vt, subject, feature);
        }

        if (isDependency(subject)) {
            return handleDependencyFeature(vt, subject, feature);
        }

        if (isElementResidence(subject)) {
            return handleElementResidenceFeature(vt, subject, feature);
        }

        if (isEnumeration(subject)) {
            return handleEnumerationFeature(vt, subject, feature);
        }

        if (isEnumerationLiteral(subject)) {
            return handleEnumerationLiteralFeature(vt, subject, feature);
        }

        if (isFeature(subject)) {
            return handleFeatureFeature(vt, subject, feature);
        }

        if (isGeneralizableElement(subject)) {
            return handleGeneralizableElementFeature(vt, subject, feature);
        }

        if (isGeneralization(subject)) {
            return handleGeneralizationFeature(vt, subject, feature);
        }

        if (isMethod(subject)) {
            return handleMethodFeature(vt, subject, feature);
        }

        if (isModelElement(subject)) {
            return handleModelElementFeature(vt, subject, feature);
        }

        if (isNamespace(subject)) {
            return handleNamespaceFeature(vt, subject, feature);
        }

        if (isNode(subject)) {
            return handleNodeFeature(vt, subject, feature);
        }

        if (isOperation(subject)) {
            return handleOperationFeature(vt, subject, feature);
        }

        if (isParameter(subject)) {
            return handleParameterFeature(vt, subject, feature);
        }

        if (isStructuralFeature(subject)) {
            return handleStructuralFeatureFeature(vt, subject, feature);
        }

        if (isTemplateArgument(subject)) {
            return handleTemplateArgumentFeature(vt, subject, feature);
        }

        if (isTemplateParameter(subject)) {
            return handleTemplateParameterFeature(vt, subject, feature);
        }

        if (isUseCase(subject)) {
            return handleUseCaseFeature(vt, subject, feature);
        }

        if (isAssociationClass(subject)) {
            return handleAssociationClassFeature(vt, subject, feature);
        }

        if (isStereotype(subject)) {
            return handleStereotypeFeature(vt, subject, feature);
        }

        if (isTagDefinition(subject)) {
            return handleTagDefinitionFeature(vt, subject, feature);
        }

        if (isTaggedValue(subject)) {
            return handleTaggedValueFeature(vt, subject, feature);
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
     * Handle association feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleAssociationFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("connection")) {
            return new ArrayList<Object>(Model.getFacade().getConnections(subject));
        }

        if (feature.equals("allConnections")) {
            return new HashSet<Object>(Model.getFacade().getConnections(subject));
        }

        return null;
    }

    /**
     * Handle association end feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleAssociationEndFeature(Map<String, Object> vt, Object subject, String feature) {
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
     * Handle attribute feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleAttributeFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("initialValue")) {
            return Model.getFacade().getInitialValue(subject);
        }

        if (feature.equals("associationEnd")) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        }

        return null;
    }

    /**
     * Handle behavioral feature feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleBehavioralFeatureFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("isQuery")) {
            return Model.getFacade().isQuery(subject);
        }

        if (feature.equals("parameter")) {
            return new ArrayList<Object>(Model.getFacade().getParameters(subject));
        }

        return null;
    }

    /**
     * Handle binding feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleBindingFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("argument")) {
            return Model.getFacade().getArguments(subject);
        }

        return null;
    }

    /**
     * Handle class feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleClassFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("isActive")) {
            return Model.getFacade().isActive(subject);
        }

        return null;
    }

    /**
     * Handle classifier feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleClassifierFeature(Map<String, Object> vt, Object subject, String feature) {
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

    /**
     * Handle comment feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleCommentFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }

        if (feature.equals("annotatedElement")) {
            return new HashSet<Object>(Model.getFacade().getAnnotatedElements(subject));
        }

        return null;
    }

    /**
     * Handle component feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleComponentFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("deploymentLocation")) {
            return new HashSet<Object>(Model.getFacade().getDeploymentLocations(subject));
        }

        if (feature.equals("resident")) {
            return new HashSet<Object>(Model.getFacade().getResidents(subject));
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

    /**
     * Handle constraint feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleConstraintFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }

        if (feature.equals("constrainedElement")) {
            return Model.getFacade().getConstrainedElements(subject);
        }

        return null;
    }

    /**
     * Handle dependency feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleDependencyFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("client")) {
            return new HashSet<Object>(Model.getFacade().getClients(subject));
        }

        if (feature.equals("supplier")) {
            return new HashSet<Object>(Model.getFacade().getSuppliers(subject));
        }

        return null;
    }

    /**
     * Handle element residence feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleElementResidenceFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        }

        return null;
    }

    /**
     * Handle enumeration feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleEnumerationFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("literal")) {
            return Model.getFacade().getEnumerationLiterals(subject);
        }

        return null;
    }

    /**
     * Handle enumeration literal feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleEnumerationLiteralFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("enumeration")) {
            return Model.getFacade().getEnumeration(subject);
        }

        return null;
    }

    /**
     * Handle feature feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleFeatureFeature(Map<String, Object> vt, Object subject, String feature) {
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
     * Handle generalizable element feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleGeneralizableElementFeature(Map<String, Object> vt, Object subject, String feature) {
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
            return internalOcl(subject, vt,
                    "self.generalization.parent");
        }

        if (feature.equals("allParents")) {
            return internalOcl(subject, vt,
                    "self.parent->union(self.parent.allParents)");
        }

        return null;
    }

    /**
     * Handle generalization feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleGeneralizationFeature(Map<String, Object> vt, Object subject, String feature) {
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

    /**
     * Handle method feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleMethodFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }

        if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(subject);
        }

        return null;
    }

    /**
     * Handle model element feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleModelElementFeature(Map<String, Object> vt, Object subject, String feature) {
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
     * Handle namespace feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleNamespaceFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("ownedElement")) {
            return new HashSet<Object>(Model.getFacade().getOwnedElements(subject));
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
     * Handle node feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleNodeFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("deployedComponent")) {
            return new HashSet<Object>(Model.getFacade().getDeployedComponents(subject));
        }

        return null;
    }

    /**
     * Handle operation feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleOperationFeature(Map<String, Object> vt, Object subject, String feature) {
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
     * Handle parameter feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleParameterFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("defaultValue")) {
            return Model.getFacade().getDefaultValue(subject);
        }

        if (feature.equals("kind")) {
            return Model.getFacade().getKind(subject);
        }

        return null;
    }

    /**
     * Handle structural feature feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleStructuralFeatureFeature(Map<String, Object> vt, Object subject, String feature) {
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
     * Handle template argument feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleTemplateArgumentFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("binding")) {
            return Model.getFacade().getBinding(subject);
        }

        if (feature.equals("modelElement")) {
            return Model.getFacade().getModelElement(subject);
        }

        return null;
    }

    /**
     * Handle template parameter feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleTemplateParameterFeature(Map<String, Object> vt, Object subject, String feature) {
        if (feature.equals("defaultElement")) {
            return Model.getFacade().getDefaultElement(subject);
        }

        return null;
    }

    /**
     * Handle use case feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleUseCaseFeature(Map<String, Object> vt, Object subject, String feature) {
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
     * Handle association class feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleAssociationClassFeature(Map<String, Object> vt, Object subject, String feature) {
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
     * Handle stereotype feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleStereotypeFeature(Map<String, Object> vt, Object subject, String feature) {
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

    /**
     * Handle tag definition feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleTagDefinitionFeature(Map<String, Object> vt, Object subject, String feature) {
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

    /**
     * Handle tagged value feature invocation.
     *
     * @param vt The variable table.
     * @param subject The subject object.
     * @param feature The feature name.
     * @return The result of the feature invocation.
     */
    private Object handleTaggedValueFeature(Map<String, Object> vt, Object subject, String feature) {
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