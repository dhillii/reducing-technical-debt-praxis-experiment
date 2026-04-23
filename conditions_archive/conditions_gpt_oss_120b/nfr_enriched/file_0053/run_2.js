```javascript
'use strict';

const grunt = require('../grunt');
const path = require('path');

// Column width tracking.
let col1len = 0;

/**
 * Update the maximum length for the first column.
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
 * @param {Array<Array<string>>} arr - Data rows.
 */
exports.table = function (arr) {
  arr.forEach(item => {
    grunt.log.writetableln(
      exports.widths,
      ['', grunt.util._.pad(item[0], col1len), '', item[1]]
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
 * Execute each method in the display queue.
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
 * Build the options array for the help table.
 * @returns {Array<Array<string>>}
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
 * Initialize the options data structure.
 */
exports.initOptions = function () {
  exports._options = buildOptionsArray();
};

/**
 * Display the options table.
 */
exports.options = function () {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Print the options footer note.
 */
exports.optionsFooter = function () {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Build an array of task objects for display.
 * @returns {Array<Object>}
 */
function collectTaskObjects() {
  const tasks = [];
  Object.keys(grunt.task._tasks).forEach(name => {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    tasks.push(task);
  });
  return tasks;
}

/**
 * Initialize the tasks data structure.
 */
exports.initTasks = function () {
  // Initialise task system so that tasks can be listed.
  grunt.task.init([], { help: true });
  exports._tasks = collectTaskObjects();
};

/**
 * Print the footer that follows the task list.
 */
function printTasksFooter() {
  grunt.log.writeln().writelns(
    'Tasks run in the order specified. Arguments may be passed to tasks that ' +
    'accept them by using colons, like "lint:files". Tasks marked with * are ' +
    '"multi tasks" and will iterate over all sub-targets if no argument is ' +
    'specified.'
  );
}

/**
 * Display the available tasks.
 */
exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    const rows = exports._tasks.map(task => {
      let info = task.info;
      if (task.multi) {
        info += ' *';
      }
      return [task.name, info];
    });
    exports.table(rows);
    printTasksFooter();
  }

  grunt.log.writeln().writelns(
    'The list of available tasks may change based on tasks directories or ' +
    'grunt plugins specified in the Gruntfile or via command-line options.'
  );
};

/**
 * Print the final footer.
 */
exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};
```