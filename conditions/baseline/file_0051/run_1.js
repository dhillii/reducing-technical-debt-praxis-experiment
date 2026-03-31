```javascript
'use strict';

var grunt = require('../grunt');

// The actual config data.
var configData = {};

// Escape any . in name with \. so dot-based namespacing works properly.
function escapeProperty(str) {
  return str.replace(/\./g, '\\.');
}

// Return prop as a string.
function getPropString(prop) {
  return Array.isArray(prop) ? prop.map(escapeProperty).join('.') : prop;
}

// Get raw, unprocessed config data.
function getRaw(prop) {
  if (prop) {
    return grunt.util.namespace.get(configData, getPropString(prop));
  }
  return configData;
}

// Match '<%= FOO %>' where FOO is a propString
const PROP_STRING_TEMPLATE_RE = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

// Process a single value, handling template expansion
function processValue(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const matches = value.match(PROP_STRING_TEMPLATE_RE);
  if (matches) {
    const result = config.get(matches[1]);
    if (result != null) {
      return result;
    }
  }

  return grunt.template.process(value, { data: configData });
}

// Expand a config value recursively
function process(raw) {
  return grunt.util.recurse(raw, processValue);
}

// Get/set config data. If value was passed, set. Otherwise, get.
var config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  }
  return config.get(prop);
};

config.data = configData;
config.escape = escapeProperty;
config.getPropString = getPropString;
config.getRaw = getRaw;
config.process = process;

// Get config data, recursively processing templates.
config.get = function(prop) {
  return process(getRaw(prop));
};

// Set config data.
config.set = function(prop, value) {
  return grunt.util.namespace.set(configData, getPropString(prop), value);
};

// Deep merge config data.
config.merge = function(obj) {
  grunt.util._.merge(configData, obj);
  return configData;
};

// Initialize config data.
config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (configData = obj || {});
};

// Test to see if required config params have been defined.
config.requires = function() {
  const pluralize = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(getPropString);
  const propCount = props.length;
  const msg = `Verifying propert${pluralize(propCount, 'y/ies')} ${grunt.log.wordlist(props)} exist${pluralize(propCount, 's')} in config...`;

  grunt.verbose.write(msg);

  if (!configData) {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    throw grunt.util.error('Unable to load config.');
  }

  const failProps = props
    .filter(prop => config.get(prop) == null)
    .map(prop => `"${prop}"`);

  if (failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  throw grunt.util.error(
    `Required config propert${pluralize(failProps.length, 'y/ies')} ${failProps.join(', ')} missing.`
  );
};
```