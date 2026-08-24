'use strict';

var grunt = require('../grunt');

// Nodejs libs.
var path = require('path');

// Set column widths.
var col1len = 0;

/**
 * Updates the first column width based on the given string.
 * @param {string} str - String to measure for column width calculation.
 */
function updateCol1Length(str) {
  col1len = Math.max(col1len, str.length);
}

/**
 * Initializes column widths for table rendering.
 */
function initializeWidths() {
  var commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
}

/**
 * Renders an array as a table using the initialized column widths.
 * @param {Array} arr - Array of [string, string] tuples to render.
 */
function renderTable(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
}

// Assign public methods with their updated logic.
exports.initCol1 = updateCol1Length;
exports.initWidths = initializeWidths;
exports.table = renderTable;

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

// Options.
exports.initOptions = function() {
  var options = Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    updateCol1Length(col1);
    return [col1, o.info];
  });
  exports._options = options;
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

// Tasks.
exports.initTasks = function() {
  grunt.task.init([], {help: true});

  var taskList = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    updateCol1Length(name);
    var task = grunt.task._tasks[name];
    taskList.push(task);
  });
  exports._tasks = taskList;
};

exports.tasks = function() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    var rows = exports._tasks.map(function(task) {
      var info = task.info;
      if (task.multi) { info += ' *'; }
      return [task.name, info];
    });
    renderTable(rows);

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
exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};