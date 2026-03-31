```javascript
'use strict';

var grunt = require('../grunt');
var path = require('path');

// Column width management
var columnWidthManager = {
  col1len: 0,

  updateWidth: function(str) {
    this.col1len = Math.max(this.col1len, str.length);
  },

  getWidths: function() {
    var commandWidth = Math.max(this.col1len + 20, 76);
    return [1, this.col1len, 2, commandWidth - this.col1len];
  }
};

// Table rendering
function renderTable(arr, widths) {
  arr.forEach(function(item) {
    grunt.log.writetableln(widths, [
      '',
      grunt.util._.pad(item[0], columnWidthManager.col1len),
      '',
      item[1]
    ]);
  });
}

// Help display sections
var helpSections = {
  header: function() {
    grunt.log.writeln('Grunt: The JavaScript Task Runner (v' + grunt.version + ')');
  },

  usage: function() {
    grunt.log.header('Usage');
    grunt.log.writeln(' ' + path.basename(process.argv[1]) + ' [options] [task [task ...]]');
  },

  options: function() {
    grunt.log.header('Options');
    renderTable(this._options, columnWidthManager.getWidths());
  },

  optionsFooter: function() {
    grunt.log.writeln().writelns(
      'Options marked with * have methods exposed via the grunt API and should ' +
      'instead be specified inside the Gruntfile wherever possible.'
    );
  },

  tasks: function() {
    grunt.log.header('Available tasks');
    if (this._tasks.length === 0) {
      grunt.log.writeln('(no tasks found)');
    } else {
      var taskRows = this._tasks.map(function(task) {
        var info = task.info;
        if (task.multi) { info += ' *'; }
        return [task.name, info];
      });
      renderTable(taskRows, columnWidthManager.getWidths());

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
  },

  footer: function() {
    grunt.log.writeln().writeln('For more information, see http://gruntjs.com/');
  }
};

// Data initialization
var helpData = {
  _options: [],
  _tasks: [],

  initOptions: function() {
    this._options = Object.keys(grunt.cli.optlist).map(function(long) {
      var o = grunt.cli.optlist[long];
      var col1 = '--' + (o.negate ? 'no-' : '') + long + (o.short ? ', -' + o.short : '');
      columnWidthManager.updateWidth(col1);
      return [col1, o.info];
    });
  },

  initTasks: function() {
    grunt.task.init([], {help: true});
    this._tasks = [];
    Object.keys(grunt.task._tasks).forEach(function(name) {
      var task = grunt.task._tasks[name];
      columnWidthManager.updateWidth(name);
      this._tasks.push(task);
    }, this);
  }
};

// Public API
exports.display = function() {
  var queue = [
    'initOptions',
    'initTasks',
    'header',
    'usage',
    'options',
    'optionsFooter',
    'tasks',
    'footer'
  ];

  helpData.initOptions();
  helpData.initTasks();

  queue.forEach(function(name) {
    if (helpSections[name]) {
      helpSections[name].call(helpData);
    }
  });
};
```