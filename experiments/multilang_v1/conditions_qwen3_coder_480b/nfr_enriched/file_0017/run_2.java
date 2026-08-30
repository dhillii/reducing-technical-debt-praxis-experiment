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

        if (Model.getFacade().isAAssociation(subject)) {
            return handleAssociation(subject, feature, type);
        }

        if (Model.getFacade().isAAssociationEnd(subject)) {
            return handleAssociationEnd(subject, feature, type);
        }

        if (Model.getFacade().isAAttribute(subject)) {
            return handleAttribute(subject, feature, type);
        }

        if (Model.getFacade().isABehavioralFeature(subject)) {
            return handleBehavioralFeature(subject, feature, type);
        }

        if (Model.getFacade().isABinding(subject)) {
            return handleBinding(subject, feature, type);
        }

        if (Model.getFacade().isAClass(subject)) {
            return handleClass(subject, feature, type);
        }

        if (Model.getFacade().isAClassifier(subject)) {
            return handleClassifier(subject, feature, type, vt);
        }

        if (Model.getFacade().isAComment(subject)) {
            return handleComment(subject, feature, type);
        }

        if (Model.getFacade().isAComponent(subject)) {
            return handleComponent(subject, feature, type, vt);
        }

        if (Model.getFacade().isAConstraint(subject)) {
            return handleConstraint(subject, feature, type);
        }

        if (Model.getFacade().isADependency(subject)) {
            return handleDependency(subject, feature, type);
        }

        if (Model.getFacade().isAElementResidence(subject)) {
            return handleElementResidence(subject, feature, type);
        }

        if (Model.getFacade().isAEnumeration(subject)) {
            return handleEnumeration(subject, feature, type);
        }

        if (Model.getFacade().isAEnumerationLiteral(subject)) {
            return handleEnumerationLiteral(subject, feature, type);
        }

        if (Model.getFacade().isAFeature(subject)) {
            return handleFeature(subject, feature, type);
        }

        if (Model.getFacade().isAGeneralizableElement(subject)) {
            return handleGeneralizableElement(subject, feature, type, vt);
        }

        if (Model.getFacade().isAGeneralization(subject)) {
            return handleGeneralization(subject, feature, type);
        }

        if (Model.getFacade().isAMethod(subject)) {
            return handleMethod(subject, feature, type);
        }

        if (Model.getFacade().isAModelElement(subject)) {
            return handleModelElement(subject, feature, type, vt);
        }

        if (Model.getFacade().isANamespace(subject)) {
            return handleNamespace(subject, feature, type, vt);
        }

        if (Model.getFacade().isANode(subject)) {
            return handleNode(subject, feature, type);
        }

        if (Model.getFacade().isAOperation(subject)) {
            return handleOperation(subject, feature, type);
        }

        if (Model.getFacade().isAParameter(subject)) {
            return handleParameter(subject, feature, type);
        }

        if (Model.getFacade().isAStructuralFeature(subject)) {
            return handleStructuralFeature(subject, feature, type);
        }

        if (Model.getFacade().isATemplateArgument(subject)) {
            return handleTemplateArgument(subject, feature, type);
        }

        if (Model.getFacade().isATemplateParameter(subject)) {
            return handleTemplateParameter(subject, feature, type);
        }

        if (Model.getFacade().isAUseCase(subject)) {
            return handleUseCase(subject, feature, type);
        }

        if (Model.getFacade().isAAssociationClass(subject)) {
            return handleAssociationClass(subject, feature, type, vt);
        }

        if (Model.getFacade().isAStereotype(subject)) {
            return handleStereotype(subject, feature, type);
        }

        if (Model.getFacade().isATagDefinition(subject)) {
            return handleTagDefinition(subject, feature, type);
        }

        if (Model.getFacade().isATaggedValue(subject)) {
            return handleTaggedValue(subject, feature, type);
        }
        
        return null;
    }

    /**
     * Handles Association model element features.
     */
    private Object handleAssociation(Object subject, String feature, String type) {
        if (type.equals(".")) {
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
     * Handles AssociationEnd model element features.
     */
    private Object handleAssociationEnd(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles Attribute model element features.
     */
    private Object handleAttribute(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles BehavioralFeature model element features.
     */
    private Object handleBehavioralFeature(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles Binding model element features.
     */
    private Object handleBinding(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (feature.equals("argument")) {
                return Model.getFacade().getArguments(subject);
            }
        }
        return null;
    }

    /**
     * Handles Class model element features.
     */
    private Object handleClass(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (feature.equals("isActive")) {
                return Model.getFacade().isActive(subject);
            }
        }
        return null;
    }

    /**
     * Handles Classifier model element features.
     */
    private Object handleClassifier(Object subject, String feature, String type, Map<String, Object> vt) {
        if (type.equals(".")) {
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
        }
        return null;
    }

    /**
     * Handles Comment model element features.
     */
    private Object handleComment(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles Component model element features.
     */
    private Object handleComponent(Object subject, String feature, String type, Map<String, Object> vt) {
        if (type.equals(".")) {
            if (feature.equals("deploymentLocation")) {
                return new HashSet<Object>(Model.getFacade()
                        .getDeploymentLocations(subject));
            }
            if (feature.equals("resident")) {
                return new HashSet<Object>(Model.getFacade()
                        .getResidents(subject));
            }

            if (feature.equals("allResidentElements")) {
                return internalOcl(subject, vt,
                    "self.resident->union("
                    + "self.parent.oclAsType(Component)."
                    + "allResidentElements->select( re |"
                    + "re.elementResidence.visibility = #public or "
                    + "re.elementResidence.visibility = #protected))");
            }
        }
        return null;
    }

    /**
     * Handles Constraint model element features.
     */
    private Object handleConstraint(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (feature.equals("body")) {
                return Model.getFacade().getBody(subject);
            }
            if (feature.equals("constrainedElement")) {
                return Model.getFacade().getConstrainedElements(subject);
            }
        }
        return null;
    }

    /**
     * Handles Dependency model element features.
     */
    private Object handleDependency(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles ElementResidence model element features.
     */
    private Object handleElementResidence(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (feature.equals("visibility")) {
                return Model.getFacade().getVisibility(subject);
            }
        }
        return null;
    }

    /**
     * Handles Enumeration model element features.
     */
    private Object handleEnumeration(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (feature.equals("literal")) {
                return Model.getFacade().getEnumerationLiterals(subject);
            }
        }
        return null;
    }

    /**
     * Handles EnumerationLiteral model element features.
     */
    private Object handleEnumerationLiteral(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (feature.equals("enumeration")) {
                return Model.getFacade().getEnumeration(subject);
            }
        }
        return null;
    }

    /**
     * Handles Feature model element features.
     */
    private Object handleFeature(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles GeneralizableElement model element features.
     */
    private Object handleGeneralizableElement(Object subject, String feature, String type, Map<String, Object> vt) {
        if (type.equals(".")) {
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
                return internalOcl(subject, vt,
                        "self.generalization.parent");
            }

            if (feature.equals("allParents")) {
                return internalOcl(subject, vt,
                        "self.parent->union(self.parent.allParents)");
            }
        }
        return null;
    }

    /**
     * Handles Generalization model element features.
     */
    private Object handleGeneralization(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles Method model element features.
     */
    private Object handleMethod(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (feature.equals("body")) {
                return Model.getFacade().getBody(subject);
            }
            if (feature.equals("specification")) {
                return Model.getFacade().getSpecification(subject);
            }
        }
        return null;
    }

    /**
     * Handles ModelElement model element features.
     */
    private Object handleModelElement(Object subject, String feature, String type, Map<String, Object> vt) {
        if (type.equals(".")) {
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
        }
        return null;
    }

    /**
     * Handles Namespace model element features.
     */
    private Object handleNamespace(Object subject, String feature, String type, Map<String, Object> vt) {
        if (type.equals(".")) {
            if (feature.equals("ownedElement")) {
                return new HashSet<Object>(Model.getFacade()
                        .getOwnedElements(subject));
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
        }
        return null;
    }

    /**
     * Handles Node model element features.
     */
    private Object handleNode(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (feature.equals("deployedComponent")) {
                return new HashSet<Object>(Model.getFacade()
                        .getDeployedComponents(subject));
            }
        }
        return null;
    }

    /**
     * Handles Operation model element features.
     */
    private Object handleOperation(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles Parameter model element features.
     */
    private Object handleParameter(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (feature.equals("defaultValue")) {
                return Model.getFacade().getDefaultValue(subject);
            }
            if (feature.equals("kind")) {
                return Model.getFacade().getKind(subject);
            }
        }
        return null;
    }

    /**
     * Handles StructuralFeature model element features.
     */
    private Object handleStructuralFeature(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles TemplateArgument model element features.
     */
    private Object handleTemplateArgument(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (feature.equals("binding")) {
                return Model.getFacade().getBinding(subject);
            }
            if (feature.equals("modelElement")) {
                return Model.getFacade().getModelElement(subject);
            }
        }
        return null;
    }

    /**
     * Handles TemplateParameter model element features.
     */
    private Object handleTemplateParameter(Object subject, String feature, String type) {
        if (type.equals(".")) {
            if (feature.equals("defaultElement")) {
                return Model.getFacade().getDefaultElement(subject);
            }
        }
        return null;
    }

    /**
     * Handles UseCase model element features.
     */
    private Object handleUseCase(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles AssociationClass model element features.
     */
    private Object handleAssociationClass(Object subject, String feature, String type, Map<String, Object> vt) {
        if (type.equals(".")) {
            if (feature.equals("allConnections")) {
                return internalOcl(
                        subject,
                        vt,
                        "self.connection->union(self.parent->select("
                      + "s | s.oclIsKindOf(Association))->collect("
                      + "a : Association | a.allConnections))->asSet()");
            }
        }
        return null;
    }

    /**
     * Handles Stereotype model element features.
     */
    private Object handleStereotype(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles TagDefinition model element features.
     */
    private Object handleTagDefinition(Object subject, String feature, String type) {
        if (type.equals(".")) {
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

    /**
     * Handles TaggedValue model element features.
     */
    private Object handleTaggedValue(Object subject, String feature, String type) {
        if (type.equals(".")) {
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