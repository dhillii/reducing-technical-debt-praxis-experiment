$Id$

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

        if (!type.equals(".")) {
            return null;
        }

        if (Model.getFacade().isAAssociation(subject)) {
            return handleAssociation(subject, feature);
        }

        if (Model.getFacade().isAAssociationEnd(subject)) {
            return handleAssociationEnd(subject, feature);
        }

        if (Model.getFacade().isAAttribute(subject)) {
            return handleAttribute(subject, feature);
        }

        if (Model.getFacade().isABehavioralFeature(subject)) {
            return handleBehavioralFeature(subject, feature);
        }

        if (Model.getFacade().isABinding(subject)) {
            return handleBinding(subject, feature);
        }

        if (Model.getFacade().isAClass(subject)) {
            return handleClass(subject, feature);
        }

        if (Model.getFacade().isAClassifier(subject)) {
            return handleClassifier(subject, feature);
        }

        if (Model.getFacade().isAComment(subject)) {
            return handleComment(subject, feature);
        }

        if (Model.getFacade().isAComponent(subject)) {
            return handleComponent(subject, feature);
        }

        if (Model.getFacade().isAConstraint(subject)) {
            return handleConstraint(subject, feature);
        }

        if (Model.getFacade().isADependency(subject)) {
            return handleDependency(subject, feature);
        }

        if (Model.getFacade().isAElementResidence(subject)) {
            return handleElementResidence(subject, feature);
        }

        if (Model.getFacade().isAEnumeration(subject)) {
            return handleEnumeration(subject, feature);
        }

        if (Model.getFacade().isAEnumerationLiteral(subject)) {
            return handleEnumerationLiteral(subject, feature);
        }

        if (Model.getFacade().isAFeature(subject)) {
            return handleFeature(subject, feature);
        }

        if (Model.getFacade().isAGeneralizableElement(subject)) {
            return handleGeneralizableElement(subject, feature);
        }

        if (Model.getFacade().isAGeneralization(subject)) {
            return handleGeneralization(subject, feature);
        }

        if (Model.getFacade().isAMethod(subject)) {
            return handleMethod(subject, feature);
        }

        if (Model.getFacade().isAModelElement(subject)) {
            return handleModelElement(subject, feature);
        }

        if (Model.getFacade().isANamespace(subject)) {
            return handleNamespace(subject, feature);
        }

        if (Model.getFacade().isANode(subject)) {
            return handleNode(subject, feature);
        }

        if (Model.getFacade().isAOperation(subject)) {
            return handleOperation(subject, feature);
        }

        if (Model.getFacade().isAParameter(subject)) {
            return handleParameter(subject, feature);
        }

        if (Model.getFacade().isAStructuralFeature(subject)) {
            return handleStructuralFeature(subject, feature);
        }

        if (Model.getFacade().isATemplateArgument(subject)) {
            return handleTemplateArgument(subject, feature);
        }

        if (Model.getFacade().isATemplateParameter(subject)) {
            return handleTemplateParameter(subject, feature);
        }

        if (Model.getFacade().isAUseCase(subject)) {
            return handleUseCase(subject, feature);
        }

        if (Model.getFacade().isAAssociationClass(subject)) {
            return handleAssociationClass(subject, feature);
        }

        if (Model.getFacade().isAStereotype(subject)) {
            return handleStereotype(subject, feature);
        }

        if (Model.getFacade().isATagDefinition(subject)) {
            return handleTagDefinition(subject, feature);
        }

        if (Model.getFacade().isATaggedValue(subject)) {
            return handleTaggedValue(subject, feature);
        }

        return null;
    }

    /* Handle Association */
    private Object handleAssociation(Object subject, String feature) {
        if ("connection".equals(feature)) {
            return new ArrayList<Object>(Model.getFacade().getConnections(subject));
        }

        if ("allConnections".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getConnections(subject));
        }

        return null;
    }

    /* Handle AssociationEnd */
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

    /* Handle Attribute */
    private Object handleAttribute(Object subject, String feature) {
        if ("initialValue".equals(feature)) {
            return Model.getFacade().getInitialValue(subject);
        }

        if ("associationEnd".equals(feature)) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        }

        return null;
    }

    /* Handle BehavioralFeature */
    private Object handleBehavioralFeature(Object subject, String feature) {
        if ("isQuery".equals(feature)) {
            return Model.getFacade().isQuery(subject);
        }

        if ("parameter".equals(feature)) {
            return new ArrayList<Object>(Model.getFacade().getParameters(subject));
        }

        return null;
    }

    /* Handle Binding */
    private Object handleBinding(Object subject, String feature) {
        if ("argument".equals(feature)) {
            return Model.getFacade().getArguments(subject);
        }

        return null;
    }

    /* Handle Class */
    private Object handleClass(Object subject, String feature) {
        if ("isActive".equals(feature)) {
            return Model.getFacade().isActive(subject);
        }

        return null;
    }

    /* Handle Classifier */
    private Object handleClassifier(Object subject, String feature) {
        if ("feature".equals(feature)) {
            return new ArrayList<Object>(Model.getFacade().getFeatures(subject));
        }

        if ("association".equals(feature)) {
            return new ArrayList<Object>(Model.getFacade().getAssociationEnds(subject));
        }

        if ("powertypeRange".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getPowertypeRanges(subject));
        }

        return handleClassifierAdditionalOperations(subject, feature);
    }

    private Object handleClassifierAdditionalOperations(Object subject, String feature) {
        if ("allFeatures".equals(feature)) {
            return internalOcl(subject, vt, "self.feature->union("
                    + "self.parent.oclAsType(Classifier).allFeatures)");
        }

        if ("allOperations".equals(feature)) {
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Operation))");
        }

        if ("allMethods".equals(feature)) {
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Method))");
        }

        if ("allAttributes".equals(feature)) {
            return internalOcl(subject, vt, "self.allFeatures->"
                    + "select(f | f.oclIsKindOf(Attribute))");
        }

        if ("associations".equals(feature)) {
            return internalOcl(subject, vt, "self.association.association->asSet()");
        }

        if ("allAssociations".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.associations->union("
                    + "self.parent.oclAsType(Classifier).allAssociations)");
        }

        if ("oppositeAssociationEnds".equals(feature)) {
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

        if ("allOppositeAssociationEnds".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.oppositeAssociationEnds->"
                    + "union(self.parent.allOppositeAssociationEnds )");
        }

        if ("specification".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.clientDependency->"
                    + "select(d |"
                    + "d.oclIsKindOf(Abstraction)"
                    + "and d.stereotype.name = \"realization\" "
                    + "and d.supplier.oclIsKindOf(Classifier))"
                    + ".supplier.oclAsType(Classifier)");
        }

        if ("allContents".equals(feature)) {
            return internalOcl(subject, vt,
                "self.contents->union("
                + "self.parent.allContents->select(e |"
                + "e.elementOwnership.visibility = #public or true or "
                + " e.elementOwnership.visibility = #protected))");
        }

        if ("allDiscriminators".equals(feature)) {
            return internalOcl(subject, vt,
                "self.generalization.discriminator->"
                + "union(self.parent.oclAsType(Classifier)."
                + "allDiscriminators)");
        }

        return null;
    }

    /* Handle Comment */
    private Object handleComment(Object subject, String feature) {
        if ("body".equals(feature)) {
            return Model.getFacade().getBody(subject);
        }

        if ("annotatedElement".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getAnnotatedElements(subject));
        }

        return null;
    }

    /* Handle Component */
    private Object handleComponent(Object subject, String feature) {
        if ("deploymentLocation".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getDeploymentLocations(subject));
        }

        if ("resident".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getResidents(subject));
        }

        if ("allResidentElements".equals(feature)) {
            return internalOcl(subject, vt,
                "self.resident->union("
                + "self.parent.oclAsType(Component)."
                + "allResidentElements->select( re |"
                + "re.elementResidence.visibility = #public or "
                + "re.elementResidence.visibility = #protected))");
        }

        return null;
    }

    /* Handle Constraint */
    private Object handleConstraint(Object subject, String feature) {
        if ("body".equals(feature)) {
            return Model.getFacade().getBody(subject);
        }

        if ("constrainedElement".equals(feature)) {
            return Model.getFacade().getConstrainedElements(subject);
        }

        return null;
    }

    /* Handle Dependency */
    private Object handleDependency(Object subject, String feature) {
        if ("client".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getClients(subject));
        }

        if ("supplier".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getSuppliers(subject));
        }

        return null;
    }

    /* Handle ElementResidence */
    private Object handleElementResidence(Object subject, String feature) {
        if ("visibility".equals(feature)) {
            return Model.getFacade().getVisibility(subject);
        }

        return null;
    }

    /* Handle Enumeration */
    private Object handleEnumeration(Object subject, String feature) {
        if ("literal".equals(feature)) {
            return Model.getFacade().getEnumerationLiterals(subject);
        }

        return null;
    }

    /* Handle EnumerationLiteral */
    private Object handleEnumerationLiteral(Object subject, String feature) {
        if ("enumeration".equals(feature)) {
            return Model.getFacade().getEnumeration(subject);
        }

        return null;
    }

    /* Handle Feature */
    private Object handleFeature(Object subject, String feature) {
        if ("ownerScope".equals(feature)) {
            return Model.getFacade().isStatic(subject);
        }

        if ("visibility".equals(feature)) {
            return Model.getFacade().getVisibility(subject);
        }

        if ("owner".equals(feature)) {
            return Model.getFacade().getOwner(subject);
        }

        return null;
    }

    /* Handle GeneralizableElement */
    private Object handleGeneralizableElement(Object subject, String feature) {
        if ("isAbstract".equals(feature)) {
            return Model.getFacade().isAbstract(subject);
        }

        if ("isLeaf".equals(feature)) {
            return Model.getFacade().isLeaf(subject);
        }

        if ("isRoot".equals(feature)) {
            return Model.getFacade().isRoot(subject);
        }

        if ("generalization".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getGeneralizations(subject));
        }

        if ("specialization".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getSpecializations(subject));
        }

        if ("parent".equals(feature)) {
            return internalOcl(subject, vt, "self.generalization.parent");
        }

        if ("allParents".equals(feature)) {
            return internalOcl(subject, vt, "self.parent->union(self.parent.allParents)");
        }

        return null;
    }

    /* Handle Generalization */
    private Object handleGeneralization(Object subject, String feature) {
        if ("discriminator".equals(feature)) {
            return Model.getFacade().getDiscriminator(subject);
        }

        if ("child".equals(feature)) {
            return Model.getFacade().getSpecific(subject);
        }

        if ("parent".equals(feature)) {
            return Model.getFacade().getGeneral(subject);
        }

        if ("powertype".equals(feature)) {
            return Model.getFacade().getPowertype(subject);
        }

        if ("specialization".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getSpecializations(subject));
        }

        return null;
    }

    /* Handle Method */
    private Object handleMethod(Object subject, String feature) {
        if ("body".equals(feature)) {
            return Model.getFacade().getBody(subject);
        }

        if ("specification".equals(feature)) {
            return Model.getFacade().getSpecification(subject);
        }

        return null;
    }

    /* Handle ModelElement */
    private Object handleModelElement(Object subject, String feature) {
        if ("name".equals(feature)) {
            String name = Model.getFacade().getName(subject);
            return name != null ? name : "";
        }

        if ("clientDependency".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getClientDependencies(subject));
        }

        if ("constraint".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getConstraints(subject));
        }

        if ("namespace".equals(feature)) {
            return Model.getFacade().getNamespace(subject);
        }

        if ("supplierDependency".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getSupplierDependencies(subject));
        }

        if ("templateParameter".equals(feature)) {
            return Model.getFacade().getTemplateParameters(subject);
        }

        if ("stereotype".equals(feature)) {
            return Model.getFacade().getStereotypes(subject);
        }

        if ("taggedValue".equals(feature)) {
            return Model.getFacade().getTaggedValuesCollection(subject);
        }

        if ("supplier".equals(feature)) {
            return internalOcl(subject, vt, "self.clientDependency.supplier");
        }

        if ("allSuppliers".equals(feature)) {
            return internalOcl(subject, vt, "self.supplier->union(self.supplier.allSuppliers)");
        }

        if ("model".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)->"
                    + "select( ns| ns.oclIsKindOf (Model))");
        }

        if ("isTemplate".equals(feature)) {
            return !Model.getFacade().getTemplateParameters(subject).isEmpty();
        }

        if ("isInstantiated".equals(feature)) {
            return internalOcl(subject, vt, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))->notEmpty");
        }

        if ("templateArgument".equals(feature)) {
            return internalOcl(subject, vt, "self.clientDependency->"
                    + "select(oclIsKindOf(Binding))."
                    + "oclAsType(Binding).argument");
        }

        return null;
    }

    /* Handle Namespace */
    private Object handleNamespace(Object subject, String feature) {
        if ("ownedElement".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getOwnedElements(subject));
        }

        if ("contents".equals(feature)) {
            return internalOcl(subject, vt, "self.ownedElement->"
                    + "union(self.ownedElement->"
                    + "select(x|x.oclIsKindOf(Namespace)).contents)");
        }

        if ("allContents".equals(feature)) {
            return internalOcl(subject, vt, "self.contents");
        }

        if ("allVisibleElements".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.allContents ->"
                    + "select(e |e.elementOwnership.visibility = #public)");
        }

        if ("allSurroundingNamespaces".equals(feature)) {
            return internalOcl(subject, vt, "self.namespace->"
                    + "union(self.namespace.allSurroundingNamespaces)");
        }

        return null;
    }

    /* Handle Node */
    private Object handleNode(Object subject, String feature) {
        if ("deployedComponent".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getDeployedComponents(subject));
        }

        return null;
    }

    /* Handle Operation */
    private Object handleOperation(Object subject, String feature) {
        if ("concurrency".equals(feature)) {
            return Model.getFacade().getConcurrency(subject);
        }

        if ("isAbstract".equals(feature)) {
            return Model.getFacade().isAbstract(subject);
        }

        if ("isLeaf".equals(feature)) {
            return Model.getFacade().isLeaf(subject);
        }

        if ("isRoot".equals(feature)) {
            return Model.getFacade().isRoot(subject);
        }

        return null;
    }

    /* Handle Parameter */
    private Object handleParameter(Object subject, String feature) {
        if ("defaultValue".equals(feature)) {
            return Model.getFacade().getDefaultValue(subject);
        }

        if ("kind".equals(feature)) {
            return Model.getFacade().getKind(subject);
        }

        return null;
    }

    /* Handle StructuralFeature */
    private Object handleStructuralFeature(Object subject, String feature) {
        if ("changeability".equals(feature)) {
            return Model.getFacade().getChangeability(subject);
        }

        if ("multiplicity".equals(feature)) {
            return Model.getFacade().getMultiplicity(subject);
        }

        if ("ordering".equals(feature)) {
            return Model.getFacade().getOrdering(subject);
        }

        if ("targetScope".equals(feature)) {
            return Model.getFacade().getTargetScope(subject);
        }

        if ("type".equals(feature)) {
            return Model.getFacade().getType(subject);
        }

        return null;
    }

    /* Handle TemplateArgument */
    private Object handleTemplateArgument(Object subject, String feature) {
        if ("binding".equals(feature)) {
            return Model.getFacade().getBinding(subject);
        }

        if ("modelElement".equals(feature)) {
            return Model.getFacade().getModelElement(subject);
        }

        return null;
    }

    /* Handle TemplateParameter */
    private Object handleTemplateParameter(Object subject, String feature) {
        if ("defaultElement".equals(feature)) {
            return Model.getFacade().getDefaultElement(subject);
        }

        return null;
    }

    /* Handle UseCase */
    private Object handleUseCase(Object subject, String feature) {
        if ("specificationPath".equals(feature)) {
            return Model.getUseCasesHelper().getSpecificationPath(subject);
        }

        if ("allExtensionPoints".equals(feature)) {
            Collection c = Model.getCoreHelper().getAllSupertypes(subject);
            Collection result = new ArrayList(Model.getFacade().getExtensionPoints(subject));
            for (Object uc : c) {
                result.addAll(Model.getFacade().getExtensionPoints(uc));
            }
            return result;
        }

        return null;
    }

    /* Handle AssociationClass */
    private Object handleAssociationClass(Object subject, String feature) {
        if ("allConnections".equals(feature)) {
            return internalOcl(subject, vt,
                    "self.connection->union(self.parent->select("
                    + "s | s.oclIsKindOf(Association))->collect("
                    + "a : Association | a.allConnections))->asSet()");
        }

        return null;
    }

    /* Handle Stereotype */
    private Object handleStereotype(Object subject, String feature) {
        if ("baseClass".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getBaseClasses(subject));
        }

        if ("extendedElement".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getExtendedElements(subject));
        }

        if ("definedTag".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getTagDefinitions(subject));
        }

        return null;
    }

    /* Handle TagDefinition */
    private Object handleTagDefinition(Object subject, String feature) {
        if ("multiplicity".equals(feature)) {
            return Model.getFacade().getMultiplicity(subject);
        }

        if ("tagType".equals(feature)) {
            return Model.getFacade().getType(subject);
        }

        if ("typedValue".equals(feature)) {
            return new HashSet<Object>(Model.getFacade().getTypedValues(subject));
        }

        if ("owner".equals(feature)) {
            return Model.getFacade().getOwner(subject);
        }

        return null;
    }

    /* Handle TaggedValue */
    private Object handleTaggedValue(Object subject, String feature) {
        if ("dataValue".equals(feature)) {
            return Model.getFacade().getDataValue(subject);
        }

        if ("type".equals(feature)) {
            return Model.getFacade().getType(subject);
        }

        if ("referenceValue".equals(feature)) {
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