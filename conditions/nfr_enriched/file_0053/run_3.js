'use strict';

const grunt = require('../grunt');

// Nodejs libs.
const path = require('path');

// Set column widths.
let col1len = 0;

// Initialize column 1 width based on string length.
exports.initCol1 = function(str) {
  col1len = Math.max(col1len, str.length);
};

// Calculate and set table column widths.
exports.initWidths = function() {
  const commandWidth = Math.max(col1len + 20, 76);
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

// Display help by executing queued methods in order.
exports.display = function() {
  exports.queue.forEach(function(name) { exports[name](); });
};

// Display header with version information.
exports.header = function() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

// Display usage information.
exports.usage = function() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

// Build options array from CLI option list.
exports.initOptions = function() {
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    const option = grunt.cli.optlist[long];
    const col1 = '--' + (option.negate ? 'no-' : '') + long + (option.short ? ', -' + option.short : '');
    exports.initCol1(col1);
    return [col1, option.info];
  });
};

// Display available options.
exports.options = function() {
  grunt.log.header('Options');
  exports.table(exports._options);
};

// Display options footer with additional information.
exports.optionsFooter = function() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

// Initialize tasks by loading task system and building task list.
exports.initTasks = function() {
  grunt.task.init([], {help: true});
  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
};

// Format task information for display.
const formatTaskInfo = function(task) {
  let info = task.info;
  if (task.multi) { info += ' *'; }
  return [task.name, info];
};

// Display available tasks.
exports.tasks = function() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    exports.table(exports._tasks.map(formatTaskInfo));
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

// Display footer with additional resources.
exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};