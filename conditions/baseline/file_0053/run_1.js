```javascript
'use strict';

var grunt = require('../grunt');
var path = require('path');

// Column width management
var col1len = 0;

function updateCol1Length(str) {
  col1len = Math.max(col1len, str.length);
}

function computeWidths() {
  var commandWidth = Math.max(col1len + 20, 76);
  return [1, col1len, 2, commandWidth - col1len];
}

// Render an array in table form
function renderTable(arr, widths) {
  arr.forEach(function(item) {
    grunt.log.writetableln(widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
}

// Section renderers
function renderHeader() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
}

function renderUsage() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
}

function buildOptions() {
  return Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    updateCol1Length(col1);
    return [col1, o.info];
  });
}

function renderOptions(options, widths) {
  grunt.log.header('Options');
  renderTable(options, widths);
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
}

function buildTasks() {
  grunt.task.init([], {help: true});
  return Object.keys(grunt.task._tasks).map(function(name) {
    updateCol1Length(name);
    return grunt.task._tasks[name];
  });
}

function renderTasks(tasks, widths) {
  grunt.log.header('Available tasks');

  if (tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    renderTable(tasks.map(function(task) {
      return [task.name, task.info + (task.multi ? ' *' : '')];
    }), widths);

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

function renderFooter() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
}

// Main display function
exports.display = function() {
  var options = buildOptions();
  var tasks = buildTasks();
  var widths = computeWidths();

  renderHeader();
  renderUsage();
  renderOptions(options, widths);
  renderTasks(tasks, widths);
  renderFooter();
};
```