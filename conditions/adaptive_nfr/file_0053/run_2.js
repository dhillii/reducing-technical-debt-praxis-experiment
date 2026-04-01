```javascript
'use strict';

const grunt = require('../grunt');

// Nodejs libs.
const path = require('path');

// Set column widths.
let col1len = 0;
exports.initCol1 = function(str) {
  col1len = Math.max(col1len, str.length);
};
exports.initWidths = function() {
  // Widths for options/tasks table output.
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

// Render an array in table form.
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

// Actually display stuff.
exports.display = function() {
  exports.queue.forEach(function(name) { exports[name](); });
};

// Header.
exports.header = function() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

// Usage info.
exports.usage = function() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

/**
 * Build option column string with long and short flags.
 * @param {string} long - Long option name
 * @param {Object} o - Option object with negate and short properties
 * @returns {string} Formatted option column string
 */
function buildOptionColumn(long, o) {
  return '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
}

/**
 * Process single option entry for options table.
 * @param {string} long - Long option name
 * @returns {Array} Array containing [column1, info]
 */
function processOptionEntry(long) {
  const o = grunt.cli.optlist[long];
  const col1 = buildOptionColumn(long, o);
  exports.initCol1(col1);
  return [col1, o.info];
}

// Options.
exports.initOptions = function() {
  // Build 2-column array for table view.
  exports._options = Object.keys(grunt.cli.optlist).map(processOptionEntry);
};

exports.options = function() {
  grunt.log.header('Options');
  exports.table(exports._options);
};

exports.optionsFooter = function() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Initialize task system and build task list.
 */
function initializeTaskSystem() {
  grunt.task.init([], {help: true});
}

/**
 * Build array of tasks from grunt task registry.
 * @returns {Array} Array of task objects
 */
function buildTaskArray() {
  const tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    tasks.push(task);
  });
  return tasks;
}

// Tasks.
exports.initTasks = function() {
  // Initialize task system so that the tasks can be listed.
  initializeTaskSystem();

  // Build object of tasks by info (where they were loaded from).
  exports._tasks = buildTaskArray();
};

/**
 * Format task entry for display in table.
 * @param {Object} task - Task object with name, info, and multi properties
 * @returns {Array} Array containing [name, formatted info]
 */
function formatTaskEntry(task) {
  let info = task.info;
  if (task.multi) { info += ' *'; }
  return [task.name, info];
}

/**
 * Display message when no tasks are found.
 */
function displayNoTasksMessage() {
  grunt.log.writeln('(no tasks found)');
}

/**
 * Display available tasks table and related information.
 */
function displayTasksTable() {
  exports.table(exports._tasks.map(formatTaskEntry));

  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
    'accept them by using colons, like "lint:files". Tasks marked with * are ' +
    '"multi tasks" and will iterate over all sub-targets if no argument is ' +
    'specified.'
  );
}

/**
 * Display footer information about task list variability.
 */
function displayTaskListFooter() {
  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
    'grunt plugins specified in the Gruntfile or via command-line options.'
  );
}

exports.tasks = function() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    displayNoTasksMessage();
  } else {
    displayTasksTable();
  }

  displayTaskListFooter();
};

// Footer.
exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};
```