'use strict';

var grunt = require('../grunt');

// Get/set config data. If value was passed, set. Otherwise, get.
var config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    // Two arguments were passed, set the property's value.
    return config.set(prop, value);
  } else {
    // Get the property's value (or the entire data object).
    return config.get(prop);
  }
};

// The actual config data.
config.data = {};

/**
 * Escape dots in a namespace string to prevent unintended nesting.
 * @param {string} str - The input string.
 * @returns {string} - The escaped string.
 */
config.escape = function(str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Convert prop to a string representation.
 * @param {string|string[]} prop - Property path (string or array).
 * @returns {string} - Escaped namespace string.
 */
config.getPropString = function(prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Get raw, unprocessed config data.
 * @param {string|string[]} [prop] - Optional property path.
 * @returns {any|Object} - Raw config value or entire data object.
 */
config.getRaw = function(prop) {
  if (prop) {
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  return config.data;
};

// Match '<%= FOO %>' where FOO is a propString, e.g., foo or foo.bar but not foo() or foo.bar().
var propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Get config data, recursively processing templates.
 * @param {string|string[]} prop - Property path.
 * @returns {any} - Processed config value.
 */
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Recursively process raw config values, expanding templates.
 * @param {any} raw - Raw config value.
 * @returns {any} - Processed value.
 */
config.process = function(raw) {
  return grunt.util.recurse(raw, processTemplateValue);
};

/**
 * Process a single template value during recursion.
 * @param {any} value - Raw value!
 * @returns {any} - Processed value.
 */
function processTemplateValue(value) {
  if (typeof value !== 'string') {
    return value;
  }

  var matches = value.match(propStringTmplRe);
  if (matches) {
    var result = config.get(matches[1]);
    if (result != null) {
      return result;
    }
  }

  return grunt.template.process(value, {data: config.data});
}

/**
 * Set config data.
 * @param {string|string[]} prop - Property path.
 * @param {any} value - Value to set.
 * @returns {any} - The set value.
 */
config.set = function(prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep merge config data.
 * @param {Object} obj - Object to merge.
 * @returns {Object} - Merged config data.
 */
config.merge = function(obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initialize config data.
 * @param {Object} [obj] - Optional initial data.
 * @returns {Object} - Initialized config data.
 */
config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (config.data = obj || {});
};

/**
 * Validate required config properties exist.
 * @param {...string} props - Property names to verify.
 */
config.requires = function() {
  var p = grunt.util.pluralize;
  var props = grunt.util.toArray(arguments).map(config.getPropString);
  var msg = 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
  grunt.verbose.write(msg);

  var failProps = config.data && props.filter(isMissing).map(function(prop) {
    return '"' + prop + '"';
  });

  if (config.data && failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  }
  throw grunt.util.error('Required config propert' +
    p(failProps.length, 'y/ies') + ' ' + failProps.join(', ') + ' missing.');
};

/**
 * Check if a property is missing in the config.
 * @param {string} prop - Property name.
 * @returns {boolean} - True if missing.
 */
function isMissing(prop) {
  return config.get(prop) == null;
}