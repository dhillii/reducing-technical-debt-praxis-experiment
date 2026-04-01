```javascript
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
    // handle port in use cleanly
    this.server.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        return this.stopWithError(`The port ${err.port} is already used by another application.`);
      }

      this.log.error(err);
    });

    // Close current connections to fully destroy the server
    const connections = {};

    this.server.on('connection', conn => {
      const key = conn.remoteAddress + ':' + conn.remotePort;
      connections[key] = conn;

      conn.on('close', function() {
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

  async destroy() {
    await this.destroyServer();
    await this.destroyPlugins();
    await this.destroyAdmin();
    this.eventHub.removeAllListeners();
    await this.destroyDatabase();
    this.telemetry.destroy();

    delete global.strapi;
  }

  /**
   * Destroys the server instance
   */
  async destroyServer() {
    if (_.has(this, 'server.destroy')) {
      await new Promise(res => this.server.destroy(res));
    }
  }

  /**
   * Destroys all plugin instances
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
   * Destroys the admin instance
   */
  async destroyAdmin() {
    if (_.has(this, 'admin') && typeof this.admin.destroy === 'function') {
      await this.admin.destroy();
    }
  }

  /**
   * Destroys the database instance
   */
  async destroyDatabase() {
    if (_.has(this, 'db')) {
      await this.db.destroy();
    }
  }

  /**
   * Add behaviors to the server
   */
  async listen(cb) {
    const onListen = async err => {
      if (err) return this.stopWithError(err);

      await this.handleServerStartup(cb);
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
   * Handles server startup tasks and logging
   */
  async handleServerStartup(cb) {
    const isInitialised = await utils.isInitialised(this);
    const hideStartupMessage = this.shouldHideStartupMessage();

    if (hideStartupMessage === false) {
      if (!isInitialised) {
        this.logFirstStartupMessage();
      } else {
        this.logStartupMessage();
      }
    }

    await this.sendStartupTelemetry();

    if (cb && typeof cb === 'function') {
      cb();
    }

    if (this.shouldOpenBrowser(isInitialised)) {
      await utils.openBrowser.call(this);
    }
  }

  /**
   * Determines if startup message should be hidden
   */
  shouldHideStartupMessage() {
    return process.env.STRAPI_HIDE_STARTUP_MESSAGE === 'true';
  }

  /**
   * Determines if browser should be opened on startup
   */
  shouldOpenBrowser(isInitialised) {
    return (
      (this.config.environment === 'development' &&
        this.config.get('server.admin.autoOpen', true) !== false) ||
      !isInitialised
    );
  }

  /**
   * Sends telemetry data on server startup
   */
  async sendStartupTelemetry() {
    const databaseClients = _.map(this.config.get('connections'), _.property('settings.client'));

    await this.telemetry.send('didStartServer', {
      database: databaseClients,
      plugins: this.config.installedPlugins,
      providers: this.config.installedProviders,
    });
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
    // Destroy server and available connections.
    if (_.has(this, 'server.destroy')) {
      this.server.destroy();
    }

    if (this.config.autoReload) {
      process.send('stop');
    }

    // Kill process
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
    this.assignModules(modules);

    await bootstrap(this);
    await this.initializeServices();
    await this.initializeDatabase();
    await this.initializeStore();
    await this.initializeEntityService();
    await this.initializeMiddlewaresAndHooks();
    await this.freeze();

    this.isLoaded = true;
    return this;
  }

  /**
   * Assigns loaded modules to strapi instance
   */
  assignModules(modules) {
    this.api = modules.api;
    this.admin = modules.admin;
    this.components = modules.components;
    this.plugins = modules.plugins;
    this.middleware = modules.middlewares;
    this.hook = modules.hook;
  }

  /**
   * Initializes core services
   */
  async initializeServices() {
    this.webhookRunner = createWebhookRunner({
      eventHub: this.eventHub,
      logger: this.log,
      configuration: this.config.get('server.webhooks', {}),
    });

    this.models['core_store'] = coreStoreModel(this.config);
    this.models['strapi_webhooks'] = webhookModel(this.config);
  }

  /**
   * Initializes database and runs register lifecycle
   */
  async initializeDatabase() {
    this.db = createDatabaseManager(this);
    await this.runLifecyclesFunctions(LIFECYCLES.REGISTER);
    await this.db.initialize();
  }

  /**
   * Initializes store and webhook store
   */
  async initializeStore() {
    this.store = createCoreStore({
      environment: this.config.environment,
      db: this.db,
    });

    this.webhookStore = createWebhookStore({ db: this.db });
    await this.startWebhooks();
  }

  /**
   * Initializes entity service and telemetry
   */
  async initializeEntityService() {
    this.entityValidator = entityValidator;

    this.entityService = createEntityService({
      db: this.db,
      eventHub: this.eventHub,
      entityValidator: this.entityValidator,
    });

    this.telemetry = createTelemetry(this);
  }

  /**
   * Initializes middlewares and hooks, then runs bootstrap lifecycle
   */
  async initializeMiddlewaresAndHooks() {
    await initializeMiddlewares.call(this);
    await initializeHooks.call(this);
    await this.runLifecyclesFunctions(LIFECYCLES.BOOTSTRAP);
  }

  async startWebhooks() {
    const webhooks = await this.webhookStore.findWebhooks();
    webhooks.forEach(webhook => this.webhookRunner.add(webhook));
  }

  reload() {
    const state = {
      shouldReload: 0,
    };

    const reload = function() {
      if (state.shouldReload > 0) {
        // Reset the reloading state
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
        // Special state when the reloader is disabled temporarly (see GraphQL plugin example).
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
  }

  async runLifecyclesFunctions(lifecycleName) {
    await this.runPluginLifecycles(lifecycleName);
    await this.runUserLifecycle(lifecycleName);
    await this.runAdminLifecycle(lifecycleName);
  }

  /**
   * Executes lifecycle functions for all plugins
   */
  async runPluginLifecycles(lifecycleName) {
    const configPath = `functions.${lifecycleName}`;

    await Promise.all(
      Object.keys(this.plugins).map(plugin => {
        const pluginFunc = _.get(this