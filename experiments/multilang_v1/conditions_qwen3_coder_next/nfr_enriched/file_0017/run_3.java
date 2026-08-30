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

        /* Dispatch feature access based on metaclass type. */
        Object result = dispatchByMetaclass(vt, subject, feature, type);
        if (result != null) {
            return result;
        }

        /* Handle extended features not covered by metaclass dispatch. */
        result = dispatchExtendedFeatures(vt, subject, feature, type);
        if (result != null) {
            return result;
        }

        return null;
    }

    /**
     * Dispatch feature access based on UML metaclass type.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @param type  the operation type
     * @return the result or null if not handled
     */
    private Object dispatchByMetaclass(Map<String, Object> vt,
            Object subject, String feature, String type) {
        if (!type.equals(".")) {
            return null;
        }

        /* 4.5.2.1 Abstraction */
        if (Model.getFacade().isAAssociation(subject)) {
            return handleAssociation(vt, subject, feature);
        }

        /* 4.5.2.5 AssociationEnd */
        if (Model.getFacade().isAAssociationEnd(subject)) {
            return handleAssociationEnd(vt, subject, feature);
        }

        /* 4.5.2.6 Attribute */
        if (Model.getFacade().isAAttribute(subject)) {
            return handleAttribute(vt, subject, feature);
        }

        /* 4.5.2.7 BehavioralFeature */
        if (Model.getFacade().isABehavioralFeature(subject)) {
            return handleBehavioralFeature(vt, subject, feature);
        }

        /* 4.5.2.8 Binding */
        if (Model.getFacade().isABinding(subject)) {
            return handleBinding(vt, subject, feature);
        }

        /* 4.5.2.9 Class */
        if (Model.getFacade().isAClass(subject)) {
            return handleClass(vt, subject, feature);
        }

        /* 4.5.2.10 Classifier */
        if (Model.getFacade().isAClassifier(subject)) {
            return handleClassifier(vt, subject, feature);
        }

        /* 4.5.2.11 Comment */
        if (Model.getFacade().isAComment(subject)) {
            return handleComment(vt, subject, feature);
        }

        /* 4.5.2.12 Component */
        if (Model.getFacade().isAComponent(subject)) {
            return handleComponent(vt, subject, feature);
        }

        /* 4.5.2.13 Constraint */
        if (Model.getFacade().isAConstraint(subject)) {
            return handleConstraint(vt, subject, feature);
        }

        /* 4.5.2.14 Dependency */
        if (Model.getFacade().isADependency(subject)) {
            return handleDependency(vt, subject, feature);
        }

        /* 4.5.2.18 ElementOwnership */
        if (Model.getFacade().isAElementResidence(subject)) {
            return handleElementResidence(vt, subject, feature);
        }

        /* 4.5.2.19 Enumeration */
        if (Model.getFacade().isAEnumeration(subject)) {
            return handleEnumeration(vt, subject, feature);
        }

        /* 4.5.2.20 EnumerationLiteral */
        if (Model.getFacade().isAEnumerationLiteral(subject)) {
            return handleEnumerationLiteral(vt, subject, feature);
        }

        /* 4.5.2.21 Feature */
        if (Model.getFacade().isAFeature(subject)) {
            return handleFeature(vt, subject, feature);
        }

        /* 4.5.2.23 Generalizable Element */
        if (Model.getFacade().isAGeneralizableElement(subject)) {
            return handleGeneralizableElement(vt, subject, feature);
        }

        /* 4.5.2.24 Generalization */
        if (Model.getFacade().isAGeneralization(subject)) {
            return handleGeneralization(vt, subject, feature);
        }

        /* 4.5.2.26 Method */
        if (Model.getFacade().isAMethod(subject)) {
            return handleMethod(vt, subject, feature);
        }

        /* 4.5.2.27 ModelElement */
        if (Model.getFacade().isAModelElement(subject)) {
            return handleModelElement(vt, subject, feature);
        }

        /* 4.5.2.28 Namespace */
        if (Model.getFacade().isANamespace(subject)) {
            return handleNamespace(vt, subject, feature);
        }

        /* 4.5.2.29 Node */
        if (Model.getFacade().isANode(subject)) {
            return handleNode(vt, subject, feature);
        }

        /* 4.5.2.30 Operation */
        if (Model.getFacade().isAOperation(subject)) {
            return handleOperation(vt, subject, feature);
        }

        /* 4.5.2.31 Parameter */
        if (Model.getFacade().isAParameter(subject)) {
            return handleParameter(vt, subject, feature);
        }

        /* 4.5.2.37 StructuralFeature */
        if (Model.getFacade().isAStructuralFeature(subject)) {
            return handleStructuralFeature(vt, subject, feature);
        }

        /* 4.5.2.38 TemplateArgument */
        if (Model.getFacade().isATemplateArgument(subject)) {
            return handleTemplateArgument(vt, subject, feature);
        }

        /* 4.5.2.39 TemplateParameter */
        if (Model.getFacade().isATemplateParameter(subject)) {
            return handleTemplateParameter(vt, subject, feature);
        }

        /* 4.11.3.5 UseCase */
        if (Model.getFacade().isAUseCase(subject)) {
            return handleUseCase(vt, subject, feature);
        }

        /* 4.5.3.2 AssociationClass */
        if (Model.getFacade().isAAssociationClass(subject)) {
            return handleAssociationClass(vt, subject, feature);
        }

        /* 4.6.2.3 Stereotype */
        if (Model.getFacade().isAStereotype(subject)) {
            return handleStereotype(vt, subject, feature);
        }

        /* 4.6.2.4 TagDefinition */
        if (Model.getFacade().isATagDefinition(subject)) {
            return handleTagDefinition(vt, subject, feature);
        }

        /* 4.6.2.5 TaggedValue */
        if (Model.getFacade().isATaggedValue(subject)) {
            return handleTaggedValue(vt, subject, feature);
        }

        return null;
    }

    /**
     * Handle extended features not covered by core metaclass dispatch.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @param type  the operation type
     * @return the result or null if not handled
     */
    private Object dispatchExtendedFeatures(Map<String, Object> vt,
            Object subject, String feature, String type) {
        // Currently no extended features beyond metaclass dispatch
        return null;
    }

    /**
     * Handle association features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleAssociation(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("connection")) {
            return new ArrayList<Object>(Model.getFacade().getConnections(subject));
        }
        if (feature.equals("allConnections")) {
            return new HashSet<Object>(Model.getFacade().getConnections(subject));
        }
        return null;
    }

    /**
     * Handle association end features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleAssociationEnd(Map<String, Object> vt, Object subject,
            String feature) {
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
     * Handle attribute features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleAttribute(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("initialValue")) {
            return Model.getFacade().getInitialValue(subject);
        }
        if (feature.equals("associationEnd")) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        }
        return null;
    }

    /**
     * Handle behavioral feature features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleBehavioralFeature(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("isQuery")) {
            return Model.getFacade().isQuery(subject);
        }
        if (feature.equals("parameter")) {
            return new ArrayList<Object>(Model.getFacade().getParameters(subject));
        }
        return null;
    }

    /**
     * Handle binding features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleBinding(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("argument")) {
            return Model.getFacade().getArguments(subject);
        }
        return null;
    }

    /**
     * Handle class features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleClass(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("isActive")) {
            return Model.getFacade().isActive(subject);
        }
        return null;
    }

    /**
     * Handle classifier features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleClassifier(Map<String, Object> vt, Object subject,
            String feature) {
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
            return internalOcl(subject, vt, "self.feature->union(self.parent.oclAsType(Classifier).allFeatures)");
        }
        if (feature.equals("allOperations")) {
            return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Operation))");
        }
        if (feature.equals("allMethods")) {
            return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Method))");
        }
        if (feature.equals("allAttributes")) {
            return internalOcl(subject, vt, "self.allFeatures->select(f | f.oclIsKindOf(Attribute))");
        }
        if (feature.equals("associations")) {
            return internalOcl(subject, vt, "self.association.association->asSet()");
        }
        if (feature.equals("allAssociations")) {
            return internalOcl(subject, vt, "self.associations->union(self.parent.oclAsType(Classifier).allAssociations)");
        }
        if (feature.equals("oppositeAssociationEnds")) {
            return internalOcl(subject, vt,
                    "self.associations->select(a | a.connection->select(ae | ae.participant = self).size = 1)->collect(a | a.connection->select(ae | ae.participant <> self))->union("
                            + "self.associations->select(a | a.connection->select(ae | ae.participant = self).size > 1)->collect(a | a.connection))");
        }
        if (feature.equals("allOppositeAssociationEnds")) {
            return internalOcl(subject, vt, "self.oppositeAssociationEnds->union(self.parent.allOppositeAssociationEnds)");
        }
        if (feature.equals("specification")) {
            return internalOcl(subject, vt,
                    "self.clientDependency->select(d | d.oclIsKindOf(Abstraction) and d.stereotype.name = \"realization\" and d.supplier.oclIsKindOf(Classifier)).supplier.oclAsType(Classifier)");
        }
        if (feature.equals("allContents")) {
            return internalOcl(subject, vt, "self.contents->union(self.parent.allContents->select(e | e.elementOwnership.visibility = #public or true or e.elementOwnership.visibility = #protected))");
        }
        if (feature.equals("allDiscriminators")) {
            return internalOcl(subject, vt, "self.generalization.discriminator->union(self.parent.oclAsType(Classifier).allDiscriminators)");
        }
        return null;
    }

    /**
     * Handle comment features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleComment(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("annotatedElement")) {
            return new HashSet<Object>(Model.getFacade().getAnnotatedElements(subject));
        }
        return null;
    }

    /**
     * Handle component features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleComponent(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("deploymentLocation")) {
            return new HashSet<Object>(Model.getFacade().getDeploymentLocations(subject));
        }
        if (feature.equals("resident")) {
            return new HashSet<Object>(Model.getFacade().getResidents(subject));
        }
        if (feature.equals("allResidentElements")) {
            return internalOcl(subject, vt,
                    "self.resident->union(self.parent.oclAsType(Component).allResidentElements->select(re | re.elementResidence.visibility = #public or re.elementResidence.visibility = #protected))");
        }
        return null;
    }

    /**
     * Handle constraint features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleConstraint(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("constrainedElement")) {
            return Model.getFacade().getConstrainedElements(subject);
        }
        return null;
    }

    /**
     * Handle dependency features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleDependency(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("client")) {
            return new HashSet<Object>(Model.getFacade().getClients(subject));
        }
        if (feature.equals("supplier")) {
            return new HashSet<Object>(Model.getFacade().getSuppliers(subject));
        }
        return null;
    }

    /**
     * Handle element residence features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleElementResidence(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("visibility")) {
            return Model.getFacade().getVisibility(subject);
        }
        return null;
    }

    /**
     * Handle enumeration features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleEnumeration(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("literal")) {
            return Model.getFacade().getEnumerationLiterals(subject);
        }
        return null;
    }

    /**
     * Handle enumeration literal features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleEnumerationLiteral(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("enumeration")) {
            return Model.getFacade().getEnumeration(subject);
        }
        return null;
    }

    /**
     * Handle feature features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleFeature(Map<String, Object> vt, Object subject,
            String feature) {
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
     * Handle generalizable element features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleGeneralizableElement(Map<String, Object> vt, Object subject,
            String feature) {
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
            return internalOcl(subject, vt, "self.generalization.parent");
        }
        if (feature.equals("allParents")) {
            return internalOcl(subject, vt, "self.parent->union(self.parent.allParents)");
        }
        return null;
    }

    /**
     * Handle generalization features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleGeneralization(Map<String, Object> vt, Object subject,
            String feature) {
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
     * Handle method features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleMethod(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("body")) {
            return Model.getFacade().getBody(subject);
        }
        if (feature.equals("specification")) {
            return Model.getFacade().getSpecification(subject);
        }
        return null;
    }

    /**
     * Handle model element features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleModelElement(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("name")) {
            String name = Model.getFacade().getName(subject);
            return name == null ? "" : name;
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
            return internalOcl(subject, vt, "self.namespace->union(self.namespace.allSurroundingNamespaces)->select(ns| ns.oclIsKindOf(Model))");
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

    /**
     * Handle namespace features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleNamespace(Map<String, Object> vt, Object subject,
            String feature) {
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
            return internalOcl(subject, vt, "self.allContents -> select(e |e.elementOwnership.visibility = #public)");
        }
        if (feature.equals("allSurroundingNamespaces")) {
            return internalOcl(subject, vt, "self.namespace->union(self.namespace.allSurroundingNamespaces)");
        }
        return null;
    }

    /**
     * Handle node features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleNode(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("deployedComponent")) {
            return new HashSet<Object>(Model.getFacade().getDeployedComponents(subject));
        }
        return null;
    }

    /**
     * Handle operation features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleOperation(Map<String, Object> vt, Object subject,
            String feature) {
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
     * Handle parameter features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleParameter(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("defaultValue")) {
            return Model.getFacade().getDefaultValue(subject);
        }
        if (feature.equals("kind")) {
            return Model.getFacade().getKind(subject);
        }
        return null;
    }

    /**
     * Handle structural feature features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleStructuralFeature(Map<String, Object> vt, Object subject,
            String feature) {
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
     * Handle template argument features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleTemplateArgument(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("binding")) {
            return Model.getFacade().getBinding(subject);
        }
        if (feature.equals("modelElement")) {
            return Model.getFacade().getModelElement(subject);
        }
        return null;
    }

    /**
     * Handle template parameter features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleTemplateParameter(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("defaultElement")) {
            return Model.getFacade().getDefaultElement(subject);
        }
        return null;
    }

    /**
     * Handle use case features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleUseCase(Map<String, Object> vt, Object subject,
            String feature) {
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

    /**
     * Handle association class features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleAssociationClass(Map<String, Object> vt, Object subject,
            String feature) {
        if (feature.equals("allConnections")) {
            return internalOcl(subject, vt,
                    "self.connection->union(self.parent->select(s | s.oclIsKindOf(Association))->collect(a : Association | a.allConnections))->asSet()");
        }
        return null;
    }

    /**
     * Handle stereotype features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleStereotype(Map<String, Object> vt, Object subject,
            String feature) {
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
     * Handle tag definition features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleTagDefinition(Map<String, Object> vt, Object subject,
            String feature) {
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
     * Handle tagged value features.
     *
     * @param vt   the variable table
     * @param subject the subject object
     * @param feature the feature name
     * @return the result or null if not handled
     */
    private Object handleTaggedValue(Map<String, Object> vt, Object subject,
            String feature) {
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

    /**
     * Evaluate an OCL expression with proper SELF scoping.
     *
     * @param subject the subject object to bind to "self"
     * @param vt the variable table
     * @param ocl the OCL expression
     * @return the evaluation result, or null on error
     */
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
     * @param sym the symbol name
     * @return the OclType for the symbol, or null if not found
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