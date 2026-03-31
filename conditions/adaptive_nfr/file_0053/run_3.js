```javascript
'use strict';

var grunt = require('../grunt');
var path = require('path');

// ============================================================================
// State Management
// ============================================================================

var state = {
  col1len: 0,
  options: [],
  tasks: [],
};

// ============================================================================
// Column Width Management
// ============================================================================

function updateCol1Width(str) {
  state.col1len = Math.max(state.col1len, str.length);
}

function calculateWidths() {
  var commandWidth = Math.max(state.col1len + 20, 76);
  return [1, state.col1len, 2, commandWidth - state.col1len];
}

// ============================================================================
// Table Rendering
// ============================================================================

function renderTable(arr, widths) {
  arr.forEach(function(item) {
    grunt.log.writetableln(widths, [
      '',
      grunt.util._.pad(item[0], state.col1len),
      '',
      item[1],
    ]);
  });
}

// ============================================================================
// Options Processing
// ============================================================================

function initOptions() {
  state.options = Object.keys(grunt.cli.optlist).map(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    updateCol1Width(col1);
    return [col1, o.info];
  });
}

function displayOptions() {
  grunt.log.header('Options');
  renderTable(state.options, calculateWidths());
}

function displayOptionsFooter() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
}

// ============================================================================
// Tasks Processing
// ============================================================================

function initTasks() {
  grunt.task.init([], {help: true});

  state.tasks = Object.keys(grunt.task._tasks).map(function(name) {
    var task = grunt.task._tasks[name];
    updateCol1Width(name);
    return task;
  });
}

function formatTaskRow(task) {
  var info = task.info;
  if (task.multi) {
    info += ' *';
  }
  return [task.name, info];
}

function displayTasks() {
  grunt.log.header('Available tasks');

  if (state.tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    renderTable(state.tasks.map(formatTaskRow), calculateWidths());
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

// ============================================================================
// Display Sections
// ============================================================================

function displayHeader() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
}

function displayUsage() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
}

function displayFooter() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
}

// ============================================================================
// Public API
// ============================================================================

var displayQueue = [
  {name: 'initOptions', fn: initOptions},
  {name: 'initTasks', fn: initTasks},
  {name: 'header', fn: displayHeader},
  {name: 'usage', fn: displayUsage},
  {name: 'options', fn: displayOptions},
  {name: 'optionsFooter', fn: displayOptionsFooter},
  {name: 'tasks', fn: displayTasks},
  {name: 'footer', fn: displayFooter},
];

exports.display = function() {
  displayQueue.forEach(function(item) {
    item.fn();
  });
};
```