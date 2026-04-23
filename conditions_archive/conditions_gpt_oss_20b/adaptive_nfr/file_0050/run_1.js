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
    FILE_EXTENSIONS.forEach((ext) => {
      require.extensions[ext] = function () {
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
const gRequire = (name) => {
  grunt[name] = require('./grunt/' + name);
  return grunt[name];
};

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
const gExpose = (obj, methodName, newMethodName) => {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
};
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
const isVersionOption = () => option('version');
const isHelpOption = () => option('help');
const isVerboseOption = () => option('verbose');

// Helper functions
/**
 * Display verbose information about available tasks and options.
 */
const displayVerboseInfo = () => {
  grunt.log.muted = true;
  grunt.task.init([], {help: true});
  grunt.log.muted = false;

  const tasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + tasks.join(' '));

  const options = [];
  const optlist = grunt.cli.optlist;
  Object.keys(optlist).forEach((long) => {
    options.push(...getOptionFlags(long));
  });

  verbose.writeln('Available options: ' + options.join(' '));
};

/**
 * Get command line flags for a given option.
 * @param {string} long
 * @returns {string[]}
 */
const getOptionFlags = (long) => {
  const o = grunt.cli.optlist[long];
  const flags = ['--' + (o.negate ? 'no-' : '') + long];
  if (o.short) {
    flags.push('-' + o.short);
  }
  return flags;
};

/**
 * Handle uncaught exceptions during task execution.
 * @param {Error} e
 */
const handleUncaughtException = (e) => {
  fail.fatal(e, fail.code.TASK_FAILURE);
};

/**
 * Handle task errors.
 * @param {Error} e
 */
const handleError = (e) => {
  fail.warn(e, fail.code.TASK_FAILURE);
};

/**
 * Handle completion of all tasks.
 * @param {Function} done
 */
const handleDone = (done) => {
  process.removeListener('uncaughtException', uncaughtHandler);
  fail.report();
  if (done) {
    done();
  } else {
    util.exit(0);
  }
};

/**
 * Run a single task by name.
 * @param {string} name
 */
const runTask = (name) => {
  task.run(name);
};

const uncaughtHandler = handleUncaughtException;

// Expose the task interface. I've never called this manually, and have no idea
// how it will work. But it might.
grunt.tasks = (tasks, options, done) => {
  // Update options with passed-in options.
  option.init(options);

  // Display the grunt version and quit if the user did --version.
  if (isVersionOption()) {
    log.writeln('grunt v' + grunt.version);

    if (isVerboseOption()) {
      verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
      // Yes, this is a total hack, but we don't want to log all that verbose
      // task initialization stuff here.
      grunt.log.muted = true;
      // Initialize task system so that available tasks can be listed.
      grunt.task.init([], {help: true});
      // Re-enable logging.
      grunt.log.muted = false;

      // Display available tasks (for shell completion, etc).
      displayVerboseInfo();
    }

    return;
  }

  // Init colors.
  log.initColors();

  // Display help and quit if the user did --help.
  if (isHelpOption()) {
    help.display();
    return;
  }

  // A little header stuff.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  const tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  process.on('uncaughtException', uncaughtHandler);

  // Report, etc when all tasks have completed.
  task.options({
    error: handleError,
    done: () => handleDone(done)
  });

  // Execute all tasks, in order.
  tasks.forEach(runTask);
  // Run tasks async internally to reduce call-stack, per:
  // https://github.com/gruntjs/grunt/pull/1026
  task.start({asyncDone: true});
};