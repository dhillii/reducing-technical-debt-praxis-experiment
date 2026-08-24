'use strict';

var grunt = require('../grunt');

// Get/set config data. If value was passed, set. Otherwise, get.
var config = module.exports = function(prop, value) {
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

/**
 * Escape any . in name with \. so dot-based namespacing works properly.
 * @param {string} str - Input string
 * @returns {string} Escaped string
 */
config.escape = function(str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Return prop as a string.
 * @param {string|string[]} prop - Property name or array of segments
 * @returns {string} String representation of property path
 */
config.getPropString = function(prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Get raw, unprocessed config data.
 * @param {string|string[]} [prop] - Property path or null/undefined
 * @returns {*} Raw config value or entire config.data
 */
config.getRaw = function(prop) {
  if (prop) {
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  } else {
    return config.data;
  }
};

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
var propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Determine if a string value should be treated as a direct config reference.
 * @param {string} value - Input string
 * @returns {boolean} True if the string matches a config reference pattern
 */
function isConfigReference(value) {
  return typeof value === 'string' && propStringTmplRe.test(value);
}

/**
 * Extract property path from a config reference string.
 * @param {string} value - Config reference string like '<%= foo.bar %>'
 * @returns {string|null} Extracted property path or null if no match
 */
function extractPropString(value) {
  var match = value.match(propStringTmplRe);
  return match ? match[1] : null;
}

/**
 * Get config data, recursively processing templates.
 * @param {string|string[]} [prop] - Property path or null/undefined
 * @returns {*} Processed config value
 */
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Expand a config value recursively. Used for post-processing raw values
 * already retrieved from the config.
 * @param {*} raw - Raw config value
 * @returns {*} Processed config value
 */
config.process = function(raw) {
  return grunt.util.recurse(raw, function(value) {
    // If the value is not a string, return it as-is.
    if (typeof value !== 'string') {
      return value;
    }

    if (isConfigReference(value)) {
      var propString = extractPropString(value);
      var result = config.get(propString);
      if (result != null) {
        return result;
      }
    }

    // Process the string as a template.
    return grunt.template.process(value, {data: config.data});
  });
};

/**
 * Set config data.
 * @param {string|string[]} prop - Property path
 * @param {*} value - Value to set
 * @returns {*} Set value
 */
config.set = function(prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep merge config data.
 * @param {Object} obj - Object to merge into config
 * @returns {Object} Updated config.data
 */
config.merge = function(obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initialize config data.
 * @param {Object} [obj] - Initial data object
 * @returns {Object} Initialized config.data
 */
config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (config.data = obj || {});
};

/**
 * Test to see if required config params have been defined. If not, throw an
 * exception (use this inside of a task).
 * @param {...string} props - Property names to verify
 * @returns {boolean} True if all required properties exist
 * @throws {Error} If required config properties are missing
 */
config.requires = function() {
  var p = grunt.util.pluralize;
  var props = grunt.util.toArray(arguments).map(config.getPropString);
  var msg = 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
  grunt.verbose.write(msg);

  var failProps = config.data && props.filter(function(prop) {
    return config.get(prop) == null;
  }).map(function(prop) {
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
  } else {
    throw grunt.util.error('Required config propert' +
      p(failProps.length, 'y/ies') + ' ' + failProps.join(', ') + ' missing.');
  }
};