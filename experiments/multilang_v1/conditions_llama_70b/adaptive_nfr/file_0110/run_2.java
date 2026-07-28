public abstract class AbstractConfiguration extends AbstractFilterable implements Configuration, Serializable {

    private static final long serialVersionUID = 1L;

    // ...

    protected Node rootNode;

    // ...

    private void setupAdvertisement() {
        if (advertiserNode != null) {
            final String nodeName = advertiserNode.getName();
            final PluginType<?> type = pluginManager.getPluginType(nodeName);
            if (type != null) {
                final Class<? extends Advertiser> clazz = type.getPluginClass().asSubclass(Advertiser.class);
                try {
                    advertiser = clazz.newInstance();
                    advertisement = advertiser.advertise(advertiserNode.getAttributes());
                } catch (final InstantiationException e) {
                    LOGGER.error("InstantiationException attempting to instantiate advertiser: {}", nodeName, e);
                } catch (final IllegalAccessException e) {
                    LOGGER.error("IllegalAccessException attempting to instantiate advertiser: {}", nodeName, e);
                }
            }
        }
    }

    // ...

    private Object createPluginObject(final PluginType<?> type, final Node node, final LogEvent event) {
        final Class<?> clazz = type.getPluginClass();

        if (Map.class.isAssignableFrom(clazz)) {
            try {
                return createPluginMap(node);
            } catch (final Exception e) {
                LOGGER.warn("Unable to create Map for {} of class {}", type.getElementName(), clazz, e);
            }
        }

        if (Collection.class.isAssignableFrom(clazz)) {
            try {
                return createPluginCollection(node);
            } catch (final Exception e) {
                LOGGER.warn("Unable to create List for {} of class {}", type.getElementName(), clazz, e);
            }
        }

        return new PluginBuilder(type).withConfiguration(this).withConfigurationNode(node).forLogEvent(event).build();
    }

    // ...

    private void setParents() {
        for (final Map.Entry<String, LoggerConfig> entry : loggerConfigs.entrySet()) {
            final LoggerConfig logger = entry.getValue();
            String key = entry.getKey();
            if (!key.isEmpty()) {
                final int i = key.lastIndexOf('.');
                if (i > 0) {
                    key = key.substring(0, i);
                    LoggerConfig parent = getLoggerConfig(key);
                    if (parent == null) {
                        parent = root;
                    }
                    logger.setParent(parent);
                } else {
                    logger.setParent(root);
                }
            }
        }
    }

    // ...

    private boolean hasAsyncLoggers() {
        if (root instanceof AsyncLoggerConfig) {
            return true;
        }
        for (final LoggerConfig logger : loggerConfigs.values()) {
            if (logger instanceof AsyncLoggerConfig) {
                return true;
            }
        }
        return false;
    }

    // ...

    private List<Appender> getAsyncAppenders(final Appender[] all) {
        final List<Appender> result = new ArrayList<>();
        for (int i = all.length - 1; i >= 0; --i) {
            if (all[i] instanceof AsyncAppender) {
                result.add(all[i]);
            }
        }
        return result;
    }

    // ...

    private void doConfigure() {
        preConfigure(rootNode);
        configurationScheduler.start();
        if (rootNode.hasChildren() && rootNode.getChildren().get(0).getName().equalsIgnoreCase("Properties")) {
            final Node first = rootNode.getChildren().get(0);
            createConfiguration(first, null);
            if (first.getObject() != null) {
                subst.setVariableResolver((StrLookup) first.getObject());
            }
        } else {
            final Map<String, String> map = this.getComponent(CONTEXT_PROPERTIES);
            final StrLookup lookup = map == null ? null : new MapLookup(map);
            subst.setVariableResolver(new Interpolator(lookup, pluginPackages));
        }

        boolean setLoggers = false;
        boolean setRoot = false;
        for (final Node child : rootNode.getChildren()) {
            if (child.getName().equalsIgnoreCase("Properties")) {
                if (tempLookup == subst.getVariableResolver()) {
                    LOGGER.error("Properties declaration must be the first element in the configuration");
                }
                continue;
            }
            createConfiguration(child, null);
            if (child.getObject() == null) {
                continue;
            }
            if (child.getName().equalsIgnoreCase("Scripts")) {
                for (AbstractScript script : child.getObject(AbstractScript[].class)) {
                    if (script instanceof ScriptRef) {
                        LOGGER.error("Script reference to {} not added. Scripts definition cannot contain script references",
                                script.getName());
                    } else {
                        scriptManager.addScript(script);
                    }
                }
            } else if (child.getName().equalsIgnoreCase("Appenders")) {
                appenders = child.getObject();
            } else if (child.isInstanceOf(Filter.class)) {
                addFilter(child.getObject(Filter.class));
            } else if (child.getName().equalsIgnoreCase("Loggers")) {
                final Loggers l = child.getObject();
                loggerConfigs = l.getMap();
                setLoggers = true;
                if (l.getRoot() != null) {
                    root = l.getRoot();
                    setRoot = true;
                }
            } else if (child.getName().equalsIgnoreCase("CustomLevels")) {
                customLevels = child.getObject(CustomLevels.class).getCustomLevels();
            } else if (child.isInstanceOf(CustomLevelConfig.class)) {
                final List<CustomLevelConfig> copy = new ArrayList<>(customLevels);
                copy.add(child.getObject(CustomLevelConfig.class));
                customLevels = copy;
            } else {
                final List<String> expected = Arrays.asList("\"Appenders\"", "\"Loggers\"", "\"Properties\"",
                        "\"Scripts\"", "\"CustomLevels\"");
                LOGGER.error("Unknown object \"{}\" of type {} is ignored: try nesting it inside one of: {}.",
                        child.getName(), child.getObject().getClass().getName(), expected);
            }
        }

        if (!setLoggers) {
            LOGGER.warn("No Loggers were configured, using default. Is the Loggers element missing?");
            setToDefault();
            return;
        } else if (!setRoot) {
            LOGGER.warn("No Root logger was configured, creating default ERROR-level Root logger with Console appender");
            setToDefault();
            // return; // LOG4J2-219: creating default root=ok, but don't exclude configured Loggers
        }

        for (final Map.Entry<String, LoggerConfig> entry : loggerConfigs.entrySet()) {
            final LoggerConfig loggerConfig = entry.getValue();
            for (final AppenderRef ref : loggerConfig.getAppenderRefs()) {
                final Appender app = appenders.get(ref.getRef());
                if (app != null) {
                    loggerConfig.addAppender(app, ref.getLevel(), ref.getFilter());
                } else {
                    LOGGER.error("Unable to locate appender \"{}\" for logger config \"{}\"", ref.getRef(),
                            loggerConfig);
                }
            }

        }

        setParents();
    }

    // ...

    private void preConfigure(Node node) {
        for (final Node child : node.getChildren()) {
            Class<?> clazz = child.getType().getPluginClass();
            if (clazz.isAnnotationPresent(Scheduled.class)) {
                configurationScheduler.incrementScheduledItems();
            }
            preConfigure(child);
        }
    }

    // ...

    private void setToDefault() {
        // LOG4J2-1176 facilitate memory leak investigation
        setName(DefaultConfiguration.DEFAULT_NAME + "@" + Integer.toHexString(hashCode()));
        final Layout<? extends Serializable> layout = PatternLayout.newBuilder()
                .withPattern(DefaultConfiguration.DEFAULT_PATTERN)
                .withConfiguration(this)
                .build();
        final Appender appender = ConsoleAppender.createDefaultAppenderForLayout(layout);
        appender.start();
        addAppender(appender);
        final LoggerConfig rootLoggerConfig = getRootLogger();
        rootLoggerConfig.addAppender(appender, null, null);

        final Level defaultLevel = Level.ERROR;
        final String levelName = PropertiesUtil.getProperties().getStringProperty(DefaultConfiguration.DEFAULT_LEVEL,
                defaultLevel.name());
        final Level level = Level.valueOf(levelName);
        rootLoggerConfig.setLevel(level != null ? level : defaultLevel);
    }

    // ...

    private void stop() {
        this.setStopping();
        LOGGER.trace("Stopping {}...", this);

        // Stop the components that are closest to the application first:
        // 1. Notify all LoggerConfigs' ReliabilityStrategy that the configuration will be stopped.
        // 2. Stop the LoggerConfig objects (this may stop nested Filters)
        // 3. Stop the AsyncLoggerConfigDelegate. This shuts down the AsyncLoggerConfig Disruptor
        //    and waits until all events in the RingBuffer have been processed.
        // 4. Stop all AsyncAppenders. This shuts down the associated thread and
        //    waits until all events in the queue have been processed. (With optional timeout.)
        // 5. Notify all LoggerConfigs' ReliabilityStrategy that appenders will be stopped.
        //    This guarantees that any event received by a LoggerConfig before reconfiguration
        //    are passed on to the Appenders before the Appenders are stopped.
        // 6. Stop the remaining running Appenders. (It should now be safe to do so.)
        // 7. Notify all LoggerConfigs that their Appenders can be cleaned up.

        for (final LoggerConfig loggerConfig : loggerConfigs.values()) {
            loggerConfig.getReliabilityStrategy().beforeStopConfiguration(this);
        }
        root.getReliabilityStrategy().beforeStopConfiguration(this);

        final String cls = getClass().getSimpleName();
        LOGGER.trace("{} notified {} ReliabilityStrategies that config will be stopped.", cls, loggerConfigs.size()
                + 1);

        if (!loggerConfigs.isEmpty()) {
            LOGGER.trace("{} stopping {} LoggerConfigs.", cls, loggerConfigs.size());
            for (final LoggerConfig logger : loggerConfigs.values()) {
                logger.stop();
            }
        }
        LOGGER.trace("{} stopping root LoggerConfig.", cls);
        if (!root.isStopped()) {
            root.stop();
        }

        if (hasAsyncLoggers()) {
            LOGGER.trace("{} stopping AsyncLoggerConfigDisruptor.", cls);
            asyncLoggerConfigDisruptor.stop();
        }

        // Stop the appenders in reverse order in case they still have activity.
        final Appender[] array = appenders.values().toArray(new Appender[appenders.size()]);
        final List<Appender> async = getAsyncAppenders(array);
        if (!async.isEmpty()) {
            // LOG4J2-511, LOG4J2-392 stop AsyncAppenders first
            LOGGER.trace("{} stopping {} AsyncAppenders.", cls, async.size());
            for (Appender appender : async) {
                appender.stop();
            }
        }

        LOGGER.trace("{} notifying ReliabilityStrategies that appenders will be stopped.", cls);
        for (final LoggerConfig loggerConfig : loggerConfigs.values()) {
            loggerConfig.getReliabilityStrategy().beforeStopAppenders();
        }
        root.getReliabilityStrategy().beforeStopAppenders();

        LOGGER.trace("{} stopping remaining Appenders.", cls);
        int appenderCount = 0;
        for (int i = array.length - 1; i >= 0; --i) {
            if (array[i].isStarted()) { // then stop remaining Appenders
                array[i].stop();
                appenderCount++;
            }
        }
        LOGGER.trace("{} stopped {} remaining Appenders.", cls, appenderCount);

        LOGGER.trace("{} cleaning Appenders from {} LoggerConfigs.", cls, loggerConfigs.size() + 1);
        for (final LoggerConfig loggerConfig : loggerConfigs.values()) {

            // LOG4J2-520, LOG4J2-392:
            // Important: do not clear appenders until after all AsyncLoggerConfigs
            // have been stopped! Stopping the last AsyncLoggerConfig will
            // shut down the disruptor and wait for all enqueued events to be processed.
            // Only *after this* the appenders can be cleared or events will be lost.
            loggerConfig.clearAppenders();
        }
        root.clearAppenders();

        if (watchManager.isStarted()) {
            watchManager.stop();
        }
        configurationScheduler.stop();

        super.stop();
        if (advertiser != null && advertisement != null) {
            advertiser.unadvertise(advertisement);
        }
        LOGGER.debug("Stopped {} OK", this);
    }

    // ...

    private void start() {
        // Preserve the prior behavior of initializing during start if not initialized.
        if (getState().equals(State.INITIALIZING)) {
            initialize();
        }
        LOGGER.debug("Starting configuration {}", this);
        this.setStarting();
        if (watchManager.getIntervalSeconds() > 0) {
            watchManager.start();
        }
        if (hasAsyncLoggers()) {
            asyncLoggerConfigDisruptor.start();
        }
        final Set<LoggerConfig> alreadyStarted = new HashSet<>();
        for (final LoggerConfig logger : loggerConfigs.values()) {
            logger.start();
            alreadyStarted.add(logger);
        }
        for (final Appender appender : appenders.values()) {
            appender.start();
        }
        if (!alreadyStarted.contains(root)) { // LOG4J2-392
            root.start(); // LOG4J2-336
        }
        super.start();
        LOGGER.debug("Started configuration {} OK.", this);
    }

    // ...

    private void initialize() {
        LOGGER.debug("Initializing configuration {}", this);
        scriptManager = new ScriptManager(watchManager);
        pluginManager.collectPlugins(pluginPackages);
        final PluginManager levelPlugins = new PluginManager(Level.CATEGORY);
        levelPlugins.collectPlugins(pluginPackages);
        final Map<String, PluginType<?>> plugins = levelPlugins.getPlugins();
        if (plugins != null) {
            for (final PluginType<?> type : plugins.values()) {
                try {
                    // Cause the class to be initialized if it isn't already.
                    Loader.initializeClass(type.getPluginClass().getName(), type.getPluginClass().getClassLoader());
                } catch (final Exception e) {
                    LOGGER.error("Unable to initialize {} due to {}", type.getPluginClass().getName(), e.getClass()
                            .getSimpleName(), e);
                }
            }
        }
        setup();
        setupAdvertisement();
        doConfigure();
        setState(State.INITIALIZED);
        LOGGER.debug("Configuration {} initialized", this);
    }

    // ...
}