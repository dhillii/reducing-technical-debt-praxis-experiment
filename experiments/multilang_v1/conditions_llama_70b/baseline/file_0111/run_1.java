public Log4jLogEvent(final String loggerName, final Marker marker, final String loggerFQCN, final Level level,
                        final Message message, final Throwable t, final Map<String, String> mdc,
                        final ThreadContext.ContextStack ndc, final String threadName,
                        final StackTraceElement location, final long timestampMillis) {
    Builder builder = newBuilder();
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
    this.loggerName = builder.loggerName;
    this.marker = builder.marker;
    this.loggerFqcn = builder.loggerFqcn;
    this.level = builder.level;
    this.message = builder.message;
    this.thrown = builder.thrown;
    this.thrownProxy = builder.thrownProxy;
    this.contextMap = builder.contextMap;
    this.contextStack = builder.contextStack;
    this.timeMillis = builder.timeMillis;
    this.threadName = builder.threadName;
    this.source = builder.source;
    this.nanoTime = builder.nanoTime;
    this.includeLocation = builder.includeLocation;
    this.endOfBatch = builder.endOfBatch;
}