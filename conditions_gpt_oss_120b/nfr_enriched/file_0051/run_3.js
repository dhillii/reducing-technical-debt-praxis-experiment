'use strict';

const grunt = require('../grunt');

// Main config accessor: get or set based on arguments.
function config(prop, value) {
  if (arguments.length === 2) {
    // Set mode
    return config.set(prop, value);
  }
  // Get mode
  return config.get(prop);
}

// Export the accessor.
module.exports = config;

// Internal storage for configuration data.
config.data = {};

// Escape dots in a string for namespace handling.
config.escape = function (str) {
  return str.replace(/\./g, '\\.');
};

// Convert a property identifier to a dot‑separated string.
config.getPropString = function (prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

// Retrieve raw configuration values without template processing.
config.getRaw = function (prop) {
  if (prop) {
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  return config.data;
};

// Regular expression for simple <%= prop %> templates.
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

// Public getter that also processes templates.
config.get = function (prop) {
  return config.process(config.getRaw(prop));
};

// Process a value recursively, expanding any template strings.
config.process = function (raw) {
  return grunt.util.recurse(raw, function (value) {
    if (typeof value !== 'string') {
      return value;
    }
    const templateMatch = value.match(propStringTmplRe);
    if (templateMatch) {
      const resolved = config.get(templateMatch[1]);
      if (resolved != null) {
        return resolved;
      }
    }
    return grunt.template.process(value, { data: config.data });
  });
};

// Set a configuration value.
config.set = function (prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

// Deep‑merge an object into the configuration.
config.merge = function (obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

// Initialise the configuration store.
config.init = function (obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (config.data = obj || {});
};

/**
 * Build a human‑readable verification message.
 * @param {string[]} props - Property names to verify.
 * @returns {string}
 */
function buildVerificationMessage(props) {
  const pluralize = grunt.util.pluralize;
  return (
    'Verifying propert' +
    pluralize(props.length, 'y/ies') +
    ' ' +
    grunt.log.wordlist(props) +
    ' exist' +
    pluralize(props.length, 's') +
    ' in config...'
  );
}

/**
 * Determine which required properties are missing.
 * @param {string[]} props - Property names to check.
 * @returns {string[]} Array of missing property names (quoted).
 */
function getMissingProps(props) {
  return props
    .filter((prop) => config.get(prop) == null)
    .map((prop) => `"${prop}"`);
}

/**
 * Throw an error describing missing configuration properties.
 * @param {string[]} missing - Quoted missing property names.
 */
function throwMissingError(missing) {
  const pluralize = grunt.util.pluralize;
  throw grunt.util.error(
    'Required config propert' +
      pluralize(missing.length, 'y/ies') +
      ' ' +
      missing.join(', ') +
      ' missing.'
  );
}

// Verify that required configuration properties exist.
config.requires = function () {
  const props = grunt.util
    .toArray(arguments)
    .map(config.getPropString);
  const msg = buildVerificationMessage(props);
  grunt.verbose.write(msg);

  if (!config.data) {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    throw grunt.util.error('Unable to load config.');
  }

  const missing = getMissingProps(props);
  if (missing.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  throwMissingError(missing);
};