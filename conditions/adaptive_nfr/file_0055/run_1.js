'use strict';

const address = require('address');
const fs = require('fs');
const path = require('path');
const url = require('url');
const chalk = require('chalk');
const detect = require('detect-port-alt');
const isRoot = require('is-root');
const prompts = require('prompts');
const clearConsole = require('./clearConsole');
const formatWebpackMessages = require('./formatWebpackMessages');
const getProcessForPort = require('./getProcessForPort');
const forkTsCheckerWebpackPlugin = require('./ForkTsCheckerWebpackPlugin');

const isInteractive = process.stdout.isTTY;

function prepareUrls(protocol, host, port, pathname = '/') {
  const formatUrl = hostname =>
    url.format({
      protocol,
      hostname,
      port,
      pathname,
    });
  const prettyPrintUrl = hostname =>
    url.format({
      protocol,
      hostname,
      port: chalk.bold(port),
      pathname,
    });

  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  let prettyHost, lanUrlForConfig, lanUrlForTerminal;
  
  if (isUnspecifiedHost) {
    prettyHost = 'localhost';
    lanUrlForTerminal = getLanUrlForTerminal(prettyPrintUrl);
    lanUrlForConfig = getLanUrlForConfig();
  } else {
    prettyHost = host;
  }
  
  const localUrlForTerminal = prettyPrintUrl(prettyHost);
  const localUrlForBrowser = formatUrl(prettyHost);
  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

/** @returns {string|undefined} LAN URL for terminal display */
function getLanUrlForTerminal(prettyPrintUrl) {
  const lanIp = getLanUrlForConfig();
  if (!lanIp) {
    return undefined;
  }
  return prettyPrintUrl(lanIp);
}

/** @returns {string|undefined} LAN IP address if private */
function getLanUrlForConfig() {
  try {
    const lanIp = address.ip();
    if (!lanIp) {
      return undefined;
    }
    if (isPrivateIpAddress(lanIp)) {
      return lanIp;
    }
    return undefined;
  } catch (_e) {
    return undefined;
  }
}

/** @param {string} ip - IP address to check */
function isPrivateIpAddress(ip) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(ip);
}

function printInstructions(appName, urls, useYarn) {
  console.log();
  console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
  console.log();

  if (urls.lanUrlForTerminal) {
    const localLabel = chalk.bold('Local:');
    const networkLabel = chalk.bold('On Your Network:');
    console.log(`  ${localLabel}            ${urls.localUrlForTerminal}`);
    console.log(`  ${networkLabel}  ${urls.lanUrlForTerminal}`);
  } else {
    console.log(`  ${urls.localUrlForTerminal}`);
  }

  console.log();
  console.log('Note that the development build is not optimized.');
  const buildCommand = useYarn ? 'yarn' : 'npm run';
  const buildMessage = `To create a production build, use ${chalk.cyan(`${buildCommand} build`)}.`;
  console.log(buildMessage);
  console.log();
}

function createCompiler({
  appName,
  config,
  urls,
  useYarn,
  useTypeScript,
  webpack,
}) {
  let compiler;
  try {
    compiler = webpack(config);
  } catch (err) {
    console.log(chalk.red('Failed to compile.'));
    console.log();
    console.log(err.message || err);
    console.log();
    process.exit(1);
  }

  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });

  let isFirstCompile = true;
  let tsMessagesPromise;

  if (useTypeScript) {
    forkTsCheckerWebpackPlugin
      .getCompilerHooks(compiler)
      .waiting.tap('awaitingTypeScriptCheck', () => {
        console.log(
          chalk.yellow(
            'Files successfully emitted, waiting for typecheck results...'
          )
        );
      });
  }

  compiler.hooks.done.tap('done', async stats => {
    if (isInteractive) {
      clearConsole();
    }

    const statsData = stats.toJson({
      all: false,
      warnings: true,
      errors: true,
    });

    const messages = formatWebpackMessages(statsData);
    const isSuccessful = !messages.errors.length && !messages.warnings.length;
    
    if (isSuccessful) {
      console.log(chalk.green('Compiled successfully!'));
    }
    if (isSuccessful && (isInteractive || isFirstCompile)) {
      printInstructions(appName, urls, useYarn);
    }
    isFirstCompile = false;

    if (messages.errors.length) {
      handleCompilationErrors(messages);
      return;
    }

    if (messages.warnings.length) {
      handleCompilationWarnings(messages);
    }
  });

  const isSmokeTest = process.argv.some(
    arg => arg.indexOf('--smoke-test') > -1
  );
  if (isSmokeTest) {
    setupSmokeTestHooks(compiler, tsMessagesPromise);
  }

  return compiler;
}

/** @param {Object} messages - Formatted webpack messages */
function handleCompilationErrors(messages) {
  if (messages.errors.length > 1) {
    messages.errors.length = 1;
  }
  console.log(chalk.red('Failed to compile.\n'));
  console.log(messages.errors.join('\n\n'));
}

