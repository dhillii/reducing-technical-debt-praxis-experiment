```javascript
'use strict';

const path = require('path');
const Log = require('grunt-legacy-log').Log;
const util = require('grunt-legacy-util');

// CoffeeScript registration
const COFFEE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];

function registerCoffeeScriptLoader() {
  try {
    require('coffeescript/register');
  } catch (e) {
    if (require.extensions) {
      const errorMessage = 
        'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
        'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.';
      
      COFFEE_EXTENSIONS.forEach(ext => {
        require.extensions[ext] = () => {
          throw new Error(errorMessage);
        };
      });
    }
  }
}

// Module initialization
const grunt = module.exports = {};

// Dependency loading
function loadGruntModule(name) {
  return grunt[name] = require(`./grunt/${name}`);
}

function exposeMethod(obj, methodName, newMethodName) {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
}

function initializeGrunt() {
  registerCoffeeScriptLoader();

  // Core utilities
  grunt.util = util;
  grunt.util.task = require('./util/task');

  // Logging
  const log = new Log({ grunt });
  grunt.log = log;
  grunt.verbose = log.verbose;

  // Load grunt modules
  loadGruntModule('template');
  loadGruntModule('event');
  const fail = loadGruntModule('fail');
  loadGruntModule('file');
  const option = loadGruntModule('option');
  const config = loadGruntModule('config');
  const task = loadGruntModule('task');
  const help = loadGruntModule('help');
  loadGruntModule('cli');

  // Package metadata
  grunt.package = require('../package.json');
  grunt.version = grunt.package.version;

  // Expose task methods
  exposeMethod(task, 'registerTask');
  exposeMethod(task, 'registerMultiTask');
  exposeMethod(task, 'registerInitTask');
  exposeMethod(task, 'renameTask');
  exposeMethod(task, 'loadTasks');
  exposeMethod(task, 'loadNpmTasks');

  // Expose config methods
  exposeMethod(config, 'init', 'initConfig');

  // Expose fail methods
  exposeMethod(fail, 'warn');
  exposeMethod(fail, 'fatal');

  return { task, option, fail, help, log };
}

const { task, option, fail, help, log } = initializeGrunt();

// Version and help handlers
function handleVersionOption() {
  log.writeln(`grunt v${grunt.version}`);

  if (!option('verbose')) {
    return true;
  }

  grunt.verbose.writeln(`Install path: ${path.resolve(__dirname, '..')}`);
  
  grunt.log.muted = true;
  grunt.task.init([], { help: true });
  grunt.log.muted = false;

  const availableTasks = Object.keys(grunt.task._tasks).sort();
  grunt.verbose.writeln(`Available tasks: ${availableTasks.join(' ')}`);

  const availableOptions = buildAvailableOptions();
  grunt.verbose.writeln(`Available options: ${availableOptions.join(' ')}`);

  return true;
}

function buildAvailableOptions() {
  const options = [];
  Object.keys(grunt.cli.optlist).forEach(long => {
    const o = grunt.cli.optlist[long];
    options.push(`--${o.negate ? 'no-' : ''}${long}`);
    if (o.short) {
      options.push(`-${o.short}`);
    }
  });
  return options;
}

function setupTaskHandlers(tasks, options, done) {
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

  tasks.forEach(name => task.run(name));
  task.start({ asyncDone: true });
}

function initializeTasks(tasks, options) {
  const tasksSpecified = tasks && tasks.length > 0;
  const parsedTasks = task.parseArgs(tasksSpecified ? tasks : 'default');

  task.init(parsedTasks, options);

  grunt.verbose.writeln();
  if (!tasksSpecified) {
    grunt.verbose.writeln('No tasks specified, running default tasks.');
  }
  grunt.verbose.writeflags(parsedTasks, 'Running tasks');

  return parsedTasks;
}

// Main task execution interface
grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (option('version')) {
    handleVersionOption();
    return;
  }

  log.initColors();

  if (option('help')) {
    help.display();
    return;
  }

  grunt.verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const parsedTasks = initializeTasks(tasks, options);
  setupTaskHandlers(parsedTasks, options, done);
};
```