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

class StateMachinesHelperMDRImpl implements StateMachinesHelper {

    private MDRModelImplementation modelImpl;

    public StateMachinesHelperMDRImpl(MDRModelImplementation impl) {
        super();
        this.modelImpl = impl;
    }


    public Object getSource(Object trans) {
        try {
            if (trans instanceof Transition) {
                return ((Transition) trans).getSource();
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("bad argument to "
                + "getSource() - " + trans);
    }


    public Object getDestination(Object trans) {
        try {
            if (trans instanceof Transition) {
                return ((Transition) trans).getTarget();
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("bad argument to "
                + "getDestination() - " + trans);
    }


    public Object getStateMachine(Object handle) {
        if (handle == null) {
            throw new IllegalArgumentException("bad argument to "
                    + "getStateMachine() - " + handle);
        }
        try {
            Object container =
                modelImpl.getFacade().getModelElementContainer(handle);
            while (container != null) {
                if (Model.getFacade().isAStateMachine(container)) {
                    return container;
                }
                container =
                    modelImpl.getFacade()
                        .getModelElementContainer(container);
            }
            return null;

        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public void setEventAsTrigger(Object transition, Object event) {
        if (!(transition instanceof Transition)) {
            throw new IllegalArgumentException("Transition either null or not "
                    + "an instance of MTransition");
        }
        if (event != null && !(event instanceof Event)) {
            throw new IllegalArgumentException("Event not an "
                    + "instance of MEvent");
        }
        ((Transition) transition).setTrigger((Event) event);
    }


    public boolean isAddingStatemachineAllowed(Object context) {
        return (context instanceof BehavioralFeature
                || context instanceof Classifier);
    }


    public boolean isTopState(Object o) {
        try {
            if (o instanceof CompositeState) {
                CompositeState cs = (CompositeState) o;
                return (cs.getContainer() == null);
            }
            return false;
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }


    public Collection<StateMachine> getAllPossibleStatemachines(Object model,
            Object oSubmachineState) {
        try {
            if (oSubmachineState instanceof SubmachineState) {
                Collection<StateMachine> statemachines =
                    Model.getModelManagementHelper()
                        .getAllModelElementsOfKind(model, StateMachine.class);
                statemachines.remove(getStateMachine(oSubmachineState));
                return statemachines;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException(
                "Argument must be a SubmachineState");
    }


    public Collection<StateVertex> getAllPossibleSubvertices(Object oState) {
        Collection<StateVertex> result = new ArrayList<StateVertex>();
        try {
            if (oState instanceof CompositeState) {
                for (StateVertex vertex 
                        : ((CompositeState) oState).getSubvertex()) {
                    result.add(vertex);
                    result.addAll(getAllPossibleSubvertices(vertex));
                }
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        return result;
    }


    public void setStatemachineAsSubmachine(Object oSubmachineState,
            Object oStatemachine) {
        if (oSubmachineState instanceof SubmachineState
                && (oStatemachine instanceof StateMachine
                        || oStatemachine == null)) {
            SubmachineState mss = (SubmachineState) oSubmachineState;
            mss.setSubmachine((StateMachine) oStatemachine);
            return;
        }
        throw new IllegalArgumentException("oSubmachineState: "
                + oSubmachineState + ",oStatemachine: " + oStatemachine);
    }


    public State getTop(Object sm) {
        if (!(sm instanceof StateMachine)) {
            throw new IllegalArgumentException();
        }

        try  {
            return ((StateMachine) sm).getTop();
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public List getRegions(Object handle) {
        throw new NotImplementedException("Region is not a UML1.4 metatype");
    }


    public Collection<StateVertex> getOutgoingStates(Object ostatevertex) {
        try {
            if (ostatevertex instanceof StateVertex) {
                StateVertex statevertex = (StateVertex) ostatevertex;
                Collection<StateVertex> result = new ArrayList<StateVertex>();
                for (Transition transition : statevertex.getOutgoing()) {
                    result.add(transition.getTarget());
                }
                return result;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException(
                "Argument must be a StateVertex");
    }


    public Object findOperationByName(Object trans, String opname) {
        if (!(trans instanceof Transition)) {
            throw new IllegalArgumentException();
        }
        try {
            Object sm = getStateMachine(trans);
            Object context = Model.getFacade().getContext(sm);
            
            Object result = findOperationInClassifier(context, opname);
            if (result != null) {
                return result;
            }
            
            Namespace pack = getNamespaceForOperation(context);
            if (pack != null) {
                return findOperationInNamespace(pack, opname);
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        return null;
    }

    private Object findOperationInClassifier(Object context, String opname) {
        Classifier classifier = extractClassifier(context);
        if (classifier != null) {
            return searchOperationInFeatures(classifier.getFeature(), opname);
        }
        return null;
    }

    private Classifier extractClassifier(Object context) {
        if (context instanceof Classifier) {
            return (Classifier) context;
        }
        if (context instanceof BehavioralFeature) {
            return ((BehavioralFeature) context).getOwner();
        }
        return null;
    }

    private Object searchOperationInFeatures(List<Feature> features, String opname) {
        for (Feature f : features) {
            if (f instanceof Operation && f.getName().equals(opname)) {
                return f;
            }
        }
        return null;
    }

    private Namespace getNamespaceForOperation(Object context) {
        if (context instanceof UmlPackage) {
            return (Namespace) context;
        }
        
        Classifier classifier = extractClassifier(context);
        if (classifier != null) {
            return findPackageNamespace(classifier.getNamespace());
        }
        return null;
    }

    private Namespace findPackageNamespace(Namespace parent) {
        while (parent instanceof Classifier) {
            if (parent.getNamespace() == null) {
                break;
            }
            parent = parent.getNamespace();
        }
        return parent;
    }

    private Object findOperationInNamespace(Namespace pack, String opname) {
        Collection<ModelElement> mes = pack.getOwnedElement();
        for (ModelElement me : mes) {
            if (me instanceof Classifier) {
                Classifier classifier = (Classifier) me;
                Object result = searchOperationInFeatures(classifier.getFeature(), opname);
                if (result != null) {
                    return result;
                }
            }
        }
        return null;
    }


    public Collection<StateVertex> getAllSubStates(Object compState) {
        try {
            if (compState instanceof CompositeState) {
                Collection<StateVertex> result = new ArrayList<StateVertex>();
                for (Object subState : Model.getFacade().getSubvertices(
                        compState)) {
                    if (subState instanceof CompositeState) {
                        result.addAll(getAllSubStates(subState));
                    }
                    result.add((StateVertex) subState);
                }
                return result;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException(
                "Argument is not a composite state");
    }

    public Collection<Transition> getTransitions(Object handle,
            boolean includeInternals) {
        if (handle instanceof StateMachine) {
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
        throw new IllegalArgumentException(
            "Argument is not a statemachine");
    }

    public void removeSubvertex(Object handle, Object subvertex) {
        try {
            if (handle instanceof CompositeState
                    && subvertex instanceof StateVertex) {
                ((CompositeState) handle).getSubvertex().remove(subvertex);
                return;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or subvertex: " + subvertex);
    }


    public void addSubvertex(Object handle, Object subvertex) {
        if (handle instanceof CompositeState
                && subvertex instanceof StateVertex) {
            ((StateVertex) subvertex).setContainer((CompositeState) handle);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or subvertex: " + subvertex);
    }


    public void setBound(Object handle, int bound) {
        if (handle instanceof SynchState) {
            ((SynchState) handle).setBound(bound);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or bound: "
                + bound);
    }


    public void setConcurrent(Object handle, boolean concurrent) {
        if (handle instanceof CompositeState) {
            ((CompositeState) handle).setConcurrent(concurrent);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle);
    }


    public void setContainer(Object handle, Object compositeState) {
        if (handle instanceof StateVertex
                && (compositeState == null
                        || compositeState instanceof CompositeState)) {
            ((StateVertex) handle).
                    setContainer((CompositeState) compositeState);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or compositeState: " + compositeState);
    }


    public void setDoActivity(Object handle, Object value) {
        if (handle instanceof State
                && (value == null || value instanceof Action)) {
            ((State) handle).setDoActivity((Action) value);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or value: "
                + value);
    }


    public void setEffect(Object handle, Object value) {
        if (handle instanceof Transition
                && (value == null || value instanceof Action)) {
            ((Transition) handle).setEffect((Action) value);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or value: "
                + value);
    }


    public void setEntry(Object handle, Object value) {
        if (handle instanceof State
                && (value == null || value instanceof Action)) {
            ((State) handle).setEntry((Action) value);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or value: "
                + value);
    }


    public void setExit(Object handle, Object value) {
        if (handle instanceof State
                && (value == null || value instanceof Action)) {
            ((State) handle).setExit((Action) value);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or value: "
                + value);
    }


    public void setExpression(Object handle, Object value) {
        if (handle instanceof Guard
                && (value == null || value instanceof BooleanExpression)) {
            Expression oldExp = ((Guard) handle).getExpression();
            if (!equal(oldExp,(Expression) value)) {
                ((Guard) handle).setExpression((BooleanExpression) value);
                if (oldExp != null) {
                    Model.getUmlFactory().delete(oldExp);
                }
            }
            return;
        }
        if (handle instanceof ChangeEvent
                && (value == null || value instanceof BooleanExpression)) {
            ChangeEvent ce = (ChangeEvent) handle;
            Expression oldExp = ce.getChangeExpression();
            if (!equal(oldExp,(Expression) value)) {
                ce.setChangeExpression((BooleanExpression) value);
                if (oldExp != null) {
                    Model.getUmlFactory().delete(oldExp);
                }
            }
            return;
        }
        if (handle instanceof Argument
                && (value == null || value instanceof Expression)) {
            Argument arg = (Argument) handle;
            Expression oldExp = arg.getValue();
            if (!equal(oldExp,(Expression) value)) {
                arg.setValue((Expression) value);
                if (oldExp != null) {
                    Model.getUmlFactory().delete(oldExp);
                }
            }
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or value: "
                + value);
    }


    private boolean equal(Expression expr1, Expression expr2) {
        if (expr1 == null) {
            if (expr2 == null) {
                return true;
            } else {
                return false;
            }
        } else {
            return expr1.equals(expr2);
        }
    }
    
    
    public void setGuard(Object handle, Object guard) {
        if (handle instanceof Transition
                && (guard == null || guard instanceof Guard)) {
            ((Transition) handle).setGuard((Guard) guard);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or guard: "
                + guard);
    }


    public void setInternalTransitions(Object handle, Collection intTrans) {
        if (handle instanceof State) {
            Collection internalTransitions =
                Model.getFacade().getInternalTransitions(handle);
            if (!internalTransitions.isEmpty()) {
                Collection trans = new ArrayList(internalTransitions);
                for (Object transition : trans) {
                    removeTransition(handle, transition);
                }
            }
            for (Object transition : intTrans) {
                addTransition(handle, transition);
            }
            return;
        }
        throw new IllegalArgumentException("handle: " + handle);
    }

    private void removeTransition(Object handle, Object intTrans) {
        try {
            if (handle instanceof State && intTrans instanceof Transition) {
                ((State) handle).getInternalTransition().remove(intTrans);
                return;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or intTrans: " + intTrans);
    }

    private void addTransition(Object handle, Object intTrans) {
        if (handle instanceof State && intTrans instanceof Transition) {
            ((State) handle).getInternalTransition().add((Transition) intTrans);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or subvertex: " + intTrans);
    }


    public void setSource(Object handle, Object state) {
        if (handle instanceof Transition && 
                (state == null || state instanceof StateVertex)) {
            ((Transition) handle).setSource((StateVertex) state);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or state: "
                + state);
    }


    public void setState(Object handle, Object element) {
        if (handle instanceof Transition && element instanceof State) {
            addTransition(element, handle);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or element: " + element);
    }


    public void setStateMachine(Object handle, Object stm) {
        if (handle instanceof State
                && (stm == null || stm instanceof StateMachine)) {
            ((State) handle).setStateMachine((StateMachine) stm);
            return;
        }
        if (handle instanceof Transition
                && (stm == null || stm instanceof StateMachine)) {
            ((Transition) handle).setStateMachine((StateMachine) stm);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or stm: "
                + stm);
    }


    public void setSubvertices(Object handle, Collection subvertices) {
        if (handle instanceof CompositeState) {
            ((CompositeState) handle).getSubvertex().clear();
            ((CompositeState) handle).getSubvertex().addAll(subvertices);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or subvertices: " + subvertices);
    }


    public void setTrigger(Object handle, Object event) {
        if (handle instanceof Transition
                && (event == null || event instanceof Event)) {
            ((Transition) handle).setTrigger((Event) event);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or event: "
                + event);
    }


    public void setWhen(Object handle, Object value) {
        if (handle instanceof TimeEvent
                && (value == null || value instanceof TimeExpression)) {
            Expression oldExp = ((TimeEvent) handle).getWhen();
            if (!equal(oldExp,(Expression) value)) {
                ((TimeEvent) handle).setWhen((TimeExpression) value);
                if (oldExp != null) {
                    Model.getUmlFactory().delete(oldExp);
                }
            }
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or value: "
                + value);
    }


    public void setChangeExpression(Object handle, Object value) {
        if (handle instanceof ChangeEvent
                && (value == null || value instanceof BooleanExpression)) {
            Expression oldExp = ((ChangeEvent) handle).getChangeExpression();
            if (!equal(oldExp, (Expression) value)) {
                ((ChangeEvent) handle)
                        .setChangeExpression((BooleanExpression) value);
                if (oldExp != null) {
                    Model.getUmlFactory().delete(oldExp);
                }
            }
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or value: "
                + value);
    }


    public String getPath(Object o) {
        try {
            if (o instanceof StateVertex) {
                Object o1 = o;
                Object o2 = Model.getFacade().getContainer(o1);
                String path = Model.getFacade().getName(o1);
                while ((o2 != null) && (!Model.getFacade().isTop(o2))) {
                    path = Model.getFacade().getName(o2) + "::" + path;
                    o1 = o2;
                    o2 = Model.getFacade().getContainer(o1);
                }
                return path;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException(
                "Argument must be a StateVertex");
    }


    public Object getStatebyName(String path, Object container) {
        try {
            if (container != null 
                    && Model.getFacade().isACompositeState(container)
                    && path != null) {

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
                
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        return null;
    }


    public void setReferenceState(Object o, String referenced) {
        if (o instanceof StubState) {
            ((StubState) o).setReferenceState(referenced);
            return;
        }
        throw new IllegalArgumentException("handle: " + o);
    }


    public Object findNamespaceForEvent(Object trans, Object model) {
        try {
            Object enclosing =
                Model.getStateMachinesHelper().getStateMachine(trans);
            while ((!Model.getFacade().isAPackage(enclosing))
                    && (enclosing != null)) {
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
        if (state instanceof State && deferrableEvent instanceof Event) {
            ((State) state).getDeferrableEvent().add((Event) deferrableEvent);
            return;
        }
        throw new IllegalArgumentException("handle: " + state + " or evt: "
                + deferrableEvent);
    }

    
    public void removeDeferrableEvent(Object state, Object deferrableEvent) {
        try {
            if (state instanceof State && deferrableEvent instanceof Event) {
                ((State) state).getDeferrableEvent().remove(deferrableEvent);
                return;
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("handle: " + state + " or evt: "
                + deferrableEvent);
    }


    public void setContext(Object statemachine, Object modelElement) {
        if (statemachine instanceof StateMachine
                && modelElement instanceof ModelElement) {
            ((StateMachine) statemachine)
                    .setContext((ModelElement) modelElement);
            return;
        }
        throw new IllegalArgumentException("handle: " + statemachine
                + " or me: " + modelElement);
    }
}