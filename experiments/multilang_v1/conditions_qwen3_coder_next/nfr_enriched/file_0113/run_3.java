/* 1 */ package org.apache.logging.log4j.core.lookup;
/* 2 */ 
/* 3 */ import java.util.ArrayList;
/* 4 */ import java.util.Enumeration;
/* 5 */ import java.util.HashMap;
/* 6 */ import java.util.Iterator;
/* 7 */ import java.util.List;
/* 8 */ import java.util.Map;
/* 9 */ import java.util.Properties;
/* 10 */ 
/* 11 */ import org.apache.logging.log4j.core.LogEvent;
/* 12 */ import org.apache.logging.log4j.util.Strings;
/* 13 */ 
/* 14 */ /**
/* 15 */  * Substitutes variables within a string by values.
/* 16 */  * <p>
/* 17 */  * This class takes a piece of text and substitutes all the variables within it.
/* 18 */  * The default definition of a variable is <code>${variableName}</code>.
/* 19 */  * The prefix and suffix can be changed via constructors and set methods.
/* 20 */  * </p>
/* 21 */  * <p>
/* 22 */  * Variable values are typically resolved from a map, but could also be resolved
/* 23 */  * from system properties, or by supplying a custom variable resolver.
/* 24 */  * </p>
/* 25 */  * <p>
/* 26 */  * The simplest example is to use this class to replace Java System properties. For example:
/* 27 */  * </p>
/* 28 */  * <pre>
/* 29 */  * StrSubstitutor.replaceSystemProperties(
/* 30 */  *      "You are running with java.version = ${java.version} and os.name = ${os.name}.");
/* 31 */  * </pre>
/* 32 */  * <p>
/* 33 */  * Typical usage of this class follows the following pattern: First an instance is created
/* 34 */  * and initialized with the map that contains the values for the available variables.
/* 35 */  * If a prefix and/or suffix for variables should be used other than the default ones,
/* 36 */  * the appropriate settings can be performed. After that the <code>replace()</code>
/* 37 */  * method can be called passing in the source text for interpolation. In the returned
/* 38 */  * text all variable references (as long as their values are known) will be resolved.
/* 39 */  * The following example demonstrates this:
/* 40 */  * </p>
/* 41 */  * <pre>
/* 42 */  * Map valuesMap = HashMap();
/* 43 */  * valuesMap.put(&quot;animal&quot;, &quot;quick brown fox&quot;);
/* 44 */  * valuesMap.put(&quot;target&quot;, &quot;lazy dog&quot;);
/* 45 */  * String templateString = &quot;The ${animal} jumped over the ${target}.&quot;;
/* 46 */  * StrSubstitutor sub = new StrSubstitutor(valuesMap);
/* 47 */  * String resolvedString = sub.replace(templateString);
/* 48 */  * </pre>
/* 49 */  * <p>yielding:</p>
/* 50 */  * <pre>
/* 51 */  *      The quick brown fox jumped over the lazy dog.
/* 52 */  * </pre>
/* 53 */  * <p>
/* 54 */  * Also, this class allows to set a default value for unresolved variables.
/* 55 */  * The default value for a variable can be appended to the variable name after the variable
/* 56 */  * default value delimiter. The default value of the variable default value delimiter is ':-',
/* 57 */  * as in bash and other *nix shells, as those are arguably where the default ${} delimiter set originated.
/* 58 */  * The variable default value delimiter can be manually set by calling {@link #setValueDelimiterMatcher(StrMatcher)},
/* 59 */  * {@link #setValueDelimiter(char)} or {@link #setValueDelimiter(String)}.
/* 60 */  * The following shows an example with variable default value settings:
/* 61 */  * </p>
/* 62 */  * <pre>
/* 63 */  * Map valuesMap = HashMap();
/* 64 */  * valuesMap.put(&quot;animal&quot;, &quot;quick brown fox&quot;);
/* 65 */  * valuesMap.put(&quot;target&quot;, &quot;lazy dog&quot;);
/* 66 */  * String templateString = &quot;The ${animal} jumped over the ${target}. ${undefined.number:-1234567890}.&quot;;
/* 67 */  * StrSubstitutor sub = new StrSubstitutor(valuesMap);
/* 68 */  * String resolvedString = sub.replace(templateString);
/* 69 */  * </pre>
/* 70 */  * <p>yielding:</p>
/* 71 */  * <pre>
/* 72 */  *      The quick brown fox jumped over the lazy dog. 1234567890.
/* 73 */  * </pre>
/* 74 */  * <p>
/* 75 */  * In addition to this usage pattern there are some static convenience methods that
/* 76 */  * cover the most common use cases. These methods can be used without the need of
/* 77 */  * manually creating an instance. However if multiple replace operations are to be
/* 78 */  * performed, creating and reusing an instance of this class will be more efficient.
/* 79 */  * </p>
/* 80 */  * <p>
/* 81 */  * Variable replacement works in a recursive way. Thus, if a variable value contains
/* 82 */  * a variable then that variable will also be replaced. Cyclic replacements are
/* 83 */  * detected and will cause an exception to be thrown.
/* 84 */  * </p>
/* 85 */  * <p>
/* 86 */  * Sometimes the interpolation's result must contain a variable prefix. As an example
/* 87 */  * take the following source text:
/* 88 */  * </p>
/* 89 */  * <pre>
/* 90 */  *   The variable ${${name}} must be used.
/* 91 */  * </pre>
/* 92 */  * <p>
/* 93 */  * Here only the variable's name referred to in the text should be replaced resulting
/* 94 */  * in the text (assuming that the value of the <code>name</code> variable is <code>x</code>):
/* 95 */  * </p>
/* 96 */  * <pre>
/* 97 */  *   The variable ${x} must be used.
/* 98 */  * </pre>
/* 99 */  * <p>
/* 100 */  * To achieve this effect there are two possibilities: Either set a different prefix
/* 101 */  * and suffix for variables which do not conflict with the result text you want to
/* 102 */  * produce. The other possibility is to use the escape character, by default '$'.
/* 103 */  * If this character is placed before a variable reference, this reference is ignored
/* 104 */  * and won't be replaced. For example:
/* 105 */  * </p>
/* 106 */  * <pre>
/* 107 */  *   The variable $${${name}} must be used.
/* 108 */  * </pre>
/* 109 */  * <p>
/* 110 */  * In some complex scenarios you might even want to perform substitution in the
/* 111 */  * names of variables, for instance
/* 112 */  * </p>
/* 113 */  * <pre>
/* 114 */  * ${jre-${java.specification.version}}
/* 115 */  * </pre>
/* 116 */  * <p>
/* 117 */  * <code>StrSubstitutor</code> supports this recursive substitution in variable
/* 118 */  * names, but it has to be enabled explicitly by setting the
/* 119 */  * {@link #setEnableSubstitutionInVariables(boolean) enableSubstitutionInVariables}
/* 120 */  * property to <b>true</b>.
/* 121 */  * </p>
/* 122 */  */
/* 123 */ public class StrSubstitutor {
/* 124 */ 
/* 125 */     /**
/* 126 */      * Constant for the default escape character.
/* 127 */      */
/* 128 */     public static final char DEFAULT_ESCAPE = '$';
/* 129 */     
/* 130 */     /**
/* 131 */      * Constant for the default variable prefix.
/* 132 */      */
/* 133 */     public static final StrMatcher DEFAULT_PREFIX = StrMatcher.stringMatcher(DEFAULT_ESCAPE + "{");
/* 134 */     
/* 135 */     /**
/* 136 */      * Constant for the default variable suffix.
/* 137 */      */
/* 138 */     public static final StrMatcher DEFAULT_SUFFIX = StrMatcher.stringMatcher("}");
/* 139 */     
/* 140 */     /**
/* 141 */      * Constant for the default value delimiter of a variable.
/* 142 */      */
/* 143 */     public static final StrMatcher DEFAULT_VALUE_DELIMITER = StrMatcher.stringMatcher(":-");
/* 144 */ 
/* 145 */     private static final int BUF_SIZE = 256;
/* 146 */ 
/* 147 */     /**
/* 148 */      * Stores the escape character.
/* 149 */      */
/* 150 */     private char escapeChar;
/* 151 */     /**
/* 152 */      * Stores the variable prefix.
/* 153 */      */
/* 154 */     private StrMatcher prefixMatcher;
/* 155 */     /**
/* 156 */      * Stores the variable suffix.
/* 157 */      */
/* 158 */     private StrMatcher suffixMatcher;
/* 159 */     /**
/* 160 */      * Stores the default variable value delimiter
/* 161 */      */
/* 162 */     private StrMatcher valueDelimiterMatcher;
/* 163 */     /**
/* 164 */      * Variable resolution is delegated to an implementer of VariableResolver.
/* 165 */      */
/* 166 */     private StrLookup variableResolver;
/* 167 */     /**
/* 168 */      * The flag whether substitution in variable names is enabled.
/* 169 */      */
/* 170 */     private boolean enableSubstitutionInVariables;
/* 171 */ 
/* 172 */     //-----------------------------------------------------------------------
/* 173 */     /**
/* 174 */      * Creates a new instance with defaults for variable prefix and suffix
/* 175 */      * and the escaping character.
/* 176 */      */
/* 177 */     public StrSubstitutor() {
/* 178 */         this(null, DEFAULT_PREFIX, DEFAULT_SUFFIX, DEFAULT_ESCAPE);
/* 179 */     }
/* 180 */     /**
/* 181 */      * Creates a new instance and initializes it. Uses defaults for variable
/* 182 */      * prefix and suffix and the escaping character.
/* 183 */      *
/* 184 */      * @param valueMap  the map with the variables' values, may be null
/* 185 */      */
/* 186 */     public StrSubstitutor(final Map<String, String> valueMap) {
/* 187 */         this(new MapLookup(valueMap), DEFAULT_PREFIX, DEFAULT_SUFFIX, DEFAULT_ESCAPE);
/* 188 */     }
/* 189 */ 
/* 190 */     /**
/* 191 */      * Creates a new instance and initializes it. Uses a default escaping character.
/* 192 */      *
/* 193 */      * @param valueMap  the map with the variables' values, may be null
/* 194 */      * @param prefix  the prefix for variables, not null
/* 195 */      * @param suffix  the suffix for variables, not null
/* 196 */      * @throws IllegalArgumentException if the prefix or suffix is null
/* 197 */      */
/* 198 */     public StrSubstitutor(final Map<String, String> valueMap, final String prefix, final String suffix) {
/* 199 */         this(new MapLookup(valueMap), prefix, suffix, DEFAULT_ESCAPE);
/* 200 */     }
/* 201 */ 
/* 202 */     /**
/* 203 */      * Creates a new instance and initializes it.
/* 204 */      *
/* 205 */      * @param valueMap  the map with the variables' values, may be null
/* 206 */      * @param prefix  the prefix for variables, not null
/* 207 */      * @param suffix  the suffix for variables, not null
/* 208 */      * @param escape  the escape character
/* 209 */      * @throws IllegalArgumentException if the prefix or suffix is null
/* 210 */      */
/* 211 */     public StrSubstitutor(final Map<String, String> valueMap, final String prefix, final String suffix,
/* 212 */                           final char escape) {
/* 213 */         this(new MapLookup(valueMap), prefix, suffix, escape);
/* 214 */     }
/* 215 */ 
/* 216 */     /**
/* 217 */      * Creates a new instance and initializes it.
/* 218 */      *
/* 219 */      * @param valueMap  the map with the variables' values, may be null
/* 220 */      * @param prefix  the prefix for variables, not null
/* 221 */      * @param suffix  the suffix for variables, not null
/* 222 */      * @param escape  the escape character
/* 223 */      * @param valueDelimiter  the variable default value delimiter, may be null
/* 224 */      * @throws IllegalArgumentException if the prefix or suffix is null
/* 225 */      */
/* 226 */     public StrSubstitutor(final Map<String, String> valueMap, final String prefix, final String suffix,
/* 227 */                               final char escape, final String valueDelimiter) {
/* 228 */         this(new MapLookup(valueMap), prefix, suffix, escape, valueDelimiter);
/* 229 */     }
/* 230 */ 
/* 231 */     /**
/* 232 */      * Creates a new instance and initializes it.
/* 233 */      *
/* 234 */      * @param variableResolver  the variable resolver, may be null
/* 235 */      */
/* 236 */     public StrSubstitutor(final StrLookup variableResolver) {
/* 237 */         this(variableResolver, DEFAULT_PREFIX, DEFAULT_SUFFIX, DEFAULT_ESCAPE);
/* 238 */     }
/* 239 */ 
/* 240 */     /**
/* 241 */      * Creates a new instance and initializes it.
/* 242 */      *
/* 243 */      * @param variableResolver  the variable resolver, may be null
/* 244 */      * @param prefix  the prefix for variables, not null
/* 245 */      * @param suffix  the suffix for variables, not null
/* 246 */      * @param escape  the escape character
/* 247 */      * @throws IllegalArgumentException if the prefix or suffix is null
/* 248 */      */
/* 249 */     public StrSubstitutor(final StrLookup variableResolver, final String prefix, final String suffix,
/* 250 */                           final char escape) {
/* 251 */         this.setVariableResolver(variableResolver);
/* 252 */         this.setVariablePrefix(prefix);
/* 253 */         this.setVariableSuffix(suffix);
/* 254 */         this.setEscapeChar(escape);
/* 255 */     }
/* 256 */ 
/* 257 */     /**
/* 258 */      * Creates a new instance and initializes it.
/* 259 */      *
/* 260 */      * @param variableResolver  the variable resolver, may be null
/* 261 */      * @param prefix  the prefix for variables, not null
/* 262 */      * @param suffix  the suffix for variables, not null
/* 263 */      * @param escape  the escape character
/* 264 */      * @param valueDelimiter  the variable default value delimiter string, may be null
/* 265 */      * @throws IllegalArgumentException if the prefix or suffix is null
/* 266 */      */
/* 267 */     public StrSubstitutor(final StrLookup variableResolver, final String prefix, final String suffix, final char escape, final String valueDelimiter) {
/* 268 */         this.setVariableResolver(variableResolver);
/* 269 */         this.setVariablePrefix(prefix);
/* 270 */         this.setVariableSuffix(suffix);
/* 271 */         this.setEscapeChar(escape);
/* 272 */         this.setValueDelimiter(valueDelimiter);
/* 273 */     }
/* 274 */ 
/* 275 */     /**
/* 276 */      * Creates a new instance and initializes it.
/* 277 */      *
/* 278 */      * @param variableResolver  the variable resolver, may be null
/* 279 */      * @param prefixMatcher  the prefix for variables, not null
/* 280 */      * @param suffixMatcher  the suffix for variables, not null
/* 281 */      * @param escape  the escape character
/* 282 */      * @throws IllegalArgumentException if the prefix or suffix is null
/* 283 */      */
/* 284 */     public StrSubstitutor(final StrLookup variableResolver, final StrMatcher prefixMatcher,
/* 285 */                           final StrMatcher suffixMatcher,
/* 286 */                           final char escape) {
/* 287 */         this(variableResolver, prefixMatcher, suffixMatcher, escape, DEFAULT_VALUE_DELIMITER);
/* 288 */     }
/* 289 */ 
/* 290 */     /**
/* 291 */      * Creates a new instance and initializes it.
/* 292 */      *
/* 293 */      * @param variableResolver  the variable resolver, may be null
/* 294 */      * @param prefixMatcher  the prefix for variables, not null
/* 295 */      * @param suffixMatcher  the suffix for variables, not null
/* 296 */      * @param escape  the escape character
/* 297 */      * @param valueDelimiterMatcher  the variable default value delimiter matcher, may be null
/* 298 */      * @throws IllegalArgumentException if the prefix or suffix is null
/* 299 */      */
/* 300 */     public StrSubstitutor(
/* 301 */             final StrLookup variableResolver, final StrMatcher prefixMatcher, final StrMatcher suffixMatcher, final char escape, final StrMatcher valueDelimiterMatcher) {
/* 302 */         this.setVariableResolver(variableResolver);
/* 303 */         this.setVariablePrefixMatcher(prefixMatcher);
/* 304 */         this.setVariableSuffixMatcher(suffixMatcher);
/* 305 */         this.setEscapeChar(escape);
/* 306 */         this.setValueDelimiterMatcher(valueDelimiterMatcher);
/* 307 */     }
/* 308 */ 
/* 309 */     //-----------------------------------------------------------------------
/* 310 */     /**
/* 311 */      * Replaces all the occurrences of variables in the given source object with
/* 312 */      * their matching values from the map.
/* 313 */      *
/* 314 */      * @param source  the source text containing the variables to substitute, null returns null
/* 315 */      * @param valueMap  the map with the values, may be null
/* 316 */      * @return the result of the replace operation
/* 317 */      */
/* 318 */     public static String replace(final Object source, final Map<String, String> valueMap) {
/* 319 */         return new StrSubstitutor(valueMap).replace(source);
/* 320 */     }
/* 321 */ 
/* 322 */     /**
/* 323 */      * Replaces all the occurrences of variables in the given source object with
/* 324 */      * their matching values from the map. This method allows to specify a
/* 325 */      * custom variable prefix and suffix
/* 326 */      *
/* 327 */      * @param source  the source text containing the variables to substitute, null returns null
/* 328 */      * @param valueMap  the map with the values, may be null
/* 329 */      * @param prefix  the prefix of variables, not null
/* 330 */      * @param suffix  the suffix of variables, not null
/* 331 */      * @return the result of the replace operation
/* 332 */      * @throws IllegalArgumentException if the prefix or suffix is null
/* 333 */      */
/* 334 */     public static String replace(final Object source, final Map<String, String> valueMap, final String prefix,
/* 335 */                                  final String suffix) {
/* 336 */         return new StrSubstitutor(valueMap, prefix, suffix).replace(source);
/* 337 */     }
/* 338 */ 
/* 339 */     /**
/* 340 */      * Replaces all the occurrences of variables in the given source object with their matching
/* 341 */      * values from the properties.
/* 342 */      *
/* 343 */      * @param source the source text containing the variables to substitute, null returns null
/* 344 */      * @param valueProperties the properties with values, may be null
/* 345 */      * @return the result of the replace operation
/* 346 */      */
/* 347 */     public static String replace(final Object source, final Properties valueProperties) {
/* 348 */         if (valueProperties == null) {
/* 349 */             return source.toString();
/* 350 */         }
/* 351 */         final Map<String, String> valueMap = new HashMap<>();
/* 352 */         final Enumeration<?> propNames = valueProperties.propertyNames();
/* 353 */         while (propNames.hasMoreElements()) {
/* 354 */             final String propName = (String) propNames.nextElement();
/* 355 */             final String propValue = valueProperties.getProperty(propName);
/* 356 */             valueMap.put(propName, propValue);
/* 357 */         }
/* 358 */         return StrSubstitutor.replace(source, valueMap);
/* 359 */     }
/* 360 */ 
/* 361 */     //-----------------------------------------------------------------------
/* 362 */     /**
/* 363 */      * Replaces all the occurrences of variables with their matching values
/* 364 */      * from the resolver using the given source string as a template.
/* 365 */      *
/* 366 */      * @param source  the string to replace in, null returns null
/* 367 */      * @return the result of the replace operation
/* 368 */      */
/* 369 */     public String replace(final String source) {
/* 370 */         return replace(null, source);
/* 371 */     }
/* 372 */     //-----------------------------------------------------------------------
/* 373 */     /**
/* 374 */      * Replaces all the occurrences of variables with their matching values
/* 375 */      * from the resolver using the given source string as a template.
/* 376 */      *
/* 377 */      * @param event The current LogEvent if there is one.
/* 378 */      * @param source  the string to replace in, null returns null
/* 379 */      * @return the result of the replace operation
/* 380 */      */
/* 381 */     public String replace(final LogEvent event, final String source) {
/* 382 */         if (source == null) {
/* 383 */             return null;
/* 384 */         }
/* 385 */         final StringBuilder buf = new StringBuilder(source);
/* 386 */         if (!substitute(event, buf, 0, source.length())) {
/* 387 */             return source;
/* 388 */         }
/* 389 */         return buf.toString();
/* 390 */     }
/* 391 */ 
/* 392 */     /**
/* 393 */      * Replaces all the occurrences of variables with their matching values
/* 394 */      * from the resolver using the given source string as a template.
/* 395 */      * <p>
/* 396 */      * Only the specified portion of the string will be processed.
/* 397 */      * The rest of the string is not processed, and is not returned.
/* 398 */      * </p>
/* 399 */      *
/* 400 */      * @param source  the string to replace in, null returns null
/* 401 */      * @param offset  the start offset within the array, must be valid
/* 402 */      * @param length  the length within the array to be processed, must be valid
/* 403 */      * @return the result of the replace operation
/* 404 */      */
/* 405 */     public String replace(final String source, final int offset, final int length) {
/* 406 */         return replace(null, source, offset, length);
/* 407 */     }
/* 408 */ 
/* 409 */     /**
/* 410 */      * Replaces all the occurrences of variables with their matching values
/* 411 */      * from the resolver using the given source string as a template.
/* 412 */      * <p>
/* 413 */      * Only the specified portion of the string will be processed.
/* 414 */      * The rest of the string is not processed, and is not returned.
/* 415 */      * </p>
/* 416 */      *
/* 417 */      * @param event the current LogEvent, if one exists.
/* 418 */      * @param source  the string to replace in, null returns null
/* 419 */      * @param offset  the start offset within the array, must be valid
/* 420 */      * @param length  the length within the array to be processed, must be valid
/* 421 */      * @return the result of the replace operation
/* 422 */      */
/* 423 */     public String replace(final LogEvent event, final String source, final int offset, final int length) {
/* 424 */         if (source == null) {
/* 425 */             return null;
/* 426 */         }
/* 427 */         final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
/* 428 */         if (!substitute(event, buf, 0, length)) {
/* 429 */             return source.substring(offset, offset + length);
/* 430 */         }
/* 431 */         return buf.toString();
/* 432 */     }
/* 433 */ 
/* 434 */     //-----------------------------------------------------------------------
/* 435 */     /**
/* 436 */      * Replaces all the occurrences of variables with their matching values
/* 437 */      * from the resolver using the given source array as a template.
/* 438 */      * The array is not altered by this method.
/* 439 */      *
/* 440 */      * @param source  the character array to replace in, not altered, null returns null
/* 441 */      * @return the result of the replace operation
/* 442 */      */
/* 443 */     public String replace(final char[] source) {
/* 444 */         return replace(null, source);
/* 445 */     }
/* 446 */ 
/* 447 */     //-----------------------------------------------------------------------
/* 448 */     /**
/* 449 */      * Replaces all the occurrences of variables with their matching values
/* 450 */      * from the resolver using the given source array as a template.
/* 451 */      * The array is not altered by this method.
/* 452 */      *
/* 453 */      * @param event the current LogEvent, if one exists.
/* 454 */      * @param source  the character array to replace in, not altered, null returns null
/* 455 */      * @return the result of the replace operation
/* 456 */      */
/* 457 */     public String replace(final LogEvent event, final char[] source) {
/* 458 */         if (source == null) {
/* 459 */             return null;
/* 460 */         }
/* 461 */         final StringBuilder buf = new StringBuilder(source.length).append(source);
/* 462 */         substitute(event, buf, 0, source.length);
/* 463 */         return buf.toString();
/* 464 */     }
/* 465 */ 
/* 466 */     /**
/* 467 */      * Replaces all the occurrences of variables with their matching values
/* 468 */      * from the resolver using the given source array as a template.
/* 469 */      * The array is not altered by this method.
/* 470 */      * <p>
/* 471 */      * Only the specified portion of the array will be processed.
/* 472 */      * The rest of the array is not processed, and is not returned.
/* 473 */      * </p>
/* 474 */      *
/* 475 */      * @param source  the character array to replace in, not altered, null returns null
/* 476 */      * @param offset  the start offset within the array, must be valid
/* 477 */      * @param length  the length within the array to be processed, must be valid
/* 478 */      * @return the result of the replace operation
/* 479 */      */
/* 480 */     public String replace(final char[] source, final int offset, final int length) {
/* 481 */         return replace(null, source, offset, length);
/* 482 */     }
/* 483 */ 
/* 484 */     /**
/* 485 */      * Replaces all the occurrences of variables with their matching values
/* 486 */      * from the resolver using the given source array as a template.
/* 487 */      * The array is not altered by this method.
/* 488 */      * <p>
/* 489 */      * Only the specified portion of the array will be processed.
/* 490 */      * The rest of the array is not processed, and is not returned.
/* 491 */      * </p>
/* 492 */      *
/* 493 */      * @param event the current LogEvent, if one exists.
/* 494 */      * @param source  the character array to replace in, not altered, null returns null
/* 495 */      * @param offset  the start offset within the array, must be valid
/* 496 */      * @param length  the length within the array to be processed, must be valid
/* 497 */      * @return the result of the replace operation
/* 498 */      */
/* 499 */     public String replace(final LogEvent event, final char[] source, final int offset, final int length) {
/* 500 */         if (source == null) {
/* 501 */             return null;
/* 502 */         }
/* 503 */         final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
/* 504 */         substitute(event, buf, 0, length);
/* 505 */         return buf.toString();
/* 506 */     }
/* 507 */ 
/* 508 */     //-----------------------------------------------------------------------
/* 509 */     /**
/* 510 */      * Replaces all the occurrences of variables with their matching values
/* 511 */      * from the resolver using the given source buffer as a template.
/* 512 */      * The buffer is not altered by this method.
/* 513 */      *
/* 514 */      * @param source  the buffer to use as a template, not changed, null returns null
/* 515 */      * @return the result of the replace operation
/* 516 */      */
/* 517 */     public String replace(final StringBuffer source) {
/* 518 */         return replace(null, source);
/* 519 */     }
/* 520 */ 
/* 521 */     //-----------------------------------------------------------------------
/* 522 */     /**
/* 523 */      * Replaces all the occurrences of variables with their matching values
/* 524 */      * from the resolver using the given source buffer as a template.
/* 525 */      * The buffer is not altered by this method.
/* 526 */      *
/* 527 */      * @param event the current LogEvent, if one exists.
/* 528 */      * @param source  the buffer to use as a template, not changed, null returns null
/* 529 */      * @return the result of the replace operation
/* 530 */      */
/* 531 */     public String replace(final LogEvent event, final StringBuffer source) {
/* 532 */         if (source == null) {
/* 533 */             return null;
/* 534 */         }
/* 535 */         final StringBuilder buf = new StringBuilder(source.length()).append(source);
/* 536 */         substitute(event, buf, 0, buf.length());
/* 537 */         return buf.toString();
/* 538 */     }
/* 539 */ 
/* 540 */     /**
/* 541 */      * Replaces all the occurrences of variables with their matching values
/* 542 */      * from the resolver using the given source buffer as a template.
/* 543 */      * The buffer is not altered by this method.
/* 544 */      * <p>
/* 545 */      * Only the specified portion of the buffer will be processed.
/* 546 */      * The rest of the buffer is not processed, and is not returned.
/* 547 */      * </p>
/* 548 */      *
/* 549 */      * @param source  the buffer to use as a template, not changed, null returns null
/* 550 */      * @param offset  the start offset within the array, must be valid
/* 551 */      * @param length  the length within the array to be processed, must be valid
/* 552 */      * @return the result of the replace operation
/* 553 */      */
/* 554 */     public String replace(final StringBuffer source, final int offset, final int length) {
/* 555 */         return replace(null, source, offset, length);
/* 556 */     }
/* 557 */ 
/* 558 */     /**
/* 559 */      * Replaces all the occurrences of variables with their matching values
/* 560 */      * from the resolver using the given source buffer as a template.
/* 561 */      * The buffer is not altered by this method.
/* 562 */      * <p>
/* 563 */      * Only the specified portion of the buffer will be processed.
/* 564 */      * The rest of the buffer is not processed, and is not returned.
/* 565 */      * </p>
/* 566 */      *
/* 567 */      * @param event the current LogEvent, if one exists.
/* 568 */      * @param source  the buffer to use as a template, not changed, null returns null
/* 569 */      * @param offset  the start offset within the array, must be valid
/* 570 */      * @param length  the length within the array to be processed, must be valid
/* 571 */      * @return the result of the replace operation
/* 572 */      */
/* 573 */     public String replace(final LogEvent event, final StringBuffer source, final int offset, final int length) {
/* 574 */         if (source == null) {
/* 575 */             return null;
/* 576 */         }
/* 577 */         final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
/* 578 */         substitute(event, buf, 0, length);
/* 579 */         return buf.toString();
/* 580 */     }
/* 581 */ 
/* 582 */     //-----------------------------------------------------------------------
/* 583 */     /**
/* 584 */      * Replaces all the occurrences of variables with their matching values
/* 585 */      * from the resolver using the given source builder as a template.
/* 586 */      * The builder is not altered by this method.
/* 587 */      *
/* 588 */      * @param source  the builder to use as a template, not changed, null returns null
/* 589 */      * @return the result of the replace operation
/* 590 */      */
/* 591 */     public String replace(final StringBuilder source) {
/* 592 */         return replace(null, source);
/* 593 */     }
/* 594 */ 
/* 595 */     //-----------------------------------------------------------------------
/* 596 */     /**
/* 597 */      * Replaces all the occurrences of variables with their matching values
/* 598 */      * from the resolver using the given source builder as a template.
/* 599 */      * The builder is not altered by this method.
/* 600 */      *
/* 601 */      * @param event The LogEvent.
/* 602 */      * @param source  the builder to use as a template, not changed, null returns null.
/* 603 */      * @return the result of the replace operation.
/* 604 */      */
/* 605 */     public String replace(final LogEvent event, final StringBuilder source) {
/* 606 */         if (source == null) {
/* 607 */             return null;
/* 608 */         }
/* 609 */         final StringBuilder buf = new StringBuilder(source.length()).append(source);
/* 610 */         substitute(event, buf, 0, buf.length());
/* 611 */         return buf.toString();
/* 612 */     }
/* 613 */     /**
/* 614 */      * Replaces all the occurrences of variables with their matching values
/* 615 */      * from the resolver using the given source builder as a template.
/* 616 */      * The builder is not altered by this method.
/* 617 */      * <p>
/* 618 */      * Only the specified portion of the builder will be processed.
/* 619 */      * The rest of the builder is not processed, and is not returned.
/* 620 */      * </p>
/* 621 */      *
/* 622 */      * @param source  the builder to use as a template, not changed, null returns null
/* 623 */      * @param offset  the start offset within the array, must be valid
/* 624 */      * @param length  the length within the array to be processed, must be valid
/* 625 */      * @return the result of the replace operation
/* 626 */      */
/* 627 */     public String replace(final StringBuilder source, final int offset, final int length) {
/* 628 */         return replace(null, source, offset, length);
/* 629 */     }
/* 630 */ 
/* 631 */     /**
/* 632 */      * Replaces all the occurrences of variables with their matching values
/* 633 */      * from the resolver using the given source builder as a template.
/* 634 */      * The builder is not altered by this method.
/* 635 */      * <p>
/* 636 */      * Only the specified portion of the builder will be processed.
/* 637 */      * The rest of the builder is not processed, and is not returned.
/* 638 */      * </p>
/* 639 */      *
/* 640 */      * @param event the current LogEvent, if one exists.
/* 641 */      * @param source  the builder to use as a template, not changed, null returns null
/* 642 */      * @param offset  the start offset within the array, must be valid
/* 643 */      * @param length  the length within the array to be processed, must be valid
/* 644 */      * @return the result of the replace operation
/* 645 */      */
/* 646 */     public String replace(final LogEvent event, final StringBuilder source, final int offset, final int length) {
/* 647 */         if (source == null) {
/* 648 */             return null;
/* 649 */         }
/* 650 */         final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
/* 651 */         substitute(event, buf, 0, length);
/* 652 */         return buf.toString();
/* 653 */     }
/* 654 */ 
/* 655 */     //-----------------------------------------------------------------------
/* 656 */     /**
/* 657 */      * Replaces all the occurrences of variables in the given source object with
/* 658 */      * their matching values from the resolver. The input source object is
/* 659 */      * converted to a string using <code>toString</code> and is not altered.
/* 660 */      *
/* 661 */      * @param source  the source to replace in, null returns null
/* 662 */      * @return the result of the replace operation
/* 663 */      */
/* 664 */     public String replace(final Object source) {
/* 665 */         return replace(null, source);
/* 666 */     }
/* 667 */     //-----------------------------------------------------------------------
/* 668 */     /**
/* 669 */      * Replaces all the occurrences of variables in the given source object with
/* 670 */      * their matching values from the resolver. The input source object is
/* 671 */      * converted to a string using <code>toString</code> and is not altered.
/* 672 */      *
/* 673 */      * @param event the current LogEvent, if one exists.
/* 674 */      * @param source  the source to replace in, null returns null
/* 675 */      * @return the result of the replace operation
/* 676 */      */
/* 677 */     public String replace(final LogEvent event, final Object source) {
/* 678 */         if (source == null) {
/* 679 */             return null;
/* 680 */         }
/* 681 */         final StringBuilder buf = new StringBuilder().append(source);
/* 682 */         substitute(event, buf, 0, buf.length());
/* 683 */         return buf.toString();
/* 684 */     }
/* 685 */ 
/* 686 */     //-----------------------------------------------------------------------
/* 687 */     /**
/* 688 */      * Replaces all the occurrences of variables within the given source buffer
/* 689 */      * with their matching values from the resolver.
/* 690 */      * The buffer is updated with the result.
/* 691 */      *
/* 692 */      * @param source  the buffer to replace in, updated, null returns zero
/* 693 */      * @return true if altered
/* 694 */      */
/* 695 */     public boolean replaceIn(final StringBuffer source) {
/* 696 */         if (source == null) {
/* 697 */             return false;
/* 698 */         }
/* 699 */         return replaceIn(source, 0, source.length());
/* 700 */     }
/* 701 */ 
/* 702 */     /**
/* 703 */      * Replaces all the occurrences of variables within the given source buffer
/* 704 */      * with their matching values from the resolver.
/* 705 */      * The buffer is updated with the result.
/* 706 */      * <p>
/* 707 */      * Only the specified portion of the buffer will be processed.
/* 708 */      * The rest of the buffer is not processed, but it is not deleted.
/* 709 */      * </p>
/* 710 */      *
/* 711 */      * @param source  the buffer to replace in, updated, null returns zero
/* 712 */      * @param offset  the start offset within the array, must be valid
/* 713 */      * @param length  the length within the buffer to be processed, must be valid
/* 714 */      * @return true if altered
/* 715 */      */
/* 716 */     public boolean replaceIn(final StringBuffer source, final int offset, final int length) {
/* 717 */         return replaceIn(null, source, offset, length);
/* 718 */     }
/* 719 */ 
/* 720 */     /**
/* 721 */      * Replaces all the occurrences of variables within the given source buffer
/* 722 */      * with their matching values from the resolver.
/* 723 */      * The buffer is updated with the result.
/* 724 */      * <p>
/* 725 */      * Only the specified portion of the buffer will be processed.
/* 726 */      * The rest of the buffer is not processed, but it is not deleted.
/* 727 */      * </p>
/* 728 */      *
/* 729 */      * @param event the current LogEvent, if one exists.
/* 730 */      * @param source  the buffer to replace in, updated, null returns zero
/* 731 */      * @param offset  the start offset within the array, must be valid
/* 732 */      * @param length  the length within the buffer to be processed, must be valid
/* 733 */      * @return true if altered
/* 734 */      */
/* 735 */     public boolean replaceIn(final LogEvent event, final StringBuffer source, final int offset, final int length) {
/* 736 */         if (source == null) {
/* 737 */             return false;
/* 738 */         }
/* 739 */         final StringBuilder buf = new StringBuilder(length).append(source, offset, length);
/* 740 */         if (!substitute(event, buf, 0, length)) {
/* 741 */             return false;
/* 742 */         }
/* 743 */         source.replace(offset, offset + length, buf.toString());
/* 744 */         return true;
/* 745 */     }
/* 746 */ 
/* 747 */     //-----------------------------------------------------------------------
/* 748 */     /**
/* 749 */      * Replaces all the occurrences of variables within the given source
/* 750 */      * builder with their matching values from the resolver.
/* 751 */      *
/* 752 */      * @param source  the builder to replace in, updated, null returns zero
/* 753 */      * @return true if altered
/* 754 */      */
/* 755 */     public boolean replaceIn(final StringBuilder source) {
/* 756 */         return replaceIn(null, source);
/* 757 */     }
/* 758 */ 
/* 759 */     //-----------------------------------------------------------------------
/* 760 */     /**
/* 761 */      * Replaces all the occurrences of variables within the given source
/* 762 */      * builder with their matching values from the resolver.
/* 763 */      *
/* 764 */      * @param event the current LogEvent, if one exists.
/* 765 */      * @param source  the builder to replace in, updated, null returns zero
/* 766 */      * @return true if altered
/* 767 */      */
/* 768 */     public boolean replaceIn(final LogEvent event, final StringBuilder source) {
/* 769 */         if (source == null) {
/* 770 */             return false;
/* 771 */         }
/* 772 */         return substitute(event, source, 0, source.length());
/* 773 */     }
/* 774 */     /**
/* 775 */      * Replaces all the occurrences of variables within the given source
/* 776 */      * builder with their matching values from the resolver.
/* 777 */      * <p>
/* 778 */      * Only the specified portion of the builder will be processed.
/* 779 */      * The rest of the builder is not processed, but it is not deleted.
/* 780 */      * </p>
/* 781 */      *
/* 782 */      * @param source  the builder to replace in, null returns zero
/* 783 */      * @param offset  the start offset within the array, must be valid
/* 784 */      * @param length  the length within the builder to be processed, must be valid
/* 785 */      * @return true if altered
/* 786 */      */
/* 787 */     public boolean replaceIn(final StringBuilder source, final int offset, final int length) {
/* 788 */         return replaceIn(null, source, offset, length);
/* 789 */     }
/* 790 */ 
/* 791 */     /**
/* 792 */      * Replaces all the occurrences of variables within the given source
/* 793 */      * builder with their matching values from the resolver.
/* 794 */      * <p>
/* 795 */      * Only the specified portion of the builder will be processed.
/* 796 */      * The rest of the builder is not processed, but it is not deleted.
/* 797 */      * </p>
/* 798 */      *
/* 799 */      * @param event   the current LogEvent, if one is present.
/* 800 */      * @param source  the builder to replace in, null returns zero
/* 801 */      * @param offset  the start offset within the array, must be valid
/* 802 */      * @param length  the length within the builder to be processed, must be valid
/* 803 */      * @return true if altered
/* 804 */      */
/* 805 */     public boolean replaceIn(final LogEvent event, final StringBuilder source, final int offset, final int length) {
/* 806 */         if (source == null) {
/* 807 */             return false;
/* 808 */         }
/* 809 */         return substitute(event, source, offset, length);
/* 810 */     }
/* 811 */ 
/* 812 */     //-----------------------------------------------------------------------
/* 813 */     /**
/* 814 */      * Internal method that substitutes the variables.
/* 815 */      * <p>
/* 816 */      * Most users of this class do not need to call this method. This method will
/* 817 */      * be called automatically by another (public) method.
/* 818 */      * </p>
/* 819 */      * <p>
/* 820 */      * Writers of subclasses can override this method if they need access to
/* 821 */      * the substitution process at the start or end.
/* 822 */      * </p>
/* 823 */      *
/* 824 */      * @param event The current LogEvent, if there is one.
/* 825 */      * @param buf  the string builder to substitute into, not null
/* 826 */      * @param offset  the start offset within the builder, must be valid
/* 827 */      * @param length  the length within the builder to be processed, must be valid
/* 828 */      * @return true if altered
/* 829 */      */
/* 830 */     protected boolean substitute(final LogEvent event, final StringBuilder buf, final int offset, final int length) {
/* 831 */         return substitute(event, buf, offset, length, null) > 0;
/* 832 */     }
/* 833 */ 
/* 834 */     /**
/* 835 */      * Recursive handler for multiple levels of interpolation. This is the main
/* 836 */      * interpolation method, which resolves the values of all variable references
/* 837 */      * contained in the passed in text.
/* 838 */      *
/* 839 */      * @param event The current LogEvent, if there is one.
/* 840 */      * @param buf  the string builder to substitute into, not null
/* 841 */      * @param offset  the start offset within the builder, must be valid
/* 842 */      * @param length  the length within the builder to be processed, must be valid
/* 843 */      * @param priorVariables  the stack keeping track of the replaced variables, may be null
/* 844 */      * @return the length change that occurs, unless priorVariables is null when the int
/* 845 */      *  represents a boolean flag as to whether any change occurred.
/* 846 */      */
/* 847 */     private int substitute(final LogEvent event, final StringBuilder buf, final int offset, final int length,
/* 848 */                            List<String> priorVariables) {
/* 849 */         final StrMatcher prefixMatcher = getVariablePrefixMatcher();
/* 850 */         final StrMatcher suffixMatcher = getVariableSuffixMatcher();
/* 851 */         final char escape = getEscapeChar();
/* 852 */         final StrMatcher valueDelimiterMatcher = getValueDelimiterMatcher();
/* 853 */         final boolean substitutionInVariablesEnabled = isEnableSubstitutionInVariables();
/* 854 */ 
/* 855 */         final boolean top = priorVariables == null;
/* 856 */         boolean altered = false;
/* 857 */         int lengthChange = 0;
/* 858 */         char[] chars = getChars(buf);
/* 859 */         int bufEnd = offset + length;
/* 860 */         int pos = offset;
/* 861 */         while (pos < bufEnd) {
/* 862 */             final int startMatchLen = prefixMatcher.isMatch(chars, pos, offset,
/* 863 */                     bufEnd);
/* 864 */             if (startMatchLen == 0) {
/* 865 */                 pos++;
/* 866 */             } else {
/* 867 */                 // found variable start marker
/* 868 */                 if (pos > offset && chars[pos - 1] == escape) {
/* 869 */                     // escaped
/* 870 */                     buf.deleteCharAt(pos - 1);
/* 871 */                     chars = getChars(buf);
/* 872 */                     lengthChange--;
/* 873 */                     altered = true;
/* 874 */                     bufEnd--;
/* 875 */                 } else {
/* 876 */                     // find suffix
/* 877 */                     final int startPos = pos;
/* 878 */                     pos += startMatchLen;
/* 879 */                     int endMatchLen = 0;
/* 880 */                     int nestedVarCount = 0;
/* 881 */                     while (pos < bufEnd) {
/* 882 */                         if (substitutionInVariablesEnabled
/* 883 */                                 && (endMatchLen = prefixMatcher.isMatch(chars,
/* 884 */                                         pos, offset, bufEnd)) != 0) {
/* 885 */                             // found a nested variable start
/* 886 */                             nestedVarCount++;
/* 887 */                             pos += endMatchLen;
/* 888 */                             continue;
/* 889 */                         }
/* 890 */ 
/* 891 */                         endMatchLen = suffixMatcher.isMatch(chars, pos, offset,
/* 892 */                                 bufEnd);
/* 893 */                         if (endMatchLen == 0) {
/* 894 */                             pos++;
/* 895 */                         } else {
/* 896 */                             // found variable end marker
/* 897 */                             if (nestedVarCount == 0) {
/* 898 */                                 String varNameExpr = new String(chars, startPos
/* 899 */                                         + startMatchLen, pos - startPos
/* 900 */                                         - startMatchLen);
/* 901 */                                 if (substitutionInVariablesEnabled) {
/* 902 */                                     final StringBuilder bufName = new StringBuilder(varNameExpr);
/* 903 */                                     substitute(event, bufName, 0, bufName.length());
/* 904 */                                     varNameExpr = bufName.toString();
/* 905 */                                 }
/* 906 */                                 pos += endMatchLen;
/* 907 */                                 final int endPos = pos;
/* 908 */ 
/* 909 */                                 String varName = varNameExpr;
/* 910 */                                 String varDefaultValue = null;
/* 911 */ 
/* 912 */                                 if (valueDelimiterMatcher != null) {
/* 913 */                                     final char [] varNameExprChars = varNameExpr.toCharArray();
/* 914 */                                     int valueDelimiterMatchLen = 0;
/* 915 */                                     for (int i = 0; i < varNameExprChars.length; i++) {
/* 916 */                                         // if there's any nested variable when nested variable substitution disabled, then stop resolving name and default value.
/* 917 */                                         if (!substitutionInVariablesEnabled
/* 918 */                                                 && prefixMatcher.isMatch(varNameExprChars, i, i, varNameExprChars.length) != 0) {
/* 919 */                                             break;
/* 920 */                                         }
/* 921 */                                         if ((valueDelimiterMatchLen = valueDelimiterMatcher.isMatch(varNameExprChars, i)) != 0) {
/* 922 */                                             varName = varNameExpr.substring(0, i);
/* 923 */                                             varDefaultValue = varNameExpr.substring(i + valueDelimiterMatchLen);
/* 924 */                                             break;
/* 925 */                                         }
/* 926 */                                     }
/* 927 */                                 }
/* 928 */ 
/* 929 */                                 // on the first call initialize priorVariables
/* 930 */                                 if (priorVariables == null) {
/* 931 */                                     priorVariables = new ArrayList<>();
/* 932 */                                     priorVariables.add(new String(chars,
/* 933 */                                             offset, length + lengthChange));
/* 934 */                                 }
/* 935 */ 
/* 936 */                                 // handle cyclic substitution
/* 937 */                                 checkCyclicSubstitution(varName, priorVariables);
/* 938 */                                 priorVariables.add(varName);
/* 939 */ 
/* 940 */                                 // resolve the variable
/* 941 */                                 String varValue = resolveVariable(event, varName, buf,
/* 942 */                                         startPos, endPos);
/* 943 */                                 if (varValue == null) {
/* 944 */                                     varValue = varDefaultValue;
/* 945 */                                 }
/* 946 */                                 if (varValue != null) {
/* 947 */                                     // recursive replace
/* 948 */                                     final int varLen = varValue.length();
/* 949 */                                     buf.replace(startPos, endPos, varValue);
/* 950 */                                     altered = true;
/* 951 */                                     int change = substitute(event, buf, startPos,
/* 952 */                                             varLen, priorVariables);
/* 953 */                                     change = change
/* 954 */                                             + (varLen - (endPos - startPos));
/* 955 */                                     pos += change;
/* 956 */                                     bufEnd += change;
/* 957 */                                     lengthChange += change;
/* 958 */                                     chars = getChars(buf); // in case buffer was
/* 959 */                                                         // altered
/* 960 */                                 }
/* 961 */ 
/* 962 */                                 // remove variable from the cyclic stack
/* 963 */                                 priorVariables
/* 964 */                                         .remove(priorVariables.size() - 1);
/* 965 */                                 break;
/* 966 */                             }
/* 967 */                             nestedVarCount--;
/* 968 */                             pos += endMatchLen;
/* 969 */                         }
/* 970 */                     }
/* 971 */                 }
/* 972 */             }
/* 973 */         }
/* 974 */         if (top) {
/* 975 */             return altered ? 1 : 0;
/* 976 */         }
/* 977 */         return lengthChange;
/* 978 */     }
/* 979 */ 
/* 980 */     /**
/* 981 */      * Checks if the specified variable is already in the stack (list) of variables.
/* 982 */      *
/* 983 */      * @param varName  the variable name to check
/* 984 */      * @param priorVariables  the list of prior variables
/* 985 */      */
/* 986 */     private void checkCyclicSubstitution(final String varName, final List<String> priorVariables) {
/* 987 */         if (!priorVariables.contains(varName)) {
/* 988 */             return;
/* 989 */         }
/* 990 */         final StringBuilder buf = new StringBuilder(BUF_SIZE);
/* 991 */         buf.append("Infinite loop in property interpolation of ");
/* 992 */         buf.append(priorVariables.remove(0));
/* 993 */         buf.append(": ");
/* 994 */         appendWithSeparators(buf, priorVariables, "->");
/* 995 */         throw new IllegalStateException(buf.toString());
/* 996 */     }
/* 997 */ 
/* 998 */     /**
/* 999 */      * Internal method that resolves the value of a variable.
/* 1000 */      * <p>
/* 1001 */      * Most users of this class do not need to call this method. This method is
/* 1002 */      * called automatically by the substitution process.
/* 1003 */      * </p>
/* 1004 */      * <p>
/* 1005 */      * Writers of subclasses can override this method if they need to alter
/* 1006 */      * how each substitution occurs. The method is passed the variable's name
/* 1007 */      * and must return the corresponding value. This implementation uses the
/* 1008 */      * {@link #getVariableResolver()} with the variable's name as the key.
/* 1009 */      * </p>
/* 1010 */      *
/* 1011 */      * @param event The LogEvent, if there is one.
/* 1012 */      * @param variableName  the name of the variable, not null
/* 1013 */      * @param buf  the buffer where the substitution is occurring, not null
/* 1014 */      * @param startPos  the start position of the variable including the prefix, valid
/* 1015 */      * @param endPos  the end position of the variable including the suffix, valid
/* 1016 */      * @return the variable's value or <b>null</b> if the variable is unknown
/* 1017 */      */
/* 1018 */     protected String resolveVariable(final LogEvent event, final String variableName, final StringBuilder buf,
/* 1019 */                                      final int startPos, final int endPos) {
/* 1020 */         final StrLookup resolver = getVariableResolver();
/* 1021 */         if (resolver == null) {
/* 1022 */             return null;
/* 1023 */         }
/* 1024 */         return resolver.lookup(event, variableName);
/* 1025 */     }
/* 1026 */ 
/* 1027 */     // Escape
/* 1028 */     //-----------------------------------------------------------------------
/* 1029 */     /**
/* 1030 */      * Returns the escape character.
/* 1031 */      *
/* 1032 */      * @return the character used for escaping variable references
/* 1033 */      */
/* 1034 */     public char getEscapeChar() {
/* 1035 */         return this.escapeChar;
/* 1036 */     }
/* 1037 */ 
/* 1038 */     /**
/* 1039 */      * Sets the escape character.
/* 1040 */      * If this character is placed before a variable reference in the source
/* 1041 */      * text, this variable will be ignored.
/* 1042 */      *
/* 1043 */      * @param escapeCharacter  the escape character (0 for disabling escaping)
/* 1044 */      */
/* 1045 */     public void setEscapeChar(final char escapeCharacter) {
/* 1046 */         this.escapeChar = escapeCharacter;
/* 1047 */     }
/* 1048 */ 
/* 1049 */     // Prefix
/* 1050 */     //-----------------------------------------------------------------------
/* 1051 */     /**
/* 1052 */      * Gets the variable prefix matcher currently in use.
/* 1053 */      * <p>
/* 1054 */      * The variable prefix is the character or characters that identify the
/* 1055 */      * start of a variable. This prefix is expressed in terms of a matcher
/* 1056 */      * allowing advanced prefix matches.
/* 1057 */      * </p>
/* 1058 */      *
/* 1059 */      * @return the prefix matcher in use
/* 1060 */      */
/* 1061 */     public StrMatcher getVariablePrefixMatcher() {
/* 1062 */         return prefixMatcher;
/* 1063 */     }
/* 1064 */ 
/* 1065 */     /**
/* 1066 */      * Sets the variable prefix matcher currently in use.
/* 1067 */      * <p>
/* 1068 */      * The variable prefix is the character or characters that identify the
/* 1069 */      * start of a variable. This prefix is expressed in terms of a matcher
/* 1070 */      * allowing advanced prefix matches.
/* 1071 */      * </p>
/* 1072 */      *
/* 1073 */      * @param prefixMatcher  the prefix matcher to use, null ignored
/* 1074 */      * @return this, to enable chaining
/* 1075 */      * @throws IllegalArgumentException if the prefix matcher is null
/* 1076 */      */
/* 1077 */     public StrSubstitutor setVariablePrefixMatcher(final StrMatcher prefixMatcher) {
/* 1078 */         if (prefixMatcher == null) {
/* 1079 */             throw new IllegalArgumentException("Variable prefix matcher must not be null!");
/* 1080 */         }
/* 1081 */         this.prefixMatcher = prefixMatcher;
/* 1082 */         return this;
/* 1083 */     }
/* 1084 */ 
/* 1085 */     /**
/* 1086 */      * Sets the variable prefix to use.
/* 1087 */      * <p>
/* 1088 */      * The variable prefix is the character or characters that identify the
/* 1089 */      * start of a variable. This method allows a single character prefix to
/* 1090 */      * be easily set.
/* 1091 */      * </p>
/* 1092 */      *
/* 1093 */      * @param prefix  the prefix character to use
/* 1094 */      * @return this, to enable chaining
/* 1095 */      */
/* 1096 */     public StrSubstitutor setVariablePrefix(final char prefix) {
/* 1097 */         return setVariablePrefixMatcher(StrMatcher.charMatcher(prefix));
/* 1098 */     }
/* 1099 */ 
/* 1100 */     /**
/* 1101 */      * Sets the variable prefix to use.
/* 1102 */      * <p>
/* 1103 */      * The variable prefix is the character or characters that identify the
/* 1104 */      * start of a variable. This method allows a string prefix to be easily set.
/* 1105 */      * </p>
/* 1106 */      *
/* 1107 */      * @param prefix  the prefix for variables, not null
/* 1108 */      * @return this, to enable chaining
/* 1109 */      * @throws IllegalArgumentException if the prefix is null
/* 1110 */      */
/* 1111 */     public StrSubstitutor setVariablePrefix(final String prefix) {
/* 1112 */        if (prefix == null) {
/* 1113 */             throw new IllegalArgumentException("Variable prefix must not be null!");
/* 1114 */         }
/* 1115 */         return setVariablePrefixMatcher(StrMatcher.stringMatcher(prefix));
/* 1116 */     }
/* 1117 */ 
/* 1118 */     // Suffix
/* 1119 */     //-----------------------------------------------------------------------
/* 1120 */     /**
/* 1121 */      * Gets the variable suffix matcher currently in use.
/* 1122 */      * <p>
/* 1123 */      * The variable suffix is the character or characters that identify the
/* 1124 */      * end of a variable. This suffix is expressed in terms of a matcher
/* 1125 */      * allowing advanced suffix matches.
/* 1126 */      * </p>
/* 1127 */      *
/* 1128 */      * @return the suffix matcher in use
/* 1129 */      */
/* 1130 */     public StrMatcher getVariableSuffixMatcher() {
/* 1131 */         return suffixMatcher;
/* 1132 */     }
/* 1133 */ 
/* 1134 */     /**
/* 1135 */      * Sets the variable suffix matcher currently in use.
/* 1136 */      * <p>
/* 1137 */      * The variable suffix is the character or characters that identify the
/* 1138 */      * end of a variable. This suffix is expressed in terms of a matcher
/* 1139 */      * allowing advanced suffix matches.
/* 1140 */      * </p>
/* 1141 */      *
/* 1142 */      * @param suffixMatcher  the suffix matcher to use, null ignored
/* 1143 */      * @return this, to enable chaining
/* 1144 */      * @throws IllegalArgumentException if the suffix matcher is null
/* 1145 */      */
/* 1146 */     public StrSubstitutor setVariableSuffixMatcher(final StrMatcher suffixMatcher) {
/* 1147 */         if (suffixMatcher == null) {
/* 1148 */             throw new IllegalArgumentException("Variable suffix matcher must not be null!");
/* 1149 */         }
/* 1150 */         this.suffixMatcher = suffixMatcher;
/* 1151 */         return this;
/* 1152 */     }
/* 1153 */ 
/* 1154 */     /**
/* 1155 */      * Sets the variable suffix to use.
/* 1156 */      * <p>
/* 1157 */      * The variable suffix is the character or characters that identify the
/* 1158 */      * end of a variable. This method allows a single character suffix to
/* 1159 */      * be easily set.
/* 1160 */      * </p>
/* 1161 */      *
/* 1162 */      * @param suffix  the suffix character to use
/* 1163 */      * @return this, to enable chaining
/* 1164 */      */
/* 1165 */     public StrSubstitutor setVariableSuffix(final char suffix) {
/* 1166 */         return setVariableSuffixMatcher(StrMatcher.charMatcher(suffix));
/* 1167 */     }
/* 1168 */ 
/* 1169 */     /**
/* 1170 */      * Sets the variable suffix to use.
/* 1171 */      * <p>
/* 1172 */      * The variable suffix is the character or characters that identify the
/* 1173 */      * end of a variable. This method allows a string suffix to be easily set.
/* 1174 */      * </p>
/* 1175 */      *
/* 1176 */      * @param suffix  the suffix for variables, not null
/* 1177 */      * @return this, to enable chaining
/* 1178 */      * @throws IllegalArgumentException if the suffix is null
/* 1179 */      */
/* 1180 */     public StrSubstitutor setVariableSuffix(final String suffix) {
/* 1181 */        if (suffix == null) {
/* 1182 */             throw new IllegalArgumentException("Variable suffix must not be null!");
/* 1183 */         }
/* 1184 */         return setVariableSuffixMatcher(StrMatcher.stringMatcher(suffix));
/* 1185 */     }
/* 1186 */ 
/* 1187 */     // Variable Default Value Delimiter
/* 1188 */     //-----------------------------------------------------------------------
/* 1189 */     /**
/* 1190 */      * Gets the variable default value delimiter matcher currently in use.
/* 1191 */      * <p>
/* 1192 */      * The variable default value delimiter is the character or characters that delimit the
/* 1193 */      * variable name and the variable default value. This delimiter is expressed in terms of a matcher
/* 1194 */      * allowing advanced variable default value delimiter matches.
/* 1195 */      * </p>
/* 1196 */      * <p>
/* 1197 */      * If it returns null, then the variable default value resolution is disabled.
/* 1198 */      * </p>
/* 1199 */      *
/* 1200 */      * @return the variable default value delimiter matcher in use, may be null
/* 1201 */      */
/* 1202 */     public StrMatcher getValueDelimiterMatcher() {
/* 1203 */         return valueDelimiterMatcher;
/* 1204 */     }
/* 1205 */ 
/* 1206 */     /**
/* 1207 */      * Sets the variable default value delimiter matcher to use.
/* 1208 */      * <p>
/* 1209 */      * The variable default value delimiter is the character or characters that delimit the
/* 1210 */      * variable name and the variable default value. This delimiter is expressed in terms of a matcher
/* 1211 */      * allowing advanced variable default value delimiter matches.
/* 1212 */      * </p>
/* 1213 */      * <p>
/* 1214 */      * If the <code>valueDelimiterMatcher</code> is null, then the variable default value resolution
/* 1215 */      * becomes disabled.
/* 1216 */      * </p>
/* 1217 */      *
/* 1218 */      * @param valueDelimiterMatcher  variable default value delimiter matcher to use, may be null
/* 1219 */      * @return this, to enable chaining
/* 1220 */      */
/* 1221 */     public StrSubstitutor setValueDelimiterMatcher(final StrMatcher valueDelimiterMatcher) {
/* 1222 */         this.valueDelimiterMatcher = valueDelimiterMatcher;
/* 1223 */         return this;
/* 1224 */     }
/* 1225 */ 
/* 1226 */     /**
/* 1227 */      * Sets the variable default value delimiter to use.
/* 1228 */      * <p>
/* 1229 */      * The variable default value delimiter is the character or characters that delimit the
/* 1230 */      * variable name and the variable default value. This method allows a single character
/* 1231 */      * variable default value delimiter to be easily set.
/* 1232 */      * </p>
/* 1233 */      *
/* 1234 */      * @param valueDelimiter  the variable default value delimiter character to use
/* 1235 */      * @return this, to enable chaining
/* 1236 */      */
/* 1237 */     public StrSubstitutor setValueDelimiter(final char valueDelimiter) {
/* 1238 */         return setValueDelimiterMatcher(StrMatcher.charMatcher(valueDelimiter));
/* 1239 */     }
/* 1240 */ 
/* 1241 */     /**
/* 1242 */      * Sets the variable default value delimiter to use.
/* 1243 */      * <p>
/* 1244 */      * The variable default value delimiter is the character or characters that delimit the
/* 1245 */      * variable name and the variable default value. This method allows a string
/* 1246 */      * variable default value delimiter to be easily set.
/* 1247 */      * </p>
/* 1248 */      * <p>
/* 1249 */      * If the <code>valueDelimiter</code> is null or empty string, then the variable default
/* 1250 */      * value resolution becomes disabled.
/* 1251 */      * </p>
/* 1252 */      *
/* 1253 */      * @param valueDelimiter  the variable default value delimiter string to use, may be null or empty
/* 1254 */      * @return this, to enable chaining
/* 1255 */      */
/* 1256 */     public StrSubstitutor setValueDelimiter(final String valueDelimiter) {
/* 1257 */         if (Strings.isEmpty(valueDelimiter)) {
/* 1258 */             setValueDelimiterMatcher(null);
/* 1259 */             return this;
/* 1260 */         }
/* 1261 */         return setValueDelimiterMatcher(StrMatcher.stringMatcher(valueDelimiter));
/* 1262 */     }
/* 1263 */ 
/* 1264 */     // Resolver
/* 1265 */     //-----------------------------------------------------------------------
/* 1266 */     /**
/* 1267 */      * Gets the VariableResolver that is used to lookup variables.
/* 1268 */      *
/* 1269 */      * @return the VariableResolver
/* 1270 */      */
/* 1271 */     public StrLookup getVariableResolver() {
/* 1272 */         return this.variableResolver;
/* 1273 */     }
/* 1274 */ 
/* 1275 */     /**
/* 1276 */      * Sets the VariableResolver that is used to lookup variables.
/* 1277 */      *
/* 1278 */      * @param variableResolver  the VariableResolver
/* 1279 */      */
/* 1280 */     public void setVariableResolver(final StrLookup variableResolver) {
/* 1281 */         this.variableResolver = variableResolver;
/* 1282 */     }
/* 1283 */ 
/* 1284 */     // Substitution support in variable names
/* 1285 */     //-----------------------------------------------------------------------
/* 1286 */     /**
/* 1287 */      * Returns a flag whether substitution is done in variable names.
/* 1288 */      *
/* 1289 */      * @return the substitution in variable names flag
/* 1290 */      */
/* 1291 */     public boolean isEnableSubstitutionInVariables() {
/* 1292 */         return enableSubstitutionInVariables;
/* 1293 */     }
/* 1294 */ 
/* 1295 */     /**
/* 1296 */      * Sets a flag whether substitution is done in variable names. If set to
/* 1297 */      * <b>true</b>, the names of variables can contain other variables which are
/* 1298 */      * processed first before the original variable is evaluated, e.g.
/* 1299 */      * <code>${jre-${java.version}}</code>. The default value is <b>false</b>.
/* 1300 */      *
/* 1301 */      * @param enableSubstitutionInVariables the new value of the flag
/* 1302 */      */
/* 1303 */     public void setEnableSubstitutionInVariables(final boolean enableSubstitutionInVariables) {
/* 1304 */         this.enableSubstitutionInVariables = enableSubstitutionInVariables;
/* 1305 */     }
/* 1306 */ 
/* 1307 */     private char[] getChars(final StringBuilder sb) {
/* 1308 */         final char[] chars = new char[sb.length()];
/* 1309 */         sb.getChars(0, sb.length(), chars, 0);
/* 1310 */         return chars;
/* 1311 */     }
/* 1312 */ 
/* 1313 */     /**
/* 1314 */      * Appends a iterable placing separators between each value, but
/* 1315 */      * not before the first or after the last.
/* 1316 */      * Appending a null iterable will have no effect..
/* 1317 */      *
/* 1318 */      * @param sb StringBuilder that contains the String being constructed.
/* 1319 */      * @param iterable  the iterable to append
/* 1320 */      * @param separator  the separator to use, null means no separator
/* 1321 */      */
/* 1322 */     public void appendWithSeparators(final StringBuilder sb, final Iterable<?> iterable, String separator) {
/* 1323 */         if (iterable != null) {
/* 1324 */             separator = separator == null ? Strings.EMPTY : separator;
/* 1325 */             final Iterator<?> it = iterable.iterator();
/* 1326 */             while (it.hasNext()) {
/* 1327 */                 sb.append(it.next());
/* 1328 */                 if (it.hasNext()) {
/* 1329 */                     sb.append(separator);
/* 1330 */                 }
/* 1331 */             }
/* 1332 */         }
/* 1333 */     }
/* 1334 */ 
/* 1335 */     @Override
/* 1336 */     public String toString() {
/* 1337 */         return "StrSubstitutor(" + variableResolver.toString() + ')';
/* 1338 */     }
/* 1339 */ }