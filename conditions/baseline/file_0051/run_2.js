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

// Process a value recursively, handling template expansion.
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

// Expand a config value recursively.
function process(raw) {
  return grunt.util.recurse(raw, processValue);
}

// Get config data, recursively processing templates.
function get(prop) {
  return process(getRaw(prop));
}

// Set config data.
function set(prop, value) {
  return grunt.util.namespace.set(configData, getPropString(prop), value);
}

// Get/set config data. If value was passed, set. Otherwise, get.
var config = module.exports = function(prop, value) {
  return arguments.length === 2 ? set(prop, value) : get(prop);
};

// Public API
config.data = configData;
config.escape = escapeProperty;
config.getPropString = getPropString;
config.getRaw = getRaw;
config.get = get;
config.process = process;
config.set = set;

config.merge = function(obj) {
  grunt.util._.merge(configData, obj);
  return configData;
};

config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (configData = obj || {});
};

config.requires = function() {
  const pluralize = grunt.util.pluralize;
  const props = grunt.util.toArray(arguments).map(getPropString);
  const msg = `Verifying propert${pluralize(props.length, 'y/ies')} ${grunt.log.wordlist(props)} exist${pluralize(props.length, 's')} in config...`;

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