'use strict';

var grunt = require('../grunt');

// Nodejs libs.
var path = require('path');

// Set column widths.
var col1len = 0;
exports.initCol1 = function(str) {
  col1len = Math.max(col1len, str.length);
};
exports.initWidths = function() {
  // Widths for options/tasks table output.
  var commandWidth = Math.max(col1len + 20, 76);
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
 * Build the list of CLI options for display.
 * @returns {Array} Array of [label, description] pairs
 */
exports._buildOptionsList = function() {
  return Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    exports.initCol1(col1);
    return [col1, o.info];
  });
};

/**
 * Display options section.
 */
exports.options = function() {
  grunt.log.header('Options');
  exports.table(exports._options);
};

/**
 * Display options footer message.
 */
exports.optionsFooter = function() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

// Actually initialize options.
exports.initOptions = function() {
  exports._options = exports._buildOptionsList();
};

/**
 * Build the list of tasks for display.
 * @returns {Array} Array of task objects
 */
exports._buildTasksList = function() {
  return Object.keys(grunt.task._tasks).map(function(name) {
    var task = grunt.task._tasks[name];
    exports.initCol1(name);
    return task;
  });
};

/**
 * Format a task entry for table display.
 * @param {Object} task - Task object to format
 * @returns {Array} [name, info] pair
 */
exports._formatTaskEntry = function(task) {
  var info = task.info;
  if (task.multi) { info += ' *'; }
  return [task.name, info];
};

/**
 * Display tasks section.
 */
exports.tasks = function() {
  grunt.log.header('Available tasks');
  var taskList = exports._tasks || [];
  if (taskList.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    exports.table(taskList.map(exports._formatTaskEntry));

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

// Actually initialize tasks.
exports.initTasks = function() {
  // Initialize task system so that the tasks can be listed.
  grunt.task.init([], {help: true});
  exports._tasks = exports._buildTasksList();
};

// Footer.
exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};