/**
 * The base Configuration. Many configuration implementations will extend this class.
 */
public abstract class AbstractConfiguration extends AbstractFilterable implements Configuration {

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

    // ... rest of the class remains the same ...
}