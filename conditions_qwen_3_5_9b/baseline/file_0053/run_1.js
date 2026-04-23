'use strict';

const grunt = require('../grunt');
const path = require('path');

let col1len = 0;

function initCol1(str) {
  col1len = Math.max(col1len, str.length);
}

function initWidths() {
  const commandWidth = Math.max(col1len + 20, 76);
  return [1, col1len, 2, commandWidth - col1len];
}

function table(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(exports.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
}

const queue = [
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

function display() {
  queue.forEach(function(name) { exports[name](); });
}

function header() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
}

function usage() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
}

function initOptions() {
  exports._options = Object.keys(grunt.cli.optlist).map(function(long) {
    const o = grunt.cli.optlist[long];
    const col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    initCol1(col1);
    return [col1, o.info];
  });
}

function options() {
  grunt.log.header('Options');
  table(exports._options);
}

function optionsFooter() {
  grunt.log.writeln().writelns(
    'Options marked with * have methods exposed via the grunt API and should ' +
    'instead be specified inside the Gruntfile wherever possible.'
  );
}

function initTasks() {
  grunt.task.init([], {help: true});

  exports._tasks = [];
  Object.keys(grunt.task._tasks).forEach(function(name) {
    initCol1(name);
    const task = grunt.task._tasks[name];
    exports._tasks.push(task);
  });
}

function tasks() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    table(exports._tasks.map(function(task) {
      let info = task.info;
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

function footer() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
}

exports.initCol1 = initCol1;
exports.initWidths = initWidths;
exports.table = table;
exports.queue = queue;
exports.display = display;
exports.header = header;
exports.usage = usage;
exports.initOptions = initOptions;
exports.options = options;
exports.optionsFooter = optionsFooter;
exports.initTasks = initTasks;
exports.tasks = tasks;
exports.footer = footer;