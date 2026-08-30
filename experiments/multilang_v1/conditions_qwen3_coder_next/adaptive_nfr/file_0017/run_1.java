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

        if (subject == null) {
            return null;
        }

        if (!type.equals(".")) {
            return null;
        }

        /* Association */
        if (Model.getFacade().isAAssociation(subject)) {
            return handleAssociation(subject, feature);
        }

        /* AssociationEnd */
        if (Model.getFacade().isAAssociationEnd(subject)) {
            return handleAssociationEnd(subject, feature);
        }

        /* Attribute */
        if (Model.getFacade().isAAttribute(subject)) {
            return handleAttribute(subject, feature);
        }

        /* BehavioralFeature */
        if (Model.getFacade().isABehavioralFeature(subject)) {
            return handleBehavioralFeature(subject, feature);
        }

        /* Binding */
        if (Model.getFacade().isABinding(subject)) {
            return handleBinding(subject, feature);
        }

        /* Class */
        if (Model.getFacade().isAClass(subject)) {
            return handleClass(subject, feature);
        }

        /* Classifier */
        if (Model.getFacade().isAClassifier(subject)) {
            return handleClassifier(subject, vt, feature);
        }

        /* Comment */
        if (Model.getFacade().isAComment(subject)) {
            return handleComment(subject, feature);
        }

        /* Component */
        if (Model.getFacade().isAComponent(subject)) {
            return handleComponent(subject, vt, feature);
        }

        /* Constraint */
        if (Model.getFacade().isAConstraint(subject)) {
            return handleConstraint(subject, feature);
        }

        /* Dependency */
        if (Model.getFacade().isADependency(subject)) {
            return handleDependency(subject, feature);
        }

        /* ElementResidence */
        if (Model.getFacade().isAElementResidence(subject)) {
            return handleElementResidence(subject, feature);
        }

        /* Enumeration */
        if (Model.getFacade().isAEnumeration(subject)) {
            return handleEnumeration(subject, feature);
        }

        /* EnumerationLiteral */
        if (Model.getFacade().isAEnumerationLiteral(subject)) {
            return handleEnumerationLiteral(subject, feature);
        }

        /* Feature */
        if (Model.getFacade().isAFeature(subject)) {
            return handleFeature(subject, feature);
        }

        /* GeneralizableElement */
        if (Model.getFacade().isAGeneralizableElement(subject)) {
            return handleGeneralizableElement(subject, vt, feature);
        }

        /* Generalization */
        if (Model.getFacade().isAGeneralization(subject)) {
            return handleGeneralization(subject, feature);
        }

        /* Method */
        if (Model.getFacade().isAMethod(subject)) {
            return handleMethod(subject, feature);
        }

        /* ModelElement */
        if (Model.getFacade().isAModelElement(subject)) {
            return handleModelElement(subject, vt, feature);
        }

        /* Namespace */
        if (Model.getFacade().isANamespace(subject)) {
            return handleNamespace(subject, vt, feature);
        }

        /* Node */
        if (Model.getFacade().isANode(subject)) {
            return handleNode(subject, feature);
        }

        /* Operation */
        if (Model.getFacade().isAOperation(subject)) {
            return handleOperation(subject, feature);
        }

        /* Parameter */
        if (Model.getFacade().isAParameter(subject)) {
            return handleParameter(subject, feature);
        }

        /* StructuralFeature */
        if (Model.getFacade().isAStructuralFeature(subject)) {
            return handleStructuralFeature(subject, feature);
        }

        /* TemplateArgument */
        if (Model.getFacade().isATemplateArgument(subject)) {
            return handleTemplateArgument(subject, feature);
        }

        /* TemplateParameter */
        if (Model.getFacade().isATemplateParameter(subject)) {
            return handleTemplateParameter(subject, feature);
        }

        /* UseCase */
        if (Model.getFacade().isAUseCase(subject)) {
            return handleUseCase(subject, feature);
        }

        /* AssociationClass */
        if (Model.getFacade().isAAssociationClass(subject)) {
            return handleAssociationClass(subject, vt, feature);
        }

        /* Stereotype */
        if (Model.getFacade().isAStereotype(subject)) {
            return handleStereotype(subject, feature);
        }

        /* TagDefinition */
        if (Model.getFacade().isATagDefinition(subject)) {
            return handleTagDefinition(subject, feature);
        }

        /* TaggedValue */
        if (Model.getFacade().isATaggedValue(subject)) {
            return handleTaggedValue(subject, feature);
        }

        return null;
    }

    /* Association */

    private Object handleAssociation(Object subject, String feature) {
        if (feature.equals("connection")) {
            return new ArrayList<Object>(Model.getFacade().getConnections(subject));
        }

        if (feature.equals("allConnections")) {
            return new HashSet<Object>(Model.getFacade().getConnections(subject));
        }

        return null;
    }

    /* AssociationEnd */

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

    /* Attribute */

    private Object handleAttribute(Object subject, String feature) {
        if (feature.equals("initialValue")) {
            return Model.getFacade().getInitialValue(subject);
        }

        if (feature.equals("associationEnd")) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        }

        return null;
    }

    /* BehavioralFeature */

    private Object handleBehavioralFeature(Object subject, String feature) {
        if (feature.equals("isQuery")) {
            return Model.getFacade().isQuery(subject);
        }

        if (feature.equals("parameter")) {
            return new ArrayList<Object>(Model.getFacade().getParameters(subject));
        }

        return null;
    }

    /* Binding */

    private Object handleBinding(Object subject, String feature) {
        if (feature.equals("argument")) {
            return Model.getFacade().getArguments(subject);
        }

        return null;
    }

    /* Class */

    private Object handleClass(Object subject, String feature) {
        if (feature.equals("isActive")) {
            return Model.getFacade().isActive(subject);
        }

        return null;
    }

    /* Classifier */

    private Object handleClassifier(Object subject, Map<String, Object> vt, String feature) {
        switch (feature) {
        case "feature":
            return new ArrayList<Object>(Model.getFacade().getFeatures(subject));
        case "association":
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        case "powertypeRange":
            return new HashSet<Object>(Model.getFacade().getPowertypeRanges(subject));
        case "allFeatures":
            return internalOcl(subject, vt, "self.feature->union("
                    + "self.parent.oclAsType(Classifier).allFeatures)");
        case "allOperations":
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Operation))");
        case "allMethods":
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Method))");
        case "allAttributes":
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Attribute))");
        case "associations":
            return internalOcl(subject, vt, "self.association.association->asSet()");
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

    /* Comment */

    private Object handleComment(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }

        if (feature.equals("annotatedElement")) {
            return new HashSet<Object>(Model.getFacade().getAnnotatedElements(subject));
        }

        return null;
    }

    /* Component */

    private Object handleComponent(Object subject, Map<String, Object> vt, String feature) {
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

    /* Constraint */

    private Object handleConstraint(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }

        if (feature.equals("constrainedElement")) {
            return Model.getFacade().getConstrainedElements(subject);
        }

        return null;
    }

    /* Dependency */

    private Object handleDependency(Object subject, String feature) {
        if (feature.equals("client")) {
            return new HashSet<Object>(Model.getFacade().getClients(subject));
        }

        if (feature.equals("supplier")) {
            return new HashSet<Object>(Model.getFacade().getSuppliers(subject));
        }

        return null;
    }

    /* ElementResidence */

    private Object handleElementResidence(Object subject, String feature) {
        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        }

        return null;
    }

    /* Enumeration */

    private Object handleEnumeration(Object subject, String feature) {
        if (feature.equals("literal")) {
            return Model.getFacade().getEnumerationLiterals(subject);
        }

        return null;
    }

    /* EnumerationLiteral */

    private Object handleEnumerationLiteral(Object subject, String feature) {
        if (feature.equals("enumeration")) {
            return Model.getFacade().getEnumeration(subject);
        }

        return null;
    }

    /* Feature */

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

    /* GeneralizableElement */

    private Object handleGeneralizableElement(Object subject, Map<String, Object> vt, String feature) {
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

    /* Generalization */

    private Object handleGeneralization(Object subject, String feature) {
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
            return new HashSet<Object>(Model.getFacade().getSpecializations(subject));
        default:
            return null;
        }
    }

    /* Method */

    private Object handleMethod(Object subject, String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }

        if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(subject);
        }

        return null;
    }

    /* ModelElement */

    private Object handleModelElement(Object subject, Map<String, Object> vt, String feature) {
        switch (feature) {
        case "name":
            String name = Model.getFacade().getName(subject);
            return name != null ? name : "";
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
                    "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)->"
                    + "select( ns| ns.oclIsKindOf (Model))");
        case "isTemplate":
            return !Model.getFacade().getTemplateParameters(subject).isEmpty();
        case "isInstantiated":
            return internalOcl(subject, vt, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))->notEmpty");
        case "templateArgument":
            return internalOcl(subject, vt, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))."
                    + "oclAsType(Binding).argument");
        default:
            return null;
        }
    }

    /* Namespace */

    private Object handleNamespace(Object subject, Map<String, Object> vt, String feature) {
        if (feature.equals("ownedElement")) {
            return new HashSet<Object>(Model.getFacade().getOwnedElements(subject));
        }

        switch (feature) {
        case "contents":
            return internalOcl(subject, vt, "self.ownedElement->"
                    + "union(self.ownedElement->"
                    + "select(x|x.oclIsKindOf(Namespace)).contents)");
        case "allContents":
            return internalOcl(subject, vt, "self.contents");
        case "allVisibleElements":
            return internalOcl(subject, vt, "self.allContents ->"
                    + "select(e |e.elementOwnership.visibility = #public)");
        case "allSurroundingNamespaces":
            return internalOcl(subject, vt, "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)");
        default:
            return null;
        }
    }

    /* Node */

    private Object handleNode(Object subject, String feature) {
        if (feature.equals("deployedComponent")) {
            return new HashSet<Object>(Model.getFacade().getDeployedComponents(subject));
        }

        return null;
    }

    /* Operation */

    private Object handleOperation(Object subject, String feature) {
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

    /* Parameter */

    private Object handleParameter(Object subject, String feature) {
        if (feature.equals("defaultValue")) {
            return Model.getFacade().getDefaultValue(subject);
        }

        if (feature.equals("kind")) {
            return Model.getFacade().getKind(subject);
        }

        return null;
    }

    /* StructuralFeature */

    private Object handleStructuralFeature(Object subject, String feature) {
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

    /* TemplateArgument */

    private Object handleTemplateArgument(Object subject, String feature) {
        if (feature.equals("binding")) {
            return Model.getFacade().getBinding(subject);
        }

        if (feature.equals("modelElement")) {
            return Model.getFacade().getModelElement(subject);
        }

        return null;
    }

    /* TemplateParameter */

    private Object handleTemplateParameter(Object subject, String feature) {
        if (feature.equals("defaultElement")) {
            return Model.getFacade().getDefaultElement(subject);
        }

        return null;
    }

    /* UseCase */

    private Object handleUseCase(Object subject, String feature) {
        if (feature.equals("specificationPath")) {
            return Model.getUseCasesHelper().getSpecificationPath(subject);
        }

        if (feature.equals("allExtensionPoints")) {
            Collection<?> c = Model.getCoreHelper().getAllSupertypes(subject);
            Collection<Object> result = new ArrayList<>();
            result.addAll(Model.getFacade().getExtensionPoints(subject));
            for (Object uc : c) {
                result.addAll(Model.getFacade().getExtensionPoints(uc));
            }
            return result;
        }

        return null;
    }

    /* AssociationClass */

    private Object handleAssociationClass(Object subject, Map<String, Object> vt, String feature) {
        if (feature.equals("allConnections")) {
            return internalOcl(subject, vt,
                    "self.connection->union(self.parent->select("
                            + "s | s.oclIsKindOf(Association))->collect("
                            + "a : Association | a.allConnections))->asSet()");
        }

        return null;
    }

    /* Stereotype */

    private Object handleStereotype(Object subject, String feature) {
        switch (feature) {
        case "baseClass":
            return new HashSet<Object>(Model.getFacade().getBaseClasses(subject));
        case "extendedElement":
            return new HashSet<Object>(Model.getFacade().getExtendedElements(subject));
        case "definedTag":
            return new HashSet<Object>(Model.getFacade().getTagDefinitions(subject));
        default:
            return null;
        }
    }

    /* TagDefinition */

    private Object handleTagDefinition(Object subject, String feature) {
        switch (feature) {
        case "multiplicity":
            return Model.getFacade().getMultiplicity(subject);
        case "tagType":
            return Model.getFacade().getType(subject);
        case "typedValue":
            return new HashSet<Object>(Model.getFacade().getTypedValues(subject));
        case "owner":
            return Model.getFacade().getOwner(subject);
        default:
            return null;
        }
    }

    /* TaggedValue */

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