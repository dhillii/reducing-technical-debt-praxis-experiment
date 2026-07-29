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

class UmlFactoryMDRImpl extends AbstractUmlModelFactoryMDR implements
        UmlFactory {

    private static final Logger LOG =
        Logger.getLogger(UmlFactoryMDRImpl.class.getName());

    private MDRModelImplementation modelImpl;

    private MetaTypes metaTypes;

    private Map<Class<?>, List<Class<?>[]>> validConnectionMap =
        new HashMap<Class<?>, List<Class<?>[]>>();

    private HashMap<Class<?>, Class<?>[]> validContainmentMap =
        new HashMap<Class<?>, Class<?>[]>();

    private Set<RefObject> elementsToBeDeleted = new HashSet<RefObject>();

    private List<RefObject> elementsInDeletionOrder =
        new ArrayList<RefObject>();

    private Object top;

    private Object lock = new Byte[0];

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

    UmlFactoryMDRImpl(MDRModelImplementation implementation) {
        modelImpl = implementation;
        metaTypes = modelImpl.getMetaTypes();

        buildValidConnectionMap();

        buildValidContainmentMap();
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

    private void buildValidContainmentMap() {

        validContainmentMap.clear();

        validContainmentMap.put(ModelElement.class,
                new Class<?>[] {
                    TemplateParameter.class
                });

        validContainmentMap.put(org.omg.uml.modelmanagement.Model.class,
            new Class<?>[] {
                TemplateParameter.class,
                ComponentInstance.class, NodeInstance.class
            });

        validContainmentMap.put(AssociationEnd.class,
            new Class<?>[] {
                Attribute.class
            });

        validContainmentMap.put(UmlPackage.class,
            new Class<?>[] {
                TemplateParameter.class,
                UmlPackage.class, Actor.class,
                UseCase.class, UmlClass.class,
                Interface.class, Component.class,
                Node.class, Stereotype.class,
                Enumeration.class, DataType.class,
                UmlException.class, Signal.class
            });

        validContainmentMap.put(UmlClass.class,
            new Class<?>[] {
                TemplateParameter.class,
                Attribute.class, Operation.class,
                UmlClass.class, Reception.class
            });

        validContainmentMap.put(Classifier.class,
            new Class<?>[] {
                TemplateParameter.class
            });

        validContainmentMap.put(Interface.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Operation.class, Reception.class
                });

        validContainmentMap.put(Signal.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Operation.class, Attribute.class
                });

        validContainmentMap.put(Actor.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Operation.class,
                    Reception.class
                });

        validContainmentMap.put(UseCase.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    ExtensionPoint.class, Attribute.class,
                    Operation.class, Reception.class
                });

        validContainmentMap.put(Extend.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    ExtensionPoint.class
                });

        validContainmentMap.put(Component.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Reception.class,
                    Operation.class
                });

        validContainmentMap.put(Node.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Operation.class,
                    Reception.class
                });

        validContainmentMap.put(Enumeration.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    EnumerationLiteral.class, Operation.class
                });

        validContainmentMap.put(DataType.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Operation.class,
                    Reception.class
                });

        validContainmentMap.put(Operation.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Parameter.class,
                    Signal.class,
                    Method.class
                });

        validContainmentMap.put(Event.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Parameter.class
                });

        validContainmentMap.put(ObjectFlowState.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Parameter.class
                });

        validContainmentMap.put(AssociationRole.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Message.class
                });

        validContainmentMap.put(CallAction.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Argument.class
                });

        validContainmentMap.put(UninterpretedAction.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Argument.class
                });

        validContainmentMap.put(ReturnAction.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Argument.class
                });

        validContainmentMap.put(DestroyAction.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Argument.class
                });

        validContainmentMap.put(SendAction.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Argument.class
                });

        validContainmentMap.put(TerminateAction.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Argument.class
                });

        validContainmentMap.put(ActionSequence.class,
                new Class<?>[] {
                    TemplateParameter.class, Argument.class,
                    CallAction.class, ReturnAction.class, CreateAction.class,
                    DestroyAction.class, SendAction.class,
                    TerminateAction.class, UninterpretedAction.class,
                    ActionSequence.class,
                });

        validContainmentMap.put(Transition.class,
                new Class<?>[] {
                    TemplateParameter.class,
                    Guard.class,
                    CallAction.class, ReturnAction.class,
                    CreateAction.class, DestroyAction.class, SendAction.class, TerminateAction.class, UninterpretedAction.class, ActionSequence.class,
                    CallEvent.class, ChangeEvent.class, SignalEvent.class, TimeEvent.class
                });

        validContainmentMap.put(SignalEvent.class,
                new Class<?>[] {
                    Signal.class
                });

        validContainmentMap.put(Reception.class,
                new Class<?>[] {
                    Parameter.class,
                    TemplateParameter.class
                });

        validContainmentMap.put(State.class,
                new Class<?>[] {
                    CallEvent.class, ChangeEvent.class, SignalEvent.class,
                    TimeEvent.class
                });

        validContainmentMap.put(CallState.class,
                new Class<?>[] {
                    CallAction.class,
                    CallEvent.class, ChangeEvent.class, SignalEvent.class,
                    TimeEvent.class
                });

        validContainmentMap.put(SimpleState.class,
                new Class<?>[] {
                    Transition.class,
                    CallAction.class, CreateAction.class, DestroyAction.class,
                    ReturnAction.class, SendAction.class,
                    TerminateAction.class,
                    UninterpretedAction.class, ActionSequence.class,
                    CallEvent.class, ChangeEvent.class, SignalEvent.class,
                    TimeEvent.class
                });

        validContainmentMap.put(FinalState.class,
                new Class<?>[] {
                    Transition.class,
                    CallAction.class, CreateAction.class, DestroyAction.class,
                    ReturnAction.class, SendAction.class, TerminateAction.class,
                    UninterpretedAction.class, ActionSequence.class
                });

        validContainmentMap.put(SubactivityState.class,
                new Class<?>[] {
                    Transition.class,
                    CallAction.class, CreateAction.class, DestroyAction.class,
                    ReturnAction.class, SendAction.class, TerminateAction.class,
                    UninterpretedAction.class, ActionSequence.class,
                    CallEvent.class, ChangeEvent.class, SignalEvent.class,
                    TimeEvent.class
                });

        validContainmentMap.put(ActionState.class,
                new Class<?>[] {
                    CallAction.class, CreateAction.class, DestroyAction.class,
                    ReturnAction.class, SendAction.class, TerminateAction.class,
                    UninterpretedAction.class, ActionSequence.class,
                    CallEvent.class, ChangeEvent.class, SignalEvent.class,
                    TimeEvent.class
                });

        validContainmentMap.put(CompositeState.class,
                new Class<?>[] {
                    Transition.class,
                    Pseudostate.class, SynchState.class, StubState.class,
                    CompositeState.class, SimpleState.class,
                    FinalState.class,
                    SubmachineState.class,
                    CallAction.class, CreateAction.class, DestroyAction.class,
                    ReturnAction.class, SendAction.class,
                    TerminateAction.class,
                    UninterpretedAction.class, ActionSequence.class
                });

    }

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

        Object connection = buildConnectionByType(elementType, fromElement,
                fromStyle, toElement, toStyle, unidirectional, namespace);

        if (connection == null) {
            throw new IllegalModelElementConnectionException("Cannot make a "
                    + elementType.getClass().getName() + " between a "
                    + fromElement.getClass().getName() + " and a "
                    + toElement.getClass().getName());
        }

        return connection;
    }

    private Object buildConnectionByType(Object elementType, Object fromElement,
            Object fromStyle, Object toElement, Object toStyle,
            Object unidirectional, Object namespace) {
        boolean uni = (unidirectional instanceof Boolean)
            ? ((Boolean) unidirectional).booleanValue() : false;

        if (elementType == metaTypes.getAssociation()) {
            return getCore().buildAssociation(fromElement,
                    fromStyle, toElement, toStyle, uni);
        }
        if (elementType == metaTypes.getAssociationEnd()) {
            return buildAssociationEnd(fromElement, toElement);
        }
        if (elementType == metaTypes.getAssociationClass()) {
            return getCore().buildAssociationClass(fromElement, toElement);
        }
        if (elementType == metaTypes.getAssociationRole()) {
            return getCollaborations().buildAssociationRole(fromElement,
                    fromStyle, toElement, toStyle, uni);
        }
        if (elementType == metaTypes.getGeneralization()) {
            return getCore().buildGeneralization(fromElement, toElement);
        }
        if (elementType == metaTypes.getPackageImport()) {
            return getCore().buildPackageImport(fromElement, toElement);
        }
        if (elementType == metaTypes.getUsage()) {
            return getCore().buildUsage(fromElement, toElement);
        }
        if (elementType == metaTypes.getDependency()) {
            return getCore().buildDependency(fromElement, toElement);
        }
        if (elementType == metaTypes.getAbstraction()) {
            return getCore().buildRealization(fromElement, toElement, namespace);
        }
        if (elementType == metaTypes.getLink()) {
            return getCommonBehavior().buildLink(fromElement, toElement);
        }
        if (elementType == metaTypes.getExtend()) {
            return getUseCases().buildExtend(toElement, fromElement);
        }
        if (elementType == metaTypes.getInclude()) {
            return getUseCases().buildInclude(fromElement, toElement);
        }
        if (elementType == metaTypes.getTransition()) {
            return getStateMachines().buildTransition(fromElement, toElement);
        }
        return null;
    }

    private Object buildAssociationEnd(Object fromElement, Object toElement) {
        if (fromElement instanceof UmlAssociation) {
            return getCore().buildAssociationEnd(toElement, fromElement);
        } else if (fromElement instanceof Classifier) {
            return getCore().buildAssociationEnd(fromElement, toElement);
        }
        return null;
    }

    public Object buildNode(Object elementType) {
        if (elementType == metaTypes.getActor()) {
            return getUseCases().createActor();
        } else if (elementType == metaTypes.getUseCase()) {
            return getUseCases().createUseCase();
        } else if (elementType == metaTypes.getUMLClass()) {
            return getCore().buildClass();
        } else if (elementType == metaTypes.getInterface()) {
            return getCore().buildInterface();
        } else if (elementType == metaTypes.getDataType()) {
            return getCore().createDataType();
        } else if (elementType == metaTypes.getPackage()) {
            return getModelManagement().createPackage();
        } else if (elementType == metaTypes.getModel()) {
            return getModelManagement().createModel();
        } else if (elementType == metaTypes.getInstance()) {
            throw new IllegalArgumentException(
                    "Attempt to instantiate abstract type");
        } else if (elementType == metaTypes.getSubsystem()) {
            return getModelManagement().createSubsystem();
        } else if (elementType == metaTypes.getCallState()) {
            return getActivityGraphs().createCallState();
        } else if (elementType == metaTypes.getSimpleState()) {
            return getStateMachines().createSimpleState();
        } else if (elementType == metaTypes.getFinalState()) {
            return getStateMachines().createFinalState();
        } else if (elementType == metaTypes.getPseudostate()) {
            return getStateMachines().createPseudostate();
        } else if (elementType == metaTypes.getObjectFlowState()) {
            return getActivityGraphs().createObjectFlowState();
        } else if (elementType == metaTypes.getActionState()) {
            return getActivityGraphs().createActionState();
        } else if (elementType == metaTypes.getSubactivityState()) {
            return getActivityGraphs().createSubactivityState();
        } else if (elementType == metaTypes.getPartition()) {
            return getActivityGraphs().createPartition();
        } else if (elementType == metaTypes.getStubState()) {
            return getStateMachines().createStubState();
        } else if (elementType == metaTypes.getSubmachineState()) {
            return getStateMachines().createSubmachineState();
        } else if (elementType == metaTypes.getCompositeState()) {
            return getStateMachines().createCompositeState();
        } else if (elementType == metaTypes.getSynchState()) {
            return getStateMachines().createSynchState();
        } else if (elementType == metaTypes.getState()) {
            throw new IllegalArgumentException(
                    "Attempt to instantiate abstract type");
        } else if (elementType == modelImpl.getMetaTypes().getSimpleState()) {
            return getStateMachines().createSimpleState();
        } else if (elementType == metaTypes.getClassifierRole()) {
            return getCollaborations().createClassifierRole();
        } else if (elementType == metaTypes.getComponent()) {
            return getCore().createComponent();
        } else if (elementType == metaTypes.getComponentInstance()) {
            return getCommonBehavior().createComponentInstance();
        } else if (elementType == metaTypes.getNode()) {
            return getCore().createNode();
        } else if (elementType == metaTypes.getNodeInstance()) {
            return getCommonBehavior().createNodeInstance();
        } else if (elementType == metaTypes.getObject()) {
            return getCommonBehavior().createObject();
        } else if (elementType == metaTypes.getComment()) {
            return getCore().createComment();
        } else if (elementType == metaTypes.getNamespace()) {
            throw new IllegalArgumentException(
                    "Attempt to instantiate abstract type");
        } else if (elementType == metaTypes.getOperation()) {
            return getCore().createOperation();
        } else if (elementType == metaTypes.getEnumeration()) {
            return getCore().createEnumeration();
        } else if (elementType == metaTypes.getStereotype()) {
            return getExtensionMechanisms().createStereotype();
        } else if (elementType == metaTypes.getAttribute()) {
            return getCore().buildAttribute();
        } else if (elementType == metaTypes.getSignal()) {
            return getCommonBehavior().createSignal();
        } else if (elementType == metaTypes.getException()) {
            return getCommonBehavior().createException();
        } else if (elementType == metaTypes.getTransition()) {
            return getStateMachines().createTransition();
        }

        throw new IllegalArgumentException(
                "Attempted to create unsupported model element type: "
                + elementType);
    }

    public Object buildNode(Object elementType, Object container, String property, Defaults defaults) {
        Object element = buildNode(elementType, container, property);
        if (defaults != null) {
            final Object type = defaults.getDefaultType(elementType);
            final String name = defaults.getDefaultName(elementType);
            if (type != null) {
                modelImpl.getCoreHelper().setType(element, type);
            }
            if (name != null) {
                modelImpl.getCoreHelper().setName(element, name);
            } else {
                modelImpl.getCoreHelper().setName(element, "");
            }
        }
        return element;
    }


    public Object buildNode(Object elementType, Object container, String properyName) {

        Object element = null;

        if (this.modelImpl.getFacade().isAFeature(container)
                && elementType != metaTypes.getParameter()
                && elementType != metaTypes.getMethod()
                && elementType != metaTypes.getSignal()) {
            container = this.modelImpl.getFacade().getOwner(container);
        }

        element = buildSpecialNode(elementType, container, properyName);
        if (element != null) {
            modelImpl.getCoreHelper().setName(element, "");
            return element;
        }

        element = buildNode(elementType);

        if (container instanceof Namespace
                && element instanceof Namespace) {
            ((Namespace) element).setNamespace(
                    ((Namespace) container).getNamespace());
        }

        this.modelImpl.getCoreHelper().addOwnedElement(container, element);
        modelImpl.getCoreHelper().setName(element, "");
        return element;
    }

    private Object buildSpecialNode(Object elementType, Object container, String properyName) {
        if (elementType == this.metaTypes.getAttribute()) {
            return getCore().buildAttribute2(container, null);
        } else if (elementType == this.metaTypes.getOperation()) {
            return getCore().buildOperation(container, null);
        } else if (elementType == this.metaTypes.getReception()) {
            return this.modelImpl.getCommonBehaviorFactory().buildReception(container);
        } else if (elementType == this.metaTypes.getEnumerationLiteral()) {
            return getCore().buildEnumerationLiteral(null, container);
        } else if (elementType == this.metaTypes.getExtensionPoint()) {
            return this.modelImpl.getUseCasesFactory().buildExtensionPoint(container);
        } else if (elementType == this.metaTypes.getTemplateParameter()) {
            return buildTemplateParameter(container);
        } else if (elementType == metaTypes.getParameter()) {
            return getCore().buildParameter(container, null);
        } else if (elementType == metaTypes.getSignal()) {
            return modelImpl.getCommonBehaviorFactory().buildSignal(container);
        } else if (elementType == metaTypes.getMethod()) {
            return buildMethod(container);
        } else if (elementType == metaTypes.getMessage()) {
            return buildMessage(container);
        } else if (elementType == metaTypes.getArgument()) {
            return buildArgument(container);
        } else if (elementType == metaTypes.getGuard()) {
            return Model.getStateMachinesFactory().buildGuard(container);
        } else if (isActionType(elementType)) {
            return buildAction(elementType, container, properyName);
        } else if (isEventType(elementType)) {
            return buildEvent(elementType, container);
        } else if (isStateType(elementType, container)) {
            return buildState(elementType, container);
        } else if (elementType == metaTypes.getActivity()) {
            return Model.getActivityGraphsFactory().buildActivityGraph(container);
        }
        return null;
    }

    private Object buildTemplateParameter(Object container) {
        Parameter param = getCore().createParameter();
        param.setName("T");
        return modelImpl.getCoreFactory().buildTemplateParameter(container, param, null);
    }

    private Object buildMethod(Object container) {
        final Operation op = (Operation) container;
        Object element = getCore().buildMethod(op.getName());
        modelImpl.getCoreHelper().addMethod(op, element);
        modelImpl.getCoreHelper().addFeature(
                modelImpl.getFacade().getOwner(op), element);
        return element;
    }

    private Object buildMessage(Object container) {
        Object collaboration = Model.getFacade().getNamespace(container);
        return Model.getCollaborationsFactory()
                .buildMessage(collaboration, container);
    }

    private Object buildArgument(Object container) {
        Object element = Model.getCommonBehaviorFactory().createArgument();
        Model.getCommonBehaviorHelper().addActualArgument(container, element);
        return element;
    }

    private boolean isActionType(Object elementType) {
        return elementType == metaTypes.getCreateAction()
                || elementType == metaTypes.getCallAction()
                || elementType == metaTypes.getReturnAction()
                || elementType == metaTypes.getDestroyAction()
                || elementType == metaTypes.getSendAction()
                || elementType == metaTypes.getTerminateAction()
                || elementType == metaTypes.getUninterpretedAction()
                || elementType == metaTypes.getActionSequence();
    }

    private Object buildAction(Object elementType, Object container, String propertyName) {
        Object element = null;
        if (elementType == metaTypes.getCreateAction()) {
            element = Model.getCommonBehaviorFactory().createCreateAction();
        } else if (elementType == metaTypes.getCallAction()) {
            element = Model.getCommonBehaviorFactory().createCallAction();
        } else if (elementType == metaTypes.getReturnAction()) {
            element = Model.getCommonBehaviorFactory().createReturnAction();
        } else if (elementType == metaTypes.getDestroyAction()) {
            element = Model.getCommonBehaviorFactory().createDestroyAction();
        } else if (elementType == metaTypes.getSendAction()) {
            element = Model.getCommonBehaviorFactory().createSendAction();
        } else if (elementType == metaTypes.getTerminateAction()) {
            element = Model.getCommonBehaviorFactory().createTerminateAction();
        } else if (elementType == metaTypes.getUninterpretedAction()) {
            element = Model.getCommonBehaviorFactory().createUninterpretedAction();
        } else if (elementType == metaTypes.getActionSequence()) {
            element = Model.getCommonBehaviorFactory().createActionSequence();
        }
        if (element != null) {
            setNewAction(container, (Action) element, propertyName);
        }
        return element;
    }

    private boolean isEventType(Object elementType) {
        return elementType == metaTypes.getCallEvent()
                || elementType == metaTypes.getChangeEvent()
                || elementType == metaTypes.getSignalEvent()
                || elementType == metaTypes.getTimeEvent();
    }

    private Object buildEvent(Object elementType, Object container) {
        Object element = null;
        if (elementType == metaTypes.getCallEvent()) {
            element = Model.getStateMachinesFactory().createCallEvent();
        } else if (elementType == metaTypes.getChangeEvent()) {
            element = Model.getStateMachinesFactory().createChangeEvent();
        } else if (elementType == metaTypes.getSignalEvent()) {
            element = Model.getStateMachinesFactory().createSignalEvent();
        } else if (elementType == metaTypes.getTimeEvent()) {
            element = Model.getStateMachinesFactory().createTimeEvent();
        }
        if (element != null) {
            if (container instanceof Transition) {
                setNewTrigger((Transition) container, (Event) element);
            } else if (container instanceof State) {
                setNewDeferrableEvent((State) container, (Event) element);
            }
        }
        return element;
    }

    private boolean isStateType(Object elementType, Object container) {
        if (!(container instanceof CompositeState) && !(container instanceof State)) {
            return false;
        }
        return elementType == metaTypes.getPseudostate()
                || elementType == metaTypes.getSynchState()
                || elementType == metaTypes.getStubState()
                || elementType == metaTypes.getCompositeState()
                || elementType == metaTypes.getSimpleState()
                || elementType == metaTypes.getFinalState()
                || elementType == metaTypes.getSubmachineState()
                || elementType == metaTypes.getTransition();
    }

    private Object buildState(Object elementType, Object container) {
        if (elementType == metaTypes.getPseudostate() && container instanceof CompositeState) {
            return Model.getStateMachinesFactory().buildPseudoState(container);
        } else if (elementType == metaTypes.getSynchState() && container instanceof CompositeState) {
            return Model.getStateMachinesFactory().buildSynchState(container);
        } else if (elementType == metaTypes.getStubState() && container instanceof CompositeState) {
            return Model.getStateMachinesFactory().buildStubState(container);
        } else if (elementType == metaTypes.getCompositeState() && container instanceof CompositeState) {
            return Model.getStateMachinesFactory().buildCompositeState(container);
        } else if (elementType == metaTypes.getSimpleState() && container instanceof CompositeState) {
            return Model.getStateMachinesFactory().buildSimpleState(container);
        } else if (elementType == metaTypes.getFinalState() && container instanceof CompositeState) {
            return Model.getStateMachinesFactory().buildFinalState(container);
        } else if (elementType == metaTypes.getSubmachineState() && container instanceof CompositeState) {
            return Model.getStateMachinesFactory().buildSubmachineState(container);
        } else if (elementType == metaTypes.getTransition() && container instanceof State) {
            return Model.getStateMachinesFactory().buildInternalTransition(container);
        }
        return null;
    }

    private void setNewAction(Object container, Action action, String propertyName) {
        if (container instanceof Transition) {
            ((Transition) container).setEffect(action);
        } else if (container instanceof State) {
            if ("exit".equals(propertyName)) {
                ((State) container).setExit(action);
            } else if ("doActivity".equals(propertyName)) {
                ((State) container).setDoActivity(action);
            } else {
                ((State) container).setEntry(action);
            }
        } else if (container instanceof ActionSequence) {
            ((ActionSequence) container).getAction().add(action);
        } else {
            throw new IllegalArgumentException("Did not expect a " + container);
        }
    }

    public Object buildNode(Object elementType, Object container) {
        return buildNode(elementType, container, (String) null);
    }


    private void setNewTrigger(Transition transition, Event event) {
        transition.setTrigger(event);
        event.setName("");
        final StateMachine statemachine = transition.getStateMachine();
        final Namespace namespace = statemachine.getNamespace();
        event.setNamespace(namespace);
    }

    private void setNewDeferrableEvent(final State state, final Event event) {
        ((State) state).getDeferrableEvent().add((Event) event);
        event.setName("");
        Object parent = state;
        do {
            parent = ((RefObject) parent).refImmediateComposite();
        } while (!(parent instanceof Namespace));

        event.setNamespace((Namespace) parent);
    }

    public boolean isConnectionType(Object connectionType) {
        return (validConnectionMap.get(connectionType) != null);
    }


    public boolean isConnectionValid(Object connectionType, Object fromElement,
            Object toElement, boolean checkWFR) {
        if (Model.getModelManagementHelper().isReadOnly(fromElement)) {
            return false;
        }
        List<Class<?>[]> validItems = validConnectionMap.get(connectionType);
        if (validItems == null) {
            return false;
        }
        for (Class<?>[] modeElementPair : validItems) {
            if (modeElementPair[0].isInstance(fromElement)
                    && modeElementPair[1].isInstance(toElement)) {
                if (checkWFR) {
                    return isConnectionWellformed(
                            (Class<?>) connectionType,
                            (ModelElement) fromElement,
                            (ModelElement) toElement);
                } else {
                    return true;
                }
            }
        }
        return false;
    }

    public boolean isContainmentValid(Object metaType, Object container) {

        for (Class<?> containerType : validContainmentMap.keySet()) {

            if (containerType.isInstance(container)) {
                Class<?>[] validElements =
                    validContainmentMap.get(containerType);

                for (int eIter = 0; eIter < validElements.length; ++eIter) {

                    if (metaType == validElements[eIter]) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    private boolean isConnectionWellformed(
            Class<?> connectionType,
            ModelElement fromElement,
            ModelElement toElement) {

        if (fromElement == null || toElement == null) {
            return false;
        }

        if (connectionType == Generalization.class) {
            if (fromElement.getClass() != toElement.getClass()) {
                return false;
            }
        }

        return true;
    }

    private ExtensionMechanismsFactoryMDRImpl getExtensionMechanisms() {
        return (ExtensionMechanismsFactoryMDRImpl) modelImpl.
                getExtensionMechanismsFactory();
    }

    private CoreFactoryMDRImpl getCore() {
        return (CoreFactoryMDRImpl) modelImpl.getCoreFactory();
    }

    private CommonBehaviorFactoryMDRImpl getCommonBehavior() {
        return (CommonBehaviorFactoryMDRImpl) modelImpl.
                getCommonBehaviorFactory();
    }

    private UseCasesFactoryMDRImpl getUseCases() {
        return (UseCasesFactoryMDRImpl) modelImpl.getUseCasesFactory();
    }

    private StateMachinesFactoryMDRImpl getStateMachines() {
        return (StateMachinesFactoryMDRImpl) modelImpl
                .getStateMachinesFactory();
    }

    private CollaborationsFactoryMDRImpl getCollaborations() {
        return (CollaborationsFactoryMDRImpl) modelImpl.
                getCollaborationsFactory();
    }

    private ActivityGraphsFactoryMDRImpl getActivityGraphs() {
        return (ActivityGraphsFactoryMDRImpl) modelImpl.
                getActivityGraphsFactory();
    }

    private ModelManagementFactoryMDRImpl getModelManagement() {
        return (ModelManagementFactoryMDRImpl) modelImpl.
                getModelManagementFactory();
    }

    public void delete(Object elem) {
        if (elem == null) {
            throw new IllegalArgumentException("Element may not be null "
                    + "in delete");
        }

        synchronized (lock) {
            if (elementsToBeDeleted.contains(elem)) {
                return;
            }
            if (top == null) {
                top = elem;
            }
            elementsToBeDeleted.add((RefObject) elem);
        }

        if (top == elem) {
            LOG.log(Level.FINE, "Set top for cascade delete to {0}", elem);
        }
        LOG.log(Level.FINE, "Deleting {0}", elem);

        modelImpl.getRepository().beginTrans(false);
        try {
            deleteElement(elem);
        } catch (InvalidObjectException e) {
            LOG.log(Level.SEVERE, "Encountered deleted object during delete of " + elem);
        } catch (InvalidElementException e) {
            LOG.log(Level.SEVERE, "Encountered deleted object during delete of " + elem);
        } finally {
            modelImpl.getRepository().endTrans();
        }

        synchronized (lock) {
            try {
                Object container = ((RefObject) elem).refImmediateComposite();
                if (container == null
                        || !elementsToBeDeleted.contains(container)
                        || (container instanceof StateMachine
                                && elem instanceof StateVertex)
                        || (container instanceof Transition
                                && elem instanceof Guard)) {
                    elementsInDeletionOrder.add((RefObject) elem);
                }
            } catch (InvalidObjectException e) {
                LOG.log(Level.FINE, "Object already deleted {0}", elem);
            }

            if (elem == top) {
                for (RefObject o : elementsInDeletionOrder) {
                    if (o instanceof CompositeState) {
                        handleCompositeStateDeletion((CompositeState) o);
                    }
                    try {
                        o.refDelete();
                    } catch (InvalidObjectException e) {
                        LOG.log(Level.FINE, "Object already deleted {0}", o);
                    }
                    elementsToBeDeleted.remove(o);
                }
                top = null;
                elementsInDeletionOrder.clear();
                if (!elementsToBeDeleted.isEmpty()) {
                    LOG.log(Level.FINE, "**Skipped deleting {0} elements (probably in a deleted container", elementsToBeDeleted.size());
                    elementsToBeDeleted.clear();
                }
            }
        }

        Model.execute(new DummyModelCommand());
    }

    private void deleteElement(Object elem) {
        if (elem instanceof Element) {
            getCore().deleteElement(elem);
            if (elem instanceof ModelElement) {
                deleteModelElement(elem);
            } else if (elem instanceof PresentationElement) {
                getCore().deletePresentationElement(elem);
            }
        } else if (elem instanceof TemplateParameter) {
            getCore().deleteTemplateParameter(elem);
        } else if (elem instanceof TemplateArgument) {
            getCore().deleteTemplateArgument(elem);
        } else if (elem instanceof ElementImport) {
            getModelManagement().deleteElementImport(elem);
        } else if (elem instanceof ElementResidence) {
            getCore().deleteElementResidence(elem);
        }

        if (elem instanceof Partition) {
            getActivityGraphs().deletePartition(elem);
        }

        if (elem instanceof Feature) {
            deleteFeature((Feature) elem);
        } else if (elem instanceof Namespace) {
            deleteNamespace((Namespace) elem);
        }
    }

    private void deleteModelElement(Object elem) {
        getCore().deleteModelElement(elem);

        if (elem instanceof GeneralizableElement) {
            GeneralizableElement ge = (GeneralizableElement) elem;
            getCore().deleteGeneralizableElement(ge);
            if (elem instanceof Stereotype) {
                Stereotype s = (Stereotype) elem;
                getExtensionMechanisms().deleteStereotype(s);
            }
        }

        if (elem instanceof Parameter) {
            getCore().deleteParameter(elem);
        } else if (elem instanceof Constraint) {
            getCore().deleteConstraint(elem);
        } else if (elem instanceof Relationship) {
            deleteRelationship((Relationship) elem);
        } else if (elem instanceof AssociationEnd) {
            getCore().deleteAssociationEnd(elem);
            if (elem instanceof AssociationEndRole) {
                getCollaborations().deleteAssociationEndRole(elem);
            }
        } else if (elem instanceof Comment) {
            getCore().deleteComment(elem);
        } else if (elem instanceof Action) {
            deleteAction(elem);
        } else if (elem instanceof AttributeLink) {
            getCommonBehavior().deleteAttributeLink(elem);
        } else if (elem instanceof Instance) {
            deleteInstance((Instance) elem);
        } else if (elem instanceof Stimulus) {
            getCommonBehavior().deleteStimulus(elem);
        }

        if (elem instanceof Link) {
            getCommonBehavior().deleteLink(elem);
        } else if (elem instanceof LinkEnd) {
            getCommonBehavior().deleteLinkEnd(elem);
        } else if (elem instanceof Interaction) {
            getCollaborations().deleteInteraction(elem);
        } else if (elem instanceof InteractionInstanceSet) {
            getCollaborations().deleteInteractionInstanceSet(elem);
        } else if (elem instanceof CollaborationInstanceSet) {
            getCollaborations().deleteCollaborationInstanceSet(elem);
        } else if (elem instanceof Message) {
            getCollaborations().deleteMessage(elem);
        } else if (elem instanceof ExtensionPoint) {
            getUseCases().deleteExtensionPoint(elem);
        } else if (elem instanceof StateVertex) {
            deleteStateVertex((StateVertex) elem);
        }

        if (elem instanceof StateMachine) {
            getStateMachines().deleteStateMachine(elem);
            if (elem instanceof ActivityGraph) {
                getActivityGraphs().deleteActivityGraph(elem);
            }
        } else if (elem instanceof Transition) {
            getStateMachines().deleteTransition(elem);
        } else if (elem instanceof Guard) {
            getStateMachines().deleteGuard(elem);
        } else if (elem instanceof TaggedValue) {
            getExtensionMechanisms().deleteTaggedValue(elem);
        } else if (elem instanceof TagDefinition) {
            getExtensionMechanisms().deleteTagDefinition(elem);
        }
    }

    private void handleCompositeStateDeletion(CompositeState deletedCompositeState) {
        try {
            CompositeState containingCompositeState =
                deletedCompositeState.getContainer();
            if (containingCompositeState != null
                    && containingCompositeState.isConcurrent()
                    && containingCompositeState.getSubvertex().size() == 1) {
                containingCompositeState.setConcurrent(false);
            }
        } catch (InvalidObjectException e) {
            LOG.log(Level.FINE, "Object already deleted {0}", deletedCompositeState);
        }
    }

    public boolean isRemoved(Object o) {
        if (!(o instanceof RefObject)) {
            throw new IllegalArgumentException(
                    "Expected JMI RefObject, received " + o);
        }
        try {
            ((RefObject) o).refImmediateComposite();
            return false;
        } catch (InvalidObjectException e) {
            return true;
        }
    }

    private void deleteFeature(Feature elem) {
        getCore().deleteFeature(elem);
        if (elem instanceof BehavioralFeature) {
            getCore().deleteBehavioralFeature(elem);
            if (elem instanceof Operation) {
                getCore().deleteOperation(elem);
            } else if (elem instanceof Method) {
                getCore().deleteMethod(elem);
            } else if (elem instanceof Reception) {
                getCommonBehavior().deleteReception(elem);
            }
        } else if (elem instanceof StructuralFeature) {
            getCore().deleteStructuralFeature(elem);
            if (elem instanceof Attribute) {
                getCore().deleteAttribute(elem);
            }
        }
    }

    private void deleteNamespace(Namespace elem) {
        getCore().deleteNamespace(elem);
        if (elem instanceof Classifier) {
            getCore().deleteClassifier(elem);
            if (elem instanceof UmlClass) {
                getCore().deleteClass(elem);
                if (elem instanceof AssociationClass) {
                    getCore().deleteAssociationClass(elem);
                }
            } else if (elem instanceof Interface) {
                getCore().deleteInterface(elem);
            } else if (elem instanceof DataType) {
                getCore().deleteDataType(elem);
                if (elem instanceof Primitive) {
                    getCore().deletePrimitive(elem);
                } else if (elem instanceof Enumeration) {
                    getCore().deleteEnumeration(elem);
                } else if (elem instanceof ProgrammingLanguageDataType) {
                    getCore().deleteProgrammingLanguageDataType(elem);
                }
            } else if (elem instanceof Node) {
                getCore().deleteNode(elem);
            } else if (elem instanceof Component) {
                getCore().deleteComponent(elem);
            } else if (elem instanceof Artifact) {
                getCore().deleteArtifact(elem);
            } else if (elem instanceof Signal) {
                getCommonBehavior().deleteSignal(elem);
                if (elem instanceof Exception) {
                    getCommonBehavior().deleteException(elem);
                }
            } else if (elem instanceof ClassifierRole) {
                getCollaborations().deleteClassifierRole(elem);
            } else if (elem instanceof UseCase) {
                getUseCases().deleteUseCase(elem);
            } else if (elem instanceof Actor) {
                getUseCases().deleteActor(elem);
            } else if (elem instanceof ClassifierInState) {
                getActivityGraphs().deleteClassifierInState(elem);
            }
        } else if (elem instanceof Collaboration) {
            getCollaborations().deleteCollaboration(elem);
        } else if (elem instanceof UmlPackage) {
            getModelManagement().deletePackage(elem);
            if (elem instanceof org.omg.uml.modelmanagement.Model) {
                getModelManagement().deleteModel(elem);
            } else if (elem instanceof Subsystem) {
                getModelManagement().deleteSubsystem(elem);
            }
        }
    }

    private void deleteRelationship(Relationship elem) {
        getCore().deleteRelationship(elem);
        if (elem instanceof Flow) {
            getCore().deleteFlow(elem);
        } else if (elem instanceof Generalization) {
            getCore().deleteGeneralization(elem);
        } else if (elem instanceof UmlAssociation) {
            getCore().deleteAssociation(elem);
            if (elem instanceof AssociationRole) {
                getCollaborations().deleteAssociationRole(elem);
            }
        } else if (elem instanceof Dependency) {
            getCore().deleteDependency(elem);
            if (elem instanceof Abstraction) {
                getCore().deleteAbstraction(elem);
            } else if (elem instanceof Binding) {
                getCore().deleteBinding(elem);
            } else if (elem instanceof Usage) {
                getCore().deleteUsage(elem);
            } else if (elem instanceof Permission) {
                getCore().deletePermission(elem);
            }
        } else if (elem instanceof Include) {
            getUseCases().deleteInclude(elem);
        } else if (elem instanceof Extend) {
            getUseCases().deleteExtend(elem);
        }
    }

    private void deleteAction(Object elem) {
        getCommonBehavior().deleteAction(elem);
        if (elem instanceof ActionSequence) {
            getCommonBehavior().deleteActionSequence(elem);
        } else if (elem instanceof CreateAction) {
            getCommonBehavior().deleteCreateAction(elem);
        } else if (elem instanceof CallAction) {
            getCommonBehavior().deleteCallAction(elem);
        } else if (elem instanceof ReturnAction) {
            getCommonBehavior().deleteReturnAction(elem);
        } else if (elem instanceof SendAction) {
            getCommonBehavior().deleteSendAction(elem);
        } else if (elem instanceof TerminateAction) {
            getCommonBehavior().deleteTerminateAction(elem);
        } else if (elem instanceof UninterpretedAction) {
            getCommonBehavior().deleteUninterpretedAction(elem);
        } else if (elem instanceof DestroyAction) {
            getCommonBehavior().deleteDestroyAction(elem);
        }
    }

    private void deleteInstance(Instance elem) {
        getCommonBehavior().deleteInstance(elem);
        if (elem instanceof DataValue) {
            getCommonBehavior().deleteDataValue(elem);
        } else if (elem instanceof ComponentInstance) {
            getCommonBehavior().deleteComponentInstance(elem);
        } else if (elem instanceof NodeInstance) {
            getCommonBehavior().deleteNodeInstance(elem);
        } else if (elem
                instanceof
                org.omg.uml.behavioralelements.commonbehavior.Object) {
            getCommonBehavior().deleteObject(elem);
            if (elem instanceof LinkObject) {
                getCommonBehavior().deleteLinkObject(elem);
            }
        } else if (elem instanceof SubsystemInstance) {
            getCommonBehavior().deleteSubsystemInstance(elem);
        }
        if (elem instanceof UseCaseInstance) {
            getUseCases().deleteUseCaseInstance(elem);
        }
    }

    private void deleteStateVertex(StateVertex elem) {
        getStateMachines().deleteStateVertex(elem);
        if (elem instanceof Pseudostate) {
            getStateMachines().deletePseudostate(elem);
        } else if (elem instanceof SynchState) {
            getStateMachines().deleteSynchState(elem);
        } else if (elem instanceof StubState) {
            getStateMachines().deleteStubState(elem);
        } else if (elem instanceof State) {
            getStateMachines().deleteState(elem);
            if (elem instanceof CompositeState) {
                getStateMachines().deleteCompositeState(elem);
                if (elem instanceof SubmachineState) {
                    getStateMachines().deleteSubmachineState(elem);
                    if (elem instanceof SubactivityState) {
                        getActivityGraphs().deleteSubactivityState(elem);
                    }
                }
            } else if (elem instanceof SimpleState) {
                getStateMachines().deleteSimpleState(elem);
                if (elem instanceof ActionState) {
                    getActivityGraphs().deleteActionState(elem);
                    if (elem instanceof CallState) {
                        getActivityGraphs().deleteCallState(elem);
                    }
                } else if (elem instanceof ObjectFlowState) {
                    getActivityGraphs().deleteObjectFlowState(elem);
                }
            } else if (elem instanceof FinalState) {
                getStateMachines().deleteFinalState(elem);
            }
        }
    }

    public void deleteExtent(Object element) {
        try {
            org.omg.uml.UmlPackage extent =
                (org.omg.uml.UmlPackage) ((RefObject) element)
                    .refOutermostPackage();

            LOG.log(Level.FINE, "Removing extent {0}", extent);

            modelImpl.deleteExtent(extent);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public Collection getExtentElements(String name) {
        return getExtentPackages(name);
    }

    public Collection getExtentPackages(String name) {
        org.omg.uml.UmlPackage pkg = modelImpl.getExtent(name);
        if (pkg == null) {
            return null;
        }
        Collection<Object> packages = pkg.getModelManagement().getUmlPackage().
            refAllOfType();
        Collection<Object> topLevelPackages = new ArrayList<Object>();
        for (Object pack : packages) {
            if (Model.getFacade().getNamespace(pack) == null) {
                topLevelPackages.add(pack);
            }
        }
        return topLevelPackages;
    }

}