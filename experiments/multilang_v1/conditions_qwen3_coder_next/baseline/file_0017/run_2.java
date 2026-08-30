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
// ARISING OUT OF THE USE OF THIS SOFTWARE AND ITS DOCUMENTATION, EVEN IF
// THE UNIVERSITY OF CALIFORNIA HAS BEEN ADVISED OF THE POSSIBILITY OF
// SUCH DAMAGE. THE UNIVERSITY OF CALIFORNIA SPECIFICALLY DISCLAIMS ANY
// WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
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

        if (type == null || !type.equals(".")) {
            return null;
        }

        // Handle Association
        if (Model.getFacade().isAAssociation(subject)) {
            return handleAssociation(subject, feature);
        }

        // Handle AssociationEnd
        if (Model.getFacade().isAAssociationEnd(subject)) {
            return handleAssociationEnd(subject, feature);
        }

        // Handle Attribute
        if (Model.getFacade().isAAttribute(subject)) {
            return handleAttribute(subject, feature);
        }

        // Handle BehavioralFeature
        if (Model.getFacade().isABehavioralFeature(subject)) {
            return handleBehavioralFeature(subject, feature);
        }

        // Handle Binding
        if (Model.getFacade().isABinding(subject)) {
            return handleBinding(subject, feature);
        }

        // Handle Class
        if (Model.getFacade().isAClass(subject)) {
            return handleClass(subject, feature);
        }

        // Handle Classifier
        if (Model.getFacade().isAClassifier(subject)) {
            return handleClassifier(subject, feature, vt);
        }

        // Handle Comment
        if (Model.getFacade().isAComment(subject)) {
            return handleComment(subject, feature);
        }

        // Handle Component
        if (Model.getFacade().isAComponent(subject)) {
            return handleComponent(subject, feature, vt);
        }

        // Handle Constraint
        if (Model.getFacade().isAConstraint(subject)) {
            return handleConstraint(subject, feature);
        }

        // Handle Dependency
        if (Model.getFacade().isADependency(subject)) {
            return handleDependency(subject, feature);
        }

        // Handle ElementResidence
        if (Model.getFacade().isAElementResidence(subject)) {
            return handleElementResidence(subject, feature);
        }

        // Handle Enumeration
        if (Model.getFacade().isAEnumeration(subject)) {
            return handleEnumeration(subject, feature);
        }

        // Handle EnumerationLiteral
        if (Model.getFacade().isAEnumerationLiteral(subject)) {
            return handleEnumerationLiteral(subject, feature);
        }

        // Handle Feature
        if (Model.getFacade().isAFeature(subject)) {
            return handleFeature(subject, feature);
        }

        // Handle GeneralizableElement
        if (Model.getFacade().isAGeneralizableElement(subject)) {
            return handleGeneralizableElement(subject, feature, vt);
        }

        // Handle Generalization
        if (Model.getFacade().isAGeneralization(subject)) {
            return handleGeneralization(subject, feature);
        }

        // Handle Method
        if (Model.getFacade().isAMethod(subject)) {
            return handleMethod(subject, feature);
        }

        // Handle ModelElement
        if (Model.getFacade().isAModelElement(subject)) {
            return handleModelElement(subject, feature, vt);
        }

        // Handle Namespace
        if (Model.getFacade().isANamespace(subject)) {
            return handleNamespace(subject, feature, vt);
        }

        // Handle Node
        if (Model.getFacade().isANode(subject)) {
            return handleNode(subject, feature);
        }

        // Handle Operation
        if (Model.getFacade().isAOperation(subject)) {
            return handleOperation(subject, feature);
        }

        // Handle Parameter
        if (Model.getFacade().isAParameter(subject)) {
            return handleParameter(subject, feature);
        }

        // Handle StructuralFeature
        if (Model.getFacade().isAStructuralFeature(subject)) {
            return handleStructuralFeature(subject, feature);
        }

        // Handle TemplateArgument
        if (Model.getFacade().isATemplateArgument(subject)) {
            return handleTemplateArgument(subject, feature);
        }

        // Handle TemplateParameter
        if (Model.getFacade().isATemplateParameter(subject)) {
            return handleTemplateParameter(subject, feature);
        }

        // Handle UseCase
        if (Model.getFacade().isAUseCase(subject)) {
            return handleUseCase(subject, feature);
        }

        // Handle AssociationClass
        if (Model.getFacade().isAAssociationClass(subject)) {
            return handleAssociationClass(subject, feature,vt);
        }

        // Handle Stereotype
        if (Model.getFacade().isAStereotype(subject)) {
            return handleStereotype(subject, feature);
        }

        // Handle TagDefinition
        if (Model.getFacade().isATagDefinition(subject)) {
            return handleTagDefinition(subject, feature);
        }

        // Handle TaggedValue
        if (Model.getFacade().isATaggedValue(subject)) {
            return handleTaggedValue(subject, feature);
        }

        return null;
    }

    // Handle Association features
    private Object handleAssociation(Object subject, String feature) {
        if (feature.equals("connection")) {
            return new ArrayList<Object>(Model.getFacade().getConnections(subject));
        }
        if (feature.equals("allConnections")) {
            return new HashSet<Object>(Model.getFacade().getConnections(subject));
        }
        return null;
    }

    // Handle AssociationEnd features
    private Object handleAssociationEnd(Object subject, String feature) {
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

    // Handle Attribute features
    private Object handleAttribute(Object subject, String feature) {
        if (feature.equals("initialValue")) {
            return Model.getFacade().getInitialValue(subject);
        }
        if (feature.equals("associationEnd")) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        }
        return null;
    }

    // Handle BehavioralFeature features
    private Object handleBehavioralFeature(Object subject, String feature) {
        if (feature.equals("isQuery")) {
            return Model.getFacade().isQuery(subject);
        }
        if (feature.equals("parameter")) {
            return new ArrayList<Object>(Model.getFacade().getParameters(subject));
        }
        return null;
    }

    // Handle Binding features
    private Object handleBinding(Object subject, String feature) {
        if (feature.equals("argument")) {
            return Model.getFacade().getArguments(subject);
        }
        return null;
    }

    // Handle Class features
    private Object handleClass(Object subject, String feature) {
        if (feature.equals("isActive")) {
            return Model.getFacade().isActive(subject);
        }
        return null;
    }

    // Handle Classifier features
    private Object handleClassifier(Object subject, String feature, Map<String, Object> vt) {
        switch (feature) {
            case "feature":
                return new ArrayList<Object>(Model.getFacade().getFeatures(subject));
            case "association":
                return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
            case "powertypeRange":
                return new HashSet<Object>(Model.getFacade().getPowertypeRanges(subject));
            case "allFeatures":
                return internalOcl(subject, vt, "self.feature->union(self.parent.oclAsType(Classifier).allFeatures)");
            case "allOperations":
                return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Operation))");
            case "allMethods":
                return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Method))");
            case "allAttributes":
                return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Attribute))");
            case "associations":
                return internalOcl(subject, vt, "self.association.association->asSet()");
            case "allAssociations":
                return internalOcl(subject, vt, "self.associations->union(self.parent.oclAsType(Classifier).allAssociations)");
            case "oppositeAssociationEnds":
                return internalOcl(subject, vt, "self.associations->select ( a | a.connection->select ( ae | ae.participant = self ).size = 1 )->collect ( a | a.connection->select ( ae | ae.participant <> self ) )->union ( self.associations->select ( a | a.connection->select ( ae | ae.participant = self ).size > 1 )->collect ( a | a.connection) )");
            case "allOppositeAssociationEnds":
                return internalOcl(subject, vt, "self.oppositeAssociationEnds->union(self.parent.allOppositeAssociationEnds)");
            case "specification":
                return internalOcl(subject, vt, "self.clientDependency->select(d | d.oclIsKindOf(Abstraction) and d.stereotype.name = \"realization\" and d.supplier.oclIsKindOf(Classifier)).supplier.oclAsType(Classifier)");
            case "allContents":
                return internalOcl(subject, vt, "self.contents->union(self.parent.allContents->select(e | e.elementOwnership.visibility = #public or true or e.elementOwnership.visibility = #protected))");
            case "allDiscriminators":
                return internalOcl(subject, vt, "self.generalization.discriminator->union(self.parent.oclAsType(Classifier).allDiscriminators)");
            case "feature":
                return new ArrayList<Object>(Model.getFacade().getFeatures(subject));
            default:
                return null;
        }
    }

    // Handle Comment features
    private Object handleComment(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("annotatedElement")) {
            return new HashSet<Object>(Model.getFacade().getAnnotatedElements(subject));
        }
        return null;
    }

    // Handle Component features
    private Object handleComponent(Object subject, String feature, Map<String, Object> vt) {
        if (feature.equals("deploymentLocation")) {
            return new HashSet<Object>(Model.getFacade().getDeploymentLocations(subject));
        }
        if (feature.equals("resident")) {
            return new HashSet<Object>(Model.getFacade().getResidents(subject));
        }
        if (feature.equals("allResidentElements")) {
            return internalOcl(subject, vt, "self.resident->union(self.parent.oclAsType(Component).allResidentElements->select( re | re.elementResidence.visibility = #public or re.elementResidence.visibility = #protected))");
        }
        return null;
    }

    // Handle Constraint features
    private Object handleConstraint(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("constrainedElement")) {
            return Model.getFacade().getConstrainedElements(subject);
        }
        return null;
    }

    // Handle Dependency features
    private Object handleDependency(Object subject, String feature) {
        if (feature.equals("client")) {
            return new HashSet<Object>(Model.getFacade().getClients(subject));
        }
        if (feature.equals("supplier")) {
            return new HashSet<Object>(Model.getFacade().getSuppliers(subject));
        }
        return null;
    }

    // Handle ElementResidence features
    private Object handleElementResidence(Object subject, String feature) {
        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        }
        return null;
    }

    // Handle Enumeration features
    private Object handleEnumeration(Object subject, String feature) {
        if (feature.equals("literal")) {
            return Model.getFacade().getEnumerationLiterals(subject);
        }
        return null;
    }

    // Handle EnumerationLiteral features
    private Object handleEnumerationLiteral(Object subject, String feature) {
        if (feature.equals("enumeration")) {
            return Model.getFacade().getEnumeration(subject);
        }
        return null;
    }

    // Handle Feature features
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

    // Handle GeneralizableElement features
    private Object handleGeneralizableElement(Object subject, String feature, Map<String, Object> vt) {
        switch (feature) {
            case "isAbstract":
                return Model.getFacade().isAbstract(subject);
            case "isLeaf":
                return Model.getFacade().isLeaf(subject);
            case "isRoot":
                return Model.getFacade().isRoot(subject);
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

    // Handle Generalization features
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
            return new HashSet<Object>(Model.getFacade().getSpecializations(subject));
        }
        return null;
    }

    // Handle Method features
    private Object handleMethod(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(subject);
        }
        return null;
    }

    // Handle ModelElement features
    private Object handleModelElement(Object subject, String feature, Map<String, Object> vt) {
        if (feature.equals("name")) {
            return Model.getFacade().getName(subject);
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
        if (feature.equals("supplier")) {
            return internalOcl(subject, vt, "self.clientDependency.supplier");
        }
        if (feature.equals("allSuppliers")) {
            return internalOcl(subject, vt, "self.supplier->union(self.supplier.allSuppliers)");
        }
        if (feature.equals("model")) {
            return internalOcl(subject, vt, "self.namespace->union(self.namespace.allSurroundingNamespaces)->select( ns| ns.oclIsKindOf (Model))");
        }
        if (feature.equals("isTemplate")) {
            return !Model.getFacade().getTemplateParameters(subject).isEmpty();
        }
        if (feature.equals("isInstantiated")) {
            return internalOcl(subject, vt, "self.clientDependency->select(oclIsKindOf(Binding))->notEmpty");
        }
        if (feature.equals("templateArgument")) {
            return internalOcl(subject, vt, "self.clientDependency->select(oclIsKindOf(Binding)).oclAsType(Binding).argument");
        }
        return null;
    }

    // Handle Namespace features
    private Object handleNamespace(Object subject, String feature, Map<String, Object> vt) {
        if (feature.equals("ownedElement")) {
            return new HashSet<Object>(Model.getFacade().getOwnedElements(subject));
        }
        if (feature.equals("contents")) {
            return internalOcl(subject, vt, "self.ownedElement->union(self.ownedElement->select(x|x.oclIsKindOf(Namespace)).contents)");
        }
        if (feature.equals("allContents")) {
            return internalOcl(subject, vt, "self.contents");
        }
        if (feature.equals("allVisibleElements")) {
            return internalOcl(subject, vt, "self.allContents ->select(e |e.elementOwnership.visibility = #public)");
        }
        if (feature.equals("allSurroundingNamespaces")) {
            return internalOcl(subject, vt, "self.namespace->union(self.namespace.allSurroundingNamespaces)");
        }
        return null;
    }

    // Handle Node features
    private Object handleNode(Object subject, String feature) {
        if (feature.equals("deployedComponent")) {
            return new HashSet<Object>(Model.getFacade().getDeployedComponents(subject));
        }
        return null;
    }

    // Handle Operation features
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

    // Handle Parameter features
    private Object handleParameter(Object subject, String feature) {
        if (feature.equals("defaultValue")) {
            return Model.getFacade().getDefaultValue(subject);
        }
        if (feature.equals("kind")) {
            return Model.getFacade().getKind(subject);
        }
        return null;
    }

    // Handle StructuralFeature features
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

    // Handle TemplateArgument features
    private Object handleTemplateArgument(Object subject, String feature) {
        if (feature.equals("binding")) {
            return Model.getFacade().getBinding(subject);
        }
        if (feature.equals("modelElement")) {
            return Model.getFacade().getModelElement(subject);
        }
        return null;
    }

    // Handle TemplateParameter features
    private Object handleTemplateParameter(Object subject, String feature) {
        if (feature.equals("defaultElement")) {
            return Model.getFacade().getDefaultElement(subject);
        }
        return null;
    }

    // Handle UseCase features
    private Object handleUseCase(Object subject, String feature) {
        if (feature.equals("specificationPath")) {
            return Model.getUseCasesHelper().getSpecificationPath(subject);
        }
        if (feature.equals("allExtensionPoints")) {
            Collection<Object> c = Model.getCoreHelper().getAllSupertypes(subject);
            Collection<Object> result = new ArrayList<>(Model.getFacade().getExtensionPoints(subject));
            for (Object uc : c) {
                result.addAll(Model.getFacade().getExtensionPoints(uc));
            }
            return result;
        }
        return null;
    }

    // Handle AssociationClass features
    private Object handleAssociationClass(Object subject, String feature, Map<String, Object> vt) {
        if (feature.equals("allConnections")) {
            return internalOcl(subject, vt, "self.connection->union(self.parent->select(s | s.oclIsKindOf(Association))->collect(a : Association | a.allConnections))->asSet()");
        }
        return null;
    }

    // Handle Stereotype features
    private Object handleStereotype(Object subject, String feature) {
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

    // Handle TagDefinition features
    private Object handleTagDefinition(Object subject, String feature) {
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

    // Handle TaggedValue features
    private Object handleTaggedValue(Object subject, String feature) {
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