'use strict';

const grunt = require('../grunt');

/**
 * Get/set config data. If value was passed, set. Otherwise, get.
 * @param {string|string[]} prop - Property name or array of property names.
 * @param {*} [value] - Value to set for the property.
 * @returns {*} Config data or the result of setting the property.
 */
const config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  } else {
    return config.get(prop);
  }
};

// The actual config data.
config.data = {};

/**
 * Escape any . in name with \. so dot-based namespacing works properly.
 * @param {string} str - String to escape.
 * @returns {string} Escaped string.
 */
config.escape = function(str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Return prop as a string.
 * @param {string|string[]} prop - Property name or array of property names.
 * @returns {string} Property string.
 */
config.getPropString = function(prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Get raw, unprocessed config data.
 * @param {string|string[]} [prop] - Property name or array of property names.
 * @returns {*} Raw config data.
 */
config.getRaw = function(prop) {
  if (prop) {
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  } else {
    return config.data;
  }
};

/**
 * Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
 * a method call like foo() or foo.bar().
 */
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Get config data, recursively processing templates.
 * @param {string|string[]} prop - Property name or array of property names.
 * @returns {*} Config data.
 */
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Expand a config value recursively. Used for post-processing raw values
 * already retrieved from the config.
 * @param {*} raw - Raw config value.
 * @returns {*} Processed config value.
 */
config.process = function(raw) {
  return grunt.util.recurse(raw, function(value) {
    if (typeof value !== 'string') { return value; }
    const matches = value.match(propStringTmplRe);
    if (matches) {
      const result = config.get(matches[1]);
      if (result != null) { return result; }
    }
    return grunt.template.process(value, {data: config.data});
  });
};

/**
 * Set config data.
 * @param {string|string[]} prop - Property name or array of property names.
 * @param {*} value - Value to set for the property.
 * @returns {*} Config data.
 */
config.set = function(prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep merge config data.
 * @param {object} obj - Object to merge with config data.
 * @returns {object} Merged config data.
 */
config.merge = function(obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initialize config data.
 * @param {object} [obj] - Initial config data.
 * @returns {object} Initialized config data.
 */
config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (config.data = obj || {});
};

/**
 * Test to see if required config params have been defined. If not, throw an
 * exception (use this inside of a task).
 * @param {...string} props - Property names to check.
 * @returns {boolean} True if all properties exist, false otherwise.
 */
config.requires = function() {
  const p = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = `Verifying propert${p(props.length, 'y/ies')} ${grunt.log.wordlist(props)} exist${p(props.length, 's')} in config...`;
  grunt.verbose.write(msg);
  const failProps = config.data && props.filter(prop => config.get(prop) == null).map(prop => `"${prop}"`);
  if (config.data && failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  } else {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    if (!config.data) {
      throw grunt.util.error('Unable to load config.');
    } else {
      throw grunt.util.error(`Required config propert${p(failProps.length, 'y/ies')} ${failProps.join(', ')} missing.`);
    }
  }
};