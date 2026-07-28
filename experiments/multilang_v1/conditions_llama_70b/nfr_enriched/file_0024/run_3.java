class CommonBehaviorHelperMDRImpl implements CommonBehaviorHelper {

    private MDRModelImplementation modelImpl;

    public CommonBehaviorHelperMDRImpl(MDRModelImplementation implementation) {
        this.modelImpl = implementation;
    }

    // Extracted method to handle link source
    private Object getLinkSource(Object link) {
        if (link instanceof Link) {
            return modelImpl.getCoreHelper().getSource(link);
        }
        throw new IllegalArgumentException("Argument is not a link");
    }

    public Object getSource(Object link) {
        try {
            return getLinkSource(link);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    // Extracted method to handle link destination
    private Object getLinkDestination(Object link) {
        if (link instanceof Link) {
            return modelImpl.getCoreHelper().getDestination(link);
        }
        throw new IllegalArgumentException("Argument is not a link");
    }

    public Object getDestination(Object link) {
        try {
            return getLinkDestination(link);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    // Extracted method to remove actual argument
    private void removeActualArgument(Action action, Argument argument) {
        action.getActualArgument().remove(argument);
    }

    public void removeActualArgument(Object handle, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            try {
                removeActualArgument((Action) handle, (Argument) argument);
            } catch (InvalidObjectException e) {
                throw new InvalidElementException(e);
            }
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + argument);
        }
    }

    // Extracted method to set actual arguments
    private void setActualArguments(Action action, List arguments) {
        action.getActualArgument().clear();
        action.getActualArgument().addAll(arguments);
    }

    public void setActualArguments(Object action, List arguments) {
        if (action instanceof Action) {
            try {
                setActualArguments((Action) action, arguments);
            } catch (InvalidObjectException e) {
                throw new InvalidElementException(e);
            }
        } else {
            throw new IllegalArgumentException("Unrecognized object " + action + " or " + arguments);
        }
    }

    // Extracted method to remove classifier
    private void removeClassifier(Instance instance, Classifier classifier) {
        instance.getClassifier().remove(classifier);
    }

    public void removeClassifier(Object handle, Object classifier) {
        if (handle instanceof Instance && classifier instanceof Classifier) {
            try {
                removeClassifier((Instance) handle, (Classifier) classifier);
            } catch (InvalidObjectException e) {
                throw new InvalidElementException(e);
            }
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + classifier);
        }
    }

    // Extracted method to remove context
    private void removeContext(Signal signal, BehavioralFeature context) {
        ((org.omg.uml.UmlPackage) signal.refOutermostPackage()).getCommonBehavior().getAContextRaisedSignal().remove(context, signal);
    }

    public void removeContext(Object handle, Object context) {
        if (handle instanceof Signal && context instanceof BehavioralFeature) {
            try {
                removeContext((Signal) handle, (BehavioralFeature) context);
            } catch (InvalidObjectException e) {
                throw new InvalidElementException(e);
            }
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + context);
        }
    }

    // Extracted method to remove reception
    private void removeReception(Signal signal, Reception reception) {
        reception.setSignal(null);
    }

    public void removeReception(Object handle, Object reception) {
        if (handle instanceof Signal && reception instanceof Reception) {
            try {
                removeReception((Signal) handle, (Reception) reception);
            } catch (InvalidObjectException e) {
                throw new InvalidElementException(e);
            }
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + reception);
        }
    }

    // Extracted method to add actual argument
    private void addActualArgument(Action action, Argument argument) {
        action.getActualArgument().add(argument);
    }

    public void addActualArgument(Object handle, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            addActualArgument((Action) handle, (Argument) argument);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + argument);
        }
    }

    // Extracted method to add actual argument at position
    private void addActualArgumentAtPosition(Action action, int position, Argument argument) {
        action.getActualArgument().add(position, argument);
    }

    public void addActualArgument(Object handle, int position, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            try {
                addActualArgumentAtPosition((Action) handle, position, (Argument) argument);
            } catch (InvalidObjectException e) {
                throw new InvalidElementException(e);
            }
        } else {
            throw new IllegalArgumentException();
        }
    }

    // Extracted method to add classifier
    private void addClassifier(Instance instance, Classifier classifier) {
        instance.getClassifier().add(classifier);
    }

    public void addClassifier(Object handle, Object classifier) {
        if (handle instanceof Instance && classifier instanceof Classifier) {
            addClassifier((Instance) handle, (Classifier) classifier);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + classifier);
        }
    }

    // Extracted method to add context
    private void addContext(Signal signal, BehavioralFeature context) {
        ((org.omg.uml.UmlPackage) signal.refOutermostPackage()).getCommonBehavior().getAContextRaisedSignal().add(context, signal);
    }

    public void addContext(Object handle, Object context) {
        if (handle instanceof Signal && context instanceof BehavioralFeature) {
            addContext((Signal) handle, (BehavioralFeature) context);
        } else {
            throw new IllegalArgumentException();
        }
    }

    // Extracted method to add reception
    private void addReception(Signal signal, Reception reception) {
        reception.setSignal(signal);
    }

    public void addReception(Object handle, Object reception) {
        if (handle instanceof Signal && reception instanceof Reception) {
            addReception((Signal) handle, (Reception) reception);
        } else {
            throw new IllegalArgumentException();
        }
    }

    // Extracted method to add stimulus
    private void addStimulus(Object handle, Stimulus stimulus) {
        if (handle instanceof Action) {
            stimulus.setDispatchAction((Action) handle);
        } else if (handle instanceof Link) {
            stimulus.setCommunicationLink((Link) handle);
        }
    }

    public void addStimulus(Object handle, Object stimulus) {
        if (handle != null && stimulus != null && stimulus instanceof Stimulus) {
            addStimulus(handle, (Stimulus) stimulus);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or stimulus: " + stimulus);
        }
    }

    // Extracted method to set asynchronous
    private void setAsynchronous(Action action, boolean value) {
        action.setAsynchronous(value);
    }

    public void setAsynchronous(Object handle, boolean value) {
        if (handle instanceof Action) {
            setAsynchronous((Action) handle, value);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    // Extracted method to set operation
    private void setOperation(CallAction callAction, Operation operation) {
        callAction.setOperation(operation);
    }

    private void setOperation(CallEvent callEvent, Operation operation) {
        callEvent.setOperation(operation);
    }

    public void setOperation(Object handle, Object operation) {
        if (handle instanceof CallAction && (operation == null || operation instanceof Operation)) {
            setOperation((CallAction) handle, (Operation) operation);
        } else if (handle instanceof CallEvent && (operation == null || operation instanceof Operation)) {
            setOperation((CallEvent) handle, (Operation) operation);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or operation: " + operation);
        }
    }

    // Extracted method to set classifiers
    private void setClassifiers(Instance instance, Collection classifiers) {
        instance.getClassifier().retainAll(classifiers);
        instance.getClassifier().addAll(classifiers);
    }

    public void setClassifiers(Object handle, Collection classifiers) {
        if (handle instanceof Instance) {
            setClassifiers((Instance) handle, classifiers);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    // Extracted method to set communication link
    private void setCommunicationLink(Stimulus stimulus, Link link) {
        stimulus.setCommunicationLink(link);
    }

    public void setCommunicationLink(Object handle, Object link) {
        if (handle instanceof Stimulus && link instanceof Link) {
            setCommunicationLink((Stimulus) handle, (Link) link);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or link: " + link);
        }
    }

    // Extracted method to set component instance
    private void setComponentInstance(Instance instance, ComponentInstance componentInstance) {
        instance.setComponentInstance(componentInstance);
    }

    public void setComponentInstance(Object handle, Object componentInstance) {
        if (handle instanceof Instance && (componentInstance == null || componentInstance instanceof ComponentInstance)) {
            setComponentInstance((Instance) handle, (ComponentInstance) componentInstance);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or componentInstance: " + componentInstance);
        }
    }

    // Extracted method to set contexts
    private void setContexts(Signal signal, Collection contexts) {
        Collection actualContexts = Model.getFacade().getContexts(signal);
        if (!actualContexts.isEmpty()) {
            Collection contextsToRemove = new ArrayList(actualContexts);
            for (Object context : contextsToRemove) {
                removeContext(signal, context);
            }
        }
        for (Object context : contexts) {
            addContext(signal, context);
        }
    }

    public void setContexts(Object handle, Collection contexts) {
        if (handle instanceof Signal) {
            setContexts((Signal) handle, contexts);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    // Extracted method to set dispatch action
    private void setDispatchAction(Stimulus stimulus, Action action) {
        stimulus.setDispatchAction(action);
    }

    public void setDispatchAction(Object handle, Object action) {
        if (handle instanceof Stimulus && (action == null || action instanceof Action)) {
            setDispatchAction((Stimulus) handle, (Action) action);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or action: " + action);
        }
    }

    // Extracted method to set instance
    private void setInstance(LinkEnd linkEnd, Instance instance) {
        linkEnd.setInstance(instance);
    }

    private void setInstance(AttributeLink attributeLink, Instance instance) {
        attributeLink.setInstance(instance);
    }

    public void setInstance(Object handle, Object instance) {
        if (instance == null || instance instanceof Instance) {
            if (handle instanceof LinkEnd) {
                setInstance((LinkEnd) handle, (Instance) instance);
            } else if (handle instanceof AttributeLink) {
                setInstance((AttributeLink) handle, (Instance) instance);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or instance: " + instance);
            }
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or instance: " + instance);
        }
    }

    // Extracted method to set node instance
    private void setNodeInstance(ComponentInstance componentInstance, NodeInstance nodeInstance) {
        componentInstance.setNodeInstance(nodeInstance);
    }

    public void setNodeInstance(Object handle, Object nodeInstance) {
        if (handle instanceof ComponentInstance && nodeInstance instanceof NodeInstance) {
            setNodeInstance((ComponentInstance) handle, (NodeInstance) nodeInstance);
        } else if (handle instanceof ComponentInstance && nodeInstance == null) {
            ((ComponentInstance) handle).setNodeInstance(null);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or nodeInstance: " + nodeInstance);
        }
    }

    // Extracted method to set receiver
    private void setReceiver(Message message, ClassifierRole receiver) {
        message.setReceiver(receiver);
    }

    private void setReceiver(Stimulus stimulus, Instance receiver) {
        stimulus.setReceiver(receiver);
    }

    public void setReceiver(Object handle, Object receiver) {
        if (handle instanceof Message && (receiver instanceof ClassifierRole || receiver == null)) {
            setReceiver((Message) handle, (ClassifierRole) receiver);
        } else if (handle instanceof Stimulus && receiver instanceof Instance) {
            setReceiver((Stimulus) handle, (Instance) receiver);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or receiver: " + receiver);
        }
    }

    // Extracted method to set reception
    private void setReception(Signal signal, Collection receptions) {
        Collection actualReceptions = Model.getFacade().getReceptions(signal);
        if (!actualReceptions.isEmpty()) {
            Collection receptionsToRemove = new ArrayList(actualReceptions);
            for (Object reception : receptionsToRemove) {
                removeReception(signal, reception);
            }
        }
        for (Object reception : receptions) {
            addReception(signal, reception);
        }
    }

    public void setReception(Object handle, Collection receptions) {
        if (handle instanceof Signal) {
            setReception((Signal) handle, receptions);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    // Extracted method to set recurrence
    private void setRecurrence(Action action, IterationExpression recurrence) {
        IterationExpression oldRecurrence = action.getRecurrence();
        if (!equal(oldRecurrence, recurrence)) {
            action.setRecurrence(recurrence);
            if (oldRecurrence != null) {
                Model.getUmlFactory().delete(oldRecurrence);
            }
        }
    }

    public void setRecurrence(Object handle, Object recurrence) {
        Action action = (Action) handle;
        IterationExpression newRecurrence = (IterationExpression) recurrence;
        setRecurrence(action, newRecurrence);
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

    // Extracted method to set script
    private void setScript(Action action, ActionExpression script) {
        ActionExpression oldScript = action.getScript();
        if (equal(oldScript, script)) {
            return;
        }
        action.setScript(script);
        if (oldScript != null) {
            modelImpl.getUmlFactory().delete(oldScript);
        }
    }

    public void setScript(Object handle, Object script) {
        if (handle instanceof Action && (script == null || script instanceof ActionExpression)) {
            Action action = (Action) handle;
            ActionExpression newScript = (ActionExpression) script;
            setScript(action, newScript);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or script: " + script);
        }
    }

    // Extracted method to set sender
    private void setSender(Message message, ClassifierRole sender) {
        message.setSender(sender);
    }

    private void setSender(Stimulus stimulus, Instance sender) {
        stimulus.setSender(sender);
    }

    public void setSender(Object handle, Object sender) {
        if (handle instanceof Message && (sender instanceof ClassifierRole || sender == null)) {
            setSender((Message) handle, (ClassifierRole) sender);
        } else if (handle instanceof Stimulus && sender instanceof Instance) {
            setSender((Stimulus) handle, (Instance) sender);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or sender: " + sender);
        }
    }

    // Extracted method to set signal
    private void setSignal(SendAction sendAction, Signal signal) {
        sendAction.setSignal(signal);
    }

    private void setSignal(Reception reception, Signal signal) {
        reception.setSignal(signal);
    }

    private void setSignal(SignalEvent signalEvent, Signal signal) {
        signalEvent.setSignal(signal);
    }

    public void setSignal(Object handle, Object signal) {
        if (signal == null || signal instanceof Signal) {
            if (handle instanceof SendAction) {
                setSignal((SendAction) handle, (Signal) signal);
            } else if (handle instanceof Reception) {
                setSignal((Reception) handle, (Signal) signal);
            } else if (handle instanceof SignalEvent) {
                setSignal((SignalEvent) handle, (Signal) signal);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or signal: " + signal);
            }
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or signal: " + signal);
        }
    }

    // Extracted method to set specification
    private void setSpecification(Reception reception, String specification) {
        reception.setSpecification(specification);
    }

    public void setSpecification(Object handle, String specification) {
        if (handle instanceof Reception) {
            setSpecification((Reception) handle, specification);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    // Extracted method to set target
    private void setTarget(Action action, ObjectSetExpression target) {
        ObjectSetExpression oldTarget = action.getTarget();
        if (!equal(oldTarget, target)) {
            action.setTarget(target);
            if (oldTarget != null) {
                Model.getUmlFactory().delete(oldTarget);
            }
        }
    }

    private void setTarget(Transition transition, StateVertex target) {
        transition.setTarget(target);
    }

    public void setTarget(Object handle, Object target) {
        if (handle instanceof Action && target instanceof ObjectSetExpression) {
            Action action = (Action) handle;
            ObjectSetExpression newTarget = (ObjectSetExpression) target;
            setTarget(action, newTarget);
        } else if (handle instanceof Transition && (target == null || target instanceof StateVertex)) {
            Transition transition = (Transition) handle;
            StateVertex newStateVertex = (StateVertex) target;
            setTarget(transition, newStateVertex);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or target: " + target);
        }
    }

    // Extracted method to set transition
    private void setTransition(Guard guard, Transition transition) {
        guard.setTransition(transition);
    }

    private void setTransition(Transition transition, Action action) {
        transition.setEffect(action);
    }

    public void setTransition(Object handle, Object transition) {
        if (transition instanceof Transition) {
            if (handle instanceof Guard) {
                setTransition((Guard) handle, (Transition) transition);
            } else if (handle instanceof Action) {
                setTransition((Transition) transition, (Action) handle);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or transition: " + transition);
            }
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or transition: " + transition);
        }
    }

    // Extracted method to set value
    private void setValue(Argument argument, Expression value) {
        argument.setValue(value);
    }

    private void setValue(AttributeLink attributeLink, Instance instance) {
        attributeLink.setValue(instance);
    }

    private void setValue(TaggedValue taggedValue, String value) {
        modelImpl.getExtensionMechanismsHelper().setDataValues(taggedValue, new String[] {value});
    }

    public void setValue(Object handle, Object value) {
        if (handle instanceof Argument) {
            Argument argument = (Argument) handle;
            Expression oldExpr = argument.getValue();
            Expression newExpr = (Expression) value;
            if (!equal(oldExpr, newExpr)) {
                setValue(argument, newExpr);
                if (oldExpr != null) {
                    Model.getUmlFactory().delete(oldExpr);
                }
            }
        } else if (handle instanceof AttributeLink) {
            setValue((AttributeLink) handle, (Instance) value);
        } else if (handle instanceof TaggedValue && value instanceof String) {
            setValue((TaggedValue) handle, (String) value);
        } else {
            throw new IllegalArgumentException("handle: " + handle + ", value:" + value);
        }
    }

    // Extracted method to get instantiation
    private Classifier getInstantiation(CreateAction createAction) {
        return createAction.getInstantiation();
    }

    public Classifier getInstantiation(Object createaction) {
        if (createaction instanceof CreateAction) {
            try {
                return getInstantiation((CreateAction) createaction);
            } catch (InvalidObjectException e) {
                throw new InvalidElementException(e);
            }
        } else {
            throw new IllegalArgumentException("handle: " + createaction);
        }
    }

    // Extracted method to set instantiation
    private void setInstantiation(CreateAction createAction, Classifier instantiation) {
        createAction.setInstantiation(instantiation);
    }

    public void setInstantiation(Object createaction, Object instantiation) {
        if (createaction instanceof CreateAction) {
            if (instantiation instanceof Classifier) {
                setInstantiation((CreateAction) createaction, (Classifier) instantiation);
            } else if (instantiation == null) {
                ((CreateAction) createaction).setInstantiation(null);
            } else {
                throw new IllegalArgumentException("handle: " + createaction + ", value:" + instantiation);
            }
        } else {
            throw new IllegalArgumentException("handle: " + createaction + ", value:" + instantiation);
        }
    }

    // Extracted method to get action owner
    private Object getActionOwner(Action action) {
        if (Model.getFacade().getStimuli(action) != null) {
            Iterator iter = Model.getFacade().getStimuli(action).iterator();
            if (iter.hasNext()) {
                return iter.next();
            }
        }
        if (Model.getFacade().getMessages(action) != null) {
            Iterator iter = Model.getFacade().getMessages(action).iterator();
            if (iter.hasNext()) {
                return iter.next();
            }
        }
        if (Model.getFacade().getTransition(action) != null) {
            return Model.getFacade().getTransition(action);
        }
        return null;
    }

    public Object getActionOwner(Object action) {
        if (!(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            return getActionOwner((Action) action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    // Extracted method to add action
    private void addAction(ActionSequence actionSequence, Action action) {
        actionSequence.getAction().add(action);
    }

    public void addAction(Object handle, Object action) {
        if (!(handle instanceof ActionSequence) || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            addAction((ActionSequence) handle, (Action) action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    // Extracted method to add action at position
    private void addActionAtPosition(ActionSequence actionSequence, int position, Action action) {
        actionSequence.getAction().add(position, action);
    }

    public void addAction(Object handle, int position, Object action) {
        if (!(handle instanceof ActionSequence) || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            addActionAtPosition((ActionSequence) handle, position, (Action) action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    // Extracted method to remove action
    private void removeAction(ActionSequence actionSequence, Action action) {
        actionSequence.getAction().remove(action);
    }

    public void removeAction(Object handle, Object action) {
        if (!(handle instanceof ActionSequence) || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            removeAction((ActionSequence) handle, (Action) action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }
}