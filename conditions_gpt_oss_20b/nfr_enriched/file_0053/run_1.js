'use strict';

const grunt = require('../grunt');
const path = require('path');

let col1len = 0;
exports.initCol1 = function (str) {
  col1len = Math.max(col1len, str.length);
};

exports.initWidths = function () {
  const commandWidth = Math.max(col1len + 20, 76);
  exports.widths = [1, col1len, 2, commandWidth - col1len];
};

exports.table = function (arr) {
  arr.forEach((item) => {
    grunt.log.writetableln(
      exports.widths,
      ['', grunt.util._.pad(item[0], col1len), '', item[1]]
    );
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

exports.display = function () {
  exports.queue.forEach((name) => exports[name]());
};

exports.header = function () {
  grunt.log.writeln(
    'Grunt: The JavaScript Task Runner (v' + grunt.version + ')'
  );
};

exports.usage = function () {
  grunt.log.header('Usage');
  grunt.log.writeln(
    ' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]'
  );
};

function buildOptionRow(long, o) {
  const col1 =
    '--' +
    (o.negate ? 'no-' : '') +
    long +
    (o.short ? ', -' + o.short : '');
  return [col1, o.info];
}

exports.initOptions = function () {
  exports._options = Object.keys(grunt.cli.optlist).map((long) => {
    const o = grunt.cli.optlist[long];
    const row = buildOptionRow(long, o);
    exports.initCol1(row[0]);
    return row;
  });
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

function formatTaskInfo(task) {
  let info = task.info;
  if (task.multi) {
    info += ' *';
  }
  return info;
}

function buildTaskRow(task) {
  return [task.name, formatTaskInfo(task)];
}

exports.initTasks = function () {
  grunt.task.init([], { help: true });

  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach((name) => {
    exports.initCol1(name);
    const task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
};

exports.tasks = function () {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    exports.table(exports._tasks.map(buildTaskRow));

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

exports.footer = function () {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};