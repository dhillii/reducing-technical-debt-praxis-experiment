'use strict';

const grunt = require('../grunt');
const path = require('path');

// Column width tracking.
let col1len = 0;
exports.initCol1 = function (str) {
  col1len = Math.max(col1len, str.length);
};

exports.initWidths = function () {
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

// Render an array in table form.
exports.table = function (arr) {
  arr.forEach((item) => {
    grunt.log.writetableln(
      exports.widths,
      ['', grunt.util._.pad(item[0], col1len), '', item[1]]
    );
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
exports.display = function () {
  exports.queue.forEach((name) => exports[name]());
};

// Header.
exports.header = function () {
  grunt.log.writeln(
    'Grunt: The JavaScript Task Runner (v' + grunt.version + ')'
  );
};

// Usage info.
exports.usage = function () {
  grunt.log.header('Usage');
  grunt.log.writeln(
    ' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]'
  );
};

// Build options array.
function buildOptionsArray() {
  return Object.keys(grunt.cli.optlist).map((long) => {
    const o = grunt.cli.optlist[long];
    const col1 =
      '--' +
      (o.negate ? 'no-' : '') +
      long +
      (o.short ? ', -' + o.short : '');
    exports.initCol1(col1);
    return [col1, o.info];
  });
}

// Options.
exports.initOptions = function () {
  exports._options = buildOptionsArray();
};

exports.options = function () {
  grunt.log.header('Options');
  exports.table(exports._options);
};

exports.optionsFooter = function () {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
      'instead be specified inside the Gruntfile wherever possible.'
  );
};

// Build tasks array.
function buildTasksArray() {
  const tasks = [];
  Object.keys(grunt.task._tasks).forEach((name) => {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    tasks.push(task);
  });
  return tasks;
}

// Tasks.
exports.initTasks = function () {
  grunt.task.init([], { help: true });
  exports._tasks = buildTasksArray();
};

exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    const taskRows = exports._tasks.map((task) => {
      let info = task.info;
      if (task.multi) {
        info += ' *';
      }
      return [task.name, info];
    });
    exports.table(taskRows);

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
exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};