```javascript
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
    FILE_EXTENSIONS.forEach(function(ext) {
      require.extensions[ext] = function() {
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

// Display version information and available tasks/options when --version is specified.
function handleVersionOption() {
  log.writeln('grunt v' + grunt.version);

  if (!option('verbose')) {
    return;
  }

  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  grunt.log.muted = true;
  grunt.task.init([], {help: true});
  grunt.log.muted = false;

  const availableTasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + availableTasks.join(' '));

  const availableOptions = [];
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    const optionConfig = grunt.cli.optlist[long];
    availableOptions.push('--' + (optionConfig.negate ? 'no-' : '') + long);
    if (optionConfig.short) {
      availableOptions.push('-' + optionConfig.short);
    }
  });
  verbose.writeln('Available options: ' + availableOptions.join(' '));
}

// Initialize and configure task execution options.
function configureTaskExecution(tasks, options) {
  option.init(options);

  if (option('version')) {
    handleVersionOption();
    return false;
  }

  log.initColors();

  if (option('help')) {
    help.display();
    return false;
  }

  return true;
}

// Set up exception handling and task completion callbacks.
function setupTaskHandlers(done) {
  const uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

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

// Execute the specified tasks in sequence.
function executeTasks(tasks) {
  tasks.forEach(function(name) {
    task.run(name);
  });
  task.start({asyncDone: true});
}

// Expose the task interface. I've never called this manually, and have no idea
// how it will work. But it might.
grunt.tasks = function(tasks, options, done) {
  if (!configureTaskExecution(tasks, options)) {
    return;
  }

  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = tasks && tasks.length > 0;
  const parsedTasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  task.init(parsedTasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(parsedTasks, 'Running tasks');

  setupTaskHandlers(done);
  executeTasks(parsedTasks);
};
```