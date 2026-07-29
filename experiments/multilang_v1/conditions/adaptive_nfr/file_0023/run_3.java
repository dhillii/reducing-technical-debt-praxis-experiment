package org.argouml.model.mdr;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.jmi.reflect.InvalidObjectException;

import org.argouml.model.CollaborationsHelper;
import org.argouml.model.CoreHelper;
import org.argouml.model.InvalidElementException;
import org.argouml.model.Model;
import org.argouml.model.ModelManagementHelper;
import org.omg.uml.behavioralelements.collaborations.AssociationEndRole;
import org.omg.uml.behavioralelements.collaborations.AssociationRole;
import org.omg.uml.behavioralelements.collaborations.ClassifierRole;
import org.omg.uml.behavioralelements.collaborations.Collaboration;
import org.omg.uml.behavioralelements.collaborations.Interaction;
import org.omg.uml.behavioralelements.collaborations.Message;
import org.omg.uml.behavioralelements.commonbehavior.Action;
import org.omg.uml.behavioralelements.commonbehavior.Instance;
import org.omg.uml.behavioralelements.commonbehavior.Stimulus;
import org.omg.uml.foundation.core.AssociationEnd;
import org.omg.uml.foundation.core.Classifier;
import org.omg.uml.foundation.core.Feature;
import org.omg.uml.foundation.core.ModelElement;
import org.omg.uml.foundation.core.Namespace;
import org.omg.uml.foundation.core.Operation;
import org.omg.uml.foundation.core.UmlAssociation;
import org.omg.uml.modelmanagement.UmlPackage;

/**
 * Helper class for UML BehavioralElements::Collaborations Package.
 * <p>
 * @since ARGO0.19.5
 * @author Ludovic Ma&icirc;tre
 * @author Tom Morris
 * Derived from NSUML implementation by:
 * @author Thierry Lach
 */
class CollaborationsHelperMDRImpl implements CollaborationsHelper {

    /**
     * The model implementation.
     */
    private MDRModelImplementation modelImpl;

    private static final Logger LOG =
        Logger.getLogger(CollaborationsHelperMDRImpl.class.getName());

    /**
     * Constructor.
     *
     * @param implementation
     *            To get other helpers and factories.
     */
    CollaborationsHelperMDRImpl(MDRModelImplementation implementation) {
        modelImpl = implementation;
    }


