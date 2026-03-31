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

// Process template string or return value as-is
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

config.get = function(prop) {
  return process(getRaw(prop));
};

config.set = function(prop, value) {
  return grunt.util.namespace.set(configData, getPropString(prop), value);
};

config.getRaw = function(prop) {
  return getRaw(prop);
};

config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (configData = obj || {});
};

config.merge = function(obj) {
  grunt.util._.merge(configData, obj);
  return configData;
};

config.requires = function() {
  const props = grunt.util.toArray(arguments).map(getPropString);
  const pluralize = grunt.util.pluralize;
  const msg = buildRequiresMessage(props, pluralize);

  grunt.verbose.write(msg);

  if (!configData) {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    throw grunt.util.error('Unable to load config.');
  }

  const failProps = props.filter(prop => config.get(prop) == null);

  if (failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  throw grunt.util.error(
    `Required config propert${pluralize(failProps.length, 'y/ies')} ` +
    `${failProps.map(p => `"${p}"`).join(', ')} missing.`
  );
};

function buildRequiresMessage(props, pluralize) {
  return `Verifying propert${pluralize(props.length, 'y/ies')} ` +
    `${grunt.log.wordlist(props)} exist${pluralize(props.length, 's')} in config...`;
}

// Expose internal methods for testing
config.process = process;
config.escape = escapeProperty;
config.getPropString = getPropString;
config.data = configData;
```