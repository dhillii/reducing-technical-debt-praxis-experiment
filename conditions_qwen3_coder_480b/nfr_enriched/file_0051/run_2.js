'use strict';

const grunt = require('../grunt');

// Get/set config data. If value was passed, set. Otherwise, get.
const config = module.exports = function(prop, value) {
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
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

// Get config data, recursively processing templates.
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Process a raw config value recursively, handling template expansion
 * @param {*} raw - Raw config value to process
 * @returns {*} Processed value
 */
function processValue(raw) {
  // If the value is not a string, return it.
  if (typeof raw !== 'string') { 
    return raw; 
  }
  
  // If possible, access the specified property via config.get, in case it
  // doesn't refer to a string, but instead refers to an object or array.
  const matches = raw.match(propStringTmplRe);
  let result;
  if (matches) {
    result = config.get(matches[1]);
    // If the result retrieved from the config data wasn't null or undefined,
    // return it.
    if (result != null) { 
      return result; 
    }
  }
  
  // Process the string as a template.
  return grunt.template.process(raw, {data: config.data});
}

// Expand a config value recursively. Used for post-processing raw values
// already retrieved from the config.
config.process = function(raw) {
  return grunt.util.recurse(raw, processValue);
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

/**
 * Check if properties exist in config, throwing error if any are missing
 * @param {...string} props - Properties to check
 * @returns {boolean} True if all properties exist
 */
function verifyConfigProperties(props) {
  const msg = createVerificationMessage(props);
  grunt.verbose.write(msg);
  
  const failProps = findMissingProperties(props);
  
  if (config.data && failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  } else {
    handleMissingProperties(msg, failProps);
  }
}

/**
 * Create verification message for logging
 * @param {string[]} props - Properties being verified
 * @returns {string} Formatted message
 */
function createVerificationMessage(props) {
  const p = grunt.util.pluralize;
  return 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';
}

/**
 * Find properties that are missing from config
 * @param {string[]} props - Properties to check
 * @returns {string[]} Missing properties
 */
function findMissingProperties(props) {
  if (!config.data) {
    return [];
  }
  
  return props.filter(function(prop) {
    return config.get(prop) == null;
  }).map(function(prop) {
    return '"' + prop + '"';
  });
}

/**
 * Handle missing properties by logging errors and throwing exceptions
 * @param {string} msg - Verification message
 * @param {string[]} failProps - Missing properties
 */
function handleMissingProperties(msg, failProps) {
  const p = grunt.util.pluralize;
  
  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  
  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  } else {
    throw grunt.util.error('Required config propert' +
      p(failProps.length, 'y/ies') + ' ' + failProps.join(', ') + ' missing.');
  }
}

// Test to see if required config params have been defined. If not, throw an
// exception (use this inside of a task).
config.requires = function() {
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  return verifyConfigProperties(props);
};