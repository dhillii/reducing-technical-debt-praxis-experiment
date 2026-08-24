'use strict';

// Nodejs libs.
var path = require('path');

// This allows grunt to require() .coffee files.
try {
  // Note: grunt no longer depends on CoffeeScript, it will only use it if it is intentionally
  // installed in the project.
  require('coffeescript/register');
} catch (e) {
  // This is fine, and will cause no problems so long as the user doesn't load .coffee files.
  // Print a useful error if we attempt to load a .coffee file.
  if (require.extensions) {
    var FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
    for (var i = 0; i < FILE_EXTENSIONS.length; i++) {
      (function(ext) {
        require.extensions[ext] = function() {
          throw new Error(
            'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
            'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
          );
        };
      })(FILE_EXTENSIONS[i]);
    }
  }
}

// The module to be exported.
var grunt = module.exports = {};

// Expose internal grunt libs.
function gRequire(name) {
  return grunt[name] = require('./grunt/' + name);
}

var util = require('grunt-legacy-util');
grunt.util = util;
grunt.util.task = require('./util/task');

var Log = require('grunt-legacy-log').Log;
var log = new Log({grunt: grunt});
grunt.log = log;

gRequire('template');
gRequire('event');
var fail = gRequire('fail');
gRequire('file');
var option = gRequire('option');
var config = gRequire('config');
var task = gRequire('task');
var help = gRequire('help');
gRequire('cli');
var verbose = grunt.verbose = log.verbose;

// Expose some grunt metadata.
grunt.package = require('../package.json');
grunt.version = grunt.package.version;

// Expose specific grunt lib methods on grunt.
function gExpose(obj, methodName, newMethodName) {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
}
gExpose(task, 'registerTask');
gExpose(task, 'registerMultiTask');
gExpose(task, 'registerInitTask');
gExpose(task, 'renameTask');
gExpose(task, 'loadTasks');
gExpose(task, 'loadNpmTasks');
gExpose(config, 'init', 'initConfig');
gExpose(fail, 'warn');
gExpose(fail, 'fatal');

// Check if task execution should be short-circuited for version or help flags
function shouldExitEarly() {
  if (option('version')) {
    handleVersionOutput();
    return true;
  }
  if (option('help')) {
    help.display();
    return true;
  }
  return false;
}

// Handle version output and related verbose behavior
function handleVersionOutput() {
  log.writeln('grunt v' + grunt.version);
  if (!option('verbose')) {
    return;
  }
  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  grunt.log.muted = true;
  grunt.task.init([], {help: true});
  grunt.log.muted = false;
  var _tasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + _tasks.join(' '));
  var _options = [];
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    var o = grunt.cli.optlist[long];
    _options.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) { _options.push('-' + o.short); }
  });
  verbose.writeln('Available options: ' + _options.join(' '));
}

// Expose the task interface. I've never called this manually, and have no idea
// how it will work. But it might.
grunt.tasks = function(tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Short-circuit if version or help flag is present
  if (shouldExitEarly()) {
    return;
  }

  // Init colors.
  log.initColors();

  // A little header stuff.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  var tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Handle uncaught exceptions.
  var uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  // Setup task completion handlers
  task.options({
    error: function(e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function() {
      process.removeListener('uncaughtException', uncaughtHandler);
      fail.report();
      if (done) {
        done();
      } else {
        util.exit(0);
      }
    }
  });

  // Execute all tasks, in order.
  tasks.forEach(function(name) { task.run(name); });
  // Run tasks async internally to reduce call-stack, per:
  // https://github.com/gruntjs/grunt/pull/1026
  task.start({asyncDone: true});
};