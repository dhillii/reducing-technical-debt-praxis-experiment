```javascript
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
 * Initialise column widths for table output.
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
  arr.forEach(item => {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
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
 * Execute each method in the queue.
 */
exports.display = function () {
  exports.queue.forEach(name => { exports[name](); });
};

/**
 * Display the Grunt header.
 */
exports.header = function () {
  grunt.log.writeln(`Grunt: The JavaScript Task Runner (v${grunt.version})`);
};

/**
 * Display usage information.
 */
exports.usage = function () {
  grunt.log.header('Usage');
  grunt.log.writeln(` ${path.basename(process.argv[1])} [options] [task [task ...]]`);
};

/**
 * Initialise options data structure.
 */
exports.initOptions = function () {
  exports._options = buildOptionsArray();
};

/**
 * Build the options array for table display.
 * @returns {Array<Array<string>>}
 */
function buildOptionsArray() {
  return Object.keys(grunt.cli.optlist).map(long => {
    const o = grunt.cli.optlist[long];
    const col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? `, -${o.short}` : '');
    exports.initCol1(col1);
    return [col1, o.info];
  });
}

/**
 * Render the options table.
 */
exports.options = function () {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Render the options footer.
 */
exports.optionsFooter = function () {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Initialise tasks data structure.
 */
exports.initTasks = function () {
  grunt.task.init([], { help: true });
  exports._tasks = buildTasksArray();
};

/**
 * Build the tasks array for table display.
 * @returns {Array<Object>}
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
 * Render the tasks section.
 */
exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    renderNoTasksMessage();
  } else {
    renderTasksTable(exports._tasks);
    renderTasksFooter();
  }
  renderTasksListNote();
};

/**
 * Write a message when no tasks are found.
 */
function renderNoTasksMessage() {
  grunt.log.writeln('(no tasks found)');
}

/**
 * Render the tasks table.
 * @param {Array<Object>} tasks
 */
function renderTasksTable(tasks) {
  const rows = tasks.map(task => {
    let info = task.info;
    if (task.multi) { info += ' *'; }
    return [task.name, info];
  });
  exports.table(rows);
}

/**
 * Render the footer explaining task usage.
 */
function renderTasksFooter() {
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
    'accept them by using colons, like "lint:files". Tasks marked with * are ' +
    '"multi tasks" and will iterate over all sub-targets if no argument is ' +
    'specified.'
  );
}

/**
 * Render the note about task list variability.
 */
function renderTasksListNote() {
  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
    'grunt plugins specified in the Gruntfile or via command-line options.'
  );
}

/**
 * Render the footer.
 */
exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};
```