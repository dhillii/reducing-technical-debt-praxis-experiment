'use strict';

const grunt = require('../grunt');

// Nodejs libs.
const path = require('path');

// Set column widths.
let col1len = 0;

/**
 * Initializes the width of the first column based on the provided string length
 * @param {string} str - String to measure for column width initialization
 */
function initCol1(str) {
  col1len = Math.max(col1len, str.length);
}
exports.initCol1 = initCol1;

/**
 * Calculates and sets the table column widths for help display
 */
function initWidths() {
  // Widths for options/tasks table output.
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
}
exports.initWidths = initWidths;

/**
 * Renders an array in table format using configured widths
 * @param {Array<Array<string>>} arr - 2D array containing table data to render
 */
function table(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
}
exports.table = table;

/**
 * Initializes CLI options for display in help output
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
 * Displays the header section of the help output
 */
function header() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
}
exports.header = header;

/**
 * Displays usage information for the CLI
 */
function usage() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
}
exports.usage = usage;

/**
 * Displays the options section of the help output
 */
function options() {
  grunt.log.header('Options');
  table(exports._options);
}
exports.options = options;

/**
 * Displays additional information footer for options
 */
function optionsFooter() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
}
exports.optionsFooter = optionsFooter;

/**
 * Initializes available tasks for display in help output
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
 * Displays the tasks section of the help output
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
 * Displays the footer section of the help output
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