'use strict';

const grunt = require('../grunt');

// Get/set config data. If value was passed, set. Otherwise, get.
const config = module.exports = (prop, value) => {
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
config.escape = (str) => {
  return str.replace(/\./g, '\\.');
};

// Return prop as a string.
config.getPropString = (prop) => {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

// Get raw, unprocessed config data.
config.getRaw = (prop) => {
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
config.get = (prop) => {
  return config.process(config.getRaw(prop));
};

// Expand a config value recursively. Used for post-processing raw values
// already retrieved from the config.
config.process = (raw) => {
  return grunt.util.recurse(raw, (value) => {
    // If the value is not a string, return it.
    if (typeof value !== 'string') { return value; }
    // If possible, access the specified property via config.get, in case it
    // doesn't refer to a string, but instead refers to an object or array.
    const matches = value.match(propStringTmplRe);
    let result;
    if (matches) {
      result = config.get(matches[1]);
      // If the result retrieved from the config data wasn't null or undefined,
      // return it.
      if (result != null) { return result; }
    }
    // Process the string as a template.
    return grunt.template.process(value, {data: config.data});
  });
};

// Set config data.
config.set = (prop, value) => {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

// Deep merge config data.
config.merge = (obj) => {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

// Initialize config data.
config.init = (obj) => {
  grunt.verbose.write('Initializing config...').ok();
  // Initialize and return data.
  return (config.data = obj || {});
};

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = () => {
  const p = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = 'Verifying property' + p(props.length, 'ies') + ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') + ' in config...';
  grunt.verbose.write(msg);
  const failProps = config.data && props.filter((prop) => {
    return config.get(prop) == null;
  }).map((prop) => {
    return `"${prop}"`;
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
      throw grunt.util.error('Required config property' + p(failProps.length, 'ies') + ' ' + failProps.join(', ') + ' missing.');
    }
  }
};