public class Log4jLogEvent implements LogEvent {

    // ... existing code ...

    private Log4jLogEvent(Log4jLogEventData data) {
        this.loggerName = data.getLoggerName();
        this.marker = data.getMarker();
        this.loggerFqcn = data.getLoggerFqcn();
        this.level = data.getLevel();
        this.message = data.getMessage();
        this.thrown = data.getThrown();
        this.thrownProxy = data.getThrownProxy();
        this.contextMap = data.getContextMap();
        this.contextStack = data.getContextStack();
        this.timeMillis = data.getTimeMillis();
        this.threadName = data.getThreadName();
        this.source = data.getSource();
        this.nanoTime = data.getNanoTime();
        this.includeLocation = data.isIncludeLocation();
        this.endOfBatch = data.isEndOfBatch();
    }

    public static class Log4jLogEventData {
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

        public Log4jLogEventData() {
        }

        public Log4jLogEventData(Log4jLogEvent event) {
            this.loggerName = event.getLoggerName();
            this.marker = event.getMarker();
            this.loggerFqcn = event.getLoggerFqcn();
            this.level = event.getLevel();
            this.message = event.getMessage();
            this.thrown = event.getThrown();
            this.thrownProxy = event.getThrownProxy();
            this.contextMap = event.getContextMap();
            this.contextStack = event.getContextStack();
            this.timeMillis = event.getTimeMillis();
            this.threadName = event.getThreadName();
            this.source = event.getSource();
            this.nanoTime = event.getNanoTime();
            this.includeLocation = event.isIncludeLocation();
            this.endOfBatch = event.isEndOfBatch();
        }

        public String getLoggerName() {
            return loggerName;
        }

        public void setLoggerName(String loggerName) {
            this.loggerName = loggerName;
        }

        public Marker getMarker() {
            return marker;
        }

        public void setMarker(Marker marker) {
            this.marker = marker;
        }

        public String getLoggerFqcn() {
            return loggerFqcn;
        }

        public void setLoggerFqcn(String loggerFqcn) {
            this.loggerFqcn = loggerFqcn;
        }

        public Level getLevel() {
            return level;
        }

        public void setLevel(Level level) {
            this.level = level;
        }

        public Message getMessage() {
            return message;
        }

        public void setMessage(Message message) {
            this.message = message;
        }

        public Throwable getThrown() {
            return thrown;
        }

        public void setThrown(Throwable thrown) {
            this.thrown = thrown;
        }

        public ThrowableProxy getThrownProxy() {
            return thrownProxy;
        }

        public void setThrownProxy(ThrowableProxy thrownProxy) {
            this.thrownProxy = thrownProxy;
        }

        public Map<String, String> getContextMap() {
            return contextMap;
        }

        public void setContextMap(Map<String, String> contextMap) {
            this.contextMap = contextMap;
        }

        public ThreadContext.ContextStack getContextStack() {
            return contextStack;
        }

        public void setContextStack(ThreadContext.ContextStack contextStack) {
            this.contextStack = contextStack;
        }

        public long getTimeMillis() {
            return timeMillis;
        }

        public void setTimeMillis(long timeMillis) {
            this.timeMillis = timeMillis;
        }

        public String getThreadName() {
            return threadName;
        }

        public void setThreadName(String threadName) {
            this.threadName = threadName;
        }

        public StackTraceElement getSource() {
            return source;
        }

        public void setSource(StackTraceElement source) {
            this.source = source;
        }

        public long getNanoTime() {
            return nanoTime;
        }

        public void setNanoTime(long nanoTime) {
            this.nanoTime = nanoTime;
        }

        public boolean isIncludeLocation() {
            return includeLocation;
        }

        public void setIncludeLocation(boolean includeLocation) {
            this.includeLocation = includeLocation;
        }

        public boolean isEndOfBatch() {
            return endOfBatch;
        }

        public void setEndOfBatch(boolean endOfBatch) {
            this.endOfBatch = endOfBatch;
        }
    }

    public static Log4jLogEvent createEvent(Log4jLogEventData data) {
        return new Log4jLogEvent(data);
    }

    // ... existing code ...
}