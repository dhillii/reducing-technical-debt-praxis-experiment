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

const TABLE_CONFIG = {
  colWidths: [20, 50],
  chars: { mid: '', 'left-mid': '', 'mid-mid': '', 'right-mid': '' },
};

class ServerManager {
  constructor(strapi) {
    this.strapi = strapi;
    this.connections = {};
    this.requestHandler = null;
  }

  init() {
    this.server = http.createServer(this.handleRequest.bind(this));
    this.setupErrorHandling();
    this.setupConnectionTracking();
  }

  setupErrorHandling() {
    this.server.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        this.strapi.stopWithError(`The port ${err.port} is already used by another application.`);
      } else {
        this.strapi.log.error(err);
      }
    });
  }

  setupConnectionTracking() {
    this.server.on('connection', conn => {
      const key = `${conn.remoteAddress}:${conn.remotePort}`;
      this.connections[key] = conn;

      conn.on('close', () => {
        delete this.connections[key];
      });
    });

    this.server.destroy = cb => {
      this.server.close(cb);
      Object.values(this.connections).forEach(conn => conn.destroy());
    };
  }

  handleRequest(req, res) {
    if (!this.requestHandler) {
      this.requestHandler = this.strapi.app.callback();
    }
    return this.requestHandler(req, res);
  }
}

class LoggerService {
  constructor(strapi) {
    this.strapi = strapi;
  }

  getTableWidth() {
    return Math.min(process.stderr.columns, 80) - 2;
  }

  logStats() {
    const columns = this.getTableWidth();
    console.log();
    console.log(chalk.black.bgWhite(_.padEnd(' Project information', columns)));
    console.log();

    const infoTable = new CLITable(TABLE_CONFIG);
    const isEE = this.strapi.EE === true && ee.isEE === true;

    infoTable.push(
      [chalk.blue('Time'), `${new Date()}`],
      [chalk.blue('Launched in'), `${Date.now() - this.strapi.config.launchedAt} ms`],
      [chalk.blue('Environment'), this.strapi.config.environment],
      [chalk.blue('Process PID'), process.pid],
      [chalk.blue('Version'), `${this.strapi.config.info.strapi} (node ${process.version})`],
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
    const adminUrl = getAbsoluteAdminUrl(this.strapi.config);
    addressTable.push([chalk.bold(adminUrl)]);

    console.log(addressTable.toString());
    console.log();
  }

  logStartupMessage() {
    this.logStats();
    console.log(chalk.bold('Welcome back!'));

    if (this.strapi.config.serveAdminPanel === true) {
      console.log(chalk.grey('To manage your project 🚀, go to the administration panel at:'));
      const adminUrl = getAbsoluteAdminUrl(this.strapi.config);
      console.log(chalk.bold(adminUrl));
      console.log();
    }

    console.log(chalk.grey('To access the server ⚡️, go to:'));
    const serverUrl = getAbsoluteServerUrl(this.strapi.config);
    console.log(chalk.bold(serverUrl));
    console.log();
  }
}

class ReloadManager {
  constructor(strapi) {
    this.strapi = strapi;
    this.state = { shouldReload: 0, isWatching: true };
    this.reload = this.createReloadFunction();
  }

  createReloadFunction() {
    const reload = () => {
      if (this.state.shouldReload > 0) {
        this.state.shouldReload -= 1;
        reload.isReloading = false;
        return;
      }

      if (this.strapi.config.autoReload) {
        this.strapi.server.close();
        process.send('reload');
      }
    };

    Object.defineProperty(reload, 'isWatching', {
      configurable: true,
      enumerable: true,
      set: value => {
        if (this.state.isWatching === false && value === true) {
          this.state.shouldReload += 1;
        }
        this.state.isWatching = value;
      },
      get: () => this.state.isWatching,
    });

    reload.isReloading = false;
    reload.isWatching = true;

    return reload;
  }
}

class LifecycleManager {
  constructor(strapi) {
    this.strapi = strapi;
  }

  async run(lifecycleName) {
    await this.runPluginLifecycles(lifecycleName);
    await this.runUserLifecycle(lifecycleName);
    await this.runAdminLifecycle(lifecycleName);
  }

