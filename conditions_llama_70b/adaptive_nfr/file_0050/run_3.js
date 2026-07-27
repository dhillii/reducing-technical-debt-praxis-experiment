'use strict';

// Nodejs libs.
const path = require('path');

// This allows grunt to require() .coffee files.
try {
  // Note: grunt no longer depends on CoffeeScript, it will only use it if it is intentionally
  // installed in the project.
  require('coffeescript/register');
} catch (e) {
  // This is fine, and will cause no problems so long as the user doesn't load .coffee files.
  // Print a useful error if we attempt to load a .coffee file.
  if (require.extensions) {
    const FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
    FILE_EXTENSIONS.forEach((extension) => {
      require.extensions[extension] = function() {
        throw new Error(
          'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
          'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
        );
      };
    });
  }
}

// The module to be exported.
const grunt = module.exports = {};

// Expose internal grunt libs.
function gRequire(name) {
  return grunt[name] = require('./grunt/' + name);
}

const util = require('grunt-legacy-util');
grunt.util = util;
grunt.util.task = require('./util/task');

const Log = require('grunt-legacy-log').Log;
const log = new Log({grunt: grunt});
grunt.log = log;

gRequire('template');
gRequire('event');
const fail = gRequire('fail');
gRequire('file');
const option = gRequire('option');
const config = gRequire('config');
const task = gRequire('task');
const help = gRequire('help');
gRequire('cli');
const verbose = grunt.verbose = log.verbose;

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

// Expose the task interface. I've never called this manually, and have no idea
// how it will work. But it might.
grunt.tasks = function(tasks, options, done) {
  if (isVersionOptionSet(options)) {
    displayVersionInfo();
    return;
  }

  if (isHelpOptionSet(options)) {
    help.display();
    return;
  }

  initOptions(options);
  initColors();
  displayHeader(options);
  const tasksToRun = getTasksToRun(tasks);
  initTasks(tasksToRun, options);
  handleUncaughtExceptions();
  reportTaskCompletion(done);
  executeTasks(tasksToRun);
};

function isVersionOptionSet(options) {
  return option('version');
}

function displayVersionInfo() {
  log.writeln('grunt v' + grunt.version);
  if (option('verbose')) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    grunt.log.muted = true;
    grunt.task.init([], {help: true});
    grunt.log.muted = false;
    const availableTasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + availableTasks.join(' '));
    const availableOptions = getAvailableOptions();
    verbose.writeln('Available options: ' + availableOptions.join(' '));
  }
}

function getAvailableOptions() {
  const options = [];
  Object.keys(grunt.cli.optlist).forEach((long) => {
    const o = grunt.cli.optlist[long];
    options.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) { options.push('-' + o.short); }
  });
  return options;
}

function isHelpOptionSet(options) {
  return option('help');
}

function initOptions(options) {
  option.init(options);
}

function initColors() {
  log.initColors();
}

function displayHeader(options) {
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');
}

function getTasksToRun(tasks) {
  const tasksSpecified = tasks && tasks.length > 0;
  return task.parseArgs([tasksSpecified ? tasks : 'default']);
}

function initTasks(tasks, options) {
  task.init(tasks, options);
  verbose.writeln();
  if (!tasks.length) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');
}

function handleUncaughtExceptions() {
  const uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);
}

function reportTaskCompletion(done) {
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
}

function executeTasks(tasks) {
  tasks.forEach(function(name) { task.run(name); });
  task.start({asyncDone: true});
}