class CommonBehaviorHelperMDRImpl implements CommonBehaviorHelper {

    private MDRModelImplementation modelImpl;

    public CommonBehaviorHelperMDRImpl(MDRModelImplementation implementation) {
        this.modelImpl = implementation;
    }

    // Extracted method to handle link source
    private Object getLinkSource(Object link) {
        try {
            if (link instanceof Link) {
                return modelImpl.getCoreHelper().getSource(link);
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("Argument is not a link");
    }

    public Object getSource(Object link) {
        return getLinkSource(link);
    }

    // Extracted method to handle link destination
    private Object getLinkDestination(Object link) {
        try {
            if (link instanceof Link) {
                return modelImpl.getCoreHelper().getDestination(link);
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("Argument is not a link");
    }

    public Object getDestination(Object link) {
        return getLinkDestination(link);
    }

    // Extracted method to handle actual argument removal
    private void removeActualArgumentFromAction(Object handle, Object argument) {
        try {
            if (handle instanceof Action && argument instanceof Argument) {
                ((Action) handle).getActualArgument().remove(argument);
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("Unrecognized object " + handle + " or " + argument);
    }

    public void removeActualArgument(Object handle, Object argument) {
        removeActualArgumentFromAction(handle, argument);
    }

    // Extracted method to handle actual argument setting
    private void setActualArgumentsForAction(Object action, List arguments) {
        try {
            if (action instanceof Action) {
                ((Action) action).getActualArgument().clear();
                ((Action) action).getActualArgument().addAll(arguments);
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("Unrecognized object " + action + " or " + arguments);
    }

    public void setActualArguments(Object action, List arguments) {
        setActualArgumentsForAction(action, arguments);
    }

    // Extracted method to handle classifier removal
    private void removeClassifierFromInstance(Object handle, Object classifier) {
        try {
            if (handle instanceof Instance && classifier instanceof Classifier) {
                ((Instance) handle).getClassifier().remove(classifier);
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("Unrecognized object " + handle + " or " + classifier);
    }

    public void removeClassifier(Object handle, Object classifier) {
        removeClassifierFromInstance(handle, classifier);
    }

    // Extracted method to handle context removal
    private void removeContextFromSignal(Object handle, Object context) {
        try {
            if (handle instanceof Signal && context instanceof BehavioralFeature) {
                ((org.omg.uml.UmlPackage) ((Signal) handle).refOutermostPackage()).getCommonBehavior().getAContextRaisedSignal().remove((BehavioralFeature) context, (Signal) handle);
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("Unrecognized object " + handle + " or " + context);
    }

    public void removeContext(Object handle, Object context) {
        removeContextFromSignal(handle, context);
    }

    // Extracted method to handle reception removal
    private void removeReceptionFromSignal(Object handle, Object reception) {
        try {
            if (handle instanceof Signal && reception instanceof Reception) {
                ((Reception) reception).setSignal(null);
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("Unrecognized object " + handle + " or " + reception);
    }

    public void removeReception(Object handle, Object reception) {
        removeReceptionFromSignal(handle, reception);
    }

    // Extracted method to handle actual argument addition
    private void addActualArgumentToAction(Object handle, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            ((Action) handle).getActualArgument().add((Argument) argument);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + argument);
        }
    }

    public void addActualArgument(Object handle, Object argument) {
        addActualArgumentToAction(handle, argument);
    }

    // Extracted method to handle actual argument addition at position
    private void addActualArgumentToActionAtPosition(Object handle, int position, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            try {
                ((Action) handle).getActualArgument().add(position, (Argument) argument);
            } catch (InvalidObjectException e) {
                throw new InvalidElementException(e);
            }
        } else {
            throw new IllegalArgumentException();
        }
    }

    public void addActualArgument(Object handle, int position, Object argument) {
        addActualArgumentToActionAtPosition(handle, position, argument);
    }

    // Extracted method to handle classifier addition
    private void addClassifierToInstance(Object handle, Object classifier) {
        if (handle instanceof Instance && classifier instanceof Classifier) {
            ((Instance) handle).getClassifier().add((Classifier) classifier);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + classifier);
        }
    }

    public void addClassifier(Object handle, Object classifier) {
        addClassifierToInstance(handle, classifier);
    }

    // Extracted method to handle context addition
    private void addContextToSignal(Object handle, Object behavioralFeature) {
        if (handle instanceof Signal && behavioralFeature instanceof BehavioralFeature) {
            ((org.omg.uml.UmlPackage) ((Signal) handle).refOutermostPackage()).getCommonBehavior().getAContextRaisedSignal().add((BehavioralFeature) behavioralFeature, (Signal) handle);
        }
    }

    // Extracted method to handle reception addition
    private void addReceptionToSignal(Object handle, Object reception) {
        if (handle instanceof Signal && reception instanceof Reception) {
            ((Reception) reception).setSignal((Signal) handle);
        }
    }

    // Extracted method to handle stimulus addition
    private void addStimulusToHandle(Object handle, Object stimulus) {
        if (handle != null && stimulus != null && stimulus instanceof Stimulus) {
            if (handle instanceof Action) {
                ((Stimulus) stimulus).setDispatchAction((Action) handle);
            } else if (handle instanceof Link) {
                ((Stimulus) stimulus).setCommunicationLink((Link) handle);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or stimulus: " + stimulus);
            }
        }
    }

    public void addStimulus(Object handle, Object stimulus) {
        addStimulusToHandle(handle, stimulus);
    }

    // Extracted method to handle asynchronous setting
    private void setAsynchronousForAction(Object handle, boolean value) {
        if (handle instanceof Action) {
            ((Action) handle).setAsynchronous(value);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    public void setAsynchronous(Object handle, boolean value) {
        setAsynchronousForAction(handle, value);
    }

    // Extracted method to handle operation setting
    private void setOperationForObject(Object handle, Object operation) {
        if (handle instanceof CallAction && (operation == null || operation instanceof Operation)) {
            ((CallAction) handle).setOperation((Operation) operation);
        } else if (handle instanceof CallEvent && (operation == null || operation instanceof Operation)) {
            ((CallEvent) handle).setOperation((Operation) operation);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or operation: " + operation);
        }
    }

    public void setOperation(Object handle, Object operation) {
        setOperationForObject(handle, operation);
    }

    // Extracted method to handle classifiers setting
    private void setClassifiersForInstance(Object handle, Collection classifiers) {
        if (handle instanceof Instance) {
            ((Instance) handle).getClassifier().retainAll(classifiers);
            ((Instance) handle).getClassifier().addAll(classifiers);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    public void setClassifiers(Object handle, Collection classifiers) {
        setClassifiersForInstance(handle, classifiers);
    }

    // Extracted method to handle communication link setting
    private void setCommunicationLinkForStimulus(Object handle, Object link) {
        if (handle instanceof Stimulus && link instanceof Link) {
            ((Stimulus) handle).setCommunicationLink((Link) link);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or link: " + link);
        }
    }

    public void setCommunicationLink(Object handle, Object link) {
        setCommunicationLinkForStimulus(handle, link);
    }

    // Extracted method to handle component instance setting
    private void setComponentInstanceForObject(Object handle, Object componentInstance) {
        if (handle instanceof Instance && (componentInstance == null || componentInstance instanceof ComponentInstance)) {
            ((Instance) handle).setComponentInstance((ComponentInstance) componentInstance);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or componentInstance: " + componentInstance);
        }
    }

    public void setComponentInstance(Object handle, Object componentInstance) {
        setComponentInstanceForObject(handle, componentInstance);
    }

    // Extracted method to handle contexts setting
    private void setContextsForSignal(Object handle, Collection contexts) {
        if (handle instanceof Signal) {
            Collection actualContexts = Model.getFacade().getContexts(handle);
            if (!actualContexts.isEmpty()) {
                Collection contextsToRemove = new ArrayList(actualContexts);
                for (Object context : contextsToRemove) {
                    removeContextFromSignal(handle, context);
                }
            }
            for (Object context : contexts) {
                addContextToSignal(handle, context);
            }
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    public void setContexts(Object handle, Collection contexts) {
        setContextsForSignal(handle, contexts);
    }

    // Extracted method to handle dispatch action setting
    private void setDispatchActionForStimulus(Object handle, Object action) {
        if (handle instanceof Stimulus && (action == null || action instanceof Action)) {
            ((Stimulus) handle).setDispatchAction((Action) action);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or action: " + action);
        }
    }

    public void setDispatchAction(Object handle, Object action) {
        setDispatchActionForStimulus(handle, action);
    }

    // Extracted method to handle instance setting
    private void setInstanceForObject(Object handle, Object instance) {
        if (instance == null || instance instanceof Instance) {
            if (handle instanceof LinkEnd) {
                ((LinkEnd) handle).setInstance((Instance) instance);
            } else if (handle instanceof AttributeLink) {
                ((AttributeLink) handle).setInstance((Instance) instance);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or instance: " + instance);
            }
        }
    }

    public void setInstance(Object handle, Object instance) {
        setInstanceForObject(handle, instance);
    }

    // Extracted method to handle node instance setting
    private void setNodeInstanceForObject(Object handle, Object nodeInstance) {
        if (handle instanceof ComponentInstance && nodeInstance instanceof NodeInstance) {
            ((ComponentInstance) handle).setNodeInstance((NodeInstance) nodeInstance);
        } else if (handle instanceof ComponentInstance && nodeInstance == null) {
            ((ComponentInstance) handle).setNodeInstance(null);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or nodeInstance: " + nodeInstance);
        }
    }

    public void setNodeInstance(Object handle, Object nodeInstance) {
        setNodeInstanceForObject(handle, nodeInstance);
    }

    // Extracted method to handle receiver setting
    private void setReceiverForObject(Object handle, Object receiver) {
        if (handle instanceof Message && (receiver instanceof ClassifierRole || receiver == null)) {
            ((Message) handle).setReceiver((ClassifierRole) receiver);
        } else if (handle instanceof Stimulus && receiver instanceof Instance) {
            ((Stimulus) handle).setReceiver((Instance) receiver);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or receiver: " + receiver);
        }
    }

    public void setReceiver(Object handle, Object receiver) {
        setReceiverForObject(handle, receiver);
    }

    // Extracted method to handle reception setting
    private void setReceptionForSignal(Object handle, Collection receptions) {
        if (handle instanceof Signal) {
            Collection actualReceptions = Model.getFacade().getReceptions(handle);
            if (!actualReceptions.isEmpty()) {
                Collection receptionsToRemove = new ArrayList(actualReceptions);
                for (Object reception : receptionsToRemove) {
                    removeReceptionFromSignal(handle, reception);
                }
            }
            for (Object reception : receptions) {
                addReceptionToSignal(handle, reception);
            }
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    public void setReception(Object handle, Collection receptions) {
        setReceptionForSignal(handle, receptions);
    }

    // Extracted method to handle recurrence setting
    private void setRecurrenceForAction(Object handle, Object expr) {
        Action action = (Action) handle;
        IterationExpression oldExpr = action.getRecurrence();
        IterationExpression newExpr = (IterationExpression) expr;
        if (!equal(oldExpr, newExpr)) {
            action.setRecurrence(newExpr);
            if (oldExpr != null) {
                Model.getUmlFactory().delete(oldExpr);
            }
        }
    }

    public void setRecurrence(Object handle, Object expr) {
        setRecurrenceForAction(handle, expr);
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

    // Extracted method to handle script setting
    private void setScriptForAction(Object handle, Object expr) {
        if (handle instanceof Action && (expr == null || expr instanceof ActionExpression)) {
            Action a = (Action) handle;
            ActionExpression oldae = a.getScript();
            ActionExpression newae = (ActionExpression) expr;
            if (equal(oldae, newae)) {
                return;
            }
            a.setScript(newae);
            if (oldae != null) {
                modelImpl.getUmlFactory().delete(oldae);
            }
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or expr: " + expr);
        }
    }

    public void setScript(Object handle, Object expr) {
        setScriptForAction(handle, expr);
    }

    // Extracted method to handle sender setting
    private void setSenderForObject(Object handle, Object sender) {
        if (handle instanceof Message && (sender instanceof ClassifierRole || sender == null)) {
            ((Message) handle).setSender((ClassifierRole) sender);
        } else if (handle instanceof Stimulus && sender instanceof Instance) {
            ((Stimulus) handle).setSender((Instance) sender);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or sender: " + sender);
        }
    }

    public void setSender(Object handle, Object sender) {
        setSenderForObject(handle, sender);
    }

    // Extracted method to handle signal setting
    private void setSignalForObject(Object handle, Object signal) {
        if (signal == null || signal instanceof Signal) {
            if (handle instanceof SendAction) {
                ((SendAction) handle).setSignal((Signal) signal);
            } else if (handle instanceof Reception) {
                ((Reception) handle).setSignal((Signal) signal);
            } else if (handle instanceof SignalEvent) {
                ((SignalEvent) handle).setSignal((Signal) signal);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or signal: " + signal);
            }
        }
    }

    public void setSignal(Object handle, Object signal) {
        setSignalForObject(handle, signal);
    }

    // Extracted method to handle specification setting
    private void setSpecificationForReception(Object handle, String specification) {
        if (handle instanceof Reception) {
            ((Reception) handle).setSpecification(specification);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    public void setSpecification(Object handle, String specification) {
        setSpecificationForReception(handle, specification);
    }

    // Extracted method to handle target setting
    private void setTargetForObject(Object handle, Object element) {
        if (handle instanceof Action && element instanceof ObjectSetExpression) {
            Action action = (Action) handle;
            ObjectSetExpression oldExpr = action.getTarget();
            ObjectSetExpression newExpr = (ObjectSetExpression) element;
            if (!equal(oldExpr, newExpr)) {
                action.setTarget(newExpr);
                if (oldExpr != null) {
                    Model.getUmlFactory().delete(oldExpr);
                }
            }
        } else if (handle instanceof Transition && (element == null || element instanceof StateVertex)) {
            ((Transition) handle).setTarget((StateVertex) element);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or element: " + element);
        }
    }

    public void setTarget(Object handle, Object element) {
        setTargetForObject(handle, element);
    }

    // Extracted method to handle transition setting
    private void setTransitionForObject(Object handle, Object trans) {
        if (trans instanceof Transition) {
            if (handle instanceof Guard) {
                ((Guard) handle).setTransition((Transition) trans);
            } else if (handle instanceof Action) {
                ((Transition) trans).setEffect((Action) handle);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or trans: " + trans);
            }
        }
    }

    public void setTransition(Object handle, Object trans) {
        setTransitionForObject(handle, trans);
    }

    // Extracted method to handle value setting
    private void setValueForObject(Object handle, Object value) {
        if (handle instanceof Argument) {
            ((Argument) handle).setValue((Expression) value);
            Argument argument = (Argument) handle;
            Expression oldExpr = argument.getValue();
            Expression newExpr = (Expression) value;
            if (!equal(oldExpr, newExpr)) {
                argument.setValue(newExpr);
                if (oldExpr != null) {
                    Model.getUmlFactory().delete(oldExpr);
                }
            }
        } else if (handle instanceof AttributeLink) {
            ((AttributeLink) handle).setValue((Instance) value);
        } else if (handle instanceof TaggedValue && value instanceof String) {
            modelImpl.getExtensionMechanismsHelper().setDataValues(handle, new String[] {(String) value});
        } else {
            throw new IllegalArgumentException("handle: " + handle + ", value:" + value);
        }
    }

    public void setValue(Object handle, Object value) {
        setValueForObject(handle, value);
    }

    // Extracted method to handle instantiation getting
    private Classifier getInstantiationFromCreateAction(Object createaction) {
        try {
            if (createaction instanceof CreateAction) {
                return ((CreateAction) createaction).getInstantiation();
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("handle: " + createaction);
    }

    public Classifier getInstantiation(Object createaction) {
        return getInstantiationFromCreateAction(createaction);
    }

    // Extracted method to handle instantiation setting
    private void setInstantiationForCreateAction(Object createaction, Object instantiation) {
        if (createaction instanceof CreateAction) {
            if (instantiation instanceof Classifier) {
                ((CreateAction) createaction).setInstantiation((Classifier) instantiation);
            } else if (instantiation == null) {
                ((CreateAction) createaction).setInstantiation(null);
            }
        } else {
            throw new IllegalArgumentException("handle: " + createaction + ", value:" + instantiation);
        }
    }

    public void setInstantiation(Object createaction, Object instantiation) {
        setInstantiationForCreateAction(createaction, instantiation);
    }

    // Extracted method to handle action owner getting
    private Object getActionOwner(Object action) {
        if (!(action instanceof Action)) {
            throw new IllegalArgumentException();
        }

        try {
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
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        return null;
    }

    public Object getActionOwner(Object action) {
        return getActionOwner(action);
    }

    // Extracted method to handle action adding
    private void addActionToActionSequence(Object handle, Object action) {
        if (!(handle instanceof ActionSequence) || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            ((ActionSequence) handle).getAction().add((Action) action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void addAction(Object handle, Object action) {
        addActionToActionSequence(handle, action);
    }

    // Extracted method to handle action adding at position
    private void addActionToActionSequenceAtPosition(Object handle, int position, Object action) {
        if (!(handle instanceof ActionSequence) || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            ((ActionSequence) handle).getAction().add(position, (Action) action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void addAction(Object handle, int position, Object action) {
        addActionToActionSequenceAtPosition(handle, position, action);
    }

    // Extracted method to handle action removal
    private void removeActionFromActionSequence(Object handle, Object action) {
        if (!(handle instanceof ActionSequence) || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            ((ActionSequence) handle).getAction().remove(action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void removeAction(Object handle, Object action) {
        removeActionFromActionSequence(handle, action);
    }
}