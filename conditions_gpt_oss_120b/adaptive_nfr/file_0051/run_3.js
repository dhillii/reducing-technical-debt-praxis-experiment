'use strict';

const grunt = require('../grunt');

/**
 * Get/set config data. If value was passed, set. Otherwise, get.
 * @param {string|Array} prop
 * @param {*} [value]
 * @returns {*}
 */
const config = function (prop, value) {
  if (arguments.length === 2) {
    // Two arguments were passed, set the property's value.
    return config.set(prop, value);
  } else {
    // Get the property's value (or the entire data object).
    return config.get(prop);
  }
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
  } else {
    // No prop was passed, return the entire config.data object.
    return config.data;
  }
};

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

// Get config data, recursively processing templates.
config.get = function (prop) {
  return config.process(config.getRaw(prop));
};

// Expand a config value recursively. Used for post-processing raw values
// already retrieved from the config.
config.process = function (raw) {
  return grunt.util.recurse(raw, function (value) {
    // If the value is not a string, return it.
    if (typeof value !== 'string') {
      return value;
    }
    // If possible, access the specified property via config.get, in case it
    // doesn't refer to a string, but instead refers to an object or array.
    const matches = value.match(propStringTmplRe);
    let result;
    if (matches) {
      result = config.get(matches[1]);
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
 * Check if the configuration object exists.
 * @returns {boolean}
 */
function hasConfigData() {
  return !!config.data;
}

/**
 * Determine if there are no missing required properties.
 * @param {Array<string>} failProps
 * @returns {boolean}
 */
function hasNoFailures(failProps) {
  return failProps.length === 0;
}

/**
 * Build the verification message for required properties.
 * @param {Array<string>} props
 * @returns {string}
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

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = function () {
  const props = grunt.util
    .toArray(arguments)
    .map(config.getPropString);
  const msg = buildVerificationMessage(props);
  grunt.verbose.write(msg);
  const failProps =
    config.data &&
    props
      .filter(function (prop) {
        return config.get(prop) == null;
      })
      .map(function (prop) {
        return '"' + prop + '"';
      });
  if (hasConfigData() && hasNoFailures(failProps)) {
    grunt.verbose.ok();
    return true;
  } else {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    if (!config.data) {
      throw grunt.util.error('Unable to load config.');
    } else {
      const p = grunt.util.pluralize;
      throw grunt.util.error(
        'Required config propert' +
          p(failProps.length, 'y/ies') +
          ' ' +
          failProps.join(', ') +
          ' missing.'
      );
    }
  }
};