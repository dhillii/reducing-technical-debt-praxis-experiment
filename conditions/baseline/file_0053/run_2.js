```javascript
'use strict';

var grunt = require('../grunt');
var path = require('path');

var col1len = 0;

function initCol1(str) {
  col1len = Math.max(col1len, str.length);
}

function initWidths() {
  var commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
}

function table(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
}

function initOptions() {
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    initCol1(col1);
    return [col1, o.info];
  });
}

function initTasks() {
  grunt.task.init([], {help: true});
  exports._tasks = Object.keys(grunt.task._tasks).map(function(name) {
    initCol1(name);
    return grunt.task._tasks[name];
  });
}

function displayHeader() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
}

function displayUsage() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
}

function displayOptions() {
  grunt.log.header('Options');
  table(exports._options);
}

function displayOptionsFooter() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
}

function displayTasks() {
  grunt.log.header('Available tasks');

  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    table(exports._tasks.map(function(task) {
      return [task.name, task.multi ? task.info + ' *' : task.info];
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

function displayFooter() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
}

exports.initCol1 = initCol1;
exports.initWidths = initWidths;
exports.table = table;
exports.initOptions = initOptions;
exports.initTasks = initTasks;
exports.header = displayHeader;
exports.usage = displayUsage;
exports.options = displayOptions;
exports.optionsFooter = displayOptionsFooter;
exports.tasks = displayTasks;
exports.footer = displayFooter;

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

exports.display = function() {
  exports.queue.forEach(function(name) { exports[name](); });
};
```