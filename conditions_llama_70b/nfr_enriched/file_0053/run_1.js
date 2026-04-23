'use strict';

const grunt = require('../grunt');

// Nodejs libs.
const path = require('path');

// Set column widths.
let col1len = 0;
/**
 * Initialize the first column length.
 * @param {string} str - The string to check.
 */
exports.initCol1 = function(str) {
  col1len = Math.max(col1len, str.length);
};

/**
 * Initialize the widths for options/tasks table output.
 */
exports.initWidths = function() {
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

/**
 * Render an array in table form.
 * @param {Array<Array<string>>} arr - The array to render.
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
 * Actually display stuff.
 */
exports.display = function() {
  exports.queue.forEach(function(name) { exports[name](); });
};

// Header.
/**
 * Display the header.
 */
exports.header = function() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

// Usage info.
/**
 * Display usage info.
 */
exports.usage = function() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

// Options.
/**
 * Initialize the options.
 */
exports.initOptions = function() {
  // Build 2-column array for table view.
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    const o = grunt.cli.optlist[long];
    const col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    exports.initCol1(col1);
    return [col1, o.info];
  });
};

/**
 * Display the options.
 */
exports.options = function() {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Display the options footer.
 */
exports.optionsFooter = function() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

// Tasks.
/**
 * Initialize the tasks.
 */
exports.initTasks = function() {
  // Initialize task system so that the tasks can be listed.
  grunt.task.init([], {help: true});

  // Build object of tasks by info (where they were loaded from).
  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
};

/**
 * Display the tasks.
 */
exports.tasks = function() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    const tasksTable = exports._tasks.map(function(task) {
      let info = task.info;
      if (task.multi) { info += ' *'; }
      return [task.name, info];
    });
    exports.table(tasksTable);

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

// Footer.
/**
 * Display the footer.
 */
exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};