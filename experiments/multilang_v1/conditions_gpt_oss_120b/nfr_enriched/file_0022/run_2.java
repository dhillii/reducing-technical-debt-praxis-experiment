package org.argouml.model.euml;

import java.util.List;

import org.argouml.model.AbstractModelFactory;
import org.argouml.model.CoreFactory;
import org.argouml.model.NotImplementedException;
import org.eclipse.emf.edit.domain.EditingDomain;
import org.eclipse.uml2.uml.Abstraction;
import org.eclipse.uml2.uml.AggregationKind;
import org.eclipse.uml2.uml.Artifact;
import org.eclipse.uml2.uml.Association;
import org.eclipse.uml2.uml.AssociationClass;
import org.eclipse.uml2.uml.BehavioralFeature;
import org.eclipse.uml2.uml.BehavioredClassifier;
import org.eclipse.uml2.uml.Classifier;
import org.eclipse.uml2.uml.Comment;
import org.eclipse.uml2.uml.Component;
import org.eclipse.uml2.uml.ComponentRealization;
import org.eclipse.uml2.uml.Constraint;
import org.eclipse.uml2.uml.DataType;
import org.eclipse.uml2.uml.Dependency;
import org.eclipse.uml2.uml.Element;
import org.eclipse.uml2.uml.Enumeration;
import org.eclipse.uml2.uml.EnumerationLiteral;
import org.eclipse.uml2.uml.Generalization;
import org.eclipse.uml2.uml.Interface;
import org.eclipse.uml2.uml.InterfaceRealization;
import org.eclipse.uml2.uml.Manifestation;
import org.eclipse.uml2.uml.MultiplicityElement;
import org.eclipse.uml2.uml.NamedElement;
import org.eclipse.uml2.uml.Namespace;
import org.eclipse.uml2.uml.Node;
import org.eclipse.uml2.uml.OpaqueBehavior;
import org.eclipse.uml2.uml.Operation;
import org.eclipse.uml2.uml.PackageImport;
import org.eclipse.uml2.uml.PackageableElement;
import org.eclipse.uml2.uml.Parameter;
import org.eclipse.uml2.uml.PrimitiveType;
import org.eclipse.uml2.uml.Property;
import org.eclipse.uml2.uml.Stereotype;
import org.eclipse.uml2.uml.TemplateBinding;
import org.eclipse.uml2.uml.TemplateParameter;
import org.eclipse.uml2.uml.TemplateParameterSubstitution;
import org.eclipse.uml2.uml.TemplateSignature;
import org.eclipse.uml2.uml.TemplateableElement;
import org.eclipse.uml2.uml.Type;
import org.eclipse.uml2.uml.UMLFactory;
import org.eclipse.uml2.uml.Usage;
import org.eclipse.uml2.uml.ValueSpecification;
import org.eclipse.uml2.uml.VisibilityKind;

/**
 * The implementation of the CoreFactory for EUML2.
 */
class CoreFactoryEUMLImpl implements CoreFactory, AbstractModelFactory {

    private final EUMLModelImplementation modelImpl;
    private final EditingDomain editingDomain;

    public CoreFactoryEUMLImpl(EUMLModelImplementation implementation) {
        modelImpl = implementation;
        editingDomain = implementation.getEditingDomain();
    }

    // ... other methods unchanged ...

    private Property buildAssociationEndInternal(final Association assoc,
            final String name, final Type type,
            final Integer[] multi, final Stereotype stereo,
            final Boolean navigable, final Boolean order,
            final AggregationKind aggregation,
            final Object changeable, final VisibilityKind visibility) {
        Property property = createAssociationEnd();
        property.setType(type);
        property.setAssociation(assoc);
        if (name != null) {
            property.setName(name);
        }
        setNavigable(property, assoc, navigable);
        setAggregation(property, aggregation);
        setVisibility(property, visibility);
        setMultiplicity(property, multi);
        setOrdered(property, order);
        setReadOnly(property, changeable);
        applyStereotypeIfApplicable(property, stereo);
        return property;
    }

    /** Sets navigability and ownership for a non‑navigable end. */
    private void setNavigable(Property property, Association assoc,
            Boolean navigable) {
        if (navigable != null) {
            property.setIsNavigable(navigable);
            if (!navigable) {
                assoc.getOwnedEnds().add(property);
            }
        }
    }

    /** Sets aggregation kind if provided. */
    private void setAggregation(Property property, AggregationKind aggregation) {
        if (aggregation != null) {
            property.setAggregation(aggregation);
        }
    }

    /** Sets visibility if provided. */
    private void setVisibility(Property property, VisibilityKind visibility) {
        if (visibility != null) {
            property.setVisibility(visibility);
        }
    }

    /** Sets lower and upper bounds if multiplicity array is provided. */
    private void setMultiplicity(Property property, Integer[] multi) {
        if (multi != null) {
            if (multi[0] != null) {
                property.setLower(multi[0]);
            }
            if (multi[1] != null) {
                property.setUpper(multi[1]);
            }
        }
    }

    /** Sets ordering flag if provided. */
    private void setOrdered(Property property, Boolean order) {
        if (order != null) {
            property.setIsOrdered(order);
        }
    }

    /** Sets read‑only flag if provided. */
    private void setReadOnly(Property property, Object changeable) {
        if (changeable != null) {
            property.setIsReadOnly((Boolean) changeable);
        }
    }

    /** Applies the stereotype when applicable. */
    private void applyStereotypeIfApplicable(Property property, Stereotype stereo) {
        if (stereo != null && property.isStereotypeApplicable(stereo)) {
            property.applyStereotype(stereo);
        }
    }

    // ... remaining methods unchanged ...

}