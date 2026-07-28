public class Log4jLogEvent implements LogEvent {

    // ... existing code ...

    public static class LogEventParameters {
        private String loggerName;
        private Marker marker;
        private String loggerFQCN;
        private Level level;
        private Message message;
        private Throwable thrown;
        private ThrowableProxy thrownProxy;
        private Map<String, String> contextMap;
        private ThreadContext.ContextStack contextStack;
        private String threadName;
        private StackTraceElement source;
        private long timestampMillis;
        private long nanoTime;

        public LogEventParameters() {}

        public LogEventParameters(String loggerName, Marker marker, String loggerFQCN, Level level, Message message,
                Throwable thrown, ThrowableProxy thrownProxy, Map<String, String> contextMap,
                ThreadContext.ContextStack contextStack, String threadName, StackTraceElement source,
                long timestampMillis, long nanoTime) {
            this.loggerName = loggerName;
            this.marker = marker;
            this.loggerFQCN = loggerFQCN;
            this.level = level;
            this.message = message;
            this.thrown = thrown;
            this.thrownProxy = thrownProxy;
            this.contextMap = contextMap;
            this.contextStack = contextStack;
            this.threadName = threadName;
            this.source = source;
            this.timestampMillis = timestampMillis;
            this.nanoTime = nanoTime;
        }

        // getters and setters
    }

    public static class Builder implements org.apache.logging.log4j.core.util.Builder<LogEvent> {

        private LogEventParameters parameters;

        public Builder() {
            this.parameters = new LogEventParameters();
        }

        public Builder(LogEvent other) {
            this.parameters = new LogEventParameters();
            if (other instanceof RingBufferLogEvent) {
                RingBufferLogEvent evt = (RingBufferLogEvent) other;
                evt.initializeBuilder(this);
                return;
            }
            this.parameters.loggerFQCN = other.getLoggerFqcn();
            this.parameters.marker = other.getMarker();
            this.parameters.level = other.getLevel();
            this.parameters.loggerName = other.getLoggerName();
            this.parameters.message = other.getMessage();
            this.parameters.timeMillis = other.getTimeMillis();
            this.parameters.thrown = other.getThrown();
            this.parameters.contextMap = other.getContextMap();
            this.parameters.contextStack = other.getContextStack();
            this.parameters.includeLocation = other.isIncludeLocation();
            this.parameters.endOfBatch = other.isEndOfBatch();
            this.parameters.nanoTime = other.getNanoTime();

            // Avoid unnecessarily initializing thrownProxy, threadName and source if possible
            if (other instanceof Log4jLogEvent) {
                Log4jLogEvent evt = (Log4jLogEvent) other;
                this.parameters.thrownProxy = evt.thrownProxy;
                this.parameters.source = evt.source;
                this.parameters.threadName = evt.threadName;
            } else {
                this.parameters.thrownProxy = other.getThrownProxy();
                this.parameters.source = other.getSource();
                this.parameters.threadName = other.getThreadName();
            }
        }

        public Builder setLevel(final Level level) {
            this.parameters.level = level;
            return this;
        }

        public Builder setLoggerFqcn(final String loggerFqcn) {
            this.parameters.loggerFQCN = loggerFqcn;
            return this;
        }

        public Builder setLoggerName(final String loggerName) {
            this.parameters.loggerName = loggerName;
            return this;
        }

        public Builder setMarker(final Marker marker) {
            this.parameters.marker = marker;
            return this;
        }

        public Builder setMessage(final Message message) {
            this.parameters.message = message;
            return this;
        }

        public Builder setThrown(final Throwable thrown) {
            this.parameters.thrown = thrown;
            return this;
        }

        public Builder setTimeMillis(long timeMillis) {
            this.parameters.timestampMillis = timeMillis;
            return this;
        }

        public Builder setThrownProxy(ThrowableProxy thrownProxy) {
            this.parameters.thrownProxy = thrownProxy;
            return this;
        }

        public Builder setContextMap(Map<String, String> contextMap) {
            this.parameters.contextMap = contextMap;
            return this;
        }

        public Builder setContextStack(ThreadContext.ContextStack contextStack) {
            this.parameters.contextStack = contextStack;
            return this;
        }

        public Builder setThreadName(String threadName) {
            this.parameters.threadName = threadName;
            return this;
        }

        public Builder setSource(StackTraceElement source) {
            this.parameters.source = source;
            return this;
        }

        public Builder setIncludeLocation(boolean includeLocation) {
            this.parameters.includeLocation = includeLocation;
            return this;
        }

        public Builder setEndOfBatch(boolean endOfBatch) {
            this.parameters.endOfBatch = endOfBatch;
            return this;
        }

        public Builder setNanoTime(long nanoTime) {
            this.parameters.nanoTime = nanoTime;
            return this;
        }

        @Override
        public Log4jLogEvent build() {
            return new Log4jLogEvent(parameters);
        }
    }

    private Log4jLogEvent(LogEventParameters parameters) {
        this.loggerName = parameters.loggerName;
        this.marker = parameters.marker;
        this.loggerFqcn = parameters.loggerFQCN;
        this.level = parameters.level == null ? Level.OFF : parameters.level;
        this.message = parameters.message;
        this.thrown = parameters.thrown;
        this.thrownProxy = parameters.thrownProxy;
        this.contextMap = parameters.contextMap == null ? ThreadContext.EMPTY_MAP : parameters.contextMap;
        this.contextStack = parameters.contextStack == null ? ThreadContext.EMPTY_STACK : parameters.contextStack;
        this.timeMillis = parameters.message instanceof TimestampMessage
                ? ((TimestampMessage) parameters.message).getTimestamp()
                : parameters.timestampMillis;
        this.threadName = parameters.threadName;
        this.source = parameters.source;
        if (parameters.message != null && parameters.message instanceof LoggerNameAwareMessage) {
            ((LoggerNameAwareMessage) parameters.message).setLoggerName(parameters.loggerName);
        }
        this.nanoTime = parameters.nanoTime;
    }

    // ... existing code ...
}