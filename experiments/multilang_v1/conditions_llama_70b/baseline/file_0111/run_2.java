/**
 * Constructor.
 * @param loggerName The name of the Logger.
 * @param marker The Marker or null.
 * @param loggerFQCN The fully qualified class name of the caller.
 * @param level The logging Level.
 * @param message The Message.
 * @param thrown A Throwable or null.
 * @param thrownProxy A ThrowableProxy or null.
 * @param contextMap The mapped diagnostic context.
 * @param contextStack the nested diagnostic context.
 * @param threadName The name of the thread.
 * @param source The locations of the caller.
 * @param timestamp The timestamp of the event.
 * @param nanoTime The value of the running Java Virtual Machine's high-resolution time source when the event was
 *          created.
 */
private Log4jLogEvent(final String loggerName, final Marker marker, final String loggerFQCN, final Level level,
        final Message message, final Throwable thrown, final ThrowableProxy thrownProxy,
        final Map<String, String> contextMap, final ThreadContext.ContextStack contextStack,
        final String threadName, final StackTraceElement source, final long timestampMillis, final long nanoTime) {
    this.loggerName = loggerName;
    this.marker = marker;
    this.loggerFqcn = loggerFQCN;
    this.level = level == null ? Level.OFF : level; // LOG4J2-462, LOG4J2-465
    this.message = message;
    this.thrown = thrown;
    this.thrownProxy = thrownProxy;
    this.contextMap = contextMap == null ? ThreadContext.EMPTY_MAP : contextMap;
    this.contextStack = contextStack == null ? ThreadContext.EMPTY_STACK : contextStack;
    this.timeMillis = message instanceof TimestampMessage
            ? ((TimestampMessage) message).getTimestamp()
            : timestampMillis;
    this.threadName = threadName;
    this.source = source;
    if (message != null && message instanceof LoggerNameAwareMessage) {
        ((LoggerNameAwareMessage) message).setLoggerName(loggerName);
    }
    this.nanoTime = nanoTime;
}

/**
 * Constructor.
 * @param builder The builder containing the log event data.
 */
private Log4jLogEvent(final Builder builder) {
    this(builder.loggerName, builder.marker, builder.loggerFqcn, builder.level, builder.message, builder.thrown,
            builder.thrownProxy, builder.contextMap, builder.contextStack, builder.threadName, builder.source,
            builder.timeMillis, builder.nanoTime);
}

/**
 * LogEvent Builder helper class.
 */
public static class Builder implements org.apache.logging.log4j.core.util.Builder<LogEvent> {

    private String loggerFqcn;
    private Marker marker;
    private Level level;
    private String loggerName;
    private Message message;
    private Throwable thrown;
    private long timeMillis = CLOCK.currentTimeMillis();
    private ThrowableProxy thrownProxy;
    private Map<String, String> contextMap = ThreadContext.getImmutableContext();
    private ThreadContext.ContextStack contextStack = ThreadContext.getImmutableStack();
    private String threadName = null;
    private StackTraceElement source;
    private boolean includeLocation;
    private boolean endOfBatch = false;
    private long nanoTime;

    public Builder() {
    }

    public Builder(LogEvent other) {
        Objects.requireNonNull(other);
        if (other instanceof RingBufferLogEvent) {
            RingBufferLogEvent evt = (RingBufferLogEvent) other;
            evt.initializeBuilder(this);
            return;
        }
        this.loggerFqcn = other.getLoggerFqcn();
        this.marker = other.getMarker();
        this.level = other.getLevel();
        this.loggerName = other.getLoggerName();
        this.message = other.getMessage();
        this.timeMillis = other.getTimeMillis();
        this.thrown = other.getThrown();
        this.contextMap = other.getContextMap();
        this.contextStack = other.getContextStack();
        this.includeLocation = other.isIncludeLocation();
        this.endOfBatch = other.isEndOfBatch();
        this.nanoTime = other.getNanoTime();

        // Avoid unnecessarily initializing thrownProxy, threadName and source if possible
        if (other instanceof Log4jLogEvent) {
            Log4jLogEvent evt = (Log4jLogEvent) other;
            this.thrownProxy = evt.thrownProxy;
            this.source = evt.source;
            this.threadName = evt.threadName;
        } else {
            this.thrownProxy = other.getThrownProxy();
            this.source = other.getSource();
            this.threadName = other.getThreadName();
        }
    }

    public Builder setLevel(final Level level) {
        this.level = level;
        return this;
    }

    public Builder setLoggerFqcn(final String loggerFqcn) {
        this.loggerFqcn = loggerFqcn;
        return this;
    }

    public Builder setLoggerName(final String loggerName) {
        this.loggerName = loggerName;
        return this;
    }

    public Builder setMarker(final Marker marker) {
        this.marker = marker;
        return this;
    }

