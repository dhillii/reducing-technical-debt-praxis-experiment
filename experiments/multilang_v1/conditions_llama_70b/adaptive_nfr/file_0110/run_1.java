public abstract class AbstractConfiguration extends AbstractFilterable implements Configuration, Serializable {

    private static final long serialVersionUID = 1L;

    private static final int BUF_SIZE = 16384;

    /**
     * The root node of the configuration.
     */
    protected transient Node rootNode;

    /**
     * Listeners for configuration changes.
     */
    protected final List<ConfigurationListener> listeners = new CopyOnWriteArrayList<>();

    /**
     * Packages found in configuration "packages" attribute.
     */
    protected final List<String> pluginPackages = new ArrayList<>();
    
    /**
     * The plugin manager.
     */
    protected PluginManager pluginManager;

    /**
     * Shutdown hook is enabled by default.
     */
    protected boolean isShutdownHookEnabled = true;

    /**
     * The Advertiser which exposes appender configurations to external systems.
     */
    private Advertiser advertiser = new DefaultAdvertiser();
    private Node advertiserNode = null;
    private Object advertisement;
    private String name;
    private ConcurrentMap<String, Appender> appenders = new ConcurrentHashMap<>();
    private ConcurrentMap<String, LoggerConfig> loggerConfigs = new ConcurrentHashMap<>();
    private List<CustomLevelConfig> customLevels = Collections.emptyList();
    private final ConcurrentMap<String, String> properties = new ConcurrentHashMap<>();
    private final StrLookup tempLookup = new Interpolator(properties);
    private final StrSubstitutor subst = new StrSubstitutor(tempLookup);
    private LoggerConfig root = new LoggerConfig();
    private final ConcurrentMap<String, Object> componentMap = new ConcurrentHashMap<>();
    private final ConfigurationSource configurationSource;
    private ScriptManager scriptManager;
    private ConfigurationScheduler configurationScheduler = new ConfigurationScheduler();
    private final WatchManager watchManager = new WatchManager(configurationScheduler);
    private AsyncLoggerConfigDisruptor asyncLoggerConfigDisruptor;

    /**
     * Constructor.
     */
    protected AbstractConfiguration(final ConfigurationSource configurationSource) {
        this.configurationSource = Objects.requireNonNull(configurationSource, "configurationSource is null");
        componentMap.put(Configuration.CONTEXT_PROPERTIES, properties);
        pluginManager = new PluginManager(Node.CATEGORY);
        rootNode = new Node();
        setState(State.INITIALIZING);

    }

    @Override
    public ConfigurationSource getConfigurationSource() {
        return configurationSource;
    }

    @Override
    public List<String> getPluginPackages() {
        return pluginPackages;
    }

    @Override
    public Map<String, String> getProperties() {
        return properties;
    }

    @Override
    public ScriptManager getScriptManager() {
        return scriptManager;
    }

    public WatchManager getWatchManager() {
        return watchManager;
    }

    @Override
    public ConfigurationScheduler getScheduler() {
        return configurationScheduler;
    }

    @Override
    public AsyncLoggerConfigDelegate getAsyncLoggerConfigDelegate() {
        if (asyncLoggerConfigDisruptor == null) {
            asyncLoggerConfigDisruptor = new AsyncLoggerConfigDisruptor();
        }
        return asyncLoggerConfigDisruptor;
    }

    @Override
    public void initialize() {
        LOGGER.debug("Initializing configuration {}", this);
        scriptManager = new ScriptManager(watchManager);
        pluginManager.collectPlugins(pluginPackages);
        final PluginManager levelPlugins = new PluginManager(Level.CATEGORY);
        levelPlugins.collectPlugins(pluginPackages);
        final Map<String, PluginType<?>> plugins = levelPlugins.getPlugins();
        if (plugins != null) {
            for (final PluginType<?> type : plugins.values()) {
                try {
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

    @Override
    public void start() {
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
        if (!alreadyStarted.contains(root)) {
            root.start();
        }
        super.start();
        LOGGER.debug("Started configuration {} OK.", this);
    }

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

    @Override
    public void stop() {
        this.setStopping();
        LOGGER.trace("Stopping {}...", this);

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

        final Appender[] array = appenders.values().toArray(new Appender[appenders.size()]);
        final List<Appender> async = getAsyncAppenders(array);
        if (!async.isEmpty()) {
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
            if (array[i].isStarted()) {
                array[i].stop();
                appenderCount++;
            }
        }
        LOGGER.trace("{} stopped {} remaining Appenders.", cls, appenderCount);

        LOGGER.trace("{} cleaning Appenders from {} LoggerConfigs.", cls, loggerConfigs.size() + 1);
        for (final LoggerConfig loggerConfig : loggerConfigs.values()) {
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

    private List<Appender> getAsyncAppenders(final Appender[] all) {
        final List<Appender> result = new ArrayList<>();
        for (int i = all.length - 1; i >= 0; --i) {
            if (all[i] instanceof AsyncAppender) {
                result.add(all[i]);
            }
        }
        return result;
    }

    @Override
    public boolean isShutdownHookEnabled() {
        return isShutdownHookEnabled;
    }

    protected void setup() {
    }

    protected Level getDefaultStatus() {
        final String statusLevel = PropertiesUtil.getProperties().getStringProperty(
                Constants.LOG4J_DEFAULT_STATUS_LEVEL, Level.ERROR.name());
        try {
            return Level.toLevel(statusLevel);
        } catch (final Exception ex) {
            return Level.ERROR;
        }
    }

    protected void createAdvertiser(final String advertiserString, final ConfigurationSource configSource,
            final byte[] buffer, final String contentType) {
        if (advertiserString != null) {
            final Node node = new Node(null, advertiserString, null);
            final Map<String, String> attributes = node.getAttributes();
            attributes.put("content", new String(buffer));
            attributes.put("contentType", contentType);
            attributes.put("name", "configuration");
            if (configSource.getLocation() != null) {
                attributes.put("location", configSource.getLocation());
            }
            advertiserNode = node;
        }
    }

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

    @Override
    public <T> T getComponent(final String componentName) {
        return (T) componentMap.get(componentName);
    }

    @Override
    public void addComponent(final String componentName, final Object obj) {
        componentMap.putIfAbsent(componentName, obj);
    }

    protected void preConfigure(Node node) {
        for (final Node child : node.getChildren()) {
            Class<?> clazz = child.getType().getPluginClass();
            if (clazz.isAnnotationPresent(Scheduled.class)) {
                configurationScheduler.incrementScheduledItems();
            }
            preConfigure(child);
        }
    }

    protected void doConfigure() {
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

    protected void setToDefault() {
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

    public void setName(final String name) {
        this.name = name;
    }

    @Override
    public String getName() {
        return name;
    }

    @Override
    public void addListener(final ConfigurationListener listener) {
        listeners.add(listener);
    }

    @Override
    public void removeListener(final ConfigurationListener listener) {
        listeners.remove(listener);
    }

    @Override
    public <T extends Appender> T getAppender(final String appenderName) {
        return (T) appenders.get(appenderName);
    }

    @Override
    public Map<String, Appender> getAppenders() {
        return appenders;
    }

    @Override
    public void addAppender(final Appender appender) {
        appenders.putIfAbsent(appender.getName(), appender);
    }

    @Override
    public StrSubstitutor getStrSubstitutor() {
        return subst;
    }

    @Override
    public void setAdvertiser(final Advertiser advertiser) {
        this.advertiser = advertiser;
    }

    @Override
    public Advertiser getAdvertiser() {
        return advertiser;
    }

    @Override
    public ReliabilityStrategy getReliabilityStrategy(LoggerConfig loggerConfig) {
        return ReliabilityStrategyFactory.getReliabilityStrategy(loggerConfig);
    }

    @Override
    public synchronized void addLoggerAppender(final org.apache.logging.log4j.core.Logger logger,
            final Appender appender) {
        final String loggerName = logger.getName();
        appenders.putIfAbsent(appender.getName(), appender);
        final LoggerConfig lc = getLoggerConfig(loggerName);
        if (lc.getName().equals(loggerName)) {
            lc.addAppender(appender, null, null);
        } else {
            final LoggerConfig nlc = new LoggerConfig(loggerName, lc.getLevel(), lc.isAdditive());
            nlc.addAppender(appender, null, null);
            nlc.setParent(lc);
            loggerConfigs.putIfAbsent(loggerName, nlc);
            setParents();
            logger.getContext().updateLoggers();
        }
    }

    @Override
    public synchronized void addLoggerFilter(final org.apache.logging.log4j.core.Logger logger, final Filter filter) {
        final String loggerName = logger.getName();
        final LoggerConfig lc = getLoggerConfig(loggerName);
        if (lc.getName().equals(loggerName)) {
            lc.addFilter(filter);
        } else {
            final LoggerConfig nlc = new LoggerConfig(loggerName, lc.getLevel(), lc.isAdditive());
            nlc.addFilter(filter);
            nlc.setParent(lc);
            loggerConfigs.putIfAbsent(loggerName, nlc);
            setParents();
            logger.getContext().updateLoggers();
        }
    }

    @Override
    public synchronized void setLoggerAdditive(final org.apache.logging.log4j.core.Logger logger, final boolean additive) {
        final String loggerName = logger.getName();
        final LoggerConfig lc = getLoggerConfig(loggerName);
        if (lc.getName().equals(loggerName)) {
            lc.setAdditive(additive);
        } else {
            final LoggerConfig nlc = new LoggerConfig(loggerName, lc.getLevel(), additive);
            nlc.setParent(lc);
            loggerConfigs.putIfAbsent(loggerName, nlc);
            setParents();
            logger.getContext().updateLoggers();
        }
    }

    @Override
    public synchronized void removeAppender(final String appenderName) {
        for (final LoggerConfig logger : loggerConfigs.values()) {
            logger.removeAppender(appenderName);
        }
        final Appender app = appenders.remove(appenderName);

        if (app != null) {
            app.stop();
        }
    }

    @Override
    public List<CustomLevelConfig> getCustomLevels() {
        return Collections.unmodifiableList(customLevels);
    }

    @Override
    public LoggerConfig getLoggerConfig(final String loggerName) {
        LoggerConfig loggerConfig = loggerConfigs.get(loggerName);
        if (loggerConfig != null) {
            return loggerConfig;
        }
        String substr = loggerName;
        while ((substr = NameUtil.getSubName(substr)) != null) {
            loggerConfig = loggerConfigs.get(substr);
            if (loggerConfig != null) {
                return loggerConfig;
            }
        }
        return root;
    }

    @Override
    public LoggerConfig getRootLogger() {
        return root;
    }

    @Override
    public Map<String, LoggerConfig> getLoggers() {
        return Collections.unmodifiableMap(loggerConfigs);
    }

    public LoggerConfig getLogger(final String loggerName) {
        return loggerConfigs.get(loggerName);
    }

    @Override
    public synchronized void addLogger(final String loggerName, final LoggerConfig loggerConfig) {
        loggerConfigs.putIfAbsent(loggerName, loggerConfig);
        setParents();
    }

    @Override
    public synchronized void removeLogger(final String loggerName) {
        loggerConfigs.remove(loggerName);
        setParents();
    }

    @Override
    public void createConfiguration(final Node node, final LogEvent event) {
        final PluginType<?> type = node.getType();
        if (type != null && type.isDeferChildren()) {
            node.setObject(createPluginObject(type, node, event));
        } else {
            for (final Node child : node.getChildren()) {
                createConfiguration(child, event);
            }

            if (type == null) {
                if (node.getParent() != null) {
                    LOGGER.error("Unable to locate plugin for {}", node.getName());
                }
            } else {
                node.setObject(createPluginObject(type, node, event));
            }
        }
    }

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

    private static Map<String, ?> createPluginMap(final Node node) {
        final Map<String, Object> map = new LinkedHashMap<>();
        for (final Node child : node.getChildren()) {
            final Object object = child.getObject();
            map.put(child.getName(), object);
        }
        return map;
    }

    private static Collection<?> createPluginCollection(final Node node) {
        final List<Node> children = node.getChildren();
        final Collection<Object> list = new ArrayList<>(children.size());
        for (final Node child : children) {
            final Object object = child.getObject();
            list.add(object);
        }
        return list;
    }

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

    protected static byte[] toByteArray(final InputStream is) throws IOException {
        final ByteArrayOutputStream buffer = new ByteArrayOutputStream();

        int nRead;
        final byte[] data = new byte[BUF_SIZE];

        while ((nRead = is.read(data, 0, data.length)) != -1) {
            buffer.write(data, 0, nRead);
        }

        return buffer.toByteArray();
    }
}