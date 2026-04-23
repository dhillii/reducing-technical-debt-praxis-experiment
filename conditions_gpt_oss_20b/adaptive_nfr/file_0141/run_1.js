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
 * Construct an Strapi instance.
 *
 * @constructor
 */
class Strapi {
  constructor(opts = {}) {
    this.reload = this.reload();

    // Expose `koa`.
    this.app = new Koa();
    this.router = new Router();

    this.initServer();

    // Logger.
    this.log = logger;

    // Utils.
    this.utils = {
      models,
    };

    this.dir = opts.dir || process.cwd();

    this.admin = {};
    this.plugins = {};
    this.config = loadConfiguration(this.dir, opts);
    this.app.proxy = this.config.get('server.proxy');

    this.isLoaded = false;

    // internal services.
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

  logFirstStartupMessage() {
    this.logStats();

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

  initServer() {
    this.server = http.createServer(this.handleRequest.bind(this));
    this.server.on('error', this.handleServerError.bind(this));

    const connections = {};

    this.server.on('connection', conn => {
      const key = conn.remoteAddress + ':' + conn.remotePort;
      connections[key] = conn;

      conn.on('close', () => {
        delete connections[key];
      });
    });

    this.server.destroy = cb => {
      this.server.close(cb);

      for (let key in connections) {
        connections[key].destroy();
      }
    };
  }

  /**
   * Start the Strapi server.
   *
   * @param {Function} [cb] - Optional callback.
   */
  async start(cb) {
    try {
      if (!this.isLoaded) {
        await this.load();
      }

      this.app.use(this.router.routes()).use(this.router.allowedMethods());

      // Launch server.
      this.listen(cb);
    } catch (err) {
      this.stopWithError(err);
    }
  }

  /**
   * Destroy the Strapi instance.
   */
  async destroy() {
    await this.destroyServer();
    await this.destroyPlugins();
    await this.destroyAdmin();
    this.eventHub.removeAllListeners();
    await this.destroyDb();
    this.telemetry.destroy();
    delete global.strapi;
  }

  /**
   * Determine if the startup message should be hidden.
   *
   * @returns {boolean}
   */
  isStartupMessageHidden() {
    return process.env.STRAPI_HIDE_STARTUP_MESSAGE === 'true';
  }

  /**
   * Determine if the browser should be opened after startup.
   *
   * @param {boolean} isInitialised - Whether the project is initialised.
   * @returns {boolean}
   */
  shouldOpenBrowser(isInitialised) {
    return (
      (this.config.environment === 'development' &&
        this.config.get('server.admin.autoOpen', true) !== false) ||
      !isInitialised
    );
  }

  /**
   * Handle server error events.
   *
   * @param {Error} err
   */
  handleServerError(err) {
    if (err.code === 'EADDRINUSE') {
      return this.stopWithError(`The port ${err.port} is already used by another application.`);
    }

    this.log.error(err);
  }

  /**
   * Listen for incoming connections.
   *
   * @param {Function} [cb] - Optional callback.
   */
  listen(cb) {
    const onListen = async err => {
      if (err) return this.stopWithError(err);

      const isInitialised = utils.isInitialised(this);

      const hideStartupMessage = this.isStartupMessageHidden();

      if (!hideStartupMessage) {
        if (!isInitialised) {
          this.logFirstStartupMessage();
        } else {
          this.logStartupMessage();
        }
      }

      const databaseClients = _.map(this.config.get('connections'), _.property('settings.client'));

      await this.telemetry.send('didStartServer', {
        database: databaseClients,
        plugins: this.config.installedPlugins,
        providers: this.config.installedProviders,
      });

      if (cb && typeof cb === 'function') {
        cb();
      }

      if (this.shouldOpenBrowser(isInitialised)) {
        await utils.openBrowser.call(this);
      }
    };

    const listenSocket = this.config.get('server.socket');
    const listenErrHandler = err => onListen(err).catch(err => this.stopWithError(err));

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

  /**
   * Stop the server with an error message.
   *
   * @param {Error} err
   * @param {string} [customMessage]
   */
  stopWithError(err, customMessage) {
    this.log.debug(`⛔️ Server wasn't able to start properly.`);
    if (customMessage) {
      this.log.error(customMessage);
    }
    this.log.error(err);
    return this.stop();
  }

  /**
   * Stop the server and exit the process.
   *
   * @param {number} [exitCode=1]
   */
  stop(exitCode = 1) {
    if (_.has(this, 'server.destroy')) {
      this.server.destroy();
    }

    if (this.config.autoReload) {
      process.send('stop');
    }

    process.exit(exitCode);
  }

  /**
   * Load the Strapi application.
   */
  async load() {
    this.app.use(async (ctx, next) => {
      if (ctx.request.url === '/_health' && ['HEAD', 'GET'].includes(ctx.request.method)) {
        ctx.set('strapi', 'You are so French!');
        ctx.status = 204;
      } else {
        await next();
      }
    });

    await this.loadModulesAndBootstrap();
    await this.initServices();
    await this.freeze();

    this.isLoaded = true;
    return this;
  }

  /**
   * Load modules and run bootstrap.
   */
  async loadModulesAndBootstrap() {
    const modules = await loadModules(this);

    this.api = modules.api;
    this.admin = modules.admin;
    this.components = modules.components;
    this.plugins = modules.plugins;
    this.middleware = modules.middlewares;
    this.hook = modules.hook;

    await bootstrap(this);
  }

  /**
   * Initialize services and run lifecycles.
   */
  async initServices() {
    this.webhookRunner = createWebhookRunner({
      eventHub: this.eventHub,
      logger: this.log,
      configuration: this.config.get('server.webhooks', {}),
    });

    this.models['core_store'] = coreStoreModel(this.config);
    this.models['strapi_webhooks'] = webhookModel(this.config);

    this.db = createDatabaseManager(this);

    await this.runLifecyclesFunctions(LIFECYCLES.REGISTER);
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

    await this.runLifecyclesFunctions(LIFECYCLES.BOOTSTRAP);
  }

  /**
   * Start all webhooks.
   */
  async startWebhooks() {
    const webhooks = await this.webhookStore.findWebhooks();
    webhooks.forEach(webhook => this.webhookRunner.add(webhook));
  }

  /**
   * Execute lifecycle functions.
   *
   * @param {string} lifecycleName
   */
  async runLifecyclesFunctions(lifecycleName) {
    const execLifecycle = async fn => {
      if (!fn) return;
      try {
        await fn();
      } catch (err) {
        strapi.log.error(`${lifecycleName} function failed`);
        strapi.log.error(err);
        strapi.stop();
      }
    };

    const configPath = `functions.${lifecycleName}`;

    // plugins
    await Promise.all(
      Object.keys(this.plugins).map(pluginName => {
        const pluginFunc = _.get(this.plugins[pluginName], `config.${configPath}`);
        return execLifecycle(pluginFunc).catch(err => {
          strapi.log.error(`${lifecycleName} function in plugin "${pluginName}" failed`);
          strapi.log.error(err);
          strapi.stop();
        });
      })
    );

    // user
    await execLifecycle(_.get(this.config, configPath));

    // admin
    const adminFunc = _.get(this.admin.config, configPath);
    await execLifecycle(adminFunc).catch(err => {
      strapi.log.error(`${lifecycleName} function in admin failed`);
      strapi.log.error(err);
      strapi.stop();
    });
  }

  /**
   * Freeze configuration and core objects.
   */
  async freeze() {
    Object.freeze(this.config);
    Object.freeze(this.dir);
    Object.freeze(this.admin);
    Object.freeze(this.plugins);
    Object.freeze(this.api);
  }

  /**
   * Get a model from the database manager.
   *
   * @param {string} modelKey
   * @param {string} [plugin]
   * @returns {Object}
   */
  getModel(modelKey, plugin) {
    return this.db.getModel(modelKey, plugin);
  }

  /**
   * Bind queries with a specific model.
   *
   * @param {string} entity - entity name
   * @param {string} [plugin] - plugin name or null
   * @returns {Object}
   */
  query(entity, plugin) {
    return this.db.query(entity, plugin);
  }

  /**
   * Destroy the server.
   */
  async destroyServer() {
    if (_.has(this, 'server.destroy')) {
      await new Promise(res => this.server.destroy(res));
    }
  }

  /**
   * Destroy all plugins.
   */
  async destroyPlugins() {
    await Promise.all(
      Object.values(this.plugins).map(plugin => {
        if (_.has(plugin, 'destroy') && typeof plugin.destroy === 'function') {
          return plugin.destroy();
        }
      })
    );
  }

  /**
   * Destroy the admin instance.
   */
  async destroyAdmin() {
    if (_.has(this, 'admin')) {
      await this.admin.destroy();
    }
  }

  /**
   * Destroy the database manager.
   */
  async destroyDb() {
    if (_.has(this, 'db')) {
      await this.db.destroy();
    }
  }
}

module.exports = options => {
  const strapi = new Strapi(options);
  global.strapi = strapi;
  return strapi;
};