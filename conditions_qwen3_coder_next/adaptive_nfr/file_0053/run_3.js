'use strict';

var grunt = require('../grunt');

// Nodejs libs.
var path = require('path');

// Set column widths.
var col1len = 0;

/**
 * Updates the first column width based on the given string length.
 * @param {string} str - The string to measure.
 */
function updateCol1Length(str) {
  col1len = Math.max(col1len, str.length);
}

/**
 * Initializes the output width calculations based on column lengths.
 */
function initializeWidths() {
  var commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
}

/**
 * Renders an array of rows to a table format.
 * @param {Array<Array<string>>} arr - Array of two-element arrays representing rows.
 */
function renderTable(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
}

// Methods to run, in-order.
exports.queue = [
  'initOptions',
  'initTasks',
  'initializeWidths',
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
 * Builds and initializes the options list for display.
 */
function buildOptionsList() {
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    updateCol1Length(col1);
    return [col1, o.info];
  });
}

exports.initOptions = function() {
  buildOptionsList();
};

exports.options = function() {
  grunt.log.header('Options');
  renderTable(exports._options);
};

exports.optionsFooter = function() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

/**
 * Initializes and collects task information for display.
 */
function collectTaskInformation() {
  grunt.task.init([], {help: true});

  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    updateCol1Length(name);
    var task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
}

exports.initTasks = function() {
  collectTaskInformation();
};

/**
 * Renders available tasks with appropriate annotations.
 */
function renderAvailableTasks() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    renderTable(exports._tasks.map(function(task) {
      var info = task.info;
      if (task.multi) { info += ' *'; }
      return [task.name, info];
    }));

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
}

exports.tasks = function() {
  renderAvailableTasks();
};

// Footer.
exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};