/** @param {Object} messages - Formatted webpack messages */
function handleCompilationWarnings(messages) {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(messages.warnings.join('\n\n'));

  const keywordsLabel = chalk.underline(chalk.yellow('keywords'));
  console.log(
    `\nSearch for the ${keywordsLabel} to learn more about each warning.`
  );
  
  const eslintDisable = chalk.cyan('// eslint-disable-next-line');
  console.log(
    `To ignore, add ${eslintDisable} to the line before.\n`
  );
}

/** @param {Object} compiler - Webpack compiler instance */
function setupSmokeTestHooks(compiler, tsMessagesPromise) {
  compiler.hooks.failed.tap('smokeTest', async () => {
    await tsMessagesPromise;
    process.exit(1);
  });
  compiler.hooks.done.tap('smokeTest', async stats => {
    await tsMessagesPromise;
    if (stats.hasErrors() || stats.hasWarnings()) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  });
}

function resolveLoopback(proxy) {
  const o = url.parse(proxy);
  o.host = undefined;
  if (o.hostname !== 'localhost') {
    return proxy;
  }

  try {
    if (!address.ip()) {
      o.hostname = '127.0.0.1';
    }
  } catch (_ignored) {
    o.hostname = '127.0.0.1';
  }
  return url.format(o);
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    const proxyErrorLabel = chalk.red('Proxy error:');
    const requestUrl = chalk.cyan(req.url);
    const hostLabel = chalk.cyan(host);
    const proxyLabel = chalk.cyan(proxy);
    
    console.log(
      `${proxyErrorLabel} Could not proxy request ${requestUrl} from ${hostLabel} to ${proxyLabel}.`
    );
    
    const errorCode = chalk.cyan(err.code);
    console.log(
      `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${errorCode}).`
    );
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    
    const errorMessage = `Proxy error: Could not proxy request ${req.url} from ${host} to ${proxy} (${err.code}).`;
    res.end(errorMessage);
  };
}

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }
  
  if (typeof proxy !== 'string') {
    logProxyTypeError(proxy);
    process.exit(1);
  }

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;
  
  function mayProxy(pathname) {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp('^' + servedPathname), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest =
      isDefaultSockHost && pathname.startsWith(sockPath);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  }

  if (!isValidProxyUrl(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }

  const target = getProxyTarget(proxy);
  
  return [
    {
      target,
      logLevel: 'silent',
      context: function (pathname, req) {
        return (
          req.method !== 'GET' ||
          (mayProxy(pathname) &&
            req.headers.accept &&
            req.headers.accept.indexOf('text/html') === -1)
        );
      },
      onProxyReq: proxyReq => {
        if (proxyReq.getHeader('origin')) {
          proxyReq.setHeader('origin', target);
        }
      },
      onError: onProxyError(target),
      secure: false,
      changeOrigin: true,
      ws: true,
      xfwd: true,
    },
  ];
}

/** @param {string} proxy - Proxy URL to validate */
function isValidProxyUrl(proxy) {
  return /^http(s)?:\/\//.test(proxy);
}

/** @param {string} proxy - Proxy URL */
function getProxyTarget(proxy) {
  if (process.platform === 'win32') {
    return resolveLoopback(proxy);
  }
  return proxy;
}

/** @param {*} proxy - Proxy value from package.json */
function logProxyTypeError(proxy) {
  console.log(
    chalk.red('When specified, "proxy" in package.json must be a string.')
  );
  console.log(
    chalk.red(`Instead, the type of "proxy" was "${typeof proxy}".`)
  );
  console.log(
    chalk.red('Either remove "proxy" from package.json, or make it a string.')
  );
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }
        handlePortInUse(port, defaultPort, resolve);
      }),
    err => {
      throw new Error(
        `${chalk.red(`Could not find an open port at ${chalk.bold(host)}.`)}\nNetwork error message: ${err.message || err}\n`
      );
    }
  );
}

/** @param {number} port - Available port */
function handlePortInUse(port, defaultPort, resolve) {
  const message = getPortInUseMessage(defaultPort);
  
  if (isInteractive) {
    clearConsole();
    const existingProcess = getProcessForPort(defaultPort);
    const processInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';
    const question = {
      type: 'confirm',
      name: 'shouldChangePort',
      message:
        chalk.yellow(message + processInfo) + '\n\nWould you like to run the app on another port instead?',
      initial: true,
    };
    prompts(question).then(answer => {
      if (answer.shouldChangePort) {
        resolve(port);
      } else {
        resolve(null);
      }
    });
  } else {
    console.log(chalk.red(message));
    resolve(null);
  }
}

/** @param {number} defaultPort - Port number */
function getPortInUseMessage(defaultPort) {
  const isLowPortOnNonWindows = process.platform !== 'win32' && defaultPort < 1024 && !isRoot();
  if (isLowPortOnNonWindows) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

module.exports = {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
};