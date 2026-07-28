public class Log4jLogEvent implements LogEvent {

    // ...

    private Log4jLogEvent(LogEventBuilder builder) {
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

    public static class LogEventBuilder {
        private String loggerName;
        private Marker marker;
        private String loggerFqcn;
        private Level level;
        private Message message;
        private Throwable thrown;
        private ThrowableProxy thrownProxy;
        private Map<String, String> contextMap;
        private ThreadContext.ContextStack contextStack;
        private long timeMillis;
        private String threadName;
        private StackTraceElement source;
        private long nanoTime;
        private boolean includeLocation;
        private boolean endOfBatch;

        public LogEventBuilder withLoggerName(String loggerName) {
            this.loggerName = loggerName;
            return this;
        }

        public LogEventBuilder withMarker(Marker marker) {
            this.marker = marker;
            return this;
        }

        public LogEventBuilder withLoggerFqcn(String loggerFqcn) {
            this.loggerFqcn = loggerFqcn;
            return this;
        }

        public LogEventBuilder withLevel(Level level) {
            this.level = level;
            return this;
        }

        public LogEventBuilder withMessage(Message message) {
            this.message = message;
            return this;
        }

        public LogEventBuilder withThrown(Throwable thrown) {
            this.thrown = thrown;
            return this;
        }

        public LogEventBuilder withThrownProxy(ThrowableProxy thrownProxy) {
            this.thrownProxy = thrownProxy;
            return this;
        }

        public LogEventBuilder withContextMap(Map<String, String> contextMap) {
            this.contextMap = contextMap;
            return this;
        }

        public LogEventBuilder withContextStack(ThreadContext.ContextStack contextStack) {
            this.contextStack = contextStack;
            return this;
        }

        public LogEventBuilder withTimeMillis(long timeMillis) {
            this.timeMillis = timeMillis;
            return this;
        }

        public LogEventBuilder withThreadName(String threadName) {
            this.threadName = threadName;
            return this;
        }

        public LogEventBuilder withSource(StackTraceElement source) {
            this.source = source;
            return this;
        }

        public LogEventBuilder withNanoTime(long nanoTime) {
            this.nanoTime = nanoTime;
            return this;
        }

        public LogEventBuilder withIncludeLocation(boolean includeLocation) {
            this.includeLocation = includeLocation;
            return this;
        }

        public LogEventBuilder withEndOfBatch(boolean endOfBatch) {
            this.endOfBatch = endOfBatch;
            return this;
        }

        public Log4jLogEvent build() {
            return new Log4jLogEvent(this);
        }
    }

    public static LogEventBuilder newBuilder() {
        return new LogEventBuilder();
    }

    // ...
}