'use strict';

const grunt = require('../grunt');

/**
 * Get/set config data. If value was passed, set. Otherwise, get.
 *
 * @param {string|Array} prop - Property name or array of property names.
 * @param {*} [value] - Value to set if provided.
 * @returns {*} The current value of the property or the entire config data.
 */
const config = function(prop, value) {
  return arguments.length === 2 ? config.set(prop, value) : config.get(prop);
};

module.exports = config;

// The actual config data.
config.data = {};

/**
 * Escape any '.' in name with '\\.' so dot-based namespacing works properly.
 *
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
config.escape = function(str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Return prop as a string.
 *
 * @param {string|Array} prop - Property name or array of property names.
 * @returns {string} The property string.
 */
config.getPropString = function(prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Get raw, unprocessed config data.
 *
 * @param {string|Array} [prop] - Property name or array of property names.
 * @returns {*} The raw config value or the entire config data.
 */
config.getRaw = function(prop) {
  return prop
    ? grunt.util.namespace.get(config.data, config.getPropString(prop))
    : config.data;
};

/**
 * Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
 * a method call like foo() or foo.bar().
 */
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Get config data, recursively processing templates.
 *
 * @param {string|Array} [prop] - Property name or array of property names.
 * @returns {*} The processed config value.
 */
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Expand a config value recursively. Used for post-processing raw values
 * already retrieved from the config.
 *
 * @param {*} raw - Raw config value.
 * @returns {*} The processed config value.
 */
config.process = function(raw) {
  return grunt.util.recurse(raw, function(value) {
    if (typeof value !== 'string') {
      return value;
    }
    const matches = value.match(propStringTmplRe);
    if (matches) {
      const result = config.get(matches[1]);
      if (result != null) {
        return result;
      }
    }
    return grunt.template.process(value, { data: config.data });
  });
};

/**
 * Set config data.
 *
 * @param {string|Array} prop - Property name or array of property names.
 * @param {*} value - Value to set.
 * @returns {*} The set value.
 */
config.set = function(prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep merge config data.
 *
 * @param {Object} obj - Object to merge into config data.
 * @returns {Object} The merged config data.
 */
config.merge = function(obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initialize config data.
 *
 * @param {Object} [obj] - Initial config data.
 * @returns {Object} The initialized config data.
 */
config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (config.data = obj || {});
};

/**
 * Test to see if required config params have been defined. If not, throw an
 * exception (use this inside of a task).
 *
 * @throws {Error} If required config properties are missing.
 * @returns {boolean} True if all required properties exist.
 */
config.requires = function() {
  const p = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg =
    'Verifying propert' +
    p(props.length, 'y/ies') +
    ' ' +
    grunt.log.wordlist(props) +
    ' exist' +
    p(props.length, 's') +
    ' in config...';
  grunt.verbose.write(msg);
  const failProps =
    config.data &&
    props
      .filter((prop) => config.get(prop) == null)
      .map((prop) => '"' + prop + '"');
  if (config.data && failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }
  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  }
  throw grunt.util.error(
    'Required config propert' +
      p(failProps.length, 'y/ies') +
      ' ' +
      failProps.join(', ') +
      ' missing.'
  );
};