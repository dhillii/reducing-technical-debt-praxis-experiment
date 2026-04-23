'use strict';

var grunt = require('../grunt');
var path = require('path');

var col1len = 0;
var widths = null;

/**
 * Initialize the maximum length for the first column of the table.
 * @param {string} str - The string to measure.
 */
function initCol1(str) {
  col1len = Math.max(col1len, str.length);
}

/**
 * Initialize the column widths for the options and tasks table output.
 * @returns {number[]} An array of column widths.
 */
function initWidths() {
  var commandWidth = Math.max(col1len + 20, 76);
  widths = [1, col1len, 2, commandWidth - col1len];
}

/**
 * Render an array of items in a table format.
 * @param {Array} arr - The array of items to render.
 */
function table(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
}

/**
 * Define the sequence of steps to display help information.
 * @type {string[]}
 */
var queue = [
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

/**
 * Execute the help display sequence.
 */
function display() {
  queue.forEach(function(name) {
    exports[name]();
  });
}

/**
 * Display the Grunt version header.
 */
function header() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
}

/**
 * Display usage information.
 */
function usage() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
}

/**
 * Initialize the options list for display.
 */
function initOptions() {
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    initCol1(col1);
    return [col1, o.info];
  });
}

/**
 * Display the options list.
 */
function options() {
  grunt.log.header('Options');
  table(exports._options);
}

/**
 * Display the options footer note.
 */
function optionsFooter() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
}

/**
 * Initialize the task system and gather task information.
 */
function initTasks() {
  grunt.task.init([], {help: true});

  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    initCol1(name);
    var task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
}

/**
 * Display the list of available tasks.
 */
function tasks() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    var taskRows = exports._tasks.map(function(task) {
      var info = task.info;
      if (task.multi) { info += ' *'; }
      return [task.name, info];
    });
    table(taskRows);

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

/**
 * Display the footer information.
 */
function footer() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
}

exports.initCol1 = initCol1;
exports.initWidths = initWidths;
exports.table = table;
exports.queue = queue;
exports.display = display;
exports.header = header;
exports.usage = usage;
exports.initOptions = initOptions;
exports.options = options;
exports.optionsFooter = optionsFooter;
exports.initTasks = initTasks;
exports.tasks = tasks;
exports.footer = footer;