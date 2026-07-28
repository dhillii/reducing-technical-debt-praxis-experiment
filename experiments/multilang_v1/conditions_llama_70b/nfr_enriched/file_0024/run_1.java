class CommonBehaviorHelperMDRImpl implements CommonBehaviorHelper {

    private MDRModelImplementation modelImpl;

    public CommonBehaviorHelperMDRImpl(MDRModelImplementation implementation) {
        this.modelImpl = implementation;
    }

    // Extracted method to handle source retrieval
    private Object getSource(Link link) {
        try {
            return modelImpl.getCoreHelper().getSource(link);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public Object getSource(Object link) {
        if (link instanceof Link) {
            return getSource((Link) link);
        }
        throw new IllegalArgumentException("Argument is not a link");
    }

    // Extracted method to handle destination retrieval
    private Object getDestination(Link link) {
        try {
            return modelImpl.getCoreHelper().getDestination(link);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public Object getDestination(Object link) {
        if (link instanceof Link) {
            return getDestination((Link) link);
        }
        throw new IllegalArgumentException("Argument is not a link");
    }

    // Extracted method to handle actual argument removal
    private void removeActualArgument(Action action, Argument argument) {
        try {
            action.getActualArgument().remove(argument);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void removeActualArgument(Object handle, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            removeActualArgument((Action) handle, (Argument) argument);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + argument);
        }
    }

    // Extracted method to handle actual argument setting
    private void setActualArguments(Action action, List arguments) {
        try {
            action.getActualArgument().clear();
            action.getActualArgument().addAll(arguments);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void setActualArguments(Object action, List arguments) {
        if (action instanceof Action) {
            setActualArguments((Action) action, arguments);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + action + " or " + arguments);
        }
    }

    // Extracted method to handle classifier removal
    private void removeClassifier(Instance instance, Classifier classifier) {
        try {
            instance.getClassifier().remove(classifier);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void removeClassifier(Object handle, Object classifier) {
        if (handle instanceof Instance && classifier instanceof Classifier) {
            removeClassifier((Instance) handle, (Classifier) classifier);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + classifier);
        }
    }

    // Extracted method to handle context removal
    private void removeContext(Signal signal, BehavioralFeature context) {
        try {
            ((org.omg.uml.UmlPackage) signal.refOutermostPackage()).getCommonBehavior().getAContextRaisedSignal().remove(context, signal);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void removeContext(Object handle, Object context) {
        if (handle instanceof Signal && context instanceof BehavioralFeature) {
            removeContext((Signal) handle, (BehavioralFeature) context);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + context);
        }
    }

    // Extracted method to handle reception removal
    private void removeReception(Signal signal, Reception reception) {
        try {
            reception.setSignal(null);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void removeReception(Object handle, Object reception) {
        if (handle instanceof Signal && reception instanceof Reception) {
            removeReception((Signal) handle, (Reception) reception);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + reception);
        }
    }

    // Extracted method to handle actual argument addition
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

    // Extracted method to handle actual argument addition at a specific position
    private void addActualArgumentAtPosition(Action action, int position, Argument argument) {
        try {
            action.getActualArgument().add(position, argument);
        } catch (InvalidObjectException e) {
            throw new InvalidElementException(e);
        }
    }

    public void addActualArgument(Object handle, int position, Object argument) {
        if (handle instanceof Action && argument instanceof Argument) {
            addActualArgumentAtPosition((Action) handle, position, (Argument) argument);
        } else {
            throw new IllegalArgumentException();
        }
    }

    // Extracted method to handle classifier addition
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

    // Extracted method to handle context addition
    private void addContext(Signal signal, BehavioralFeature context) {
        ((org.omg.uml.UmlPackage) signal.refOutermostPackage()).getCommonBehavior().getAContextRaisedSignal().add(context, signal);
    }

    public void addContext(Object handle, Object context) {
        if (handle instanceof Signal && context instanceof BehavioralFeature) {
            addContext((Signal) handle, (BehavioralFeature) context);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + context);
        }
    }

    // Extracted method to handle reception addition
    private void addReception(Signal signal, Reception reception) {
        reception.setSignal(signal);
    }

    public void addReception(Object handle, Object reception) {
        if (handle instanceof Signal && reception instanceof Reception) {
            addReception((Signal) handle, (Reception) reception);
        } else {
            throw new IllegalArgumentException("Unrecognized object " + handle + " or " + reception);
        }
    }

    // ... (rest of the methods remain the same)

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

    // ... (rest of the methods remain the same)
}