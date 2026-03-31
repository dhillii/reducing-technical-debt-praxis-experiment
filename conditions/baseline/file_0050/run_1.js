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

// Require and expose internal grunt libs
function gRequire(name) {
  return grunt[name] = require(`./grunt/${name}`);
}

function gExpose(obj, methodName, newMethodName) {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
}

// Initialize core modules
initializeCoffeeScript();

grunt.util = util;
grunt.util.task = require('./util/task');

const log = new Log({ grunt });
grunt.log = log;
grunt.verbose = log.verbose;

// Load internal modules
gRequire('template');
gRequire('event');
const fail = gRequire('fail');
gRequire('file');
const option = gRequire('option');
const config = gRequire('config');
const task = gRequire('task');
const help = gRequire('help');
gRequire('cli');

// Expose metadata
grunt.package = require('../package.json');
grunt.version = grunt.package.version;

// Expose task methods
['registerTask', 'registerMultiTask', 'registerInitTask', 'renameTask', 'loadTasks', 'loadNpmTasks']
  .forEach(method => gExpose(task, method));

// Expose config and fail methods
gExpose(config, 'init', 'initConfig');
gExpose(fail, 'warn');
gExpose(fail, 'fatal');

// Helper functions
function displayVersion() {
  log.writeln(`grunt v${grunt.version}`);
  
  if (!option('verbose')) return;
  
  grunt.verbose.writeln(`Install path: ${path.resolve(__dirname, '..')}`);
  
  grunt.log.muted = true;
  grunt.task.init([], { help: true });
  grunt.log.muted = false;
  
  const tasks = Object.keys(grunt.task._tasks).sort();
  grunt.verbose.writeln(`Available tasks: ${tasks.join(' ')}`);
  
  const options = [];
  Object.keys(grunt.cli.optlist).forEach(long => {
    const o = grunt.cli.optlist[long];
    options.push(`--${o.negate ? 'no-' : ''}${long}`);
    if (o.short) options.push(`-${o.short}`);
  });
  grunt.verbose.writeln(`Available options: ${options.join(' ')}`);
}

function setupTaskExecution(tasks, options, done) {
  const uncaughtHandler = e => fail.fatal(e, fail.code.TASK_FAILURE);
  
  process.on('uncaughtException', uncaughtHandler);
  
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
  
  tasks.forEach(name => task.run(name));
  task.start({ asyncDone: true });
}

// Main task execution interface
grunt.tasks = function(tasks, options, done) {
  option.init(options);
  
  if (option('version')) {
    displayVersion();
    return;
  }
  
  log.initColors();
  
  if (option('help')) {
    help.display();
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
  
  setupTaskExecution(tasks, options, done);
};
```