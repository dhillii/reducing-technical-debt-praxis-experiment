```javascript
'use strict';

const grunt = require('../grunt');

/**
 * Get/set config data. If a value is provided, set the property; otherwise, get it.
 */
const config = function (prop, value) {
  if (arguments.length === 2) {
    // Set mode
    return config.set(prop, value);
  }
  // Get mode
  return config.get(prop);
};

module.exports = config;

// ---------------------------------------------------------------------------
// Internal data store
// ---------------------------------------------------------------------------
config.data = {};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Escape dots in a string for dot‑based namespacing.
 */
config.escape = function (str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Convert a property (string or array) to a dot‑separated string.
 */
config.getPropString = function (prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Retrieve raw (unprocessed) config data.
 */
config.getRaw = function (prop) {
  if (prop) {
    // Specific property
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  // Entire config object
  return config.data;
};

// ---------------------------------------------------------------------------
// Template processing
// ---------------------------------------------------------------------------

const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Resolve a config value, expanding any template strings.
 */
config.get = function (prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Recursively process a raw config value, expanding template strings.
 */
config.process = function (raw) {
  return grunt.util.recurse(raw, function (value) {
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
    // Fallback to standard template processing
    return grunt.template.process(value, { data: config.data });
  });
};

// ---------------------------------------------------------------------------
// Mutators
// ---------------------------------------------------------------------------

/**
 * Set a config property.
 */
config.set = function (prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep‑merge an object into the config.
 */
config.merge = function (obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initialise the config store.
 */
config.init = function (obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (config.data = obj || {});
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Ensure required config properties exist; throws if any are missing.
 */
config.requires = function () {
  const pluralize = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = `Verifying propert${pluralize(props.length, 'y/ies')} ${grunt.log.wordlist(
    props
  )} exist${pluralize(props.length, 's')} in config...`;

  grunt.verbose.write(msg);

  if (!config.data) {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    throw grunt.util.error('Unable to load config.');
  }

  const missing = props
    .filter((prop) => config.get(prop) == null)
    .map((prop) => `"${prop}"`);

  if (missing.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  throw grunt.util.error(
    `Required config propert${pluralize(missing.length, 'y/ies')} ${missing.join(
      ', '
    )} missing.`
  );
};
```