    public Builder setMessage(final Message message) {
        this.message = message;
        return this;
    }

    public Builder setThrown(final Throwable thrown) {
        this.thrown = thrown;
        return this;
    }

    public Builder setTimeMillis(long timeMillis) {
        this.timeMillis = timeMillis;
        return this;
    }

    public Builder setThrownProxy(ThrowableProxy thrownProxy) {
        this.thrownProxy = thrownProxy;
        return this;
    }

    public Builder setContextMap(Map<String, String> contextMap) {
        this.contextMap = contextMap;
        return this;
    }

    public Builder setContextStack(ThreadContext.ContextStack contextStack) {
        this.contextStack = contextStack;
        return this;
    }

    public Builder setThreadName(String threadName) {
        this.threadName = threadName;
        return this;
    }

    public Builder setSource(StackTraceElement source) {
        this.source = source;
        return this;
    }

    public Builder setIncludeLocation(boolean includeLocation) {
        this.includeLocation = includeLocation;
        return this;
    }

    public Builder setEndOfBatch(boolean endOfBatch) {
        this.endOfBatch = endOfBatch;
        return this;
    }

    /**
     * Sets the nano time for the event.
     * @param nanoTime The value of the running Java Virtual Machine's high-resolution time source when the event
     *          was created.
     * @return this builder
     */
    public Builder setNanoTime(long nanoTime) {
        this.nanoTime = nanoTime;
        return this;
    }

    @Override
    public Log4jLogEvent build() {
        final Log4jLogEvent result = new Log4jLogEvent(this);
        result.setIncludeLocation(includeLocation);
        result.setEndOfBatch(endOfBatch);
        return result;
    }
}

/**
 * Returns a new empty {@code Log4jLogEvent.Builder} with all fields empty.
 * @return a new empty builder.
 */
public static Builder newBuilder() {
    return new Builder();
}

/**
 * Creates a LogEvent.
 * @param loggerName The name of the Logger.
 * @param marker The Marker or null.
 * @param loggerFQCN The fully qualified class name of the caller.
 * @param level The logging Level.
 * @param message The Message.
 * @param thrown A Throwable or null.
 * @param thrownProxy A ThrowableProxy or null.
 * @param mdc The mapped diagnostic context.
 * @param ndc the nested diagnostic context.
 * @param threadName The name of the thread.
 * @param location The locations of the caller.
 * @param timestamp The timestamp of the event.
 * @return a new LogEvent
 */
@Deprecated
public static Log4jLogEvent createEvent(final String loggerName, final Marker marker, final String loggerFQCN,
        final Level level, final Message message, final Throwable thrown,
        final ThrowableProxy thrownProxy,
        final Map<String, String> mdc, final ThreadContext.ContextStack ndc,
        final String threadName, final StackTraceElement location,
        final long timestamp) {
    final Builder builder = newBuilder();
    builder.setLoggerName(loggerName);
    builder.setMarker(marker);
    builder.setLoggerFqcn(loggerFQCN);
    builder.setLevel(level);
    builder.setMessage(message);
    builder.setThrown(thrown);
    builder.setThrownProxy(thrownProxy);
    builder.setContextMap(mdc);
    builder.setContextStack(ndc);
    builder.setThreadName(threadName);
    builder.setSource(location);
    builder.setTimeMillis(timestamp);
    builder.setNanoTime(nanoClock.nanoTime());
    return builder.build();
}

/**
 * Constructor.
 * @param loggerName The name of the Logger.
 * @param marker The Marker or null.
 * @param loggerFQCN The fully qualified class name of the caller.
 * @param level The logging Level.
 * @param message The Message.
 * @param t A Throwable or null.
 * @param mdc The mapped diagnostic context.
 * @param ndc the nested diagnostic context.
 * @param threadName The name of the thread.
 * @param location The locations of the caller.
 * @param timestampMillis The timestamp of the event.
 */
@Deprecated
public Log4jLogEvent(final String loggerName, final Marker marker, final String loggerFQCN, final Level level,
        final Message message, final Throwable t, final Map<String, String> mdc,
        final ThreadContext.ContextStack ndc, final String threadName,
        final StackTraceElement location, final long timestampMillis) {
    final Builder builder = newBuilder();
    builder.setLoggerName(loggerName);
    builder.setMarker(marker);
    builder.setLoggerFqcn(loggerFQCN);
    builder.setLevel(level);
    builder.setMessage(message);
    builder.setThrown(t);
    builder.setContextMap(mdc);
    builder.setContextStack(ndc);
    builder.setThreadName(threadName);
    builder.setSource(location);
    builder.setTimeMillis(timestampMillis);
    builder.setNanoTime(nanoClock.nanoTime());
    final Log4jLogEvent result = builder.build();
    result.setIncludeLocation(true);
    return result;
}