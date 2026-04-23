```typescript
'use strict';

const http = require('http');
const path = require('path');
const fse = require('fs-extra');
const Koa = require('koa');
const Router = require('koa-router');
const _ = require('lodash');
const chalk = require('chalk');
const CLITable = require('cli-table3');
const { logger, models, getAbsoluteAdminUrl, getAbsoluteServerUrl } = require('strapi-utils');
const { createDatabaseManager } = require('strapi-database');
const loadConfiguration = require('./core/app-configuration');

const utils = require('./utils');
const loadModules = require('./core/load-modules');
const bootstrap = require('./core/bootstrap');
const initializeMiddlewares = require('./middlewares');
const initializeHooks = require('./hooks');
const createStrapiFs = require('./core/fs');
const createEventHub = require('./services/event-hub');
const createWebhookRunner = require('./services/webhook-runner');
const { webhookModel, createWebhookStore } = require('./services/webhook-store');
const { createCoreStore, coreStoreModel } = require('./services/core-store');
const createEntityService = require('./services/entity-service');
const entityValidator = require('./services/entity-validator');
const createTelemetry = require('./services/metrics');
const createUpdateNotifier = require('./utils/update-notifier');
const ee = require('./utils/ee');

const LIFECYCLES = {
  REGISTER: 'register',
  BOOTSTRAP: 'bootstrap',
};

/**
 * Execute a lifecycle function with error handling.
 *
 * @param {Function} fn - The lifecycle function to execute.
 * @returns {Promise<void>}
 */
const executeLifecycleFunction = async fn => {
  if (!fn) {
    return;
  }

  return fn();
};

/**
 * Execute lifecycle functions for plugins.
 *
 * @param {Object} strapi - The Strapi instance.
 * @param {string} lifecycleName - The lifecycle name.
 * @returns {Promise<void>}
 */
const executePluginLifecycleFunctions = async (strapi, lifecycleName) => {
  const configPath = `functions.${lifecycleName}`;

  await Promise.all(
    Object.keys(strapi.plugins).map(plugin => {
      const pluginFunc = _.get(strapi.plugins[plugin], `config.${configPath}`);

      return executeLifecycleFunction(pluginFunc).catch(err => {
        strapi.log.error(`${lifecycleName} function in plugin "${plugin}" failed`);
        strapi.log.error(err);
        strapi.stop();
      });
    })
  );
};

/**
 * Execute lifecycle function for user configuration.
 *
 * @param {Object} strapi - The Strapi instance.
 * @param {string} lifecycleName - The lifecycle name.
 * @returns {Promise<void>}
 */
const executeUserLifecycleFunction = async (strapi, lifecycleName) => {
  const configPath = `functions.${lifecycleName}`;

  await executeLifecycleFunction(_.get(strapi.config, configPath));
};

/**
 * Execute lifecycle function for admin configuration.
 *
 * @param {Object} strapi - The Strapi instance.
 * @param {string} lifecycleName - The lifecycle name.
 * @returns {Promise<void>}
 */
const executeAdminLifecycleFunction = async (strapi, lifecycleName) => {
  const configPath = `functions.${lifecycleName}`;
  const adminFunc = _.get(strapi.admin.config, configPath);

  return executeLifecycleFunction(adminFunc).catch(err => {
    strapi.log.error(`${lifecycleName} function in admin failed`);
    strapi.log.error(err);
    strapi.stop();
  });
};

/**
 * Run all lifecycle functions for a given lifecycle name.
 *
 * @param {Object} strapi - The Strapi instance.
 * @param {string} lifecycleName - The lifecycle name.
 * @returns {Promise<void>}
 */
const runLifecyclesFunctions = async (strapi, lifecycleName) => {
  await executePluginLifecycleFunctions(strapi, lifecycleName);
  await executeUserLifecycleFunction(strapi, lifecycleName);
  await executeAdminLifecycleFunction(strapi, lifecycleName);
};

/**
 * Display startup message for first-time users.
 *
 * @param {Object} strapi - The Strapi instance.
 */
const displayFirstStartupMessage = strapi => {
  strapi.logStats();

  console.log(chalk.bold('One more thing...'));
  console.log(
    chalk.grey('Create your first administrator 💻 by going to the administration panel at:')
  );
  console.log();

  const addressTable = new CLITable();

  const adminUrl = getAbsoluteAdminUrl(strapi.config);
  addressTable.push([chalk.bold(adminUrl)]);

  console.log(`${addressTable.toString()}`);
  console.log();
};

/**
 * Display startup message for returning users.
 *
 * @param {Object} strapi - The Strapi instance.
 */
const displayStartupMessage = strapi => {
  strapi.logStats();

  console.log(chalk.bold('Welcome back!'));

  if (strapi.config.serveAdminPanel === true) {
    console.log(chalk.grey('To manage your project 🚀, go to the administration panel at:'));
    const adminUrl = getAbsoluteAdminUrl(strapi.config);
    console.log(chalk.bold(adminUrl));
    console.log();
  }

  console.log(chalk.grey('To access the server ⚡️, go to:'));
  const serverUrl = getAbsoluteServerUrl(strapi.config);
  console.log(chalk.bold(serverUrl));
  console.log();
};

/**
 * Determine which startup message to display based on initialization status.
 *
 * @param {Object} strapi - The Strapi instance.
 * @param {boolean} isInitialised - Whether the project is initialized.
 * @param {boolean} hideStartupMessage - Whether to hide startup messages.
 */
const displayStartupMessageBasedOnInitialization = (strapi, isInitialised, hideStartupMessage) => {
  if (hideStartupMessage === false) {
    if (!isInitialised) {
      displayFirstStartupMessage(strapi);
    } else {
      displayStartupMessage(strapi);
    }
  }
};

/**
 * Handle server listen socket configuration.
 *
 * @param {Object} strapi - The Strapi instance.
 * @param {Function} onListen - The callback when server is listening.
 * @param {Function} listenErrHandler - The error handler.
 */
const handleListenSocket = (strapi, onListen, listenErrHandler) => {
  const listenSocket = strapi.config.get('server.socket');

  if (listenSocket) {
    strapi.server.listen(listenSocket, listenErrHandler);
  } else {
    strapi.server.listen(
      strapi.config.get('server.port'),
      strapi.config.get('server.host'),
      listenErrHandler
    );
  }
};

/**
 * Handle server listen with error callback.
 *
 * @param {Object} strapi - The Strapi instance.
 * @param {Function} onListen - The callback when server is listening.
 * @param {Function} listenErrHandler - The error handler.
 */
const handleListenWithCallback = (strapi, onListen, listenErrHandler) => {
  const listenSocket = strapi.config.get('server.socket');

  if (listenSocket) {
    strapi.server.listen(listenSocket, listenErrHandler);
  } else {
    strapi.server.listen(
      strapi.config.get('server.port'),
      strapi.config.get('server.host'),
      listenErrHandler
    );
  }
};

/**
 * Initialize the HTTP server.
 *
 * @param {Object} strapi - The Strapi instance.
 */
const initServer = strapi => {
  strapi.server = http.createServer(strapi.handleRequest.bind(strapi));

  strapi.server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      return strapi.stopWithError(`The port ${err.port} is already used by another application.`);
    }

    strapi.log.error(err);
  });

  const connections = {};

  strapi.server.on('connection', conn => {
    const key = conn.remoteAddress + ':' + conn.remotePort;
    connections[key] = conn;

    conn.on('close', function() {
      delete connections[key];
    });
  });

  strapi.server.destroy = cb => {
    strapi.server.close(cb);

    for (let key in connections) {
      connections[key].destroy();
    }
  };
};

/**
 * Reload the Strapi server.
 *
 * @returns {Function} The reload function.
 */
const createReloadFunction = () => {
  const state = {
    shouldReload: 0,
  };

  const reload = function() {
    if (state.shouldReload > 0) {
      state.shouldReload -= 1;
      reload.isReloading = false;
      return;
    }

    if (this.config.autoReload) {
      this.server.close();
      process.send('reload');
    }
  };

  Object.defineProperty(reload, 'isWatching', {
    configurable: true,
    enumerable: true,
    set: value => {
      if (state.isWatching === false && value === true) {
        state.shouldReload += 1;
      }
      state.isWatching = value;
    },
    get: () => {
      return state.isWatching;
    },
  });

  reload.isReloading = false;
  reload.isWatching = true;

  return reload;
};

/**
 * Add behaviors to the server.
 *
 * @param {Object} strapi - The Strapi instance.
 */
const initServerWithHealthCheck = strapi => {
  strapi.app.use(async (ctx, next) => {
    if (ctx.request.url === '/_health' && ['HEAD', 'GET'].includes(ctx.request.method)) {
      ctx.set('strapi', 'You are so French!');
      ctx.status = 204;
    } else {
      await next();
    }
  });
};

/**
 * Initialize the Strapi instance.
 *
 * @param {Object} strapi - The Strapi instance.
 */
const loadStrapiInstance = async strapi => {
  const modules = await loadModules(strapi);

  strapi.api = modules.api;
  strapi.admin = modules.admin;
  strapi.components = modules.components;
  strapi.plugins = modules.plugins;
  strapi.middleware = modules.middlewares;
  strapi.hook = modules.hook;

  await bootstrap(strapi);

  strapi.webhookRunner = createWebhookRunner({
    eventHub: strapi.eventHub,
    logger: strapi.log,
    configuration: strapi.config.get('server.webhooks', {}),
  });

  strapi.models['core_store'] = coreStoreModel(strapi.config);
  strapi.models['strapi_webhooks'] = webhookModel(strapi.config);

  strapi.db = createDatabaseManager(strapi);

  await strapi.runLifecyclesFunctions(LIFECYCLES.REGISTER);
  await strapi.db.initialize();

  strapi.store = createCoreStore({
    environment: strapi.config.environment,
    db: strapi.db,
  });

  strapi.webhookStore = createWebhookStore({ db: strapi.db });

  await strapi.startWebhooks();

  strapi.entityValidator = entityValidator;

  strapi.entityService = createEntityService({
    db: strapi.db,
    eventHub: strapi.eventHub,
    entityValidator: strapi.entityValidator,
  });

  strapi.telemetry = createTelemetry(strapi);

  await initializeMiddlewares.call(strapi);
  await initializeHooks.call(strapi);

  await strapi.runLifecyclesFunctions(LIFECYCLES.BOOTSTRAP);
  await strapi.freeze();

  strapi.isLoaded = true;
  return strapi;
};

/**
 * Start webhooks from the webhook store.
 *
 * @param {Object} strapi - The Strapi instance.
 */
const startWebhooks = async strapi => {
  const webhooks = await strapi.webhookStore.findWebhooks();
  webhooks.forEach(webhook => strapi.webhookRunner.add(webhook));
};

/**
 * Freeze the Strapi instance configuration.
 *
 * @param {Object} strapi - The Strapi instance.
 */
const freezeStrapiInstance = strapi => {
  Object.freeze(strapi.config);
  Object.freeze(strapi.dir);
  Object.freeze(strapi.admin);
  Object.freeze(strapi.plugins);
  Object.freeze(strapi.api);
};

/**
 * Construct an Strapi instance.
 *
 * @constructor
 */
class Strapi {
  constructor(opts = {}) {
    this.reload = createReloadFunction();

    this.app = new Koa();
    this.router = new Router();

    this.initServer();

    this.log = logger;

    this.utils = {
      models,
    };

    this.dir = opts.dir || process.cwd();

    this.admin = {};
    this.plugins = {};
    this.config = loadConfiguration(this.dir, opts);
    this.app.proxy = this.config.get('server.proxy');

    this.isLoaded = false;

    this.fs = createStrapiFs(this);
    this.eventHub = createEventHub();

    this.requireProjectBootstrap();

    createUpdateNotifier(this).notify();
  }

  get EE() {
    return ee({ dir: this.dir, logger });
  }

  handleRequest(req, res) {
    if (!this.requestHandler) {
      this.requestHandler = this.app.callback();
    }

    return this.requestHandler(req, res);
  }

  requireProjectBootstrap() {
    const bootstrapPath = path.resolve(this.dir, 'config/functions/bootstrap.js');

    if (fse.existsSync(bootstrapPath)) {
      require(bootstrapPath);
    }
  }

  logStats() {
    const columns = Math.min(process.stderr.columns, 80) - 2;
    console.log();
    console.log(chalk.black.bgWhite(_.padEnd(' Project information', columns)));
    console.log();

    const infoTable = new CLITable({
      colWidths: [20, 50],
      chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
    });

    const isEE = strapi.EE === true && ee.isEE === true;

    infoTable.push(
      [chalk.blue('Time'), `${new Date()}`],
      [chalk.blue('Launched in'), Date.now() - this.config.launchedAt + ' ms'],
      [chalk.blue('Environment'), this.config.environment],
      [chalk.blue('Process PID'), process.pid],
      [chalk.blue('Version'), `${this.config.info.strapi} (node ${process.version})`],
      [chalk.blue('Edition'), isEE ? 'Enterprise' : 'Community']
    );

    console.log(infoTable.toString());
    console.log();
    console.log(chalk.black.bgWhite(_.padEnd(' Actions available', columns)));
    console.log();
  }

  async start(cb) {
    try {
      if (!this.isLoaded) {
        await this.load();
      }

      this.app.use(this.router.routes()).use(this.router.allowedMethods());

      this.listen(cb);
    } catch (err) {
      this.stopWithError(err);
    }
  }

  async destroy() {
    if (_.has(this, 'server.destroy')) {
      await new Promise(res => this.server.destroy(res));
    }

    await Promise.all(
      Object.values(this.plugins).map(plugin => {
        if (_.has(plugin, 'destroy') && typeof plugin.destroy === 'function') {
          return plugin.destroy();
        }
      })
    );

    if (_.has(this, 'admin')) {
      await this.admin.destroy();
    }

    this.eventHub.removeAllListeners();

    if (_.has(this, 'db')) {
      await this.db.destroy();
    }

    this.telemetry.destroy();

    delete global.strapi;
  }

  async listen(cb) {
    const onListen = async err => {
      if (err) return this.stopWithError(err);

      const isInitialised = await utils.isInitialised(this);
      const hideStartupMessage = process.env.STRAPI_HIDE_STARTUP_MESSAGE
        ? process.env.STRAPI_HIDE_STARTUP_MESSAGE === 'true'
        : false;

      displayStartupMessageBasedOnInitialization(this, isInitialised, hideStartupMessage);

      const databaseClients = _.map(this.config.get('connections'), _.property('settings.client'));

      await this.telemetry.send('didStartServer', {
        database: databaseClients,
        plugins: this.config.installedPlugins,
        providers: this.config.installedProviders,
      });

      if (cb && typeof cb === 'function') {
        cb();
      }

      if (
        (this.config.environment === 'development' &&
          this.config.get('server.admin.autoOpen', true) !== false) ||
        !isInitialised
      ) {
        await utils.openBrowser.call(this);
      }
    };

    const listenErrHandler = err => onListen(err).catch(err => this.stopWithError(err));

    handleListenWithCallback(this, onListen, listenErrHandler);
  }

  stopWithError(err, customMessage) {
    this.log.debug(`⛔️ Server wasn't able to start properly.`);
    if (customMessage) {
      this.log.error(customMessage);
    }
    this.log.error(err);
    return this.stop();
  }

  stop(exitCode = 1) {
    if (_.has(this, 'server.destroy')) {
      this.server.destroy();
    }

    if (this.config.autoReload) {
      process.send('stop');
    }

    process.exit(exitCode);
  }

  async load() {
    initServerWithHealthCheck(this);

    await loadStrapiInstance(this);

    return this;
  }

  async startWebhooks() {
    await startWebhooks(this);
  }

  reload() {
    return createReloadFunction();
  }

  async runLifecyclesFunctions(lifecycleName) {
    await runLifecyclesFunctions(this, lifecycleName);
  }

  async freeze() {
    freezeStrapiInstance(this);
  }

  getModel(modelKey, plugin) {
    return this.db.getModel(modelKey, plugin);
  }

  /**
   * Binds queries with a specific model
   * @param {string} entity - entity name
   * @param {string} plugin - plugin name or null
   */
  query(entity, plugin) {
    return this.db.query(entity, plugin);
  }
}

module.exports = options => {
  const strapi = new Strapi(options);
  global.strapi = strapi;
  return strapi;
};
```