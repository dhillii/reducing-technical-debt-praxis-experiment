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
import org.argouml.model.CoreHelperMDRImpl;
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
                if (isNamespace(o)) {
                    list.addAll(getAllClassifierRoles(o));
                }
                if (isClassifierRole(o)) {
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
            if (isBaseEmpty(role)) {
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

        List<Classifier> roles = new ArrayList<Classifier>();
        try {
            Collection<AssociationEnd> associationEnds =
                Model.getFacade().getAssociationEnds(role);
            if (isAssociationEndsEmpty(associationEnds)) {
                return roles;
            }
            for (AssociationEnd end : associationEnds) {
                if (isAssociationEndRole(end)) {
                    UmlAssociation assoc = end.getAssociation();
                    for (AssociationEnd end2 : assoc.getConnection()) {
                        Classifier classifier = end2.getParticipant();
                        if (isClassifierDifferentFromRole(classifier, role)
                                && isClassifierRole(classifier)) {
                            roles.add(classifier);
                        }
                    }
                }
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        return roles;
    }


    public Object getAssociationRole(Object afrom, Object ato) {
        if (afrom == null || ato == null) {
            throw new IllegalArgumentException();
        }
        ClassifierRole from = (ClassifierRole) afrom;
        ClassifierRole to = (ClassifierRole) ato;

        try {
            Collection<AssociationEnd> ends =
                Model.getFacade().getAssociationEnds(from);
            for (AssociationEnd end : ends) {
                if (isAssociationEndRole(end)) {
                    UmlAssociation assoc = end.getAssociation();
                    for (AssociationEnd end2 : assoc.getConnection()) {
                        Classifier classifier = end2.getParticipant();
                        if (isClassifierEqualToTo(classifier, to)) {
                            return assoc;
                        }
                    }
                }
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        return null;
    }


    public Collection<Message> getAllPossibleActivators(Object ames) {
        Message mes = (Message) ames;
        if (isMessageNullOrInteractionNull(mes)) {
            return Collections.unmodifiableCollection(Collections.EMPTY_LIST);
        }

        try {
            Interaction inter = mes.getInteraction();
            Collection<Message> predecessors = mes.getPredecessor();
            Collection<Message> allMessages = inter.getMessage();
            List<Message> list = new ArrayList<Message>();
            for (Message m : allMessages) {
                if (isNotPredecessor(m, predecessors)
                        && isNotSelf(m, mes)
                        && isNotActivator(m, mes)
                        && isNotPredecessorOf(mes, m)) {
                    list.add(m);
                }
            }
            return list;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public boolean hasAsActivator(Object message, Object activator) {
        if (!(message instanceof Message)) {
            throw new IllegalArgumentException();
        }
        if (!(activator instanceof Message)) {
            throw new IllegalArgumentException();
        }

        try {
            Message messActivator = ((Message) message).getActivator();
            if (messActivator == null) {
                return false;
            }
            if (isActivatorDirectOrIndirect(messActivator, activator)) {
                return true;
            }
            return hasAsActivator(messActivator, activator);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
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
        if (isMessageEqualToActivator(mes, activator)) {
            throw new IllegalArgumentException("In setActivator: message may "
                    + "not be equal to activator");
        }

        if (activator != null) {
            if (isInteractionMismatch(mes, activator)) {
                throw new IllegalArgumentException(
                        "In setActivator: interaction "
                                + "of message should equal "
                                + "interaction of activator");
            }
            // we must find out if the activator itself does not have
            // message as it's activator
            if (hasAsActivator(activator, mes)) {
                throw new IllegalArgumentException(
                        "In setActivator: message may "
                                + "not be the activator for "
                                + "the original activator");
            }
            // An activator can't also be a predecessor of a message
            if (isActivatorPredecessorOf(mes, activator)) {
                mes.getPredecessor().remove(activator);
            }
        }
        List<Message> listToChange = new ArrayList<Message>();
        Collection<Message> predecessors = mes.getPredecessor();
        listToChange.addAll(predecessors);
        listToChange.add(mes);
        Interaction inter = mes.getInteraction();
        for (Message mes2 : inter.getMessage()) {
            if (isPredecessorOf(mes2, mes)) {
                listToChange.add(mes2);
            }
        }
        // This causes problems. It can make multiple return messages
        // refer to the same activator even if not returning to the same
        // classifier role as the activator emenates from.
        // I'm not sure that changing the activator of one message
        // should amend any other messages but this is certainly changing
        // too many - Bob.
        for (Message mes2 : listToChange) {
            mes2.setActivator(activator);
        }

    }


    public Collection<Message> getAllPossiblePredecessors(Object amessage) {
        Message message = (Message) amessage;
        if (isMessageNull(message)) {
            throw new IllegalArgumentException(
                    "In getAllPossiblePredecessors: "
                            + "argument message is null");
        }

        try {
            Interaction inter = message.getInteraction();
            List<Message> list = new ArrayList<Message>();
            for (Message mes : inter.getMessage()) {
                if (isSameActivator(mes, message)
                        && isNotSelf(mes, message)
                        && isNotPredecessorOf(mes, message)
                        && isNotPredecessorOf(message, message)) {
                    list.add(mes);
                }
            }
            return list;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public void addBase(Object arole, Object abase) {
        ClassifierRole role = (ClassifierRole) arole;
        Classifier base = (Classifier) abase;
        if (isRoleOrBaseNull(role, base)) {
            throw new IllegalArgumentException("In addBase: either the role "
                    + "or the base is null");
        }
        role.getBase().add(base);
        if (isBaseCountOne(role)) {
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
        if (isAssociationRoleNullOrNamespaceNull(aRole)) {
            return ret;
        }

        // find the bases of the connected classifierroles so that we can see
        // what associations are between them. If there are bases then the
        // associations between those bases form the possible bases. Otherwise
        // the bases are formed by all associations in the namespace of the
        // collaboration
        Set<Classifier> bases = new HashSet<Classifier>();
        for (AssociationEnd end : aRole.getConnection()) {
            assert end instanceof AssociationEndRole;
            ClassifierRole type = (ClassifierRole) end.getParticipant();
            if (type != null) {
                bases.addAll(type.getBase());
            }
        }
        if (isBasesEmpty(bases)) {
            ModelManagementHelper mmh = modelImpl.getModelManagementHelper();
            Namespace ns =
                ((Collaboration) aRole.getNamespace()).getNamespace();
            ret.addAll(
                    mmh.getAllModelElementsOfKind(ns, UmlAssociation.class));
            ret.removeAll(mmh.getAllModelElementsOfKind(ns,
                    AssociationRole.class));
        } else {
            CoreHelper ch = modelImpl.getCoreHelper();
            /* This double 'for' loop may be optimised as follows:
             * - Use arrays in stead of a Set for bases
             * - Have the second loop start from the element after base1
             * ... but I chose not to do this, since the gain is small,
             * and this is only used for a lazily filled combo.
             * BTW: This is also used by Notation.*/
            for (Classifier base1 : bases)  {
                for (Classifier base2 : bases) {
                    // include associations to self - see issue 5602
                    ret.addAll(ch.getAssociations(base1, base2));
                }
            }
        }
        // An Association can only have a single unnamed ClassifierRole, so
        Collection<UmlAssociation> listToRemove = new ArrayList<UmlAssociation>();
        for (UmlAssociation association : ret) {
            Collection<AssociationRole> associationRoles =
                ((org.omg.uml.UmlPackage) (association)
                    .refOutermostPackage()).getCollaborations()
                    .getABaseAssociationRole().getAssociationRole(association);
            if (isAssociationRolesEmpty(associationRoles)) {
                continue;
            }
            // if we are unnamed eliminate all classifiers which are already
            // the base of some role
            if (isAssociationRoleUnnamed(aRole)) {
                listToRemove.add(association);
            } else {
                // eliminate Classifiers which already have an unnamed role
                for (AssociationRole ar : associationRoles) {
                    if (isAssociationRoleUnnamed(ar)) {
                        listToRemove.add(association);
                    }
                }
            }
        }
        ret.removeAll(listToRemove);

        return ret;
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
        if (isClassifierRoleNullOrNamespaceNull(role)) {
            return Collections.EMPTY_SET;
        }
        Collaboration collaboration = (Collaboration) role.getNamespace();
        Namespace ns = collaboration.getNamespace();
        ModelManagementHelper mmh = modelImpl.getModelManagementHelper();
        Collection<Classifier> returnList = mmh.getAllModelElementsOfKind(ns,
                Classifier.class);
        // WFR 2.10.3.3 #4
        returnList.removeAll(mmh.getAllModelElementsOfKind(ns,
                ClassifierRole.class));

        // A Classifier can only have a single unnamed ClassifierRole, so
        // TODO: This probably belongs in a critic instead of here
        Collection<Classifier> listToRemove = new ArrayList<Classifier>();
        for (Classifier classifier : returnList) {
            Collection<ClassifierRole> classifierRoles =
                ((org.omg.uml.UmlPackage) (classifier)
                    .refOutermostPackage()).getCollaborations()
                    .getAClassifierRoleBase().getClassifierRole(classifier);
            if (isClassifierRolesEmpty(classifierRoles)) {
                continue;
            }
            // if we are unnamed eliminate all classifiers which are already
            // the base of some role
            if (isClassifierRoleUnnamed(role)) {
                listToRemove.add(classifier);
            } else {
                // eliminate Classifiers which already have an unnamed role
                for (ClassifierRole cr : classifierRoles) {
                    if (isClassifierRoleUnnamed(cr)) {
                        listToRemove.add(classifier);
                    }
                }
            }
        }
        returnList.removeAll(listToRemove);

        /* We need to verify that ns is a Package,
         * if not - find its parent package!
         * Otherwise this causes an exception when creating
         * a sequence diagram for a ClassifierRole.*/
        if (!(ns instanceof UmlPackage)) {
            while (ns != null) {
                ns = ns.getNamespace();
                if (ns instanceof UmlPackage) {
                    break;
                }
            }
        }
        // now get all classifiers imported from other packages
        // TODO: This should probably happen automatically in
        // getAllModelElementsOfKind() - tfm
        if (modelImpl.getFacade().isAPackage(ns)) {
            returnList.addAll(getAllImportedClassifiers(ns));
        }

        return returnList;
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
            if (isClassifierAndNotClassifierRole(o))
                out.add((Classifier) o);
        }
        return out;
    }


    public void setBase(Object arole, Object abase) {
        if (arole == null) {
            throw new IllegalArgumentException("role is null");
        }
        if (arole instanceof AssociationRole) {
            AssociationRole role = (AssociationRole) arole;
            UmlAssociation base = (UmlAssociation) abase;

            // TODO: Must we calculate the whole list?
            if (base != null && !getAllPossibleBases(role).contains(base)) {
                throw new IllegalArgumentException("base is not allowed for "
                        + "this role");
            }
            role.setBase(base);
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

            if (base != null) {
                for (AssociationEnd end : base.getConnection()) {
                    if (isSenderBase(end, senderBases)) {
                        senderRole.setBase(end);
                    } else if (isReceiverBase(end, receiverBases)) {
                        receiverRole.setBase(end);
                    }
                }
            }

            return;
        } else if (arole instanceof AssociationEndRole) {
            AssociationEndRole role = (AssociationEndRole) arole;
            AssociationEnd base = (AssociationEnd) abase;

            role.setBase(base);

            return;
        }

        throw new IllegalArgumentException("role");
    }


    public boolean isAddingCollaborationAllowed(Object context) {
        return (
                context instanceof Classifier
                || context instanceof Operation
                //|| context instanceof Collaboration
                //|| context instanceof Model
                );
    }


    public void removeBase(Object handle, Object c) {
        try {
            if (isClassifierRoleAndClassifier(handle, c)) {
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
            if (isCollaborationAndModelElement(handle, constraint)) {
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
            if (isInteractionAndMessage(handle, message)) {
                ((Interaction) handle).getMessage().remove(message);
                return;
            }
            if (isAssociationRoleAndMessage(handle, message)) {
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
            if (isMessageAndMessage(handle, mess)) {
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
            if (isMessageAndMessage(handle, message)) {
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
        if (isCollaborationAndModelElement(handle, constraint)) {
            ((Collaboration) handle).getConstrainingElement().add(
                    (ModelElement) constraint);
            return;
        }

        throw new IllegalArgumentException("handle: " + handle
                + " or constraint: " + constraint);
    }


    public void addInstance(Object classifierRole, Object instance) {
        if (isClassifierRoleAndInstance(classifierRole, instance)) {
            ((ClassifierRole) classifierRole).getConformingInstance().add(
                    (Instance) instance);
        }
        throw new IllegalArgumentException("classifierRole: " + classifierRole
                + " or instance: " + instance);
    }


    public void addMessage(Object handle, Object elem) {
        if (isInteractionAndMessage(handle, elem)) {
            final Message message = (Message) elem;
            final Interaction interaction = (Interaction) handle;
            final Interaction oldInteraction = message.getInteraction();

            if (oldInteraction != null) {
                oldInteraction.getMessage().remove(message);
            }
            interaction.getMessage().add(message);
            return;
        }
        if (isAssociationRoleAndMessage(handle, elem)) {
            ((AssociationRole) handle).getMessage().add((Message) elem);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or elem: "
                + elem);
    }


    public void addSuccessor(Object handle, Object mess) {
        if (isMessageAndMessage(handle, mess)) {
            ((Message) mess).getPredecessor().add((Message) handle);
            return;
        }

        throw new IllegalArgumentException("predecessor: " + handle
                + " or successor: " + mess);
    }


    public void addPredecessor(Object handle, Object predecessor) {
        if (isHandleAndPredecessor(handle, predecessor)) {
            ((Message) handle).getPredecessor().add((Message) predecessor);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or predecessor: " + predecessor);
    }


    public void setAction(Object handle, Object action) {
        if (isMessageAndAction(handle, action)) {
            ((Message) handle).setAction((Action) action);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or action: "
                + action);
    }


    public void setContext(Object handle, Object col) {
        if (isInteractionAndCollaboration(handle, col)) {
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
        if (isCollaborationAndClassifier(handle, classifier)) {
            ((Collaboration) handle).
                setRepresentedClassifier((Classifier) classifier);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or classifier: " + classifier);
    }


    public void setRepresentedOperation(Object handle, Object operation) {
        if (isCollaborationAndOperation(handle, operation)) {
            ((Collaboration) handle).
                setRepresentedOperation((Operation) operation);

            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or operation: " + operation);
    }


    public void setSender(Object handle, Object sender) {
        if (isMessageAndClassifierRoleOrNull(handle, sender)) {
            ((Message) handle).setSender((ClassifierRole) sender);
            return;
        }
        if (isStimulusAndInstance(handle, sender)) {
            ((Stimulus) handle).setSender((Instance) sender);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or sender: "
                + sender);
    }


    public void removeInteraction(Object collab, Object interaction) {
        try {
            if (isCollaborationAndInteraction(collab, interaction)) {
                ((Collaboration) collab).getInteraction().remove(interaction);
                return;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("collab: " + collab
                + " or interaction: " + interaction);
    }

    /**
     * Checks if the given object is a Namespace.
     *
     * @param o the object to check
     * @return true if the object is a Namespace
     */
    private boolean isNamespace(Object o) {
        return o instanceof Namespace;
    }

    /**
     * Checks if the given object is a ClassifierRole.
     *
     * @param o the object to check
     * @return true if the object is a ClassifierRole
     */
    private boolean isClassifierRole(Object o) {
        return o instanceof ClassifierRole;
    }

    /**
     * Checks if the base collection of the given role is empty.
     *
     * @param role the role to check
     * @return true if the base collection is empty
     */
    private boolean isBaseEmpty(ClassifierRole role) {
        return role.getBase().isEmpty();
    }

    /**
     * Checks if the given collection of association ends is empty.
     *
     * @param associationEnds the collection to check
     * @return true if the collection is empty
     */
    private boolean isAssociationEndsEmpty(Collection<AssociationEnd> associationEnds) {
        return associationEnds.isEmpty();
    }

    /**
     * Checks if the given association end is an AssociationEndRole.
     *
     * @param end the association end to check
     * @return true if the association end is an AssociationEndRole
     */
    private boolean isAssociationEndRole(AssociationEnd end) {
        return end instanceof AssociationEndRole;
    }

    /**
     * Checks if the given classifier is different from the role.
     *
     * @param classifier the classifier to check
     * @param role the role to compare against
     * @return true if the classifier is different from the role
     */
    private boolean isClassifierDifferentFromRole(Classifier classifier, Object role) {
        return classifier != role;
    }

    /**
     * Checks if the given classifier is equal to the target.
     *
     * @param classifier the classifier to check
     * @param to the target to compare against
     * @return true if the classifier is equal to the target
     */
    private boolean isClassifierEqualToTo(Classifier classifier, Object to) {
        return classifier == to;
    }

    /**
     * Checks if the message is null or its interaction is null.
     *
     * @param mes the message to check
     * @return true if the message is null or its interaction is null
     */
    private boolean isMessageNullOrInteractionNull(Message mes) {
        return mes == null || mes.getInteraction() == null;
    }

    /**
     * Checks if the message is not a predecessor of the given collection.
     *
     * @param m the message to check
     * @param predecessors the collection of predecessors
     * @return true if the message is not a predecessor
     */
    private boolean isNotPredecessor(Message m, Collection<Message> predecessors) {
        return !predecessors.contains(m);
    }

    /**
     * Checks if the message is not the same as the given message.
     *
     * @param m the message to check
     * @param mes the message to compare against
     * @return true if the messages are not the same
     */
    private boolean isNotSelf(Message m, Message mes) {
        return mes != m;
    }

    /**
     * Checks if the message is not an activator of the given message.
     *
     * @param m the message to check
     * @param mes the message to compare against
     * @return true if the message is not an activator
     */
    private boolean isNotActivator(Message m, Message mes) {
        return !hasAsActivator(m, mes);
    }

    /**
     * Checks if the given message is not a predecessor of the activator.
     *
     * @param mes the activator
     * @param m the message to check
     * @return true if the message is not a predecessor of the activator
     */
    private boolean isNotPredecessorOf(Message mes, Message m) {
        return !m.getPredecessor().contains(mes);
    }

    /**
     * Checks if the activator is directly or indirectly the given activator.
     *
     * @param messActivator the activator to check
     * @param activator the target activator
     * @return true if the activator is directly or indirectly the target
     */
    private boolean isActivatorDirectOrIndirect(Message messActivator, Object activator) {
        return messActivator == activator
                || messActivator.getPredecessor().contains(activator);
    }

    /**
     * Checks if the message is equal to the activator.
     *
     * @param mes the message
     * @param activator the activator
     * @return true if the message is equal to the activator
     */
    private boolean isMessageEqualToActivator(Message mes, Message activator) {
        return mes == activator;
    }

    /**
     * Checks if the interaction of the message is different from the interaction of the activator.
     *
     * @param mes the message
     * @param activator the activator
     * @return true if the interactions are different
     */
    private boolean isInteractionMismatch(Message mes, Message activator) {
        return mes.getInteraction() != activator.getInteraction();
    }

    /**
     * Checks if the activator is a predecessor of the message.
     *
     * @param mes the message
     * @param activator the activator
     * @return true if the activator is a predecessor of the message
     */
    private boolean isActivatorPredecessorOf(Message mes, Message activator) {
        return mes.getPredecessor().contains(activator);
    }

    /**
     * Checks if the message is a predecessor of the given message.
     *
     * @param mes2 the message to check
     * @param mes the message to compare against
     * @return true if the message is a predecessor of the given message
     */
    private boolean isPredecessorOf(Message mes2, Message mes) {
        return mes2.getPredecessor().contains(mes);
    }

    /**
     * Checks if the message is null.
     *
     * @param message the message to check
     * @return true if the message is null
     */
    private boolean isMessageNull(Message message) {
        return message == null;
    }

    /**
     * Checks if the message has the same activator as the given message.
     *
     * @param mes the message to check
     * @param message the message to compare against
     * @return true if the messages have the same activator
     */
    private boolean isSameActivator(Message mes, Message message) {
        return mes.getActivator() == message.getActivator();
    }

    /**
     * Checks if the role or base is null.
     *
     * @param role the role to check
     * @param base the base to check
     * @return true if the role or base is null
     */
    private boolean isRoleOrBaseNull(ClassifierRole role, Classifier base) {
        return role == null || base == null;
    }

    /**
     * Checks if the base count of the role is one.
     *
     * @param role the role to check
     * @return true if the base count is one
     */
    private boolean isBaseCountOne(ClassifierRole role) {
        return modelImpl.getFacade().getBases(role).size() == 1;
    }

    /**
     * Checks if the association role is null or its namespace is null.
     *
     * @param aRole the association role to check
     * @return true if the association role is null or its namespace is null
     */
    private boolean isAssociationRoleNullOrNamespaceNull(AssociationRole aRole) {
        return aRole == null || aRole.getNamespace() == null;
    }

    /**
     * Checks if the collection of bases is empty.
     *
     * @param bases the collection of bases
     * @return true if the collection is empty
     */
    private boolean isBasesEmpty(Set<Classifier> bases) {
        return bases.isEmpty();
    }

    /**
     * Checks if the collection of association roles is empty.
     *
     * @param associationRoles the collection of association roles
     * @return true if the collection is empty
     */
    private boolean isAssociationRolesEmpty(Collection<AssociationRole> associationRoles) {
        return associationRoles.isEmpty();
    }

    /**
     * Checks if the association role is unnamed.
     *
     * @param aRole the association role to check
     * @return true if the association role is unnamed
     */
    private boolean isAssociationRoleUnnamed(AssociationRole aRole) {
        return aRole.getName() == null || aRole.getName().equals("");
    }

    /**
     * Checks if the classifier role is null or its namespace is null.
     *
     * @param role the classifier role to check
     * @return true if the classifier role is null or its namespace is null
     */
    private boolean isClassifierRoleNullOrNamespaceNull(ClassifierRole role) {
        return role == null || modelImpl.getFacade().getNamespace(role) == null;
    }

    /**
     * Checks if the collection of classifier roles is empty.
     *
     * @param classifierRoles the collection of classifier roles
     * @return true if the collection is empty
     */
    private boolean isClassifierRolesEmpty(Collection<ClassifierRole> classifierRoles) {
        return classifierRoles.isEmpty();
    }

    /**
     * Checks if the classifier role is unnamed.
     *
     * @param role the classifier role to check
     * @return true if the classifier role is unnamed
     */
    private boolean isClassifierRoleUnnamed(ClassifierRole role) {
        return role.getName() == null || role.getName().equals("");
    }

    /**
     * Checks if the classifier is a Classifier and not a ClassifierRole.
     *
     * @param o the object to check
     * @return true if the object is a Classifier and not a ClassifierRole
     */
    private boolean isClassifierAndNotClassifierRole(Object o) {
        return o instanceof Classifier && !(o instanceof ClassifierRole);
    }

    /**
     * Checks if the end is a sender base.
     *
     * @param end the association end
     * @param senderBases the collection of sender bases
     * @return true if the end is a sender base
     */
    private boolean isSenderBase(AssociationEnd end, Collection<Classifier> senderBases) {
        return senderBases.contains(end.getParticipant());
    }

    /**
     * Checks if the end is a receiver base.
     *
     * @param end the association end
     * @param receiverBases the collection of receiver bases
     * @return true if the end is a receiver base
     */
    private boolean isReceiverBase(AssociationEnd end, Collection<Classifier> receiverBases) {
        return receiverBases.contains(end.getParticipant());
    }

    /**
     * Checks if the handle is a ClassifierRole and c is a Classifier.
     *
     * @param handle the handle to check
     * @param c the classifier to check
     * @return true if the handle is a ClassifierRole and c is a Classifier
     */
    private boolean isClassifierRoleAndClassifier(Object handle, Object c) {
        return handle instanceof ClassifierRole && c instanceof Classifier;
    }

    /**
     * Checks if the handle is a Collaboration and constraint is a ModelElement.
     *
     * @param handle the handle to check
     * @param constraint the constraint to check
     * @return true if the handle is a Collaboration and constraint is a ModelElement
     */
    private boolean isCollaborationAndModelElement(Object handle, Object constraint) {
        return handle instanceof Collaboration && constraint instanceof ModelElement;
    }

    /**
     * Checks if the handle is an Interaction and message is a Message.
     *
     * @param handle the handle to check
     * @param message the message to check
     * @return true if the handle is an Interaction and message is a Message
     */
    private boolean isInteractionAndMessage(Object handle, Object message) {
        return handle instanceof Interaction && message instanceof Message;
    }

    /**
     * Checks if the handle is an AssociationRole and message is a Message.
     *
     * @param handle the handle to check
     * @param message the message to check
     * @return true if the handle is an AssociationRole and message is a Message
     */
    private boolean isAssociationRoleAndMessage(Object handle, Object message) {
        return handle instanceof AssociationRole && message instanceof Message;
    }

    /**
     * Checks if the handle is a Message and mess is a Message.
     *
     * @param handle the handle to check
     * @param mess the message to check
     * @return true if the handle is a Message and mess is a Message
     */
    private boolean isMessageAndMessage(Object handle, Object mess) {
        return handle instanceof Message && mess instanceof Message;
    }

    /**
     * Checks if the handle and predecessor are valid.
     *
     * @param handle the handle to check
     * @param predecessor the predecessor to check
     * @return true if the handle and predecessor are valid
     */
    private boolean isHandleAndPredecessor(Object handle, Object predecessor) {
        return handle != null && handle instanceof Message && predecessor != null
                && predecessor instanceof Message;
    }

    /**
     * Checks if the handle is a Message and action is an Action or null.
     *
     * @param handle the handle to check
     * @param action the action to check
     * @return true if the handle is a Message and action is an Action or null
     */
    private boolean isMessageAndAction(Object handle, Object action) {
        return handle instanceof Message && (action == null || action instanceof Action);
    }

    /**
     * Checks if the handle is an Interaction and col is a Collaboration or null.
     *
     * @param handle the handle to check
     * @param col the collaboration to check
     * @return true if the handle is an Interaction and col is a Collaboration or null
     */
    private boolean isInteractionAndCollaboration(Object handle, Object col) {
        return handle instanceof Interaction && (col instanceof Collaboration || col == null);
    }

    /**
     * Checks if the handle is a Collaboration and classifier is a Classifier or null.
     *
     * @param handle the handle to check
     * @param classifier the classifier to check
     * @return true if the handle is a Collaboration and classifier is a Classifier or null
     */
    private boolean isCollaborationAndClassifier(Object handle, Object classifier) {
        return handle instanceof Collaboration && ((classifier == null) || classifier instanceof Classifier);
    }

    /**
     * Checks if the handle is a Collaboration and operation is an Operation or null.
     *
     * @param handle the handle to check
     * @param operation the operation to check
     * @return true if the handle is a Collaboration and operation is an Operation or null
     */
    private boolean isCollaborationAndOperation(Object handle, Object operation) {
        return handle instanceof Collaboration && ((operation == null) || operation instanceof Operation);
    }

    /**
     * Checks if the handle is a Message and sender is a ClassifierRole or null.
     *
     * @param handle the handle to check
     * @param sender the sender to check
     * @return true if the handle is a Message and sender is a ClassifierRole or null
     */
    private boolean isMessageAndClassifierRoleOrNull(Object handle, Object sender) {
        return handle instanceof Message && (sender instanceof ClassifierRole || sender == null);
    }

    /**
     * Checks if the handle is a Stimulus and sender is an Instance.
     *
     * @param handle the handle to check
     * @param sender the sender to check
     * @return true if the handle is a Stimulus and sender is an Instance
     */
    private boolean isStimulusAndInstance(Object handle, Object sender) {
        return handle instanceof Stimulus && sender instanceof Instance;
    }

    /**
     * Checks if the collab is a Collaboration and interaction is an Interaction.
     *
     * @param collab the collaboration to check
     * @param interaction the interaction to check
     * @return true if the collab is a Collaboration and interaction is an Interaction
     */
    private boolean isCollaborationAndInteraction(Object collab, Object interaction) {
        return collab instanceof Collaboration && interaction instanceof Interaction;
    }
}