```javascript
'use strict';

const path = require('path');
const util = require('grunt-legacy-util');
const { Log } = require('grunt-legacy-log');

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

// Lazy-load internal grunt modules
function gRequire(name) {
  return (grunt[name] = require(`./grunt/${name}`));
}

function gExpose(obj, methodName, newMethodName) {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
}

// Initialize core modules
function initializeGrunt() {
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

  return { task, option, config, fail, help, log };
}

const { task, option, config, fail, help, log } = initializeGrunt();

// Version and help display
function handleVersionOption() {
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

function setupTaskHandlers(tasks, done) {
  const uncaughtHandler = (e) => fail.fatal(e, fail.code.TASK_FAILURE);
  
  process.on('uncaughtException', uncaughtHandler);

  task.options({
    error: (e) => fail.warn(e, fail.code.TASK_FAILURE),
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

function logTaskInitialization(tasksSpecified, tasks) {
  grunt.verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  if (!tasksSpecified) {
    grunt.verbose.writeln('No tasks specified, running default tasks.');
  }
  grunt.verbose.writeflags(tasks, 'Running tasks');
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

  const tasksSpecified = tasks && tasks.length > 0;
  const parsedTasks = task.parseArgs(tasksSpecified ? tasks : 'default');

  task.init(parsedTasks, options);
  logTaskInitialization(tasksSpecified, parsedTasks);

  setupTaskHandlers(parsedTasks, done);

  parsedTasks.forEach(name => task.run(name));
  task.start({ asyncDone: true });
};

registerCoffeeScriptLoader();
```