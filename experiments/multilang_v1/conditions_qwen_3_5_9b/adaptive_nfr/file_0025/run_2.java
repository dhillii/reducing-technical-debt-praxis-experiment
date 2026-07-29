package org.argouml.model.mdr;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;

import javax.jmi.reflect.InvalidObjectException;

import org.argouml.model.InvalidElementException;
import org.argouml.model.Model;
import org.argouml.model.StateMachinesHelper;
import org.omg.uml.behavioralelements.commonbehavior.Action;
import org.omg.uml.behavioralelements.commonbehavior.Argument;
import org.omg.uml.behavioralelements.statemachines.ChangeEvent;
import org.omg.uml.behavioralelements.statemachines.CompositeState;
import org.omg.uml.behavioralelements.statemachines.Event;
import org.omg.uml.behavioralelements.statemachines.Guard;
import org.omg.uml.behavioralelements.statemachines.State;
import org.omg.uml.behavioralelements.statemachines.StateMachine;
import org.omg.uml.behavioralelements.statemachines.StateVertex;
import org.omg.uml.behavioralelements.statemachines.StubState;
import org.omg.uml.behavioralelements.statemachines.SubmachineState;
import org.omg.uml.behavioralelements.statemachines.SynchState;
import org.omg.uml.behavioralelements.statemachines.TimeEvent;
import org.omg.uml.behavioralelements.statemachines.Transition;
import org.omg.uml.foundation.core.BehavioralFeature;
import org.omg.uml.foundation.core.Classifier;
import org.omg.uml.foundation.core.Feature;
import org.omg.uml.foundation.core.ModelElement;
import org.omg.uml.foundation.core.Namespace;
import org.omg.uml.foundation.core.Operation;
import org.omg.uml.foundation.datatypes.BooleanExpression;
import org.omg.uml.foundation.datatypes.Expression;
import org.omg.uml.foundation.datatypes.TimeExpression;
import org.omg.uml.modelmanagement.UmlPackage;
import org.openide.util.NotImplementedException;

/**
 * The State Machines Helper Implementation for MDR.
 *
 * @since ARGO0.19.5
 * @author Ludovic Ma&icirc;tre
 * @author Tom Morris
 */
class StateMachinesHelperMDRImpl implements StateMachinesHelper {

    private MDRModelImplementation modelImpl;

    /**
     * Constructor.
     *
     * @param impl The ModelImplementation
     */
    public StateMachinesHelperMDRImpl(MDRModelImplementation impl) {
        super();
        this.modelImpl = impl;
    }


