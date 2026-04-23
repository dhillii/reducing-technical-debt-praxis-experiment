'use strict';

const grunt = require('../grunt');

/**
 * Get/set config data. If value was passed, set. Otherwise, get.
 * @param {string|Array} prop
 * @param {*} [value]
 * @returns {*}
 */
const config = function (prop, value) {
  return arguments.length === 2 ? config.set(prop, value) : config.get(prop);
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

/**
 * Determine whether a value is a string.
 * @param {*} value
 * @returns {boolean}
 */
function isString(value) {
  return typeof value === 'string';
}

/**
 * Attempt to resolve a template string to a config value.
 * @param {string} value
 * @returns {*|undefined} Resolved value or undefined if not resolvable.
 */
function resolveTemplate(value) {
  const matches = value.match(propStringTmplRe);
  if (!matches) {
    return undefined;
  }
  const result = config.get(matches[1]);
  return result != null ? result : undefined;
}

// Get config data, recursively processing templates.
config.get = function (prop) {
  return config.process(config.getRaw(prop));
};

// Expand a config value recursively. Used for post-processing raw values
// already retrieved from the config.
config.process = function (raw) {
  return grunt.util.recurse(raw, function (value) {
    if (!isString(value)) {
      return value;
    }
    const resolved = resolveTemplate(value);
    if (resolved !== undefined) {
      return resolved;
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
 * Check if a property is missing (null or undefined) in the config.
 * @param {string} prop
 * @returns {boolean}
 */
function isMissing(prop) {
  return config.get(prop) == null;
}

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
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
  const failProps =
    config.data &&
    props
      .filter(isMissing)
      .map(function (prop) {
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
  throw grunt.util.error(
    'Required config propert' +
      pluralize(failProps.length, 'y/ies') +
      ' ' +
      failProps.join(', ') +
      ' missing.'
  );
};

module.exports = config;