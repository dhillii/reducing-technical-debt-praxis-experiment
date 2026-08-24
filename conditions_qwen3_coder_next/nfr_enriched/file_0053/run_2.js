'use strict';

var grunt = require('../grunt');

// Nodejs libs.
var path = require('path');

// Set column widths.
var col1len = 0;

/**
 * Updates the maximum length of the first column for table formatting.
 * @param {string} str - The string to measure and compare against current max.
 */
function updateCol1Length(str) {
  col1len = Math.max(col1len, str.length);
}

/**
 * Initializes column widths for table output based on current col1len.
 */
function initializeWidths() {
  var commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
}

// Expose public API methods.
exports.initCol1 = updateCol1Length;
exports.initWidths = initializeWidths;

/**
 * Renders an array of [label, description] pairs as a formatted table.
 * @param {Array<Array<string>>} arr - Array of [label, description] pairs.
 */
function renderTable(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
}

exports.table = renderTable;

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

/**
 * Executes all functions in the display queue in order.
 */
function executeDisplayQueue() {
  exports.queue.forEach(function(name) { exports[name](); });
}

exports.display = executeDisplayQueue;

/**
 * Displays the Grunt version header.
 */
function displayHeader() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
}

exports.header = displayHeader;

/**
 * Displays the usage information.
 */
function displayUsage() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
}

exports.usage = displayUsage;

/**
 * Builds the options list for display and updates column width.
 */
function initializeOptions() {
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    updateCol1Length(col1);
    return [col1, o.info];
  });
}

exports.initOptions = initializeOptions;

/**
 * Displays the options list.
 */
function displayOptions() {
  grunt.log.header('Options');
  renderTable(exports._options);
}

exports.options = displayOptions;

/**
 * Displays the options footer message.
 */
function displayOptionsFooter() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
}

exports.optionsFooter = displayOptionsFooter;

/**
 * Initializes the task list and updates column width.
 */
function initializeTasks() {
  grunt.task.init([], {help: true});

  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    updateCol1Length(name);
    var task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
}

exports.initTasks = initializeTasks;

/**
 * Displays the available tasks list.
 */
function displayTasks() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    renderTable(exports._tasks.map(function(task) {
      var info = task.info;
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

exports.tasks = displayTasks;

/**
 * Displays the footer message.
 */
function displayFooter() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
}

exports.footer = displayFooter;