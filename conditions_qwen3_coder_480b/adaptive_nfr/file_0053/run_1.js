'use strict';

const grunt = require('../grunt');

// Nodejs libs.
const path = require('path');

// Set column widths.
let col1len = 0;

/**
 * Initialize column width based on string length
 * @param {string} str - String to measure for column width
 */
function initCol1(str) {
  col1len = Math.max(col1len, str.length);
}
exports.initCol1 = initCol1;

/**
 * Initialize table widths for options/tasks display
 */
function initWidths() {
  // Widths for options/tasks table output.
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
}
exports.initWidths = initWidths;

/**
 * Render an array in table form
 * @param {Array} arr - Array of items to render in table format
 */
function table(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
}
exports.table = table;

/**
 * Initialize CLI options for display
 */
function initOptions() {
  // Build 2-column array for table view.
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    const o = grunt.cli.optlist[long];
    const col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    initCol1(col1);
    return [col1, o.info];
  });
}
exports.initOptions = initOptions;

/**
 * Display header information
 */
function header() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
}
exports.header = header;

/**
 * Display usage information
 */
function usage() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
}
exports.usage = usage;

/**
 * Display options section
 */
function options() {
  grunt.log.header('Options');
  table(exports._options);
}
exports.options = options;

/**
 * Display options footer with additional information
 */
function optionsFooter() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
}
exports.optionsFooter = optionsFooter;

/**
 * Initialize available tasks for display
 */
function initTasks() {
  // Initialize task system so that the tasks can be listed.
  grunt.task.init([], {help: true});

  // Build object of tasks by info (where they were loaded from).
  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    initCol1(name);
    const task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
}
exports.initTasks = initTasks;

/**
 * Display available tasks
 */
function tasks() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    table(exports._tasks.map(function(task) {
      let info = task.info;
      if (task.multi) { info += ' *'; }
      return [task.name, info];
    }));

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
}
exports.tasks = tasks;

/**
 * Display footer with additional resources
 */
function footer() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
}
exports.footer = footer;

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
  exports.queue.forEach(function(name) { exports[name](); });
};