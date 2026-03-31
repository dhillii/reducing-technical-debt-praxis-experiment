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

// Lazy-load internal grunt modules
function gRequire(name) {
  return grunt[name] = require(`./grunt/${name}`);
}

function gExpose(obj, methodName, newMethodName) {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
}

// Initialize core modules
function initializeCore() {
  grunt.util = util;
  grunt.util.task = require('./util/task');
  
  const log = new Log({ grunt });
  grunt.log = log;
  grunt.verbose = log.verbose;
  
  return log;
}

// Load and expose grunt modules
function loadGruntModules() {
  gRequire('template');
  gRequire('event');
  const fail = gRequire('fail');
  gRequire('file');
  const option = gRequire('option');
  const config = gRequire('config');
  const task = gRequire('task');
  gRequire('help');
  gRequire('cli');
  
  return { fail, option, config, task };
}

// Expose task methods
function exposeTaskMethods(task) {
  const taskMethods = [
    'registerTask', 'registerMultiTask', 'registerInitTask',
    'renameTask', 'loadTasks', 'loadNpmTasks'
  ];
  taskMethods.forEach(method => gExpose(task, method));
}

// Expose config and fail methods
function exposeUtilityMethods(config, fail) {
  gExpose(config, 'init', 'initConfig');
  gExpose(fail, 'warn');
  gExpose(fail, 'fatal');
}

// Handle version flag
function handleVersionFlag(option, log, verbose) {
  if (!option('version')) return false;
  
  log.writeln(`grunt v${grunt.version}`);
  
  if (option('verbose')) {
    verbose.writeln(`Install path: ${path.resolve(__dirname, '..')}`);
    grunt.log.muted = true;
    grunt.task.init([], { help: true });
    grunt.log.muted = false;
    
    const tasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln(`Available tasks: ${tasks.join(' ')}`);
    
    const options = collectAvailableOptions();
    verbose.writeln(`Available options: ${options.join(' ')}`);
  }
  
  return true;
}

// Collect available CLI options
function collectAvailableOptions() {
  const options = [];
  Object.keys(grunt.cli.optlist).forEach(long => {
    const o = grunt.cli.optlist[long];
    options.push(`--${o.negate ? 'no-' : ''}${long}`);
    if (o.short) options.push(`-${o.short}`);
  });
  return options;
}

// Setup task execution handlers
function setupTaskHandlers(task, fail, done) {
  const uncaughtHandler = (e) => fail.fatal(e, fail.code.TASK_FAILURE);
  process.on('uncaughtException', uncaughtHandler);
  
  task.options({
    error: (e) => fail.warn(e, fail.code.TASK_FAILURE),
    done: () => {
      process.removeListener('uncaughtException', uncaughtHandler);
      fail.report();
      done ? done() : util.exit(0);
    }
  });
  
  return uncaughtHandler;
}

// Execute tasks
function executeTasks(task, tasks) {
  tasks.forEach(name => task.run(name));
  task.start({ asyncDone: true });
}

// Main grunt.tasks function
grunt.tasks = function(tasks, options, done) {
  initializeCoffeeScript();
  
  const log = initializeCore();
  const { fail, option, config, task } = loadGruntModules();
  
  exposeTaskMethods(task);
  exposeUtilityMethods(config, fail);
  
  grunt.package = require('../package.json');
  grunt.version = grunt.package.version;
  
  option.init(options);
  
  if (handleVersionFlag(option, log, grunt.verbose)) return;
  
  log.initColors();
  
  if (option('help')) {
    grunt.help.display();
    return;
  }
  
  grunt.verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');
  
  const tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs(tasksSpecified ? tasks : ['default']);
  
  task.init(tasks, options);
  
  grunt.verbose.writeln();
  if (!tasksSpecified) {
    grunt.verbose.writeln('No tasks specified, running default tasks.');
  }
  grunt.verbose.writeflags(tasks, 'Running tasks');
  
  setupTaskHandlers(task, fail, done);
  executeTasks(task, tasks);
};
```