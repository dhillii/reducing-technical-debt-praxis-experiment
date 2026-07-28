class CommonBehaviorHelperMDRImpl implements CommonBehaviorHelper {

    private MDRModelImplementation modelImpl;

    public CommonBehaviorHelperMDRImpl(MDRModelImplementation implementation) {
        this.modelImpl = implementation;
    }

    public Object getSource(Object link) {
        return getLinkEndpoint(link, true);
    }

    public Object getDestination(Object link) {
        return getLinkEndpoint(link, false);
    }

    private Object getLinkEndpoint(Object link, boolean isSource) {
        try {
            if (link instanceof Link) {
                return modelImpl.getCoreHelper().getEndpoint(link, isSource);
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("Argument is not a link");
    }

    public void removeActualArgument(Object handle, Object argument) {
        removeArgument(handle, argument);
    }

    public void setActualArguments(Object action, List arguments) {
        setArguments(action, arguments);
    }

    public void removeClassifier(Object handle, Object classifier) {
        removeClassifier(handle, classifier);
    }

    public void removeContext(Object handle, Object context) {
        removeContext(handle, context);
    }

    public void removeReception(Object handle, Object reception) {
        removeReception(handle, reception);
    }

    public void addActualArgument(Object handle, Object argument) {
        addArgument(handle, argument);
    }

    public void addActualArgument(Object handle, int position, Object argument) {
        addArgument(handle, position, argument);
    }

    public void addClassifier(Object handle, Object classifier) {
        addClassifier(handle, classifier);
    }

    private void addArgument(Object handle, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            ((Action) handle).getActualArgument().add((Argument) argument);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + argument);
        }
    }

    private void addArgument(Object handle, int position, Object argument) {
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

    private void addClassifier(Object handle, Object classifier) {
        if (handle instanceof Instance && classifier instanceof Classifier) {
            ((Instance) handle).getClassifier().add((Classifier) classifier);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + classifier);
        }
    }

    private void removeArgument(Object handle, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            ((Action) handle).getActualArgument().remove(argument);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + argument);
        }
    }

    private void setArguments(Object action, List arguments) {
        if (action instanceof Action) {
            ((Action) action).getActualArgument().clear();
            ((Action) action).getActualArgument().addAll(arguments);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + action + " or " + arguments);
        }
    }

    private void removeClassifier(Object handle, Object classifier) {
        if (handle instanceof Instance && classifier instanceof Classifier) {
            ((Instance) handle).getClassifier().remove(classifier);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + classifier);
        }
    }

    private void removeContext(Object handle, Object context) {
        if (handle instanceof Signal && context instanceof BehavioralFeature) {
            ((org.omg.uml.UmlPackage) ((Signal) handle).refOutermostPackage()).getCommonBehavior().getAContextRaisedSignal().remove((BehavioralFeature) context, (Signal) handle);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + context);
        }
    }

    private void removeReception(Object handle, Object reception) {
        if (handle instanceof Signal && reception instanceof Reception) {
            ((Reception) reception).setSignal(null);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + reception);
        }
    }

    public void addStimulus(Object handle, Object stimulus) {
        if (handle != null && stimulus != null && stimulus instanceof Stimulus) {
            if (handle instanceof Action) {
                ((Stimulus) stimulus).setDispatchAction((Action) handle);
            } else if (handle instanceof Link) {
                ((Stimulus) stimulus).setCommunicationLink((Link) handle);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or stimulus: " + stimulus);
            }
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or stimulus: " + stimulus);
        }
    }

    public void setAsynchronous(Object handle, boolean value) {
        if (handle instanceof Action) {
            ((Action) handle).setAsynchronous(value);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    public void setOperation(Object handle, Object operation) {
        if (handle instanceof CallAction && (operation == null || operation instanceof Operation)) {
            ((CallAction) handle).setOperation((Operation) operation);
        } else if (handle instanceof CallEvent && (operation == null || operation instanceof Operation)) {
            ((CallEvent) handle).setOperation((Operation) operation);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or operation: " + operation);
        }
    }

    public void setClassifiers(Object handle, Collection classifiers) {
        if (handle instanceof Instance) {
            ((Instance) handle).getClassifier().retainAll(classifiers);
            ((Instance) handle).getClassifier().addAll(classifiers);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    public void setCommunicationLink(Object handle, Object c) {
        if (handle instanceof Stimulus && c instanceof Link) {
            ((Stimulus) handle).setCommunicationLink((Link) c);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or c: " + c);
        }
    }

    public void setComponentInstance(Object handle, Object c) {
        if (handle instanceof Instance && (c == null || c instanceof ComponentInstance)) {
            ((Instance) handle).setComponentInstance((ComponentInstance) c);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or c: " + c);
        }
    }

    public void setContexts(Object handle, Collection c) {
        if (handle instanceof Signal) {
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
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    private void addContext(Object handle, Object context) {
        if (handle instanceof Signal && context instanceof BehavioralFeature) {
            ((org.omg.uml.UmlPackage) ((Signal) handle).refOutermostPackage()).getCommonBehavior().getAContextRaisedSignal().add((BehavioralFeature) context, (Signal) handle);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + context);
        }
    }

    public void setDispatchAction(Object handle, Object value) {
        if (handle instanceof Stimulus && (value == null || value instanceof Action)) {
            ((Stimulus) handle).setDispatchAction((Action) value);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or value: " + value);
        }
    }

    public void setInstance(Object handle, Object inst) {
        if (inst == null || inst instanceof Instance) {
            if (handle instanceof LinkEnd) {
                ((LinkEnd) handle).setInstance((Instance) inst);
            } else if (handle instanceof AttributeLink) {
                ((AttributeLink) handle).setInstance((Instance) inst);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or inst: " + inst);
            }
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or inst: " + inst);
        }
    }

    public void setNodeInstance(Object handle, Object nodeInstance) {
        if (handle instanceof ComponentInstance && nodeInstance instanceof NodeInstance) {
            ((ComponentInstance) handle).setNodeInstance((NodeInstance) nodeInstance);
        } else if (handle instanceof ComponentInstance && nodeInstance == null) {
            ((ComponentInstance) handle).setNodeInstance(null);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or nodeInstance: " + nodeInstance);
        }
    }

    public void setReceiver(Object handle, Object receiver) {
        if (handle instanceof Message && (receiver instanceof ClassifierRole || receiver == null)) {
            ((Message) handle).setReceiver((ClassifierRole) receiver);
        } else if (handle instanceof Stimulus && receiver instanceof Instance) {
            ((Stimulus) handle).setReceiver((Instance) receiver);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or receiver: " + receiver);
        }
    }

    public void setReception(Object handle, Collection c) {
        if (handle instanceof Signal) {
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
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    private void addReception(Object handle, Object reception) {
        if (handle instanceof Signal && reception instanceof Reception) {
            ((Reception) reception).setSignal((Signal) handle);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + reception);
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
            ((Message) handle).setSender((ClassifierRole) sender);
        } else if (handle instanceof Stimulus && sender instanceof Instance) {
            ((Stimulus) handle).setSender((Instance) sender);
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or sender: " + sender);
        }
    }

    public void setSignal(Object handle, Object signal) {
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
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or signal: " + signal);
        }
    }

    public void setSpecification(Object handle, String specification) {
        if (handle instanceof Reception) {
            ((Reception) handle).setSpecification(specification);
        } else {
            throw new IllegalArgumentException("handle: " + handle);
        }
    }

    public void setTarget(Object handle, Object element) {
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

    public void setTransition(Object handle, Object trans) {
        if (trans instanceof Transition) {
            if (handle instanceof Guard) {
                ((Guard) handle).setTransition((Transition) trans);
            } else if (handle instanceof Action) {
                ((Transition) trans).setEffect((Action) handle);
            } else {
                throw new IllegalArgumentException("handle: " + handle + " or trans: " + trans);
            }
        } else {
            throw new IllegalArgumentException("handle: " + handle + " or trans: " + trans);
        }
    }

    public void setValue(Object handle, Object value) {
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

    public Classifier getInstantiation(Object createaction) {
        try {
            if (createaction instanceof CreateAction) {
                return ((CreateAction) createaction).getInstantiation();
            }
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
        throw new IllegalArgumentException("handle: " + createaction);
    }

    public void setInstantiation(Object createaction, Object instantiation) {
        if (createaction instanceof CreateAction) {
            if (instantiation instanceof Classifier) {
                ((CreateAction) createaction).setInstantiation((Classifier) instantiation);
            } else if (instantiation == null) {
                ((CreateAction) createaction).setInstantiation(null);
            } else {
                throw new IllegalArgumentException("handle: " + createaction + ", value:" + instantiation);
            }
        } else {
            throw new IllegalArgumentException("handle: " + createaction + ", value:" + instantiation);
        }
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