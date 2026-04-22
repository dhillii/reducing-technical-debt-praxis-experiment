```javascript
'use strict';

const grunt = require('../grunt');

// Get/set config data. If value was passed, set. Otherwise, get.
const config = module.exports = function (prop, value) {
  return arguments.length === 2 ? config.set(prop, value) : config.get(prop);
};

// The actual config data.
config.data = {};

// Escape any . in name with \. so dot‑based namespacing works properly.
config.escape = function (str) {
  return str.replace(/\./g, '\\.');
};

// Return prop as a string.
config.getPropString = function (prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

// Get raw, unprocessed config data.
config.getRaw = function (prop) {
  if (prop) {
    // Specific property.
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  // Entire config object.
  return config.data;
};

// Template matcher.
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

// Get config data, recursively processing templates.
config.get = function (prop) {
  return config.process(config.getRaw(prop));
};

// Expand a config value recursively.
config.process = function (raw) {
  return grunt.util.recurse(raw, function (value) {
    if (typeof value !== 'string') { return value; }

    const matches = value.match(propStringTmplRe);
    if (matches) {
      const result = config.get(matches[1]);
      if (result != null) { return result; }
    }

    return grunt.template.process(value, { data: config.data });
  });
};

// Set config data.
config.set = function (prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

// Deep merge config data.
config.merge = function (obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

// Initialize config data.
config.init = function (obj) {
  grunt.verbose.write('Initializing config...').ok();
  return (config.data = obj || {});
};

/* Helper: build verification message */
function buildVerificationMessage (props) {
  const p = grunt.util.pluralize;
  return (
    'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...'
  );
}

/* Helper: collect missing properties */
function collectMissingProps (props) {
  return props
    .filter(prop => config.get(prop) == null)
    .map(prop => `"${prop}"`);
}

// Test required config params; throws if any are missing.
config.requires = function () {
  const props = grunt.util.toArray(arguments).map(config.getPropString);
  const msg = buildVerificationMessage(props);
  grunt.verbose.write(msg);

  const failProps = config.data ? collectMissingProps(props) : [];

  if (config.data && failProps.length === 0) {
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
    'Required config propert' + p(failProps.length, 'y/ies') +
    ' ' + failProps.join(', ') + ' missing.'
  );
};
```