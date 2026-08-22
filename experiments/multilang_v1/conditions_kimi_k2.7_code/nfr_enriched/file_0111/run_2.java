/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache license, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
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
                initializeFromRingBuffer((RingBufferLogEvent) other);
                return;
            }
            initializeFromLogEvent(other);
        }

        // Initializes this builder from a RingBufferLogEvent.
        private void initializeFromRingBuffer(final RingBufferLogEvent evt) {
            evt.initializeBuilder(this);
        }

        // Initializes this builder from a generic LogEvent.
        private void initializeFromLogEvent(final LogEvent other) {
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
            final Log4jLogEvent result = new Log4jLogEvent(loggerName, marker, loggerFqcn, level, message, thrown,
                    thrownProxy, contextMap, contextStack, threadName, source, timeMillis, nanoTime);
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

    public Log4jLogEvent() {
        this(Strings.EMPTY, null, Strings.EMPTY, null, null, (Throwable) null, null, null, null, null, null,
                CLOCK.currentTimeMillis(), nanoClock.nanoTime());
    }

    /**
    *
    * @deprecated use {@link Log4jLogEvent.Builder} instead. This constructor will be removed in an upcoming release.
    */
   @Deprecated
   public Log4jLogEvent(final long timestamp) {
       this(Strings.EMPTY, null, Strings.EMPTY, null, null, (Throwable) null, null, null, null, null, null,
               timestamp, nanoClock.nanoTime());
   }

   /**
    * Constructor.
    * @param loggerName The name of the Logger.
    * @param marker The Marker or null.
    * @param loggerFQCN The fully qualified class name of the caller.
    * @param level The logging Level.
    * @param message The Message.
    * @param t A Throwable or null.
    * @deprecated use {@link Log4jLogEvent.Builder} instead. This constructor will be removed in an upcoming release.
    */
   @Deprecated
   public Log4jLogEvent(final String loggerName, final Marker marker, final String loggerFQCN, final Level level,
                        final Message message, final Throwable t) {
       this(loggerName, marker, loggerFQCN, level, message, null, t);
   }

   /**
    * Constructor.
    * @param loggerName The name of the Logger.
    * @param marker The Marker or null.
    * @param loggerFQCN The fully qualified class name of the caller.
    * @param level The logging Level.
    * @param message The Message.
    * @param properties properties to add to the event.
    * @param t A Throwable or null.
    */
   // This constructor is called from LogEventFactories.
   public Log4jLogEvent(final String loggerName, final Marker marker, final String loggerFQCN, final Level level,
                        final Message message, final List<Property> properties, final Throwable t) {
       this(loggerName, marker, loggerFQCN, level, message, t, null,
           createMap(properties),
           ThreadContext.getDepth() == 0 ? null : ThreadContext.cloneStack(), // mutable copy
           null, // thread name
           null, // stack trace element
           // LOG4J2-628 use log4j.Clock for timestamps
           // LOG4J2-744 unless TimestampMessage already has one
           message instanceof TimestampMessage ? ((TimestampMessage) message).getTimestamp() :
               CLOCK.currentTimeMillis(),
           nanoClock.nanoTime());
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
    * @deprecated use {@link Log4jLogEvent.Builder} instead. This constructor will be removed in an upcoming release.
    */
   // Deprecated compatibility constructor kept for existing callers; the Builder is the preferred mechanism.
   @SuppressWarnings("squid:S107")
   @Deprecated
   public Log4jLogEvent(final String loggerName, final Marker marker, final String loggerFQCN, final Level level,
                        final Message message, final Throwable t, final Map<String, String> mdc,
                        final ThreadContext.ContextStack ndc, final String threadName,
                        final StackTraceElement location, final long timestampMillis) {
       this(loggerName, marker, loggerFQCN, level, message, t, null, mdc, ndc, threadName,
               location, timestampMillis, nanoClock.nanoTime());
   }

   /**
    * Create a new LogEvent.
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
    * @deprecated use {@link Log4jLogEvent.Builder} instead. This method will be removed in an upcoming release.
    */
    // Deprecated compatibility factory kept for existing callers; the Builder is the preferred mechanism.
    @SuppressWarnings("squid:S107")
    @Deprecated
    public static Log4jLogEvent createEvent(final String loggerName, final Marker marker, final String loggerFQCN,
                                            final Level level, final Message message, final Throwable thrown,
                                            final ThrowableProxy thrownProxy,
                                            final Map<String, String> mdc, final ThreadContext.ContextStack ndc,
                                            final String threadName, final StackTraceElement location,
                                            final long timestamp) {
        final Log4jLogEvent result = new Log4jLogEvent(loggerName, marker, loggerFQCN, level, message, thrown, 
                thrownProxy, mdc, ndc, threadName, location, timestamp, nanoClock.nanoTime());
        return result;
    }

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
    // Rich internal constructor used by all public construction paths.
    @SuppressWarnings("squid:S107")
    private Log4jLogEvent(final String loggerName, final Marker marker, final String loggerFQCN, final Level level,
            final Message message, final Throwable thrown, final ThrowableProxy thrownProxy,
            final Map<String, String> contextMap, final ThreadContext.ContextStack contextStack,
            final String threadName, final StackTraceElement source, final long timestampMillis, final long nanoTime) {
        this.loggerName = loggerName;
        this.marker = marker;
        this.loggerFqcn = loggerFQCN;
        this.level = resolveLevel(level);
        this.message = message;
        this.thrown = thrown;
        this.thrownProxy = thrownProxy;
        this.contextMap = resolveContextMap(contextMap);
        this.contextStack = resolveContextStack(contextStack);
        this.timeMillis = resolveTimeMillis(message, timestampMillis);
        this.threadName = threadName;
        this.source = source;
        applyLoggerNameToMessage(message, loggerName);
        this.nanoTime = nanoTime;
    }

    // Returns the effective level, defaulting to OFF when none is supplied.
    private static Level resolveLevel(final Level level) {
        return level == null ? Level.OFF : level; // LOG4J2-462, LOG4J2-465
    }

    // Returns a non-null context map, using the empty map when none is supplied.
    private static Map<String, String> resolveContextMap(final Map<String, String> contextMap) {
        return contextMap == null ? ThreadContext.EMPTY_MAP : contextMap;
    }

    // Returns a non-null context stack, using the empty stack when none is supplied.
    private static ThreadContext.ContextStack resolveContextStack(final ThreadContext.ContextStack contextStack) {
        return contextStack == null ? ThreadContext.EMPTY_STACK : contextStack;
    }

    // Resolves the event timestamp, preferring a timestamp carried by the message.
    private static long resolveTimeMillis(final Message message, final long timestampMillis) {
        return message instanceof TimestampMessage
                ? ((TimestampMessage) message).getTimestamp()
                : timestampMillis;
    }

    // Propagates the logger name to messages that are aware of their logger.
    private static void applyLoggerNameToMessage(final Message message, final String loggerName) {
        if (message != null && message instanceof LoggerNameAwareMessage) {
            ((LoggerNameAwareMessage) message).setLoggerName(loggerName);
        }
    }

    private static Map<String, String> createMap(final List<Property> properties) {
        final Map<String, String> contextMap = ThreadContext.getImmutableContext();
        if (properties == null || properties.isEmpty()) {
            return contextMap; // may be ThreadContext.EMPTY_MAP but not null
        }
        final Map<String, String> map = new HashMap<>(contextMap);

        addProperties(map, properties);
        return Collections.unmodifiableMap(map);
    }

    // Adds properties to the map when their keys are not already present.
    private static void addProperties(final Map<String, String> map, final List<Property> properties) {
        for (final Property prop : properties) {
            if (!map.containsKey(prop.getName())) {
                map.put(prop.getName(), prop.getValue());
            }
        }
    }
    
    /**
     * Returns the {@code NanoClock} to use for creating the nanoTime timestamp of log events.
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
     * @return a new fully initialized builder.
     */
    public Builder asBuilder() {
        return new Builder(this);
    }

    /**
     * Returns the logging Level.
     * @return the Level associated with this event.
     */
    @Override
    public Level getLevel() {
        return level;
    }

    /**
     * Returns the name of the Logger used to generate the event.
     * @return The Logger name.
     */
    @Override
    public String getLoggerName() {
        return loggerName;
    }

    /**
     * Returns the Message associated with the event.
     * @return The Message.
     */
    @Override
    public Message getMessage() {
        return message;
    }

    /**
     * Returns the name of the Thread on which the event was generated.
     * @return The name of the Thread.
     */
    @Override
    public String getThreadName() {
        if (threadName == null) {
            threadName = Thread.currentThread().getName();
        }
        return threadName;
    }

    /**
     * Returns the time in milliseconds from the epoch when the event occurred.
     * @return The time the event occurred.
     */
    @Override
    public long getTimeMillis() {
        return timeMillis;
    }

    /**
     * Returns the Throwable associated with the event, or null.
     * @return The Throwable associated with the event.
     */
    @Override
    public Throwable getThrown() {
        return thrown;
    }

    /**
     * Returns the ThrowableProxy associated with the event, or null.
     * @return The ThrowableProxy associated with the event.
     */
    @Override
    public ThrowableProxy getThrownProxy() {
        if (thrownProxy == null && thrown != null) {
            thrownProxy = new ThrowableProxy(thrown);
        }
        return thrownProxy;
    }


    /**
     * Returns the Marker associated with the event, or null.
     * @return the Marker associated with the event.
     */
    @Override
    public Marker getMarker() {
        return marker;
    }

    /**
     * The fully qualified class name of the class that was called by the caller.
     * @return the fully qualified class name of the class that is performing logging.
     */
    @Override
    public String getLoggerFqcn() {
        return loggerFqcn;
    }

    /**
     * Returns the immutable copy of the ThreadContext Map.
     * @return The context Map.
     */
    @Override
    public Map<String, String> getContextMap() {
        return contextMap;
    }

    /**
     * Returns an immutable copy of the ThreadContext stack.
     * @return The context Stack.
     */
    @Override
    public ThreadContext.ContextStack getContextStack() {
        return contextStack;
    }

    /**
     * Returns the StackTraceElement for the caller. This will be the entry that occurs right
     * before the first occurrence of FQCN as a class name.
     * @return the StackTraceElement for the caller.
     */
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
        // LOG4J2-1029 new Throwable().getStackTrace is faster than Thread.currentThread().getStackTrace().
        final StackTraceElement[] stackTrace = new Throwable().getStackTrace();
        StackTraceElement last = null;
        for (int i = stackTrace.length - 1; i > 0; i--) {
            if (isLoggerClass(stackTrace[i], fqcnOfLogger)) {
                return last;
            }
            last = stackTrace[i];
        }
        return null;
    }

    // Determines whether the given stack trace element represents the logger class.
    private static boolean isLoggerClass(final StackTraceElement element, final String fqcnOfLogger) {
        return fqcnOfLogger.equals(element.getClassName());
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
     * @return a LogEventProxy.
     */
    protected Object writeReplace() {
        getThrownProxy(); // ensure ThrowableProxy is initialized
        return new LogEventProxy(this, this.includeLocation);
    }

    public static Serializable serialize(final Log4jLogEvent event,
            final boolean includeLocation) {
        event.getThrownProxy(); // ensure ThrowableProxy is initialized
        return new LogEventProxy(event, includeLocation);
    }

    public static boolean canDeserialize(final Serializable event) {
        return event instanceof LogEventProxy;
    }

    public static Log4jLogEvent deserialize(final Serializable event) {
        Objects.requireNonNull(event, "Event cannot be null");
        if (event instanceof LogEventProxy) {
            return createEventFromProxy((LogEventProxy) event);
        }
        throw new IllegalArgumentException("Event is not a serialized LogEvent: " + event.toString());
    }

    // Reconstructs a Log4jLogEvent from a serialized proxy.
    private static Log4jLogEvent createEventFromProxy(final LogEventProxy proxy) {
        final Log4jLogEvent result = new Log4jLogEvent(proxy.loggerName, proxy.marker,
                proxy.loggerFQCN, proxy.level, proxy.message,
                proxy.thrown, proxy.thrownProxy, proxy.contextMap, proxy.contextStack, proxy.threadName,
                proxy.source, proxy.timeMillis, proxy.nanoTime);
        result.setEndOfBatch(proxy.isEndOfBatch);
        result.setIncludeLocation(proxy.isLocationRequired);
        return result;
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

        return arePrimitivesEqual(that)
                && areLoggerFieldsEqual(that)
                && areContextFieldsEqual(that)
                && areMessageAndNameEqual(that)
                && areThrowableFieldsEqual(that);
    }

    // Compares the primitive and boolean fields of two events.
    private boolean arePrimitivesEqual(final Log4jLogEvent that) {
        return endOfBatch == that.endOfBatch
                && includeLocation == that.includeLocation
                && timeMillis == that.timeMillis
                && nanoTime == that.nanoTime;
    }

    // Compares logger-related reference fields of two events.
    private boolean areLoggerFieldsEqual(final Log4jLogEvent that) {
        return Objects.equals(loggerFqcn, that.loggerFqcn)
                && Objects.equals(level, that.level)
                && Objects.equals(source, that.source)
                && Objects.equals(marker, that.marker);
    }

    // Compares context-related reference fields of two events.
    private boolean areContextFieldsEqual(final Log4jLogEvent that) {
        return Objects.equals(contextMap, that.contextMap)
                && Objects.equals(contextStack, that.contextStack)
                && Objects.equals(threadName, that.threadName);
    }

    // Compares the message and logger name fields of two events.
    private boolean areMessageAndNameEqual(final Log4jLogEvent that) {
        return message.equals(that.message)
                && loggerName.equals(that.loggerName);
    }

    // Compares the throwable fields of two events.
    private boolean areThrowableFieldsEqual(final Log4jLogEvent that) {
        return Objects.equals(thrown, that.thrown)
                && Objects.equals(thrownProxy, that.thrownProxy);
    }

    @Override
    public int hashCode() {
        // Check:OFF: MagicNumber
        int result = combineWithNullable(0, loggerFqcn);
        result = combineWithNullable(result, marker);
        result = combineWithNullable(result, level);
        result = 31 * result + loggerName.hashCode();
        result = 31 * result + message.hashCode();
        result = combineWithLong(result, timeMillis);
        result = combineWithLong(result, nanoTime);
        result = combineWithNullable(result, thrown);
        result = combineWithNullable(result, thrownProxy);
        result = combineWithNullable(result, contextMap);
        result = combineWithNullable(result, contextStack);
        result = combineWithNullable(result, threadName);
        result = combineWithNullable(result, source);
        result = combineWithBoolean(result, includeLocation);
        result = combineWithBoolean(result, endOfBatch);
        // Check:ON: MagicNumber
        return result;
    }

    // Combines a running hash with the hash code of a possibly-null field.
    private static int combineWithNullable(final int result, final Object field) {
        return 31 * result + (field != null ? field.hashCode() : 0);
    }

    // Combines a running hash with the hash code of a long value.
    private static int combineWithLong(final int result, final long value) {
        return 31 * result + (int) (value ^ (value >>> 32));
    }

    // Combines a running hash with the hash code of a boolean value.
    private static int combineWithBoolean(final int result, final boolean value) {
        return 31 * result + (value ? 1 : 0);
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
         * @return Log4jLogEvent.
         */
        protected Object readResolve() {
            final Log4jLogEvent result = new Log4jLogEvent(loggerName, marker, loggerFQCN, level, message, thrown,
                    thrownProxy, contextMap, contextStack, threadName, source, timeMillis, nanoTime);
            result.setEndOfBatch(isEndOfBatch);
            result.setIncludeLocation(isLocationRequired);
            return result;
        }
    }
}