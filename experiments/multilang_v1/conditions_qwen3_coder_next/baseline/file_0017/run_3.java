``java
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

        if (!type.equals(".")) {
            return null;
        }

        Object result = processAssociation(subject, feature);
        if (result != null) return result;

        result = processAssociationEnd(subject, feature);
        if (result != null) return result;

        result = processAttribute(subject, feature);
        if (result != null) return result;

        result = processBehavioralFeature(subject, feature);
        if (result != null) return result;

        result = processBinding(subject, feature);
        if (result != null) return result;

        result = processClass(subject, feature);
        if (result != null) return result;

        result = processClassifier(subject, vt, feature);
        if (result != null) return result;

        result = processComment(subject, feature);
        if (result != null) return result;

        result = processComponent(subject, vt, feature);
        if (result != null) return result;

        result = processConstraint(subject, feature);
        if (result != null) return result;

        result = processDependency(subject, feature);
        if (result != null) return result;

        result = processElementResidence(subject, feature);
        if (result != null) return result;

        result = processEnumeration(subject, feature);
        if (result != null) return result;

        result = processEnumerationLiteral(subject, feature);
        if (result != null) return result;

        result = processFeature(subject, feature);
        if (result != null) return result;

        result = processGeneralizableElement(subject, vt, feature);
        if (result != null) return result;

        result = processGeneralization(subject, feature);
        if (result != null) return result;

        result = processMethod(subject, feature);
        if (result != null) return result;

        result = processModelElement(subject, vt, feature);
        if (result != null) return result;

        result = processNamespace(subject, vt, feature);
        if (result != null) return result;

        result = processNode(subject, feature);
        if (result != null) return result;

        result = processOperation(subject, feature);
        if (result != null) return result;

        result = processParameter(subject, feature);
        if (result != null) return result;

        result = processStructuralFeature(subject, feature);
        if (result != null) return result;

        result = processTemplateArgument(subject, feature);
        if (result != null) return result;

        result = processTemplateParameter(subject, feature);
        if (result != null) return result;

        result = processUseCase(subject, feature);
        if (result != null) return result;

        result = processAssociationClass(subject, vt, feature);
        if (result != null) return result;

        result = processStereotype(subject, feature);
        if (result != null) return result;

        result = processTagDefinition(subject, feature);
        if (result != null) return result;

        result = processTaggedValue(subject, feature);
        if (result != null) return result;

        return null;
    }

    private Object processAssociation(Object subject, String feature) {
        if (!Model.getFacade().isAAssociation(subject)) return null;
        switch (feature) {
            case "connection":
                return new ArrayList<>(Model.getFacade().getConnections(subject));
            case "allConnections":
                return new HashSet<>(Model.getFacade().getConnections(subject));
            default:
                return null;
        }
    }

    private Object processAssociationEnd(Object subject, String feature) {
        if (!Model.getFacade().isAAssociationEnd(subject)) return null;
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

    private Object processAttribute(Object subject, String feature) {
        if (!Model.getFacade().isAAttribute(subject)) return null;
        switch (feature) {
            case "initialValue":
                return Model.getFacade().getInitialValue(subject);
            case "associationEnd":
                return new ArrayList<>(Model.getFacade().getAssociationEnds(subject));
            default:
                return null;
        }
    }

    private Object processBehavioralFeature(Object subject, String feature) {
        if (!Model.getFacade().isABehavioralFeature(subject)) return null;
        switch (feature) {
            case "isQuery":
                return Model.getFacade().isQuery(subject);
            case "parameter":
                return new ArrayList<>(Model.getFacade().getParameters(subject));
            default:
                return null;
        }
    }

    private Object processBinding(Object subject, String feature) {
        if (!Model.getFacade().isABinding(subject)) return null;
        switch (feature) {
            case "argument":
                return Model.getFacade().getArguments(subject);
            default:
                return null;
        }
    }

    private Object processClass(Object subject, String feature) {
        if (!Model.getFacade().isAClass(subject)) return null;
        switch (feature) {
            case "isActive":
                return Model.getFacade().isActive(subject);
            default:
                return null;
        }
    }

    private Object processClassifier(Object subject, Map<String, Object> vt, String feature) {
        if (!Model.getFacade().isAClassifier(subject)) return null;
        switch (feature) {
            case "feature":
                return new ArrayList<>(Model.getFacade().getFeatures(subject));
            case "association":
                return new ArrayList<>(Model.getFacade().getAssociationEnds(subject));
            case "powertypeRange":
                return new HashSet<>(Model.getFacade().getPowertypeRanges(subject));
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
                        + "union(self.parent.allOppositeAssociationEnds)");
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

    private Object processComment(Object subject, String feature) {
        if (!Model.getFacade().isAComment(subject)) return null;
        switch (feature) {
            case "body":
                return Model.getFacade().getBody(subject);
            case "annotatedElement":
                return new HashSet<>(Model.getFacade().getAnnotatedElements(subject));
            default:
                return null;
        }
    }

    private Object processComponent(Object subject, Map<String, Object> vt, String feature) {
        if (!Model.getFacade().isAComponent(subject)) return null;
        switch (feature) {
            case "deploymentLocation":
                return new HashSet<>(Model.getFacade().getDeploymentLocations(subject));
            case "resident":
                return new HashSet<>(Model.getFacade().getResidents(subject));
            case "allResidentElements":
                return internalOcl(subject, vt,
                        "self.resident->union("
                        + "self.parent.oclAsType(Component)."
                        + "allResidentElements->select( re |"
                        + "re.elementResidence.visibility = #public or "
                        + "re.elementResidence.visibility = #protected))");
            default:
                return null;
        }
    }

    private Object processConstraint(Object subject, String feature) {
        if (!Model.getFacade().isAConstraint(subject)) return null;
        switch (feature) {
            case "body":
                return Model.getFacade().getBody(subject);
            case "constrainedElement":
                return Model.getFacade().getConstrainedElements(subject);
            default:
                return null;
        }
    }

    private Object processDependency(Object subject, String feature) {
        if (!Model.getFacade().isADependency(subject)) return null;
        switch (feature) {
            case "client":
                return new HashSet<>(Model.getFacade().getClients(subject));
            case "supplier":
                return new HashSet<>(Model.getFacade().getSuppliers(subject));
            default:
                return null;
        }
    }

    private Object processElementResidence(Object subject, String feature) {
        if (!Model.getFacade().isAElementResidence(subject)) return null;
        switch (feature) {
            case "visibility":
                return Model.getFacade().getVisibility(subject);
            default:
                return null;
        }
    }

    private Object processEnumeration(Object subject, String feature) {
        if (!Model.getFacade().isAEnumeration(subject)) return null;
        switch (feature) {
            case "literal":
                return Model.getFacade().getEnumerationLiterals(subject);
            default:
                return null;
        }
    }

    private Object processEnumerationLiteral(Object subject, String feature) {
        if (!Model.getFacade().isAEnumerationLiteral(subject)) return null;
        switch (feature) {
            case "enumeration":
                return Model.getFacade().getEnumeration(subject);
            default:
                return null;
        }
    }

    private Object processFeature(Object subject, String feature) {
        if (!Model.getFacade().isAFeature(subject)) return null;
        switch (feature) {
            case "ownerScope":
                return Model.getFacade().isStatic(subject);
            case "visibility":
                return Model.getFacade().getVisibility(subject);
            case "owner":
                return Model.getFacade().getOwner(subject);
            default:
                return null;
        }
    }

    private Object processGeneralizableElement(Object subject, Map<String, Object> vt, String feature) {
        if (!Model.getFacade().isAGeneralizableElement(subject)) return null;
        switch (feature) {
            case "isAbstract":
                return Model.getFacade().isAbstract(subject);
            case "isLeaf":
                return Model.getFacade().isLeaf(subject);
            case "isRoot":
                return Model.getFacade().isRoot(subject);
            case "generalization":
                return new HashSet<>(Model.getFacade().getGeneralizations(subject));
            case "specialization":
                return new HashSet<>(Model.getFacade().getSpecializations(subject));
            case "parent":
                return internalOcl(subject, vt, "self.generalization.parent");
            case "allParents":
                return internalOcl(subject, vt, "self.parent->union(self.parent.allParents)");
            default:
                return null;
        }
    }

    private Object processGeneralization(Object subject, String feature) {
        if (!Model.getFacade().isAGeneralization(subject)) return null;
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
                return new HashSet<>(Model.getFacade().getSpecializations(subject));
            default:
                return null;
        }
    }

    private Object processMethod(Object subject, String feature) {
        if (!Model.getFacade().isAMethod(subject)) return null;
        switch (feature) {
            case "body":
                return Model.getFacade().getBody(subject);
            case "specification":
                return Model.getFacade().getSpecification(subject);
            default:
                return null;
        }
    }

    private Object processModelElement(Object subject, Map<String, Object> vt, String feature) {
        if (!Model.getFacade().isAModelElement(subject)) return null;
        switch (feature) {
            case "name":
                String name = Model.getFacade().getName(subject);
                return name == null ? "" : name;
            case "clientDependency":
                return new HashSet<>(Model.getFacade().getClientDependencies(subject));
            case "constraint":
                return new HashSet<>(Model.getFacade().getConstraints(subject));
            case "namespace":
                return Model.getFacade().getNamespace(subject);
            case "supplierDependency":
                return new HashSet<>(Model.getFacade().getSupplierDependencies(subject));
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
                return internalOcl(subject, vt, "self.namespace->"
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

    private Object processNamespace(Object subject, Map<String, Object> vt, String feature) {
        if (!Model.getFacade().isANamespace(subject)) return null;
        switch (feature) {
            case "ownedElement":
                return new HashSet<>(Model.getFacade().getOwnedElements(subject));
            case "contents":
                return internalOcl(subject, vt, "self.ownedElement->"
                        + "union(self.ownedElement->"
                        + "select(x|x.oclIsKindOf(Namespace)).contents)");
            case "allContents":
                return internalOcl(subject, vt, "self.contents");
            case "allVisibleElements":
                return internalOcl(subject, vt,
                        "self.allContents ->"
                        + "select(e |e.elementOwnership.visibility = #public)");
            case "allSurroundingNamespaces":
                return internalOcl(subject, vt, "self.namespace->"
                        + "union(self.namespace.allSurroundingNamespaces)");
            default:
                return null;
        }
    }

    private Object processNode(Object subject, String feature) {
        if (!Model.getFacade().isANode(subject)) return null;
        switch (feature) {
            case "deployedComponent":
                return new HashSet<>(Model.getFacade().getDeployedComponents(subject));
            default:
                return null;
        }
    }

    private Object processOperation(Object subject, String feature) {
        if (!Model.getFacade().isAOperation(subject)) return null;
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

    private Object processParameter(Object subject, String feature) {
        if (!Model.getFacade().isAParameter(subject)) return null;
        switch (feature) {
            case "defaultValue":
                return Model.getFacade().getDefaultValue(subject);
            case "kind":
                return Model.getFacade().getKind(subject);
            default:
                return null;
        }
    }

    private Object processStructuralFeature(Object subject, String feature) {
        if (!Model.getFacade().isAStructuralFeature(subject)) return null;
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

    private Object processTemplateArgument(Object subject, String feature) {
        if (!Model.getFacade().isATemplateArgument(subject)) return null;
        switch (feature) {
            case "binding":
                return Model.getFacade().getBinding(subject);
            case "modelElement":
                return Model.getFacade().getModelElement(subject);
            default:
                return null;
        }
    }

    private Object processTemplateParameter(Object subject, String feature) {
        if (!Model.getFacade().isATemplateParameter(subject)) return null;
        switch (feature) {
            case "defaultElement":
                return Model.getFacade().getDefaultElement(subject);
            default:
                return null;
        }
    }

    private Object processUseCase(Object subject, String feature) {
        if (!Model.getFacade().isAUseCase(subject)) return null;
        switch (feature) {
            case "specificationPath":
                return Model.getUseCasesHelper().getSpecificationPath(subject);
            case "allExtensionPoints":
                Collection c = Model.getCoreHelper().getAllSupertypes(subject);
                Collection result = new ArrayList<>(Model.getFacade().getExtensionPoints(subject));
                for (Object uc : c) {
                    result.addAll(Model.getFacade().getExtensionPoints(uc));
                }
                return result;
            default:
                return null;
        }
    }

    private Object processAssociationClass(Object subject, Map<String, Object> vt, String feature) {
        if (!Model.getFacade().isAAssociationClass(subject)) return null;
        switch (feature) {
            case "allConnections":
                return internalOcl(subject, vt,
                        "self.connection->union(self.parent->select("
                        + "s | s.oclIsKindOf(Association))->collect("
                        + "a : Association | a.allConnections))->asSet()");
            default:
                return null;
        }
    }

    private Object processStereotype(Object subject, String feature) {
        if (!Model.getFacade().isAStereotype(subject)) return null;
        switch (feature) {
            case "baseClass":
                return new HashSet<>(Model.getFacade().getBaseClasses(subject));
            case "extendedElement":
                return new HashSet<>(Model.getFacade().getExtendedElements(subject));
            case "definedTag":
                return new HashSet<>(Model.getFacade().getTagDefinitions(subject));
            default:
                return null;
        }
    }

    private Object processTagDefinition(Object subject, String feature) {
        if (!Model.getFacade().isATagDefinition(subject)) return null;
        switch (feature) {
            case "multiplicity":
                return Model.getFacade().getMultiplicity(subject);
            case "tagType":
                return Model.getFacade().getType(subject);
            case "typedValue":
                return new HashSet<>(Model.getFacade().getTypedValues(subject));
            case "owner":
                return Model.getFacade().getOwner(subject);
            default:
                return null;
        }
    }

    private Object processTaggedValue(Object subject, String feature) {
        if (!Model.getFacade().isATaggedValue(subject)) return null;
        switch (feature) {
            case "dataValue":
                return Model.getFacade().getDataValue(subject);
            case "type":
                return Model.getFacade().getType(subject);
            case "referenceValue":
                return new HashSet<>(Model.getFacade().getReferenceValue(subject));
            default:
                return null;
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
```