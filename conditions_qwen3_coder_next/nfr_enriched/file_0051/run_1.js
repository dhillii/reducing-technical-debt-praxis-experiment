'use strict';

var grunt = require('../grunt');

/**
 * Main config accessor/mutator function.
 * Gets or sets config data based on the number of arguments provided.
 */
var config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  } else {
    return config.get(prop);
  }
};

// The actual config data.
config.data = {};

/**
 * Escape dots in property names to support nested namespace access.
 */
config.escape = function(str) {
  return str.replace(/\./g, '\\.');
};

/**
 * Convert property to string representation, escaping dots if array.
 */
config.getPropString = function(prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

/**
 * Retrieve raw, unprocessed config data for a given property.
 */
config.getRaw = function(prop) {
  if (prop) {
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  } else {
    return config.data;
  }
};

// Regex to match template strings of the form '<%= propString %>'
var propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Retrieve config data with template expansion applied.
 */
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

/**
 * Determine if a value should be replaced via template resolution.
 * Returns the resolved value if a valid prop string match is found and exists,
 * otherwise falls back to template processing.
 */
config.resolveTemplateValue = function(value) {
  var matches = value.match(propStringTmplRe);
  if (matches) {
    var result = config.get(matches[1]);
    if (result != null) { return result; }
  }
  return grunt.template.process(value, {data: config.data});
};

/**
 * Recursively process a value and expand embedded config templates.
 */
config.process = function(raw) {
  return grunt.util.recurse(raw, function(value) {
    if (typeof value !== 'string') { return value; }
    return config.resolveTemplateValue(value);
  });
};

/**
 * Set a config property value at the specified namespace path.
 */
config.set = function(prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

/**
 * Deep merge an object into the config data.
 */
config.merge = function(obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

/**
 * Initialize the config with provided data.
 */
config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  config.data = obj || {};
  return config.data;
};

/**
 * Verify required config properties exist; throw error if missing.
 */
config.requires = function() {
  var props = grunt.util.toArray(arguments).map(config.getPropString);
  var pluralProp = grunt.util.pluralize(props.length, 'y/ies');
  var missingProps = config.findMissingRequiredProps(props);
  var msg = 'Verifying propert' + pluralProp +
    ' ' + grunt.log.wordlist(props) + ' exist' + grunt.util.pluralize(props.length, 's') +
    ' in config...';

  grunt.verbose.write(msg);
  if (!config.data) {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    throw grunt.util.error('Unable to load config.');
  }
  if (missingProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }
  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  throw grunt.util.error('Required config propert' +
    grunt.util.pluralize(missingProps.length, 'y/ies') +
    ' ' + missingProps.join(', ') + ' missing.');
};

/**
 * Find missing required config properties from a list of prop strings.
 */
config.findMissingRequiredProps = function(propStrings) {
  return propStrings.filter(function(prop) {
    return config.get(prop) == null;
  }).map(function(prop) {
    return '"' + prop + '"';
  });
};