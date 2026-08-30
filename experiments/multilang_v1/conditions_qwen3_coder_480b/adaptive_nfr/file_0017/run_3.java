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
            return getResult(subject, feature, type, vt);
        }

        if (handleAssociationEnd(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleAttribute(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleBehavioralFeature(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleBinding(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleClass(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleClassifier(subject, feature, type, vt)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleComment(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleComponent(subject, feature, type, vt)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleConstraint(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleDependency(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleElementResidence(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleEnumeration(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleEnumerationLiteral(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleFeature(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleGeneralizableElement(subject, feature, type, vt)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleGeneralization(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleMethod(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleModelElement(subject, feature, type, vt)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleNamespace(subject, feature, type, vt)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleNode(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleOperation(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleParameter(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleStructuralFeature(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleTemplateArgument(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleTemplateParameter(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleUseCase(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleAssociationClass(subject, feature, type, vt)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleStereotype(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleTagDefinition(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        if (handleTaggedValue(subject, feature, type)) {
            return getResult(subject, feature, type, vt);
        }

        return null;
    }

    private boolean handleAssociation(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAAssociation(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleAssociationEnd(Object subject, String feature, String type) {
        if (!Model.getFacade().isAAssociationEnd(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleAttribute(Object subject, String feature, String type) {
        if (!Model.getFacade().isAAttribute(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleBehavioralFeature(Object subject, String feature, String type) {
        if (!Model.getFacade().isABehavioralFeature(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleBinding(Object subject, String feature, String type) {
        if (!Model.getFacade().isABinding(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleClass(Object subject, String feature, String type) {
        if (!Model.getFacade().isAClass(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleClassifier(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAClassifier(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleComment(Object subject, String feature, String type) {
        if (!Model.getFacade().isAComment(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleComponent(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAComponent(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleConstraint(Object subject, String feature, String type) {
        if (!Model.getFacade().isAConstraint(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleDependency(Object subject, String feature, String type) {
        if (!Model.getFacade().isADependency(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleElementResidence(Object subject, String feature, String type) {
        if (!Model.getFacade().isAElementResidence(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleEnumeration(Object subject, String feature, String type) {
        if (!Model.getFacade().isAEnumeration(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleEnumerationLiteral(Object subject, String feature, String type) {
        if (!Model.getFacade().isAEnumerationLiteral(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleFeature(Object subject, String feature, String type) {
        if (!Model.getFacade().isAFeature(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleGeneralizableElement(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAGeneralizableElement(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleGeneralization(Object subject, String feature, String type) {
        if (!Model.getFacade().isAGeneralization(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleMethod(Object subject, String feature, String type) {
        if (!Model.getFacade().isAMethod(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleModelElement(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAModelElement(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleNamespace(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isANamespace(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleNode(Object subject, String feature, String type) {
        if (!Model.getFacade().isANode(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleOperation(Object subject, String feature, String type) {
        if (!Model.getFacade().isAOperation(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleParameter(Object subject, String feature, String type) {
        if (!Model.getFacade().isAParameter(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleStructuralFeature(Object subject, String feature, String type) {
        if (!Model.getFacade().isAStructuralFeature(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleTemplateArgument(Object subject, String feature, String type) {
        if (!Model.getFacade().isATemplateArgument(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleTemplateParameter(Object subject, String feature, String type) {
        if (!Model.getFacade().isATemplateParameter(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleUseCase(Object subject, String feature, String type) {
        if (!Model.getFacade().isAUseCase(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleAssociationClass(Object subject, String feature, String type, Map<String, Object> vt) {
        if (!Model.getFacade().isAAssociationClass(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleStereotype(Object subject, String feature, String type) {
        if (!Model.getFacade().isAStereotype(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleTagDefinition(Object subject, String feature, String type) {
        if (!Model.getFacade().isATagDefinition(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private boolean handleTaggedValue(Object subject, String feature, String type) {
        if (!Model.getFacade().isATaggedValue(subject)) {
            return false;
        }
        if (!type.equals(".")) {
            return false;
        }
        return true;
    }

    private Object getResult(Object subject, String feature, String type, Map<String, Object> vt) {
        /* 4.5.2.3 Association */
        if (Model.getFacade().isAAssociation(subject)) {
            if (feature.equals("connection")) {
                return new ArrayList<Object>(Model.getFacade()
                        .getConnections(subject));
            }

            // Additional Operation 4.5.3.1 [1]
            if (feature.equals("allConnections")) {
                return new HashSet<Object>(Model.getFacade()
                        .getConnections(subject));
            }
            return null;
        }

        /* 4.5.2.5 AssociationEnd */
        if (Model.getFacade().isAAssociationEnd(subject)) {
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
            // TODO: isStatic in UML 2.x
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

            // TODO investigate the "unnamed opposite end"

            // Additional Operation 4.5.3.3 [1]
            if (feature.equals("upperbound")) {
                return Model.getFacade().getUpper(subject);
            }
            return null;
        }

        /* 4.5.2.6 Attribute */
        if (Model.getFacade().isAAttribute(subject)) {
            if (feature.equals("initialValue")) {
                return Model.getFacade().getInitialValue(subject);
            }
            if (feature.equals("associationEnd")) {
                return new ArrayList<Object>(Model.getFacade()
                        .getAssociationEnds(subject));
            }
            return null;
        }

        /* 4.5.2.7 BehavioralFeature */
        if (Model.getFacade().isABehavioralFeature(subject)) {
            if (feature.equals("isQuery")) {
                return Model.getFacade().isQuery(subject);
            }
            if (feature.equals("parameter")) {
                return new ArrayList<Object>(Model.getFacade()
                        .getParameters(subject));
            }

            // TODO implement additional operations in 4.5.3.5
            return null;
        }

        /* 4.5.2.8 Binding */
        if (Model.getFacade().isABinding(subject)) {
            if (feature.equals("argument")) {
                return Model.getFacade().getArguments(subject);
            }
            return null;
        }

        /* 4.5.2.9 Class */
        if (Model.getFacade().isAClass(subject)) {
            if (feature.equals("isActive")) {
                return Model.getFacade().isActive(subject);
            }
            return null;
        }

        /* 4.5.2.10 Classifier */
        if (Model.getFacade().isAClassifier(subject)) {
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
            // TODO specifiedEnd??

            // Additional Operations in 4.5.3.8
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

        /* 4.5.2.11 Comment */
        if (Model.getFacade().isAComment(subject)) {
            if (feature.equals("body")) {
                return Model.getFacade().getBody(subject);
            }
            if (feature.equals("annotatedElement")) {
                return new HashSet<Object>(Model.getFacade()
                        .getAnnotatedElements(subject));
            }
            return null;
        }

        /* 4.5.2.12 Component */
        if (Model.getFacade().isAComponent(subject)) {
            if (feature.equals("deploymentLocation")) {
                return new HashSet<Object>(Model.getFacade()
                        .getDeploymentLocations(subject));
            }
            if (feature.equals("resident")) {
                // TODO check this
                return new HashSet<Object>(Model.getFacade()
                        .getResidents(subject));
            }

            // TODO implementation?

            // Additional Operation in 4.5.3.9
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

        /* 4.5.2.13 Constraint */
        if (Model.getFacade().isAConstraint(subject)) {
            if (feature.equals("body")) {
                return Model.getFacade().getBody(subject);
            }
            if (feature.equals("constrainedElement")) {
                // TODO check this
                return Model.getFacade().getConstrainedElements(subject);
            }
            return null;
        }

        /* 4.5.2.14 Dependency */
        if (Model.getFacade().isADependency(subject)) {
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

        // TODO ElementOwnership is not in ModelSubsys!!

        /* 4.5.2.18 ElementOwnership */
        if (Model.getFacade().isAElementResidence(subject)) {
            if (feature.equals("visibility")) {
                return Model.getFacade().getVisibility(subject);
            }
            return null;
        }

        /* 4.5.2.19 Enumeration */
        if (Model.getFacade().isAEnumeration(subject)) {
            if (feature.equals("literal")) {
                return Model.getFacade().getEnumerationLiterals(subject);
            }
            return null;
        }

        /* 4.5.2.20 EnumerationLiteral */
        if (Model.getFacade().isAEnumerationLiteral(subject)) {
            if (feature.equals("enumeration")) {
                return Model.getFacade().getEnumeration(subject);
            }
            return null;
        }

        /* 4.5.2.21 Feature */
        if (Model.getFacade().isAFeature(subject)) {
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

        /* 4.5.2.23 Generalizable Element */
        if (Model.getFacade().isAGeneralizableElement(subject)) {
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

            // Additional Operation in 4.5.3.20
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

        /* 4.5.2.24 Generalization */
        if (Model.getFacade().isAGeneralization(subject)) {
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

        /* 4.5.2.26 Method */
        if (Model.getFacade().isAMethod(subject)) {
            if (feature.equals("body")) {
                return Model.getFacade().getBody(subject);
            }
            if (feature.equals("specification")) {
                return Model.getFacade().getSpecification(subject);
            }
            return null;
        }

        /* 4.5.2.27 ModelElement */
        if (Model.getFacade().isAModelElement(subject)) {
            if (feature.equals("name")) {
                String name = Model.getFacade().getName(subject);
                if (name == null) {
                    // TODO check conformancy to specification

                    // avoiding null names
                    name = "";
                }
                return name;
            }

            // TODO asArgument??

            if (feature.equals("clientDependency")) {
                return new HashSet<Object>(Model.getFacade()
                        .getClientDependencies(subject));
            }
            if (feature.equals("constraint")) {
                return new HashSet<Object>(Model.getFacade()
                        .getConstraints(subject));
            }

            // TODO implementationLocation??

            if (feature.equals("namespace")) {
                return Model.getFacade().getNamespace(subject);
            }

            // TODO presentation??
            if (feature.equals("supplierDependency")) {
                return new HashSet<Object>(Model.getFacade()
                        .getSupplierDependencies(subject));
            }

            if (feature.equals("templateParameter")) {
                return Model.getFacade().getTemplateParameters(subject);
            }

            // As extended by 4.6.2.2
            if (feature.equals("stereotype")) {
                return Model.getFacade().getStereotypes(subject);
            }

            if (feature.equals("taggedValue")) {
                return Model.getFacade().getTaggedValuesCollection(subject);
            }

            // Additional Operations in 4.5.3.25
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

        /* 4.5.2.28 Namespace */
        if (Model.getFacade().isANamespace(subject)) {
            if (feature.equals("ownedElement")) {
                return new HashSet<Object>(Model.getFacade()
                        .getOwnedElements(subject));
            }
            // Additional Operations in 4.5.3.26
            if (feature.equals("contents")) {
                    // TODO investigate typo in spec!!
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

        /* 4.5.2.29 Node */
        if (Model.getFacade().isANode(subject)) {
            if (feature.equals("deployedComponent")) {
                return new HashSet<Object>(Model.getFacade()
                        .getDeployedComponents(subject));
            }
            return null;
        }

        /* 4.5.2.30 Operation */
        if (Model.getFacade().isAOperation(subject)) {
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

        /* 4.5.2.31 Parameter */
        if (Model.getFacade().isAParameter(subject)) {
            if (feature.equals("defaultValue")) {
                return Model.getFacade().getDefaultValue(subject);
            }
            if (feature.equals("kind")) {
                return Model.getFacade().getKind(subject);
            }
            return null;
        }

        /* 4.5.2.37 StructuralFeature */
        if (Model.getFacade().isAStructuralFeature(subject)) {
            if (feature.equals("changeability")) {
                return Model.getFacade().getChangeability(subject);
            }
            if (feature.equals("multiplicity")) {
                return Model.getFacade().getMultiplicity(subject);
            }
            if (feature.equals("ordering")) {
                return Model.getFacade().getOrdering(subject);
            }
            // TODO: Removed from UML 2.x
            if (feature.equals("targetScope")) {
                return Model.getFacade().getTargetScope(subject);
            }
            if (feature.equals("type")) {
                return Model.getFacade().getType(subject);
            }
            return null;
        }

        /* 4.5.2.38 TemplateArgument */
        if (Model.getFacade().isATemplateArgument(subject)) {
            if (feature.equals("binding")) {
                return Model.getFacade().getBinding(subject);
            }
            if (feature.equals("modelElement")) {
                return Model.getFacade().getModelElement(subject);
            }
            return null;
        }

        /* 4.5.2.39 TemplateParameter */
        if (Model.getFacade().isATemplateParameter(subject)) {
            if (feature.equals("defaultElement")) {
                return Model.getFacade().getDefaultElement(subject);
            }
            return null;
        }

        /* 4.11.3.5 UseCase */
        if (Model.getFacade().isAUseCase(subject)) {
            if (feature.equals("specificationPath")) {
                /*  The operation specificationPath results in a set containing
                 * all surrounding Namespaces that are not instances of
                 *  Package.
                 *  specificationPath : Set(Namespace)
                 * specificationPath = self.allSurroundingNamespaces->select(n |
                 *    n.oclIsKindOf(Subsystem) or n.oclIsKindOf(Class))
                 **/
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

        /* 4.5.3.2 AssociationClass */
        if (Model.getFacade().isAAssociationClass(subject)) {
            if (feature.equals("allConnections")) {
                /* The operation allConnections results in the set of all
                 * AssociationEnds of the AssociationClass, including all
                 * connections defined by its parent (transitive closure).
                 */
                return internalOcl(
                        subject,
                        vt,
                        "self.connection->union(self.parent->select("
                      + "s | s.oclIsKindOf(Association))->collect("
                      + "a : Association | a.allConnections))->asSet()");
            }
            return null;
        }

        /* 4.6.2.3 Stereotype */
        if (Model.getFacade().isAStereotype(subject)) {
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
            // stereotypeConstraint ?
            return null;
        }

        /* 4.6.2.4 TagDefinition */
        if (Model.getFacade().isATagDefinition(subject)) {
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

        /* 4.6.2.5 TaggedValue */
        if (Model.getFacade().isATaggedValue(subject)) {
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