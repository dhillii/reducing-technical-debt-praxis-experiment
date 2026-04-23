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
    lanUrlForTerminal = extractLanUrl(prettyPrintUrl);
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

/** @returns {string|undefined} LAN URL for terminal or undefined */
function extractLanUrl(prettyPrintUrl) {
  try {
    const lanIp = address.ip();
    if (!lanIp) {
      return undefined;
    }
    if (isPrivateIpAddress(lanIp)) {
      return prettyPrintUrl(lanIp);
    }
  } catch (_e) {
    // ignored
  }
  return undefined;
}

/** @returns {boolean} True if IP is in private address space */
function isPrivateIpAddress(ip) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(ip);
}

function printInstructions(appName, urls, useYarn) {
  console.log();
  console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
  console.log();

  if (urls.lanUrlForTerminal) {
    const localLabel = `  ${chalk.bold('Local:')}            ${urls.localUrlForTerminal}`;
    const networkLabel = `  ${chalk.bold('On Your Network:')}  ${urls.lanUrlForTerminal}`;
    console.log(localLabel);
    console.log(networkLabel);
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

  return compiler;
}

/** Handles and displays compilation errors */
function handleCompilationErrors(messages) {
  if (messages.errors.length > 1) {
    messages.errors.length = 1;
  }
  console.log(chalk.red('Failed to compile.\n'));
  console.log(messages.errors.join('\n\n'));
}

/** Handles and displays compilation warnings */
function handleCompilationWarnings(messages) {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(messages.warnings.join('\n\n'));

  const keywordsLabel = chalk.underline(chalk.yellow('keywords'));
  console.log(
    `\nSearch for the ${keywordsLabel} to learn more about each warning.`
  );
  const disableComment = chalk.cyan('// eslint-disable-next-line');
  console.log(
    `To ignore, add ${disableComment} to the line before.\n`
  );
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

/** Creates error handler for proxy middleware */
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    const errorCode = chalk.cyan(err.code);
    const proxyUrl = chalk.cyan(proxy);
    const requestUrl = chalk.cyan(req.url);
    const hostLabel = chalk.cyan(host);
    
    console.log(
      `${chalk.red('Proxy error:')} Could not proxy request ${requestUrl} from ${hostLabel} to ${proxyUrl}.`
    );
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
    logInvalidProxyUrl();
    process.exit(1);
  }

  const target = process.platform === 'win32' ? resolveLoopback(proxy) : proxy;
  
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

/** @returns {boolean} True if proxy URL has valid protocol */
function isValidProxyUrl(proxy) {
  return /^http(s)?:\/\//.test(proxy);
}

/** Logs proxy type validation error */
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

/** Logs invalid proxy URL error */
function logInvalidProxyUrl() {
  console.log(
    chalk.red(
      'When "proxy" is specified in package.json it must start with either http:// or https://'
    )
  );
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }
        handlePortConflict(port, defaultPort, resolve);
      }),
    err => {
      throw new Error(
        `${chalk.red(`Could not find an open port at ${chalk.bold(host)}.`)}\n` +
          `Network error message: ${err.message || err}\n`
      );
    }
  );
}

/** Handles port conflict resolution */
function handlePortConflict(port, defaultPort, resolve) {
  const message = getPortConflictMessage(defaultPort);
  
  if (isInteractive) {
    clearConsole();
    promptForPortChange(message, resolve, port);
  } else {
    console.log(chalk.red(message));
    resolve(null);
  }
}

/** @returns {string} Message describing port conflict */
function getPortConflictMessage(defaultPort) {
  const isLowPortOnUnix = process.platform !== 'win32' && defaultPort < 1024 && !isRoot();
  if (isLowPortOnUnix) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

/** Prompts user to change port */
function promptForPortChange(message, resolve, port) {
  const existingProcess = getProcessForPort(port);
  const processInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';
  const question = {
    type: 'confirm',
    name: 'shouldChangePort',
    message:
      `${chalk.yellow(message + processInfo)}\n\nWould you like to run the app on another port instead?`,
    initial: true,
  };
  prompts(question).then(answer => {
    if (answer.shouldChangePort) {
      resolve(port);
    } else {
      resolve(null);
    }
  });
}

module.exports = {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
};