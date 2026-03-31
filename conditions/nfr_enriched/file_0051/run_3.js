```javascript
'use strict';

const grunt = require('../grunt');

// Configuration manager with get/set operations
const config = module.exports = function(prop, value) {
  return arguments.length === 2 ? config.set(prop, value) : config.get(prop);
};

// The actual config data
config.data = {};

// Utility functions
const utils = {
  escape: (str) => str.replace(/\./g, '\\.'),
  
  getPropString: (prop) => 
    Array.isArray(prop) ? prop.map(utils.escape).join('.') : prop,
  
  isValidPropString: (str) => /^[a-z0-9_$]+(?:\.[a-z0-9_$]+)*$/i.test(str),
  
  matchPropTemplate: (value) => {
    const match = value.match(/^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i);
    return match ? match[1] : null;
  }
};

// Get raw, unprocessed config data
config.getRaw = function(prop) {
  if (!prop) {
    return config.data;
  }
  return grunt.util.namespace.get(config.data, utils.getPropString(prop));
};

// Get config data with recursive template processing
config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

// Recursively process and expand template strings
config.process = function(raw) {
  return grunt.util.recurse(raw, (value) => {
    if (typeof value !== 'string') {
      return value;
    }

    const propName = utils.matchPropTemplate(value);
    if (propName) {
      const result = config.get(propName);
      if (result != null) {
        return result;
      }
    }

    return grunt.template.process(value, { data: config.data });
  });
};

// Set config data
config.set = function(prop, value) {
  return grunt.util.namespace.set(config.data, utils.getPropString(prop), value);
};

// Deep merge config data
config.merge = function(obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

// Initialize config data
config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  config.data = obj || {};
  return config.data;
};

// Verify required config properties exist
config.requires = function() {
  const props = grunt.util.toArray(arguments).map(utils.getPropString);
  const pluralize = grunt.util.pluralize;
  const msg = `Verifying propert${pluralize(props.length, 'y/ies')} ` +
    `${grunt.log.wordlist(props)} exist${pluralize(props.length, 's')} in config...`;

  grunt.verbose.write(msg);

  if (!config.data) {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    throw grunt.util.error('Unable to load config.');
  }

  const failProps = props
    .filter((prop) => config.get(prop) == null)
    .map((prop) => `"${prop}"`);

  if (failProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  throw grunt.util.error(
    `Required config propert${pluralize(failProps.length, 'y/ies')} ` +
    `${failProps.join(', ')} missing.`
  );
};
```