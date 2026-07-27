'use strict';

const grunt = require('../grunt');

/**
 * Get/set config data. If a value is passed, set the property; otherwise, get it.
 *
 * @param {string|Array} prop - Property name or array of keys.
 * @param {*} [value] - Value to set.
 * @returns {*} The current value of the property or the entire config data.
 */
const config = function (prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  }
  return config.get(prop);
};

module.exports = config;

// The actual config data.
config.data = {};

/**
 * Escape any '.' in a string with '\\.' so dot-based namespacing works properly.
 *
 * @param {string} str - The string to escape.
 * @returns {string} The escaped string.
 */
config.escape = function (str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Return prop as a string. If prop is an array, escape each part and join with '.'.
 *
 * @param {string|Array} prop - Property name or array of keys.
 * @returns {string} The property string.
 */
config.getPropString = function (prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Get raw, unprocessed config data.
 *
 * @param {string|Array} [prop] - Property name or array of keys.
 * @returns {*} The raw value or the entire config data.
 */
config.getRaw = function (prop) {
  if (prop) {
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  return config.data;
};

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Get config data, recursively processing templates.
 *
 * @param {string|Array} [prop] - Property name or array of keys.
 * @returns {*} The processed value.
 */
config.get = function (prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Expand a config value recursively. Used for post-processing raw values
 * already retrieved from the config.
 *
 * @param {*} raw - Raw config value.
 * @returns {*} The processed value.
 */
config.process = function (raw) {
  return grunt.util.recurse(raw, function (value) {
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
 * @param {string|Array} prop - Property name or array of keys.
 * @param {*} value - Value to set.
 * @returns {*} The set value.
 */
config.set = function (prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep merge config data.
 *
 * @param {Object} obj - Object to merge into config data.
 * @returns {Object} The merged config data.
 */
config.merge = function (obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initialize config data.
 *
 * @param {Object} [obj] - Initial config object.
 * @returns {Object} The initialized config data.
 */
config.init = function (obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (config.data = obj || {});
};

/**
 * Test to see if required config params have been defined. If not, throw an
 * exception (use this inside of a task).
 *
 * @param {...string|Array} args - Property names or arrays of keys.
 * @returns {boolean} True if all required properties exist.
 * @throws {Error} If required properties are missing or config data is not loaded.
 */
config.requires = function () {
  const pluralize = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(config.getPropString);

  const msg = `Verifying propert${pluralize(props.length, 'y/ies')} ${grunt.log.wordlist(
    props
  )} exist${pluralize(props.length, 's')} in config...`;
  grunt.verbose.write(msg);

  const failProps = config.data
    ? props
        .filter((prop) => config.get(prop) == null)
        .map((prop) => `"${prop}"`)
    : [];

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
    `Required config propert${pluralize(
      failProps.length,
      'y/ies'
    )} ${failProps.join(', ')} missing.`
  );
};