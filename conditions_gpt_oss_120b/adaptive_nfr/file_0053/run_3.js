'use strict';

const grunt = require('../grunt');
const path = require('path');

let col1len = 0;

/**
 * Update the maximum column width based on the provided string.
 * @param {string} str - The string to measure.
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
 * @param {Array<Array<string>>} arr - Two‑dimensional array of rows.
 */
exports.table = function (arr) {
  arr.forEach(item => {
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
  exports.queue.forEach(name => {
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
 * Initialize the options list for display.
 */
exports.initOptions = function () {
  exports._options = buildOptionsArray();
};

/**
 * Build the options array for the options table.
 * @returns {Array<Array<string>>} Options data.
 */
function buildOptionsArray() {
  return Object.keys(grunt.cli.optlist).map(long => {
    const o = grunt.cli.optlist[long];
    const col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    exports.initCol1(col1);
    return [col1, o.info];
  });
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
  exports._tasks = buildTasksArray();
};

/**
 * Build the tasks array for the tasks table.
 * @returns {Array<Object>} List of task objects.
 */
function buildTasksArray() {
  const tasks = [];
  Object.keys(grunt.task._tasks).forEach(name => {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    tasks.push(task);
  });
  return tasks;
}

/**
 * Display the tasks table and related messages.
 */
exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    const rows = exports._tasks.map(task => formatTaskRow(task));
    exports.table(rows);
    printTasksInfo();
  }
  printTasksFooter();
};

/**
 * Format a single task row for the tasks table.
 * @param {Object} task - Task object.
 * @returns {Array<string>} Formatted row.
 */
function formatTaskRow(task) {
  let info = task.info;
  if (task.multi) {
    info += ' *';
  }
  return [task.name, info];
}

/**
 * Print additional information about tasks.
 */
function printTasksInfo() {
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
    'accept them by using colons, like "lint:files". Tasks marked with * are ' +
    '"multi tasks" and will iterate over all sub‑targets if no argument is ' +
    'specified.'
  );
}

/**
 * Print the tasks footer message.
 */
function printTasksFooter() {
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