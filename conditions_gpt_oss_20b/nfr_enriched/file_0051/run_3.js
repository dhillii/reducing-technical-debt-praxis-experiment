'use strict';

const grunt = require('../grunt');

// Main config accessor: get or set based on argument count.
const config = module.exports = function(prop, value) {
  return arguments.length === 2
    ? config.set(prop, value)
    : config.get(prop);
};

// The actual config data.
config.data = {};

// Escape any '.' in name with '\\.' so dot-based namespacing works properly.
config.escape = function(str) {
  return str.replace(/\./g, '\\.');
};

// Return prop as a string.
config.getPropString = function(prop) {
  return Array.isArray(prop)
    ? prop.map(config.escape).join('.')
    : prop;
};

// Get raw, unprocessed config data.
config.getRaw = function(prop) {
  if (prop) {
    // Prop was passed, get that specific property's value.
    return grunt.util.namespace.get(
      config.data,
      config.getPropString(prop)
    );
  }
  // No prop was passed, return the entire config.data object.
  return config.data;
};

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
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
config.set = function(prop, value) {
  return grunt.util.namespace.set(
    config.data,
    config.getPropString(prop),
    value
  );
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
const buildMissingPropsMessage = function(props, missing) {
  const p = grunt.util.pluralize;
  const propsList = grunt.log.wordlist(props);
  const missingList = missing.join(', ');
  return (
    'Verifying property' +
    p(props.length, 'y/ies') +
    ' ' +
    propsList +
    ' exist' +
    p(props.length, 's') +
    ' in config...'
  );
};

// Helper: get array of missing property names.
const getMissingProps = function(props) {
  return props.filter(function(prop) {
    return config.get(prop) == null;
  });
};

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = function() {
  const props = grunt.util
    .toArray(arguments)
    .map(config.getPropString);
  const msg = buildMissingPropsMessage(props, []);
  grunt.verbose.write(msg);

  const missingProps = getMissingProps(props).map(function(prop) {
    return '"' + prop + '"';
  });

  if (config.data && missingProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');

  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  }

  throw grunt.util.error(
    'Required config property' +
      grunt.util.pluralize(missingProps.length, 'y/ies') +
      ' ' +
      missingProps.join(', ') +
      ' missing.'
  );
};