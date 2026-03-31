```javascript
'use strict';

const grunt = require('../grunt');

// Configuration data store
const config = module.exports = function(prop, value) {
  return arguments.length === 2 ? config.set(prop, value) : config.get(prop);
};

config.data = {};

// String utilities
const stringUtils = {
  escape: (str) => str.replace(/\./g, '\\.'),
  
  getPropString: (prop) => {
    return Array.isArray(prop) ? prop.map(stringUtils.escape).join('.') : prop;
  }
};

// Data retrieval
const dataRetrieval = {
  getRaw: (prop) => {
    if (!prop) return config.data;
    return grunt.util.namespace.get(config.data, stringUtils.getPropString(prop));
  },
  
  get: (prop) => {
    return dataProcessing.process(dataRetrieval.getRaw(prop));
  }
};

// Data processing and templating
const propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

const dataProcessing = {
  process: (raw) => {
    return grunt.util.recurse(raw, (value) => {
      if (typeof value !== 'string') return value;
      
      const matches = value.match(propStringTmplRe);
      if (matches) {
        const result = dataRetrieval.get(matches[1]);
        if (result != null) return result;
      }
      
      return grunt.template.process(value, { data: config.data });
    });
  }
};

// Data mutation
const dataMutation = {
  set: (prop, value) => {
    return grunt.util.namespace.set(config.data, stringUtils.getPropString(prop), value);
  },
  
  merge: (obj) => {
    grunt.util._.merge(config.data, obj);
    return config.data;
  },
  
  init: (obj) => {
    grunt.verbose.write('Initializing config...').ok();
    return (config.data = obj || {});
  }
};

// Validation
const validation = {
  requires: function() {
    const pluralize = grunt.util.pluralize;
    const props = grunt.util.toArray(arguments).map(stringUtils.getPropString);
    const msgBase = `Verifying propert${pluralize(props.length, 'y/ies')} ${grunt.log.wordlist(props)} exist${pluralize(props.length, 's')} in config...`;
    
    grunt.verbose.write(msgBase);
    
    if (!config.data) {
      grunt.verbose.or.write(msgBase);
      grunt.log.error().error('Unable to process task.');
      throw grunt.util.error('Unable to load config.');
    }
    
    const failProps = props
      .filter((prop) => dataRetrieval.get(prop) == null)
      .map((prop) => `"${prop}"`);
    
    if (failProps.length === 0) {
      grunt.verbose.ok();
      return true;
    }
    
    grunt.verbose.or.write(msgBase);
    grunt.log.error().error('Unable to process task.');
    throw grunt.util.error(
      `Required config propert${pluralize(failProps.length, 'y/ies')} ${failProps.join(', ')} missing.`
    );
  }
};

// Public API
config.escape = stringUtils.escape;
config.getPropString = stringUtils.getPropString;
config.getRaw = dataRetrieval.getRaw;
config.get = dataRetrieval.get;
config.process = dataProcessing.process;
config.set = dataMutation.set;
config.merge = dataMutation.merge;
config.init = dataMutation.init;
config.requires = validation.requires;
```