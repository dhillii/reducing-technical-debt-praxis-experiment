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
 * Print the header.
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
 * Build the options array for table display.
 * @returns {Array<Array<string>>}
 */
function buildOptionsArray() {
  return Object.keys(grunt.cli.optlist).map(function (long) {
    const o = grunt.cli.optlist[long];
    const col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    exports.initCol1(col1);
    return [col1, o.info];
  });
}

/**
 * Initialize options data.
 */
exports.initOptions = function () {
  exports._options = buildOptionsArray();
};

/**
 * Display options table.
 */
exports.options = function () {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Display options footer.
 */
exports.optionsFooter = function () {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
      'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Initialize the task system.
 */
function initTaskSystem() {
  grunt.task.init([], { help: true });
}

/**
 * Collect task objects and update column width.
 * @returns {Array<Object>}
 */
function collectTasks() {
  const tasks = [];
  Object.keys(grunt.task._tasks).forEach(function (name) {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    tasks.push(task);
  });
  return tasks;
}

/**
 * Initialize tasks data.
 */
exports.initTasks = function () {
  initTaskSystem();
  exports._tasks = collectTasks();
};

/**
 * Build rows for the tasks table.
 * @param {Array<Object>} tasks
 * @returns {Array<Array<string>>}
 */
function buildTaskRows(tasks) {
  return tasks.map(function (task) {
    let info = task.info;
    if (task.multi) {
      info += ' *';
    }
    return [task.name, info];
  });
}

/**
 * Log message when no tasks are found.
 */
function logNoTasksFound() {
  grunt.log.writeln('(no tasks found)');
}

/**
 * Log additional information about task usage.
 */
function logTasksInfo() {
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
      'accept them by using colons, like "lint:files". Tasks marked with * are ' +
      '"multi tasks" and will iterate over all sub-targets if no argument is ' +
      'specified.'
  );
}

/**
 * Log footer about task list variability.
 */
function logTasksFooter() {
  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
      'grunt plugins specified in the Gruntfile or via command-line options.'
  );
}

/**
 * Display available tasks.
 */
exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    logNoTasksFound();
  } else {
    exports.table(buildTaskRows(exports._tasks));
    logTasksInfo();
  }
  logTasksFooter();
};

/**
 * Print the footer.
 */
exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};