  async runPluginLifecycles(lifecycleName) {
    const configPath = `functions.${lifecycleName}`;

    await Promise.all(
      Object.keys(this.strapi.plugins).map(plugin =>
        this.executeLifecycle(
          _.get(this.strapi.plugins[plugin], `config.${configPath}`),
          `${lifecycleName} function in plugin "${plugin}"`
        )
      )
    );
  }

  async runUserLifecycle(lifecycleName) {
    const configPath = `functions.${lifecycleName}`;
    await this.executeLifecycle(_.get(this.strapi.config, configPath));
  }

  async runAdminLifecycle(lifecycleName) {
    const configPath = `functions.${lifecycleName}`;
    await this.executeLifecycle(
      _.get(this.strapi.admin.config, configPath),
      `${lifecycleName} function in admin`
    );
  }

  async executeLifecycle(fn, errorContext) {
    if (!fn) return;

    try {
      await fn();
    } catch (err) {
      if (errorContext) {
        this.strapi.log.error(errorContext);
      }
      this.strapi.log.error(err);
      this.strapi.stop();
    }
  }
}

class Strapi {
  constructor(opts = {}) {
    this.dir = opts.dir || process.cwd();
    this.config = loadConfiguration(this.dir, opts);

    this.app = new Koa();
    this.app.proxy = this.config.get('server.proxy');
    this.router = new Router();

    this.log = logger;
    this.utils = { models };

    this.admin = {};
    this.plugins = {};
    this.isLoaded = false;

    this.fs = createStrapiFs(this);
    this.eventHub = createEventHub();

    this.serverManager = new ServerManager(this);
    this.serverManager.init();
    this.server = this.serverManager.server;

    this.loggerService = new LoggerService(this);
    this.reloadManager = new ReloadManager(this);
    this.reload = this.reloadManager.reload;

    this.lifecycleManager = new LifecycleManager(this);

    this.requireProjectBootstrap();
    createUpdateNotifier(this).notify();
  }

  get EE() {
    return ee({ dir: this.dir, logger });
  }

  requireProjectBootstrap() {
    const bootstrapPath = path.resolve(this.dir, 'config/functions/bootstrap.js');
    if (fse.existsSync(bootstrapPath)) {
      require(bootstrapPath);
    }
  }

  logStats() {
    this.loggerService.logStats();
  }

  logFirstStartupMessage() {
    this.loggerService.logFirstStartupMessage();
  }

  logStartupMessage() {
    this.loggerService.logStartupMessage();
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

    if (this.telemetry) {
      this.telemetry.destroy();
    }

    delete global.strapi;
  }

  async listen(cb) {
    const onListen = async err => {
      if (err) return this.stopWithError(err);

      const isInitialised = await utils.isInitialised(this);
      const hideStartupMessage = process.env.STRAPI_HIDE_STARTUP_MESSAGE === 'true';

      if (!hideStartupMessage) {
        isInitialised ? this.logStartupMessage() : this.logFirstStartupMessage();
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

      if (
        (this.config.environment === 'development' &&
          this.config.get('server.admin.autoOpen', true) !== false) ||
        !isInitialised
      ) {
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

  stopWithError(err, customMessage) {
    this.log.debug('⛔️ Server wasn\'t able to start properly.');
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

    this.webhookRunner = createWebhookRunner({
      eventHub: this.eventHub,
      logger: this.log,
      configuration: this.config.get('server.webhooks', {}),
    });

    this.models['core_store'] = coreStoreModel(this.config);
    this.models['strapi_webhooks'] = webhookModel(this.config);

    this.db = createDatabaseManager(this);

    await this.lifecycleManager.run(LIFECYCLES.REGISTER);
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

    await this.lifecycleManager.run(LIFECYCLES.BOOTSTRAP);
    await this.freeze();

    this.isLoaded = true;
    return this;
  }

  async startWebhooks() {
    const webhooks = await this.webhookStore.findWebhooks();
    webhooks.forEach(webhook => this.webhookRunner.add(webhook));
  }

  async freeze() {
    Object.freeze(this.config);
    Object.freeze(this.dir);
    Object.freeze(this.admin);
    Object.freeze(this.plugins);
    Object.freeze(this.api);
  }