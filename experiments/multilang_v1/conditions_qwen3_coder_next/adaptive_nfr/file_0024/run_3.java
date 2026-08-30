.getCommonBehavior().getAContextRaisedSignal().add(
                            (BehavioralFeature) behavorialFeature,
                            (Signal) handle);
            return;
        }
    }


    /**
     * Helper method to deal with dispatching addContext to appropriate handlers.
     * Extracted to reduce cyclomatic complexity in {@link #setContexts(Object, Collection)}.
     *
     * @param handle     The signal object
     * @param contexts   The collection of behavioral features to set as contexts
     */
    private void setContextsInternal(Object handle, Collection contexts) {
        Collection actualContexts = Model.getFacade().getContexts(handle);
        if (!actualContexts.isEmpty()) {
            Collection contextsCopy = new ArrayList(actualContexts);
            for (Object context : contextsCopy) {
                removeContext(handle, context);
            }
        }
        for (Object context : contexts) {
            addContext(handle, context);
        }
    }

    /**
     * Helper method to deal with dispatching addReception to appropriate handlers.
     * Extracted to reduce cyclomatic complexity in {@link #setReception(Object, Collection)}.
     *
     * @param handle      The signal object
     * @param receptions  The collection of receptions to set
     */
    private void setReceptionsInternal(Object handle, Collection receptions) {
        Collection actualReceptions = Model.getFacade().getReceptions(handle);
        if (!actualReceptions.isEmpty()) {
            Collection receptionsCopy = new ArrayList(actualReceptions);
            for (Object reception : receptionsCopy) {
                removeReception(handle, reception);
            }
        }
        for (Object reception : receptions) {
            addReception(handle, reception);
        }
    }

    /**
     * Helper method for safely comparing two expressions for equality.
     * Extracted to reduce nesting and improve readability of multiple setter methods.
     *
     * @param expr1 First expression
     * @param expr2 Second expression
     * @return true if both expressions are equal or both null, false otherwise
     */
    private boolean equal(Expression expr1, Expression expr2) {
        if (expr1 == null) {
            return expr2 == null;
        }
        return expr1.equals(expr2);
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
            setContextsInternal(handle, c);
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
            setReceptionsInternal(handle, c);
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

    public void setScript(Object handle, Object expr) {
        if (handle instanceof Action
                && (expr == null || expr instanceof ActionExpression)) {
            Action a = (Action) handle;
            ActionExpression oldae =a.getScript();
            ActionExpression newae = (ActionExpression) expr;
            if (equal(oldae,newae)) {
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
            if (instantiation == null)
                ((CreateAction) createaction).setInstantiation(null);
            return;
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