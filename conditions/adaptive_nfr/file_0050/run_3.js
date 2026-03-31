```javascript
'use strict';

const path = require('path');
const util = require('grunt-legacy-util');
const { Log } = require('grunt-legacy-log');

// Initialize CoffeeScript support
function initializeCoffeeScript() {
  try {
    require('coffeescript/register');
  } catch (e) {
    if (!require.extensions) return;
    
    const COFFEE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
    const errorMessage = 
      'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
      'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.';
    
    COFFEE_EXTENSIONS.forEach(ext => {
      require.extensions[ext] = () => { throw new Error(errorMessage); };
    });
  }
}

// Module initialization
const grunt = module.exports = {};
const log = new Log({ grunt });

// Utility functions
function gRequire(name) {
  return grunt[name] = require(`./grunt/${name}`);
}

function gExpose(obj, methodName, newMethodName) {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
}

// Initialize CoffeeScript
initializeCoffeeScript();

// Setup utilities and logging
grunt.util = util;
grunt.util.task = require('./util/task');
grunt.log = log;
grunt.verbose = log.verbose;

// Load grunt modules
const template = gRequire('template');
const event = gRequire('event');
const fail = gRequire('fail');
const file = gRequire('file');
const option = gRequire('option');
const config = gRequire('config');
const task = gRequire('task');
const help = gRequire('help');
const cli = gRequire('cli');

// Expose package metadata
grunt.package = require('../package.json');
grunt.version = grunt.package.version;

// Expose task methods
const taskMethods = ['registerTask', 'registerMultiTask', 'registerInitTask', 'renameTask', 'loadTasks', 'loadNpmTasks'];
taskMethods.forEach(method => gExpose(task, method));

// Expose config and fail methods
gExpose(config, 'init', 'initConfig');
gExpose(fail, 'warn');
gExpose(fail, 'fatal');

// Main task execution interface
grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (handleVersionFlag(options)) return;
  if (handleHelpFlag(options)) return;

  log.initColors();
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = tasks && tasks.length > 0;
  const parsedTasks = task.parseArgs(tasksSpecified ? tasks : 'default');

  task.init(parsedTasks, options);

  logTaskInfo(tasksSpecified, parsedTasks);
  executeTasksWithErrorHandling(parsedTasks, done);
};

function handleVersionFlag(options) {
  if (!option('version')) return false;

  log.writeln(`grunt v${grunt.version}`);

  if (option('verbose')) {
    displayVerboseVersionInfo();
  }

  return true;
}

function displayVerboseVersionInfo() {
  const { verbose } = grunt;
  
  verbose.writeln(`Install path: ${path.resolve(__dirname, '..')}`);
  
  grunt.log.muted = true;
  grunt.task.init([], { help: true });
  grunt.log.muted = false;

  const availableTasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln(`Available tasks: ${availableTasks.join(' ')}`);

  const availableOptions = buildAvailableOptions();
  verbose.writeln(`Available options: ${availableOptions.join(' ')}`);
}

function buildAvailableOptions() {
  const options = [];
  
  Object.keys(grunt.cli.optlist).forEach(long => {
    const opt = grunt.cli.optlist[long];
    options.push(`--${opt.negate ? 'no-' : ''}${long}`);
    if (opt.short) options.push(`-${opt.short}`);
  });
  
  return options;
}

function handleHelpFlag(options) {
  if (!option('help')) return false;
  
  help.display();
  return true;
}

function logTaskInfo(tasksSpecified, tasks) {
  const { verbose } = grunt;
  
  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');
}

function executeTasksWithErrorHandling(tasks, done) {
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
```