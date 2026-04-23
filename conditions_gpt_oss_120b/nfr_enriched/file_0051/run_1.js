'use strict';

const grunt = require('../grunt');

// Get/set config data. If value was passed, set. Otherwise, get.
const config = function (prop, value) {
  if (arguments.length === 2) {
    // Two arguments were passed, set the property's value.
    return config.set(prop, value);
  }
  // Get the property's value (or the entire data object).
  return config.get(prop);
};

module.exports = config;

// The actual config data.
config.data = {};

// Escape any . in name with \. so dot-based namespacing works properly.
config.escape = function (str) {
  return str.replace(/\./g, '\\.');
};

// Return prop as a string.
config.getPropString = function (prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

// Get raw, unprocessed config data.
config.getRaw = function (prop) {
  if (prop) {
    // Prop was passed, get that specific property's value.
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  // No prop was passed, return the entire config.data object.
  return config.data;
};

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

// Get config data, recursively processing templates.
config.get = function (prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Recursively expands a config value, processing template strings.
 * @param {*} raw - Raw config value.
 * @returns {*} Processed config value.
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

// Set config data.
config.set = function (prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

// Deep merge config data.
config.merge = function (obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

// Initialize config data.
config.init = function (obj) {
  grunt.verbose.write('Initializing config...').ok();
  // Initialize and return data.
  return (config.data = obj || {});
};

/**
 * Builds a verification message for required properties.
 * @param {string[]} props - Property names.
 * @returns {string} Message string.
 */
function buildVerificationMessage(props) {
  const p = grunt.util.pluralize;
  return (
    'Verifying propert' +
    p(props.length, 'y/ies') +
    ' ' +
    grunt.log.wordlist(props) +
    ' exist' +
    p(props.length, 's') +
    ' in config...'
  );
}

/**
 * Retrieves missing required properties.
 * @param {string[]} props - Property names.
 * @returns {string[]} Array of missing property names formatted with quotes.
 */
function getMissingProperties(props) {
  return props
    .filter((prop) => config.get(prop) == null)
    .map((prop) => `"${prop}"`);
}

/**
 * Throws an error describing missing configuration.
 * @param {string[]} missingProps - Missing property names.
 */
function throwMissingConfigError(missingProps) {
  const p = grunt.util.pluralize;
  throw grunt.util.error(
    'Required config propert' +
      p(missingProps.length, 'y/ies') +
      ' ' +
      missingProps.join(', ') +
      ' missing.'
  );
}

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = function () {
  const props = grunt.util
    .toArray(arguments)
    .map(config.getPropString);
  const msg = buildVerificationMessage(props);
  grunt.verbose.write(msg);

  if (!config.data) {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    throw grunt.util.error('Unable to load config.');
  }

  const missingProps = getMissingProperties(props);
  if (missingProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  throwMissingConfigError(missingProps);
};