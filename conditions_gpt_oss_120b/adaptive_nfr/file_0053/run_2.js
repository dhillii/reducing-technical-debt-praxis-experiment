'use strict';

const grunt = require('../grunt');
const path = require('path');

let col1len = 0;

/**
 * Update the maximum column width based on the provided string.
 * @param {string} str
 */
exports.initCol1 = function (str) {
  col1len = Math.max(col1len, str.length);
};

/**
 * Compute and store column widths for table output.
 */
exports.initWidths = function () {
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

/**
 * Render an array in table form.
 * @param {Array<Array<string>>} arr
 */
exports.table = function (arr) {
  arr.forEach(function (item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
};

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
 * Execute each display step in order.
 */
exports.display = function () {
  exports.queue.forEach(function (name) {
    exports[name]();
  });
};

/**
 * Print the Grunt header.
 */
exports.header = function () {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

/**
 * Print usage information.
 */
exports.usage = function () {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

/**
 * Initialize the options array for table display.
 */
exports.initOptions = function () {
  exports._options = Object.keys(grunt.cli.optlist).map(_buildOptionRow);
};

/**
 * Build a single option row for the options table.
 * @param {string} long
 * @returns {[string, string]}
 * @private
 */
function _buildOptionRow(long) {
  const o = grunt.cli.optlist[long];
  const col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
  exports.initCol1(col1);
  return [col1, o.info];
}

/**
 * Display the options table.
 */
exports.options = function () {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Print the options footer.
 */
exports.optionsFooter = function () {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Initialize the tasks list for display.
 */
exports.initTasks = function () {
  grunt.task.init([], { help: true });
  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(_collectTask);
};

/**
 * Collect a task into the internal tasks array.
 * @param {string} name
 * @private
 */
function _collectTask(name) {
  exports.initCol1(name);
  const task = grunt.task._tasks[name];
  exports._tasks.push(task);
}

/**
 * Display the tasks table and related messages.
 */
exports.tasks = function () {
  _logTasksHeader();
  if (exports._tasks.length === 0) {
    _logNoTasksFound();
  } else {
    _displayTasksTable();
    _logTasksFooter();
  }
  _logTasksDisclaimer();
};

/**
 * Log the tasks section header.
 * @private
 */
function _logTasksHeader() {
  grunt.log.header('Available tasks');
}

/**
 * Log a message when no tasks are found.
 * @private
 */
function _logNoTasksFound() {
  grunt.log.writeln('(no tasks found)');
}

/**
 * Render the tasks table.
 * @private
 */
function _displayTasksTable() {
  const rows = exports._tasks.map(_buildTaskRow);
  exports.table(rows);
}

/**
 * Build a single row for the tasks table.
 * @param {Object} task
 * @returns {[string, string]}
 * @private
 */
function _buildTaskRow(task) {
  let info = task.info;
  if (task.multi) {
    info += ' *';
  }
  return [task.name, info];
}

/**
 * Log additional information after the tasks table.
 * @private
 */
function _logTasksFooter() {
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
    'accept them by using colons, like "lint:files". Tasks marked with * are ' +
    '"multi tasks" and will iterate over all sub-targets if no argument is ' +
    'specified.'
  );
}

/**
 * Log the final disclaimer about task availability.
 * @private
 */
function _logTasksDisclaimer() {
  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
    'grunt plugins specified in the Gruntfile or via command-line options.'
  );
}

/**
 * Print the footer.
 */
exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};