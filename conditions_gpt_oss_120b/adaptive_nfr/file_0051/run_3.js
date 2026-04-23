'use strict';

const grunt = require('../grunt');

// Get/set config data. If value was passed, set. Otherwise, get.
const config = module.exports = function (prop, value) {
  if (arguments.length === 2) {
    // Two arguments were passed, set the property's value.
    return config.set(prop, value);
  } else {
    // Get the property's value (or the entire data object).
    return config.get(prop);
  }
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

/**
 * Determines whether a value is a string.
 * @param {*} value The value to test.
 * @returns {boolean} True if the value is a string.
 */
function isString(value) {
  return typeof value === 'string';
}

/**
 * Determines whether a string matches the template regex.
 * @param {string} str The string to test.
 * @returns {RegExpMatchArray|null} The match result or null.
 */
function getTemplateMatch(str) {
  return str.match(propStringTmplRe);
}

/**
 * Processes a raw config value, expanding any template references.
 * @param {*} raw The raw config value.
 * @returns {*} The processed value.
 */
config.process = function (raw) {
  return grunt.util.recurse(raw, function (value) {
    if (!isString(value)) {
      return value;
    }
    const matches = getTemplateMatch(value);
    if (matches) {
      const result = config.get(matches[1]);
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
 * Formats the verification message for required properties.
 * @param {string[]} props Array of property strings.
 * @returns {string} Formatted message.
 */
function formatVerificationMessage(props) {
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
 * Returns an array of missing property names.
 * @param {string[]} props Array of property strings.
 * @returns {string[]} Missing properties formatted with quotes.
 */
function getMissingProps(props) {
  return props
    .filter(function (prop) {
      return config.get(prop) == null;
    })
    .map(function (prop) {
      return '"' + prop + '"';
    });
}

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = function () {
  const pluralize = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = formatVerificationMessage(props);
  grunt.verbose.write(msg);
  const failProps = config.data && getMissingProps(props);
  if (config.data && failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  } else {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    if (!config.data) {
      throw grunt.util.error('Unable to load config.');
    } else {
      throw grunt.util.error(
        'Required config propert' +
          pluralize(failProps.length, 'y/ies') +
          ' ' +
          failProps.join(', ') +
          ' missing.'
      );
    }
  }
};