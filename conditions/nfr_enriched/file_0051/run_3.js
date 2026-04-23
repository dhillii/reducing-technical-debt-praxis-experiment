'use strict';

const grunt = require('../grunt');

// The actual config data.
const config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  } else {
    return config.get(prop);
  }
};

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
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  } else {
    return config.data;
  }
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
  return (config.data = obj || {});
};

// Retrieve properties that failed validation.
const getFailedProps = function(props) {
  return config.data && props.filter(function(prop) {
    return config.get(prop) == null;
  }).map(function(prop) {
    return '"' + prop + '"';
  });
};

// Build the verification message for required config properties.
const buildVerificationMessage = function(props) {
  const p = grunt.util.pluralize;
  return 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
};

// Handle successful config validation.
const handleValidationSuccess = function() {
  grunt.verbose.ok();
  return true;
};

// Handle failed config validation.
const handleValidationFailure = function(msg, failProps) {
  const p = grunt.util.pluralize;
  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  } else {
    throw grunt.util.error('Required config propert' +
      p(failProps.length, 'y/ies') + ' ' + failProps.join(', ') + ' missing.');
  }
};

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = function() {
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = buildVerificationMessage(props);
  grunt.verbose.write(msg);
  const failProps = getFailedProps(props);
  if (config.data && failProps.length === 0) {
    return handleValidationSuccess();
  } else {
    handleValidationFailure(msg, failProps);
  }
};