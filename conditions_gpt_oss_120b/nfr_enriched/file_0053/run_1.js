```javascript
'use strict';

const grunt = require('../grunt');
const path = require('path');

// Column width tracking.
let col1len = 0;

/**
 * Update the maximum length of the first column.
 * @param {string} str - Text to consider for column width.
 */
exports.initCol1 = function (str) {
  col1len = Math.max(col1len, str.length);
};

/**
 * Compute and expose table column widths.
 */
exports.initWidths = function () {
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

/**
 * Render a two‑dimensional array as a formatted table.
 * @param {Array<Array<string>>} rows - Table rows.
 */
exports.table = function (rows) {
  rows.forEach(row => {
    grunt.log.writetableln(
      exports.widths,
      ['', grunt.util._.pad(row[0], col1len), '', row[1]]
    );
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
 * Execute each display method in the predefined order.
 */
exports.display = function () {
  exports.queue.forEach(name => exports[name]());
};

/**
 * Print the Grunt header.
 */
exports.header = function () {
  grunt.log.writeln(`Grunt: The JavaScript Task Runner (v${grunt.version})`);
};

/**
 * Print usage information.
 */
exports.usage = function () {
  grunt.log.header('Usage');
  grunt.log.writeln(` ${path.basename(process.argv[1])} [options] [task [task ...]]`);
};

/**
 * Build the options array for table rendering.
 */
function buildOptionsArray() {
  return Object.keys(grunt.cli.optlist).map(long => {
    const opt = grunt.cli.optlist[long];
    const col1 = `--${opt.negate ? 'no-' : ''}${long}${opt.short ? `, -${opt.short}` : ''}`;
    exports.initCol1(col1);
    return [col1, opt.info];
  });
}

/**
 * Initialize options data.
 */
exports.initOptions = function () {
  exports._options = buildOptionsArray();
};

/**
 * Render the options table.
 */
exports.options = function () {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Render the options footer note.
 */
exports.optionsFooter = function () {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Initialize the task system and collect task metadata.
 */
exports.initTasks = function () {
  grunt.task.init([], { help: true });
  exports._tasks = [];

  Object.keys(grunt.task._tasks).forEach(name => {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
};

/**
 * Render the list of available tasks.
 */
function renderTaskList() {
  const rows = exports._tasks.map(task => {
    let info = task.info;
    if (task.multi) {
      info += ' *';
    }
    return [task.name, info];
  });
  exports.table(rows);
}

/**
 * Print the tasks section header.
 */
function printTasksHeader() {
  grunt.log.header('Available tasks');
}

/**
 * Print the message shown when no tasks are found.
 */
function printNoTasksMessage() {
  grunt.log.writeln('(no tasks found)');
}

/**
 * Print the explanatory footer for tasks.
 */
function printTasksFooter() {
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
    'accept them by using colons, like "lint:files". Tasks marked with * are ' +
    '"multi tasks" and will iterate over all sub‑targets if no argument is ' +
    'specified.'
  );
}

/**
 * Print the general tasks information footer.
 */
function printGeneralTasksInfo() {
  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
    'grunt plugins specified in the Gruntfile or via command-line options.'
  );
}

/**
 * Render the tasks section, delegating to helper functions.
 */
exports.tasks = function () {
  printTasksHeader();

  if (exports._tasks.length === 0) {
    printNoTasksMessage();
  } else {
    renderTaskList();
    printTasksFooter();
  }

  printGeneralTasksInfo();
};

/**
 * Print the final footer.
 */
exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};
```