'use strict';

// Nodejs libs.
const path = require('path');

// Allow grunt to require .coffee files if CoffeeScript is installed.
(function registerCoffeeScript() {
  try {
    require('coffeescript/register');
  } catch (e) {
    if (require.extensions) {
      const FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
      FILE_EXTENSIONS.forEach(ext => {
        require.extensions[ext] = function () {
          throw new Error(
            'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
            'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
          );
        };
      });
    }
  }
})();

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
const log = new Log({grunt});
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

// Helper: handle --version option.
function handleVersionOption() {
  if (!option('version')) return false;
  log.writeln('grunt v' + grunt.version);
  if (option('verbose')) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    grunt.log.muted = true;
    grunt.task.init([], {help: true});
    grunt.log.muted = false;
    const tasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + tasks.join(' '));
    const options = [];
    Object.keys(grunt.cli.optlist).forEach(long => {
      const o = grunt.cli.optlist[long];
      options.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) options.push('-' + o.short);
    });
    verbose.writeln('Available options: ' + options.join(' '));
  }
  return true;
}

// Helper: handle --help option.
function handleHelpOption() {
  if (!option('help')) return false;
  help.display();
  return true;
}

// Helper: initialize tasks and options.
function initializeTasks(tasks, options) {
  option.init(options);
  log.initColors();
  const tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);
  task.init(tasks, options);
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');
  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');
  return tasks;
}

// Helper: set up uncaught exception handling.
function setupUncaughtHandler() {
  const handler = e => fail.fatal(e, fail.code.TASK_FAILURE);
  process.on('uncaughtException', handler);
  return handler;
}

// Helper: configure task completion callbacks.
function configureTaskCompletion(done) {
  task.options({
    error: e => fail.warn(e, fail.code.TASK_FAILURE),
    done: () => {
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

// Main task runner exposed on grunt.
grunt.tasks = function (tasks, options, done) {
  if (handleVersionOption()) return;
  if (handleHelpOption()) return;

  const initializedTasks = initializeTasks(tasks, options);
  const uncaughtHandler = setupUncaughtHandler();
  configureTaskCompletion(done);

  initializedTasks.forEach(name => task.run(name));
  task.start({asyncDone: true});
};