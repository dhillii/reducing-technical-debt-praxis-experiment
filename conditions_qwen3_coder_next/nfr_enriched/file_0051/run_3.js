'use strict';

var grunt = require('../grunt');

/**
 * Get or set config data.
 * @param {string|string[]} prop - Property path or array of paths.
 * @param {*} [value] - Value to set (if omitted, retrieves instead).
 * @returns {*} The retrieved or set value.
 */
var config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  }
  return config.get(prop);
};

// The actual config data.
config.data = {};

/**
 * Escape dots in property name for namespace resolution.
 * @param {string} str - Property string to escape.
 * @returns {string} Escaped property string.
 */
config.escape = function(str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Convert property specifier to string representation.
 * @param {string|string[]} prop - Property path (string or array).
 * @returns {string} Escaped dot-separated property string.
 */
config.getPropString = function(prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Get raw (unprocessed) config data.
 * @param {string|string[]} [prop] - Property path (optional; entire config if omitted).
 * @returns {*} Raw config value or object.
 */
config.getRaw = function(prop) {
  if (prop) {
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  return config.data;
};

/**
 * Regular expression to match '<%= PROPERTY %>' template syntax.
 * @type {RegExp}
 */
var propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Get config data, recursively processing templates.
 * @param {string|string[]} [prop] - Property path (optional).
 * @returns {*} Processed config value.
 */
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Process a value, recursively expanding templates where applicable.
 * @param {*} raw - Raw value (may be primitive, array, or object).
 * @returns {*} Value with templates replaced by config values.
 */
config.process = function(raw) {
  return grunt.util.recurse(raw, processValue);
};

/**
 * Process an individual value during recursive template expansion.
 * @param {*} value - Value to process.
 * @returns {*} Expanded value or original if no expansion applicable.
 */
function processValue(value) {
  if (typeof value !== 'string') {
    return value;
  }

  var matches = value.match(propStringTmplRe);
  if (!matches) {
    return grunt.template.process(value, {data: config.data});
  }

  var result = config.get(matches[1]);
  return result != null ? result : grunt.template.process(value, {data: config.data});
}

/**
 * Set config data at the specified property path.
 * @param {string|string[]} prop - Property path to set.
 * @param {*} value - Value to set.
 * @returns {*} The set value.
 */
config.set = function(prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep-merge an object into config data.
 * @param {Object} obj - Object to merge.
 * @returns {Object} Updated config.data.
 */
config.merge = function(obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initialize config data.
 * @param {Object} [obj] - Initial data to assign (optional).
 * @returns {Object} Initialized config data.
 */
config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (config.data = obj || {});
};

/**
 * Verify required config properties are present; throw if not.
 * @param {...string} props - Property paths to verify exist.
 */
config.requires = function() {
  var p = grunt.util.pluralize;
  var props = grunt.util.toArray(arguments).map(config.getPropString);
  var msg = buildRequiresMessage(props, p);
  grunt.verbose.write(msg);
  var failProps = getMissingProperties(props);
  if (config.data && failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }
  handleValidationFailure(failProps, p, msg);
};

/**
 * Build user-facing validation error message.
 * @param {string[]} props - Property paths.
 * @param {Function} pluralizer - Pluralization utility function.
 * @returns {string} Formatted message string.
 */
function buildRequiresMessage(props, pluralizer) {
  var propList = grunt.log.wordlist(props);
  var pluralProperty = pluralizer(props.length, 'y/ies');
  var verb = pluralizer(props.length, 's');
  return 'Verifying propert' + pluralProperty + ' ' + propList +
    ' exist' + verb + ' in config...';
}

/**
 * Get list of missing required config properties.
 * @param {string[]} props - Property paths to check.
 * @returns {string[]} Array of fully-qualified missing property names.
 */
function getMissingProperties(props) {
  return (config.data && props.filter(function(prop) {
    return config.get(prop) == null;
  }).map(function(prop) {
    return '"' + prop + '"';
  })) || [];
}

/**
 * Handle validation failure by logging and throwing appropriate error.
 * @param {string[]} failProps - List of missing properties.
 * @param {Function} pluralizer - Pluralization utility function.
 * @param {string} msg - Default message to log.
 */
function handleValidationFailure(failProps, pluralizer, msg) {
  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  if (!config.data) {
    throw grunt.util.error('Unable to load config.');
  }
  var pluralProperty = pluralizer(failProps.length, 'y/ies');
  throw grunt.util.error(
    'Required config propert' + pluralProperty + ' ' +
    failProps.join(', ') + ' missing.'
  );
}