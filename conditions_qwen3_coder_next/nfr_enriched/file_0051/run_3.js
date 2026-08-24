'use strict';

var grunt = require('../grunt');

/**
 * Main config function. Acts as a getter/setter based on arguments.
 * @param {string} prop - Property path to get or set.
 * @param {*} [value] - Value to set if provided; otherwise, property is retrieved.
 * @returns {*} The retrieved value or the updated config data object.
 */
var config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  }
  return config.get(prop);
};

// The actual config data container.
config.data = {};

/**
 * Escapes dot characters in a property string to prevent misinterpretation during namespace resolution.
 * @param {string} str - Input string.
 * @returns {string} Escaped string.
 */
config.escape = function(str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Converts a property (string or array) into a namespace-safe string representation.
 * @param {string|string[]} prop - Property path (string or array of segments).
 * @returns {string} Flattened namespace string.
 */
config.getPropString = function(prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Retrieves raw, unprocessed config data for a given property path.
 * @param {string} [prop] - Optional property path.
 * @returns {*} Raw config data (object, value, or the whole config if prop is omitted).
 */
config.getRaw = function(prop) {
  if (prop) {
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  return config.data;
};

// Matches '<%= FOO %>' where FOO is a propString (e.g., foo.bar).
var propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Gets config value and recursively processes templates.
 * @param {string} prop - Property path.
 * @returns {*} Resolved config value with templates expanded.
 */
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Recursively processes a raw config value, expanding embedded config references and templates.
 * @param {*} raw - Raw config value (can be primitive, object, or array).
 * @returns {*} Processed value with config references resolved.
 */
config.process = function(raw) {
  return grunt.util.recurse(raw, function(value) {
    if (typeof value !== 'string') {
      return value;
    }

    var matches = value.match(propStringTmplRe);
    if (!matches) {
      return grunt.template.process(value, {data: config.data});
    }

    var result = config.get(matches[1]);
    return result != null ? result : grunt.template.process(value, {data: config.data});
  });
};

/**
 * Sets a config property to a specified value.
 * @param {string} prop - Property path.
 * @param {*} value - Value to assign.
 * @returns {*} The assigned value.
 */
config.set = function(prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep merges an object into the config data.
 * @param {Object} obj - Object to merge into config data.
 * @returns {Object} Updated config data.
 */
config.merge = function(obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initializes config data, preserving existing behavior.
 * @param {Object} [obj] - Optional initial config data.
 * @returns {Object} The newly assigned config data object.
 */
config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  config.data = obj || {};
  return config.data;
};

/**
 * Validates that required config properties exist; throws if missing.
 * @param {...string} props - One or more config property paths.
 * @throws {Error} Throws if required properties are missing or config is not loaded.
 */
config.requires = function() {
  var p = grunt.util.pluralize;
  var props = grunt.util.toArray(arguments).map(config.getPropString);
  var msg = 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
  grunt.verbose.write(msg);
  var failProps = getFailedProperties(props);
  if (!config.data) {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    throw grunt.util.error('Unable to load config.');
  }
  if (failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }
  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  throw grunt.util.error('Required config propert' +
    p(failProps.length, 'y/ies') + ' ' + failProps.join(', ') + ' missing.');
};

/**
 * Helper to get list of missing required config properties.
 * @param {string[]} props - Array of property paths.
 * @returns {string[]} Array of quoted, missing property paths.
 */
function getFailedProperties(props) {
  if (!config.data) {
    return [];
  }
  return props.filter(function(prop) {
    return config.get(prop) == null;
  }).map(function(prop) {
    return '"' + prop + '"';
  });
}