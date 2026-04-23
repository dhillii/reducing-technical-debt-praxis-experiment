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
 * Strapi core class.
 */
class Strapi {
  constructor(opts = {}) {
    this.reload = this._createReload();

    this.app = new Koa();
    this.router = new Router();

    this._initServer();

    this.log = logger;
    this.utils = { models };
    this.dir = opts.dir || process.cwd();

    this.admin = {};
    this.plugins = {};
    this.config = loadConfiguration(this.dir, opts);
    this.app.proxy = this.config.get('server.proxy');

    this.isLoaded = false;

    this.fs = createStrapiFs(this);
    this.eventHub = createEventHub();

    this._requireProjectBootstrap();

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

  _requireProjectBootstrap() {
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

  logFirstStartupMessage() {
    this.logStats();
    console.log(chalk.bold('One more thing...'));
    console.log(chalk.grey('Create your first administrator 💻 by going to the administration panel at:'));
    console.log();

    const addressTable = new CLITable();
    const adminUrl = getAbsoluteAdminUrl(strapi.config);
    addressTable.push([chalk.bold(adminUrl)]);

    console.log(`${addressTable.toString()}`);
    console.log();
  }

  logStartupMessage() {
    this.logStats();
    console.log(chalk.bold('Welcome back!'));

    if (this.config.serveAdminPanel === true) {
      console.log(chalk.grey('To manage your project 🚀, go to the administration panel at:'));
      const adminUrl = getAbsoluteAdminUrl(strapi.config);
      console.log(chalk.bold(adminUrl));
      console.log();
    }

    console.log(chalk.grey('To access the server ⚡️, go to:'));
    const serverUrl = getAbsoluteServerUrl(strapi.config);
    console.log(chalk.bold(serverUrl));
    console.log();
  }

  _initServer() {
    this.server = http.createServer(this.handleRequest.bind(this));

    this.server.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        return this.stopWithError(`The port ${err.port} is already used by another application.`);
      }
      this.log.error(err);
    });

    const connections = {};

    this.server.on('connection', conn => {
      const key = `${conn.remoteAddress}:${conn.remotePort}`;
      connections[key] = conn;
      conn.on('close', () => {
        delete connections[key];
      });
    });

