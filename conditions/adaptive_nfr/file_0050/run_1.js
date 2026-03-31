```javascript
'use strict';

const path = require('path');

// Register CoffeeScript support if available, otherwise provide helpful error handlers
function registerCoffeeScript() {
  try {
    require('coffeescript/register');
  } catch (e) {
    if (!require.extensions) { return; }
    const FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
    const coffeeError = () => {
      throw new Error(
        'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
        'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
      );
    };
    FILE_EXTENSIONS.forEach(ext => { require.extensions[ext] = coffeeError; });
  }
}

function initGruntLibs(grunt) {
  const gRequire = name => {
    grunt[name] = require(`./grunt/${name}`);
    return grunt[name];
  };

  const util = require('grunt-legacy-util');
  grunt.util = util;
  grunt.util.task = require('./util/task');

  const { Log } = require('grunt-legacy-log');
  grunt.log = new Log({ grunt });

  gRequire('template');
  gRequire('event');
  const fail = gRequire('fail');
  gRequire('file');
  const option = gRequire('option');
  const config = gRequire('config');
  const task = gRequire('task');
  const help = gRequire('help');
  gRequire('cli');

  grunt.verbose = grunt.log.verbose;

  grunt.package = require('../package.json');
  grunt.version = grunt.package.version;

  return { util, fail, option, config, task, help };
}

function exposeTaskMethods(grunt, task, config, fail) {
  const expose = (obj, methodName, alias) => {
    grunt[alias || methodName] = obj[methodName].bind(obj);
  };

  ['registerTask', 'registerMultiTask', 'registerInitTask',
    'renameTask', 'loadTasks', 'loadNpmTasks'].forEach(m => expose(task, m));

  expose(config, 'init', 'initConfig');
  expose(fail, 'warn');
  expose(fail, 'fatal');
}

function logVersionInfo(grunt, option, verbose, log) {
  log.writeln(`grunt v${grunt.version}`);

  if (!option('verbose')) { return; }

  verbose.writeln(`Install path: ${path.resolve(__dirname, '..')}`);
  grunt.log.muted = true;
  grunt.task.init([], { help: true });
  grunt.log.muted = false;

  const tasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln(`Available tasks: ${tasks.join(' ')}`);

  const options = Object.keys(grunt.cli.optlist).reduce((acc, long) => {
    const o = grunt.cli.optlist[long];
    acc.push(`--${o.negate ? 'no-' : ''}${long}`);
    if (o.short) { acc.push(`-${o.short}`); }
    return acc;
  }, []);
  verbose.writeln(`Available options: ${options.join(' ')}`);
}

function setupTaskExecution(grunt, task, fail, option, done, util) {
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

registerCoffeeScript();

const grunt = module.exports = {};
const { util, fail, option, config, task, help } = initGruntLibs(grunt);
const { log, verbose } = grunt;

exposeTaskMethods(grunt, task, config, fail);

grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (option('version')) {
    logVersionInfo(grunt, option, verbose, log);
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

  setupTaskExecution(grunt, task, fail, option, done, util);

  tasks.forEach(name => task.run(name));
  task.start({ asyncDone: true });
};
```