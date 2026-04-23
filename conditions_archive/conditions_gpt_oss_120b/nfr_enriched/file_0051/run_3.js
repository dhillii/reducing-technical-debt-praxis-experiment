```javascript
'use strict';

const grunt = require('../grunt');

/**
 * Get/set config data. If a value is provided, set the property; otherwise, get it.
 * @param {string|Array} prop - Property name or path.
 * @param {*} [value] - Value to set.
 * @returns {*} Config value or the config object.
 */
const config = module.exports = function (prop, value) {
  return arguments.length === 2 ? config.set(prop, value) : config.get(prop);
};

/** The actual config data. */
config.data = {};

/**
 * Escape any '.' in a name with '\.' so dot‑based namespacing works properly.
 * @param {string} str
 * @returns {string}
 */
config.escape = function (str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Convert a property identifier to a dot‑separated string.
 * @param {string|Array} prop
 * @returns {string}
 */
config.getPropString = function (prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Retrieve raw, unprocessed config data.
 * @param {string|Array} [prop]
 * @returns {*}
 */
config.getRaw = function (prop) {
  if (prop) {
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  return config.data;
};

/** Template matcher for "<%= foo %>" patterns. */
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Get config data, recursively processing templates.
 * @param {string|Array} [prop]
 * @returns {*}
 */
config.get = function (prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Recursively expand a config value, processing any template strings.
 * @param {*} raw
 * @returns {*}
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
    return grunt.template.process(value, { data: config.data });
  });
};

/**
 * Set a config property.
 * @param {string|Array} prop
 * @param {*} value
 * @returns {*}
 */
config.set = function (prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep‑merge an object into the config.
 * @param {Object} obj
 * @returns {Object}
 */
config.merge = function (obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initialise the config with an optional object.
 * @param {Object} [obj]
 * @returns {Object}
 */
config.init = function (obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (config.data = obj || {});
};

/**
 * Build a verification message for required properties.
 * @param {Array<string>} props
 * @returns {string}
 */
function buildVerificationMessage(props) {
  const p = grunt.util.pluralize;
  return (
    'Verifying propert' +
    p(props.length, 'y/ies') +
    ' ' +
    grunt.log.wordlist(props) +
    ' exist' +
    p(props.length, 's') +
    ' in config...'
  );
}

/**
 * Determine which required properties are missing.
 * @param {Array<string>} props
 * @returns {Array<string>}
 */
function findMissingProps(props) {
  return props
    .filter(prop => config.get(prop) == null)
    .map(prop => `"${prop}"`);
}

/**
 * Ensure required config properties are defined; throws if any are missing.
 * @param {...(string|Array)} args - Property names or paths.
 * @returns {boolean}
 * @throws Will throw an error if required properties are missing or config is not loaded.
 */
config.requires = function () {
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = buildVerificationMessage(props);
  grunt.verbose.write(msg);

  const missing = config.data ? findMissingProps(props) : [];

  if (config.data && missing.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');

  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  }

  const p = grunt.util.pluralize;
  throw grunt.util.error(
    'Required config propert' +
      p(missing.length, 'y/ies') +
      ' ' +
      missing.join(', ') +
      ' missing.'
  );
};
```