```javascript
'use strict';

var grunt = require('../grunt');
var path = require('path');

// Column width management
var col1len = 0;

const MINIMUM_COMMAND_WIDTH = 76;
const COMMAND_WIDTH_PADDING = 20;

exports.initCol1 = function(str) {
  col1len = Math.max(col1len, str.length);
};

exports.initWidths = function() {
  var commandWidth = Math.max(col1len + COMMAND_WIDTH_PADDING, MINIMUM_COMMAND_WIDTH);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

// Table rendering
exports.table = function(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
};

// Display queue and runner
exports.queue = [
  'initOptions',
  'initTasks',
  'initWidths',
  'header',
  'usage',
  'options',
  'optionsFooter',
  'tasks',
  'footer',
];

exports.display = function() {
  exports.queue.forEach(function(name) { exports[name](); });
};

// Section renderers
exports.header = function() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

exports.usage = function() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

exports.options = function() {
  grunt.log.header('Options');
  exports.table(exports._options);
};

exports.optionsFooter = function() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};

// Options initialization
exports.initOptions = function() {
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = buildOptionFlag(long, o);
    exports.initCol1(col1);
    return [col1, o.info];
  });
};

function buildOptionFlag(long, option) {
  var flag = '--' + (option.negate ? 'no-' : '') + long;
  return option.short ? flag + ', -' + option.short : flag;
}

// Tasks initialization and rendering
exports.initTasks = function() {
  grunt.task.init([], {help: true});

  exports._tasks = Object.keys(grunt.task._tasks).map(function(name) {
    exports.initCol1(name);
    return grunt.task._tasks[name];
  });
};

exports.tasks = function() {
  grunt.log.header('Available tasks');

  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    exports.table(exports._tasks.map(formatTaskRow));
    grunt.log.writeln().writelns(
      'Tasks run in the order specified. Arguments may be passed to tasks that ' +
      'accept them by using colons, like "lint:files". Tasks marked with * are ' +
      '"multi tasks" and will iterate over all sub-targets if no argument is ' +
      'specified.'
    );
  }

  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
    'grunt plugins specified in the Gruntfile or via command-line options.'
  );
};

function formatTaskRow(task) {
  var info = task.multi ? task.info + ' *' : task.info;
  return [task.name, info];
}
```