'use strict';

const grunt = require('../grunt');

/**
 * Get/set config data. If value was passed, set. Otherwise, get.
 * @param {string|Array} prop
 * @param {*} [value]
 * @returns {*}
 */
const config = module.exports = function (prop, value) {
  const argsLength = arguments.length;
  if (argsLength === 2) {
    // Two arguments were passed, set the property's value.
    return config.set(prop, value);
  }
  // Get the property's value (or the entire data object).
  return config.get(prop);
};

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
 * Process a raw config value, expanding any template strings.
 * @param {*} raw
 * @returns {*}
 */
config.process = function (raw) {
  return grunt.util.recurse(raw, function (value) {
    // If the value is not a string, return it.
    if (typeof value !== 'string') {
      return value;
    }
    // If possible, access the specified property via config.get, in case it
    // doesn't refer to a string, but instead refers to an object or array.
    const matches = value.match(propStringTmplRe);
    if (matches) {
      const result = config.get(matches[1]);
      // If the result retrieved from the config data wasn't null or undefined,
      // return it.
      if (result != null) {
        return result;
      }
    }
    // Process the string as a template.
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
 * Determine if the configuration contains all required properties.
 * @param {Array<string>} props
 * @returns {boolean}
 */
function hasAllRequiredProps(props) {
  return props.every(prop => config.get(prop) != null);
}

/**
 * Build an array of missing property names, quoted for display.
 * @param {Array<string>} props
 * @returns {Array<string>}
 */
function getMissingPropsQuoted(props) {
  return props
    .filter(prop => config.get(prop) == null)
    .map(prop => `"${prop}"`);
}

/**
 * Test to see if required config params have been defined. If not, throw an
 * exception (use this inside of a task).
 */
config.requires = function () {
  const pluralize = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg =
    'Verifying propert' +
    pluralize(props.length, 'y/ies') +
    ' ' +
    grunt.log.wordlist(props) +
    ' exist' +
    pluralize(props.length, 's') +
    ' in config...';
  grunt.verbose.write(msg);

  const missingProps = config.data ? getMissingPropsQuoted(props) : [];

  if (config.data && missingProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');

  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  }

  const missingMsg =
    'Required config propert' +
    pluralize(missingProps.length, 'y/ies') +
    ' ' +
    missingProps.join(', ') +
    ' missing.';
  throw grunt.util.error(missingMsg);
};