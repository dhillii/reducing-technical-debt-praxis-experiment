'use strict';

var grunt = require('../grunt');

/**
 * Main config accessor.
 * If a value is passed, sets the property. Otherwise, gets the property.
 * @param {string|Array} prop - The property name or array of names.
 * @param {*} [value] - The value to set.
 * @returns {*} The current value of the property or the entire config data object.
 */
var config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  }
  return config.get(prop);
};

// The actual config data storage.
config.data = {};

/**
 * Escapes dots in a string to support dot-based namespacing.
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
config.escape = function(str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Converts a property name (or array) into a dot-separated string.
 * @param {string|Array} prop - The property name or array of names.
 * @returns {string} The dot-separated property string.
 */
config.getPropString = function(prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Retrieves raw, unprocessed config data.
 * @param {string|Array} [prop] - The property name or array of names.
 * @returns {*} The raw value or the entire config data object.
 */
config.getRaw = function(prop) {
  if (prop) {
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  return config.data;
};

// Regular expression to match template strings like '<%= FOO %>'.
var propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Retrieves config data, recursively processing templates.
 * @param {string|Array} [prop] - The property name or array of names.
 * @returns {*} The processed value.
 */
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Expands a config value recursively. Used for post-processing raw values.
 * @param {*} raw - The raw value to process.
 * @returns {*} The processed value.
 */
config.process = function(raw) {
  return grunt.util.recurse(raw, function(value) {
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
  });
};

/**
 * Sets config data for a specific property.
 * @param {string|Array} prop - The property name or array of names.
 * @param {*} value - The value to set.
 * @returns {Object} The updated config data object.
 */
config.set = function(prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep merges an object into the config data.
 * @param {Object} obj - The object to merge.
 * @returns {Object} The updated config data object.
 */
config.merge = function(obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initializes the config data with a provided object.
 * @param {Object} [obj] - The object to initialize with.
 * @returns {Object} The initialized config data object.
 */
config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (config.data = obj || {});
};

/**
 * Verifies that required config properties exist. Throws an error if missing.
 * @param {...string} props - The required property names.
 * @returns {boolean} True if all properties exist.
 * @throws {Error} If any required property is missing.
 */
config.requires = function() {
  var p = grunt.util.pluralize;
  var props = grunt.util.toArray(arguments).map(config.getPropString);
  var msg = 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
  grunt.verbose.write(msg);

  var failProps = config.data && props.filter(function(prop) {
    return config.get(prop) == null;
  }).map(function(prop) {
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