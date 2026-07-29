package org.argouml.model.mdr;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.jmi.reflect.InvalidObjectException;
import javax.jmi.reflect.RefObject;

import org.argouml.model.Defaults;
import org.argouml.model.DummyModelCommand;
import org.argouml.model.IllegalModelElementConnectionException;
import org.argouml.model.InvalidElementException;
import org.argouml.model.MetaTypes;
import org.argouml.model.Model;
import org.argouml.model.UmlFactory;
import org.omg.uml.behavioralelements.activitygraphs.ActionState;
import org.omg.uml.behavioralelements.activitygraphs.ActivityGraph;
import org.omg.uml.behavioralelements.activitygraphs.CallState;
import org.omg.uml.behavioralelements.activitygraphs.ClassifierInState;
import org.omg.uml.behavioralelements.activitygraphs.ObjectFlowState;
import org.omg.uml.behavioralelements.activitygraphs.Partition;
import org.omg.uml.behavioralelements.activitygraphs.SubactivityState;
import org.omg.uml.behavioralelements.collaborations.AssociationEndRole;
import org.omg.uml.behavioralelements.collaborations.AssociationRole;
import org.omg.uml.behavioralelements.collaborations.ClassifierRole;
import org.omg.uml.behavioralelements.collaborations.Collaboration;
import org.omg.uml.behavioralelements.collaborations.CollaborationInstanceSet;
import org.omg.uml.behavioralelements.collaborations.Interaction;
import org.omg.uml.behavioralelements.collaborations.InteractionInstanceSet;
import org.omg.uml.behavioralelements.collaborations.Message;
import org.omg.uml.behavioralelements.commonbehavior.Action;
import org.omg.uml.behavioralelements.commonbehavior.ActionSequence;
import org.omg.uml.behavioralelements.commonbehavior.Argument;
import org.omg.uml.behavioralelements.commonbehavior.AttributeLink;
import org.omg.uml.behavioralelements.commonbehavior.CallAction;
import org.omg.uml.behavioralelements.commonbehavior.ComponentInstance;
import org.omg.uml.behavioralelements.commonbehavior.CreateAction;
import org.omg.uml.behavioralelements.commonbehavior.DataValue;
import org.omg.uml.behavioralelements.commonbehavior.DestroyAction;
import org.omg.uml.behavioralelements.commonbehavior.Instance;
import org.omg.uml.behavioralelements.commonbehavior.Link;
import org.omg.uml.behavioralelements.commonbehavior.LinkEnd;
import org.omg.uml.behavioralelements.commonbehavior.LinkObject;
import org.omg.uml.behavioralelements.commonbehavior.NodeInstance;
import org.omg.uml.behavioralelements.commonbehavior.Reception;
import org.omg.uml.behavioralelements.commonbehavior.ReturnAction;
import org.omg.uml.behavioralelements.commonbehavior.SendAction;
import org.omg.uml.behavioralelements.commonbehavior.Signal;
import org.omg.uml.behavioralelements.commonbehavior.Stimulus;
import org.omg.uml.behavioralelements.commonbehavior.SubsystemInstance;
import org.omg.uml.behavioralelements.commonbehavior.TerminateAction;
import org.omg.uml.behavioralelements.commonbehavior.UmlException;
import org.omg.uml.behavioralelements.commonbehavior.UninterpretedAction;
import org.omg.uml.behavioralelements.statemachines.CallEvent;
import org.omg.uml.behavioralelements.statemachines.ChangeEvent;
import org.omg.uml.behavioralelements.statemachines.CompositeState;
import org.omg.uml.behavioralelements.statemachines.Event;
import org.omg.uml.behavioralelements.statemachines.FinalState;
import org.omg.uml.behavioralelements.statemachines.Guard;
import org.omg.uml.behavioralelements.statemachines.Pseudostate;
import org.omg.uml.behavioralelements.statemachines.SignalEvent;
import org.omg.uml.behavioralelements.statemachines.SimpleState;
import org.omg.uml.behavioralelements.statemachines.State;
import org.omg.uml.behavioralelements.statemachines.StateMachine;
import org.omg.uml.behavioralelements.statemachines.StateVertex;
import org.omg.uml.behavioralelements.statemachines.StubState;
import org.omg.uml.behavioralelements.statemachines.SubmachineState;
import org.omg.uml.behavioralelements.statemachines.SynchState;
import org.omg.uml.behavioralelements.statemachines.TimeEvent;
import org.omg.uml.behavioralelements.statemachines.Transition;
import org.omg.uml.behavioralelements.usecases.Actor;
import org.omg.uml.behavioralelements.usecases.Extend;
import org.omg.uml.behavioralelements.usecases.ExtensionPoint;
import org.omg.uml.behavioralelements.usecases.Include;
import org.omg.uml.behavioralelements.usecases.UseCase;
import org.omg.uml.behavioralelements.usecases.UseCaseInstance;
import org.omg.uml.foundation.core.Abstraction;
import org.omg.uml.foundation.core.Artifact;
import org.omg.uml.foundation.core.AssociationClass;
import org.omg.uml.foundation.core.AssociationEnd;
import org.omg.uml.foundation.core.Attribute;
import org.omg.uml.foundation.core.BehavioralFeature;
import org.omg.uml.foundation.core.Binding;
import org.omg.uml.foundation.core.Classifier;
import org.omg.uml.foundation.core.Comment;
import org.omg.uml.foundation.core.Component;
import org.omg.uml.foundation.core.Constraint;
import org.omg.uml.foundation.core.DataType;
import org.omg.uml.foundation.core.Dependency;
import org.omg.uml.foundation.core.Element;
import org.omg.uml.foundation.core.ElementResidence;
import org.omg.uml.foundation.core.Enumeration;
import org.omg.uml.foundation.core.EnumerationLiteral;
import org.omg.uml.foundation.core.Feature;
import org.omg.uml.foundation.core.Flow;
import org.omg.uml.foundation.core.GeneralizableElement;
import org.omg.uml.foundation.core.Generalization;
import org.omg.uml.foundation.core.Interface;
import org.omg.uml.foundation.core.Method;
import org.omg.uml.foundation.core.ModelElement;
import org.omg.uml.foundation.core.Namespace;
import org.omg.uml.foundation.core.Node;
import org.omg.uml.foundation.core.Operation;
import org.omg.uml.foundation.core.Parameter;
import org.omg.uml.foundation.core.Permission;
import org.omg.uml.foundation.core.PresentationElement;
import org.omg.uml.foundation.core.Primitive;
import org.omg.uml.foundation.core.ProgrammingLanguageDataType;
import org.omg.uml.foundation.core.Relationship;
import org.omg.uml.foundation.core.Stereotype;
import org.omg.uml.foundation.core.StructuralFeature;
import org.omg.uml.foundation.core.TagDefinition;
import org.omg.uml.foundation.core.TaggedValue;
import org.omg.uml.foundation.core.TemplateArgument;
import org.omg.uml.foundation.core.TemplateParameter;
import org.omg.uml.foundation.core.UmlAssociation;
import org.omg.uml.foundation.core.UmlClass;
import org.omg.uml.foundation.core.Usage;
import org.omg.uml.modelmanagement.ElementImport;
import org.omg.uml.modelmanagement.Subsystem;
import org.omg.uml.modelmanagement.UmlPackage;

