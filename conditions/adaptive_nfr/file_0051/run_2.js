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
 * Processes a template value by attempting to resolve it as a config property reference
 * or falling back to template processing.
 * @param {string} value - The template string to process
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
 * Determines if a property is missing from config data.
 * @param {string} prop - The property string to check
 * @returns {boolean} True if property is null or undefined
 */
const isMissingProperty = function(prop) {
  return config.get(prop) == null;
};

/**
 * Formats a property name as a quoted string.
 * @param {string} prop - The property name
 * @returns {string} The quoted property name
 */
const formatPropertyName = function(prop) {
  return '"' + prop + '"';
};

/**
 * Validates that required config properties exist and throws if any are missing.
 * @returns {boolean} True if all required properties exist
 * @throws {Error} If config data is not initialized or required properties are missing
 */
config.requires = function() {
  const p = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
  grunt.verbose.write(msg);
  
  const configExists = !!config.data;
  const failProps = configExists ? props.filter(isMissingProperty).map(formatPropertyName) : [];
  const allPropsExist = configExists && failProps.length === 0;
  
  if (allPropsExist) {
    grunt.verbose.ok();
    return true;
  }
  
  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  
  if (!configExists) {
    throw grunt.util.error('Unable to load config.');
  }
  
  throw grunt.util.error('Required config propert' +
    p(failProps.length, 'y/ies') + ' ' + failProps.join(', ') + ' missing.');
};