    public Object getSource(Object trans) {
        if (!(trans instanceof Transition)) {
            throw new IllegalArgumentException("bad argument to " + "getSource() - " + trans);
        }
        try {
            return ((Transition) trans).getSource();
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public Object getDestination(Object trans) {
        if (!(trans instanceof Transition)) {
            throw new IllegalArgumentException("bad argument to " + "getDestination() - " + trans);
        }
        try {
            return ((Transition) trans).getTarget();
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public Object getStateMachine(Object handle) {
        if (handle == null) {
            throw new IllegalArgumentException("bad argument to " + "getStateMachine() - " + handle);
        }
        try {
            Object container = modelImpl.getFacade().getModelElementContainer(handle);
            while (container != null) {
                if (Model.getFacade().isAStateMachine(container)) {
                    return container;
                }
                container = modelImpl.getFacade().getModelElementContainer(container);
            }
            return null;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public void setEventAsTrigger(Object transition, Object event) {
        if (!(transition instanceof Transition)) {
            throw new IllegalArgumentException("Transition either null or not " + "an instance of MTransition");
        }
        if (event != null && !(event instanceof Event)) {
            throw new IllegalArgumentException("Event not an " + "instance of MEvent");
        }
        ((Transition) transition).setTrigger((Event) event);
    }


    public boolean isAddingStatemachineAllowed(Object context) {
        return context instanceof BehavioralFeature || context instanceof Classifier;
    }


    public boolean isTopState(Object o) {
        if (!(o instanceof CompositeState)) {
            return false;
        }
        try {
            CompositeState cs = (CompositeState) o;
            return cs.getContainer() == null;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public Collection<StateMachine> getAllPossibleStatemachines(Object model, Object oSubmachineState) {
        if (!(oSubmachineState instanceof SubmachineState)) {
            throw new IllegalArgumentException("Argument must be a SubmachineState");
        }
        try {
            Collection<StateMachine> statemachines = Model.getModelManagementHelper().getAllModelElementsOfKind(model, StateMachine.class);
            statemachines.remove(getStateMachine(oSubmachineState));
            return statemachines;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    // TODO: getAllPossibleSubvertices and getAllSubStates are duplicates - tfm
    public Collection<StateVertex> getAllPossibleSubvertices(Object oState) {
        Collection<StateVertex> result = new ArrayList<StateVertex>();
        if (!(oState instanceof CompositeState)) {
            return result;
        }
        try {
            for (StateVertex vertex : ((CompositeState) oState).getSubvertex()) {
                result.add(vertex);
                result.addAll(getAllPossibleSubvertices(vertex));
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        return result;
    }


    public void setStatemachineAsSubmachine(Object oSubmachineState, Object oStatemachine) {
        if (!(oSubmachineState instanceof SubmachineState)) {
            throw new IllegalArgumentException("oSubmachineState: " + oSubmachineState + ",oStatemachine: " + oStatemachine);
        }
        if (!(oStatemachine instanceof StateMachine) && oStatemachine != null) {
            throw new IllegalArgumentException("oSubmachineState: " + oSubmachineState + ",oStatemachine: " + oStatemachine);
        }
        SubmachineState mss = (SubmachineState) oSubmachineState;
        mss.setSubmachine((StateMachine) oStatemachine);
    }


    public State getTop(Object sm) {
        if (!(sm instanceof StateMachine)) {
            throw new IllegalArgumentException();
        }
        try {
            return ((StateMachine) sm).getTop();
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public List getRegions(Object handle) {
        throw new NotImplementedException("Region is not a UML1.4 metatype");
    }


    public Collection<StateVertex> getOutgoingStates(Object ostatevertex) {
        if (!(ostatevertex instanceof StateVertex)) {
            throw new IllegalArgumentException("Argument must be a StateVertex");
        }
        try {
            StateVertex statevertex = (StateVertex) ostatevertex;
            Collection<StateVertex> result = new ArrayList<StateVertex>();
            for (Transition transition : statevertex.getOutgoing()) {
                result.add(transition.getTarget());
            }
            return result;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public Object findOperationByName(Object trans, String opname) {
        if (!(trans instanceof Transition)) {
            throw new IllegalArgumentException();
        }
        try {
            Object sm = getStateMachine(trans);
            Object context = Model.getFacade().getContext(sm);
            Classifier classifier = findClassifierForContext(context);
            if (classifier != null) {
                List<Feature> features = classifier.getFeature();
                Feature found = findOperationInFeatures(features, opname);
                if (found != null) {
                    return found;
                }
            }
            Namespace pack = findNamespaceForContext(context, classifier);
            if (pack != null) {
                Collection<ModelElement> mes = pack.getOwnedElement();
                Feature found = findOperationInNamespace(mes, opname);
                if (found != null) {
                    return found;
                }
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        return null;
    }


    private Classifier findClassifierForContext(Object context) {
        if (context instanceof Classifier) {
            return (Classifier) context;
        }
        if (context instanceof BehavioralFeature) {
            return ((BehavioralFeature) context).getOwner();
        }
        return null;
    }


    private Namespace findNamespaceForContext(Object context, Classifier classifier) {
        if (context instanceof UmlPackage) {
            return (Namespace) context;
        }
        if (classifier == null) {
            return null;
        }
        Namespace parent = classifier.getNamespace();
        while (parent instanceof Classifier) {
            if (parent.getNamespace() == null) {
                break;
            }
            parent = parent.getNamespace();
        }
        return parent;
    }


    private Feature findOperationInFeatures(List<Feature> features, String opname) {
        for (Feature f : features) {
            if (f instanceof Operation) {
                String on = f.getName();
                if (on.equals(opname)) {
                    return f;
                }
            }
        }
        return null;
    }


    private Feature findOperationInNamespace(Collection<ModelElement> mes, String opname) {
        for (ModelElement me : mes) {
            if (me instanceof Classifier) {
                Classifier classifier2 = (Classifier) me;
                List<Feature> features = classifier2.getFeature();
                for (Feature f : features) {
                    if (f instanceof Operation) {
                        String on = f.getName();
                        if (on.equals(opname)) {
                            return f;
                        }
                    }
                }
            }
        }
        return null;
    }


    // TODO: getAllPossibleSubvertices and getAllSubStates are duplicates - tfm
    public Collection<StateVertex> getAllSubStates(Object compState) {
        if (!(compState instanceof CompositeState)) {
            throw new IllegalArgumentException("Argument is not a composite state");
        }
        try {
            Collection<StateVertex> result = new ArrayList<StateVertex>();
            for (Object subState : Model.getFacade().getSubvertices(compState)) {
                if (subState instanceof CompositeState) {
                    result.addAll(getAllSubStates(subState));
                }
                result.add((StateVertex) subState);
            }
            return result;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public Collection<Transition> getTransitions(Object handle, boolean includeInternals) {
        if (!(handle instanceof StateMachine)) {
            throw new IllegalArgumentException("Argument is not a statemachine");
        }
        Collection<Transition> result = new ArrayList<Transition>();
        result.addAll(((StateMachine) handle).getTransitions());
        if (includeInternals) {
            State top = ((StateMachine) handle).getTop();
            if (top != null && top instanceof CompositeState) {
                Collection<StateVertex> subs = getAllSubStates(top);
                for (StateVertex sub : subs) {
                    if (sub instanceof State) {
                        result.addAll(((State) sub).getInternalTransition());
                    }
                }
            }
        }
        return result;
    }

    public void removeSubvertex(Object handle, Object subvertex) {
        if (!(handle instanceof CompositeState) || !(subvertex instanceof StateVertex)) {
            throw new IllegalArgumentException("handle: " + handle + " or subvertex: " + subvertex);
        }
        try {
            ((CompositeState) handle).getSubvertex().remove(subvertex);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public void addSubvertex(Object handle, Object subvertex) {
        if (!(handle instanceof CompositeState) || !(subvertex instanceof StateVertex)) {
            throw new IllegalArgumentException("handle: " + handle + " or subvertex: " + subvertex);
        }
        ((StateVertex) subvertex).setContainer((CompositeState) handle);
    }


    public void setBound(Object handle, int bound) {
        if (!(handle instanceof SynchState)) {
            throw new IllegalArgumentException("handle: " + handle + " or bound: " + bound);
        }
        ((SynchState) handle).setBound(bound);
    }


    public void setConcurrent(Object handle, boolean concurrent) {
        if (!(handle instanceof CompositeState)) {
            throw new IllegalArgumentException("handle: " + handle);
        }
        ((CompositeState) handle).setConcurrent(concurrent);
    }


    public void setContainer(Object handle, Object compositeState) {
        if (!(handle instanceof StateVertex)) {
            throw new IllegalArgumentException("handle: " + handle + " or compositeState: " + compositeState);
        }
        if (compositeState != null && !(compositeState instanceof CompositeState)) {
            throw new IllegalArgumentException("handle: " + handle + " or compositeState: " + compositeState);
        }
        ((StateVertex) handle).setContainer((CompositeState) compositeState);
    }


    public void setDoActivity(Object handle, Object value) {
        if (!(handle instanceof State)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        if (value != null && !(value instanceof Action)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        ((State) handle).setDoActivity((Action) value);
    }


    public void setEffect(Object handle, Object value) {
        if (!(handle instanceof Transition)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        if (value != null && !(value instanceof Action)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        ((Transition) handle).setEffect((Action) value);
    }


    public void setEntry(Object handle, Object value) {
        if (!(handle instanceof State)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        if (value != null && !(value instanceof Action)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        ((State) handle).setEntry((Action) value);
    }


    public void setExit(Object handle, Object value) {
        if (!(handle instanceof State)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        if (value != null && !(value instanceof Action)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        ((State) handle).setExit((Action) value);
    }


    public void setExpression(Object handle, Object value) {
        if (handle instanceof Guard) {
            setExpressionForGuard(handle, value);
            return;
        }
        if (handle instanceof ChangeEvent) {
            setExpressionForChangeEvent(handle, value);
            return;
        }
        if (handle instanceof Argument) {
            setExpressionForArgument(handle, value);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
    }


    private void setExpressionForGuard(Object handle, Object value) {
        if (!(value instanceof BooleanExpression)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        Expression oldExp = ((Guard) handle).getExpression();
        if (!equal(oldExp, (Expression) value)) {
            ((Guard) handle).setExpression((BooleanExpression) value);
            if (oldExp != null) {
                Model.getUmlFactory().delete(oldExp);
            }
        }
    }


    private void setExpressionForChangeEvent(Object handle, Object value) {
        if (!(value instanceof BooleanExpression)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        ChangeEvent ce = (ChangeEvent) handle;
        Expression oldExp = ce.getChangeExpression();
        if (!equal(oldExp, (Expression) value)) {
            ce.setChangeExpression((BooleanExpression) value);
            if (oldExp != null) {
                Model.getUmlFactory().delete(oldExp);
            }
        }
    }


    private void setExpressionForArgument(Object handle, Object value) {
        if (!(value instanceof Expression)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        Argument arg = (Argument) handle;
        Expression oldExp = arg.getValue();
        if (!equal(oldExp, (Expression) value)) {
            arg.setValue((Expression) value);
            if (oldExp != null) {
                Model.getUmlFactory().delete(oldExp);
            }
        }
    }


    private boolean equal(Expression expr1, Expression expr2) {
        if (expr1 == null) {
            return expr2 == null;
        }
        return expr1.equals(expr2);
    }


    public void setGuard(Object handle, Object guard) {
        if (!(handle instanceof Transition)) {
            throw new IllegalArgumentException("handle: " + handle + " or guard: " + guard);
        }
        if (guard != null && !(guard instanceof Guard)) {
            throw new IllegalArgumentException("handle: " + handle + " or guard: " + guard);
        }
        ((Transition) handle).setGuard((Guard) guard);
    }


    public void setInternalTransitions(Object handle, Collection intTrans) {
        if (!(handle instanceof State)) {
            throw new IllegalArgumentException("handle: " + handle);
        }
        Collection internalTransitions = Model.getFacade().getInternalTransitions(handle);
        if (!internalTransitions.isEmpty()) {
            Collection trans = new ArrayList(internalTransitions);
            for (Object transition : trans) {
                removeTransition(handle, transition);
            }
        }
        for (Object transition : intTrans) {
            addTransition(handle, transition);
        }
    }

    /**
     * Remove a transition.
     * @param handle The state
     * @param intTrans The internal transition to remove
     */
    private void removeTransition(Object handle, Object intTrans) {
        if (!(handle instanceof State) || !(intTrans instanceof Transition)) {
            throw new IllegalArgumentException("handle: " + handle + " or intTrans: " + intTrans);
        }
        try {
            ((State) handle).getInternalTransition().remove(intTrans);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    /**
     * Add a transition.
     * 
     * @param handle The state
     * @param intTrans The internal transition to add
     */
    private void addTransition(Object handle, Object intTrans) {
        if (!(handle instanceof State) || !(intTrans instanceof Transition)) {
            throw new IllegalArgumentException("handle: " + handle + " or subvertex: " + intTrans);
        }
        ((State) handle).getInternalTransition().add((Transition) intTrans);
    }


    public void setSource(Object handle, Object state) {
        if (!(handle instanceof Transition)) {
            throw new IllegalArgumentException("handle: " + handle + " or state: " + state);
        }
        if (state != null && !(state instanceof StateVertex)) {
            throw new IllegalArgumentException("handle: " + handle + " or state: " + state);
        }
        ((Transition) handle).setSource((StateVertex) state);
    }


    public void setState(Object handle, Object element) {
        if (!(handle instanceof Transition) || !(element instanceof State)) {
            throw new IllegalArgumentException("handle: " + handle + " or element: " + element);
        }
        addTransition(element, handle);
    }


    public void setStateMachine(Object handle, Object stm) {
        if (handle instanceof State) {
            if (stm != null && !(stm instanceof StateMachine)) {
                throw new IllegalArgumentException("handle: " + handle + " or stm: " + stm);
            }
            ((State) handle).setStateMachine((StateMachine) stm);
            return;
        }
        if (handle instanceof Transition) {
            if (stm != null && !(stm instanceof StateMachine)) {
                throw new IllegalArgumentException("handle: " + handle + " or stm: " + stm);
            }
            ((Transition) handle).setStateMachine((StateMachine) stm);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or stm: " + stm);
    }


    public void setSubvertices(Object handle, Collection subvertices) {
        if (!(handle instanceof CompositeState)) {
            throw new IllegalArgumentException("handle: " + handle + " or subvertices: " + subvertices);
        }
        ((CompositeState) handle).getSubvertex().clear();
        ((CompositeState) handle).getSubvertex().addAll(subvertices);
    }


    public void setTrigger(Object handle, Object event) {
        if (!(handle instanceof Transition)) {
            throw new IllegalArgumentException("handle: " + handle + " or event: " + event);
        }
        if (event != null && !(event instanceof Event)) {
            throw new IllegalArgumentException("handle: " + handle + " or event: " + event);
        }
        ((Transition) handle).setTrigger((Event) event);
    }


    public void setWhen(Object handle, Object value) {
        if (!(handle instanceof TimeEvent)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        if (value != null && !(value instanceof TimeExpression)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        Expression oldExp = ((TimeEvent) handle).getWhen();
        if (!equal(oldExp, (Expression) value)) {
            ((TimeEvent) handle).setWhen((TimeExpression) value);
            if (oldExp != null) {
                Model.getUmlFactory().delete(oldExp);
            }
        }
    }


    public void setChangeExpression(Object handle, Object value) {
        if (!(handle instanceof ChangeEvent)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        if (value != null && !(value instanceof BooleanExpression)) {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
        Expression oldExp = ((ChangeEvent) handle).getChangeExpression();
        if (!equal(oldExp, (Expression) value)) {
            ((ChangeEvent) handle).setChangeExpression((BooleanExpression) value);
            if (oldExp != null) {
                Model.getUmlFactory().delete(oldExp);
            }
        }
    }


    public String getPath(Object o) {
        if (!(o instanceof StateVertex)) {
            throw new IllegalArgumentException("Argument must be a StateVertex");
        }
        try {
            Object o1 = o;
            Object o2 = Model.getFacade().getContainer(o1);
            String path = Model.getFacade().getName(o1);
            while (o2 != null && !Model.getFacade().isTop(o2)) {
                path = Model.getFacade().getName(o2) + "::" + path;
                o1 = o2;
                o2 = Model.getFacade().getContainer(o1);
            }
            return path;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public Object getStatebyName(String path, Object container) {
        if (container != null && Model.getFacade().isACompositeState(container) && path != null) {
            try {
                Iterator it = getAllPossibleSubvertices(container).iterator();
                int index = path.lastIndexOf("::");
                if (index != -1) {
                    index += 2;
                } else {
                    index += 1;
                }
                path = path.substring(index);
                while (it.hasNext()) {
                    Object o = it.next();
                    Object oName = Model.getFacade().getName(o);
                    if (oName != null && oName.equals(path)) {
                        return o;
                    }
                }
            } catch (InvalidObjectException e) {
                throw new InvalidElementException(e);
            }
        }
        return null;
    }


    public void setReferenceState(Object o, String referenced) {
        if (!(o instanceof StubState)) {
            throw new IllegalArgumentException("handle: " + o);
        }
        ((StubState) o).setReferenceState(referenced);
    }


    public Object findNamespaceForEvent(Object trans, Object model) {
        try {
            Object enclosing = Model.getStateMachinesHelper().getStateMachine(trans);
            while (!Model.getFacade().isAPackage(enclosing) && enclosing != null) {
                enclosing = Model.getFacade().getNamespace(enclosing);
            }
            if (enclosing == null) {
                enclosing = model;
            }
            return enclosing;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public void addDeferrableEvent(Object state, Object deferrableEvent) {
        if (!(state instanceof State) || !(deferrableEvent instanceof Event)) {
            throw new IllegalArgumentException("handle: " + state + " or evt: " + deferrableEvent);
        }
        ((State) state).getDeferrableEvent().add((Event) deferrableEvent);
    }


    public void removeDeferrableEvent(Object state, Object deferrableEvent) {
        if (!(state instanceof State) || !(deferrableEvent instanceof Event)) {
            throw new IllegalArgumentException("handle: " + state + " or evt: " + deferrableEvent);
        }
        try {
            ((State) state).getDeferrableEvent().remove(deferrableEvent);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public void setContext(Object statemachine, Object modelElement) {
        if (!(statemachine instanceof StateMachine) || !(modelElement instanceof ModelElement)) {
            throw new IllegalArgumentException("handle: " + statemachine + " or me: " + modelElement);
        }
        ((StateMachine) statemachine).setContext((ModelElement) modelElement);
    }
}