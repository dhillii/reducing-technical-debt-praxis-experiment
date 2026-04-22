```javascript
'use strict';

const grunt = require('../grunt');
const path = require('path');

// Column width tracking.
let col1len = 0;

/**
 * Update the maximum length of the first column.
 * @param {string} str - Text to measure.
 */
exports.initCol1 = function (str) {
  col1len = Math.max(col1len, str.length);
};

/**
 * Compute and store column widths for table output.
 */
exports.initWidths = function () {
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

/**
 * Render an array of rows as a formatted table.
 * @param {Array<Array<string>>} arr - Table data.
 */
exports.table = function (arr) {
  arr.forEach(item => {
    grunt.log.writetableln(
      exports.widths,
      ['', grunt.util._.pad(item[0], col1len), '', item[1]]
    );
  });
};

// Ordered list of display methods.
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
 * Show usage information.
 */
exports.usage = function () {
  grunt.log.header('Usage');
  grunt.log.writeln(` ${path.basename(process.argv[1])} [options] [task [task ...]]`);
};

/**
 * Build a 2‑column array describing CLI options.
 */
exports.initOptions = function () {
  exports._options = Object.keys(grunt.cli.optlist).map(long => {
    const o = grunt.cli.optlist[long];
    const col1 = `--${o.negate ? 'no-' : ''}${long}${o.short ? `, -${o.short}` : ''}`;
    exports.initCol1(col1);
    return [col1, o.info];
  });
};

/**
 * Display the options table.
 */
exports.options = function () {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Print the options footer.
 */
exports.optionsFooter = function () {
  grunt.log
    .writeln()
    .writelns(
      'Options marked with * have methods exposed via the grunt API and should ' +
        'instead be specified inside the Gruntfile wherever possible.'
    );
};

/**
 * Initialize the task list for help output.
 */
exports.initTasks = function () {
  // Ensure tasks are loaded.
  grunt.task.init([], { help: true });

  // Collect task metadata.
  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(name => {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
};

/**
 * Render the available tasks table and related notes.
 */
exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
    return;
  }

  const rows = exports._tasks.map(task => {
    let info = task.info;
    if (task.multi) {
      info += ' *';
    }
    return [task.name, info];
  });

  exports.table(rows);

  grunt.log
    .writeln()
    .writelns(
      'Tasks run in the order specified. Arguments may be passed to tasks that ' +
        'accept them by using colons, like "lint:files". Tasks marked with * are ' +
        '"multi tasks" and will iterate over all sub‑targets if no argument is ' +
        'specified.'
    );

  grunt.log
    .writeln()
    .writelns(
      'The list of available tasks may change based on tasks directories or ' +
        'grunt plugins specified in the Gruntfile or via command-line options.'
    );
};

/**
 * Print the footer with additional information.
 */
exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};
```