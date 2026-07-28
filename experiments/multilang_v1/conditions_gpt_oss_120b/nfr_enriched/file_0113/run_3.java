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
 * See the license for the specific governing permissions and limitations
 * under the License.
 */
package org.apache.logging.log4j.core.lookup;

import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Properties;

import org.apache.logging.log4j.core.LogEvent;
import org.apache.logging.log4j.util.Strings;

/**
 * Substitutes variables within a string by values.
 * <p>
 * This class takes a piece of text and substitutes all the variables within it.
 * The default definition of a variable is <code>${variableName}</code>.
 * The prefix and suffix can be changed via constructors and set methods.
 * </p>
 * <p>
 * Variable values are typically resolved from a map, but could also be resolved
 * from system properties, or by supplying a custom variable resolver.
 * </p>
 * <p>
 * The simplest example is to use this class to replace Java System properties. For example:
 * </p>
 * <pre>
 * StrSubstitutor.replaceSystemProperties(
 *      "You are running with java.version = ${java.version} and os.name = ${os.name}.");
 * </pre>
 * <p>
 * Typical usage of this class follows the following pattern: First an instance is created
 * and initialized with the map that contains the values for the available variables.
 * If a prefix and/or suffix for variables should be used other than the default ones,
 * the appropriate settings can be performed. After that the <code>replace()</code>
 * method can be called passing in the source text for interpolation. In the returned
 * text all variable references (as long as their values are known) will be resolved.
 * The following example demonstrates this:
 * </p>
 * <pre>
 * Map valuesMap = HashMap();
 * valuesMap.put(&quot;animal&quot;, &quot;quick brown fox&quot;);
 * valuesMap.put(&quot;target&quot;, &quot;lazy dog&quot;);
 * String templateString = &quot;The ${animal} jumped over the ${target}.&quot;;
 * StrSubstitutor sub = new StrSubstitutor(valuesMap);
 * String resolvedString = sub.replace(templateString);
 * </pre>
 * <p>yielding:</p>
 * <pre>
 *      The quick brown fox jumped over the lazy dog.
 * </pre>
 * <p>
 * Also, this class allows to set a default value for unresolved variables.
 * The default value for a variable can be appended to the variable name after the variable
 * default value delimiter. The default value of the variable default value delimiter is ':-',
 * as in bash and other *nix shells, as those are arguably where the default ${} delimiter set originated.
 * The variable default value delimiter can be manually set by calling {@link #setValueDelimiterMatcher(StrMatcher)},
 * {@link #setValueDelimiter(char)} or {@link #setValueDelimiter(String)}.
 * The following shows an example with variable default value settings:
 * </p>
 * <pre>
 * Map valuesMap = HashMap();
 * valuesMap.put(&quot;animal&quot;, &quot;quick brown fox&quot;);
 * valuesMap.put(&quot;target&quot;, &quot;lazy dog&quot;);
 * String templateString = &quot;The ${animal} jumped over the ${target}. ${undefined.number:-1234567890}.&quot;;
 * StrSubstitutor sub = new StrSubstitutor(valuesMap);
 * String resolvedString = sub.replace(templateString);
 * </pre>
 * <p>yielding:</p>
 * <pre>
 *      The quick brown fox jumped over the lazy dog. 1234567890.
 * </pre>
 * <p>
 * In addition to this usage pattern there are some static convenience methods that
 * cover the most common use cases. These methods can be used without the need of
 * manually creating an instance. However if multiple replace operations are to be
 * performed, creating and reusing an instance of this class will be more efficient.
 * </p>
 * <p>
 * Variable replacement works in a recursive way. Thus, if a variable value contains
 * a variable then that variable will also be replaced. Cyclic replacements are
 * detected and will cause an exception to be thrown.
 * </p>
 * <p>
 * Sometimes the interpolation's result must contain a variable prefix. As an example
 * take the following source text:
 * </p>
 * <pre>
 *   The variable ${${name}} must be used.
 * </pre>
 * <p>
 * Here only the variable's name referred to in the text should be replaced resulting
 * in the text (assuming that the value of the <code>name</code> variable is <code>x</code>):
 * </p>
 * <pre>
 *   The variable ${x} must be used.
 * </pre>
 * <p>
 * To achieve this effect there are two possibilities: Either set a different prefix
 * and suffix for variables which do not conflict with the result text you want to
 * produce. The other possibility is to use the escape character, by default '$'.
 * If this character is placed before a variable reference, this reference is ignored
 * and won't be replaced. For example:
 * </p>
 * <pre>
 *   The variable $${${name}} must be used.
 * </pre>
 * <p>
 * In some complex scenarios you might even want to perform substitution in the
 * names of variables, for instance
 * </p>
 * <pre>
 * ${jre-${java.specification.version}}
 * </pre>
 * <p>
 * <code>StrSubstitutor</code> supports this recursive substitution in variable
 * names, but it has to be enabled explicitly by setting the
 * {@link #setEnableSubstitutionInVariables(boolean) enableSubstitutionInVariables}
 * property to <b>true</b>.
 * </p>
 */
