'use strict';

var grunt = require('../grunt');

// Nodejs libs.
var path = require('path');

// Set column widths.
var col1len = 0;

/**
 * Initialize column 1 width to accommodate the longest string seen so far.
 */
function updateCol1Length(str) {
  col1len = Math.max(col1len, str.length);
}

/**
 * Initialize table column widths based on current column 1 length.
 */
function initializeTableWidths() {
  var commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
}

/**
 * Render an array as a table row.
 * @param {Array} arr - Array of [col1, col2] pairs to render.
 */
function renderTableRows(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
}

// Methods to run, in-order.
exports.queue = [
  'initOptions',
  'initTasks',
  'initializeTableWidths',
  'header',
  'usage',
  'options',
  'optionsFooter',
  'tasks',
  'footer',
];

/**
 * Actually display help content by executing all functions in the queue.
 */
function executeDisplayQueue() {
  exports.queue.forEach(function(name) { exports[name](); });
}

// Reassign display to new orchestration function
exports.display = executeDisplayQueue;

/**
 * Display the Grunt version header.
 */
function displayHeader() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
}

// Reassign header to new implementation
exports.header = displayHeader;

/**
 * Display the usage information.
 */
function displayUsage() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
}

// Reassign usage to new implementation
exports.usage = displayUsage;

/**
 * Initialize and collect available command-line options into a table-ready array.
 */
function initializeOptions() {
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    updateCol1Length(col1);
    return [col1, o.info];
  });
}

// Reassign initOptions to new implementation
exports.initOptions = initializeOptions;

/**
 * Display the command-line options.
 */
function displayOptions() {
  grunt.log.header('Options');
  renderTableRows(exports._options);
}

// Reassign options to new implementation
exports.options = displayOptions;

/**
 * Display the options footer note about Gruntfile usage.
 */
function displayOptionsFooter() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
}

// Reassign optionsFooter to new implementation
exports.optionsFooter = displayOptionsFooter;

/**
 * Initialize and collect available tasks into a table-ready array.
 */
function initializeTasks() {
  // Initialize task system so that the tasks can be listed.
  grunt.task.init([], {help: true});

  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    updateCol1Length(name);
    var task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
}

// Reassign initTasks to new implementation
exports.initTasks = initializeTasks;

/**
 * Display the list of available tasks.
 */
function displayTasks() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
    return;
  }

  renderTableRows(exports._tasks.map(function(task) {
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

  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
    'grunt plugins specified in the Gruntfile or via command-line options.'
  );
}

// Reassign tasks to new implementation
exports.tasks = displayTasks;

/**
 * Display the footer with project URL.
 */
function displayFooter() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
}

// Reassign footer to new implementation
exports.footer = displayFooter;

// Reassign initWidths to new implementation
exports.initWidths = initializeTableWidths;

// Reassign table to new implementation
exports.table = renderTableRows;