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
 * Initialize column widths for table output.
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
 * Execute the display queue in order.
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
 * Initialize options for display.
 */
exports.initOptions = function () {
  exports._options = Object.keys(grunt.cli.optlist).map(function (long) {
    const o = grunt.cli.optlist[long];
    return _buildOptionEntry(long, o);
  });
};

/**
 * Build a single option entry for the options table.
 * @param {string} long
 * @param {{negate?:boolean, short?:string, info:string}} o
 * @returns {[string,string]}
 * @private
 */
function _buildOptionEntry(long, o) {
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
 * Display the options footer.
 */
exports.optionsFooter = function () {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
      'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Initialize tasks for display.
 */
exports.initTasks = function () {
  _initializeTaskSystem();
  exports._tasks = _collectTaskObjects();
};

/**
 * Initialize the Grunt task system in help mode.
 * @private
 */
function _initializeTaskSystem() {
  grunt.task.init([], { help: true });
}

/**
 * Collect task objects and update column width tracking.
 * @returns {Array<Object>}
 * @private
 */
function _collectTaskObjects() {
  const tasks = [];
  Object.keys(grunt.task._tasks).forEach(function (name) {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    tasks.push(task);
  });
  return tasks;
}

/**
 * Display the tasks table and related information.
 */
exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    _displayNoTasksMessage();
  } else {
    _displayTasksTable();
    _displayTasksInfo();
  }
  _displayTasksFooter();
};

/**
 * Write a message indicating no tasks were found.
 * @private
 */
function _displayNoTasksMessage() {
  grunt.log.writeln('(no tasks found)');
}

/**
 * Render the tasks table.
 * @private
 */
function _displayTasksTable() {
  const rows = exports._tasks.map(_formatTaskEntry);
  exports.table(rows);
}

/**
 * Format a single task entry for the tasks table.
 * @param {Object} task
 * @returns {[string,string]}
 * @private
 */
function _formatTaskEntry(task) {
  let info = task.info;
  if (task.multi) {
    info += ' *';
  }
  return [task.name, info];
}

/**
 * Write additional information about task usage.
 * @private
 */
function _displayTasksInfo() {
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
      'accept them by using colons, like "lint:files". Tasks marked with * are ' +
      '"multi tasks" and will iterate over all sub-targets if no argument is ' +
      'specified.'
  );
}

/**
 * Write the footer message for the tasks section.
 * @private
 */
function _displayTasksFooter() {
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