public class StrSubstitutor {

    /**
     * Constant for the default escape character.
     */
    public static final char DEFAULT_ESCAPE = '$';
    
    /**
     * Constant for the default variable prefix.
     */
    public static final StrMatcher DEFAULT_PREFIX = StrMatcher.stringMatcher(DEFAULT_ESCAPE + "{");
    
    /**
     * Constant for the default variable suffix.
     */
    public static final StrMatcher DEFAULT_SUFFIX = StrMatcher.stringMatcher("}");
    
    /**
     * Constant for the default value delimiter of a variable.
     */
    public static final StrMatcher DEFAULT_VALUE_DELIMITER = StrMatcher.stringMatcher(":-");

    private static final int BUF_SIZE = 256;

    /**
     * Stores the escape character.
     */
    private char escapeChar;
    /**
     * Stores the variable prefix.
     */
    private StrMatcher prefixMatcher;
    /**
     * Stores the variable suffix.
     */
    private StrMatcher suffixMatcher;
    /**
     * Stores the default variable value delimiter
     */
    private StrMatcher valueDelimiterMatcher;
    /**
     * Variable resolution is delegated to an implementer of VariableResolver.
     */
    private StrLookup variableResolver;
    /**
     * The flag whether substitution in variable names is enabled.
     */
    private boolean enableSubstitutionInVariables;

    //-----------------------------------------------------------------------
    /**
     * Creates a new instance with defaults for variable prefix and suffix
     * and the escaping character.
     */
    public StrSubstitutor() {
        this(null, DEFAULT_PREFIX, DEFAULT_SUFFIX, DEFAULT_ESCAPE);
    }
    /**
     * Creates a new instance and initializes it. Uses defaults for variable
     * prefix and suffix and the escaping character.
     *
     * @param valueMap  the map with the variables' values, may be null
     */
    public StrSubstitutor(final Map<String, String> valueMap) {
        this(new MapLookup(valueMap), DEFAULT_PREFIX, DEFAULT_SUFFIX, DEFAULT_ESCAPE);
    }

    /**
     * Creates a new instance and initializes it. Uses a default escaping character.
     *
     * @param valueMap  the map with the variables' values, may be null
     * @param prefix  the prefix for variables, not null
     * @param suffix  the suffix for variables, not null
     * @throws IllegalArgumentException if the prefix or suffix is null
     */
    public StrSubstitutor(final Map<String, String> valueMap, final String prefix, final String suffix) {
        this(new MapLookup(valueMap), prefix, suffix, DEFAULT_ESCAPE);
    }

    /**
     * Creates a new instance and initializes it.
     *
     * @param valueMap  the map with the variables' values, may be null
     * @param prefix  the prefix for variables, not null
     * @param suffix  the suffix for variables, not null
     * @param escape  the escape character
     * @throws IllegalArgumentException if the prefix or suffix is null
     */
    public StrSubstitutor(final Map<String, String> valueMap, final String prefix, final String suffix,
                          final char escape) {
        this(new MapLookup(valueMap), prefix, suffix, escape);
    }

    /**
     * Creates a new instance and initializes it.
     *
     * @param valueMap  the map with the variables' values, may be null
     * @param prefix  the prefix for variables, not null
     * @param suffix  the suffix for variables, not null
     * @param escape  the escape character
     * @param valueDelimiter  the variable default value delimiter, may be null
     * @throws IllegalArgumentException if the prefix or suffix is null
     */
    public StrSubstitutor(final Map<String, String> valueMap, final String prefix, final String suffix,
                              final char escape, final String valueDelimiter) {
        this(new MapLookup(valueMap), prefix, suffix, escape, valueDelimiter);
    }

    /**
     * Creates a new instance and initialized it.
     *
     * @param variableResolver  the variable resolver, may be null
     */
    public StrSubstitutor(final StrLookup variableResolver) {
        this(variableResolver, DEFAULT_PREFIX, DEFAULT_SUFFIX, DEFAULT_ESCAPE);
    }

    /**
     * Creates a new instance and initialized it.
     *
     * @param variableResolver  the variable resolver, may be null
     * @param prefix  the prefix for variables, not null
     * @param suffix  the suffix for variables, not null
     * @param escape  the escape character
     * @throws IllegalArgumentException if the prefix or suffix is null
     */
    public StrSubstitutor(final StrLookup variableResolver, final String prefix, final String suffix,
                          final char escape) {
        this.setVariableResolver(variableResolver);
        this.setVariablePrefix(prefix);
        this.setVariableSuffix(suffix);
        this.setEscapeChar(escape);
    }

