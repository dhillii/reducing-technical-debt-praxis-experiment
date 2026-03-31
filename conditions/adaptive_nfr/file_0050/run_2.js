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

function setupGruntLibs(grunt) {
  const gRequire = name => {
    grunt[name] = require('./grunt/' + name);
    return grunt[name];
  };

  const util = require('grunt-legacy-util');
  grunt.util = util;
  grunt.util.task = require('./util/task');

  const log = new (require('grunt-legacy-log').Log)({ grunt });
  grunt.log = log;
  grunt.verbose = log.verbose;

  gRequire('template');
  gRequire('event');
  const fail = gRequire('fail');
  gRequire('file');
  const option = gRequire('option');
  const config = gRequire('config');
  const task = gRequire('task');
  const help = gRequire('help');
  gRequire('cli');

  return { util, log, fail, option, config, task, help };
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

function handleVersionFlag(grunt, option, log, verbose, fail) {
  log.writeln('grunt v' + grunt.version);

  if (!option('verbose')) return;

  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  grunt.log.muted = true;
  grunt.task.init([], { help: true });
  grunt.log.muted = false;

  const tasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + tasks.join(' '));

  const options = Object.keys(grunt.cli.optlist).reduce((acc, long) => {
    const o = grunt.cli.optlist[long];
    acc.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) acc.push('-' + o.short);
    return acc;
  }, []);
  verbose.writeln('Available options: ' + options.join(' '));
}

function setupTaskCompletion(task, fail, util, done) {
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

// Module export
const grunt = module.exports = {};

registerCoffeeScript();

const { util, log, fail, option, config, task, help } = setupGruntLibs(grunt);

grunt.package = require('../package.json');
grunt.version = grunt.package.version;

exposeTaskMethods(grunt, task, config, fail);

grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (option('version')) {
    handleVersionFlag(grunt, option, log, grunt.verbose, fail);
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

  setupTaskCompletion(task, fail, util, done);

  tasks.forEach(name => task.run(name));
  task.start({ asyncDone: true });
};
```