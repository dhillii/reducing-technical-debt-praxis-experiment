'use strict';

const grunt = require('../grunt');

/**
 * Get/set config data. If a value is provided, set the property; otherwise, get it.
 * @param {string|Array} prop - Property name or path.
 * @param {*} [value] - Value to set.
 * @returns {*} Config value or result of set operation.
 */
const config = module.exports = function (prop, value) {
  return isTwoArgs(arguments) ? config.set(prop, value) : config.get(prop);
};

/**
 * Determine if exactly two arguments were passed.
 * @param {IArguments} args
 * @returns {boolean}
 */
function isTwoArgs(args) {
  return args.length === 2;
}

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

// Expand a config value recursively. Used for post-processing raw values
// already retrieved from the config.
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
    return grunt.template.process(value, { data: config.data });
  });
};

/**
 * Check if a value is a string.
 * @param {*} val
 * @returns {boolean}
 */
function isString(val) {
  return typeof val === 'string';
}

/**
 * Retrieve template match groups if the string matches the config template pattern.
 * @param {string} str
 * @returns {RegExpMatchArray|null}
 */
function getTemplateMatch(str) {
  return str.match(propStringTmplRe);
}

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

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = function () {
  const p = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
  grunt.verbose.write(msg);

  const failProps = config.data && props.filter(isMissingProp).map(formatMissingProp);

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

/**
 * Determine if a property is missing (null or undefined) in the config.
 * @param {string} prop
 * @returns {boolean}
 */
function isMissingProp(prop) {
  return config.get(prop) == null;
}

/**
 * Format a missing property name for error messages.
 * @param {string} prop
 * @returns {string}
 */
function formatMissingProp(prop) {
  return '"' + prop + '"';
}