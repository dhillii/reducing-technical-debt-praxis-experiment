'use strict';

const grunt = require('../grunt');

/**
 * Get/set config data. If value was passed, set. Otherwise, get.
 * @param {string|Array} prop
 * @param {*} [value]
 * @returns {*}
 */
const config = module.exports = function (prop, value) {
  if (arguments.length === 2) {
    // Two arguments were passed, set the property's value.
    return config.set(prop, value);
  }
  // Get the property's value (or the entire data object).
  return config.get(prop);
};

// The actual config data.
config.data = {};

/**
 * Escape any . in name with \. so dot-based namespacing works properly.
 * @param {string} str
 * @returns {string}
 */
config.escape = function (str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Return prop as a string.
 * @param {string|Array} prop
 * @returns {string}
 */
config.getPropString = function (prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Get raw, unprocessed config data.
 * @param {string|Array} [prop]
 * @returns {*}
 */
config.getRaw = function (prop) {
  if (prop) {
    // Prop was passed, get that specific property's value.
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  // No prop was passed, return the entire config.data object.
  return config.data;
};

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Determine if a value is a string.
 * @param {*} value
 * @returns {boolean}
 */
function isString(value) {
  return typeof value === 'string';
}

/**
 * Extract template matches from a string.
 * @param {string} value
 * @returns {RegExpMatchArray|null}
 */
function getTemplateMatch(value) {
  return value.match(propStringTmplRe);
}

/**
 * Resolve a template match to a config value.
 * @param {RegExpMatchArray} matches
 * @returns {*}
 */
function resolveTemplate(matches) {
  return config.get(matches[1]);
}

/**
 * Get config data, recursively processing templates.
 * @param {string|Array} prop
 * @returns {*}
 */
config.get = function (prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Expand a config value recursively. Used for post-processing raw values
 * already retrieved from the config.
 * @param {*} raw
 * @returns {*}
 */
config.process = function (raw) {
  return grunt.util.recurse(raw, function (value) {
    if (!isString(value)) {
      return value;
    }

    const matches = getTemplateMatch(value);
    if (matches) {
      const result = resolveTemplate(matches);
      if (result != null) {
        return result;
      }
    }

    // Process the string as a template.
    return grunt.template.process(value, { data: config.data });
  });
};

/**
 * Set config data.
 * @param {string|Array} prop
 * @param {*} value
 * @returns {*}
 */
config.set = function (prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep merge config data.
 * @param {Object} obj
 * @returns {Object}
 */
config.merge = function (obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initialize config data.
 * @param {Object} [obj]
 * @returns {Object}
 */
config.init = function (obj) {
  grunt.verbose.write('Initializing config...').ok();
  // Initialize and return data.
  return (config.data = obj || {});
};

/**
 * Determine missing required properties.
 * @param {Array<string>} props
 * @returns {Array<string>}
 */
function getMissingProps(props) {
  return props.filter(function (prop) {
    return config.get(prop) == null;
  });
}

/**
 * Format missing properties message.
 * @param {Array<string>} missing
 * @returns {string}
 */
function formatMissingMessage(missing) {
  const p = grunt.util.pluralize;
  return 'Required config propert' + p(missing.length, 'y/ies') + ' ' + missing.map(p => `"${p}"`).join(', ') + ' missing.';
}

/**
 * Test to see if required config params have been defined. If not, throw an
 * exception (use this inside of a task).
 * @param {...(string|Array)} args
 * @returns {boolean}
 * @throws Will throw an error if required properties are missing.
 */
config.requires = function () {
  const p = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = 'Verifying propert' + p(props.length, 'y/ies') + ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') + ' in config...';
  grunt.verbose.write(msg);

  const missing = config.data ? getMissingProps(props) : [];

  if (config.data && missing.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  }
  throw grunt.util.error(formatMissingMessage(missing));
};