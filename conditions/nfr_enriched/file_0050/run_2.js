```javascript
'use strict';

const path = require('path');

// Register CoffeeScript support if available, otherwise provide helpful error handlers
function registerCoffeeScript() {
  try {
    require('coffeescript/register');
  } catch (e) {
    if (!require.extensions) { return; }
    const COFFEE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
    const coffeeErrorHandler = () => {
      throw new Error(
        'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
        'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
      );
    };
    COFFEE_EXTENSIONS.forEach(ext => { require.extensions[ext] = coffeeErrorHandler; });
  }
}

registerCoffeeScript();

const grunt = module.exports = {};

// Expose internal grunt libs
function gRequire(name) {
  return grunt[name] = require(`./grunt/${name}`);
}

// Expose a method from an object onto grunt
function gExpose(obj, methodName, alias = methodName) {
  grunt[alias] = obj[methodName].bind(obj);
}

function initGruntLibs() {
  const util = require('grunt-legacy-util');
  grunt.util = util;
  grunt.util.task = require('./util/task');

  const { Log } = require('grunt-legacy-log');
  grunt.log = new Log({ grunt });

  gRequire('template');
  gRequire('event');
  gRequire('file');
  gRequire('cli');

  const fail = gRequire('fail');
  const option = gRequire('option');
  const config = gRequire('config');
  const task = gRequire('task');
  const help = gRequire('help');

  grunt.verbose = grunt.log.verbose;
  grunt.package = require('../package.json');
  grunt.version = grunt.package.version;

  return { util, fail, option, config, task, help };
}

const { util, fail, option, config, task, help } = initGruntLibs();

function exposeTaskMethods() {
  const taskMethods = [
    'registerTask',
    'registerMultiTask',
    'registerInitTask',
    'renameTask',
    'loadTasks',
    'loadNpmTasks',
  ];
  taskMethods.forEach(method => gExpose(task, method));
  gExpose(config, 'init', 'initConfig');
  gExpose(fail, 'warn');
  gExpose(fail, 'fatal');
}

exposeTaskMethods();

function displayVersionInfo() {
  const { log, verbose } = grunt;
  log.writeln(`grunt v${grunt.version}`);

  if (!option('verbose')) { return; }

  verbose.writeln(`Install path: ${path.resolve(__dirname, '..')}`);
  grunt.log.muted = true;
  grunt.task.init([], { help: true });
  grunt.log.muted = false;

  const availableTasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln(`Available tasks: ${availableTasks.join(' ')}`);

  const availableOptions = Object.entries(grunt.cli.optlist).flatMap(([long, o]) => {
    const longFlag = `--${o.negate ? 'no-' : ''}${long}`;
    return o.short ? [longFlag, `-${o.short}`] : [longFlag];
  });
  verbose.writeln(`Available options: ${availableOptions.join(' ')}`);
}

function setupTaskErrorHandling(uncaughtHandler) {
  process.on('uncaughtException', uncaughtHandler);

  task.options({
    error(e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done() {
      process.removeListener('uncaughtException', uncaughtHandler);
      fail.report();

      if (done) {
        done();
      } else {
        util.exit(0);
      }
    },
  });
}

grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (option('version')) {
    displayVersionInfo();
    return;
  }

  grunt.log.initColors();

  if (option('help')) {
    help.display();
    return;
  }

  grunt.verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  task.init(tasks, options);

  grunt.verbose.writeln();
  if (!tasksSpecified) {
    grunt.verbose.writeln('No tasks specified, running default tasks.');
  }
  grunt.verbose.writeflags(tasks, 'Running tasks');

  const uncaughtHandler = e => fail.fatal(e, fail.code.TASK_FAILURE);
  setupTaskErrorHandling(uncaughtHandler);

  tasks.forEach(name => task.run(name));
  task.start({ asyncDone: true });
};
```