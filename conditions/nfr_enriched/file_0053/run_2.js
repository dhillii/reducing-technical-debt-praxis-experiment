```javascript
'use strict';

const grunt = require('../grunt');

// Nodejs libs.
const path = require('path');

// Set column widths.
let col1len = 0;

/**
 * Updates the column 1 length to accommodate the given string.
 * @param {string} str - The string to measure
 */
exports.initCol1 = function(str) {
  col1len = Math.max(col1len, str.length);
};

/**
 * Initializes the widths array for table output formatting.
 */
exports.initWidths = function() {
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

/**
 * Renders an array of items in table form.
 * @param {Array} arr - Array of [label, description] pairs
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
 * Executes all queued help display methods in order.
 */
exports.display = function() {
  exports.queue.forEach(function(name) { exports[name](); });
};

/**
 * Displays the help header with Grunt version information.
 */
exports.header = function() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

/**
 * Displays usage information for the Grunt command.
 */
exports.usage = function() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

/**
 * Builds the options array from the CLI option list.
 */
exports.initOptions = function() {
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    const option = grunt.cli.optlist[long];
    const col1 = buildOptionString(long, option);
    exports.initCol1(col1);
    return [col1, option.info];
  });
};

/**
 * Constructs the option string for display (e.g., "--option, -o").
 * @param {string} long - The long option name
 * @param {Object} option - The option configuration object
 * @returns {string} The formatted option string
 */
function buildOptionString(long, option) {
  const prefix = '--' + (option.negate ? 'no-' : '') + long;
  const shortForm = option.short ? ', -' + option.short : '';
  return prefix + shortForm;
}

/**
 * Displays the options table.
 */
exports.options = function() {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Displays footer information about options.
 */
exports.optionsFooter = function() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Initializes the tasks array by loading all registered tasks.
 */
exports.initTasks = function() {
  grunt.task.init([], {help: true});
  exports._tasks = collectRegisteredTasks();
};

/**
 * Collects all registered tasks and updates column width.
 * @returns {Array} Array of task objects
 */
function collectRegisteredTasks() {
  const tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    tasks.push(task);
  });
  return tasks;
}

/**
 * Displays the available tasks table and related information.
 */
exports.tasks = function() {
  grunt.log.header('Available tasks');
  
  if (exports._tasks.length === 0) {
    displayNoTasksMessage();
  } else {
    displayTasksTable();
    displayTasksFooter();
  }

  displayTasksDisclaimer();
};

/**
 * Displays message when no tasks are found.
 */
function displayNoTasksMessage() {
  grunt.log.writeln('(no tasks found)');
}

/**
 * Displays the formatted tasks table.
 */
function displayTasksTable() {
  const taskRows = exports._tasks.map(function(task) {
    return formatTaskRow(task);
  });
  exports.table(taskRows);
}

/**
 * Formats a single task row for table display.
 * @param {Object} task - The task object
 * @returns {Array} Array containing [taskName, taskInfo]
 */
function formatTaskRow(task) {
  let info = task.info;
  if (task.multi) {
    info += ' *';
  }
  return [task.name, info];
}

/**
 * Displays footer information about tasks.
 */
function displayTasksFooter() {
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
    'accept them by using colons, like "lint:files". Tasks marked with * are ' +
    '"multi tasks" and will iterate over all sub-targets if no argument is ' +
    'specified.'
  );
}

/**
 * Displays disclaimer about task availability.
 */
function displayTasksDisclaimer() {
  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
    'grunt plugins specified in the Gruntfile or via command-line options.'
  );
}

/**
 * Displays the help footer with link to documentation.
 */
exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};
```