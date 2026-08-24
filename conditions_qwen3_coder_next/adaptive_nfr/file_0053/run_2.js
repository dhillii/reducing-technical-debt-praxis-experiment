'use strict';

var grunt = require('../grunt');

// Nodejs libs.
var path = require('path');

// Set column widths.
var col1len = 0;
exports.initCol1 = function(str) {
  col1len = Math.max(col1len, str.length);
};

/**
 * Compute and assign render widths for table output based on current column 1 length.
 */
function computeTableWidths() {
  var commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
}

exports.initWidths = function() {
  computeTableWidths();
};

/**
 * Render an array as a two-column table.
 * @param {Array<Array<string>>} arr - Each element is [col1, col2].
 */
function renderTable(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
}

exports.table = function(arr) {
  renderTable(arr);
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
 * Execute each method in the display queue sequentially.
 */
function executeDisplayQueue() {
  exports.queue.forEach(function(name) { exports[name](); });
}

exports.display = function() {
  executeDisplayQueue();
};

/**
 * Output Grunt version header.
 */
function outputHeader() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
}

exports.header = function() {
  outputHeader();
};

/**
 * Output usage line with executable name.
 */
function outputUsage() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
}

exports.usage = function() {
  outputUsage();
};

/**
 * Build the options list array from CLI options and initialize column width.
 */
function buildOptionsList() {
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    exports.initCol1(col1);
    return [col1, o.info];
  });
}

exports.initOptions = function() {
  buildOptionsList();
};

/**
 * Output formatted options table with header.
 */
function displayOptions() {
  grunt.log.header('Options');
  renderTable(exports._options);
}

exports.options = function() {
  displayOptions();
};

/**
 * Output options footnote about Gruntfile-local usage.
 */
function outputOptionsFooter() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
}

exports.optionsFooter = function() {
  outputOptionsFooter();
};

/**
 * Initialize task metadata list and update column width for task names.
 */
function buildTasksList() {
  grunt.task.init([], {help: true});
  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    exports.initCol1(name);
    var task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
}

exports.initTasks = function() {
  buildTasksList();
};

/**
 * Format and render the tasks table, including multi-task indicators and notes.
 */
function displayTasks() {
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
  displayTasks();
};

/**
 * Output footer with project URL.
 */
function outputFooter() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
}

exports.footer = function() {
  outputFooter();
};