    /**
     * Creates a new instance and initialized it.
     *
     * @param variableResolver  the variable resolver, may be null
     * @param prefix  the prefix for variables, not null
     * @param suffix  the suffix for variables, not null
     * @param escape  the escape character
     * @param valueDelimiter  the variable default value delimiter string, may be null
     * @throws IllegalArgumentException if the prefix or suffix is null
     */
    public StrSubstitutor(final StrLookup variableResolver, final String prefix, final String suffix, final char escape, final String valueDelimiter) {
        this.setVariableResolver(variableResolver);
        this.setVariablePrefix(prefix);
        this.setVariableSuffix(suffix);
        this.setEscapeChar(escape);
        this.setValueDelimiter(valueDelimiter);
    }

    /**
     * Creates a new instance and initialized it.
     *
     * @param variableResolver  the variable resolver, may be null
     * @param prefixMatcher  the prefix for variables, not null
     * @param suffixMatcher  the suffix for variables, not null
     * @param escape  the escape character
     * @throws IllegalArgumentException if the prefix or suffix is null
     */
    public StrSubstitutor(final StrLookup variableResolver, final StrMatcher prefixMatcher,
                          final StrMatcher suffixMatcher,
                          final char escape) {
        this(variableResolver, prefixMatcher, suffixMatcher, escape, DEFAULT_VALUE_DELIMITER);
    }

