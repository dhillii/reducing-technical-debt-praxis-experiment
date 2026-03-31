```javascript
'use strict';

const path = require('path');

// Register CoffeeScript support if available, otherwise provide helpful error messages
function registerCoffeeScript() {
  try {
    require('coffeescript/register');
  } catch (e) {
    if (!require.extensions) return;

    const COFFEE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
    const coffeeError = () => {
      throw new Error(
        'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
        'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
      );
    };

    COFFEE_EXTENSIONS.forEach(ext => {
      require.extensions[ext] = coffeeError;
    });
  }
}

function loadGruntModules(grunt) {
  const util = require('grunt-legacy-util');
  grunt.util = util;
  grunt.util.task = require('./util/task');

  const { Log } = require('grunt-legacy-log');
  grunt.log = new Log({ grunt });

  const moduleNames = ['template', 'event', 'fail', 'file', 'option', 'config', 'task', 'help', 'cli'];
  const modules = {};

  moduleNames.forEach(name => {
    modules[name] = grunt[name] = require(`./grunt/${name}`);
  });

  grunt.verbose = grunt.log.verbose;

  return modules;
}

function exposeGruntMethods(grunt, modules) {
  const { task, config, fail } = modules;

  grunt.package = require('../package.json');
  grunt.version = grunt.package.version;

  const expose = (obj, methodName, alias = methodName) => {
    grunt[alias] = obj[methodName].bind(obj);
  };

  ['registerTask', 'registerMultiTask', 'registerInitTask', 'renameTask', 'loadTasks', 'loadNpmTasks']
    .forEach(method => expose(task, method));

  expose(config, 'init', 'initConfig');
  expose(fail, 'warn');
  expose(fail, 'fatal');
}

function displayVersionInfo(grunt, modules) {
  const { option, log, verbose, fail } = modules;

  log.writeln(`grunt v${grunt.version}`);

  if (!option('verbose')) return;

  verbose.writeln(`Install path: ${path.resolve(__dirname, '..')}`);

  grunt.log.muted = true;
  grunt.task.init([], { help: true });
  grunt.log.muted = false;

  const availableTasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln(`Available tasks: ${availableTasks.join(' ')}`);

  const availableOptions = Object.entries(grunt.cli.optlist).flatMap(([long, o]) => {
    const opts = [`--${o.negate ? 'no-' : ''}${long}`];
    if (o.short) opts.push(`-${o.short}`);
    return opts;
  });

  verbose.writeln(`Available options: ${availableOptions.join(' ')}`);
}

function setupTaskExecution(grunt, modules, tasks, options, done) {
  const { task, fail, util, verbose } = modules;

  const uncaughtHandler = e => fail.fatal(e, fail.code.TASK_FAILURE);
  process.on('uncaughtException', uncaughtHandler);

  task.options({
    error: e => fail.warn(e, fail.code.TASK_FAILURE),
    done: () => {
      process.removeListener('uncaughtException', uncaughtHandler);
      fail.report();
      done ? done() : util.exit(0);
    }
  });

  const tasksSpecified = tasks && tasks.length > 0;
  const resolvedTasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  task.init(resolvedTasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(resolvedTasks, 'Running tasks');

  resolvedTasks.forEach(name => task.run(name));
  task.start({ asyncDone: true });
}

// Initialize grunt
registerCoffeeScript();

const grunt = module.exports = {};
const modules = loadGruntModules(grunt);
exposeGruntMethods(grunt, modules);

const { option, log, verbose, fail, task, help, util } = modules;

grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (option('version')) {
    displayVersionInfo(grunt, { option, log, verbose, fail });
    return;
  }

  log.initColors();

  if (option('help')) {
    help.display();
    return;
  }

  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  setupTaskExecution(grunt, { task, fail, util, verbose }, tasks, options, done);
};
```