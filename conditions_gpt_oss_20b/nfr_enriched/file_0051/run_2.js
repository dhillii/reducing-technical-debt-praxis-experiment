'use strict';

const grunt = require('../grunt');

// Main config function: get or set configuration values.
const config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  }
  return config.get(prop);
};

// The actual config data.
config.data = {};

// Escape any '.' in name with '\\.' so dot-based namespacing works properly.
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
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  return config.data;
};

// Regular expression to match '<%= FOO %>' where FOO is a propString.
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

// Get config data, recursively processing templates.
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

// Expand a config value recursively. Used for post-processing raw values
// already retrieved from the config.
config.process = function(raw) {
  return grunt.util.recurse(raw, function(value) {
    if (typeof value !== 'string') {
      return value;
    }
    const match = value.match(propStringTmplRe);
    if (match) {
      const result = config.get(match[1]);
      if (result != null) {
        return result;
      }
    }
    return grunt.template.process(value, { data: config.data });
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
  return (config.data = obj || {});
};

// Helper: build a message for missing properties.
function buildMissingPropsMessage(props) {
  const p = grunt.util.pluralize;
  const propList = grunt.log.wordlist(props);
  return (
    'Verifying propert' +
    p(props.length, 'y/ies') +
    ' ' +
    propList +
    ' exist' +
    p(props.length, 's') +
    ' in config...'
  );
}

// Helper: collect missing properties.
function findMissingProps(props) {
  return props.filter((prop) => config.get(prop) == null).map((prop) => '"' + prop + '"');
}

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = function() {
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = buildMissingPropsMessage(props);
  grunt.verbose.write(msg);
  const missing = findMissingProps(props);

  if (config.data && missing.length === 0) {
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
      grunt.util.pluralize(missing.length, 'y/ies') +
      ' ' +
      missing.join(', ') +
      ' missing.'
  );
};