    public Collection<ClassifierRole> getAllClassifierRoles(Object ns) {
        if (!(ns instanceof Namespace)) {
            throw new IllegalArgumentException();
        }

        try {
            List<ClassifierRole> list = new ArrayList<ClassifierRole>();
            for (Object o : ((Namespace) ns).getOwnedElement()) {
                if (o instanceof Namespace) {
                    list.addAll(getAllClassifierRoles(o));
                }
                if (o instanceof ClassifierRole) {
                    list.add((ClassifierRole) o);
                }
            }
            return list;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public Collection getAllPossibleAssociationRoles(Object roleArg) {
        if (!(roleArg instanceof ClassifierRole)) {
            throw new IllegalArgumentException();
        }

        ClassifierRole role = (ClassifierRole) roleArg;

        try {
            if (role.getBase().isEmpty()) {
                return Collections.emptyList();
            }
            Set associations = new HashSet();
            for (Classifier base : role.getBase()) {
                associations.addAll(
                        modelImpl.getCoreHelper().getAssociations(base));
            }
            return associations;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public Collection<Classifier> getClassifierRoles(Object role) {
        if (role == null) {
            return Collections.emptySet();
        }

        if (!(role instanceof ClassifierRole)) {
            throw new IllegalArgumentException();
        }

        try {
            return getClassifierRolesInternal((ClassifierRole) role);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    /**
     * Internal method to collect classifier roles connected to the given role.
     *
     * @param role the classifier role to process
     * @return collection of connected classifier roles
     */
    private Collection<Classifier> getClassifierRolesInternal(ClassifierRole role) {
        List<Classifier> roles = new ArrayList<Classifier>();
        Collection<AssociationEnd> associationEnds =
            Model.getFacade().getAssociationEnds(role);
        
        if (associationEnds.isEmpty()) {
            return roles;
        }

        for (AssociationEnd end : associationEnds) {
            if (!(end instanceof AssociationEndRole)) {
                continue;
            }
            addConnectedRoles(roles, end, role);
        }
        return roles;
    }

    /**
     * Add connected classifier roles from the association.
     *
     * @param roles the collection to add to
     * @param end the association end role
     * @param currentRole the current classifier role
     */
    private void addConnectedRoles(List<Classifier> roles, AssociationEnd end,
            ClassifierRole currentRole) {
        UmlAssociation assoc = end.getAssociation();
        for (AssociationEnd end2 : assoc.getConnection()) {
            Classifier classifier = end2.getParticipant();
            if (isValidConnectedRole(classifier, currentRole)) {
                roles.add(classifier);
            }
        }
    }

    /**
     * Check if a classifier is a valid connected role.
     *
     * @param classifier the classifier to check
     * @param currentRole the current classifier role
     * @return true if valid connected role
     */
    private boolean isValidConnectedRole(Classifier classifier,
            ClassifierRole currentRole) {
        return classifier != currentRole && classifier instanceof ClassifierRole;
    }


    public Object getAssociationRole(Object afrom, Object ato) {
        if (afrom == null || ato == null) {
            throw new IllegalArgumentException();
        }
        ClassifierRole from = (ClassifierRole) afrom;
        ClassifierRole to = (ClassifierRole) ato;

        try {
            return findAssociationRole(from, to);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    /**
     * Find the association role between two classifier roles.
     *
     * @param from the source classifier role
     * @param to the target classifier role
     * @return the association role or null
     */
    private Object findAssociationRole(ClassifierRole from, ClassifierRole to) {
        Collection<AssociationEnd> ends =
            Model.getFacade().getAssociationEnds(from);
        for (AssociationEnd end : ends) {
            if (!(end instanceof AssociationEndRole)) {
                continue;
            }
            Object result = findAssociationInEnd(end, to);
            if (result != null) {
                return result;
            }
        }
        return null;
    }

    /**
     * Find association in the given association end.
     *
     * @param end the association end role
     * @param target the target classifier role
     * @return the association or null
     */
    private Object findAssociationInEnd(AssociationEnd end, ClassifierRole target) {
        UmlAssociation assoc = end.getAssociation();
        for (AssociationEnd end2 : assoc.getConnection()) {
            if (end2.getParticipant() == target) {
                return assoc;
            }
        }
        return null;
    }


    public Collection<Message> getAllPossibleActivators(Object ames) {
        Message mes = (Message) ames;
        if (mes == null || mes.getInteraction() == null) {
            return Collections.unmodifiableCollection(Collections.EMPTY_LIST);
        }

        try {
            return getAllPossibleActivatorsInternal(mes);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    /**
     * Internal method to get all possible activators for a message.
     *
     * @param mes the message
     * @return collection of possible activators
     */
    private Collection<Message> getAllPossibleActivatorsInternal(Message mes) {
        Interaction inter = mes.getInteraction();
        Collection<Message> predecessors = mes.getPredecessor();
        Collection<Message> allMessages = inter.getMessage();
        List<Message> list = new ArrayList<Message>();
        
        for (Message m : allMessages) {
            if (isValidActivator(m, mes, predecessors)) {
                list.add(m);
            }
        }
        return list;
    }

    /**
     * Check if a message is a valid activator.
     *
     * @param candidate the candidate message
     * @param mes the target message
     * @param predecessors the predecessors of the target message
     * @return true if valid activator
     */
    private boolean isValidActivator(Message candidate, Message mes,
            Collection<Message> predecessors) {
        if (predecessors.contains(candidate)) {
            return false;
        }
        if (mes == candidate) {
            return false;
        }
        if (hasAsActivator(candidate, mes)) {
            return false;
        }
        if (candidate.getPredecessor().contains(mes)) {
            return false;
        }
        return true;
    }


    public boolean hasAsActivator(Object message, Object activator) {
        if (!(message instanceof Message)) {
            throw new IllegalArgumentException();
        }
        if (!(activator instanceof Message)) {
            throw new IllegalArgumentException();
        }

        try {
            return hasAsActivatorInternal((Message) message, activator);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    /**
     * Internal method to check if a message has another as activator.
     *
     * @param message the message to check
     * @param activator the potential activator
     * @return true if activator is found
     */
    private boolean hasAsActivatorInternal(Message message, Object activator) {
        Message messActivator = message.getActivator();
        if (messActivator == null) {
            return false;
        }
        if (messActivator == activator) {
            return true;
        }
        if (messActivator.getPredecessor().contains(activator)) {
            return true;
        }
        return hasAsActivator(messActivator, activator);
    }


    public void setActivator(Object ames, Object anactivator) {
        if (ames == null) {
            throw new IllegalArgumentException("message is null");
        }
        if (!(ames instanceof Message)) {
            throw new IllegalArgumentException("message");
        }
        if (anactivator != null && !(anactivator instanceof Message)) {
            throw new IllegalArgumentException(
                    "An activator must be a message");
        }
        Message mes = (Message) ames;
        Message activator = (Message) anactivator;
        if (mes == activator) {
            throw new IllegalArgumentException("In setActivator: message may "
                    + "not be equal to activator");
        }

        if (activator != null) {
            validateActivatorInteraction(mes, activator);
            if (hasAsActivator(activator, mes)) {
                throw new IllegalArgumentException(
                        "In setActivator: message may "
                                + "not be the activator for "
                                + "the original activator");
            }
            if (mes.getPredecessor().contains(activator)) {
                mes.getPredecessor().remove(activator);
            }
        }
        
        updateActivators(mes, activator);
    }

    /**
     * Validate that activator is in the same interaction.
     *
     * @param mes the message
     * @param activator the activator message
     */
    private void validateActivatorInteraction(Message mes, Message activator) {
        if (mes.getInteraction() != activator.getInteraction()) {
            throw new IllegalArgumentException(
                    "In setActivator: interaction "
                            + "of message should equal "
                            + "interaction of activator");
        }
    }

    /**
     * Update activators for the message and related messages.
     *
     * @param mes the message
     * @param activator the new activator
     */
    private void updateActivators(Message mes, Message activator) {
        List<Message> listToChange = new ArrayList<Message>();
        Collection<Message> predecessors = mes.getPredecessor();
        listToChange.addAll(predecessors);
        listToChange.add(mes);
        
        Interaction inter = mes.getInteraction();
        for (Message mes2 : inter.getMessage()) {
            if (mes2.getPredecessor().contains(mes)) {
                listToChange.add(mes2);
            }
        }
        
        for (Message mes2 : listToChange) {
            mes2.setActivator(activator);
        }
    }


    public Collection<Message> getAllPossiblePredecessors(Object amessage) {
        Message message = (Message) amessage;
        if (message == null) {
            throw new IllegalArgumentException(
                    "In getAllPossiblePredecessors: "
                            + "argument message is null");
        }

        try {
            return getAllPossiblePredecessorsInternal(message);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    /**
     * Internal method to get all possible predecessors for a message.
     *
     * @param message the message
     * @return collection of possible predecessors
     */
    private Collection<Message> getAllPossiblePredecessorsInternal(Message message) {
        Interaction inter = message.getInteraction();
        List<Message> list = new ArrayList<Message>();
        
        for (Message mes : inter.getMessage()) {
            if (isValidPredecessor(mes, message)) {
                list.add(mes);
            }
        }
        return list;
    }

    /**
     * Check if a message is a valid predecessor.
     *
     * @param candidate the candidate message
     * @param message the target message
     * @return true if valid predecessor
     */
    private boolean isValidPredecessor(Message candidate, Message message) {
        if (candidate.getActivator() != message.getActivator()) {
            return false;
        }
        if (message == candidate) {
            return false;
        }
        if (candidate.getPredecessor().contains(message)) {
            return false;
        }
        if (message.getPredecessor().contains(message)) {
            return false;
        }
        return true;
    }


    public void addBase(Object arole, Object abase) {
        ClassifierRole role = (ClassifierRole) arole;
        Classifier base = (Classifier) abase;
        if (role == null || base == null) {
            throw new IllegalArgumentException("In addBase: either the role "
                    + "or the base is null");
        }
        role.getBase().add(base);
        if (modelImpl.getFacade().getBases(role).size() == 1) {
            role.getAvailableContents().clear();
            role.getAvailableContents().addAll(base.getOwnedElement());
            role.getAvailableFeature().clear();
            role.getAvailableFeature().addAll(base.getFeature());
        } else {
            for (ModelElement elem : base.getOwnedElement()) {
                if (!role.getAvailableContents().contains(elem)) {
                    role.getAvailableContents().add(elem);
                }
            }
            for (Feature feature : base.getFeature()) {
                if (!role.getAvailableFeature().contains(feature)) {
                    role.getAvailableFeature().add(feature);
                }
            }
        }
    }

    public void setBases(Object role, Collection bases) {
        if (role == null || bases == null) {
            throw new IllegalArgumentException("In setBases: either the role "
                    + "or the collection bases is " + "null");
        }
        CollectionHelper.update(((ClassifierRole) role).getBase(), bases);
    }


    public Collection<Feature> allAvailableFeatures(Object arole) {
        LOG.log(Level.INFO, "allAvailableFeatures start");

        if (arole instanceof ClassifierRole) {
            try {
                List<Feature> returnList = new ArrayList<Feature>();
                ClassifierRole role = (ClassifierRole) arole;
                for (ModelElement genElem
                        : CoreHelperMDRImpl.getAllParents(role)) {
                    if (genElem instanceof ClassifierRole) {
                        returnList.addAll(allAvailableFeatures(genElem));
                    }
                }
                for (Classifier classifier : role.getBase()) {
                    returnList.addAll(classifier.getFeature());
                }
                LOG.log(Level.INFO, "allAvailableFeatures {0}", returnList.size());
                return returnList;
            } catch (InvalidObjectException e) {
                throw new InvalidElementException(e);
            }
        }
        throw new IllegalArgumentException("Cannot get available features on "
                + arole);
    }


    public Collection allAvailableContents(Object arole) {
        LOG.log(Level.INFO, "allAvailableContents start");
        try {
            if (arole instanceof ClassifierRole) {
                List returnList = new ArrayList();
                ClassifierRole role = (ClassifierRole) arole;
                for (ModelElement genElem
                        : CoreHelperMDRImpl.getAllParents(role)) {
                    if (genElem instanceof ClassifierRole) {
                        returnList.addAll(allAvailableContents(genElem));
                    }
                }
                for (Classifier baseClassifier : role.getBase()) {
                    returnList.addAll(baseClassifier.getOwnedElement());
                }
                LOG.log(Level.INFO, "allAvailableFeatures {0}", returnList.size());
                return returnList;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("Cannot get available contents on "
                + arole);
    }


    public Collection getAllPossibleBases(Object role) {
        try {
            if (role instanceof ClassifierRole) {
                return getAllPossibleBases((ClassifierRole) role);
            } else if (role instanceof AssociationRole) {
                return getAllPossibleBases((AssociationRole) role);
            } else {
                throw new IllegalArgumentException("Illegal type " + role);
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    /**
     * Returns all possible bases for some AssociationRole taking into account
     * the wellformednessrules as defined in section 2.10.3 of the UML 1.3 spec.
     * <p>
     * Beware: this function does not return the actual base!
     * Which is by design; there are easier ways to retrieve the actual base.
     *
     * @param aRole
     *            the given associationrole
     * @return Collection all possible bases
     */
    private Collection getAllPossibleBases(AssociationRole aRole) {
        Set<UmlAssociation> ret = new HashSet<UmlAssociation>();
        if (aRole == null || aRole.getNamespace() == null) {
            return ret;
        }

        Set<Classifier> bases = collectAssociationRoleBases(aRole);
        
        if (bases.isEmpty()) {
            populateBasesFromNamespace(aRole, ret);
        } else {
            populateBasesFromClassifiers(bases, ret);
        }
        
        removeInvalidAssociations(aRole, ret);
        return ret;
    }

    /**
     * Collect bases from the connected classifier roles.
     *
     * @param aRole the association role
     * @return set of classifier bases
     */
    private Set<Classifier> collectAssociationRoleBases(AssociationRole aRole) {
        Set<Classifier> bases = new HashSet<Classifier>();
        for (AssociationEnd end : aRole.getConnection()) {
            assert end instanceof AssociationEndRole;
            ClassifierRole type = (ClassifierRole) end.getParticipant();
            if (type != null) {
                bases.addAll(type.getBase());
            }
        }
        return bases;
    }

    /**
     * Populate bases from the collaboration namespace.
     *
     * @param aRole the association role
     * @param ret the result set
     */
    private void populateBasesFromNamespace(AssociationRole aRole,
            Set<UmlAssociation> ret) {
        ModelManagementHelper mmh = modelImpl.getModelManagementHelper();
        Namespace ns =
            ((Collaboration) aRole.getNamespace()).getNamespace();
        ret.addAll(
                mmh.getAllModelElementsOfKind(ns, UmlAssociation.class));
        ret.removeAll(mmh.getAllModelElementsOfKind(ns,
                AssociationRole.class));
    }

    /**
     * Populate bases from the given classifiers.
     *
     * @param bases the classifier bases
     * @param ret the result set
     */
    private void populateBasesFromClassifiers(Set<Classifier> bases,
            Set<UmlAssociation> ret) {
        CoreHelper ch = modelImpl.getCoreHelper();
        for (Classifier base1 : bases) {
            for (Classifier base2 : bases) {
                ret.addAll(ch.getAssociations(base1, base2));
            }
        }
    }

    /**
     * Remove invalid associations from the result set.
     *
     * @param aRole the association role
     * @param ret the result set
     */
    private void removeInvalidAssociations(AssociationRole aRole,
            Set<UmlAssociation> ret) {
        Collection<UmlAssociation> listToRemove = new ArrayList<UmlAssociation>();
        for (UmlAssociation association : ret) {
            if (shouldRemoveAssociation(aRole, association)) {
                listToRemove.add(association);
            }
        }
        ret.removeAll(listToRemove);
    }

    /**
     * Check if an association should be removed.
     *
     * @param aRole the association role
     * @param association the association to check
     * @return true if should be removed
     */
    private boolean shouldRemoveAssociation(AssociationRole aRole,
            UmlAssociation association) {
        Collection<AssociationRole> associationRoles =
            ((org.omg.uml.UmlPackage) (association)
                .refOutermostPackage()).getCollaborations()
                .getABaseAssociationRole().getAssociationRole(association);
        
        if (associationRoles.isEmpty()) {
            return false;
        }
        
        if (isRoleUnnamed(aRole)) {
            return true;
        }
        
        return hasUnnamedRole(associationRoles);
    }

    /**
     * Check if a role is unnamed.
     *
     * @param role the role to check
     * @return true if unnamed
     */
    private boolean isRoleUnnamed(AssociationRole role) {
        return role.getName() == null || role.getName().equals("");
    }

    /**
     * Check if any role in the collection is unnamed.
     *
     * @param roles the roles to check
     * @return true if any role is unnamed
     */
    private boolean hasUnnamedRole(Collection<AssociationRole> roles) {
        for (AssociationRole ar : roles) {
            if (isRoleUnnamed(ar)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns all possible bases for some classifierrole taking into account
     * the wellformednessrules as defined in section 2.10.3 of the UML 1.4 spec.
     * <p>
     *
     * @param role
     *            the given classifierrole
     * @return Collection all possible bases
     */
    private Collection getAllPossibleBases(ClassifierRole role) {
        if (role == null || modelImpl.getFacade().getNamespace(role) == null) {
            return Collections.EMPTY_SET;
        }
        Collaboration collaboration = (Collaboration) role.getNamespace();
        Namespace ns = collaboration.getNamespace();
        ModelManagementHelper mmh = modelImpl.getModelManagementHelper();
        Collection<Classifier> returnList = mmh.getAllModelElementsOfKind(ns,
                Classifier.class);
        returnList.removeAll(mmh.getAllModelElementsOfKind(ns,
                ClassifierRole.class));

        removeInvalidClassifiers(returnList, role);

        ensureNamespaceIsPackage(ns);
        
        if (modelImpl.getFacade().isAPackage(ns)) {
            returnList.addAll(getAllImportedClassifiers(ns));
        }

        return returnList;
    }

    /**
     * Remove invalid classifiers from the collection.
     *
     * @param returnList the list to filter
     * @param role the classifier role
     */
    private void removeInvalidClassifiers(Collection<Classifier> returnList,
            ClassifierRole role) {
        Collection<Classifier> listToRemove = new ArrayList<Classifier>();
        for (Classifier classifier : returnList) {
            if (shouldRemoveClassifier(classifier, role)) {
                listToRemove.add(classifier);
            }
        }
        returnList.removeAll(listToRemove);
    }

    /**
     * Check if a classifier should be removed.
     *
     * @param classifier the classifier to check
     * @param role the classifier role
     * @return true if should be removed
     */
    private boolean shouldRemoveClassifier(Classifier classifier,
            ClassifierRole role) {
        Collection<ClassifierRole> classifierRoles =
            ((org.omg.uml.UmlPackage) (classifier)
                .refOutermostPackage()).getCollaborations()
                .getAClassifierRoleBase().getClassifierRole(classifier);
        
        if (classifierRoles.isEmpty()) {
            return false;
        }
        
        if (isRoleUnnamed(role)) {
            return true;
        }
        
        return hasUnnamedClassifierRole(classifierRoles);
    }

    /**
     * Check if any classifier role in the collection is unnamed.
     *
     * @param roles the roles to check
     * @return true if any role is unnamed
     */
    private boolean hasUnnamedClassifierRole(Collection<ClassifierRole> roles) {
        for (ClassifierRole cr : roles) {
            if (isRoleUnnamed(cr)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Ensure the namespace is a package, traversing up if necessary.
     *
     * @param ns the namespace
     */
    private void ensureNamespaceIsPackage(Namespace ns) {
        if (!(ns instanceof UmlPackage)) {
            Namespace current = ns;
            while (current != null) {
                current = current.getNamespace();
                if (current instanceof UmlPackage) {
                    break;
                }
            }
        }
    }

    /**
     * Return a collection of classifiers that are imported from other packages
     * into the given namespace.
     *
     * @param obj the given namespace
     * @return a collection of classifiers
     */
    private Collection<Classifier> getAllImportedClassifiers(Object obj) {
        Collection c = modelImpl.getModelManagementHelper()
                        .getAllImportedElements(obj);
        return filterClassifiers(c);
    }

    private Collection<Classifier> filterClassifiers(Collection in) {
        Collection<Classifier> out = new ArrayList<Classifier>();
        for (Object o : in) {
            if (o instanceof Classifier && !(o instanceof ClassifierRole))
                out.add((Classifier) o);
        }
        return out;
    }


    public void setBase(Object arole, Object abase) {
        if (arole == null) {
            throw new IllegalArgumentException("role is null");
        }
        if (arole instanceof AssociationRole) {
            setBaseForAssociationRole((AssociationRole) arole, abase);
            return;
        }
        if (arole instanceof AssociationEndRole) {
            setBaseForAssociationEndRole((AssociationEndRole) arole, abase);
            return;
        }
        throw new IllegalArgumentException("role");
    }

    /**
     * Set base for an association role.
     *
     * @param role the association role
     * @param abase the base association
     */
    private void setBaseForAssociationRole(AssociationRole role, Object abase) {
        UmlAssociation base = (UmlAssociation) abase;

        if (base != null && !getAllPossibleBases(role).contains(base)) {
            throw new IllegalArgumentException("base is not allowed for "
                    + "this role");
        }
        role.setBase(base);
        
        if (base == null) {
            return;
        }
        
        ClassifierRole sender = (ClassifierRole) modelImpl.getCoreHelper()
                .getSource(role);
        ClassifierRole receiver = (ClassifierRole) modelImpl
                .getCoreHelper().getDestination(role);
        Collection<Classifier> senderBases = sender.getBase();
        Collection<Classifier> receiverBases = receiver.getBase();

        AssociationEndRole senderRole = (AssociationEndRole) modelImpl.
            getCoreHelper().getAssociationEnd(sender, role);
        AssociationEndRole receiverRole = (AssociationEndRole) modelImpl.
            getCoreHelper().getAssociationEnd(receiver, role);

        for (AssociationEnd end : base.getConnection()) {
            if (senderBases.contains(end.getParticipant())) {
                senderRole.setBase(end);
            } else if (receiverBases.contains(end.getParticipant())) {
                receiverRole.setBase(end);
            }
        }
    }

    /**
     * Set base for an association end role.
     *
     * @param role the association end role
     * @param abase the base association end
     */
    private void setBaseForAssociationEndRole(AssociationEndRole role,
            Object abase) {
        AssociationEnd base = (AssociationEnd) abase;
        role.setBase(base);
    }


    public boolean isAddingCollaborationAllowed(Object context) {
        return (
                context instanceof Classifier
                || context instanceof Operation
                );
    }


    public void removeBase(Object handle, Object c) {
        try {
            if (handle instanceof ClassifierRole && c instanceof Classifier) {
                ((ClassifierRole) handle).getBase().remove(c);
                return;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException(
                "There must be a ClassifierRole and a Classifier");
    }


    public void removeConstrainingElement(Object handle, Object constraint) {
        try {
            if (handle instanceof Collaboration
                    && constraint instanceof ModelElement) {
                Collaboration collab = (Collaboration) handle;
                collab.getConstrainingElement().remove(constraint);
                return;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or constraint: " + constraint);
    }


    public void removeMessage(Object handle, Object message) {
        try {
            if (handle instanceof Interaction && message instanceof Message) {
                ((Interaction) handle).getMessage().remove(message);
                return;
            }
            if (handle instanceof AssociationRole
                    && message instanceof Message) {
                ((AssociationRole) handle).getMessage().remove(message);
                return;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or message: " + message);
    }


    public void removeSuccessor(Object handle, Object mess) {
        try {
            if (handle instanceof Message && mess instanceof Message) {
                ((org.omg.uml.UmlPackage) ((Message) handle)
                        .refOutermostPackage()).getCollaborations()
                        .getAPredecessorSuccessor().remove((Message) handle,
                                (Message) mess);
                return;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("predecessor: " + handle
                + " or successor: " + mess);
    }


    public void removePredecessor(Object handle, Object message) {
        try {
            if (handle instanceof Message && message instanceof Message) {
                ((Message) handle).getPredecessor().remove(message);
                return;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or message: " + message);
    }


    public void addConstrainingElement(Object handle, Object constraint) {
        if (handle instanceof Collaboration
                && constraint instanceof ModelElement) {
            ((Collaboration) handle).getConstrainingElement().add(
                    (ModelElement) constraint);
            return;
        }

        throw new IllegalArgumentException("handle: " + handle
                + " or constraint: " + constraint);
    }


    public void addInstance(Object classifierRole, Object instance) {
        if (classifierRole instanceof ClassifierRole
                && instance instanceof Instance) {
            ((ClassifierRole) classifierRole).getConformingInstance().add(
                    (Instance) instance);
        }
        throw new IllegalArgumentException("classifierRole: " + classifierRole
                + " or instance: " + instance);
    }


    public void addMessage(Object handle, Object elem) {
        if (handle instanceof Interaction && elem instanceof Message) {
            final Message message = (Message) elem;
            final Interaction interaction = (Interaction) handle;
            final Interaction oldInteraction = message.getInteraction();

            if (oldInteraction != null) {
                oldInteraction.getMessage().remove(message);
            }
            interaction.getMessage().add(message);
            return;
        }
        if (handle instanceof AssociationRole && elem instanceof Message) {
            ((AssociationRole) handle).getMessage().add((Message) elem);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or elem: "
                + elem);
    }


    public void addSuccessor(Object handle, Object mess) {
        if (handle instanceof Message && mess instanceof Message) {
            ((Message) mess).getPredecessor().add((Message) handle);
            return;
        }

        throw new IllegalArgumentException("predecessor: " + handle
                + " or successor: " + mess);
    }


    public void addPredecessor(Object handle, Object predecessor) {
        if (handle != null && handle instanceof Message && predecessor != null
                && predecessor instanceof Message) {
            ((Message) handle).getPredecessor().add((Message) predecessor);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or predecessor: " + predecessor);
    }


    public void setAction(Object handle, Object action) {
        if (handle instanceof Message
                && (action == null || action instanceof Action)) {
            ((Message) handle).setAction((Action) action);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or action: "
                + action);
    }


    public void setContext(Object handle, Object col) {
        if (handle instanceof Interaction
                && (col instanceof Collaboration || col == null)) {
            ((Interaction) handle).setContext((Collaboration) col);

            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or col: "
                + col);
    }


    public void setSuccessors(Object handle, Collection messages) {
        if (handle instanceof Message) {
            Collection currentMessages =
                Model.getFacade().getSuccessors(handle);
            if (!currentMessages.isEmpty()) {
                Collection successors = new ArrayList(currentMessages);
                for (Object msg : successors) {
                    removeSuccessor(handle, msg);
                }
            }
            for (Object msg : messages) {
                addSuccessor(handle, msg);
            }
            return;
        }

        throw new IllegalArgumentException("predecessor: " + handle
                + " or messages: " + messages);
    }

    public void setMessageSort(Object message, Object messageSort) {
        setAction(message, messageSort);
    }

    public void setPredecessors(Object handle, Collection predecessors) {
        if (handle instanceof Message) {
            CollectionHelper.update(
                    ((Message) handle).getPredecessor(), predecessors);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or predecessors: " + predecessors);
    }


    public void setRepresentedClassifier(Object handle, Object classifier) {
        if (handle instanceof Collaboration
                && ((classifier == null) || classifier instanceof Classifier)) {
            ((Collaboration) handle).
                setRepresentedClassifier((Classifier) classifier);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or classifier: " + classifier);
    }


    public void setRepresentedOperation(Object handle, Object operation) {
        if (handle instanceof Collaboration
                && ((operation == null) || operation instanceof Operation)) {
            ((Collaboration) handle).
                setRepresentedOperation((Operation) operation);

            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or operation: " + operation);
    }


    public void setSender(Object handle, Object sender) {
        if (handle instanceof Message
                && (sender instanceof ClassifierRole || sender == null)) {
            ((Message) handle).setSender((ClassifierRole) sender);
            return;
        }
        if (handle instanceof Stimulus && sender instanceof Instance) {
            ((Stimulus) handle).setSender((Instance) sender);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or sender: "
                + sender);
    }


    public void removeInteraction(Object collab, Object interaction) {
        try {
            if (collab instanceof Collaboration
                    && interaction instanceof Interaction) {
                ((Collaboration) collab).getInteraction().remove(interaction);
                return;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("collab: " + collab
                + " or interaction: " + interaction);
    }
}