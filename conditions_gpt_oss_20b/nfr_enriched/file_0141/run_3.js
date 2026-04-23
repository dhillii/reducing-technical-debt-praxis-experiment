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

class Strapi {
  constructor(opts = {}) {
    this.reload = this.reload();

    this.app = new Koa();
    this.router = new Router();

    this.initServer();
    this.initLogger();
    this.initUtils();
    this.initConfig(opts);
    this.initServices();

    this.isLoaded = false;
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
    this.server.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        return this.stopWithError(`The port ${err.port} is already used by another application.`);
      }
      this.log.error(err);
    });

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
      for (const key in connections) {
        connections[key].destroy();
      }
    };
  }

  initLogger() {
    this.log = logger;
  }

  initUtils() {
    this.utils = { models };
  }

  initConfig(opts) {
    this.dir = opts.dir || process.cwd();
    this.config = loadConfiguration(this.dir, opts);
    this.app.proxy = this.config.get('server.proxy');
    this.requireProjectBootstrap();
    createUpdateNotifier(this).notify();
  }

  initServices() {
    this.fs = createStrapiFs(this);
    this.eventHub = createEventHub();
    this.models = {};
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

  async listen(cb) {
    const onListen = async err => {
      if (err) return this.stopWithError(err);
      await this.onListenHandler();
      if (cb && typeof cb === 'function') cb();
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

  async onListenHandler() {
    const isInitialised = utils.isInitialised(this);
    const hideStartupMessage =
      process.env.STRAPI_HIDE_STARTUP_MESSAGE === 'true' ? true : false;

    if (!hideStartupMessage) {
      if (!isInitialised) {
        this.logFirstStartupMessage();
      } else {
        this.logStartupMessage();
      }
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

    if (
      (this.config.environment === 'development' &&
        this.config.get('server.admin.autoOpen', true) !== false) ||
      !isInitialised
    ) {
      await utils.openBrowser.call(this);
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

    await this.loadModulesAndSet();
    await this.bootstrapApp();
    this.initWebhookRunner();
    this.initStores();
    this.initDatabase();
    await this.runRegisterLifecycles();
    await this.db.initialize();
    this.initStore();
    this.initWebhookStore();
    await this.startWebhooks();
    this.entityValidator = entityValidator;
    this.initEntityService();
    this.initTelemetry();
    await initializeMiddlewares.call(this);
    await initializeHooks.call(this);
    await this.runBootstrapLifecycles();
    await this.freezeConfig();
    this.isLoaded = true;
    return this;
  }

  async loadModulesAndSet() {
    const modules = await loadModules(this);
    this.api = modules.api;
    this.admin = modules.admin;
    this.components = modules.components;
    this.plugins = modules.plugins;
    this.middleware = modules.middlewares;
    this.hook = modules.hook;
  }

  async bootstrapApp() {
    await bootstrap(this);
  }

  initWebhookRunner() {
    this.webhookRunner = createWebhookRunner({
      eventHub: this.eventHub,
      logger: this.log,
      configuration: this.config.get('server.webhooks', {}),
    });
  }

  initStores() {
    this.models['core_store'] = coreStoreModel(this.config);
    this.models['strapi_webhooks'] = webhookModel(this.config);
  }

  initDatabase() {
    this.db = createDatabaseManager(this);
  }

  async runRegisterLifecycles() {
    await this.runLifecyclesFunctions(LIFECYCLES.REGISTER);
  }

  initStore() {
    this.store = createCoreStore({
      environment: this.config.environment,
      db: this.db,
    });
  }

  initWebhookStore() {
    this.webhookStore = createWebhookStore({ db: this.db });
  }

  async startWebhooks() {
    const webhooks = await this.webhookStore.findWebhooks();
    webhooks.forEach(webhook => this.webhookRunner.add(webhook));
  }

  initEntityService() {
    this.entityService = createEntityService({
      db: this.db,
      eventHub: this.eventHub,
      entityValidator: this.entityValidator,
    });
  }

  initTelemetry() {
    this.telemetry = createTelemetry(this);
  }

  async runBootstrapLifecycles() {
    await this.runLifecyclesFunctions(LIFECYCLES.BOOTSTRAP);
  }

  async freezeConfig() {
    Object.freeze(this.config);
    Object.freeze(this.dir);
    Object.freeze(this.admin);
    Object.freeze(this.plugins);
    Object.freeze(this.api);
  }

  async runLifecyclesFunctions(lifecycleName) {
    await this.runPluginLifecycles(lifecycleName);
    await this.runUserLifecycle(lifecycleName);
    await this.runAdminLifecycle(lifecycleName);
  }

  async runPluginLifecycles(lifecycleName) {
    const configPath = `functions.${lifecycleName}`;
    await Promise.all(
      Object.keys(this.plugins).map(async plugin => {
        const pluginFunc = _.get(this.plugins[plugin], `config.${configPath}`);
        await this.execLifecycle(pluginFunc, `plugin "${plugin}"`);
      })
    );
  }

  async runUserLifecycle(lifecycleName) {
    const configPath = `functions.${lifecycleName}`;
    const userFunc = _.get(this.config, configPath);
    await this.execLifecycle(userFunc, 'user');
  }

  async runAdminLifecycle(lifecycleName) {
    const configPath = `functions.${lifecycleName}`;
    const adminFunc = _.get(this.admin.config, configPath);
    await this.execLifecycle(adminFunc, 'admin');
  }

  async execLifecycle(fn, context) {
    if (!fn) return;
    try {
      await fn();
    } catch (err) {
      this.log.error(`${lifecycleName} function in ${context} failed`);
      this.log.error(err);
      this.stop();
    }
  }

  async destroy() {
    await this.destroyServer();
    await this.destroyPlugins();
    await this.destroyAdmin();
    this.destroyEventHub();
    await this.destroyDb();
    this.destroyTelemetry();
    this.cleanupGlobal();
  }

  async destroyServer() {
    if (_.has(this, 'server.destroy')) {
      await new Promise(res => this.server.destroy(res));
    }
  }

  async destroyPlugins() {
    await Promise.all(
      Object.values(this.plugins).map(plugin => {
        if (_.has(plugin, 'destroy') && typeof plugin.destroy === 'function') {
          return plugin.destroy();
        }
      })
    );
  }

  async destroyAdmin() {
    if (_.has(this, 'admin')) {
      await this.admin.destroy();
    }
  }

  destroyEventHub() {
    this.eventHub.removeAllListeners();
  }

  async destroyDb() {
    if (_.has(this, 'db')) {
      await this.db.destroy();
    }
  }

  destroyTelemetry() {
    this.telemetry.destroy();
  }

  cleanupGlobal() {
    delete global.strapi;
  }

  getModel(modelKey, plugin) {
    return this.db.getModel(modelKey, plugin);
  }

  query(entity, plugin) {
    return this.db.query(entity, plugin);
  }
}

module.exports = options => {
  const strapi = new Strapi(options);
  global.strapi = strapi;
  return strapi;
};