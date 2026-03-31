```javascript
'use strict';

const path = require('path');

// Register CoffeeScript support if available, otherwise provide helpful error handlers
function registerCoffeeScript() {
  try {
    require('coffeescript/register');
  } catch (e) {
    if (!require.extensions) return;
    const handler = () => {
      throw new Error(
        'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
        'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
      );
    };
    ['.coffee', '.litcoffee', '.coffee.md'].forEach(ext => {
      require.extensions[ext] = handler;
    });
  }
}

function setupUtil(grunt) {
  const util = require('grunt-legacy-util');
  grunt.util = util;
  grunt.util.task = require('./util/task');
  return util;
}

function setupLogging(grunt) {
  const { Log } = require('grunt-legacy-log');
  const log = new Log({ grunt });
  grunt.log = log;
  grunt.verbose = log.verbose;
  return { log, verbose: log.verbose };
}

function requireGruntLib(grunt, name) {
  return grunt[name] = require(`./grunt/${name}`);
}

function exposeMethod(grunt, obj, methodName, alias) {
  grunt[alias || methodName] = obj[methodName].bind(obj);
}

function setupGruntLibs(grunt) {
  requireGruntLib(grunt, 'template');
  requireGruntLib(grunt, 'event');
  const fail = requireGruntLib(grunt, 'fail');
  requireGruntLib(grunt, 'file');
  const option = requireGruntLib(grunt, 'option');
  const config = requireGruntLib(grunt, 'config');
  const task = requireGruntLib(grunt, 'task');
  const help = requireGruntLib(grunt, 'help');
  requireGruntLib(grunt, 'cli');
  return { fail, option, config, task, help };
}

function exposeMethods(grunt, { task, config, fail }) {
  const taskMethods = [
    'registerTask', 'registerMultiTask', 'registerInitTask',
    'renameTask', 'loadTasks', 'loadNpmTasks'
  ];
  taskMethods.forEach(method => exposeMethod(grunt, task, method));
  exposeMethod(grunt, config, 'init', 'initConfig');
  exposeMethod(grunt, fail, 'warn');
  exposeMethod(grunt, fail, 'fatal');
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

  const availableOptions = buildOptionsList(grunt.cli.optlist);
  verbose.writeln(`Available options: ${availableOptions.join(' ')}`);
}

function buildOptionsList(optlist) {
  return Object.keys(optlist).reduce((opts, long) => {
    const o = optlist[long];
    opts.push(`--${o.negate ? 'no-' : ''}${long}`);
    if (o.short) opts.push(`-${o.short}`);
    return opts;
  }, []);
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

const util = setupUtil(grunt);
const { log, verbose } = setupLogging(grunt);
const libs = setupGruntLibs(grunt);
const { fail, option, task, help } = libs;

exposeMethods(grunt, libs);

grunt.package = require('../package.json');
grunt.version = grunt.package.version;

grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (option('version')) {
    handleVersionFlag(grunt, { option, verbose, log, task });
    return;
  }

  log.initColors();

  if (option('help')) {
    help.display();
    return;
  }

  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  setupTaskCompletion(grunt, { util, fail, task, done });

  tasks.forEach(name => task.run(name));
  task.start({ asyncDone: true });
};
```