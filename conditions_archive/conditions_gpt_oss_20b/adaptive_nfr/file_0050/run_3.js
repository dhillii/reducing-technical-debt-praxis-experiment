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
    for (let i = 0; i < FILE_EXTENSIONS.length; i++) {
      require.extensions[FILE_EXTENSIONS[i]] = function () {
        throw new Error(
          'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
            'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
        );
      };
    }
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

// Helper predicates
/**
 * @param {Object} opt
 * @returns {boolean}
 */
function isVersionOption(opt) {
  return opt('version');
}

/**
 * @param {Object} opt
 * @returns {boolean}
 */
function isHelpOption(opt) {
  return opt('help');
}

/**
 * @param {Object} opt
 * @returns {boolean}
 */
function isVerboseOption(opt) {
  return opt('verbose');
}

/**
 * @param {Object} opt
 * @returns {boolean}
 */
function isTasksSpecified(tasks) {
  return tasks && tasks.length > 0;
}

/**
 * @param {Array<string>} tasks
 * @returns {Array<string>}
 */
function parseTasks(tasks) {
  const tasksSpecified = isTasksSpecified(tasks);
  return task.parseArgs([tasksSpecified ? tasks : 'default']);
}

/**
 * @param {Array<string>} tasks
 * @param {Object} options
 */
function initTasks(tasks, options) {
  task.init(tasks, options);
}

/**
 * @param {Function} done
 */
function handleUncaughtException(done) {
  return function (e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
}

/**
 * @param {Function} done
 */
function handleTaskDone(done) {
  return function () {
    process.removeListener('uncaughtException', handleUncaughtException(done));

    fail.report();

    if (done) {
      done();
    } else {
      util.exit(0);
    }
  };
}

/**
 * @param {Array<string>} tasks
 */
function runTasks(tasks) {
  tasks.forEach(function (name) {
    task.run(name);
  });
  task.start({asyncDone: true});
}

/**
 * @param {Object} opt
 */
function displayVersion(opt) {
  log.writeln('grunt v' + grunt.version);

  if (isVerboseOption(opt)) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    grunt.log.muted = true;
    grunt.task.init([], {help: true});
    grunt.log.muted = false;

    const _tasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + _tasks.join(' '));

    const _options = [];
    Object.keys(grunt.cli.optlist).forEach(function (long) {
      const o = grunt.cli.optlist[long];
      _options.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) {
        _options.push('-' + o.short);
      }
    });
    verbose.writeln('Available options: ' + _options.join(' '));
  }
}

/**
 * @param {Object} opt
 */
function displayHelp(opt) {
  if (isHelpOption(opt)) {
    help.display();
  }
}

// Expose the task interface. I've never called this manually, and have no idea
// how it will work. But it might.
grunt.tasks = function (tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Display the grunt version and quit if the user did --version.
  if (isVersionOption(option)) {
    displayVersion(option);
    return;
  }

  // Display help and quit if the user did --help.
  if (isHelpOption(option)) {
    displayHelp(option);
    return;
  }

  // Init colors.
  log.initColors();

  // A little header stuff.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  const tasksSpecified = isTasksSpecified(tasks);
  tasks = parseTasks(tasks);

  // Initialize tasks.
  initTasks(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  process.on('uncaughtException', handleUncaughtException(done));

  // Report, etc when all tasks have completed.
  task.options({
    error: function (e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: handleTaskDone(done)
  });

  // Execute all tasks, in order.
  runTasks(tasks);
};