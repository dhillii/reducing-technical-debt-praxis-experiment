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
            if (isEmpty(role.getBase())) {
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
            if (!isEmpty(associationEnds)) {
                for (AssociationEnd end : associationEnds) {
                    if (isAssociationEndRole(end)) {
                        UmlAssociation assoc = end.getAssociation();
                        for (AssociationEnd end2 : assoc.getConnection()) {
                            Classifier classifier = end2.getParticipant();
                            if (isNotRole(classifier, role) && isClassifierRole(classifier)) {
                                roles.add(classifier);
                            }
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
                        if (isClassifier(classifier, to)) {
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
        if (isNullOrEmpty(mes) || isNull(mes.getInteraction())) {
            return Collections.unmodifiableCollection(Collections.EMPTY_LIST);
        }

        try {
            Interaction inter = mes.getInteraction();
            Collection<Message> predecessors = mes.getPredecessor();
            Collection<Message> allMessages = inter.getMessage();
            List<Message> list = new ArrayList<Message>();
            for (Message m : allMessages) {
                if (isNotPredecessor(m, predecessors, mes)
                        && !hasAsActivator(m, mes)
                        && !contains(m.getPredecessor(), mes)) {
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
            if (isNull(messActivator)) {
                return false;
            }
            if (isEqual(messActivator, activator)
                    || contains(messActivator.getPredecessor(), activator)) {
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
        if (isEqual(mes, activator)) {
            throw new IllegalArgumentException("In setActivator: message may "
                    + "not be equal to activator");
        }

        if (activator != null) {
            if (!isEqual(mes.getInteraction(), activator.getInteraction())) {
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
            if (contains(mes.getPredecessor(), activator)) {
                mes.getPredecessor().remove(activator);
            }
        }
        List<Message> listToChange = new ArrayList<Message>();
        Collection<Message> predecessors = mes.getPredecessor();
        listToChange.addAll(predecessors);
        listToChange.add(mes);
        Interaction inter = mes.getInteraction();
        for (Message mes2 : inter.getMessage()) {
            if (contains(mes2.getPredecessor(), mes)) {
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
        if (isNull(message)) {
            throw new IllegalArgumentException(
                    "In getAllPossiblePredecessors: "
                            + "argument message is null");
        }

        try {
            Interaction inter = message.getInteraction();
            List<Message> list = new ArrayList<Message>();
            for (Message mes : inter.getMessage()) {
                if (isEqual(mes.getActivator(), message.getActivator())
                        && !isEqual(message, mes)
                        && !contains(mes.getPredecessor(), message)
                        && !contains(message.getPredecessor(), message)) {
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
        if (isNull(role) || isNull(base)) {
            throw new IllegalArgumentException("In addBase: either the role "
                    + "or the base is null");
        }
        role.getBase().add(base);
        if (hasOneElement(modelImpl.getFacade().getBases(role))) {
            role.getAvailableContents().clear();
            role.getAvailableContents().addAll(base.getOwnedElement());
            role.getAvailableFeature().clear();
            role.getAvailableFeature().addAll(base.getFeature());
        } else {
            for (ModelElement elem : base.getOwnedElement()) {
                if (!contains(role.getAvailableContents(), elem)) {
                    role.getAvailableContents().add(elem);
                }
            }
            for (Feature feature : base.getFeature()) {
                if (!contains(role.getAvailableFeature(), feature)) {
                    role.getAvailableFeature().add(feature);
                }
            }
        }
    }

    public void setBases(Object role, Collection bases) {
        if (isNull(role) || isNull(bases)) {
            throw new IllegalArgumentException("In setBases: either the role "
                    + "or the collection bases is " + "null");
        }
        CollectionHelper.update(((ClassifierRole) role).getBase(), bases);
    }


    public Collection<Feature> allAvailableFeatures(Object arole) {
        LOG.log(Level.INFO, "allAvailableFeatures start");

        if (isClassifierRole(arole)) {
            try {
                List<Feature> returnList = new ArrayList<Feature>();
                ClassifierRole role = (ClassifierRole) arole;
                for (ModelElement genElem
                        : CoreHelperMDRImpl.getAllParents(role)) {
                    if (isClassifierRole(genElem)) {
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
            if (isClassifierRole(arole)) {
                List returnList = new ArrayList();
                ClassifierRole role = (ClassifierRole) arole;
                for (ModelElement genElem
                        : CoreHelperMDRImpl.getAllParents(role)) {
                    if (isClassifierRole(genElem)) {
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
            if (isClassifierRole(role)) {
                return getAllPossibleBases((ClassifierRole) role);
            } else if (isAssociationRole(role)) {
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
        if (isNull(aRole) || isNull(aRole.getNamespace())) {
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
            if (isNotNull(type)) {
                bases.addAll(type.getBase());
            }
        }
        if (isEmpty(bases)) {
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
            if (isEmpty(associationRoles)) {
                continue;
            }
            // if we are unnamed eliminate all classifiers which are already
            // the base of some role
            if (isNull(aRole.getName()) || aRole.getName().equals("")) {
                listToRemove.add(association);
            } else {
                // eliminate Classifiers which already have an unnamed role
                for (AssociationRole ar : associationRoles) {
                    if (isNull(ar.getName()) || ar.getName().equals("")) {
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
        if (isNull(role) || isNull(modelImpl.getFacade().getNamespace(role))) {
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
            if (isEmpty(classifierRoles)) {
                continue;
            }
            // if we are unnamed eliminate all classifiers which are already
            // the base of some role
            if (isNull(role.getName()) || role.getName().equals("")) {
                listToRemove.add(classifier);
            } else {
                // eliminate Classifiers which already have an unnamed role
                for (ClassifierRole cr : classifierRoles) {
                    if (isNull(cr.getName()) || cr.getName().equals("")) {
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
            if (isClassifier(o) && !isClassifierRole(o))
                out.add((Classifier) o);
        }
        return out;
    }


    public void setBase(Object arole, Object abase) {
        if (isNull(arole)) {
            throw new IllegalArgumentException("role is null");
        }
        if (isAssociationRole(arole)) {
            AssociationRole role = (AssociationRole) arole;
            UmlAssociation base = (UmlAssociation) abase;

            // TODO: Must we calculate the whole list?
            if (isNotNull(base) && !contains(getAllPossibleBases(role), base)) {
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

            if (isNotNull(base)) {
                for (AssociationEnd end : base.getConnection()) {
                    if (contains(senderBases, end.getParticipant())) {
                        senderRole.setBase(end);
                    } else if (contains(receiverBases, end.getParticipant())) {
                        receiverRole.setBase(end);
                    }
                }
            }

            return;
        } else if (isAssociationEndRole(arole)) {
            AssociationEndRole role = (AssociationEndRole) arole;
            AssociationEnd base = (AssociationEnd) abase;

            role.setBase(base);

            return;
        }

        throw new IllegalArgumentException("role");
    }


    public boolean isAddingCollaborationAllowed(Object context) {
        return (
                isClassifier(context)
                || isOperation(context)
                //|| context instanceof Collaboration
                //|| context instanceof Model
                );
    }


    public void removeBase(Object handle, Object c) {
        try {
            if (isClassifierRole(handle) && isClassifier(c)) {
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
            if (isCollaboration(handle) && isModelElement(constraint)) {
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
            if (isInteraction(handle) && isMessage(message)) {
                ((Interaction) handle).getMessage().remove(message);
                return;
            }
            if (isAssociationRole(handle) && isMessage(message)) {
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
            if (isMessage(handle) && isMessage(mess)) {
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
            if (isMessage(handle) && isMessage(message)) {
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
        if (isCollaboration(handle) && isModelElement(constraint)) {
            ((Collaboration) handle).getConstrainingElement().add(
                    (ModelElement) constraint);
            return;
        }

        throw new IllegalArgumentException("handle: " + handle
                + " or constraint: " + constraint);
    }


    public void addInstance(Object classifierRole, Object instance) {
        if (isClassifierRole(classifierRole) && isInstance(instance)) {
            ((ClassifierRole) classifierRole).getConformingInstance().add(
                    (Instance) instance);
        }
        throw new IllegalArgumentException("classifierRole: " + classifierRole
                + " or instance: " + instance);
    }


    public void addMessage(Object handle, Object elem) {
        if (isInteraction(handle) && isMessage(elem)) {
            final Message message = (Message) elem;
            final Interaction interaction = (Interaction) handle;
            final Interaction oldInteraction = message.getInteraction();

            if (isNotNull(oldInteraction)) {
                oldInteraction.getMessage().remove(message);
            }
            interaction.getMessage().add(message);
            return;
        }
        if (isAssociationRole(handle) && isMessage(elem)) {
            ((AssociationRole) handle).getMessage().add((Message) elem);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or elem: "
                + elem);
    }


    public void addSuccessor(Object handle, Object mess) {
        if (isMessage(handle) && isMessage(mess)) {
            ((Message) mess).getPredecessor().add((Message) handle);
            return;
        }

        throw new IllegalArgumentException("predecessor: " + handle
                + " or successor: " + mess);
    }


    public void addPredecessor(Object handle, Object predecessor) {
        if (isNotNull(handle) && isMessage(handle) && isNotNull(predecessor)
                && isMessage(predecessor)) {
            ((Message) handle).getPredecessor().add((Message) predecessor);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or predecessor: " + predecessor);
    }


    public void setAction(Object handle, Object action) {
        if (isMessage(handle)
                && (isNull(action) || isAction(action))) {
            ((Message) handle).setAction((Action) action);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or action: "
                + action);
    }


    public void setContext(Object handle, Object col) {
        if (isInteraction(handle)
                && (isCollaboration(col) || isNull(col))) {
            ((Interaction) handle).setContext((Collaboration) col);

            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or col: "
                + col);
    }


    public void setSuccessors(Object handle, Collection messages) {
        if (isMessage(handle)) {
            Collection currentMessages =
                Model.getFacade().getSuccessors(handle);
            if (!isEmpty(currentMessages)) {
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
        if (isMessage(handle)) {
            CollectionHelper.update(
                    ((Message) handle).getPredecessor(), predecessors);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or predecessors: " + predecessors);
    }


    public void setRepresentedClassifier(Object handle, Object classifier) {
        if (isCollaboration(handle)
                && (isNull(classifier) || isClassifier(classifier))) {
            ((Collaboration) handle).
                setRepresentedClassifier((Classifier) classifier);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or classifier: " + classifier);
    }


    public void setRepresentedOperation(Object handle, Object operation) {
        if (isCollaboration(handle)
                && (isNull(operation) || isOperation(operation))) {
            ((Collaboration) handle).
                setRepresentedOperation((Operation) operation);

            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or operation: " + operation);
    }


    public void setSender(Object handle, Object sender) {
        if (isMessage(handle)
                && (isClassifierRole(sender) || isNull(sender))) {
            ((Message) handle).setSender((ClassifierRole) sender);
            return;
        }
        if (isStimulus(handle) && isInstance(sender)) {
            ((Stimulus) handle).setSender((Instance) sender);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or sender: "
                + sender);
    }


    public void removeInteraction(Object collab, Object interaction) {
        try {
            if (isCollaboration(collab) && isInteraction(interaction)) {
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

private boolean isNull(Object o) {
    return o == null;
}

private boolean isNotNull(Object o) {
    return o != null;
}

private boolean isEmpty(Collection c) {
    return c == null || c.isEmpty();
}

private boolean isNotEmpty(Collection c) {
    return c != null && !c.isEmpty();
}

private boolean isOneElement(Collection c) {
    return c != null && c.size() == 1;
}

private boolean contains(Collection c, Object o) {
    return c != null && c.contains(o);
}

private boolean isEqual(Object a, Object b) {
    return a == b;
}

private boolean isNotEqual(Object a, Object b) {
    return a != b;
}

private boolean isNotRole(Classifier classifier, Object role) {
    return !isEqual(classifier, role);
}

private boolean isClassifier(Object o) {
    return o instanceof Classifier;
}

private boolean isClassifierRole(Object o) {
    return o instanceof ClassifierRole;
}

private boolean isAssociationRole(Object o) {
    return o instanceof AssociationRole;
}

private boolean isAssociationEndRole(Object o) {
    return o instanceof AssociationEndRole;
}

private boolean isNamespace(Object o) {
    return o instanceof Namespace;
}

private boolean isMessage(Object o) {
    return o instanceof Message;
}

private boolean isInteraction(Object o) {
    return o instanceof Interaction;
}

private boolean isCollaboration(Object o) {
    return o instanceof Collaboration;
}

private boolean isModelElement(Object o) {
    return o instanceof ModelElement;
}

private boolean isOperation(Object o) {
    return o instanceof Operation;
}

private boolean isAction(Object o) {
    return o instanceof Action;
}

private boolean isInstance(Object o) {
    return o instanceof Instance;
}

private boolean isStimulus(Object o) {
    return o instanceof Stimulus;
}