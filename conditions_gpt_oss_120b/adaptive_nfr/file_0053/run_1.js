'use strict';

const grunt = require('../grunt');
const path = require('path');

// Set column widths.
let col1len = 0;
exports.initCol1 = function (str) {
  col1len = Math.max(col1len, str.length);
};
exports.initWidths = function () {
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

// Render an array in table form.
exports.table = function (arr) {
  arr.forEach(function (item) {
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

// Actually display stuff.
exports.display = function () {
  exports.queue.forEach(function (name) {
    exports[name]();
  });
};

// Header.
exports.header = function () {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

// Usage info.
exports.usage = function () {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

/**
 * Build options array for table display.
 * @returns {Array} Array of [optionString, info] pairs.
 */
function buildOptionsArray() {
  return Object.keys(grunt.cli.optlist).map(function (long) {
    const o = grunt.cli.optlist[long];
    const col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    exports.initCol1(col1);
    return [col1, o.info];
  });
}

// Options.
exports.initOptions = function () {
  exports._options = buildOptionsArray();
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
 * Initialize the task system for help output.
 */
function initializeTaskSystem() {
  grunt.task.init([], { help: true });
}

/**
 * Collect tasks into an array for display.
 * @returns {Array} Array of task objects.
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

// Tasks.
exports.initTasks = function () {
  initializeTaskSystem();
  exports._tasks = collectTasks();
};

/**
 * Render the tasks table.
 * @param {Array} tasks Array of task objects.
 */
function renderTasksTable(tasks) {
  const rows = tasks.map(function (task) {
    let info = task.info;
    if (task.multi) {
      info += ' *';
    }
    return [task.name, info];
  });
  exports.table(rows);
}

/**
 * Write informational messages after the tasks table.
 */
function writeTasksInfo() {
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
      'accept them by using colons, like "lint:files". Tasks marked with * are ' +
      '"multi tasks" and will iterate over all sub-targets if no argument is ' +
      'specified.'
  );
}

/**
 * Write footer message for tasks section.
 */
function writeTasksFooter() {
  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
      'grunt plugins specified in the Gruntfile or via command-line options.'
  );
}

// Tasks display orchestrator.
exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    renderTasksTable(exports._tasks);
    writeTasksInfo();
  }
  writeTasksFooter();
};

// Footer.
exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};