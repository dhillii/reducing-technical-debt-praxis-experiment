'use strict';

var grunt = require('../grunt');
var path = require('path');

var col1len = 0;

var WidthsCalculator = function() {
  this.commandWidth = 0;
  this.widths = [];
};

WidthsCalculator.prototype.calculate = function() {
  this.commandWidth = Math.max(col1len + 20, 76);
  this.widths = [1, col1len, 2, this.commandWidth - col1len];
};

var TableRenderer = function(widths) {
  this.widths = widths;
};

TableRenderer.prototype.render = function(arr) {
  arr.forEach(function(item) {
    grunt.log.writetableln(this.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  }, this);
};

var TaskSystemInitializer = function() {
  this.tasks = [];
};

TaskSystemInitializer.prototype.initialize = function() {
  grunt.task.init([], {help: true});
  Object.keys(grunt.task._tasks).forEach(function(name) {
    col1len = Math.max(col1len, name.length);
    var task = grunt.task._tasks[name];
    this.tasks.push(task);
  }, this);
};

var TaskInfoFormatter = function() {
  this.tasks = [];
};

TaskInfoFormatter.prototype.format = function(task) {
  var info = task.info;
  if (task.multi) {
    info += ' *';
  }
  return [task.name, info];
};

var DisplayQueue = [
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

var DisplayManager = function() {
  this.queue = DisplayQueue;
};

DisplayManager.prototype.run = function() {
  this.queue.forEach(function(name) {
    this[name]();
  }, this);
};

var OptionBuilder = function() {
  this.options = [];
};

OptionBuilder.prototype.build = function() {
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    col1len = Math.max(col1len, col1.length);
    this.options.push([col1, o.info]);
  }, this);
};

var TaskLister = function() {
  this.tasks = [];
};

TaskLister.prototype.list = function() {
  Object.keys(grunt.task._tasks).forEach(function(name) {
    col1len = Math.max(col1len, name.length);
    var task = grunt.task._tasks[name];
    this.tasks.push(task);
  }, this);
};

exports.initCol1 = function(str) {
  col1len = Math.max(col1len, str.length);
};

exports.initWidths = function() {
  var calculator = new WidthsCalculator();
  calculator.calculate();
  exports.widths = calculator.widths;
};

exports.table = function(arr) {
  var renderer = new TableRenderer(exports.widths);
  renderer.render(arr);
};

exports.display = function() {
  var manager = new DisplayManager();
  manager.run();
};

exports.header = function() {
  grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
};

exports.usage = function() {
  grunt.log.header('Usage');
  grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
};

exports.initOptions = function() {
  var builder = new OptionBuilder();
  builder.build();
  exports._options = builder.options;
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
  var initializer = new TaskSystemInitializer();
  initializer.initialize();
  exports._tasks = initializer.tasks;
};

exports.tasks = function() {
  grunt.log.header('Available tasks');
  if (exports._tasks.length === 0) {
    grunt.log.writeln('(no tasks found)');
  } else {
    var formatter = new TaskInfoFormatter();
    var tasks = exports._tasks.map(function(task) {
      return formatter.format(task);
    });
    exports.table(tasks);

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

exports.footer = function() {
  grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
};