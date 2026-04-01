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
 * Determines if a property should be retrieved from config.
 * @param {*} prop - The property identifier
 * @returns {boolean} True if prop is defined
 */
const isPropDefined = (prop) => prop != null;

/**
 * Retrieves a specific property or entire config data.
 * @param {*} prop - Optional property identifier
 * @returns {*} The property value or entire config object
 */
const getRawValue = (prop) => {
  return isPropDefined(prop)
    ? grunt.util.namespace.get(config.data, config.getPropString(prop))
    : config.data;
};

// Get raw, unprocessed config data.
config.getRaw = function(prop) {
  return getRawValue(prop);
};

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Checks if a value matches the template pattern.
 * @param {string} value - The value to check
 * @returns {Array|null} Match array or null
 */
const getTemplateMatch = (value) => {
  return typeof value === 'string' ? value.match(propStringTmplRe) : null;
};

/**
 * Processes a template match by retrieving the referenced config value.
 * @param {Array} matches - The regex match array
 * @returns {*} The config value or null if not found
 */
const processTemplateMatch = (matches) => {
  const result = config.get(matches[1]);
  return result != null ? result : null;
};

/**
 * Processes a single value, handling templates and recursion.
 * @param {*} value - The value to process
 * @returns {*} The processed value
 */
const processValue = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const matches = getTemplateMatch(value);
  if (matches) {
    const result = processTemplateMatch(matches);
    if (result != null) {
      return result;
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
 * @param {Array} props - Property names to check
 * @returns {Array} Properties with null or undefined values
 */
const getMissingProps = (props) => {
  return config.data ? props.filter((prop) => config.get(prop) == null) : props;
};

/**
 * Formats missing properties as quoted strings.
 * @param {Array} failProps - Missing property names
 * @returns {Array} Formatted property strings
 */
const formatFailProps = (failProps) => {
  return failProps.map((prop) => '"' + prop + '"');
};

/**
 * Generates the verification message for config properties.
 * @param {Array} props - Property names being verified
 * @returns {string} The verification message
 */
const getVerificationMessage = (props) => {
  const p = grunt.util.pluralize;
  return 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
};

/**
 * Handles successful config verification.
 * @param {string} msg - The verification message
 * @returns {boolean} Always returns true
 */
const handleVerificationSuccess = (msg) => {
  grunt.verbose.ok();
  return true;
};

/**
 * Handles failed config verification.
 * @param {string} msg - The verification message
 * @param {Array} failProps - Missing properties
 * @throws {Error} Throws error with details about missing properties
 */
const handleVerificationFailure = (msg, failProps) => {
  const p = grunt.util.pluralize;
  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');

  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  } else {
    throw grunt.util.error('Required config propert' +
      p(failProps.length, 'y/ies') + ' ' + failProps.join(', ') + ' missing.');
  }
};

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = function() {
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = getVerificationMessage(props);
  grunt.verbose.write(msg);

  const failProps = formatFailProps(getMissingProps(props));

  if (config.data && failProps.length === 0) {
    return handleVerificationSuccess(msg);
  } else {
    handleVerificationFailure(msg, failProps);
  }
};
```