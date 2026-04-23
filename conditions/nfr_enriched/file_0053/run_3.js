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

// Calculate and store table column widths.
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

// Display help content by executing queued methods.
exports.display = function() {
  exports.queue.forEach(function(name) { exports[name](); });
};

// Display header with Grunt version.
exports.header = function() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

// Display usage information.
exports.usage = function() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

// Build options array from CLI option list.
const buildOptionsArray = function() {
  return Object.keys(grunt.cli.optlist).map(function(long) {
    const o = grunt.cli.optlist[long];
    const col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    exports.initCol1(col1);
    return [col1, o.info];
  });
};

// Initialize options for display.
exports.initOptions = function() {
  exports._options = buildOptionsArray();
};

// Display available options.
exports.options = function() {
  grunt.log.header('Options');
  exports.table(exports._options);
};

// Display options footer note.
exports.optionsFooter = function() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

// Collect all registered tasks into array.
const collectTasks = function() {
  const tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    tasks.push(task);
  });
  return tasks;
};

// Initialize task system and build tasks array.
exports.initTasks = function() {
  grunt.task.init([], {help: true});
  exports._tasks = collectTasks();
};

// Format task information for display.
const formatTaskInfo = function(task) {
  let info = task.info;
  if (task.multi) { info += ' *'; }
  return [task.name, info];
};

// Display available tasks and usage information.
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

// Display footer with documentation link.
exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};