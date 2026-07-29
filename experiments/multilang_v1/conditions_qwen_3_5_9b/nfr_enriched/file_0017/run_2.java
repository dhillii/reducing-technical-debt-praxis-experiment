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
     * Invokes a feature on a subject using the provided context and parameters.
     *
     * @param vt The context map.
     * @param subject The subject object.
     * @param feature The feature name.
     * @param type The type indicator.
     * @param parameters The parameters array.
     * @return The result of the feature invocation.
     */
    @SuppressWarnings("unchecked")
    public Object invokeFeature(Map<String, Object> vt, Object subject,
            String feature, String type, Object[] parameters) {

        if (subject == null) {
            subject = vt.get("self");
        }

        Object result = resolveFeature(subject, feature, type);
        return result;
    }

    /**
     * Resolves a feature for a given subject based on its type.
     *
     * @param subject The subject object.
     * @param feature The feature name.
     * @param type The type indicator.
     * @return The result of the feature resolution.
     */
    private Object resolveFeature(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (Model.getFacade().isAAssociation(subject)) {
                return resolveAssociationFeature(subject, feature);
            }

            if (Model.getFacade().isAAssociationEnd(subject)) {
                return resolveAssociationEndFeature(subject, feature);
            }

            if (Model.getFacade().isAAttribute(subject)) {
                return resolveAttributeFeature(subject, feature);
            }

            if (Model.getFacade().isABehavioralFeature(subject)) {
                return resolveBehavioralFeatureFeature(subject, feature);
            }

            if (Model.getFacade().isABinding(subject)) {
                return resolveBindingFeature(subject, feature);
            }

            if (Model.getFacade().isAClass(subject)) {
                return resolveClassFeature(subject, feature);
            }

            if (Model.getFacade().isAClassifier(subject)) {
                return resolveClassifierFeature(subject, feature);
            }

            if (Model.getFacade().isAComment(subject)) {
                return resolveCommentFeature(subject, feature);
            }

            if (Model.getFacade().isAComponent(subject)) {
                return resolveComponentFeature(subject, feature);
            }

            if (Model.getFacade().isAConstraint(subject)) {
                return resolveConstraintFeature(subject, feature);
            }

            if (Model.getFacade().isADependency(subject)) {
                return resolveDependencyFeature(subject, feature);
            }

            if (Model.getFacade().isAElementResidence(subject)) {
                return resolveElementResidenceFeature(subject, feature);
            }

            if (Model.getFacade().isAEnumeration(subject)) {
                return resolveEnumerationFeature(subject, feature);
            }

            if (Model.getFacade().isAEnumerationLiteral(subject)) {
                return resolveEnumerationLiteralFeature(subject, feature);
            }

            if (Model.getFacade().isAFeature(subject)) {
                return resolveFeatureFeature(subject, feature);
            }

            if (Model.getFacade().isAGeneralizableElement(subject)) {
                return resolveGeneralizableElementFeature(subject, feature);
            }

            if (Model.getFacade().isAGeneralization(subject)) {
                return resolveGeneralizationFeature(subject, feature);
            }

            if (Model.getFacade().isAMethod(subject)) {
                return resolveMethodFeature(subject, feature);
            }

            if (Model.getFacade().isAModelElement(subject)) {
                return resolveModelElementFeature(subject, feature);
            }

            if (Model.getFacade().isANamespace(subject)) {
                return resolveNamespaceFeature(subject, feature);
            }

            if (Model.getFacade().isANode(subject)) {
                return resolveNodeFeature(subject, feature);
            }

            if (Model.getFacade().isAOperation(subject)) {
                return resolveOperationFeature(subject, feature);
            }

            if (Model.getFacade().isAParameter(subject)) {
                return resolveParameterFeature(subject, feature);
            }

            if (Model.getFacade().isAStructuralFeature(subject)) {
                return resolveStructuralFeatureFeature(subject, feature);
            }

            if (Model.getFacade().isATemplateArgument(subject)) {
                return resolveTemplateArgumentFeature(subject, feature);
            }

            if (Model.getFacade().isATemplateParameter(subject)) {
                return resolveTemplateParameterFeature(subject, feature);
            }

            if (Model.getFacade().isAUseCase(subject)) {
                return resolveUseCaseFeature(subject, feature);
            }

            if (Model.getFacade().isAAssociationClass(subject)) {
                return resolveAssociationClassFeature(subject, feature);
            }

            if (Model.getFacade().isAStereotype(subject)) {
                return resolveStereotypeFeature(subject, feature);
            }

            if (Model.getFacade().isATagDefinition(subject)) {
                return resolveTagDefinitionFeature(subject, feature);
            }

            if (Model.getFacade().isATaggedValue(subject)) {
                return resolveTaggedValueFeature(subject, feature);
            }
        }

        return null;
    }

    /**
     * Resolves features for an Association.
     *
     * @param subject The association subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveAssociationFeature(Object subject, String feature) {
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

    /**
     * Resolves features for an AssociationEnd.
     *
     * @param subject The association end subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveAssociationEndFeature(Object subject, String feature) {
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
     * Resolves features for an Attribute.
     *
     * @param subject The attribute subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveAttributeFeature(Object subject, String feature) {
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
     * Resolves features for a BehavioralFeature.
     *
     * @param subject The behavioral feature subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveBehavioralFeatureFeature(Object subject, String feature) {
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
     * Resolves features for a Binding.
     *
     * @param subject The binding subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveBindingFeature(Object subject, String feature) {
        if (feature.equals("argument")) {
            return Model.getFacade().getArguments(subject);
        }
        return null;
    }

    /**
     * Resolves features for a Class.
     *
     * @param subject The class subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveClassFeature(Object subject, String feature) {
        if (feature.equals("isActive")) {
            return Model.getFacade().isActive(subject);
        }
        return null;
    }

    /**
     * Resolves features for a Classifier.
     *
     * @param subject The classifier subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveClassifierFeature(Object subject, String feature) {
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
            return internalOcl(subject, "self.associations->union("
                    + "self.parent.oclAsType(Classifier).allAssociations)");
        }
        if (feature.equals("oppositeAssociationEnds")) {
            return internalOcl(subject, "self.associations->select ( a | a.connection->select "
                    + "( ae | ae.participant = self ).size = 1 )->"
                    + "collect ( a | a.connection->"
                    + "select ( ae | ae.participant <> self ) )->"
                    + "union ( self.associations->"
                    + "select ( a | a.connection->select ( ae |"
                    + "ae.participant = self ).size > 1 )->"
                    + "collect ( a | a.connection) )");
        }
        if (feature.equals("allOppositeAssociationEnds")) {
            return internalOcl(subject, "self.oppositeAssociationEnds->"
                    + "union(self.parent.allOppositeAssociationEnds )");
        }
        if (feature.equals("specification")) {
            return internalOcl(subject, "self.clientDependency->"
                    + "select(d |"
                    + "d.oclIsKindOf(Abstraction)"
                    + "and d.stereotype.name = \"realization\" "
                    + "and d.supplier.oclIsKindOf(Classifier))"
                    + ".supplier.oclAsType(Classifier)");
        }
        if (feature.equals("allContents")) {
            return internalOcl(subject, "self.contents->union("
                    + "self.parent.allContents->select(e |"
                    + "e.elementOwnership.visibility = #public or true or "
                    + " e.elementOwnership.visibility = #protected))");
        }
        if (feature.equals("allDiscriminators")) {
            return internalOcl(subject, "self.generalization.discriminator->"
                    + "union(self.parent.oclAsType(Classifier)."
                    + "allDiscriminators)");
        }
        return null;
    }

    /**
     * Resolves features for a Comment.
     *
     * @param subject The comment subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveCommentFeature(Object subject, String feature) {
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
     * Resolves features for a Component.
     *
     * @param subject The component subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveComponentFeature(Object subject, String feature) {
        if (feature.equals("deploymentLocation")) {
            return new HashSet<Object>(Model.getFacade()
                    .getDeploymentLocations(subject));
        }
        if (feature.equals("resident")) {
            return new HashSet<Object>(Model.getFacade()
                    .getResidents(subject));
        }
        if (feature.equals("allResidentElements")) {
            return internalOcl(subject, "self.resident->union("
                    + "self.parent.oclAsType(Component)."
                    + "allResidentElements->select( re |"
                    + "re.elementResidence.visibility = #public or "
                    + "re.elementResidence.visibility = #protected))");
        }
        return null;
    }

    /**
     * Resolves features for a Constraint.
     *
     * @param subject The constraint subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveConstraintFeature(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("constrainedElement")) {
            return Model.getFacade().getConstrainedElements(subject);
        }
        return null;
    }

    /**
     * Resolves features for a Dependency.
     *
     * @param subject The dependency subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveDependencyFeature(Object subject, String feature) {
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
     * Resolves features for an ElementResidence.
     *
     * @param subject The element residence subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveElementResidenceFeature(Object subject, String feature) {
        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        }
        return null;
    }

    /**
     * Resolves features for an Enumeration.
     *
     * @param subject The enumeration subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveEnumerationFeature(Object subject, String feature) {
        if (feature.equals("literal")) {
            return Model.getFacade().getEnumerationLiterals(subject);
        }
        return null;
    }

    /**
     * Resolves features for an EnumerationLiteral.
     *
     * @param subject The enumeration literal subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveEnumerationLiteralFeature(Object subject, String feature) {
        if (feature.equals("enumeration")) {
            return Model.getFacade().getEnumeration(subject);
        }
        return null;
    }

    /**
     * Resolves features for a Feature.
     *
     * @param subject The feature subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveFeatureFeature(Object subject, String feature) {
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
     * Resolves features for a GeneralizableElement.
     *
     * @param subject The generalizable element subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveGeneralizableElementFeature(Object subject, String feature) {
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
        return null;
    }

    /**
     * Resolves features for a Generalization.
     *
     * @param subject The generalization subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveGeneralizationFeature(Object subject, String feature) {
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
     * Resolves features for a Method.
     *
     * @param subject The method subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveMethodFeature(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(subject);
        }
        return null;
    }

    /**
     * Resolves features for a ModelElement.
     *
     * @param subject The model element subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveModelElementFeature(Object subject, String feature) {
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
        return null;
    }

    /**
     * Resolves features for a Namespace.
     *
     * @param subject The namespace subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveNamespaceFeature(Object subject, String feature) {
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
            return internalOcl(subject, "self.allContents ->"
                    + "select(e |e.elementOwnership.visibility = #public)");
        }
        if (feature.equals("allSurroundingNamespaces")) {
            return internalOcl(subject, "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)");
        }
        return null;
    }

    /**
     * Resolves features for a Node.
     *
     * @param subject The node subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveNodeFeature(Object subject, String feature) {
        if (feature.equals("deployedComponent")) {
            return new HashSet<Object>(Model.getFacade()
                    .getDeployedComponents(subject));
        }
        return null;
    }

    /**
     * Resolves features for an Operation.
     *
     * @param subject The operation subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveOperationFeature(Object subject, String feature) {
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
     * Resolves features for a Parameter.
     *
     * @param subject The parameter subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveParameterFeature(Object subject, String feature) {
        if (feature.equals("defaultValue")) {
            return Model.getFacade().getDefaultValue(subject);
        }
        if (feature.equals("kind")) {
            return Model.getFacade().getKind(subject);
        }
        return null;
    }

    /**
     * Resolves features for a StructuralFeature.
     *
     * @param subject The structural feature subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveStructuralFeatureFeature(Object subject, String feature) {
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
     * Resolves features for a TemplateArgument.
     *
     * @param subject The template argument subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveTemplateArgumentFeature(Object subject, String feature) {
        if (feature.equals("binding")) {
            return Model.getFacade().getBinding(subject);
        }
        if (feature.equals("modelElement")) {
            return Model.getFacade().getModelElement(subject);
        }
        return null;
    }

    /**
     * Resolves features for a TemplateParameter.
     *
     * @param subject The template parameter subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveTemplateParameterFeature(Object subject, String feature) {
        if (feature.equals("defaultElement")) {
            return Model.getFacade().getDefaultElement(subject);
        }
        return null;
    }

    /**
     * Resolves features for a UseCase.
     *
     * @param subject The use case subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveUseCaseFeature(Object subject, String feature) {
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
     * Resolves features for an AssociationClass.
     *
     * @param subject The association class subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveAssociationClassFeature(Object subject, String feature) {
        if (feature.equals("allConnections")) {
            return internalOcl(subject, "self.connection->union(self.parent->select("
                    + "s | s.oclIsKindOf(Association))->collect("
                    + "a : Association | a.allConnections))->asSet()");
        }
        return null;
    }

    /**
     * Resolves features for a Stereotype.
     *
     * @param subject The stereotype subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveStereotypeFeature(Object subject, String feature) {
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
     * Resolves features for a TagDefinition.
     *
     * @param subject The tag definition subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveTagDefinitionFeature(Object subject, String feature) {
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
     * Resolves features for a TaggedValue.
     *
     * @param subject The tagged value subject.
     * @param feature The feature name.
     * @return The result of the feature resolution.
     */
    private Object resolveTaggedValueFeature(Object subject, String feature) {
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

    /**
     * Evaluates an OCL expression.
     *
     * @param subject The subject object.
     * @param ocl The OCL expression string.
     * @return The result of the evaluation.
     */
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