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

        Object connection = null;
        boolean uni = (unidirectional instanceof Boolean)
            ? ((Boolean) unidirectional).booleanValue() : false;

        if (elementType == metaTypes.getAssociation()) {
            connection =
                getCore().buildAssociation(fromElement,
                    fromStyle, toElement,
                    toStyle, uni);
        } else if (elementType == metaTypes.getAssociationEnd()) {
            connection =
                buildAssociationEndConnection(fromElement, toElement);
        } else if (elementType == metaTypes.getAssociationClass()) {
            connection =
                getCore().buildAssociationClass(fromElement, toElement);
        } else if (elementType == metaTypes.getAssociationRole()) {
            connection =
                getCollaborations().buildAssociationRole(fromElement,
                    fromStyle, toElement, toStyle,
                    ((Boolean) unidirectional).booleanValue());
        } else if (elementType == metaTypes.getGeneralization()) {
            connection = getCore().buildGeneralization(fromElement, toElement);
        } else if (elementType == metaTypes.getPackageImport()) {
            connection = getCore().buildPackageImport(fromElement, toElement);
        } else if (elementType == metaTypes.getUsage()) {
            connection = getCore().buildUsage(fromElement, toElement);
        } else if (elementType == metaTypes.getDependency()) {
            connection = getCore().buildDependency(fromElement, toElement);
        } else if (elementType == metaTypes.getAbstraction()) {
            connection =
                getCore().buildRealization(fromElement, toElement, namespace);
        } else if (elementType == metaTypes.getLink()) {
            connection = getCommonBehavior().buildLink(fromElement, toElement);
        } else if (elementType == metaTypes.getExtend()) {
            connection = getUseCases().buildExtend(toElement, fromElement);
        } else if (elementType == metaTypes.getInclude()) {
            connection = getUseCases().buildInclude(fromElement, toElement);
        } else if (elementType == metaTypes.getTransition()) {
            connection =
                getStateMachines().buildTransition(fromElement, toElement);
        }

        if (connection == null) {
            throw new IllegalModelElementConnectionException("Cannot make a "
                    + elementType.getClass().getName() + " between a "
                    + fromElement.getClass().getName() + " and a "
                    + toElement.getClass().getName());
        }

        return connection;
    }

    /**
     * Builds an AssociationEnd connection based on the provided elements.
     *
     * @param fromElement the "from" element
     * @param toElement the "to" element
     * @return the built AssociationEnd object or null if none can be built
     */
    private Object buildAssociationEndConnection(Object fromElement, Object toElement) {
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

        // if this is a feature get the owner of that feature
        // TODO: Does anything actually make use of this? It can
        // cause unexpected behaviour.
        if (this.modelImpl.getFacade().isAFeature(container)
                && elementType != metaTypes.getParameter()
                && elementType != metaTypes.getMethod()
                && elementType != metaTypes.getSignal()) {
            container = this.modelImpl.getFacade().getOwner(container);
        }

        // supports implementation of some special elements not
        // supported by buildNode
        if (elementType == this.metaTypes.getAttribute()) {
            element = getCore().buildAttribute2(container, null);
        } else if (elementType == this.metaTypes.getOperation()) {
            element = getCore().buildOperation(container, null);
        } else if (elementType == this.metaTypes.getReception()) {
            element = this.modelImpl.getCommonBehaviorFactory().buildReception(container);
        } else if (elementType == this.metaTypes.getEnumerationLiteral()) {
            element = getCore().buildEnumerationLiteral(null, container);
        } else if (elementType == this.metaTypes.getExtensionPoint()) {
            element = this.modelImpl.getUseCasesFactory().
                buildExtensionPoint(container);
        } else if (elementType == this.metaTypes.getTemplateParameter()) {
            // TODO: the type of the model element used in a type parameter
            // (ie the formal) needs to match the actual parameter that it
            // gets replaced with later.  This code is going to restrict that
            // to always being a Parameter which doesn't seem right, but I
            // don't have time to debug it right now. - tfm - 20090608
            Parameter param = getCore().createParameter();
            param.setName("T"); // default parameter name
            element =
                modelImpl.getCoreFactory().buildTemplateParameter(container,
                        param, null);
        } else if (elementType == metaTypes.getParameter()) {
            element = getCore().buildParameter(container, null);
        } else if (elementType == metaTypes.getSignal()) {
            element = modelImpl.getCommonBehaviorFactory().buildSignal(container);
        } else if (elementType == metaTypes.getMethod()) {
            final Operation op = (Operation) container;
            element = getCore().buildMethod(op.getName());
            modelImpl.getCoreHelper().addMethod(op, element);
            modelImpl.getCoreHelper().addFeature(
                    modelImpl.getFacade().getOwner(op), element);
        } else if (elementType == metaTypes.getMessage()) {
            Object collaboration = Model.getFacade().getNamespace(container);
            element =
                Model.getCollaborationsFactory()
                    .buildMessage(collaboration, container);
        } else if (elementType == metaTypes.getArgument()) {
            element = Model.getCommonBehaviorFactory().createArgument();
            Model.getCommonBehaviorHelper().addActualArgument(container, element);
        } else if (elementType == metaTypes.getGuard()) {
            element = Model.getStateMachinesFactory().buildGuard(container);
        } else if (elementType == metaTypes.getCreateAction()) {
            element = Model.getCommonBehaviorFactory().createCreateAction();
            setNewAction(container, (Action) element, properyName);
        } else if (elementType == metaTypes.getCallAction()) {
            element = Model.getCommonBehaviorFactory().createCallAction();
            setNewAction(container, (Action) element, properyName);
        } else if (elementType == metaTypes.getReturnAction()) {
            element = Model.getCommonBehaviorFactory().createReturnAction();
            setNewAction(container, (Action) element, properyName);
        } else if (elementType == metaTypes.getDestroyAction()) {
            element = Model.getCommonBehaviorFactory().createDestroyAction();
            setNewAction(container, (Action) element, properyName);
        } else if (elementType == metaTypes.getSendAction()) {
            element = Model.getCommonBehaviorFactory().createSendAction();
            setNewAction(container, (Action) element, properyName);
        } else if (elementType == metaTypes.getTerminateAction()) {
            element = Model.getCommonBehaviorFactory().createTerminateAction();
            setNewAction(container, (Action) element, properyName);
        } else if (elementType == metaTypes.getUninterpretedAction()) {
            element = Model.getCommonBehaviorFactory().createUninterpretedAction();
            setNewAction(container, (Action) element, properyName);
        } else if (elementType == metaTypes.getActionSequence()) {
            element = Model.getCommonBehaviorFactory().createActionSequence();
            setNewAction(container, (Action) element, properyName);
        } else if (elementType == metaTypes.getCallEvent()) {
            element = Model.getStateMachinesFactory().createCallEvent();
            if (container instanceof Transition) {
                setNewTrigger((Transition) container, (Event) element);
            } else if (container instanceof State) {
                setNewDeferrableEvent((State) container, (Event) element);
            }
        } else if (elementType == metaTypes.getChangeEvent()) {
            element = Model.getStateMachinesFactory().createChangeEvent();
            if (container instanceof Transition) {
                setNewTrigger((Transition) container, (Event) element);
            } else if (container instanceof State) {
                setNewDeferrableEvent((State) container, (Event) element);
            }
        } else if (elementType == metaTypes.getSignalEvent()) {
            element = Model.getStateMachinesFactory().createSignalEvent();
            if (container instanceof Transition) {
                setNewTrigger((Transition) container, (Event) element);
            } else if (container instanceof State) {
                setNewDeferrableEvent((State) container, (Event) element);
            }
        } else if (elementType == metaTypes.getTimeEvent()) {
            element = Model.getStateMachinesFactory().createTimeEvent();
            if (container instanceof Transition) {
                setNewTrigger((Transition) container, (Event) element);
            } else if (container instanceof State) {
                setNewDeferrableEvent((State) container, (Event) element);
            }
        } else if (elementType == metaTypes.getSignal()) {
            element = Model.getStateMachinesFactory().buildSignalEvent(container);
        } else if (elementType == metaTypes.getPseudostate() && container instanceof CompositeState) {
            element = Model.getStateMachinesFactory().buildPseudoState(container);
        } else if (elementType == metaTypes.getSynchState() && container instanceof CompositeState) {
            element = Model.getStateMachinesFactory().buildSynchState(container);
        } else if (elementType == metaTypes.getStubState() && container instanceof CompositeState) {
            element = Model.getStateMachinesFactory().buildStubState(container);
        } else if (elementType == metaTypes.getCompositeState() && container instanceof CompositeState) {
            element = Model.getStateMachinesFactory().buildCompositeState(container);
        } else if (elementType == metaTypes.getSimpleState() && container instanceof CompositeState) {
            element = Model.getStateMachinesFactory().buildSimpleState(container);
        } else if (elementType == metaTypes.getFinalState() && container instanceof CompositeState) {
            element = Model.getStateMachinesFactory().buildFinalState(container);
        } else if (elementType == metaTypes.getSubmachineState() && container instanceof CompositeState) {
            element = Model.getStateMachinesFactory().buildSubmachineState(container);
        } else if (elementType == metaTypes.getTransition() && container instanceof State) {
            element = Model.getStateMachinesFactory().buildInternalTransition(container);
        } else if (elementType == metaTypes.getActivity()) {
            element = Model.getActivityGraphsFactory().buildActivityGraph(container);
        } else {
            // build all other elements using existing buildNode
            element = buildNode(elementType);

            if (container instanceof Namespace
                    && element instanceof Namespace) {
                ((Namespace) element).setNamespace(
                        ((Namespace) container).getNamespace());
            }

            this.modelImpl.getCoreHelper().addOwnedElement(container, element);
        }

        modelImpl.getCoreHelper().setName(element, "");
        return element;
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


    /**
     * Add a newly created event to a trigger
     * @param transition
     * @param event
     */
    private void setNewTrigger(Transition transition, Event event) {
        transition.setTrigger(event);
        event.setName("");
        final StateMachine statemachine = transition.getStateMachine();
        final Namespace namespace = statemachine.getNamespace();
        event.setNamespace(namespace);
    }

    /**
     * Add a newly created event to a trigger
     * @param transition
     * @param event
     */
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
        // If our map has any entries for this type, it's a connection type
        return (validConnectionMap.get(connectionType) != null);
    }


    public boolean isConnectionValid(Object connectionType, Object fromElement,
            Object toElement, boolean checkWFR) {
        if (Model.getModelManagementHelper().isReadOnly(fromElement)) {
            // Don't allow connections to be created from a read only
            // model element to any other
            // TODO: This should be considered a workaround.  It only works
            // because, by default, we place newly created relationships in
            // the namespace of the fromElement.  The correct behavior in
            // the presence of read-only elements really depends on the type of
            // connection as well as the writeability of both ends.
            return false;
        }
        // Get the list of valid model item pairs for the given connection type
        List<Class<?>[]> validItems = validConnectionMap.get(connectionType);
        if (validItems == null) {
            return false;
        }
        // See if there's a pair in this list that match the given
        // model elements
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

        // find the passed in container in validContainmentMap
        for (Class<?> containerType : validContainmentMap.keySet()) {

            if (containerType.isInstance(container)) {
                // determine if metaType is a valid element for container
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

    /**
     * Run through any well formedness rules we wish to enforce for a
     * connection.
     * @param connectionType
     * @param fromElement
     * @param toElement
     * @return true if the connection satisfies the wellformedness rules
     */
    private boolean isConnectionWellformed(
            Class<?> connectionType,
            ModelElement fromElement,
            ModelElement toElement) {

        if (fromElement == null || toElement == null) {
            return false;
        }

        if (connectionType == Generalization.class) {
            /*
             * UML 1.4.2 Spec section 4.5.3.20 [5]
             * A GeneralizableElement may only be a child of
             * GeneralizableElement of the same kind.
             */
            if (fromElement.getClass() != toElement.getClass()) {
                return false;
            }
        }

        return true;
    }

    /**
     * Returns the package factory for the UML package
     * Foundation::ExtensionMechanisms.
     *
     * @return the ExtensionMechanisms factory instance.
     */
    private ExtensionMechanismsFactoryMDRImpl getExtensionMechanisms() {
        return (ExtensionMechanismsFactoryMDRImpl) modelImpl.
                getExtensionMechanismsFactory();
    }

    /**
     * Returns the package factory for the UML package Foundation::Core.
     *
     * @return the Core factory instance.
     */
    private CoreFactoryMDRImpl getCore() {
        return (CoreFactoryMDRImpl) modelImpl.getCoreFactory();
    }

    /**
     * Returns the package factory for the UML package
     * BehavioralElements::CommonBehavior.
     *
     * @return the CommonBehavior factory instance.
     */
    private CommonBehaviorFactoryMDRImpl getCommonBehavior() {
        return (CommonBehaviorFactoryMDRImpl) modelImpl.
                getCommonBehaviorFactory();
    }

    /**
     * Returns the package factory for the UML package
     * BehavioralElements::UseCases.
     *
     * @return the UseCases factory instance.
     */
    private UseCasesFactoryMDRImpl getUseCases() {
        return (UseCasesFactoryMDRImpl) modelImpl.getUseCasesFactory();
    }

    /**
     * Returns the package factory for the UML package
     * BehavioralElements::StateMachines.
     *
     * @return the StateMachines factory instance.
     */
    private StateMachinesFactoryMDRImpl getStateMachines() {
        return (StateMachinesFactoryMDRImpl) modelImpl
                .getStateMachinesFactory();
    }

    /**
     * Returns the package factory for the UML package
     * BehavioralElements::Collaborations.
     *
     * @return the Collaborations factory instance.
     */
    private CollaborationsFactoryMDRImpl getCollaborations() {
        return (CollaborationsFactoryMDRImpl) modelImpl.
                getCollaborationsFactory();
    }

    /**
     * Returns the package factory for the UML package
     * BehavioralElements::ActivityGraphs.
     *
     * @return the ActivityGraphs factory instance.
     */
    private ActivityGraphsFactoryMDRImpl getActivityGraphs() {
        return (ActivityGraphsFactoryMDRImpl) modelImpl.
                getActivityGraphsFactory();
    }

    /**
     * Returns the package factory for the UML package ModelManagement.
     *
     * @return the ModelManagement factory instance.
     */
    private ModelManagementFactoryMDRImpl getModelManagement() {
        return (ModelManagementFactoryMDRImpl) modelImpl.
                getModelManagementFactory();
    }

    /*
     * Delete a model element.  Implements 'cascading delete' to make sure
     * model is still valid after element has been deleted.<p>
     *
     * The actual deletion is delegated to delete methods in the rest of the
     * factories. For example: a method deleteClass exists on CoreHelper. Delete
     * methods as deleteClass should only do those extra actions that are
     * necessary for the deletion of the modelelement itself. I.e. deleteClass
     * should only take care of things specific to UmlClass.<p>
     *
     * The delete methods in the UML Factories should not be called directly
     * throughout the code! Calls should always refer to this method and never
     * call the deleteXXX method on XXXFactory directly. The reason that it is
     * possible to call the deleteXXX methods directly is a pure implementation
     * detail.<p>
     *
     * The implementation of this method uses a quite complicated if/then/else
     * tree. This is done to provide optimal performance and full compliance to
     * the UML 1.4 metamodel. The last remark refers to the fact that the
     * UML 1.4 model uses multiple inheritance in several places.
     * This has to be taken into account.<p>
     *
     * TODO: The requirements of the metamodel could probably be better
     * determined by reflection on the metamodel.  Then each association
     * that a deleted element participates in could be reviewed to make sure
     * that it meets the requirements and, if not, be deleted. - tfm<p>
     *
     * Extensions and its children are not taken into account here. They do not
     * require extra cleanup actions. Not in the form of a call to the remove
     * method as is normal for all children of MBase and not in the form of
     * other behaviour we want to implement via this operation.
     *
     * @param elem
     *            The element to be deleted
     *
     * @see org.argouml.model.UmlFactory#delete(java.lang.Object)
     */
    public void delete(Object elem) {
        if (elem == null) {
            throw new IllegalArgumentException("Element may not be null "
                    + "in delete");
        }

        // TODO: Hold lock for entire recursive traversal?
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

        // Begin a transaction - we'll do a bunch of reads first
        // to collect a set of elements to delete - then delete them all
        modelImpl.getRepository().beginTrans(false);
        try {
            // TODO: Encountering a deleted object during
            // any part of this traversal will
            // abort the rest of the traversal.
            // We probably should do the whole traversal
            // in a single MDR transaction.
            if (elem instanceof Element) {
                getCore().deleteElement(elem);
                if (elem instanceof ModelElement) {
                    getCore().deleteModelElement(elem);
                    // no else here to make sure Classifier with
                    // its double inheritance goes ok

                    if (elem instanceof GeneralizableElement) {
                        GeneralizableElement ge = (GeneralizableElement) elem;
                        getCore().deleteGeneralizableElement(ge);
                        if (elem instanceof Stereotype) {
                            Stereotype s = (Stereotype) elem;
                            getExtensionMechanisms().deleteStereotype(s);
                        }
                    } // no else here to make sure AssociationClass goes ok

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
                    } // no else to handle multiple inheritance of linkobject

                    if (elem instanceof Link) {
                        getCommonBehavior().deleteLink(elem);
                    } else if (elem instanceof LinkEnd) {
                        getCommonBehavior().deleteLinkEnd(elem);
                    } else if (elem instanceof Interaction) {
                        getCollaborations().deleteInteraction(elem);
                    } else if (elem instanceof InteractionInstanceSet) {
                        getCollaborations().deleteInteractionInstanceSet(elem);
                    } else if (elem instanceof CollaborationInstanceSet) {
                        getCollaborations()
                                .deleteCollaborationInstanceSet(elem);
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
                    // else if (elem instanceof MEvent) {
                    //
                    // }
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
        } catch (InvalidObjectException e) {
            // If we get this with the repository locked, it means our root
            // model element was already deleted.  Nothing to do...
            LOG.log(Level.SEVERE, "Encountered deleted object during delete of " + elem);
        } catch (InvalidElementException e) {
            // Our wrapped version of the same error
            LOG.log(Level.SEVERE, "Encountered deleted object during delete of " + elem);
        } finally {
            // end our transaction
            modelImpl.getRepository().endTrans();
        }

        synchronized (lock) {
            // Elements which will be deleted when their container is deleted
            // don't get added to the list of elements to be deleted
            // (but we still want to traverse them looking for other elements
            //  to be deleted)
            try {
                Object container = ((RefObject) elem).refImmediateComposite();
                if (container == null
                        || !elementsToBeDeleted.contains(container)
                        // There is a bug in the version of MDR (20050711) that
                        // we use  that causes it to fail to delete aggregate
                        // elements which are single valued and where the
                        // aggregate end is listed second in the association
                        // defined in the metamodel. For the UML 1.4 metamodel,
                        // this affects a StateMachine's top StateVertex and
                        // a Transition's Guard.  See issue 4948 & 5227 - tfm
                        // 20080713
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
                    // TODO: This doesn't belong here, but it's not a good time
                    // to move it.  Find someplace less obtrusive than this
                    // inner loop. - tfm
                    if (o instanceof CompositeState) {
                        // This enforces the following well-formedness rule.
                        // <p>Well formedness rule 4.12.3.1 CompositeState
                        // [4] There have to be at least two composite
                        // substates in a concurrent composite state.<p>
                        // If this is broken by deletion of substate then we
                        // change the parent composite substate to be not
                        // concurrent.
                        CompositeState deletedCompositeState =
                            (CompositeState) o;
                        try {
                            CompositeState containingCompositeState =
                                deletedCompositeState.getContainer();
                            if (containingCompositeState != null
                                    && containingCompositeState.
                                    isConcurrent()
                                    && containingCompositeState.getSubvertex().
                                        size() == 1) {
                                containingCompositeState.setConcurrent(false);
                            }
                        } catch (InvalidObjectException e) {
                            LOG.log(Level.FINE, "Object already deleted {0}", o);
                        }
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


    public boolean isRemoved(Object o) {
        if (!(o instanceof RefObject)) {
            throw new IllegalArgumentException(
                    "Expected JMI RefObject, received " + o);
        }
        try {
            // We don't care about the value - just want to see if it throws
            ((RefObject) o).refImmediateComposite();
            return false;
        } catch (InvalidObjectException e) {
            return true;
        }
    }

    /**
     * Delete a Feature.
     *
     * @param elem feature to be deleted
     */
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

    /**
     * Delete a Namespace.
     *
     * @param elem namespace to be deleted
     */
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
                    // TODO: Add EnumerationLiteral someplace
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

    /**
     * Delete a Relationship.
     *
     * @param elem Relationship to be deleted
     */
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

    /**
     * Delete an Action.
     *
     * @param elem the Action to be deleted
     */
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

    /**
     * Delete an Instance.
     *
     * @param elem the Instance to be deleted.
     */
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

    /**
     * Delete a StateVertex.
     *
     * @param elem the StateVertex to be deleted
     */
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