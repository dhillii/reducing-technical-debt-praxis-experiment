'use strict';

const grunt = require('../grunt');
const path = require('path');

let col1len = 0;

/**
 * Update the maximum column 1 length.
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
 * @param {Array} arr - Array of rows to display.
 */
exports.table = function (arr) {
  arr.forEach(function (item) {
    grunt.log.writetableln(
      exports.widths,
      ['', grunt.util._.pad(item[0], col1len), '', item[1]]
    );
  });
};

/**
 * Methods to run, in order.
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
 * Execute the queued methods.
 */
exports.display = function () {
  exports.queue.forEach(function (name) {
    exports[name]();
  });
};

/**
 * Header.
 */
exports.header = function () {
  grunt.log.writeln(
    'Grunt: The JavaScript Task Runner (v' + grunt.version + ')'
  );
};

/**
 * Usage info.
 */
exports.usage = function () {
  grunt.log.header('Usage');
  grunt.log.writeln(
    ' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]'
  );
};

/**
 * Build options array for table view.
 * @returns {Array} Array of option rows.
 */
function buildOptionsArray() {
  return Object.keys(grunt.cli.optlist).map(function (long) {
    const o = grunt.cli.optlist[long];
    const col1 =
      '--' +
      (o.negate ? 'no-' : '') +
      long +
      (o.short ? ', -' + o.short : '');
    exports.initCol1(col1);
    return [col1, o.info];
  });
}

/**
 * Initialize options for display.
 */
exports.initOptions = function () {
  exports._options = buildOptionsArray();
};

/**
 * Options.
 */
exports.options = function () {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Options footer.
 */
exports.optionsFooter = function () {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
      'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Build tasks array for display.
 * @returns {Array} Array of task objects.
 */
function buildTasksArray() {
  const tasks = [];
  Object.keys(grunt.task._tasks).forEach(function (name) {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    tasks.push(task);
  });
  return tasks;
}

/**
 * Initialize tasks for display.
 */
exports.initTasks = function () {
  grunt.task.init([], { help: true });
  exports._tasks = buildTasksArray();
};

/**
 * Print message when no tasks are found.
 */
function printNoTasks() {
  grunt.log.writeln('(no tasks found)');
}

/**
 * Print tasks table and related information.
 * @param {Array} tasks - Array of task objects.
 */
function printTasksTableBody(tasks) {
  exports.table(
    tasks.map(function (task) {
      const info = task.info + (task.multi ? ' *' : '');
      return [task.name, info];
    })
  );
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
      'accept them by using colons, like "lint:files". Tasks marked with * are ' +
      '"multi tasks" and will iterate over all sub-targets if no argument is ' +
      'specified.'
  );
}

/**
 * Print footer information for tasks list.
 */
function printTaskInfoFooter() {
  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
      'grunt plugins specified in the Gruntfile or via command-line options.'
  );
}

/**
 * Tasks.
 */
exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    printNoTasks();
  } else {
    printTasksTableBody(exports._tasks);
  }
  printTaskInfoFooter();
};

/**
 * Footer.
 */
exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};