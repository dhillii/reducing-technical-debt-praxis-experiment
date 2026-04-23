'use strict';

const grunt = require('../grunt');

// Get/set config data. If value was passed, set. Otherwise, get.
const config = module.exports = function(prop, value) {
  const hasValue = arguments.length === 2;
  return hasValue ? config.set(prop, value) : config.get(prop);
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

// Get raw, unprocessed config data.
config.getRaw = function(prop) {
  if (prop) {
    // Prop was passed, get that specific property's value.
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  } else {
    // No prop was passed, return the entire config.data object.
    return config.data;
  }
};

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

// Get config data, recursively processing templates.
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Processes a template value by attempting to resolve it as a config property
 * or as a template string.
 * @param {*} value - The value to process
 * @returns {*} The processed value
 */
const processTemplateValue = function(value) {
  if (typeof value !== 'string') { return value; }
  
  const matches = value.match(propStringTmplRe);
  if (matches) {
    const result = config.get(matches[1]);
    if (result != null) { return result; }
  }
  
  return grunt.template.process(value, {data: config.data});
};

// Expand a config value recursively. Used for post-processing raw values
// already retrieved from the config.
config.process = function(raw) {
  return grunt.util.recurse(raw, processTemplateValue);
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
 * Filters properties to find those missing from config data.
 * @param {string[]} props - Property names to check
 * @returns {string[]} Missing property names
 */
const findMissingProps = function(props) {
  if (!config.data) { return props; }
  return props.filter(function(prop) {
    return config.get(prop) == null;
  });
};

/**
 * Formats missing properties for error message.
 * @param {string[]} failProps - Missing property names
 * @returns {string} Formatted property list
 */
const formatMissingProps = function(failProps) {
  return failProps.map(function(prop) {
    return '"' + prop + '"';
  }).join(', ');
};

/**
 * Throws appropriate error based on config state and missing properties.
 * @param {string[]} failProps - Missing property names
 * @throws {Error} Configuration error
 */
const throwConfigError = function(failProps) {
  const p = grunt.util.pluralize;
  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  } else {
    throw grunt.util.error('Required config propert' +
      p(failProps.length, 'y/ies') + ' ' + formatMissingProps(failProps) + ' missing.');
  }
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
  
  const failProps = findMissingProps(props);
  
  if (config.data && failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  } else {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    throwConfigError(failProps);
  }
};