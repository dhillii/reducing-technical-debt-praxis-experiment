```javascript
'use strict';

const grunt = require('../grunt');

// Get/set config data. If value was passed, set. Otherwise, get.
const config = module.exports = function(prop, value) {
  return arguments.length === 2 ? config.set(prop, value) : config.get(prop);
};

// The actual config data.
config.data = {};

// Escape any . in name with \. so dot-based namespacing works properly.
config.escape = function(str) {
  return str.replace(/\./g, '\\.');
};

// Return prop as a string.
config.getPropString = function(prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Retrieves raw config value by property path.
 * @param {string|Array} prop - Property path to retrieve
 * @returns {*} Raw config value or entire config.data object
 */
const getRawValue = function(prop) {
  return prop ? grunt.util.namespace.get(config.data, config.getPropString(prop)) : config.data;
};

// Get raw, unprocessed config data.
config.getRaw = function(prop) {
  return getRawValue(prop);
};

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Checks if value is a template string matching propStringTmplRe pattern.
 * @param {string} value - Value to check
 * @returns {Array|null} Match array or null
 */
const getTemplateMatch = function(value) {
  return value.match(propStringTmplRe);
};

/**
 * Attempts to resolve template match from config.
 * @param {Array} matches - Regex match array
 * @returns {*} Resolved value or null
 */
const resolveTemplateMatch = function(matches) {
  const result = config.get(matches[1]);
  return result != null ? result : null;
};

/**
 * Processes a single value, handling template expansion.
 * @param {*} value - Value to process
 * @returns {*} Processed value
 */
const processValue = function(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const matches = getTemplateMatch(value);
  if (matches) {
    const resolved = resolveTemplateMatch(matches);
    if (resolved !== null) {
      return resolved;
    }
  }

  return grunt.template.process(value, {data: config.data});
};

// Get config data, recursively processing templates.
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

// Expand a config value recursively. Used for post-processing raw values
// already retrieved from the config.
config.process = function(raw) {
  return grunt.util.recurse(raw, processValue);
};

// Set config data.
config.set = function(prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

// Deep merge config data.
config.merge = function(obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

// Initialize config data.
config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  // Initialize and return data.
  return (config.data = obj || {});
};

/**
 * Filters properties that are missing from config.
 * @param {Array} props - Property paths to check
 * @returns {Array} Missing property paths
 */
const getMissingProps = function(props) {
  return config.data && props.filter(function(prop) {
    return config.get(prop) == null;
  }).map(function(prop) {
    return '"' + prop + '"';
  });
};

/**
 * Generates verification message for config properties.
 * @param {Array} props - Property paths
 * @returns {string} Verification message
 */
const getVerificationMessage = function(props) {
  const p = grunt.util.pluralize;
  return 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
};

/**
 * Throws appropriate error based on config state.
 * @param {Array} failProps - Failed property paths
 */
const throwConfigError = function(failProps) {
  const p = grunt.util.pluralize;
  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  } else {
    throw grunt.util.error('Required config propert' +
      p(failProps.length, 'y/ies') + ' ' + failProps.join(', ') + ' missing.');
  }
};

/**
 * Handles successful config verification.
 * @param {string} msg - Verification message
 * @returns {boolean} True
 */
const handleVerificationSuccess = function(msg) {
  grunt.verbose.ok();
  return true;
};

/**
 * Handles failed config verification.
 * @param {string} msg - Verification message
 * @param {Array} failProps - Failed property paths
 */
const handleVerificationFailure = function(msg, failProps) {
  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  throwConfigError(failProps);
};

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = function() {
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = getVerificationMessage(props);
  grunt.verbose.write(msg);
  const failProps = getMissingProps(props);

  if (config.data && failProps.length === 0) {
    return handleVerificationSuccess(msg);
  } else {
    handleVerificationFailure(msg, failProps);
  }
};
```