    this.server.destroy = cb => {
      this.server.close(cb);
      for (const key in connections) {
        connections[key].destroy();
      }
    };
  }

  async start(cb) {
    try {
      if (!this.isLoaded) {
        await this.load();
      }
      this.app.use(this.router.routes()).use(this.router.allowedMethods());
      await this._listen(cb);
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

  /**
   * Starts listening on the configured port or socket.
   */
  async _listen(cb) {
    const onListen = async err => {
      if (err) {
        return this.stopWithError(err);
      }

      const isInitialised = await Promise.resolve(utils.isInitialised(this));
      this._handleStartupMessage(isInitialised);
      const databaseClients = _.map(this.config.get('connections'), _.property('settings.client'));
      await this._emitTelemetry(databaseClients);
      if (typeof cb === 'function') {
        cb();
      }
      await this._maybeOpenBrowser(isInitialised);
    };

    const listenSocket = this.config.get('server.socket');
    const listenErrHandler = err => onListen(err).catch(e => this.stopWithError(e));

    if (listenSocket) {
      this.server.listen(listenSocket, listenErrHandler);
    } else {
      this.server.listen(
        this.config.get('server.port'),
        this.config.get('server.host'),
        listenErrHandler
      );
    }
  }

  _handleStartupMessage(isInitialised) {
    const hideStartupMessage = process.env.STRAPI_HIDE_STARTUP_MESSAGE === 'true';
    if (!hideStartupMessage) {
      if (!isInitialised) {
        this.logFirstStartupMessage();
      } else {
        this.logStartupMessage();
      }
    }
  }

  async _emitTelemetry(databaseClients) {
    await this.telemetry.send('didStartServer', {
      database: databaseClients,
      plugins: this.config.installedPlugins,
      providers: this.config.installedProviders,
    });
  }

  async _maybeOpenBrowser(isInitialised) {
    const shouldAutoOpen =
      this.config.environment === 'development' &&
      this.config.get('server.admin.autoOpen', true) !== false;

    if (shouldAutoOpen || !isInitialised) {
      await Promise.resolve(utils.openBrowser.call(this));
    }
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
    this.app.use(async (ctx, next) => {
      if (ctx.request.url === '/_health' && ['HEAD', 'GET'].includes(ctx.request.method)) {
        ctx.set('strapi', 'You are so French!');
        ctx.status = 204;
      } else {
        await next();
      }
    });

    const modules = await loadModules(this);
    this.api = modules.api;
    this.admin = modules.admin;
    this.components = modules.components;
    this.plugins = modules.plugins;
    this.middleware = modules.middlewares;
    this.hook = modules.hook;

    await bootstrap(this);
    this._initWebhookRunner();
    this._initCoreStoreModels();

    this.db = createDatabaseManager(this);
    await this._runLifecycle(LIFECYCLES.REGISTER);
    await this.db.initialize();

    this.store = createCoreStore({
      environment: this.config.environment,
      db: this.db,
    });

    this.webhookStore = createWebhookStore({ db: this.db });
    await this.startWebhooks();

    this.entityValidator = entityValidator;
    this.entityService = createEntityService({
      db: this.db,
      eventHub: this.eventHub,
      entityValidator: this.entityValidator,
    });

    this.telemetry = createTelemetry(this);
    await initializeMiddlewares.call(this);
    await initializeHooks.call(this);
    await this._runLifecycle(LIFECYCLES.BOOTSTRAP);
    await this.freeze();

    this.isLoaded = true;
    return this;
  }

  _initWebhookRunner() {
    this.webhookRunner = createWebhookRunner({
      eventHub: this.eventHub,
      logger: this.log,
      configuration: this.config.get('server.webhooks', {}),
    });
  }

  _initCoreStoreModels() {
    this.models['core_store'] = coreStoreModel(this.config);
    this.models['strapi_webhooks'] = webhookModel(this.config);
  }

  async startWebhooks() {
    const webhooks = await this.webhookStore.findWebhooks();
    webhooks.forEach(webhook => this.webhookRunner.add(webhook));
  }

  _createReload() {
    const state = { shouldReload: 0 };
    const reload = function () {
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
      get: () => state.isWatching,
    });
    reload.isReloading = false;
    reload.isWatching = true;
    return reload;
  }

  async _runLifecycle(lifecycleName) {
    await this._runPluginLifecycles(lifecycleName);
    await this._runUserLifecycle(lifecycleName);
    await this._runAdminLifecycle(lifecycleName);
  }

  async _runPluginLifecycles(lifecycleName) {
    const configPath = `functions.${lifecycleName}`;
    await Promise.all(
      Object.keys(this.plugins).map(plugin => {
        const pluginFunc = _.get(this.plugins[plugin], `config.${configPath}`);
        return this._executeLifecycle(pluginFunc, `${lifecycleName} function in plugin "${plugin}"`);
      })
    );
  }

  async _runUserLifecycle(lifecycleName) {
    const configPath = `functions.${lifecycleName}`;
    const userFunc = _.get(this.config, configPath);
    await this._executeLifecycle(userFunc);
  }

  async _runAdminLifecycle(lifecycleName) {
    const configPath = `functions.${lifecycleName}`;
    const adminFunc = _.get(this.admin.config, configPath);
    await this._executeLifecycle(adminFunc, `${lifecycleName} function in admin failed`);
  }

  async _executeLifecycle(fn, errorMessage) {
    if (!fn) {
      return;
    }
    try {
      await Promise.resolve(fn());
    } catch (err) {
      strapi.log.error(errorMessage || 'Lifecycle function failed');
      strapi.log.error(err);
      strapi.stop();
    }
  }

  async freeze() {
    Object.freeze(this.config);
    Object.freeze(this.dir);
    Object.freeze(this.admin);
    Object.freeze(this.plugins);
    Object.freeze(this.api);
  }

  getModel(modelKey, plugin) {
    return this.db.getModel(modelKey, plugin);
  }

  /**
   * Returns a query builder bound to a specific model.
   * @param {string} entity - entity name
   * @param {string|null} plugin - plugin name or null
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