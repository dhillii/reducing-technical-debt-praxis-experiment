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
 * Checks if value matches template pattern and retrieves config value.
 * @param {string} value - Value to check for template pattern
 * @returns {*} Config value if pattern matches and result is not null/undefined, null otherwise
 */
const processTemplateMatch = function(value) {
  const matches = value.match(propStringTmplRe);
  if (!matches) {
    return null;
  }
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
  const templateResult = processTemplateMatch(value);
  if (templateResult != null) {
    return templateResult;
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
 * @param {Array<string>} props - Property paths to check
 * @returns {Array<string>} Properties that are null or undefined in config
 */
const getFailingProps = function(props) {
  return props.filter(function(prop) {
    return config.get(prop) == null;
  }).map(function(prop) {
    return '"' + prop + '"';
  });
};

/**
 * Determines if config validation passed.
 * @param {boolean} configExists - Whether config.data exists
 * @param {Array<string>} failProps - Failed property checks
 * @returns {boolean} True if validation passed
 */
const isValidationPassed = function(configExists, failProps) {
  return configExists && failProps.length === 0;
};

/**
 * Throws appropriate error based on validation failure type.
 * @param {boolean} configExists - Whether config.data exists
 * @param {Array<string>} failProps - Failed property paths
 */
const throwValidationError = function(configExists, failProps) {
  const p = grunt.util.pluralize;
  if (!configExists) {
    throw grunt.util.error('Unable to load config.');
  }
  throw grunt.util.error('Required config propert' +
    p(failProps.length, 'y/ies') + ' ' + failProps.join(', ') + ' missing.');
};

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = function() {
  const p = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
  grunt.verbose.write(msg);
  
  const configExists = !!config.data;
  const failProps = configExists ? getFailingProps(props) : [];
  
  if (isValidationPassed(configExists, failProps)) {
    grunt.verbose.ok();
    return true;
  }
  
  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  throwValidationError(configExists, failProps);
};
```