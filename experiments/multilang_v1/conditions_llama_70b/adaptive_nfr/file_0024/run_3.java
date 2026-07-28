class CommonBehaviorHelperMDRImpl implements CommonBehaviorHelper {

    private MDRModelImplementation modelImpl;

    public CommonBehaviorHelperMDRImpl(MDRModelImplementation implementation) {
        this.modelImpl = implementation;
    }

    public Object getSource(Object link) {
        if (link instanceof Link) {
            return getSourceFromLink(link);
        }
        throw new IllegalArgumentException("Argument is not a link");
    }

    private Object getSourceFromLink(Object link) {
        try {
            return modelImpl.getCoreHelper().getSource(link);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public Object getDestination(Object link) {
        if (link instanceof Link) {
            return getDestinationFromLink(link);
        }
        throw new IllegalArgumentException("Argument is not a link");
    }

    private Object getDestinationFromLink(Object link) {
        try {
            return modelImpl.getCoreHelper().getDestination(link);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void removeActualArgument(Object handle, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            removeArgumentFromAction(handle, argument);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + argument);
        }
    }

    private void removeArgumentFromAction(Object handle, Object argument) {
        try {
            ((Action) handle).getActualArgument().remove(argument);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void setActualArguments(Object action, List arguments) {
        if (action instanceof Action) {
            setArgumentsForAction(action, arguments);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + action + " or " + arguments);
        }
    }

    private void setArgumentsForAction(Object action, List arguments) {
        try {
            ((Action) action).getActualArgument().clear();
            ((Action) action).getActualArgument().addAll(arguments);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void removeClassifier(Object handle, Object classifier) {
        if (handle instanceof Instance && classifier instanceof Classifier) {
            removeClassifierFromInstance(handle, classifier);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + classifier);
        }
    }

    private void removeClassifierFromInstance(Object handle, Object classifier) {
        try {
            ((Instance) handle).getClassifier().remove(classifier);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void removeContext(Object handle, Object context) {
        if (handle instanceof Signal && context instanceof BehavioralFeature) {
            removeContextFromSignal(handle, context);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + context);
        }
    }

    private void removeContextFromSignal(Object handle, Object context) {
        try {
            ((org.omg.uml.UmlPackage) ((Signal) handle).refOutermostPackage()).getCommonBehavior().getAContextRaisedSignal().remove((BehavioralFeature) context, (Signal) handle);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void removeReception(Object handle, Object reception) {
        if (handle instanceof Signal && reception instanceof Reception) {
            removeReceptionFromSignal(handle, reception);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + reception);
        }
    }

    private void removeReceptionFromSignal(Object handle, Object reception) {
        try {
            ((Reception) reception).setSignal(null);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void addActualArgument(Object handle, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            addArgumentToAction(handle, argument);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + argument);
        }
    }

    private void addArgumentToAction(Object handle, Object argument) {
        ((Action) handle).getActualArgument().add((Argument) argument);
    }

    public void addActualArgument(Object handle, int position, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            addArgumentToActionAtPosition(handle, position, argument);
        } else {
            throw new IllegalArgumentException();
        }
    }

    private void addArgumentToActionAtPosition(Object handle, int position, Object argument) {
        try {
            ((Action) handle).getActualArgument().add(position, (Argument) argument);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void addClassifier(Object handle, Object classifier) {
        if (handle instanceof Instance && classifier instanceof Classifier) {
            addClassifierToInstance(handle, classifier);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + classifier);
        }
    }

    private void addClassifierToInstance(Object handle, Object classifier) {
        ((Instance) handle).getClassifier().add((Classifier) classifier);
    }

    private void addContext(Object handle, Object behavorialFeature) {
        if (handle instanceof Signal && behavorialFeature instanceof BehavioralFeature) {
            addContextToSignal(handle, behavorialFeature);
        }
    }

    private void addContextToSignal(Object handle, Object behavorialFeature) {
        ((org.omg.uml.UmlPackage) ((Signal) handle).refOutermostPackage()).getCommonBehavior().getAContextRaisedSignal().add((BehavioralFeature) behavorialFeature, (Signal) handle);
    }

    private void addReception(Object handle, Object rec) {
        if (handle instanceof Signal && rec instanceof Reception) {
            addReceptionToSignal(handle, rec);
        }
    }

    private void addReceptionToSignal(Object handle, Object rec) {
        ((Reception) rec).setSignal((Signal) handle);
    }

    public void addStimulus(Object handle, Object stimulus) {
        if (handle != null && stimulus != null && stimulus instanceof Stimulus) {
            if (handle instanceof Action) {
                addStimulusToAction(handle, stimulus);
            } else if (handle instanceof Link) {
                addStimulusToLink(handle, stimulus);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or stimulus: " + stimulus);
            }
        }
    }

    private void addStimulusToAction(Object handle, Object stimulus) {
        ((Stimulus) stimulus).setDispatchAction((Action) handle);
    }

    private void addStimulusToLink(Object handle, Object stimulus) {
        ((Stimulus) stimulus).setCommunicationLink((Link) handle);
    }

    public void setAsynchronous(Object handle, boolean value) {
        if (handle instanceof Action) {
            setAsynchronousForAction(handle, value);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    private void setAsynchronousForAction(Object handle, boolean value) {
        ((Action) handle).setAsynchronous(value);
    }

    public void setOperation(Object handle, Object operation) {
        if (handle instanceof CallAction && (operation == null || operation instanceof Operation)) {
            setOperationForCallAction(handle, operation);
        } else if (handle instanceof CallEvent && (operation == null || operation instanceof Operation)) {
            setOperationForCallEvent(handle, operation);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or operation: " + operation);
        }
    }

    private void setOperationForCallAction(Object handle, Object operation) {
        ((CallAction) handle).setOperation((Operation) operation);
    }

    private void setOperationForCallEvent(Object handle, Object operation) {
        ((CallEvent) handle).setOperation((Operation) operation);
    }

    public void setClassifiers(Object handle, Collection classifiers) {
        if (handle instanceof Instance) {
            setClassifiersForInstance(handle, classifiers);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    private void setClassifiersForInstance(Object handle, Collection classifiers) {
        ((Instance) handle).getClassifier().retainAll(classifiers);
        ((Instance) handle).getClassifier().addAll(classifiers);
    }

    public void setCommunicationLink(Object handle, Object c) {
        if (handle instanceof Stimulus && c instanceof Link) {
            setCommunicationLinkForStimulus(handle, c);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or c: " + c);
        }
    }

    private void setCommunicationLinkForStimulus(Object handle, Object c) {
        ((Stimulus) handle).setCommunicationLink((Link) c);
    }

    public void setComponentInstance(Object handle, Object c) {
        if (handle instanceof Instance && (c == null || c instanceof ComponentInstance)) {
            setComponentInstanceForInstance(handle, c);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or c: " + c);
        }
    }

    private void setComponentInstanceForInstance(Object handle, Object c) {
        ((Instance) handle).setComponentInstance((ComponentInstance) c);
    }

    public void setContexts(Object handle, Collection c) {
        if (handle instanceof Signal) {
            setContextsForSignal(handle, c);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    private void setContextsForSignal(Object handle, Collection c) {
        Collection actualContexts = Model.getFacade().getContexts(handle);
        if (!actualContexts.isEmpty()) {
            Collection contexts = new ArrayList(actualContexts);
            for (Object context : contexts) {
                removeContext(handle, context);
            }
        }
        for (Object context : c) {
            addContext(handle, context);
        }
    }

    public void setDispatchAction(Object handle, Object value) {
        if (handle instanceof Stimulus && (value == null || value instanceof Action)) {
            setDispatchActionForStimulus(handle, value);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
    }

    private void setDispatchActionForStimulus(Object handle, Object value) {
        ((Stimulus) handle).setDispatchAction((Action) value);
    }

    public void setInstance(Object handle, Object inst) {
        if (inst == null || inst instanceof Instance) {
            if (handle instanceof LinkEnd) {
                setInstanceForLinkEnd(handle, inst);
            } else if (handle instanceof AttributeLink) {
                setInstanceForAttributeLink(handle, inst);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or inst: " + inst);
            }
        }
    }

    private void setInstanceForLinkEnd(Object handle, Object inst) {
        ((LinkEnd) handle).setInstance((Instance) inst);
    }

    private void setInstanceForAttributeLink(Object handle, Object inst) {
        ((AttributeLink) handle).setInstance((Instance) inst);
    }

    public void setNodeInstance(Object handle, Object nodeInstance) {
        if (handle instanceof ComponentInstance && nodeInstance instanceof NodeInstance) {
            setNodeInstanceForComponentInstance(handle, nodeInstance);
        } else if (handle instanceof ComponentInstance && nodeInstance == null) {
            setNodeInstanceForComponentInstance(handle, nodeInstance);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or nodeInstance: " + nodeInstance);
        }
    }

    private void setNodeInstanceForComponentInstance(Object handle, Object nodeInstance) {
        ((ComponentInstance) handle).setNodeInstance((NodeInstance) nodeInstance);
    }

    public void setReceiver(Object handle, Object receiver) {
        if (handle instanceof Message && (receiver instanceof ClassifierRole || receiver == null)) {
            setReceiverForMessage(handle, receiver);
        } else if (handle instanceof Stimulus && receiver instanceof Instance) {
            setReceiverForStimulus(handle, receiver);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or receiver: " + receiver);
        }
    }

    private void setReceiverForMessage(Object handle, Object receiver) {
        ((Message) handle).setReceiver((ClassifierRole) receiver);
    }

    private void setReceiverForStimulus(Object handle, Object receiver) {
        ((Stimulus) handle).setReceiver((Instance) receiver);
    }

    public void setReception(Object handle, Collection c) {
        if (handle instanceof Signal) {
            setReceptionForSignal(handle, c);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    private void setReceptionForSignal(Object handle, Collection c) {
        Collection actualReceptions = Model.getFacade().getReceptions(handle);
        if (!actualReceptions.isEmpty()) {
            Collection receptions = new ArrayList(actualReceptions);
            for (Object reception : receptions) {
                removeReception(handle, reception);
            }
        }
        for (Object reception : c) {
            addReception(handle, reception);
        }
    }

    public void setRecurrence(Object handle, Object expr) {
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

    public void setScript(Object handle, Object expr) {
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

    public void setSender(Object handle, Object sender) {
        if (handle instanceof Message && (sender instanceof ClassifierRole || sender == null)) {
            setSenderForMessage(handle, sender);
        } else if (handle instanceof Stimulus && sender instanceof Instance) {
            setSenderForStimulus(handle, sender);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or sender: " + sender);
        }
    }

    private void setSenderForMessage(Object handle, Object sender) {
        ((Message) handle).setSender((ClassifierRole) sender);
    }

    private void setSenderForStimulus(Object handle, Object sender) {
        ((Stimulus) handle).setSender((Instance) sender);
    }

    public void setSignal(Object handle, Object signal) {
        if (signal == null || signal instanceof Signal) {
            if (handle instanceof SendAction) {
                setSignalForSendAction(handle, signal);
            } else if (handle instanceof Reception) {
                setSignalForReception(handle, signal);
            } else if (handle instanceof SignalEvent) {
                setSignalForSignalEvent(handle, signal);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or signal: " + signal);
            }
        }
    }

    private void setSignalForSendAction(Object handle, Object signal) {
        ((SendAction) handle).setSignal((Signal) signal);
    }

    private void setSignalForReception(Object handle, Object signal) {
        ((Reception) handle).setSignal((Signal) signal);
    }

    private void setSignalForSignalEvent(Object handle, Object signal) {
        ((SignalEvent) handle).setSignal((Signal) signal);
    }

    public void setSpecification(Object handle, String specification) {
        if (handle instanceof Reception) {
            setSpecificationForReception(handle, specification);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    private void setSpecificationForReception(Object handle, String specification) {
        ((Reception) handle).setSpecification(specification);
    }

    public void setTarget(Object handle, Object element) {
        if (handle instanceof Action && element instanceof ObjectSetExpression) {
            setTargetForAction(handle, element);
        } else if (handle instanceof Transition && (element == null || element instanceof StateVertex)) {
            setTargetForTransition(handle, element);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or element: " + element);
        }
    }

    private void setTargetForAction(Object handle, Object element) {
        Action action = (Action) handle;
        ObjectSetExpression oldExpr = action.getTarget();
        ObjectSetExpression newExpr = (ObjectSetExpression) element;
        if (!equal(oldExpr, newExpr)) {
            action.setTarget(newExpr);
            if (oldExpr != null) {
                Model.getUmlFactory().delete(oldExpr);
            }
        }
    }

    private void setTargetForTransition(Object handle, Object element) {
        ((Transition) handle).setTarget((StateVertex) element);
    }

    public void setTransition(Object handle, Object trans) {
        if (trans instanceof Transition) {
            if (handle instanceof Guard) {
                setTransitionForGuard(handle, trans);
            } else if (handle instanceof Action) {
                setTransitionForAction(handle, trans);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or trans: " + trans);
            }
        }
    }

    private void setTransitionForGuard(Object handle, Object trans) {
        ((Guard) handle).setTransition((Transition) trans);
    }

    private void setTransitionForAction(Object handle, Object trans) {
        ((Transition) trans).setEffect((Action) handle);
    }

    public void setValue(Object handle, Object value) {
        if (handle instanceof Argument) {
            setValueForArgument(handle, value);
        } else if (handle instanceof AttributeLink) {
            setValueForAttributeLink(handle, value);
        } else if (handle instanceof TaggedValue && value instanceof String) {
            setValueForTaggedValue(handle, value);
        } else {
            throw new IllegalArgumentException("handle: " + handle + ", value:" + value);
        }
    }

    private void setValueForArgument(Object handle, Object value) {
        Argument argument = (Argument) handle;
        Expression oldExpr = argument.getValue();
        Expression newExpr = (Expression) value;
        if (!equal(oldExpr, newExpr)) {
            argument.setValue(newExpr);
            if (oldExpr != null) {
                Model.getUmlFactory().delete(oldExpr);
            }
        }
    }

    private void setValueForAttributeLink(Object handle, Object value) {
        ((AttributeLink) handle).setValue((Instance) value);
    }

    private void setValueForTaggedValue(Object handle, Object value) {
        modelImpl.getExtensionMechanismsHelper().setDataValues(handle, new String[] {(String) value});
    }

    public Classifier getInstantiation(Object createaction) {
        if (createaction instanceof CreateAction) {
            return getInstantiationForCreateAction(createaction);
        } else {
            throw new IllegalArgumentException("handle: " + createaction);
        }
    }

    private Classifier getInstantiationForCreateAction(Object createaction) {
        try {
            return ((CreateAction) createaction).getInstantiation();
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void setInstantiation(Object createaction, Object instantiation) {
        if (createaction instanceof CreateAction) {
            if (instantiation instanceof Classifier) {
                setInstantiationForCreateAction(createaction, instantiation);
            } else if (instantiation == null) {
                setInstantiationForCreateAction(createaction, instantiation);
            } else {
                throw new IllegalArgumentException("handle: " + createaction + ", value:" + instantiation);
            }
        }
    }

    private void setInstantiationForCreateAction(Object createaction, Object instantiation) {
        ((CreateAction) createaction).setInstantiation((Classifier) instantiation);
    }

    public Object getActionOwner(Object action) {
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

    public void addAction(Object handle, Object action) {
        if (!(handle instanceof ActionSequence) || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            ((ActionSequence) handle).getAction().add((Action) action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void addAction(Object handle, int position, Object action) {
        if (!(handle instanceof ActionSequence) || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            ((ActionSequence) handle).getAction().add(position, (Action) action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void removeAction(Object handle, Object action) {
        if (!(handle instanceof ActionSequence) || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            ((ActionSequence) handle).getAction().remove(action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }
}