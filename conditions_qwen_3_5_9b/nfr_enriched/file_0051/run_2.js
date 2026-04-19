'use strict';

var grunt = require('../grunt');

// Get/set config data. If value was passed, set. Otherwise, get.
var config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  }
  return config.get(prop);
};

// The actual config data.
var configData = {};

// Escape any . in name with \. so dot-based namespacing works properly.
function escape(str) {
  return str.replace(/\./g, '\\.');
}

// Return prop as a string.
function getPropString(prop) {
  return Array.isArray(prop) ? prop.map(escape).join('.') : prop;
}

// Get raw, unprocessed config data.
function getRaw(prop) {
  if (prop) {
    return grunt.util.namespace.get(configData, getPropString(prop));
  }
  return configData;
}

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
var propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

// Get config data, recursively processing templates.
function get(prop) {
  return process(getRaw(prop));
}

// Expand a config value recursively. Used for post-processing raw values
// already retrieved from the config.
function process(raw) {
  return grunt.util.recurse(raw, function(value) {
    if (typeof value !== 'string') {
      return value;
    }

    var matches = value.match(propStringTmplRe);
    if (!matches) {
      return grunt.template.process(value, {data: configData});
    }

    var result = get(matches[1]);
    if (result != null) {
      return result;
    }

    return grunt.template.process(value, {data: configData});
  });
}

// Set config data.
function set(prop, value) {
  return grunt.util.namespace.set(configData, getPropString(prop), value);
}

// Deep merge config data.
function merge(obj) {
  grunt.util._.merge(configData, obj);
  return configData;
}

// Initialize config data.
function init(obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (configData = obj || {});
}

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
function requires() {
  var p = grunt.util.pluralize;
  var props = grunt.util.toArray(arguments).map(getPropString);
  var msg = 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
  grunt.verbose.write(msg);

  var failProps = getFailProps(props);
  if (failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  if (!configData) {
    throw grunt.util.error('Unable to load config.');
  }

  throw grunt.util.error('Required config propert' +
    p(failProps.length, 'y/ies') + ' ' + failProps.join(', ') + ' missing.');
}

// Get list of failing properties that are missing or null.
function getFailProps(props) {
  return configData && props.filter(function(prop) {
    return get(prop) == null;
  }).map(function(prop) {
    return '"' + prop + '"';
  });
}