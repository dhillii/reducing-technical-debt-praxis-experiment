```javascript
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
    return config.set(prop, value);
  }
  return config.get(prop);
};

// The actual config data.
config.data = {};

/**
 * Escape any . in name with \. so dot‑based namespacing works properly.
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
    return grunt.util.namespace.get(config.data, config.getPropString(prop));
  }
  return config.data;
};

const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

/**
 * Determine if a value is a template string.
 * @param {string} value
 * @returns {RegExpMatchArray|null}
 */
function matchTemplate(value) {
  return value.match(propStringTmplRe);
}

/**
 * Resolve a template match to its config value.
 * @param {RegExpMatchArray} matches
 * @returns {*}
 */
function resolveTemplate(matches) {
  const result = config.get(matches[1]);
  return result != null ? result : undefined;
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
 * Expand a config value recursively. Used for post‑processing raw values
 * already retrieved from the config.
 * @param {*} raw
 * @returns {*}
 */
config.process = function (raw) {
  return grunt.util.recurse(raw, function (value) {
    if (typeof value !== 'string') {
      return value;
    }
    const matches = matchTemplate(value);
    if (matches) {
      const resolved = resolveTemplate(matches);
      if (resolved !== undefined) {
        return resolved;
      }
    }
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
  return (config.data = obj || {});
};

/**
 * Build verification message.
 * @param {Array<string>} props
 * @returns {string}
 */
function buildVerifyMessage(props) {
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
function getMissingProps(props) {
  if (!config.data) {
    return props;
  }
  return props.filter(prop => config.get(prop) == null).map(prop => `"${prop}"`);
}

/**
 * Test to see if required config params have been defined. If not, throw an
 * exception (use this inside of a task).
 * @param {...(string|Array)} args
 * @returns {boolean}
 * @throws {Error}
 */
config.requires = function (...args) {
  const props = grunt.util.toArray(args).map(config.getPropString);
  const msg = buildVerifyMessage(props);
  grunt.verbose.write(msg);

  const missing = getMissingProps(props);

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