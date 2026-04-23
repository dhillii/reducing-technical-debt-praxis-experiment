'use strict';

const grunt = require('../grunt');

// Get/set config data. If value was passed, set. Otherwise, get.
const config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  } else {
    return config.get(prop);
  }
};

// The actual config data.
config.data = {};

// Escape any . in name with \. so dot-based namespacing works properly.
const escape = (str) => {
  return str.replace(/\./g, '\\.');
};

// Return prop as a string.
const getPropString = (prop) => {
  return Array.isArray(prop) ? prop.map(escape).join('.') : prop;
};

// Get raw, unprocessed config data.
const getRaw = (prop) => {
  if (prop) {
    return grunt.util.namespace.get(config.data, getPropString(prop));
  } else {
    return config.data;
  }
};

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

// Get config data, recursively processing templates.
const get = (prop) => {
  return process(getRaw(prop));
};

// Expand a config value recursively. Used for post-processing raw values
// already retrieved from the config.
const process = (raw) => {
  return grunt.util.recurse(raw, (value) => {
    // If the value is not a string, return it.
    if (typeof value !== 'string') {
      return value;
    }
    // If possible, access the specified property via config.get, in case it
    // doesn't refer to a string, but instead refers to an object or array.
    const matches = value.match(propStringTmplRe);
    let result;
    if (matches) {
      result = get(matches[1]);
      // If the result retrieved from the config data wasn't null or undefined,
      // return it.
      if (result != null) {
        return result;
      }
    }
    // Process the string as a template.
    return grunt.template.process(value, {data: config.data});
  });
};

// Set config data.
const set = (prop, value) => {
  return grunt.util.namespace.set(config.data, getPropString(prop), value);
};

// Deep merge config data.
const merge = (obj) => {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

// Initialize config data.
const init = (obj) => {
  grunt.verbose.write('Initializing config...').ok();
  // Initialize and return data.
  return (config.data = obj || {});
};

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
const requires = () => {
  const p = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(getPropString);
  const msg = 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
  grunt.verbose.write(msg);
  const failProps = getFailProps(props);
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

// Get failed properties that are missing from config.
const getFailProps = (props) => {
  return config.data && props.filter((prop) => {
    return get(prop) == null;
  }).map((prop) => {
    return '"' + prop + '"';
  });
};