    /**
     * Creates a new instance and initialized it.
     *
     * @param variableResolver  the variable resolver, may be null
     * @param prefixMatcher  the prefix for variables, not null
     * @param suffixMatcher  the suffix for variables, not null
     * @param escape  the escape character
     * @param valueDelimiterMatcher  the variable default value delimiter matcher, may be null
     * @throws IllegalArgumentException if the prefix or suffix is null
     */
    public StrSubstitutor(
            final StrLookup variableResolver, final StrMatcher prefixMatcher, final StrMatcher suffixMatcher, final char escape, final StrMatcher valueDelimiterMatcher) {
        this.setVariableResolver(variableResolver);
        this.setVariablePrefixMatcher(prefixMatcher);
        this.setVariableSuffixMatcher(suffixMatcher);
        this.setEscapeChar(escape);
        this.setValueDelimiterMatcher(valueDelimiterMatcher);
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables in the given source object with
     * their matching values from the map.
     *
     * @param source  the source text containing the variables to substitute, null returns null
     * @param valueMap  the map with the values, may be null
     * @return the result of the replace operation
     */
    public static String replace(final Object source, final Map<String, String> valueMap) {
        return new StrSubstitutor(valueMap).replace(source);
    }

    /**
     * Replaces all the occurrences of variables in the given source object with
     * their matching values from the map. This method allows to specify a
     * custom variable prefix and suffix
     *
     * @param source  the source text containing the variables to substitute, null returns null
     * @param valueMap  the map with the values, may be null
     * @param prefix  the prefix of variables, not null
     * @param suffix  the suffix of variables, not null
     * @return the result of the replace operation
     * @throws IllegalArgumentException if the prefix or suffix is null
     */
    public static String replace(final Object source, final Map<String, String> valueMap, final String prefix,
                                 final String suffix) {
        return new StrSubstitutor(valueMap, prefix, suffix).replace(source);
    }

    /**
     * Replaces all the occurrences of variables in the given source object with their matching
     * values from the properties.
     *
     * @param source the source text containing the variables to substitute, null returns null
     * @param valueProperties the properties with values, may be null
     * @return the result of the replace operation
     */
    public static String replace(final Object source, final Properties valueProperties) {
        if (valueProperties == null) {
            return source.toString();
        }
        final Map<String, String> valueMap = new HashMap<>();
        final Enumeration<?> propNames = valueProperties.propertyNames();
        while (propNames.hasMoreElements()) {
            final String propName = (String) propNames.nextElement();
            final String propValue = valueProperties.getProperty(propName);
            valueMap.put(propName, propValue);
        }
        return StrSubstitutor.replace(source, valueMap);
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables with their matching values
     * from the resolver using the given source string as a template.
     *
     * @param source  the string to replace in, null returns null
     * @return the result of the replace operation
     */
    public String replace(final String source) {
        return replace(null, source);
    }
    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables with their matching values
     * from the resolver using the given source string as a template.
     *
     * @param event The current LogEvent if there is one.
     * @param source  the string to replace in, null returns null
     * @return the result of the replace operation
     */
    public String replace(final LogEvent event, final String source) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(source);
        if (!substitute(event, buf, 0, source.length())) {
            return source;
        }
        return buf.toString();
    }

    /**
     * Replaces all the occurrences of variables with their matching values
     * from the resolver using the given source string as a template.
     * <p>
     * Only the specified portion of the string will be processed.
     * The rest of the string is not processed, and is not returned.
     * </p>
     *
     * @param source  the string to replace in, null returns null
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the array to be processed, must be valid
     * @return the result of the replace operation
     */
    public String replace(final String source, final int offset, final int length) {
        return replace(null, source, offset, length);
    }

    /**
     * Replaces all the occurrences of variables with their matching values
     * from the resolver using the given source string as a template.
     * <p>
     * Only the specified portion of the string will be processed.
     * The rest of the string is not processed, and is not returned.
     * </p>
     *
     * @param event the current LogEvent, if one exists.
     * @param source  the string to replace in, null returns null
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the array to be processed, must be valid
     * @return the result of the replace operation
     */
    public String replace(final LogEvent event, final String source, final int offset, final int length) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
        if (!substitute(event, buf, 0, length)) {
            return source.substring(offset, offset + length);
        }
        return buf.toString();
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables with their matching values
     * from the resolver using the given source array as a template.
     * The array is not altered by this method.
     *
     * @param source  the character array to replace in, not altered, null returns null
     * @return the result of the replace operation
     */
    public String replace(final char[] source) {
        return replace(null, source);
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables with their matching values
     * from the resolver using the given source array as a template.
     * The array is not altered by this method.
     *
     * @param event the current LogEvent, if one exists.
     * @param source  the character array to replace in, not altered, null returns null
     * @return the result of the replace operation
     */
    public String replace(final LogEvent event, final char[] source) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(source.length).append(source);
        substitute(event, buf, 0, source.length);
        return buf.toString();
    }

    /**
     * Replaces all the occurrences of variables with their matching values
     * from the resolver using the given source array as a template.
     * The array is not altered by this method.
     * <p>
     * Only the specified portion of the array will be processed.
     * The rest of the array is not processed, and is not returned.
     * </p>
     *
     * @param source  the character array to replace in, not altered, null returns null
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the array to be processed, must be valid
     * @return the result of the replace operation
     */
    public String replace(final char[] source, final int offset, final int length) {
        return replace(null, source, offset, length);
    }

    /**
     * Replaces all the occurrences of variables with their matching values
     * from the resolver using the given source array as a template.
     * The array is not altered by this method.
     * <p>
     * Only the specified portion of the array will be processed.
     * The rest of the array is not processed, and is not returned.
     * </p>
     *
     * @param event the current LogEvent, if one exists.
     * @param source  the character array to replace in, not altered, null returns null
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the array to be processed, must be valid
     * @return the result of the replace operation
     */
    public String replace(final LogEvent event, final char[] source, final int offset, final int length) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
        substitute(event, buf, 0, length);
        return buf.toString();
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables in the given source buffer as a template.
     *
     * @param source  the buffer to replace in, not changed, null returns null
     * @return the result of the replace operation
     */
    public String replace(final StringBuffer source) {
        return replace(null, source);
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables in the given source buffer as a template.
     *
     * @param event the current LogEvent, if one exists.
     * @param source  the buffer to replace in, not changed, null returns null
     * @return the result of the replace operation
     */
    public String replace(final LogEvent event, final StringBuffer source) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(source.length()).append(source);
        substitute(event, buf, 0, buf.length());
        return buf.toString();
    }

    /**
     * Replaces all the occurrences of variables in the given source buffer as a template.
     *
     * @param source  the buffer to replace in, not changed, null returns null
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the array to be processed, must be valid
     * @return the result of the replace operation
     */
    public String replace(final StringBuffer source, final int offset, final int length) {
        return replace(null, source, offset, length);
    }

    /**
     * Replaces all the occurrences of variables in the given source buffer as a template.
     *
     * @param event the current LogEvent, if one exists.
     * @param source  the buffer to replace in, not changed, null returns null
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the array to be processed, must be valid
     * @return the result of the replace operation
     */
    public String replace(final LogEvent event, final StringBuffer source, final int offset, final int length) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
        substitute(event, buf, 0, length);
        return buf.toString();
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables in the given source builder as a template.
     *
     * @param source  the builder to replace in, not changed, null returns null
     * @return the result of the replace operation
     */
    public String replace(final StringBuilder source) {
        return replace(null, source);
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables in the given source builder as a template.
     *
     * @param event The LogEvent.
     * @param source  the builder to replace in, not changed, null returns null.
     * @return the result of the replace operation.
     */
    public String replace(final LogEvent event, final StringBuilder source) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(source.length()).append(source);
        substitute(event, buf, 0, buf.length());
        return buf.toString();
    }
    /**
     * Replaces all the occurrences of variables in the given source builder as a template.
     *
     * @param source  the builder to replace in, not changed, null returns null
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the array to be processed, must be valid
     * @return the result of the replace operation
     */
    public String replace(final StringBuilder source, final int offset, final int length) {
        return replace(null, source, offset, length);
    }

    /**
     * Replaces all the occurrences of variables in the given source builder as a template.
     *
     * @param event the current LogEvent, if one exists.
     * @param source  the builder to replace in, not changed, null returns null
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the array to be processed, must be valid
     * @return the result of the replace operation
     */
    public String replace(final LogEvent event, final StringBuilder source, final int offset, final int length) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
        substitute(event, buf, 0, length);
        return buf.toString();
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables in the given source object with
     * their matching values from the resolver. The input source object is
     * converted to a string using <code>toString</code> and is not altered.
     *
     * @param source  the source to replace in, null returns null
     * @return the result of the replace operation
     */
    public String replace(final Object source) {
        return replace(null, source);
    }
    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables in the given source object with
     * their matching values from the resolver. The input source object is
     * converted to a string using <code>toString</code> and is not altered.
     *
     * @param event the current LogEvent, if one exists.
     * @param source  the source to replace in, null returns null
     * @return the result of the replace operation
     */
    public String replace(final LogEvent event, final Object source) {
        if (source == null) {
            return null;
        }
        final StringBuilder buf = new StringBuilder().append(source);
        substitute(event, buf, 0, buf.length());
        return buf.toString();
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables within the given source buffer
     * with their matching values from the resolver.
     * The buffer is updated with the result.
     *
     * @param source  the buffer to replace in, updated, null returns zero
     * @return true if altered
     */
    public boolean replaceIn(final StringBuffer source) {
        if (source == null) {
            return false;
        }
        return replaceIn(source, 0, source.length());
    }

    /**
     * Replaces all the occurrences of variables within the given source buffer
     * with their matching values from the resolver.
     * The buffer is updated with the result.
     * <p>
     * Only the specified portion of the buffer will be processed.
     * The rest of the buffer is not processed, but it is not deleted.
     * </p>
     *
     * @param source  the buffer to replace in, updated, null returns zero
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the buffer to be processed, must be valid
     * @return true if altered
     */
    public boolean replaceIn(final StringBuffer source, final int offset, final int length) {
        return replaceIn(null, source, offset, length);
    }

    /**
     * Replaces all the occurrences of variables within the given source buffer
     * with their matching values from the resolver.
     * The buffer is updated with the result.
     * <p>
     * Only the specified portion of the buffer will be processed.
     * The rest of the buffer is not processed, but it is not deleted.
     * </p>
     *
     * @param event the current LogEvent, if one exists.
     * @param source  the buffer to replace in, updated, null returns zero
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the buffer to be processed, must be valid
     * @return true if altered
     */
    public boolean replaceIn(final LogEvent event, final StringBuffer source, final int offset, final int length) {
        if (source == null) {
            return false;
        }
        final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
        if (!substitute(event, buf, 0, length)) {
            return false;
        }
        source.replace(offset, offset + length, buf.toString());
        return true;
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables within the given source
     * builder with their matching values from the resolver.
     *
     * @param source  the builder to replace in, updated, null returns zero
     * @return true if altered
     */
    public boolean replaceIn(final StringBuilder source) {
        return replaceIn(null, source);
    }

    //-----------------------------------------------------------------------
    /**
     * Replaces all the occurrences of variables within the given source
     * builder with their matching values from the resolver.
     *
     * @param event the current LogEvent, if one exists.
     * @param source  the builder to replace in, updated, null returns zero
     * @return true if altered
     */
    public boolean replaceIn(final LogEvent event, final StringBuilder source) {
        if (source == null) {
            return false;
        }
        return substitute(event, source, 0, source.length());
    }
    /**
     * Replaces all the occurrences of variables within the given source
     * builder with their matching values from the resolver.
     * <p>
     * Only the specified portion of the builder will be processed.
     * The rest of the builder is not processed, but it is not deleted.
     * </p>
     *
     * @param source  the builder to replace in, null returns zero
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the builder to be processed, must be valid
     * @return true if altered
     */
    public boolean replaceIn(final StringBuilder source, final int offset, final int length) {
        return replaceIn(null, source, offset, length);
    }

    /**
     * Replaces all the occurrences of variables within the given source
     * builder with their matching values from the resolver.
     * <p>
     * Only the specified portion of the builder will be processed.
     * The rest of the builder is not processed, but it is not deleted.
     * </p>
     *
     * @param event   the current LogEvent, if one is present.
     * @param source  the builder to replace in, null returns zero
     * @param offset  the start offset within the array, must be valid
     * @param length  the length within the builder to be processed, must be valid
     * @return true if altered
     */
    public boolean replaceIn(final LogEvent event, final StringBuilder source, final int offset, final int length) {
        if (source == null) {
            return false;
        }
        return substitute(event, source, offset, length);
    }

    //-----------------------------------------------------------------------
    /**
     * Internal method that substitutes the variables.
     *
     * @param event The current LogEvent, if there is one.
     * @param buf  the string builder to substitute into, not null
     * @param offset  the start offset within the builder, must be valid
     * @param length  the length within the builder to be processed, must be valid
     * @return true if altered
     */
    protected boolean substitute(final LogEvent event, final StringBuilder buf, final int offset, final int length) {
        return substitute(event, buf, offset, length, null) > 0;
    }

    /**
     * Recursive handler for multiple levels of interpolation.
     *
     * @param event The current LogEvent, if there is one.
     * @param buf  the string builder to substitute into, not null
     * @param offset  the start offset within the builder, must be valid
     * @param length  the length within the builder to be processed, must be valid
     * @param priorVariables  the stack keeping track of the replaced variables, may be null
     * @return the length change that occurs, unless priorVariables is null when the int
     *  represents a boolean flag as to whether any change occurred.
     */
    private int substitute(final LogEvent event, final StringBuilder buf, final int offset, final int length,
                           List<String> priorVariables) {
        boolean top = priorVariables == null;
        int lengthChange = processSubstitution(event, buf, offset, length, priorVariables);
        if (top) {
            return lengthChange != 0 ? 1 : 0;
        }
        return lengthChange;
    }

    /**
     * Core substitution loop extracted to reduce cognitive complexity.
     *
     * @param event current LogEvent, may be null
     * @param buf buffer to operate on
     * @param offset start offset
     * @param length length to process
     * @param priorVariables variable stack, may be null
     * @return total length change
     */
    private int processSubstitution(final LogEvent event, final StringBuilder buf, final int offset, final int length,
                                    List<String> priorVariables) {
        int lengthChange = 0;
        char[] chars = getChars(buf);
        int bufEnd = offset + length;
        int pos = offset;
        while (pos < bufEnd) {
            int startMatchLen = prefixMatcher.isMatch(chars, pos, offset, bufEnd);
            if (startMatchLen == 0) {
                pos++;
                continue;
            }
            if (isEscaped(chars, pos, offset)) {
                buf.deleteCharAt(pos - 1);
                chars = getChars(buf);
                lengthChange--;
                bufEnd--;
                continue;
            }
            int[] result = handleVariable(event, buf, chars, pos, startMatchLen, offset, bufEnd, priorVariables);
            pos = result[0];
            lengthChange += result[1];
            chars = getChars(buf);
            bufEnd = offset + length + lengthChange;
        }
        return lengthChange;
    }

    /**
     * Handles a variable found at the given position.
     *
     * @return int[2] where [0] is the new position and [1] is the length change
     */
    private int[] handleVariable(final LogEvent event, final StringBuilder buf, char[] chars, int startPos,
                                 int startMatchLen, int offset, int bufEnd, List<String> priorVariables) {
        int pos = startPos + startMatchLen;
        int nestedVarCount = 0;
        while (pos < bufEnd) {
            if (enableSubstitutionInVariables) {
                int nestedStartLen = prefixMatcher.isMatch(chars, pos, offset, bufEnd);
                if (nestedStartLen != 0) {
                    nestedVarCount++;
                    pos += nestedStartLen;
                    continue;
                }
            }
            int endMatchLen = suffixMatcher.isMatch(chars, pos, offset, bufEnd);
            if (endMatchLen == 0) {
                pos++;
                continue;
            }
            if (nestedVarCount == 0) {
                String varNameExpr = new String(chars, startPos + startMatchLen, pos - startPos - startMatchLen);
                if (enableSubstitutionInVariables) {
                    StringBuilder bufName = new StringBuilder(varNameExpr);
                    substitute(event, bufName, 0, bufName.length());
                    varNameExpr = bufName.toString();
                }
                int endPos = pos + endMatchLen;

                String[] nameAndDefault = splitVariableAndDefault(varNameExpr);
                String varName = nameAndDefault[0];
                String varDefaultValue = nameAndDefault[1];

                if (priorVariables == null) {
                    priorVariables = new ArrayList<>();
                    priorVariables.add(new String(chars, offset, length));
                }

                checkCyclicSubstitution(varName, priorVariables);
                priorVariables.add(varName);

                String varValue = resolveVariable(event, varName, buf, startPos, endPos);
                if (varValue == null) {
                    varValue = varDefaultValue;
                }

                int delta = 0;
                if (varValue != null) {
                    int varLen = varValue.length();
                    buf.replace(startPos, endPos, varValue);
                    int recursiveChange = substitute(event, buf, startPos, varLen, priorVariables);
                    delta = recursiveChange + (varLen - (endPos - startPos));
                }

                priorVariables.remove(priorVariables.size() - 1);
                int newPos = endPos + delta;
                return new int[]{newPos, delta};
            } else {
                nestedVarCount--;
                pos += endMatchLen;
            }
        }
        return new int[]{pos, 0};
    }

    /**
     * Splits a variable expression into name and default value using the configured delimiter.
     *
     * @param varExpr the raw variable expression
     * @return a two‑element array: [name, defaultValue] where defaultValue may be {@code null}
     */
    private String[] splitVariableAndDefault(final String varExpr) {
        String varName = varExpr;
        String varDefault = null;
        if (valueDelimiterMatcher != null) {
            char[] exprChars = varExpr.toCharArray();
            for (int i = 0; i < exprChars.length; i++) {
                if (!enableSubstitutionInVariables &&
                    prefixMatcher.isMatch(exprChars, i, i, exprChars.length) != 0) {
                    break;
                }
                int delimLen = valueDelimiterMatcher.isMatch(exprChars, i);
                if (delimLen != 0) {
                    varName = varExpr.substring(0, i);
                    varDefault = varExpr.substring(i + delimLen);
                    break;
                }
            }
        }
        return new String[]{varName, varDefault};
    }

    /**
     * Determines whether the character at {@code pos} is escaped.
     */
    private boolean isEscaped(final char[] chars, final int pos, final int offset) {
        return pos > offset && chars[pos - 1] == escapeChar;
    }

    /**
     * Checks if the specified variable is already in the stack (list) of variables.
     *
     * @param varName  the variable name to check
     * @param priorVariables  the list of prior variables
     */
    private void checkCyclicSubstitution(final String varName, final List<String> priorVariables) {
        if (!priorVariables.contains(varName)) {
            return;
        }
        final StringBuilder buf = new StringBuilder(BUF_SIZE);
        buf.append("Infinite loop in property interpolation of ");
        buf.append(priorVariables.remove(0));
        buf.append(": ");
        appendWithSeparators(buf, priorVariables, "->");
        throw new IllegalStateException(buf.toString());
    }

    /**
     * Internal method that resolves the value of a variable.
     *
     * @param event The LogEvent, if there is one.
     * @param variableName  the name of the variable, not null
     * @param buf  the buffer where the substitution is occurring, not null
     * @param startPos  the start position of the variable including the prefix, valid
     * @param endPos  the end position of the variable including the suffix, valid
     * @return the variable's value or <b>null</b> if the variable is unknown
     */
    protected String resolveVariable(final LogEvent event, final String variableName, final StringBuilder buf,
                                     final int startPos, final int endPos) {
        final StrLookup resolver = getVariableResolver();
        if (resolver == null) {
            return null;
        }
        return resolver.lookup(event, variableName);
    }

    // Escape
    //-----------------------------------------------------------------------
    /**
     * Returns the escape character.
     *
     * @return the character used for escaping variable references
     */
    public char getEscapeChar() {
        return this.escapeChar;
    }

    /**
     * Sets the escape character.
     *
     * @param escapeCharacter  the escape character (0 for disabling escaping)
     */
    public void setEscapeChar(final char escapeCharacter) {
        this.escapeChar = escapeCharacter;
    }

    // Prefix
    //-----------------------------------------------------------------------
    /**
     * Gets the variable prefix matcher currently in use.
     *
     * @return the prefix matcher in use
     */
    public StrMatcher getVariablePrefixMatcher() {
        return prefixMatcher;
    }

    /**
     * Sets the variable prefix matcher currently in use.
     *
     * @param prefixMatcher  the prefix matcher to use, null ignored
     * @return this, to enable chaining
     * @throws IllegalArgumentException if the prefix matcher is null
     */
    public StrSubstitutor setVariablePrefixMatcher(final StrMatcher prefixMatcher) {
        if (prefixMatcher == null) {
            throw new IllegalArgumentException("Variable prefix matcher must not be null!");
        }
        this.prefixMatcher = prefixMatcher;
        return this;
    }

    /**
     * Sets the variable prefix to use.
     *
     * @param prefix  the prefix character to use
     * @return this, to enable chaining
     */
    public StrSubstitutor setVariablePrefix(final char prefix) {
        return setVariablePrefixMatcher(StrMatcher.charMatcher(prefix));
    }

    /**
     * Sets the variable prefix to use.
     *
     * @param prefix  the prefix for variables, not null
     * @return this, to enable chaining
     * @throws IllegalArgumentException if the prefix is null
     */
    public StrSubstitutor setVariablePrefix(final String prefix) {
       if (prefix == null) {
            throw new IllegalArgumentException("Variable prefix must not be null!");
        }
        return setVariablePrefixMatcher(StrMatcher.stringMatcher(prefix));
    }

    // Suffix
    //-----------------------------------------------------------------------
    /**
     * Gets the variable suffix matcher currently in use.
     *
     * @return the suffix matcher in use
     */
    public StrMatcher getVariableSuffixMatcher() {
        return suffixMatcher;
    }

    /**
     * Sets the variable suffix matcher currently in use.
     *
     * @param suffixMatcher  the suffix matcher to use, null ignored
     * @return this, to enable chaining
     * @throws IllegalArgumentException if the suffix matcher is null
     */
    public StrSubstitutor setVariableSuffixMatcher(final StrMatcher suffixMatcher) {
        if (suffixMatcher == null) {
            throw new IllegalArgumentException("Variable suffix matcher must not be null!");
        }
        this.suffixMatcher = suffixMatcher;
        return this;
    }

    /**
     * Sets the variable suffix to use.
     *
     * @param suffix  the suffix character to use
     * @return this, to enable chaining
     */
    public StrSubstitutor setVariableSuffix(final char suffix) {
        return setVariableSuffixMatcher(StrMatcher.charMatcher(suffix));
    }

    /**
     * Sets the variable suffix to use.
     *
     * @param suffix  the suffix for variables, not null
     * @return this, to enable chaining
     * @throws IllegalArgumentException if the suffix is null
     */
    public StrSubstitutor setVariableSuffix(final String suffix) {
       if (suffix == null) {
            throw new IllegalArgumentException("Variable suffix must not be null!");
        }
        return setVariableSuffixMatcher(StrMatcher.stringMatcher(suffix));
    }

    // Variable Default Value Delimiter
    //-----------------------------------------------------------------------
    /**
     * Gets the variable default value delimiter matcher currently in use.
     *
     * @return the variable default value delimiter matcher in use, may be null
     */
    public StrMatcher getValueDelimiterMatcher() {
        return valueDelimiterMatcher;
    }

    /**
     * Sets the variable default value delimiter matcher to use.
     *
     * @param valueDelimiterMatcher  variable default value delimiter matcher to use, may be null
     * @return this, to enable chaining
     */
    public StrSubstitutor setValueDelimiterMatcher(final StrMatcher valueDelimiterMatcher) {
        this.valueDelimiterMatcher = valueDelimiterMatcher;
        return this;
    }

    /**
     * Sets the variable default value delimiter to use.
     *
     * @param valueDelimiter  the variable default value delimiter character to use
     * @return this, to enable chaining
     */
    public StrSubstitutor setValueDelimiter(final char valueDelimiter) {
        return setValueDelimiterMatcher(StrMatcher.charMatcher(valueDelimiter));
    }

    /**
     * Sets the variable default value delimiter to use.
     *
     * @param valueDelimiter  the variable default value delimiter string to use, may be null or empty
     * @return this, to enable chaining
     */
    public StrSubstitutor setValueDelimiter(final String valueDelimiter) {
        if (Strings.isEmpty(valueDelimiter)) {
            setValueDelimiterMatcher(null);
            return this;
        }
        return setValueDelimiterMatcher(StrMatcher.stringMatcher(valueDelimiter));
    }

    // Resolver
    //-----------------------------------------------------------------------
    /**
     * Gets the VariableResolver that is used to lookup variables.
     *
     * @return the VariableResolver
     */
    public StrLookup getVariableResolver() {
        return this.variableResolver;
    }

    /**
     * Sets the VariableResolver that is used to lookup variables.
     *
     * @param variableResolver  the VariableResolver
     */
    public void setVariableResolver(final StrLookup variableResolver) {
        this.variableResolver = variableResolver;
    }

    // Substitution support in variable names
    //-----------------------------------------------------------------------
    /**
     * Returns a flag whether substitution is done in variable names.
     *
     * @return the substitution in variable names flag
     */
    public boolean isEnableSubstitutionInVariables() {
        return enableSubstitutionInVariables;
    }

    /**
     * Sets a flag whether substitution is done in variable names.
     *
     * @param enableSubstitutionInVariables the new value of the flag
     */
    public void setEnableSubstitutionInVariables(final boolean enableSubstitutionInVariables) {
        this.enableSubstitutionInVariables = enableSubstitutionInVariables;
    }

    private char[] getChars(final StringBuilder sb) {
        final char[] chars = new char[sb.length()];
        sb.getChars(0, sb.length(), chars, 0);
        return chars;
    }

    /**
     * Appends an iterable placing separators between each value, but
     * not before the first or after the last.
     *
     * @param sb StringBuilder that contains the String being constructed.
     * @param iterable  the iterable to append
     * @param separator  the separator to use, null means no separator
     */
    public void appendWithSeparators(final StringBuilder sb, final Iterable<?> iterable, String separator) {
        if (iterable != null) {
            separator = separator == null ? Strings.EMPTY : separator;
            final Iterator<?> it = iterable.iterator();
            while (it.hasNext()) {
                sb.append(it.next());
                if (it.hasNext()) {
                    sb.append(separator);
                }
            }
        }
    }

    @Override
    public String toString() {
        return "StrSubstitutor(" + variableResolver.toString() + ')';
    }
}