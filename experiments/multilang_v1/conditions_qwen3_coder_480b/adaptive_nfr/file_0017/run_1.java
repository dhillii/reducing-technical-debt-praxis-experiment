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

        if (handleAssociation(subject, feature, type, vt)) {
            return getResult();
        }

        if (handleAssociationEnd(subject, feature, type)) {
            return getResult();
        }

        if (handleAttribute(subject, feature, type)) {
            return getResult();
        }

        if (handleBehavioralFeature(subject, feature, type)) {
            return getResult();
        }

        if (handleBinding(subject, feature, type)) {
            return getResult();
        }

        if (handleClass(subject, feature, type)) {
            return getResult();
        }

        if (handleClassifier(subject, feature, type, vt)) {
            return getResult();
        }

        if (handleComment(subject, feature, type)) {
            return getResult();
        }

        if (handleComponent(subject, feature, type, vt)) {
            return getResult();
        }

        if (handleConstraint(subject, feature, type)) {
            return getResult();
        }

        if (handleDependency(subject, feature, type)) {
            return getResult();
        }

        if (handleElementResidence(subject, feature, type)) {
            return getResult();
        }

        if (handleEnumeration(subject, feature, type)) {
            return getResult();
        }

        if (handleEnumerationLiteral(subject, feature, type)) {
            return getResult();
        }

        if (handleFeature(subject, feature, type)) {
            return getResult();
        }

        if (handleGeneralizableElement(subject, feature, type, vt)) {
            return getResult();
        }

        if (handleGeneralization(subject, feature, type)) {
            return getResult();
        }

        if (handleMethod(subject, feature, type)) {
            return getResult();
        }

        if (handleModelElement(subject, feature, type, vt)) {
            return getResult();
        }

        if (handleNamespace(subject, feature, type, vt)) {
            return getResult();
        }

        if (handleNode(subject, feature, type)) {
            return getResult();
        }

        if (handleOperation(subject, feature, type)) {
            return getResult();
        }

        if (handleParameter(subject, feature, type)) {
            return getResult();
        }

        if (handleStructuralFeature(subject, feature, type)) {
            return getResult();
        }

        if (handleTemplateArgument(subject, feature, type)) {
            return getResult();
        }

        if (handleTemplateParameter(subject, feature, type)) {
            return getResult();
        }

        if (handleUseCase(subject, feature, type)) {
            return getResult();
        }

        if (handleAssociationClass(subject, feature, type, vt)) {
            return getResult();
        }

        if (handleStereotype(subject, feature, type)) {
            return getResult();
        }

        if (handleTagDefinition(subject, feature, type)) {
            return getResult();
        }

        if (handleTaggedValue(subject, feature, type)) {
            return getResult();
        }

        return null;
    }

    private Object result;
    
    private boolean handleAssociation(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAAssociation(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("connection")) {
            result = new ArrayList<Object>(Model.getFacade().getConnections(subject));
            return true;
        }

        if (feature.equals("allConnections")) {
            result = new HashSet<Object>(Model.getFacade().getConnections(subject));
            return true;
        }
        
        return false;
    }
    
    private boolean handleAssociationEnd(Object subject, String feature, String type) {
        if (!Model.getFacade().isAAssociationEnd(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("aggregation")) {
            result = Model.getFacade().getAggregation1(subject);
            return true;
        }
        if (feature.equals("changeability")) {
            result = Model.getFacade().getChangeability(subject);
            return true;
        }
        if (feature.equals("ordering")) {
            result = Model.getFacade().getOrdering(subject);
            return true;
        }
        if (feature.equals("isNavigable")) {
            result = Model.getFacade().isNavigable(subject);
            return true;
        }
        if (feature.equals("multiplicity")) {
            result = Model.getFacade().getMultiplicity(subject);
            return true;
        }
        if (feature.equals("targetScope")) {
            result = Model.getFacade().getTargetScope(subject);
            return true;
        }
        if (feature.equals("visibility")) {
            result = Model.getFacade().getVisibility(subject);
            return true;
        }
        if (feature.equals("qualifier")) {
            result = Model.getFacade().getQualifiers(subject);
            return true;
        }
        if (feature.equals("specification")) {
            result = Model.getFacade().getSpecification(subject);
            return true;
        }
        if (feature.equals("participant")) {
            result = Model.getFacade().getClassifier(subject);
            return true;
        }
        if (feature.equals("upperbound")) {
            result = Model.getFacade().getUpper(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleAttribute(Object subject, String feature, String type) {
        if (!Model.getFacade().isAAttribute(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("initialValue")) {
            result = Model.getFacade().getInitialValue(subject);
            return true;
        }
        if (feature.equals("associationEnd")) {
            result = new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
            return true;
        }
        
        return false;
    }
    
    private boolean handleBehavioralFeature(Object subject, String feature, String type) {
        if (!Model.getFacade().isABehavioralFeature(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("isQuery")) {
            result = Model.getFacade().isQuery(subject);
            return true;
        }
        if (feature.equals("parameter")) {
            result = new ArrayList<Object>(Model.getFacade().getParameters(subject));
            return true;
        }
        
        return false;
    }
    
    private boolean handleBinding(Object subject, String feature, String type) {
        if (!Model.getFacade().isABinding(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("argument")) {
            result = Model.getFacade().getArguments(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleClass(Object subject, String feature, String type) {
        if (!Model.getFacade().isAClass(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("isActive")) {
            result = Model.getFacade().isActive(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleClassifier(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAClassifier(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("feature")) {
            result = new ArrayList<Object>(Model.getFacade().getFeatures(subject));
            return true;
        }
        if (feature.equals("association")) {
            result = new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
            return true;
        }
        if (feature.equals("powertypeRange")) {
            result = new HashSet<Object>(Model.getFacade().getPowertypeRanges(subject));
            return true;
        }
        if (feature.equals("allFeatures")) {
            result = internalOcl(subject, vt, "self.feature->union("
                    + "self.parent.oclAsType(Classifier).allFeatures)");
            return true;
        }
        if (feature.equals("allOperations")) {
            result = internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Operation))");
            return true;
        }
        if (feature.equals("allMethods")) {
            result = internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Method))");
            return true;
        }
        if (feature.equals("allAttributes")) {
            result = internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Attribute))");
            return true;
        }
        if (feature.equals("associations")) {
            result = internalOcl(subject, vt,
                    "self.association.association->asSet()");
            return true;
        }
        if (feature.equals("allAssociations")) {
            result = internalOcl(
                    subject,
                    vt,
                  "self.associations->union("
                + "self.parent.oclAsType(Classifier).allAssociations)");
            return true;
        }
        if (feature.equals("oppositeAssociationEnds")) {
            result = internalOcl(subject, vt,
                "self.associations->select ( a | a.connection->select "
                    + "( ae | ae.participant = self ).size = 1 )->"
                    + "collect ( a | a.connection->"
                    + "select ( ae | ae.participant <> self ) )->"
                    + "union ( self.associations->"
                    + "select ( a | a.connection->select ( ae |"
                    + "ae.participant = self ).size > 1 )->"
                    + "collect ( a | a.connection) )");
            return true;
        }
        if (feature.equals("allOppositeAssociationEnds")) {
            result = internalOcl(
                    subject,
                    vt,
                    "self.oppositeAssociationEnds->"
                  + "union(self.parent.allOppositeAssociationEnds )");
            return true;
        }
        if (feature.equals("specification")) {
            result = internalOcl(
                    subject,
                    vt,
                    "self.clientDependency->"
                    + "select(d |"
                    + "d.oclIsKindOf(Abstraction)"
                    + "and d.stereotype.name = \"realization\" "
                    + "and d.supplier.oclIsKindOf(Classifier))"
                    + ".supplier.oclAsType(Classifier)");
            return true;
        }
        if (feature.equals("allContents")) {
            result = internalOcl(subject, vt,
                "self.contents->union("
                + "self.parent.allContents->select(e |"
                + "e.elementOwnership.visibility = #public or true or "
                + " e.elementOwnership.visibility = #protected))");
            return true;
        }
        if (feature.equals("allDiscriminators")) {
            result = internalOcl(subject, vt,
                "self.generalization.discriminator->"
                + "union(self.parent.oclAsType(Classifier)."
                + "allDiscriminators)");
            return true;
        }
        
        return false;
    }
    
    private boolean handleComment(Object subject, String feature, String type) {
        if (!Model.getFacade().isAComment(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("body")) {
            result = Model.getFacade().getBody(subject);
            return true;
        }
        if (feature.equals("annotatedElement")) {
            result = new HashSet<Object>(Model.getFacade().getAnnotatedElements(subject));
            return true;
        }
        
        return false;
    }
    
    private boolean handleComponent(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAComponent(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("deploymentLocation")) {
            result = new HashSet<Object>(Model.getFacade().getDeploymentLocations(subject));
            return true;
        }
        if (feature.equals("resident")) {
            result = new HashSet<Object>(Model.getFacade().getResidents(subject));
            return true;
        }
        if (feature.equals("allResidentElements")) {
            result = internalOcl(subject, vt,
                "self.resident->union("
                + "self.parent.oclAsType(Component)."
                + "allResidentElements->select( re |"
                + "re.elementResidence.visibility = #public or "
                + "re.elementResidence.visibility = #protected))");
            return true;
        }
        
        return false;
    }
    
    private boolean handleConstraint(Object subject, String feature, String type) {
        if (!Model.getFacade().isAConstraint(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("body")) {
            result = Model.getFacade().getBody(subject);
            return true;
        }
        if (feature.equals("constrainedElement")) {
            result = Model.getFacade().getConstrainedElements(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleDependency(Object subject, String feature, String type) {
        if (!Model.getFacade().isADependency(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("client")) {
            result = new HashSet<Object>(Model.getFacade().getClients(subject));
            return true;
        }
        if (feature.equals("supplier")) {
            result = new HashSet<Object>(Model.getFacade().getSuppliers(subject));
            return true;
        }
        
        return false;
    }
    
    private boolean handleElementResidence(Object subject, String feature, String type) {
        if (!Model.getFacade().isAElementResidence(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("visibility")) {
            result = Model.getFacade().getVisibility(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleEnumeration(Object subject, String feature, String type) {
        if (!Model.getFacade().isAEnumeration(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("literal")) {
            result = Model.getFacade().getEnumerationLiterals(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleEnumerationLiteral(Object subject, String feature, String type) {
        if (!Model.getFacade().isAEnumerationLiteral(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("enumeration")) {
            result = Model.getFacade().getEnumeration(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleFeature(Object subject, String feature, String type) {
        if (!Model.getFacade().isAFeature(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("ownerScope")) {
            result = Model.getFacade().isStatic(subject);
            return true;
        }
        if (feature.equals("visibility")) {
            result = Model.getFacade().getVisibility(subject);
            return true;
        }
        if (feature.equals("owner")) {
            result = Model.getFacade().getOwner(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleGeneralizableElement(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAGeneralizableElement(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("isAbstract")) {
            result = Model.getFacade().isAbstract(subject);
            return true;
        }
        if (feature.equals("isLeaf")) {
            result = Model.getFacade().isLeaf(subject);
            return true;
        }
        if (feature.equals("isRoot")) {
            result = Model.getFacade().isRoot(subject);
            return true;
        }
        if (feature.equals("generalization")) {
            result = new HashSet<Object>(Model.getFacade().getGeneralizations(subject));
            return true;
        }
        if (feature.equals("specialization")) {
            result = new HashSet<Object>(Model.getFacade().getSpecializations(subject));
            return true;
        }
        if (feature.equals("parent")) {
            result = internalOcl(subject, vt,
                    "self.generalization.parent");
            return true;
        }
        if (feature.equals("allParents")) {
            result = internalOcl(subject, vt,
                    "self.parent->union(self.parent.allParents)");
            return true;
        }
        
        return false;
    }
    
    private boolean handleGeneralization(Object subject, String feature, String type) {
        if (!Model.getFacade().isAGeneralization(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("discriminator")) {
            result = Model.getFacade().getDiscriminator(subject);
            return true;
        }
        if (feature.equals("child")) {
            result = Model.getFacade().getSpecific(subject);
            return true;
        }
        if (feature.equals("parent")) {
            result = Model.getFacade().getGeneral(subject);
            return true;
        }
        if (feature.equals("powertype")) {
            result = Model.getFacade().getPowertype(subject);
            return true;
        }
        if (feature.equals("specialization")) {
            result = new HashSet<Object>(Model.getFacade().getSpecializations(subject));
            return true;
        }
        
        return false;
    }
    
    private boolean handleMethod(Object subject, String feature, String type) {
        if (!Model.getFacade().isAMethod(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("body")) {
            result = Model.getFacade().getBody(subject);
            return true;
        }
        if (feature.equals("specification")) {
            result = Model.getFacade().getSpecification(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleModelElement(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAModelElement(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("name")) {
            String name = Model.getFacade().getName(subject);
            if (name == null) {
                name = "";
            }
            result = name;
            return true;
        }
        if (feature.equals("clientDependency")) {
            result = new HashSet<Object>(Model.getFacade().getClientDependencies(subject));
            return true;
        }
        if (feature.equals("constraint")) {
            result = new HashSet<Object>(Model.getFacade().getConstraints(subject));
            return true;
        }
        if (feature.equals("namespace")) {
            result = Model.getFacade().getNamespace(subject);
            return true;
        }
        if (feature.equals("supplierDependency")) {
            result = new HashSet<Object>(Model.getFacade().getSupplierDependencies(subject));
            return true;
        }
        if (feature.equals("templateParameter")) {
            result = Model.getFacade().getTemplateParameters(subject);
            return true;
        }
        if (feature.equals("stereotype")) {
            result = Model.getFacade().getStereotypes(subject);
            return true;
        }
        if (feature.equals("taggedValue")) {
            result = Model.getFacade().getTaggedValuesCollection(subject);
            return true;
        }
        if (feature.equals("supplier")) {
            result = internalOcl(subject, vt,
                    "self.clientDependency.supplier");
            return true;
        }
        if (feature.equals("allSuppliers")) {
            result = internalOcl(subject, vt,
                    "self.supplier->union(self.supplier.allSuppliers)");
            return true;
        }
        if (feature.equals("model")) {
            result = internalOcl(subject, vt,
                    "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)->"
                    + "select( ns| ns.oclIsKindOf (Model))");
            return true;
        }
        if (feature.equals("isTemplate")) {
            result = !Model.getFacade().getTemplateParameters(subject).isEmpty();
            return true;
        }
        if (feature.equals("isInstantiated")) {
            result = internalOcl(subject, vt, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))->notEmpty");
            return true;
        }
        if (feature.equals("templateArgument")) {
            result = internalOcl(subject, vt, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))."
                    + "oclAsType(Binding).argument");
            return true;
        }
        
        return false;
    }
    
    private boolean handleNamespace(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isANamespace(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("ownedElement")) {
            result = new HashSet<Object>(Model.getFacade().getOwnedElements(subject));
            return true;
        }
        if (feature.equals("contents")) {
            result = internalOcl(subject, vt, "self.ownedElement->"
                    + "union(self.ownedElement->"
                    + "select(x|x.oclIsKindOf(Namespace)).contents)");
            return true;
        }
        if (feature.equals("allContents")) {
            result = internalOcl(subject, vt, "self.contents");
            return true;
        }
        if (feature.equals("allVisibleElements")) {
            result = internalOcl(
                    subject,
                    vt,
                  "self.allContents ->"
                + "select(e |e.elementOwnership.visibility = #public)");
            return true;
        }
        if (feature.equals("allSurroundingNamespaces")) {
            result = internalOcl(subject, vt, "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)");
            return true;
        }
        
        return false;
    }
    
    private boolean handleNode(Object subject, String feature, String type) {
        if (!Model.getFacade().isANode(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("deployedComponent")) {
            result = new HashSet<Object>(Model.getFacade().getDeployedComponents(subject));
            return true;
        }
        
        return false;
    }
    
    private boolean handleOperation(Object subject, String feature, String type) {
        if (!Model.getFacade().isAOperation(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("concurrency")) {
            result = Model.getFacade().getConcurrency(subject);
            return true;
        }
        if (feature.equals("isAbstract")) {
            result = Model.getFacade().isAbstract(subject);
            return true;
        }
        if (feature.equals("isLeaf")) {
            result = Model.getFacade().isLeaf(subject);
            return true;
        }
        if (feature.equals("isRoot")) {
            result = Model.getFacade().isRoot(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleParameter(Object subject, String feature, String type) {
        if (!Model.getFacade().isAParameter(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("defaultValue")) {
            result = Model.getFacade().getDefaultValue(subject);
            return true;
        }
        if (feature.equals("kind")) {
            result = Model.getFacade().getKind(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleStructuralFeature(Object subject, String feature, String type) {
        if (!Model.getFacade().isAStructuralFeature(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("changeability")) {
            result = Model.getFacade().getChangeability(subject);
            return true;
        }
        if (feature.equals("multiplicity")) {
            result = Model.getFacade().getMultiplicity(subject);
            return true;
        }
        if (feature.equals("ordering")) {
            result = Model.getFacade().getOrdering(subject);
            return true;
        }
        if (feature.equals("targetScope")) {
            result = Model.getFacade().getTargetScope(subject);
            return true;
        }
        if (feature.equals("type")) {
            result = Model.getFacade().getType(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleTemplateArgument(Object subject, String feature, String type) {
        if (!Model.getFacade().isATemplateArgument(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("binding")) {
            result = Model.getFacade().getBinding(subject);
            return true;
        }
        if (feature.equals("modelElement")) {
            result = Model.getFacade().getModelElement(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleTemplateParameter(Object subject, String feature, String type) {
        if (!Model.getFacade().isATemplateParameter(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("defaultElement")) {
            result = Model.getFacade().getDefaultElement(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleUseCase(Object subject, String feature, String type) {
        if (!Model.getFacade().isAUseCase(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("specificationPath")) {
            result = Model.getUseCasesHelper().getSpecificationPath(subject);
            return true;
        }
        if (feature.equals("allExtensionPoints")) {
            Collection c = Model.getCoreHelper().getAllSupertypes(subject);
            Collection resultColl = new ArrayList(Model.getFacade().getExtensionPoints(subject));
            for (Object uc : c) {
                resultColl.addAll(Model.getFacade().getExtensionPoints(uc));
            }
            result = resultColl;
            return true;
        }
        
        return false;
    }
    
    private boolean handleAssociationClass(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAAssociationClass(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("allConnections")) {
            result = internalOcl(
                    subject,
                    vt,
                    "self.connection->union(self.parent->select("
                  + "s | s.oclIsKindOf(Association))->collect("
                  + "a : Association | a.allConnections))->asSet()");
            return true;
        }
        
        return false;
    }
    
    private boolean handleStereotype(Object subject, String feature, String type) {
        if (!Model.getFacade().isAStereotype(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("baseClass")) {
            result = new HashSet<Object>(Model.getFacade().getBaseClasses(subject));
            return true;
        }
        if (feature.equals("extendedElement")) {
            result = new HashSet<Object>(Model.getFacade().getExtendedElements(subject));
            return true;
        }
        if (feature.equals("definedTag")) {
            result = new HashSet<Object>(Model.getFacade().getTagDefinitions(subject));
            return true;
        }
        
        return false;
    }
    
    private boolean handleTagDefinition(Object subject, String feature, String type) {
        if (!Model.getFacade().isATagDefinition(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("multiplicity")) {
            result = Model.getFacade().getMultiplicity(subject);
            return true;
        }
        if (feature.equals("tagType")) {
            result = Model.getFacade().getType(subject);
            return true;
        }
        if (feature.equals("typedValue")) {
            result = new HashSet<Object>(Model.getFacade().getTypedValues(subject));
            return true;
        }
        if (feature.equals("owner")) {
            result = Model.getFacade().getOwner(subject);
            return true;
        }
        
        return false;
    }
    
    private boolean handleTaggedValue(Object subject, String feature, String type) {
        if (!Model.getFacade().isATaggedValue(subject)) {
            return false;
        }
        
        if (!type.equals(".")) {
            return false;
        }
        
        if (feature.equals("dataValue")) {
            result = Model.getFacade().getDataValue(subject);
            return true;
        }
        if (feature.equals("type")) {
            result = Model.getFacade().getType(subject);
            return true;
        }
        if (feature.equals("referenceValue")) {
            result = new HashSet<Object>(Model.getFacade().getReferenceValue(subject));
            return true;
        }
        
        return false;
    }
    
    private Object getResult() {
        return result;
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