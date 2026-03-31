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
    const errorHandler = () => {
      throw new Error(
        'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
        'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
      );
    };

    COFFEE_EXTENSIONS.forEach(ext => {
      require.extensions[ext] = errorHandler;
    });
  }
}

function setupGruntLibs(grunt) {
  const util = require('grunt-legacy-util');
  grunt.util = util;
  grunt.util.task = require('./util/task');

  const log = new (require('grunt-legacy-log').Log)({ grunt });
  grunt.log = log;
  grunt.verbose = log.verbose;

  return { util, log };
}

function requireGruntModules(grunt) {
  const gRequire = name => {
    grunt[name] = require(`./grunt/${name}`);
    return grunt[name];
  };

  gRequire('template');
  gRequire('event');

  return {
    fail: gRequire('fail'),
    option: gRequire('option'),
    config: gRequire('config'),
    task: gRequire('task'),
    help: gRequire('help'),
    cli: gRequire('cli'),
  };
}

function exposeGruntMethods(grunt, { task, config, fail }) {
  const expose = (obj, methodName, alias = methodName) => {
    grunt[alias] = obj[methodName].bind(obj);
  };

  ['registerTask', 'registerMultiTask', 'registerInitTask', 'renameTask', 'loadTasks', 'loadNpmTasks']
    .forEach(method => expose(task, method));

  expose(config, 'init', 'initConfig');
  expose(fail, 'warn');
  expose(fail, 'fatal');
}

function handleVersionFlag(grunt, { option, verbose, log, task }) {
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

function setupTaskCompletion(grunt, { util, fail, task, done }) {
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
}

// Initialize grunt
registerCoffeeScript();

const grunt = module.exports = {};
const { util, log } = setupGruntLibs(grunt);
const modules = requireGruntModules(grunt);
const { fail, option, config, task, help } = modules;

grunt.package = require('../package.json');
grunt.version = grunt.package.version;

exposeGruntMethods(grunt, { task, config, fail });

grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (option('version')) {
    handleVersionFlag(grunt, { option, verbose: grunt.verbose, log, task });
    return;
  }

  log.initColors();

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

  setupTaskCompletion(grunt, { util, fail, task, done });

  tasks.forEach(name => task.run(name));
  task.start({ asyncDone: true });
};
```