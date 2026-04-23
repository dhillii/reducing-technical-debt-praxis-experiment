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

var OptionsBuilder = function() {
  this.options = [];
};

OptionsBuilder.prototype.build = function() {
  var self = this;
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    var o = grunt.cli.optlist[long];
    var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
    col1len = Math.max(col1len, col1.length);
    self.options.push([col1, o.info]);
  });
};

var TaskLister = function() {
  this.tasks = [];
};

TaskLister.prototype.build = function() {
  var self = this;
  Object.keys(grunt.task._tasks).forEach(function(name) {
    col1len = Math.max(col1len, name.length);
    var task = grunt.task._tasks[name];
    self.tasks.push(task);
  });
};

var TableRenderer = function() {
  this.widths = [];
};

TableRenderer.prototype.render = function(data) {
  var self = this;
  data.forEach(function(item) {
    grunt.log.writetableln(self.widths, ['', grunt.util._.pad(item[0], col1len), '', item[1]]);
  });
};

var DisplayManager = function() {
  this.queue = [
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
};

DisplayManager.prototype.run = function() {
  var self = this;
  this.queue.forEach(function(name) {
    self[name]();
  });
};

var HeaderRenderer = function() {
  this.render = function() {
    grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
  };
};

var UsageRenderer = function() {
  this.render = function() {
    grunt.log.header('Usage');
    grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
  };
};

var OptionsRenderer = function() {
  this.render = function() {
    grunt.log.header('Options');
    this.tableRenderer.render(this.optionsBuilder.options);
  };
};

var OptionsFooterRenderer = function() {
  this.render = function() {
    grunt.log.writeln().writelns(
      'Options marked with * have methods exposed via the grunt API and should ' +
      'instead be specified inside the Gruntfile wherever possible.'
    );
  };
};

var TasksRenderer = function() {
  this.render = function() {
    grunt.log.header('Available tasks');
    if (this.taskLister.tasks.length === 0) {
      grunt.log.writeln('(no tasks found)');
    } else {
      var taskData = this.taskLister.tasks.map(function(task) {
        var info = task.info;
        if (task.multi) { info += ' *'; }
        return [task.name, info];
      });
      this.tableRenderer.render(taskData);
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
};

var FooterRenderer = function() {
  this.render = function() {
    grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
  };
};

var TaskSystemInitializer = function() {
  this.init = function() {
    grunt.task.init([], {help: true});
  };
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
  var renderer = new TableRenderer();
  renderer.widths = exports.widths;
  renderer.render(arr);
};

exports.display = function() {
  var manager = new DisplayManager();
  manager.run();
};

exports.header = function() {
  var renderer = new HeaderRenderer();
  renderer.render();
};

exports.usage = function() {
  var renderer = new UsageRenderer();
  renderer.render();
};

exports.initOptions = function() {
  var builder = new OptionsBuilder();
  builder.build();
  exports._options = builder.options;
};

exports.options = function() {
  var renderer = new OptionsRenderer();
  renderer.optionsBuilder = new OptionsBuilder();
  renderer.optionsBuilder.build();
  renderer.tableRenderer = new TableRenderer();
  renderer.tableRenderer.widths = exports.widths;
  renderer.render();
};

exports.optionsFooter = function() {
  var renderer = new OptionsFooterRenderer();
  renderer.render();
};

exports.initTasks = function() {
  var initializer = new TaskSystemInitializer();
  initializer.init();
  var lister = new TaskLister();
  lister.build();
  exports._tasks = lister.tasks;
};

exports.tasks = function() {
  var renderer = new TasksRenderer();
  renderer.taskLister = new TaskLister();
  renderer.taskLister.build();
  renderer.tableRenderer = new TableRenderer();
  renderer.tableRenderer.widths = exports.widths;
  renderer.render();
};

exports.footer = function() {
  var renderer = new FooterRenderer();
  renderer.render();
};