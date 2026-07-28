/* $Id$
 *****************************************************************************
 * Copyright (c) 2009-2012 Contributors - see below
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *    mvw
 *****************************************************************************
 *
 * Some portions of this file was previously release using the BSD License:
 */

// Copyright (c) 2008-2009 The Regents of the University of California. All
// Rights Reserved. Permission to use, copy, modify, and distribute this
// software and its documentation without fee, and without a written
// agreement is hereby granted, provided that the above copyright notice
// and this paragraph appear in all copies. This software program and
// documentation are copyrighted by The Regents of the University of
// California. The software program and documentation are supplied "AS
// IS", without any accompanying services from The Regents. The Regents
// does not warrant that the operation of the program will be
// uninterrupted or error-free. The end-user understands that the program
// was developed for research purposes and is advised not to rely
// exclusively on the program for any reason. IN NO EVENT SHALL THE
// UNIVERSITY OF CALIFORNIA BE LIABLE TO ANY PARTY FOR DIRECT, INDIRECT,
// SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOST PROFITS,
// ARISING FROM THE USE OF THIS SOFTWARE AND ITS DOCUMENTATION, EVEN IF
// THE UNIVERSITY OF CALIFORNIA HAS BEEN ADVISED OF THE POSSIBILITY OF
// SUCH DAMAGE. THE UNIVERSITY OF CALIFORNIA SPECIFICALLY DISCLAIMS ANY
// WARRANTIES, INCLUDING, BUT NOT LIMITED TO THE IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE SOFTWARE
// PROVIDED HEREUNDER IS ON AN "AS IS" BASIS, AND THE UNIVERSITY OF
// CALIFORNIA HAS NO OBLIGATIONS TO PROVIDE MAINTENANCE, SUPPORT,
// UPDATES, ENHANCEMENTS, OR MODIFICATIONS.

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

        Object result;

        // Dispatch based on UML metaclass
        result = handleAssociation(subject, feature, type);
        if (result != null) return result;

        result = handleAssociationEnd(subject, feature, type);
        if (result != null) return result;

        result = handleAttribute(subject, feature, type);
        if (result != null) return result;

        result = handleBehavioralFeature(subject, feature, type);
        if (result != null) return result;

        result = handleBinding(subject, feature, type);
        if (result != null) return result;

        result = handleClass(subject, feature, type);
        if (result != null) return result;

        result = handleClassifier(subject, feature, type, vt);
        if (result != null) return result;

        result = handleComment(subject, feature, type);
        if (result != null) return result;

        result = handleComponent(subject, feature, type, vt);
        if (result != null) return result;

        result = handleConstraint(subject, feature, type);
        if (result != null) return result;

        result = handleDependency(subject, feature, type);
        if (result != null) return result;

        result = handleElementResidence(subject, feature, type);
        if (result != null) return result;

        result = handleEnumeration(subject, feature, type);
        if (result != null) return result;

        result = handleEnumerationLiteral(subject, feature, type);
        if (result != null) return result;

        result = handleFeature(subject, feature, type);
        if (result != null) return result;

        result = handleGeneralizableElement(subject, feature, type, vt);
        if (result != null) return result;

        result = handleGeneralization(subject, feature, type);
        if (result != null) return result;

        result = handleMethod(subject, feature, type);
        if (result != null) return result;

        result = handleModelElement(subject, feature, type, vt);
        if (result != null) return result;

        result = handleNamespace(subject, feature, type, vt);
        if (result != null) return result;

        result = handleNode(subject, feature, type);
        if (result != null) return result;

        result = handleOperation(subject, feature, type);
        if (result != null) return result;

        result = handleParameter(subject, feature, type);
        if (result != null) return result;

        result = handleStructuralFeature(subject, feature, type);
        if (result != null) return result;

        result = handleTemplateArgument(subject, feature, type);
        if (result != null) return result;

        result = handleTemplateParameter(subject, feature, type);
        if (result != null) return result;

        result = handleUseCase(subject, feature, type);
        if (result != null) return result;

        result = handleAssociationClass(subject, feature, type, vt);
        if (result != null) return result;

        result = handleStereotype(subject, feature, type);
        if (result != null) return result;

        result = handleTagDefinition(subject, feature, type);
        if (result != null) return result;

        result = handleTaggedValue(subject, feature, type);
        if (result != null) return result;

        return null;
    }

    /** Handles Association related features. */
    private Object handleAssociation(Object subject, String feature, String type) {
        if (!Model.getFacade().isAAssociation(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("connection")) {
            return new ArrayList<Object>(Model.getFacade().getConnections(subject));
        }
        if (feature.equals("allConnections")) {
            return new HashSet<Object>(Model.getFacade().getConnections(subject));
        }
        return null;
    }

    /** Handles AssociationEnd related features. */
    private Object handleAssociationEnd(Object subject, String feature, String type) {
        if (!Model.getFacade().isAAssociationEnd(subject) || !type.equals(".")) {
            return null;
        }
        switch (feature) {
            case "aggregation": return Model.getFacade().getAggregation1(subject);
            case "changeability": return Model.getFacade().getChangeability(subject);
            case "ordering": return Model.getFacade().getOrdering(subject);
            case "isNavigable": return Model.getFacade().isNavigable(subject);
            case "multiplicity": return Model.getFacade().getMultiplicity(subject);
            case "targetScope": return Model.getFacade().getTargetScope(subject);
            case "visibility": return Model.getFacade().getVisibility(subject);
            case "qualifier": return Model.getFacade().getQualifiers(subject);
            case "specification": return Model.getFacade().getSpecification(subject);
            case "participant": return Model.getFacade().getClassifier(subject);
            case "upperbound": return Model.getFacade().getUpper(subject);
            default: return null;
        }
    }

    /** Handles Attribute related features. */
    private Object handleAttribute(Object subject, String feature, String type) {
        if (!Model.getFacade().isAAttribute(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("initialValue")) {
            return Model.getFacade().getInitialValue(subject);
        }
        if (feature.equals("associationEnd")) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        }
        return null;
    }

    /** Handles BehavioralFeature related features. */
    private Object handleBehavioralFeature(Object subject, String feature, String type) {
        if (!Model.getFacade().isABehavioralFeature(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("isQuery")) {
            return Model.getFacade().isQuery(subject);
        }
        if (feature.equals("parameter")) {
            return new ArrayList<Object>(Model.getFacade().getParameters(subject));
        }
        return null;
    }

    /** Handles Binding related features. */
    private Object handleBinding(Object subject, String feature, String type) {
        if (!Model.getFacade().isABinding(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("argument")) {
            return Model.getFacade().getArguments(subject);
        }
        return null;
    }

    /** Handles Class related features. */
    private Object handleClass(Object subject, String feature, String type) {
        if (!Model.getFacade().isAClass(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("isActive")) {
            return Model.getFacade().isActive(subject);
        }
        return null;
    }

    /** Handles Classifier related features, including OCL derived ones. */
    private Object handleClassifier(Object subject, String feature, String type,
            Map<String, Object> vt) {
        if (!Model.getFacade().isAClassifier(subject) || !type.equals(".")) {
            return null;
        }
        switch (feature) {
            case "feature":
                return new ArrayList<Object>(Model.getFacade().getFeatures(subject));
            case "association":
                return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
            case "powertypeRange":
                return new HashSet<Object>(Model.getFacade().getPowertypeRanges(subject));
            case "allFeatures":
                return internalOcl(subject, vt,
                        "self.feature->union(self.parent.oclAsType(Classifier).allFeatures)");
            case "allOperations":
                return internalOcl(subject, vt,
                        "self.allFeatures->select(f | f.oclIsKindOf(Operation))");
            case "allMethods":
                return internalOcl(subject, vt,
                        "self.allFeatures->select(f | f.oclIsKindOf(Method))");
            case "allAttributes":
                return internalOcl(subject, vt,
                        "self.allFeatures->select(f | f.oclIsKindOf(Attribute))");
            case "associations":
                return internalOcl(subject, vt,
                        "self.association.association->asSet()");
            case "allAssociations":
                return internalOcl(subject, vt,
                        "self.associations->union(self.parent.oclAsType(Classifier).allAssociations)");
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
                        "self.oppositeAssociationEnds->union(self.parent.allOppositeAssociationEnds )");
            case "specification":
                return internalOcl(subject, vt,
                        "self.clientDependency->select(d |"
                        + "d.oclIsKindOf(Abstraction) and d.stereotype.name = \"realization\" "
                        + "and d.supplier.oclIsKindOf(Classifier)).supplier.oclAsType(Classifier)");
            case "allContents":
                return internalOcl(subject, vt,
                        "self.contents->union(self.parent.allContents->select(e |"
                        + "e.elementOwnership.visibility = #public or true or "
                        + " e.elementOwnership.visibility = #protected))");
            case "allDiscriminators":
                return internalOcl(subject, vt,
                        "self.generalization.discriminator->union(self.parent.oclAsType(Classifier).allDiscriminators)");
            default:
                return null;
        }
    }

    /** Handles Comment related features. */
    private Object handleComment(Object subject, String feature, String type) {
        if (!Model.getFacade().isAComment(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("annotatedElement")) {
            return new HashSet<Object>(Model.getFacade().getAnnotatedElements(subject));
        }
        return null;
    }

    /** Handles Component related features, including OCL derived ones. */
    private Object handleComponent(Object subject, String feature, String type,
            Map<String, Object> vt) {
        if (!Model.getFacade().isAComponent(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("deploymentLocation")) {
            return new HashSet<Object>(Model.getFacade().getDeploymentLocations(subject));
        }
        if (feature.equals("resident")) {
            return new HashSet<Object>(Model.getFacade().getResidents(subject));
        }
        if (feature.equals("allResidentElements")) {
            return internalOcl(subject, vt,
                    "self.resident->union(self.parent.oclAsType(Component)."
                    + "allResidentElements->select( re |"
                    + "re.elementResidence.visibility = #public or "
                    + "re.elementResidence.visibility = #protected))");
        }
        return null;
    }

    /** Handles Constraint related features. */
    private Object handleConstraint(Object subject, String feature, String type) {
        if (!Model.getFacade().isAConstraint(subject) || !type.equals(".")) {
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

    /** Handles Dependency related features. */
    private Object handleDependency(Object subject, String feature, String type) {
        if (!Model.getFacade().isADependency(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("client")) {
            return new HashSet<Object>(Model.getFacade().getClients(subject));
        }
        if (feature.equals("supplier")) {
            return new HashSet<Object>(Model.getFacade().getSuppliers(subject));
        }
        return null;
    }

    /** Handles ElementResidence related features. */
    private Object handleElementResidence(Object subject, String feature, String type) {
        if (!Model.getFacade().isAElementResidence(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        }
        return null;
    }

    /** Handles Enumeration related features. */
    private Object handleEnumeration(Object subject, String feature, String type) {
        if (!Model.getFacade().isAEnumeration(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("literal")) {
            return Model.getFacade().getEnumerationLiterals(subject);
        }
        return null;
    }

    /** Handles EnumerationLiteral related features. */
    private Object handleEnumerationLiteral(Object subject, String feature, String type) {
        if (!Model.getFacade().isAEnumerationLiteral(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("enumeration")) {
            return Model.getFacade().getEnumeration(subject);
        }
        return null;
    }

    /** Handles Feature related features. */
    private Object handleFeature(Object subject, String feature, String type) {
        if (!Model.getFacade().isAFeature(subject) || !type.equals(".")) {
            return null;
        }
        switch (feature) {
            case "ownerScope": return Model.getFacade().isStatic(subject);
            case "visibility": return Model.getFacade().getVisibility(subject);
            case "owner": return Model.getFacade().getOwner(subject);
            default: return null;
        }
    }

    /** Handles GeneralizableElement related features, including OCL derived ones. */
    private Object handleGeneralizableElement(Object subject, String feature,
            String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAGeneralizableElement(subject) || !type.equals(".")) {
            return null;
        }
        switch (feature) {
            case "isAbstract": return Model.getFacade().isAbstract(subject);
            case "isLeaf": return Model.getFacade().isLeaf(subject);
            case "isRoot": return Model.getFacade().isRoot(subject);
            case "generalization":
                return new HashSet<Object>(Model.getFacade().getGeneralizations(subject));
            case "specialization":
                return new HashSet<Object>(Model.getFacade().getSpecializations(subject));
            case "parent":
                return internalOcl(subject, vt, "self.generalization.parent");
            case "allParents":
                return internalOcl(subject, vt, "self.parent->union(self.parent.allParents)");
            default:
                return null;
        }
    }

    /** Handles Generalization related features. */
    private Object handleGeneralization(Object subject, String feature, String type) {
        if (!Model.getFacade().isAGeneralization(subject) || !type.equals(".")) {
            return null;
        }
        switch (feature) {
            case "discriminator": return Model.getFacade().getDiscriminator(subject);
            case "child": return Model.getFacade().getSpecific(subject);
            case "parent": return Model.getFacade().getGeneral(subject);
            case "powertype": return Model.getFacade().getPowertype(subject);
            case "specialization":
                return new HashSet<Object>(Model.getFacade().getSpecializations(subject));
            default:
                return null;
        }
    }

    /** Handles Method related features. */
    private Object handleMethod(Object subject, String feature, String type) {
        if (!Model.getFacade().isAMethod(subject) || !type.equals(".")) {
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

    /** Handles ModelElement related features, including OCL derived ones. */
    private Object handleModelElement(Object subject, String feature, String type,
            Map<String, Object> vt) {
        if (!Model.getFacade().isAModelElement(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("name")) {
            String name = Model.getFacade().getName(subject);
            return name == null ? "" : name;
        }
        switch (feature) {
            case "clientDependency":
                return new HashSet<Object>(Model.getFacade().getClientDependencies(subject));
            case "constraint":
                return new HashSet<Object>(Model.getFacade().getConstraints(subject));
            case "namespace":
                return Model.getFacade().getNamespace(subject);
            case "supplierDependency":
                return new HashSet<Object>(Model.getFacade().getSupplierDependencies(subject));
            case "templateParameter":
                return Model.getFacade().getTemplateParameters(subject);
            case "stereotype":
                return Model.getFacade().getStereotypes(subject);
            case "taggedValue":
                return Model.getFacade().getTaggedValuesCollection(subject);
            case "supplier":
                return internalOcl(subject, vt, "self.clientDependency.supplier");
            case "allSuppliers":
                return internalOcl(subject, vt, "self.supplier->union(self.supplier.allSuppliers)");
            case "model":
                return internalOcl(subject, vt,
                        "self.namespace->union(self.namespace.allSurroundingNamespaces)->select( ns| ns.oclIsKindOf (Model))");
            case "isTemplate":
                return !Model.getFacade().getTemplateParameters(subject).isEmpty();
            case "isInstantiated":
                return internalOcl(subject, vt,
                        "self.clientDependency->select(oclIsKindOf(Binding))->notEmpty");
            case "templateArgument":
                return internalOcl(subject, vt,
                        "self.clientDependency->select(oclIsKindOf(Binding)).oclAsType(Binding).argument");
            default:
                return null;
        }
    }

    /** Handles Namespace related features, including OCL derived ones. */
    private Object handleNamespace(Object subject, String feature, String type,
            Map<String, Object> vt) {
        if (!Model.getFacade().isANamespace(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("ownedElement")) {
            return new HashSet<Object>(Model.getFacade().getOwnedElements(subject));
        }
        if (feature.equals("contents")) {
            return internalOcl(subject, vt,
                    "self.ownedElement->union(self.ownedElement->select(x|x.oclIsKindOf(Namespace)).contents)");
        }
        if (feature.equals("allContents")) {
            return internalOcl(subject, vt, "self.contents");
        }
        if (feature.equals("allVisibleElements")) {
            return internalOcl(subject, vt,
                    "self.allContents ->select(e |e.elementOwnership.visibility = #public)");
        }
        if (feature.equals("allSurroundingNamespaces")) {
            return internalOcl(subject, vt,
                    "self.namespace->union(self.namespace.allSurroundingNamespaces)");
        }
        return null;
    }

    /** Handles Node related features. */
    private Object handleNode(Object subject, String feature, String type) {
        if (!Model.getFacade().isANode(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("deployedComponent")) {
            return new HashSet<Object>(Model.getFacade().getDeployedComponents(subject));
        }
        return null;
    }

    /** Handles Operation related features. */
    private Object handleOperation(Object subject, String feature, String type) {
        if (!Model.getFacade().isAOperation(subject) || !type.equals(".")) {
            return null;
        }
        switch (feature) {
            case "concurrency": return Model.getFacade().getConcurrency(subject);
            case "isAbstract": return Model.getFacade().isAbstract(subject);
            case "isLeaf": return Model.getFacade().isLeaf(subject);
            case "isRoot": return Model.getFacade().isRoot(subject);
            default: return null;
        }
    }

    /** Handles Parameter related features. */
    private Object handleParameter(Object subject, String feature, String type) {
        if (!Model.getFacade().isAParameter(subject) || !type.equals(".")) {
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

    /** Handles StructuralFeature related features. */
    private Object handleStructuralFeature(Object subject, String feature, String type) {
        if (!Model.getFacade().isAStructuralFeature(subject) || !type.equals(".")) {
            return null;
        }
        switch (feature) {
            case "changeability": return Model.getFacade().getChangeability(subject);
            case "multiplicity": return Model.getFacade().getMultiplicity(subject);
            case "ordering": return Model.getFacade().getOrdering(subject);
            case "targetScope": return Model.getFacade().getTargetScope(subject);
            case "type": return Model.getFacade().getType(subject);
            default: return null;
        }
    }

    /** Handles TemplateArgument related features. */
    private Object handleTemplateArgument(Object subject, String feature, String type) {
        if (!Model.getFacade().isATemplateArgument(subject) || !type.equals(".")) {
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

    /** Handles TemplateParameter related features. */
    private Object handleTemplateParameter(Object subject, String feature, String type) {
        if (!Model.getFacade().isATemplateParameter(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("defaultElement")) {
            return Model.getFacade().getDefaultElement(subject);
        }
        return null;
    }

    /** Handles UseCase related features. */
    private Object handleUseCase(Object subject, String feature, String type) {
        if (!Model.getFacade().isAUseCase(subject) || !type.equals(".")) {
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

    /** Handles AssociationClass related features. */
    private Object handleAssociationClass(Object subject, String feature, String type,
            Map<String, Object> vt) {
        if (!Model.getFacade().isAAssociationClass(subject) || !type.equals(".")) {
            return null;
        }
        if (feature.equals("allConnections")) {
            return internalOcl(subject, vt,
                    "self.connection->union(self.parent->select("
                    + "s | s.oclIsKindOf(Association))->collect("
                    + "a : Association | a.allConnections))->asSet()");
        }
        return null;
    }

    /** Handles Stereotype related features. */
    private Object handleStereotype(Object subject, String feature, String type) {
        if (!Model.getFacade().isAStereotype(subject) || !type.equals(".")) {
            return null;
        }
        switch (feature) {
            case "baseClass": return new HashSet<Object>(Model.getFacade().getBaseClasses(subject));
            case "extendedElement": return new HashSet<Object>(Model.getFacade().getExtendedElements(subject));
            case "definedTag": return new HashSet<Object>(Model.getFacade().getTagDefinitions(subject));
            default: return null;
        }
    }

    /** Handles TagDefinition related features. */
    private Object handleTagDefinition(Object subject, String feature, String type) {
        if (!Model.getFacade().isATagDefinition(subject) || !type.equals(".")) {
            return null;
        }
        switch (feature) {
            case "multiplicity": return Model.getFacade().getMultiplicity(subject);
            case "tagType": return Model.getFacade().getType(subject);
            case "typedValue": return new HashSet<Object>(Model.getFacade().getTypedValues(subject));
            case "owner": return Model.getFacade().getOwner(subject);
            default: return null;
        }
    }

    /** Handles TaggedValue related features. */
    private Object handleTaggedValue(Object subject, String feature, String type) {
        if (!Model.getFacade().isATaggedValue(subject) || !type.equals(".")) {
            return null;
        }
        switch (feature) {
            case "dataValue": return Model.getFacade().getDataValue(subject);
            case "type": return Model.getFacade().getType(subject);
            case "referenceValue": return new HashSet<Object>(Model.getFacade().getReferenceValue(subject));
            default: return null;
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
     * Add the metamodel-metaclasses as built-in symbols.
     *
     * @param sym the symbol
     * @return the value of the symbol
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