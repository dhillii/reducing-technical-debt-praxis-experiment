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

  initialize() {
    this.server = http.createServer(this.handleRequest.bind(this));
    this.attachErrorHandler();
    this.attachConnectionHandler();
    this.attachDestroyMethod();
  }

  attachErrorHandler() {
    this.server.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        return this.strapi.stopWithError(
          `The port ${err.port} is already used by another application.`
        );
      }
      this.strapi.log.error(err);
    });
  }

  attachConnectionHandler() {
    this.server.on('connection', conn => {
      const key = `${conn.remoteAddress}:${conn.remotePort}`;
      this.connections[key] = conn;
      conn.on('close', () => delete this.connections[key]);
    });
  }

  attachDestroyMethod() {
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

  async destroy() {
    return new Promise(resolve => this.server.destroy(resolve));
  }
}

class ReloadManager {
  constructor(config) {
    this.config = config;
    this.state = { shouldReload: 0, isWatching: true };
    this.isReloading = false;
  }

  createReloadFunction() {
    const reload = () => {
      if (this.state.shouldReload > 0) {
        this.state.shouldReload -= 1;
        this.isReloading = false;
        return;
      }

      if (this.config.autoReload) {
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
    return reload;
  }
}

class LoggerService {
  constructor(config) {
    this.config = config;
  }

  getTableWidth() {
    return Math.min(process.stderr.columns, 80) - 2;
  }

  logStats() {
    const width = this.getTableWidth();
    console.log();
    console.log(chalk.black.bgWhite(_.padEnd(' Project information', width)));
    console.log();

    const table = new CLITable(TABLE_CONFIG);
    const isEE = global.strapi?.EE === true && ee.isEE === true;

    table.push(
      [chalk.blue('Time'), `${new Date()}`],
      [chalk.blue('Launched in'), `${Date.now() - this.config.launchedAt} ms`],
      [chalk.blue('Environment'), this.config.environment],
      [chalk.blue('Process PID'), process.pid],
      [chalk.blue('Version'), `${this.config.info.strapi} (node ${process.version})`],
      [chalk.blue('Edition'), isEE ? 'Enterprise' : 'Community']
    );

    console.log(table.toString());
    console.log();
    console.log(chalk.black.bgWhite(_.padEnd(' Actions available', width)));
    console.log();
  }

  logFirstStartupMessage() {
    this.logStats();
    console.log(chalk.bold('One more thing...'));
    console.log(
      chalk.grey('Create your first administrator 💻 by going to the administration panel at:')
    );
    console.log();

    const table = new CLITable();
    const adminUrl = getAbsoluteAdminUrl(this.config);
    table.push([chalk.bold(adminUrl)]);
    console.log(table.toString());
    console.log();
  }

  logStartupMessage() {
    this.logStats();
    console.log(chalk.bold('Welcome back!'));

    if (this.config.serveAdminPanel === true) {
      console.log(chalk.grey('To manage your project 🚀, go to the administration panel at:'));
      console.log(chalk.bold(getAbsoluteAdminUrl(this.config)));
      console.log();
    }

    console.log(chalk.grey('To access the server ⚡️, go to:'));
    console.log(chalk.bold(getAbsoluteServerUrl(this.config)));
    console.log();
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
      Object.keys(this.strapi.plugins).map(pluginName =>
        this.executeLifecycle(
          _.get(this.strapi.plugins[pluginName], `config.${configPath}`),
          `${lifecycleName} function in plugin "${pluginName}" failed`
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
      `${lifecycleName} function in admin failed`
    );
  }

  async executeLifecycle(fn, errorMessage) {
    if (!fn) return;

    try {
      await fn();
    } catch (err) {
      if (errorMessage) {
        this.strapi.log.error(errorMessage);
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
    this.serverManager.initialize();
    this.server = this.serverManager.server;

    this.reload = new ReloadManager(this.config).createReloadFunction();
    this.loggerService = new LoggerService(this.config);
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
      await this.serverManager.destroy();
    }

    await Promise.all(
      Object.values(this.plugins).map(plugin => {
        if (_.isFunction(plugin.destroy)) {
          return plugin.destroy();
        }
      })
    );

    if (_.has(this, 'admin') && _.isFunction(this.admin.destroy)) {
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
      const hideStartupMessage =
        process.env.STRAPI_HIDE_STARTUP_MESSAGE === 'true';

      if (!hideStartupMessage) {
        isInitialised
          ? this.loggerService.logStartupMessage()
          : this.loggerService.logFirstStartupMessage();
      }

      const databaseClients = _.map(
        this.config.get('connections'),
        _.property('settings.client')
      );

      await this.telemetry.send('didStartServer', {
        database: databaseClients,
        plugins: this.config.installedPlugins,
        providers: this.config.installedProviders,
      });

      if (_.isFunction(cb)) {
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
    Object.assign(this, {
      api: modules.api,
      admin: modules.admin,
      components: modules.components,
      plugins: modules.plugins,
      middleware: modules.middlewares,
      hook: modules.hook,
    });

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

  async runLifecyclesFunctions(lifecycleName) {
    return this.lifecycleManager.run(lifecycleName);
  }

  async freeze() {
    [this.config, this.dir, this.admin, this.plugins, this.api].forEach(obj => {
      Object.freeze(obj);
    });
  }

  getModel(modelKey, plugin) {
    return this.db.getModel(modelKey, plugin);
  }

  query(entity, plugin) {
    return this.db.query(entity, plugin);
  }
}

module.exports = options => {
  const strapi = new Str