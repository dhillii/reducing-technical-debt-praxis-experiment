```javascript
'use strict';

const grunt = require('../grunt');
const path = require('path');

// Column width state.
let col1len = 0;

/**
 * Update the maximum length for the first column.
 * @param {string} str - Column content.
 */
exports.initCol1 = function (str) {
  col1len = Math.max(col1len, str.length);
};

/**
 * Initialise table column widths based on collected data.
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

/**
 * Ordered list of display methods.
 */
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
 * Execute each display method in order.
 */
exports.display = function () {
  exports.queue.forEach(name => { exports[name](); });
};

/**
 * Header output.
 */
exports.header = function () {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

/**
 * Usage information.
 */
exports.usage = function () {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

/**
 * Initialise options for table view.
 */
exports.initOptions = function () {
  exports._options = Object.keys(grunt.cli.optlist).map(_buildOptionRow);
};

/**
 * Render options table.
 */
exports.options = function () {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Footer for options section.
 */
exports.optionsFooter = function () {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Initialise tasks list.
 */
exports.initTasks = function () {
  grunt.task.init([], { help: true });
  exports._tasks = _collectTasks();
};

/**
 * Render tasks table and related messages.
 */
exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    _displayNoTasksMessage();
  } else {
    _displayTasksTable();
    _displayTasksFooter();
  }
  _displayTasksListFooter();
};

/**
 * Footer for the entire help output.
 */
exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};

/* ---------- Helper Functions ---------- */

/**
 * Build a row for the options table and update column width.
 * @param {string} long - Long option name.
 * @returns {Array<string>} Row containing formatted option and its description.
 */
function _buildOptionRow(long) {
  const o = grunt.cli.optlist[long];
  const col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
  exports.initCol1(col1);
  return [col1, o.info];
}

/**
 * Collect all tasks into an array and update column width.
 * @returns {Array<Object>} Array of task objects.
 */
function _collectTasks() {
  const tasks = [];
  Object.keys(grunt.task._tasks).forEach(name => {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    tasks.push(task);
  });
  return tasks;
}

/**
 * Display a message when no tasks are found.
 */
function _displayNoTasksMessage() {
  grunt.log.writeln('(no tasks found)');
}

/**
 * Render the tasks table.
 */
function _displayTasksTable() {
  const rows = exports._tasks.map(_formatTaskRow);
  exports.table(rows);
}

/**
 * Format a single task into a table row.
 * @param {Object} task - Task object.
 * @returns {Array<string>} Row containing task name and info.
 */
function _formatTaskRow(task) {
  let info = task.info;
  if (task.multi) { info += ' *'; }
  return [task.name, info];
}

/**
 * Display explanatory footer for tasks section.
 */
function _displayTasksFooter() {
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
    'accept them by using colons, like "lint:files". Tasks marked with * are ' +
    '"multi tasks" and will iterate over all sub-targets if no argument is ' +
    'specified.'
  );
}

/**
 * Display additional information about task list variability.
 */
function _displayTasksListFooter() {
  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
    'grunt plugins specified in the Gruntfile or via command-line options.'
  );
}
```