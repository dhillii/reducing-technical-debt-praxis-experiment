'use strict';

var grunt = require('../grunt');

// Nodejs libs.
var path = require('path');

// Set column widths.
var col1len = 0;
exports.initCol1 = function(str) {
  col1len = Math.max(col1len, str.length);
};
exports.initWidths = function() {
  var commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

// Render an array in table form.
exports.table = function(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
};

// Methods to run, in-order.
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

// Actually display stuff.
exports.display = function() {
  exports.queue.forEach(function(name) {
    exports[name]();
  });
};

// Header.
exports.header = function() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

// Usage info.
exports.usage = function() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

// Extract option key for sorting (to keep order consistent).
function getOptionKey(optionObj, longKey) {
  var o = optionObj[longKey];
  return '--' + (o.negate ? 'no-' : '') + longKey + (o.short ? ', -' + o.short : '');
}

exports.initOptions = function() {
  var optionKeys = Object.keys(grunt.cli.optlist).sort();
  exports._options = optionKeys.map(function(long) {
    var col1 = getOptionKey(grunt.cli.optlist, long);
    exports.initCol1(col1);
    return [col1, grunt.cli.optlist[long].info];
  });
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

// Initialize tasks and extract metadata.
exports.initTasks = function() {
  grunt.task.init([], {help: true});

  var taskKeys = Object.keys(grunt.task._tasks);
  exports._tasks = [];

  taskKeys.forEach(function(name) {
    exports.initCol1(name);
    var task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
};

exports.tasks = function() {
  grunt.log.header('Available tasks');

  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
    return;
  }

  var taskList = exports._tasks.map(function(task) {
    var info = task.info;
    if (task.multi) {
      info += ' *';
    }
    return [task.name, info];
  });

  exports.table(taskList);

  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
    'accept them by using colons, like "lint:files". Tasks marked with * are ' +
    '"multi tasks" and will iterate over all sub-targets if no argument is ' +
    'specified.'
  );

  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
    'grunt plugins specified in the Gruntfile or via command-line options.'
  );
};

// Footer.
exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};