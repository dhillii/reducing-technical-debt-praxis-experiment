'use strict';

var grunt = require('../grunt');

// Nodejs libs.
var path = require('path');

// Set column widths.
var col1len = 0;

/**
 * Updates the maximum column 1 width based on the given string.
 * @param {string} str - String to measure and compare against current max.
 */
exports.initCol1 = function(str) {
  col1len = Math.max(col1len, str.length);
};

/**
 * Computes and assigns table widths based on current column 1 length.
 */
exports.initWidths = function() {
  var commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

/**
 * Renders an array of [key, value] pairs as a table row using log.writetableln.
 * @param {Array<Array<string>>} arr - Array of [key, value] pairs.
 */
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

/**
 * Executes each method name in queue in sequence.
 */
exports.display = function() {
  exports.queue.forEach(function(name) { exports[name](); });
};

/**
 * Displays the Grunt banner with version.
 */
exports.header = function() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

/**
 * Displays usage line for Grunt command-line invocation.
 */
exports.usage = function() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

/**
 * Builds and initializes the options table structure for display.
 */
exports.initOptions = function() {
  var options = Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = buildOptionColumn1(o, long);
    exports.initCol1(col1);
    return [col1, o.info];
  });
  exports._options = options;
};

/**
 * Builds the first column string for a CLI option.
 * @param {Object} o - Option metadata.
 * @param {string} long - Long flag name.
 * @returns {string} Formatted col1 string.
 */
function buildOptionColumn1(o, long) {
  return '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
}

/**
 * Displays the options header and table.
 */
exports.options = function() {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Displays footer text for options section.
 */
exports.optionsFooter = function() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Initializes the task list and metadata for help display.
 */
exports.initTasks = function() {
  grunt.task.init([], {help: true});
  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    exports.initCol1(name);
    var task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
};

/**
 * Displays the available tasks header and list.
 */
exports.tasks = function() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    displayNoTasksMessage();
  } else {
    displayTaskTable();
    displayTaskNotes();
  }
  displayTaskFooter();
};

/**
 * Displays "(no tasks found)" message.
 */
function displayNoTasksMessage() {
  grunt.log.writeln('(no tasks found)');
}

/**
 * Renders the task table with multi-task indicators.
 */
function displayTaskTable() {
  exports.table(exports._tasks.map(function(task) {
    var info = task.info;
    if (task.multi) { info += ' *'; }
    return [task.name, info];
  }));
}

/**
 * Displays notes about task execution and multi-task behavior.
 */
function displayTaskNotes() {
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
    'accept them by using colons, like "lint:files". Tasks marked with * are ' +
    '"multi tasks" and will iterate over all sub-targets if no argument is ' +
    'specified.'
  );
}

/**
 * Displays footer note about task list variability.
 */
function displayTaskFooter() {
  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
    'grunt plugins specified in the Gruntfile or via command-line options.'
  );
}

/**
 * Displays the help footer with project URL.
 */
exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};