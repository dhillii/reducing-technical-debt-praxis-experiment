.getCommonBehavior().getAContextRaisedSignal().add(
                            (BehavioralFeature) behavorialFeature,
                            (Signal) handle);
            return;
        }
    }


    /**
     * Add a context to a Signal.
     * 
     * @param handle The signal
     * @param behavorialFeature The behavioral feature 
     */
    private void addContext(Object handle, Object behavorialFeature) {
        if (handle instanceof Signal
                && behavorialFeature instanceof BehavioralFeature) {
            ((org.omg.uml.UmlPackage) ((Signal) handle).refOutermostPackage())
                    .getCommonBehavior().getAContextRaisedSignal().add(
                            (BehavioralFeature) behavorialFeature,
                            (Signal) handle);
        }
    }


    /**
     * Add a Reception to a Signal.
     * 
     * @param handle The signal
     * @param rec The Reception 
     */
    private void addReception(Object handle, Object rec) {
        if (handle instanceof Signal
                && rec instanceof Reception) {
            ((Reception) rec).setSignal((Signal) handle);
        }
    }


    public void addStimulus(Object handle, Object stimulus) {
        if (handle != null && stimulus != null 
                && stimulus instanceof Stimulus) {
            if (handle instanceof Action) {
                ((Stimulus) stimulus).setDispatchAction((Action) handle);
                return;
            }
            if (handle instanceof Link) {
                ((Stimulus) stimulus).setCommunicationLink((Link) handle);
                return;
            }
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or stimulus: " + stimulus);
    }


    public void setAsynchronous(Object handle, boolean value) {
        if (handle instanceof Action) {
            ((Action) handle).setAsynchronous(value);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle);
    }


    public void setOperation(Object handle, Object operation) {
        if (handle instanceof CallAction
                && (operation == null || operation instanceof Operation)) {
            ((CallAction) handle).setOperation((Operation) operation);
            return;
        }
        if (handle instanceof CallEvent 
                && (operation == null || operation instanceof Operation)) {
            ((CallEvent) handle).setOperation((Operation) operation);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or operation: " + operation);
    }


    public void setClassifiers(Object handle, Collection classifiers) {
        if (handle instanceof Instance) {
            ((Instance) handle).getClassifier().retainAll(classifiers);
            ((Instance) handle).getClassifier().addAll(classifiers);            
            return;
        }
        throw new IllegalArgumentException("handle: " + handle);
    }


    public void setCommunicationLink(Object handle, Object c) {
        if (handle instanceof Stimulus && c instanceof Link) {
            ((Stimulus) handle).setCommunicationLink((Link) c);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or c: " + c);
    }


    public void setComponentInstance(Object handle, Object c) {
        if (handle instanceof Instance
                && (c == null || c instanceof ComponentInstance)) {
            ((Instance) handle).setComponentInstance((ComponentInstance) c);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or c: " + c);
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
            return;
        }
        throw new IllegalArgumentException("handle: " + handle);
    }


    public void setDispatchAction(Object handle, Object value) {
        if (handle instanceof Stimulus
                && (value == null || value instanceof Action)) {
            ((Stimulus) handle).setDispatchAction((Action) value);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or value: "
                + value);
    }


    public void setInstance(Object handle, Object inst) {
        if (inst == null || inst instanceof Instance) {
            if (handle instanceof LinkEnd) {
                ((LinkEnd) handle).setInstance((Instance) inst);
                return;
            }
            if (handle instanceof AttributeLink) {
                ((AttributeLink) handle).setInstance((Instance) inst);
                return;
            }
        }
        throw new IllegalArgumentException("handle: " + handle + " or inst: "
                + inst);
    }

    /*
     * @see org.argouml.model.CommonBehaviorHelper#setNodeInstance(java.lang.Object,
     *      java.lang.Object)
     */
    public void setNodeInstance(Object handle, Object nodeInstance) {
        if (handle instanceof ComponentInstance
                && nodeInstance instanceof NodeInstance) {
            ((ComponentInstance) handle).
                    setNodeInstance((NodeInstance) nodeInstance);
            return;
        } else if (handle instanceof ComponentInstance 
                && nodeInstance == null) {
            // TODO: Check if this is ok (this is literally adapted from NSUML)
            ((ComponentInstance) handle).setNodeInstance(null);
            return;
        }

        throw new IllegalArgumentException("handle: " + handle
                + " or nodeInstance: " + nodeInstance);
    }

    /*
     * @see org.argouml.model.CommonBehaviorHelper#setReceiver(java.lang.Object,
     *      java.lang.Object)
     */
    public void setReceiver(Object handle, Object receiver) {
        if (handle instanceof Message
                && (receiver instanceof ClassifierRole || receiver == null)) {
            ((Message) handle).setReceiver((ClassifierRole) receiver);
            return;
        }
        if (handle instanceof Stimulus && receiver instanceof Instance) {
            ((Stimulus) handle).setReceiver((Instance) receiver);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or receiver: " + receiver);
    }


    public void setReception(Object handle, Collection c) {
        if (handle instanceof Signal) {
            Collection actualReceptions = 
                Model.getFacade().getReceptions(handle);
            if (!actualReceptions.isEmpty()) {
                Collection receptions = new ArrayList(actualReceptions);
                for (Object reception : receptions) {
                    removeReception(handle, reception);
                }
            }
            for (Object reception : c) {
                addReception(handle, reception);
            }
            return;
        }
        throw new IllegalArgumentException("handle: " + handle);
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
            return expr2 == null;
        } else {
            return expr1.equals(expr2);
        }
    }

    public void setScript(Object handle, Object expr) {
        if (handle instanceof Action
                && (expr == null || expr instanceof ActionExpression)) {
            Action a = (Action) handle;
            ActionExpression oldae = a.getScript();
            ActionExpression newae = (ActionExpression) expr;
            if (equal(oldae, newae)) {
                return;
            }
            a.setScript(newae);
            if (oldae != null) {
                /* Throw away the old actionExpression (see issue 6145):  */
                modelImpl.getUmlFactory().delete(oldae);
            }
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or expr: "
                + expr);
    }


    public void setSender(Object handle, Object sender) {
        if (handle instanceof Message
                && (sender instanceof ClassifierRole || sender == null)) {
            ((Message) handle).setSender((ClassifierRole) sender);
            return;
        }
        if (handle instanceof Stimulus && sender instanceof Instance) {
            ((Stimulus) handle).setSender((Instance) sender);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + " or sender: "
                + sender);
    }


    public void setSignal(Object handle, Object signal) {
        if (signal == null || signal instanceof Signal) {
            if (handle instanceof SendAction) {
                ((SendAction) handle).setSignal((Signal) signal);
                return;
            }
            if (handle instanceof Reception) {
                ((Reception) handle).setSignal((Signal) signal);
                return;
            }
            if (handle instanceof SignalEvent) {
                ((SignalEvent) handle).setSignal((Signal) signal);
                return;
            }
        }
        throw new IllegalArgumentException("handle: " + handle + " or signal: "
                + signal);
    }


    public void setSpecification(Object handle, String specification) {
        if (handle instanceof Reception) {
            ((Reception) handle).setSpecification(specification);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle);
    }


    public void setTarget(Object handle, Object element) {
        if (handle instanceof Action 
                && element instanceof ObjectSetExpression) {
            Action action = (Action) handle;
            ObjectSetExpression oldExpr = action.getTarget();
            ObjectSetExpression newExpr = (ObjectSetExpression) element;
            if (!equal(oldExpr, newExpr)) {
                action.setTarget(newExpr);
                if (oldExpr != null) {
                    Model.getUmlFactory().delete(oldExpr);
                }
            }            
            return;
        }
        if (handle instanceof Transition && 
                (element == null || element instanceof StateVertex)) {
            ((Transition) handle).setTarget((StateVertex) element);
            return;
        }
        throw new IllegalArgumentException("handle: " + handle
                + " or element: " + element);
    }


    public void setTransition(Object handle, Object trans) {
        if (trans instanceof Transition) {
            if (handle instanceof Guard) {
                ((Guard) handle).setTransition((Transition) trans);
                return;
            }
            if (handle instanceof Action) {
                ((Transition) trans).setEffect((Action) handle);
                return;
            }
        }
        throw new IllegalArgumentException("handle: " + handle + " or trans: "
                + trans);
    }


    public void setValue(Object handle, Object value) {
        if (handle instanceof Argument) {
            Argument argument = (Argument) handle;
            Expression oldExpr = argument.getValue();
            Expression newExpr = (Expression) value;
            if (!equal(oldExpr, newExpr)) {
                argument.setValue(newExpr);
                if (oldExpr != null) {
                    Model.getUmlFactory().delete(oldExpr);
                }
            }
            return;
        }
        if (handle instanceof AttributeLink) {
            ((AttributeLink) handle).setValue((Instance) value);
            return;
        }
        if (handle instanceof TaggedValue && value instanceof String) {
            modelImpl.getExtensionMechanismsHelper().setDataValues(handle,
                    new String[] {(String) value});
            return;
        }
        throw new IllegalArgumentException("handle: " + handle + ", value:"
                + value);
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
                ((CreateAction) createaction).setInstantiation(
                        (Classifier) instantiation);
                return;
            }
            if (instantiation == null) {
                ((CreateAction) createaction).setInstantiation(null);
                return;
            }
        }
        throw new IllegalArgumentException("handle: " + createaction
                + ", value:" + instantiation);

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
                Iterator iter = 
                    Model.getFacade().getMessages(action).iterator();
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
        if (!(handle instanceof ActionSequence) 
                || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            ((ActionSequence) handle).getAction().add((Action) action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void addAction(Object handle, int position, Object action) {
        if (!(handle instanceof ActionSequence) 
                || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            ((ActionSequence) handle).getAction()
                    .add(position, (Action) action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        } 
    }

    public void removeAction(Object handle, Object action) {
        if (!(handle instanceof ActionSequence) 
                || !(action instanceof Action)) {
            throw new IllegalArgumentException();
        }
        try {
            ((ActionSequence) handle).getAction().remove(action);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }
    
}