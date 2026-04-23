'use strict';

const path = require('path');

try {
  require('coffeescript/register');
} catch (e) {
  if (require.extensions) {
    const FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
    for (const ext of FILE_EXTENSIONS) {
      require.extensions[ext] = function () {
        throw new Error(
          'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
          'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
        );
      };
    }
  }
}

const grunt = module.exports = {};

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

grunt.package = require('../package.json');
grunt.version = grunt.package.version;

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

function isVersionOption() {
  return option('version');
}

function isHelpOption() {
  return option('help');
}

function isVerboseOption() {
  return option('verbose');
}

function hasTasksSpecified(tasks) {
  return Array.isArray(tasks) && tasks.length > 0;
}

function buildOptionList() {
  const options = [];
  for (const long of Object.keys(grunt.cli.optlist)) {
    const o = grunt.cli.optlist[long];
    options.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) {
      options.push('-' + o.short);
    }
  }
  return options;
}

grunt.tasks = function (tasks, options, done) {
  option.init(options);

  if (isVersionOption()) {
    log.writeln('grunt v' + grunt.version);
    if (isVerboseOption()) {
      verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
      grunt.log.muted = true;
      grunt.task.init([], {help: true});
      grunt.log.muted = false;
      const availableTasks = Object.keys(grunt.task._tasks).sort();
      verbose.writeln('Available tasks: ' + availableTasks.join(' '));
      const availableOptions = buildOptionList();
      verbose.writeln('Available options: ' + availableOptions.join(' '));
    }
    return;
  }

  if (isHelpOption()) {
    help.display();
    return;
  }

  log.initColors();

  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = hasTasksSpecified(tasks);
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  const uncaughtHandler = (e) => {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  task.options({
    error: (e) => {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
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

  tasks.forEach((name) => task.run(name));
  task.start({asyncDone: true});
};