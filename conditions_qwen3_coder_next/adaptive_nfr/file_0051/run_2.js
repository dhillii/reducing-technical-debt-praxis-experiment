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
var propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Check if a string value is a valid property template reference.
 * @param {string} value - String to test.
 * @returns {boolean} True if the value matches the expected template pattern.
 */
function isPropStringTemplate(value) {
  return typeof value === 'string' && propStringTmplRe.test(value);
}

/**
 * Extract property path from a property template string.
 * @param {string} value - Template string (e.g., '<%= foo.bar %>')
 * @returns {string} The captured property path (e.g., 'foo.bar')
 */
function extractPropPath(value) {
  return value.match(propStringTmplRe)[1];
}

// Get config data, recursively processing templates.
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

// Expand a config value recursively. Used for post-processing raw values
// already retrieved from the config.
config.process = function(raw) {
  return grunt.util.recurse(raw, function(value) {
    // If the value is not a string, return it.
    if (typeof value !== 'string') { return value; }

    if (isPropStringTemplate(value)) {
      var propPath = extractPropPath(value);
      var result = config.get(propPath);
      // If the result retrieved from the config data wasn't null or undefined,
      // return it.
      if (result != null) { return result; }
    }

    // Process the string as a template.
    return grunt.template.process(value, {data: config.data});
  });
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

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
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
  } else {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    if (!config.data) {
      throw grunt.util.error('Unable to load config.');
    } else {
      throw grunt.util.error('Required config propert' +
        p(failProps.length, 'y/ies') + ' ' + failProps.join(', ') + ' missing.');
    }
  }
};