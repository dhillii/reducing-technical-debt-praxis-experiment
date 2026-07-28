/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache license, Version 2.0
 * (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the license for the specific language governing permissions and
 * limitations under the license.
 */
package org.apache.logging.log4j.core.impl;

import java.io.InvalidObjectException;
import java.io.ObjectInputStream;
import java.io.Serializable;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.Marker;
import org.apache.logging.log4j.ThreadContext;
import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.core.async.RingBufferLogEvent;
import org.apache.logging.log4j.core.config.LoggerConfig;
import org.apache.logging.log4j.core.config.Property;
import org.apache.logging.log4j.core.util.Clock;
import org.apache.logging.log4j.core.util.ClockFactory;
import org.apache.logging.log4j.core.util.DummyNanoClock;
import org.apache.logging.log4j.core.util.NanoClock;
import org.apache.logging.log4j.message.LoggerNameAwareMessage;
import org.apache.logging.log4j.message.Message;
import org.apache.logging.log4j.message.TimestampMessage;
import org.apache.logging.log4j.status.StatusLogger;
import org.apache.logging.log4j.util.Strings;

/**
 * Implementation of a LogEvent.
 */
public class Log4jLogEvent implements LogEvent {

    private static final long serialVersionUID = -1351367343806656055L;
    private static final Clock CLOCK = ClockFactory.getClock();
    private static volatile NanoClock nanoClock = new DummyNanoClock();
    private final String loggerFqcn;
    private final Marker marker;
    private final Level level;
    private final String loggerName;
    private final Message message;
    private final long timeMillis;
    private final transient Throwable thrown;
    private ThrowableProxy thrownProxy;
    private final Map<String, String> contextMap;
    private final ThreadContext.ContextStack contextStack;
    private String threadName;
    private StackTraceElement source;
    private boolean includeLocation;
    private boolean endOfBatch = false;
    /** @since Log4J 2.4 */
    private final transient long nanoTime;

    /** LogEvent Builder helper class. */
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
         *
         * @param nanoTime the high‑resolution time source value
         * @return this builder
         */
        public Builder setNanoTime(long nanoTime) {
            this.nanoTime = nanoTime;
            return this;
        }

        @Override
        public Log4jLogEvent build() {
            return new Log4jLogEvent(this);
        }
    }

    /**
     * Returns a new empty {@code Log4jLogEvent.Builder} with all fields empty.
     *
     * @return a new empty builder.
     */
    public static Builder newBuilder() {
        return new Builder();
    }

    public Log4jLogEvent() {
        this(Strings.EMPTY, null, Strings.EMPTY, null, null, (Throwable) null, null, null, null, null, null,
                CLOCK.currentTimeMillis(), nanoClock.nanoTime());
    }

    /**
     *
     * @deprecated use {@link Log4jLogEvent.Builder} instead. This constructor will be removed in an upcoming
     * release.
     */
    @Deprecated
    public Log4jLogEvent(final long timestamp) {
        this(Strings.EMPTY, null, Strings.EMPTY, null, null, (Throwable) null, null, null, null, null, null,
                timestamp, nanoClock.nanoTime());
    }

    /**
     * Constructor.
     *
     * @param loggerName The name of the Logger.
     * @param marker     The Marker or null.
     * @param loggerFQCN The fully qualified class name of the caller.
     * @param level      The logging Level.
     * @param message    The Message.
     * @param t          A Throwable or null.
     * @deprecated use {@link Log4jLogEvent.Builder} instead. This constructor will be removed in an upcoming
     * release.
     */
    @Deprecated
    public Log4jLogEvent(final String loggerName, final Marker marker, final String loggerFQCN,
                         final Level level, final Message message, final Throwable t) {
        this(loggerName, marker, loggerFQCN, level, message, t, null,
                null, null, null, null,
                CLOCK.currentTimeMillis(), nanoClock.nanoTime());
    }

    /**
     * Constructor.
     *
     * @param loggerName  The name of the Logger.
     * @param marker      The Marker or null.
     * @param loggerFQCN  The fully qualified class name of the caller.
     * @param level       The logging Level.
     * @param message     The Message.
     * @param properties  properties to add to the event.
     * @param t           A Throwable or null.
     */
    // This constructor is called from LogEventFactories.
    public Log4jLogEvent(final String loggerName, final Marker marker, final String loggerFQCN,
                         final Level level, final Message message, final List<Property> properties,
                         final Throwable t) {
        this(loggerName, marker, loggerFQCN, level, message, t, null,
                createMap(properties),
                ThreadContext.getDepth() == 0 ? null : ThreadContext.cloneStack(),
                null,
                null,
                message instanceof TimestampMessage ? ((TimestampMessage) message).getTimestamp()
                        : CLOCK.currentTimeMillis(),
                nanoClock.nanoTime());
    }

    /**
     * Constructor.
     *
     * @param loggerName      The name of the Logger.
     * @param marker          The Marker or null.
     * @param loggerFQCN      The fully qualified class name of the caller.
     * @param level           The logging Level.
     * @param message         The Message.
     * @param t               A Throwable or null.
     * @param mdc             The mapped diagnostic context.
     * @param ndc             the nested diagnostic context.
     * @param threadName      The name of the thread.
     * @param location        The locations of the caller.
     * @param timestampMillis The timestamp of the event.
     * @deprecated use {@link Log4jLogEvent.Builder} instead. This constructor will be removed in an upcoming
     * release.
     */
    @Deprecated
    public Log4jLogEvent(final String loggerName, final Marker marker, final String loggerFQCN,
                         final Level level, final Message message, final Throwable t,
                         final Map<String, String> mdc, final ThreadContext.ContextStack ndc,
                         final String threadName, final StackTraceElement location,
                         final long timestampMillis) {
        this(loggerName, marker, loggerFQCN, level, message, t, null, mdc, ndc, threadName,
                location, timestampMillis, nanoClock.nanoTime());
    }

    /**
     * Creates a new LogEvent.
     *
     * @param loggerName The name of the Logger.
     * @param marker     The Marker or null.
     * @param loggerFQCN The fully qualified class name of the caller.
     * @param level      The logging Level.
     * @param message    The Message.
     * @param thrown     A Throwable or null.
     * @param thrownProxy A ThrowableProxy or null.
     * @param mdc        The mapped diagnostic context.
     * @param ndc        the nested diagnostic context.
     * @param threadName The name of the thread.
     * @param location   The locations of the caller.
     * @param timestamp  The timestamp of the event.
     * @return a new LogEvent
     * @deprecated use {@link Log4jLogEvent.Builder} instead. This method will be removed in an upcoming release.
     */
    @Deprecated
    public static Log4jLogEvent createEvent(final String loggerName, final Marker marker,
                                             final String loggerFQCN, final Level level,
                                             final Message message, final Throwable thrown,
                                             final ThrowableProxy thrownProxy,
                                             final Map<String, String> mdc,
                                             final ThreadContext.ContextStack ndc,
                                             final String threadName,
                                             final StackTraceElement location,
                                             final long timestamp) {
        Builder b = new Builder()
                .setLoggerName(loggerName)
                .setMarker(marker)
                .setLoggerFqcn(loggerFQCN)
                .setLevel(level)
                .setMessage(message)
                .setThrown(thrown)
                .setThrownProxy(thrownProxy)
                .setContextMap(mdc)
                .setContextStack(ndc)
                .setThreadName(threadName)
                .setSource(location)
                .setTimeMillis(timestamp);
        return (Log4jLogEvent) b.build();
    }

    /**
     * Private constructor used by the Builder.
     *
     * @param builder the builder containing all event data
     */
    private Log4jLogEvent(final Builder builder) {
        this.loggerName = builder.loggerName;
        this.marker = builder.marker;
        this.loggerFqcn = builder.loggerFqcn;
        this.level = builder.level == null ? Level.OFF : builder.level;
        this.message = builder.message;
        this.thrown = builder.thrown;
        this.thrownProxy = builder.thrownProxy;
        this.contextMap = builder.contextMap == null ? ThreadContext.EMPTY_MAP : builder.contextMap;
        this.contextStack = builder.contextStack == null ? ThreadContext.EMPTY_STACK : builder.contextStack;
        this.timeMillis = builder.message instanceof TimestampMessage
                ? ((TimestampMessage) builder.message).getTimestamp()
                : builder.timeMillis;
        this.threadName = builder.threadName;
        this.source = builder.source;
        if (builder.message != null && builder.message instanceof LoggerNameAwareMessage) {
            ((LoggerNameAwareMessage) builder.message).setLoggerName(builder.loggerName);
        }
        this.nanoTime = builder.nanoTime;
    }

    private static Map<String, String> createMap(final List<Property> properties) {
        final Map<String, String> contextMap = ThreadContext.getImmutableContext();
        if (properties == null || properties.isEmpty()) {
            return contextMap;
        }
        final Map<String, String> map = new HashMap<>(contextMap);
        for (final Property prop : properties) {
            if (!map.containsKey(prop.getName())) {
                map.put(prop.getName(), prop.getValue());
            }
        }
        return Collections.unmodifiableMap(map);
    }

    /**
     * Returns the {@code NanoClock} to use for creating the nanoTime timestamp of log events.
     *
     * @return the {@code NanoClock} to use for creating the nanoTime timestamp of log events
     */
    public static NanoClock getNanoClock() {
        return nanoClock;
    }

    /**
     * Sets the {@code NanoClock} to use for creating the nanoTime timestamp of log events.
     * <p>
     * FOR INTERNAL USE. This method may be called with a different {@code NanoClock} implementation when the
     * configuration changes.
     *
     * @param nanoClock the {@code NanoClock} to use for creating the nanoTime timestamp of log events
     */
    public static void setNanoClock(NanoClock nanoClock) {
        Log4jLogEvent.nanoClock = Objects.requireNonNull(nanoClock, "NanoClock must be non-null");
        StatusLogger.getLogger().trace("Using {} for nanosecond timestamps.", nanoClock.getClass().getSimpleName());
    }

    /**
     * Returns a new fully initialized {@code Log4jLogEvent.Builder} containing a copy of all fields of this event.
     *
     * @return a new fully initialized builder.
     */
    public Builder asBuilder() {
        return new Builder(this);
    }

    @Override
    public Level getLevel() {
        return level;
    }

    @Override
    public String getLoggerName() {
        return loggerName;
    }

    @Override
    public Message getMessage() {
        return message;
    }

    @Override
    public String getThreadName() {
        if (threadName == null) {
            threadName = Thread.currentThread().getName();
        }
        return threadName;
    }

    @Override
    public long getTimeMillis() {
        return timeMillis;
    }

    @Override
    public Throwable getThrown() {
        return thrown;
    }

    @Override
    public ThrowableProxy getThrownProxy() {
        if (thrownProxy == null && thrown != null) {
            thrownProxy = new ThrowableProxy(thrown);
        }
        return thrownProxy;
    }

    @Override
    public Marker getMarker() {
        return marker;
    }

    @Override
    public String getLoggerFqcn() {
        return loggerFqcn;
    }

    @Override
    public Map<String, String> getContextMap() {
        return contextMap;
    }

    @Override
    public ThreadContext.ContextStack getContextStack() {
        return contextStack;
    }

    @Override
    public StackTraceElement getSource() {
        if (source != null) {
            return source;
        }
        if (loggerFqcn == null || !includeLocation) {
            return null;
        }
        source = calcLocation(loggerFqcn);
        return source;
    }

    public static StackTraceElement calcLocation(final String fqcnOfLogger) {
        if (fqcnOfLogger == null) {
            return null;
        }
        final StackTraceElement[] stackTrace = new Throwable().getStackTrace();
        StackTraceElement last = null;
        for (int i = stackTrace.length - 1; i > 0; i--) {
            final String className = stackTrace[i].getClassName();
            if (fqcnOfLogger.equals(className)) {
                return last;
            }
            last = stackTrace[i];
        }
        return null;
    }

    @Override
    public boolean isIncludeLocation() {
        return includeLocation;
    }

    @Override
    public void setIncludeLocation(final boolean includeLocation) {
        this.includeLocation = includeLocation;
    }

    @Override
    public boolean isEndOfBatch() {
        return endOfBatch;
    }

    @Override
    public void setEndOfBatch(final boolean endOfBatch) {
        this.endOfBatch = endOfBatch;
    }

    @Override
    public long getNanoTime() {
        return nanoTime;
    }

    /**
     * Creates a LogEventProxy that can be serialized.
     *
     * @return a LogEventProxy.
     */
    protected Object writeReplace() {
        getThrownProxy();
        return new LogEventProxy(this, this.includeLocation);
    }

    public static Serializable serialize(final Log4jLogEvent event,
                                         final boolean includeLocation) {
        event.getThrownProxy();
        return new LogEventProxy(event, includeLocation);
    }

    public static boolean canDeserialize(final Serializable event) {
        return event instanceof LogEventProxy;
    }

    public static Log4jLogEvent deserialize(final Serializable event) {
        Objects.requireNonNull(event, "Event cannot be null");
        if (event instanceof LogEventProxy) {
            final LogEventProxy proxy = (LogEventProxy) event;
            final Log4jLogEvent result = new Log4jLogEvent(proxy.loggerName, proxy.marker,
                    proxy.loggerFQCN, proxy.level, proxy.message,
                    proxy.thrown, proxy.thrownProxy, proxy.contextMap, proxy.contextStack, proxy.threadName,
                    proxy.source, proxy.timeMillis, proxy.nanoTime);
            result.setEndOfBatch(proxy.isEndOfBatch);
            result.setIncludeLocation(proxy.isLocationRequired);
            return result;
        }
        throw new IllegalArgumentException("Event is not a serialized LogEvent: " + event.toString());
    }

    private void readObject(final ObjectInputStream stream) throws InvalidObjectException {
        throw new InvalidObjectException("Proxy required");
    }

    @Override
    public String toString() {
        final StringBuilder sb = new StringBuilder();
        final String n = loggerName.isEmpty() ? LoggerConfig.ROOT : loggerName;
        sb.append("Logger=").append(n);
        sb.append(" Level=").append(level.name());
        sb.append(" Message=").append(message.getFormattedMessage());
        return sb.toString();
    }

    @Override
    public boolean equals(final Object o) {
        if (this == o) {
            return true;
        }
        if (o == null || getClass() != o.getClass()) {
            return false;
        }

        final Log4jLogEvent that = (Log4jLogEvent) o;

        if (endOfBatch != that.endOfBatch) {
            return false;
        }
        if (includeLocation != that.includeLocation) {
            return false;
        }
        if (timeMillis != that.timeMillis) {
            return false;
        }
        if (nanoTime != that.nanoTime) {
            return false;
        }
        if (loggerFqcn != null ? !loggerFqcn.equals(that.loggerFqcn) : that.loggerFqcn != null) {
            return false;
        }
        if (level != null ? !level.equals(that.level) : that.level != null) {
            return false;
        }
        if (source != null ? !source.equals(that.source) : that.source != null) {
            return false;
        }
        if (marker != null ? !marker.equals(that.marker) : that.marker != null) {
            return false;
        }
        if (contextMap != null ? !contextMap.equals(that.contextMap) : that.contextMap != null) {
            return false;
        }
        if (!message.equals(that.message)) {
            return false;
        }
        if (!loggerName.equals(that.loggerName)) {
            return false;
        }
        if (contextStack != null ? !contextStack.equals(that.contextStack) : that.contextStack != null) {
            return false;
        }
        if (threadName != null ? !threadName.equals(that.threadName) : that.threadName != null) {
            return false;
        }
        if (thrown != null ? !thrown.equals(that.thrown) : that.thrown != null) {
            return false;
        }
        return thrownProxy != null ? thrownProxy.equals(that.thrownProxy) : that.thrownProxy == null;
    }

    @Override
    public int hashCode() {
        int result = loggerFqcn != null ? loggerFqcn.hashCode() : 0;
        result = 31 * result + (marker != null ? marker.hashCode() : 0);
        result = 31 * result + (level != null ? level.hashCode() : 0);
        result = 31 * result + loggerName.hashCode();
        result = 31 * result + message.hashCode();
        result = 31 * result + (int) (timeMillis ^ (timeMillis >>> 32));
        result = 31 * result + (int) (nanoTime ^ (nanoTime >>> 32));
        result = 31 * result + (thrown != null ? thrown.hashCode() : 0);
        result = 31 * result + (thrownProxy != null ? thrownProxy.hashCode() : 0);
        result = 31 * result + (contextMap != null ? contextMap.hashCode() : 0);
        result = 31 * result + (contextStack != null ? contextStack.hashCode() : 0);
        result = 31 * result + (threadName != null ? threadName.hashCode() : 0);
        result = 31 * result + (source != null ? source.hashCode() : 0);
        result = 31 * result + (includeLocation ? 1 : 0);
        result = 31 * result + (endOfBatch ? 1 : 0);
        return result;
    }

    /**
     * Proxy pattern used to serialize the LogEvent.
     */
    private static class LogEventProxy implements Serializable {

        private static final long serialVersionUID = -7139032940312647146L;
        private final String loggerFQCN;
        private final Marker marker;
        private final Level level;
        private final String loggerName;
        private final Message message;
        private final long timeMillis;
        private final transient Throwable thrown;
        private final ThrowableProxy thrownProxy;
        private final Map<String, String> contextMap;
        private final ThreadContext.ContextStack contextStack;
        private final String threadName;
        private final StackTraceElement source;
        private final boolean isLocationRequired;
        private final boolean isEndOfBatch;
        /** @since Log4J 2.4 */
        private final transient long nanoTime;

        public LogEventProxy(final Log4jLogEvent event, final boolean includeLocation) {
            this.loggerFQCN = event.loggerFqcn;
            this.marker = event.marker;
            this.level = event.level;
            this.loggerName = event.loggerName;
            this.message = event.message;
            this.timeMillis = event.timeMillis;
            this.thrown = event.thrown;
            this.thrownProxy = event.thrownProxy;
            this.contextMap = event.contextMap;
            this.contextStack = event.contextStack;
            this.source = includeLocation ? event.getSource() : null;
            this.threadName = event.getThreadName();
            this.isLocationRequired = includeLocation;
            this.isEndOfBatch = event.endOfBatch;
            this.nanoTime = event.nanoTime;
        }

        /**
         * Returns a Log4jLogEvent using the data in the proxy.
         *
         * @return Log4jLogEvent.
         */
        protected Object readResolve() {
            final Log4jLogEvent result = new Log4jLogEvent(loggerName, marker, loggerFQCN, level, message,
                    thrown, thrownProxy, contextMap, contextStack, threadName, source, timeMillis, nanoTime);
            result.setEndOfBatch(isEndOfBatch);
            result.setIncludeLocation(isLocationRequired);
            return result;
        }
    }
}