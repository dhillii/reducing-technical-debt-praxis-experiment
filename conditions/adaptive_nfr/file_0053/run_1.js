```javascript
'use strict';

var grunt = require('../grunt');
var path = require('path');

var col1len = 0;

exports.initCol1 = function(str) {
  col1len = Math.max(col1len, str.length);
};

exports.initWidths = function() {
  var commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

exports.table = function(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
};

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

exports.header = function() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

exports.usage = function() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

exports.initOptions = function() {
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    exports.initCol1(col1);
    return [col1, o.info];
  });
};

exports.options = function() {
  grunt.log.header('Options');
  exports.table(exports._options);
};

exports.optionsFooter = function() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
};

exports.initTasks = function() {
  grunt.task.init([], {help: true});
  exports._tasks = Object.keys(grunt.task._tasks).map(function(name) {
    exports.initCol1(name);
    return grunt.task._tasks[name];
  });
};

var TASKS_DESCRIPTION = 'Tasks run in the order specified. Arguments may be passed to tasks that ' +
  'accept them by using colons, like "lint:files". Tasks marked with * are ' +
  '"multi tasks" and will iterate over all sub-targets if no argument is ' +
  'specified.';

var TASKS_FOOTER = 'The list of available tasks may change based on tasks directories or ' +
  'grunt plugins specified in the Gruntfile or via command-line options.';

function formatTask(task) {
  return [task.name, task.info + (task.multi ? ' *' : '')];
}

exports.tasks = function() {
  grunt.log.header('Available tasks');

  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    exports.table(exports._tasks.map(formatTask));
    grunt.log.writeln().writelns(TASKS_DESCRIPTION);
  }

  grunt.log.writeln().writelns(TASKS_FOOTER);
};

exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};
```