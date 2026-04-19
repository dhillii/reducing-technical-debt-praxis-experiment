'use strict';

const grunt = require('../grunt');
const path = require('path');

// Column width tracking.
let col1len = 0;

/**
 * Update the maximum column 1 width based on the supplied string.
 * @param {string} str - The string to evaluate.
 */
exports.initCol1 = function (str) {
  col1len = Math.max(col1len, str.length);
};

/**
 * Calculate and store the column widths for the options/tasks table.
 */
exports.initWidths = function () {
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

/**
 * Render an array of rows in table form.
 * @param {Array<Array<string>>} arr - Array of rows to display.
 */
exports.table = function (arr) {
  arr.forEach((item) => {
    grunt.log.writetableln(
      exports.widths,
      ['', grunt.util._.pad(item[0], col1len), '', item[1]]
    );
  });
};

/**
 * Ordered list of methods to run.
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
 * Execute all methods in the queue.
 */
exports.display = function () {
  exports.queue.forEach((name) => exports[name]());
};

/**
 * Header section.
 */
exports.header = function () {
  grunt.log.writeln(
    `Grunt: The JavaScript Task Runner (v${grunt.version})`
  );
};

/**
 * Usage information.
 */
exports.usage = function () {
  grunt.log.header('Usage');
  grunt.log.writeln(
    ` ${path.basename(process.argv[1])} [options] [task [task ...]]`
  );
};

/**
 * Build a single option entry for the options table.
 * @param {string} long - Long option name.
 * @returns {Array<string>} - [col1, description]
 */
function buildOptionEntry(long) {
  const o = grunt.cli.optlist[long];
  const col1 =
    '--' +
    (o.negate ? 'no-' : '') +
    long +
    (o.short ? `, -${o.short}` : '');
  exports.initCol1(col1);
  return [col1, o.info];
}

/**
 * Initialize the options array for display.
 */
exports.initOptions = function () {
  exports._options = Object.keys(grunt.cli.optlist).map(buildOptionEntry);
};

exports.options = function () {
  grunt.log.header('Options');
  exports.table(exports._options);
};

exports.optionsFooter = function () {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
      'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Build a single task entry for the tasks table.
 * @param {Object} task - Task object.
 * @returns {Array<string>} - [name, info]
 */
function buildTaskEntry(task) {
  let info = task.info;
  if (task.multi) {
    info += ' *';
  }
  return [task.name, info];
}

/**
 * Initialize the tasks array for display.
 */
exports.initTasks = function () {
  // Initialize task system so that the tasks can be listed.
  grunt.task.init([], { help: true });

  // Build object of tasks by info (where they were loaded from).
  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach((name) => {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
};

exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    exports.table(exports._tasks.map(buildTaskEntry));

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
};

/**
 * Footer section.
 */
exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};