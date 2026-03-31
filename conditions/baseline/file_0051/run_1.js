```javascript
'use strict';

var grunt = require('../grunt');

var config = module.exports = function(prop, value) {
  return arguments.length === 2 ? config.set(prop, value) : config.get(prop);
};

config.data = {};

config.escape = function(str) {
  return str.replace(/\./g, '\\.');
};

config.getPropString = function(prop) {
  return Array.isArray(prop) ? prop.map(config.escape).join('.') : prop;
};

config.getRaw = function(prop) {
  return prop
    ? grunt.util.namespace.get(config.data, config.getPropString(prop))
    : config.data;
};

// Matches '<%= FOO %>' where FOO is a propString like foo or foo.bar,
// but not a method call like foo() or foo.bar().
var propStringTmplRe = /^<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>$/i;

config.get = function(prop) {
  return config.process(config.getRaw(prop));
};

config.process = function(raw) {
  return grunt.util.recurse(raw, function(value) {
    if (typeof value !== 'string') { return value; }

    var matches = value.match(propStringTmplRe);
    if (matches) {
      var result = config.get(matches[1]);
      if (result != null) { return result; }
    }

    return grunt.template.process(value, {data: config.data});
  });
};

config.set = function(prop, value) {
  return grunt.util.namespace.set(config.data, config.getPropString(prop), value);
};

config.merge = function(obj) {
  grunt.util._.merge(config.data, obj);
  return config.data;
};

config.init = function(obj) {
  grunt.verbose.write('Initializing config...').ok();
  config.data = obj || {};
  return config.data;
};

config.requires = function() {
  var p = grunt.util.pluralize;
  var props = grunt.util.toArray(arguments).map(config.getPropString);
  var msg = 'Verifying propert' + p(props.length, 'y/ies') +
    ' ' + grunt.log.wordlist(props) + ' exist' + p(props.length, 's') +
    ' in config...';

  grunt.verbose.write(msg);

  if (!config.data) {
    grunt.verbose.or.write(msg);
    grunt.log.error().error('Unable to process task.');
    throw grunt.util.error('Unable to load config.');
  }

  var missingProps = props
    .filter(function(prop) { return config.get(prop) == null; })
    .map(function(prop) { return '"' + prop + '"'; });

  if (missingProps.length === 0) {
    grunt.verbose.ok();
    return true;
  }

  grunt.verbose.or.write(msg);
  grunt.log.error().error('Unable to process task.');
  throw grunt.util.error(
    'Required config propert' + p(missingProps.length, 'y/ies') +
    ' ' + missingProps.join(', ') + ' missing.'
  );
};
```