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
 * @deprecated use {@link Log4jLogEvent.Builder} instead. This constructor will be removed in an upcoming release.
 */
@Deprecated
public Log4jLogEvent(final String loggerName, final Marker marker, final String loggerFQCN, final Level level,
        final Message message, final Throwable t, final Map<String, String> mdc,
        final ThreadContext.ContextStack ndc, final String threadName,
        final StackTraceElement location, final long timestampMillis) {
    Builder builder = new Builder();
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
    this(builder);
}