```javascript
'use strict';

const grunt = require('../grunt');
const path = require('path');

// ============================================================================
// Column Width Management
// ============================================================================

class ColumnWidthManager {
  constructor() {
    this.col1len = 0;
  }

  updateWidth(str) {
    this.col1len = Math.max(this.col1len, str.length);
  }

  getWidths() {
    const commandWidth = Math.max(this.col1len + 20, 76);
    return [1, this.col1len, 2, commandWidth - this.col1len];
  }
}

const columnManager = new ColumnWidthManager();

// ============================================================================
// Table Rendering
// ============================================================================

function renderTable(arr, widths) {
  arr.forEach(item => {
    const paddedCol1 = grunt.util._.pad(item[0], columnManager.col1len);
    grunt.log.writetableln(widths, ['', paddedCol1, '', item[1]]);
  });
}

// ============================================================================
// Options Processing
// ============================================================================

function initOptions() {
  exports._options = Object.keys(grunt.cli.optlist).map(long => {
    const option = grunt.cli.optlist[long];
    const col1 = formatOptionString(long, option);
    columnManager.updateWidth(col1);
    return [col1, option.info];
  });
}

function formatOptionString(long, option) {
  const prefix = '--' + (option.negate ? 'no-' : '') + long;
  const suffix = option.short ? ', -' + option.short : '';
  return prefix + suffix;
}

function displayOptions() {
  grunt.log.header('Options');
  renderTable(exports._options, columnManager.getWidths());
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
  grunt.task.init([], { help: true });

  exports._tasks = Object.keys(grunt.task._tasks).map(name => {
    const task = grunt.task._tasks[name];
    columnManager.updateWidth(name);
    return task;
  });
}

function formatTaskRow(task) {
  let info = task.info;
  if (task.multi) {
    info += ' *';
  }
  return [task.name, info];
}

function displayTasks() {
  grunt.log.header('Available tasks');

  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    const taskRows = exports._tasks.map(formatTaskRow);
    renderTable(taskRows, columnManager.getWidths());

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
// Display Pipeline
// ============================================================================

const displayPipeline = [
  { name: 'initOptions', fn: initOptions },
  { name: 'initTasks', fn: initTasks },
  { name: 'header', fn: displayHeader },
  { name: 'usage', fn: displayUsage },
  { name: 'options', fn: displayOptions },
  { name: 'optionsFooter', fn: displayOptionsFooter },
  { name: 'tasks', fn: displayTasks },
  { name: 'footer', fn: displayFooter },
];

function displayHeader() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
}

function displayUsage() {
  grunt.log.header('Usage');
  const command = path.basename(process.argv[1]);
  grunt.log.writeln(' ' + command + ' [options] [task [task ...]]');
}

function displayFooter() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
}

function display() {
  displayPipeline.forEach(step => step.fn());
}

// ============================================================================
// Exports
// ============================================================================

exports.display = display;
exports.initCol1 = (str) => columnManager.updateWidth(str);
exports.initWidths = () => columnManager.getWidths();
exports.table = (arr) => renderTable(arr, columnManager.getWidths());
```