/**
 * Root factory for UML model element instance creation.<p>
 *
 * @since ARGO0.19.5
 * @author Ludovic Ma&icirc;tre
 * based on NSUML implementation by:
 * @author Thierry Lach
 */
class UmlFactoryMDRImpl extends AbstractUmlModelFactoryMDR implements
        UmlFactory {

    /**
     * The logger.
     */
    private static final Logger LOG =
        Logger.getLogger(UmlFactoryMDRImpl.class.getName());

    /**
     * The model implementation.
     */
    private MDRModelImplementation modelImpl;

    /**
     * The meta types factory.
     */
    private MetaTypes metaTypes;

    /**
     * A map of valid connections keyed by the connection type. The constructor
     * builds this from the data in the VALID_CONNECTIONS array
     */
    private Map<Class<?>, List<Class<?>[]>> validConnectionMap =
        new HashMap<Class<?>, List<Class<?>[]>>();

    /**
     * A map of the valid model elements that are valid to be contained
     * by other model elements.
     */
    private HashMap<Class<?>, Class<?>[]> validContainmentMap =
        new HashMap<Class<?>, Class<?>[]>();

    /**
     * The instance that we are deleting.
     */
    private Set<RefObject> elementsToBeDeleted = new HashSet<RefObject>();

    /**
     * Ordered list of elements to be deleted.
     */
    private List<RefObject> elementsInDeletionOrder =
        new ArrayList<RefObject>();

    /**
     * The top object is the first object given to the UmlFactory when calling
     * the delete method.
     */
    private Object top;

    /**
     * The mutex for this class.
     */
    private Object lock = new Byte[0];

    /**
     * A map of connection builders keyed by the connection type.
     */
    private Map<Object, ConnectionBuilder> connectionBuilders =
        new HashMap<Object, ConnectionBuilder>();

    /**
     * Interface for building connections.
     */
    private interface ConnectionBuilder {
        Object build(Object fromElement, Object fromStyle, Object toElement,
                     Object toStyle, boolean uni, Object namespace);
    }

    /**
     * Array of valid connections.
     */
    private static final Class<?>[][] VALID_CONNECTIONS = {
        {Generalization.class,   GeneralizableElement.class, },
        {Dependency.class,       ModelElement.class, },
        {Usage.class,            ModelElement.class, },
        {Permission.class,       ModelElement.class, },
        {Abstraction.class, UmlClass.class, Interface.class, null, },
        {Abstraction.class, UmlClass.class, UmlClass.class, null, },
        {Abstraction.class, UmlPackage.class, UmlPackage.class, null, },
        {Abstraction.class, Component.class, Interface.class, null, },
        {UmlAssociation.class,     Classifier.class, },
        {AssociationRole.class,  ClassifierRole.class, },
        {Extend.class,           UseCase.class, },
        {Include.class,          UseCase.class, },
        {Link.class, Instance.class, },
        {Transition.class,       StateVertex.class, },
        {AssociationClass.class, UmlClass.class, },
        {AssociationEnd.class, Classifier.class, UmlAssociation.class, },
        {Message.class, ClassifierRole.class },
    };

    /**
     * Package-private constructor.
     *
     * @param implementation
     *            To get other helpers and factories.
     */
    UmlFactoryMDRImpl(MDRModelImplementation implementation) {
        modelImpl = implementation;
        metaTypes = modelImpl.getMetaTypes();

        buildValidConnectionMap();

        buildValidContainmentMap();

        buildConnectionBuilders();
    }

    private void buildConnectionBuilders() {
        connectionBuilders.put(metaTypes.getAssociation(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getCore().buildAssociation(fromElement, fromStyle,
                                toElement, toStyle, uni);
                    }
                });

        connectionBuilders.put(metaTypes.getAssociationEnd(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        if (fromElement instanceof UmlAssociation) {
                            return getCore().buildAssociationEnd(toElement,
                                    fromElement);
                        } else if (fromElement instanceof Classifier) {
                            return getCore().buildAssociationEnd(fromElement,
                                    toElement);
                        }
                        return null;
                    }
                });

        connectionBuilders.put(metaTypes.getAssociationClass(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getCore().buildAssociationClass(fromElement,
                                toElement);
                    }
                });

        connectionBuilders.put(metaTypes.getAssociationRole(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getCollaborations().buildAssociationRole(
                                fromElement, fromStyle, toElement, toStyle,
                                uni);
                    }
                });

        connectionBuilders.put(metaTypes.getGeneralization(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getCore().buildGeneralization(fromElement,
                                toElement);
                    }
                });

        connectionBuilders.put(metaTypes.getPackageImport(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getCore().buildPackageImport(fromElement,
                                toElement);
                    }
                });

        connectionBuilders.put(metaTypes.getUsage(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getCore().buildUsage(fromElement, toElement);
                    }
                });

        connectionBuilders.put(metaTypes.getDependency(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getCore().buildDependency(fromElement,
                                toElement);
                    }
                });

        connectionBuilders.put(metaTypes.getAbstraction(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getCore().buildRealization(fromElement,
                                toElement, namespace);
                    }
                });

        connectionBuilders.put(metaTypes.getLink(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getCommonBehavior().buildLink(fromElement,
                                toElement);
                    }
                });

        connectionBuilders.put(metaTypes.getExtend(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getUseCases().buildExtend(toElement, fromElement);
                    }
                });

        connectionBuilders.put(metaTypes.getInclude(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getUseCases().buildInclude(fromElement,
                                toElement);
                    }
                });

        connectionBuilders.put(metaTypes.getTransition(),
                new ConnectionBuilder() {
                    public Object build(Object fromElement, Object fromStyle,
                            Object toElement, Object toStyle, boolean uni,
                            Object namespace) {
                        return getStateMachines().buildTransition(fromElement,
                                toElement);
                    }
                });
    }

    private void buildValidConnectionMap() {
        for (int i = 0; i < VALID_CONNECTIONS.length; ++i) {
            final Class<?> connection = VALID_CONNECTIONS[i][0];
            List<Class<?>[]> validItems = validConnectionMap.get(connection);
            if (validItems == null) {
                validItems = new ArrayList<Class<?>[]>();
                validConnectionMap.put(connection, validItems);
            }
            if (VALID_CONNECTIONS[i].length < 3) {
                Class<?>[] modeElementPair = new Class[2];
                modeElementPair[0] = VALID_CONNECTIONS[i][1];
                modeElementPair[1] = VALID_CONNECTIONS[i][1];
                validItems.add(modeElementPair);
            } else {
                Class<?>[] modeElementPair = new Class[2];
                modeElementPair[0] = VALID_CONNECTIONS[i][1];
                modeElementPair[1] = VALID_CONNECTIONS[i][2];
                validItems.add(modeElementPair);
                if (VALID_CONNECTIONS[i].length < 4) {
                    Class<?>[] reversedModeElementPair = new Class[2];
                    reversedModeElementPair[0] = VALID_CONNECTIONS[i][2];
                    reversedModeElementPair[1] = VALID_CONNECTIONS[i][1];
                    validItems.add(reversedModeElementPair);
                }
            }
        }
    }

    // ... (rest of the class unchanged until buildConnection)

    public Object buildConnection(Object elementType, Object fromElement,
            Object fromStyle, Object toElement, Object toStyle,
            Object unidirectional, Object namespace)
        throws IllegalModelElementConnectionException {

        if (!isConnectionValid(elementType, fromElement, toElement, true)) {
            throw new IllegalModelElementConnectionException("Cannot make a "
                    + elementType.getClass().getName() + " between a "
                    + fromElement.getClass().getName() + " and a "
                    + toElement.getClass().getName());
        }

        Object connection = null;
        boolean uni = (unidirectional instanceof Boolean)
            ? ((Boolean) unidirectional).booleanValue() : false;

        ConnectionBuilder builder = connectionBuilders.get(elementType);
        if (builder != null) {
            connection = builder.build(fromElement, fromStyle, toElement,
                    toStyle, uni, namespace);
        }

        if (connection == null) {
            throw new IllegalModelElementConnectionException("Cannot make a "
                    + elementType.getClass().getName() + " between a "
                    + fromElement.getClass().getName() + " and a "
                    + toElement.getClass().getName());
        }

        return connection;
    }

    // ... (rest of the class unchanged)
}