```javascript
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
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

/**
 * Formats a URL with the given hostname and protocol/port/pathname.
 * @param {string} hostname - The hostname to use
 * @param {string} protocol - The protocol (http/https)
 * @param {number} port - The port number
 * @param {string} pathname - The pathname
 * @returns {string} Formatted URL
 */
function formatUrl(hostname, protocol, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port,
    pathname,
  });
}

/**
 * Formats a URL with bold port for terminal display.
 * @param {string} hostname - The hostname to use
 * @param {string} protocol - The protocol (http/https)
 * @param {number} port - The port number
 * @param {string} pathname - The pathname
 * @returns {string} Formatted URL with bold port
 */
function prettyPrintUrl(hostname, protocol, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port: chalk.bold(port),
    pathname,
  });
}

/**
 * Checks if the given IP address is private.
 * @param {string} ip - The IP address to check
 * @returns {boolean} True if the IP is private
 */
function isPrivateIp(ip) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(ip);
}

/**
 * Checks if the host is unspecified (0.0.0.0 or ::).
 * @param {string} host - The host to check
 * @returns {boolean} True if host is unspecified
 */
function isUnspecifiedHost(host) {
  return host === '0.0.0.0' || host === '::';
}

/**
 * Gets the LAN URL configuration for unspecified hosts.
 * @returns {string|undefined} The LAN IP address if available and private
 */
function getLanUrlForConfig() {
  try {
    const lanIp = address.ip();
    if (lanIp && isPrivateIp(lanIp)) {
      return lanIp;
    }
  } catch (_e) {
    // ignored
  }
  return undefined;
}

function prepareUrls(protocol, host, port, pathname = '/') {
  let prettyHost;
  let lanUrlForConfig;
  let lanUrlForTerminal;

  if (isUnspecifiedHost(host)) {
    prettyHost = 'localhost';
    lanUrlForConfig = getLanUrlForConfig();
    if (lanUrlForConfig) {
      lanUrlForTerminal = prettyPrintUrl(lanUrlForConfig, protocol, port, pathname);
    }
  } else {
    prettyHost = host;
  }

  const localUrlForTerminal = prettyPrintUrl(prettyHost, protocol, port, pathname);
  const localUrlForBrowser = formatUrl(prettyHost, protocol, port, pathname);

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

/**
 * Prints startup instructions to the console.
 * @param {string} appName - The application name
 * @param {Object} urls - URL configuration object
 * @param {boolean} useYarn - Whether yarn is being used
 */
function printInstructions(appName, urls, useYarn) {
  console.log();
  console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
  console.log();

  if (urls.lanUrlForTerminal) {
    console.log(
      `  ${chalk.bold('Local:')}            ${urls.localUrlForTerminal}`
    );
    console.log(
      `  ${chalk.bold('On Your Network:')}  ${urls.lanUrlForTerminal}`
    );
  } else {
    console.log(`  ${urls.localUrlForTerminal}`);
  }

  console.log();
  console.log('Note that the development build is not optimized.');
  const buildCommand = useYarn ? 'yarn' : 'npm run';
  console.log(
    `To create a production build, use ${chalk.cyan(`${buildCommand} build`)}.`
  );
  console.log();
}

/**
 * Handles the invalid hook for webpack compiler.
 */
function handleCompilerInvalid() {
  if (isInteractive) {
    clearConsole();
  }
  console.log('Compiling...');
}

/**
 * Checks if compilation was successful.
 * @param {Object} messages - Formatted webpack messages
 * @returns {boolean} True if no errors or warnings
 */
function isCompilationSuccessful(messages) {
  return !messages.errors.length && !messages.warnings.length;
}

/**
 * Handles successful compilation output.
 * @param {Object} messages - Formatted webpack messages
 */
function handleSuccessfulCompilation(messages) {
  console.log(chalk.green('Compiled successfully!'));
}

/**
 * Handles compilation errors.
 * @param {Object} messages - Formatted webpack messages
 */
function handleCompilationErrors(messages) {
  if (messages.errors.length > 1) {
    messages.errors.length = 1;
  }
  console.log(chalk.red('Failed to compile.\n'));
  console.log(messages.errors.join('\n\n'));
}

/**
 * Handles compilation warnings.
 * @param {Object} messages - Formatted webpack messages
 */
function handleCompilationWarnings(messages) {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(messages.warnings.join('\n\n'));

  const keywordText = chalk.underline(chalk.yellow('keywords'));
  console.log(
    `\nSearch for the ${keywordText} to learn more about each warning.`
  );
  const disableText = chalk.cyan('// eslint-disable-next-line');
  console.log(
    `To ignore, add ${disableText} to the line before.\n`
  );
}

/**
 * Processes done hook for webpack compiler.
 * @param {Object} params - Parameters object
 * @param {string} params.appName - Application name
 * @param {Object} params.urls - URL configuration
 * @param {boolean} params.useYarn - Whether yarn is used
 * @param {boolean} params.isFirstCompile - Whether this is the first compile
 * @returns {Function} Done hook handler
 */
function createDoneHandler({ appName, urls, useYarn, isFirstCompile }) {
  return async stats => {
    if (isInteractive) {
      clearConsole();
    }

    const statsData = stats.toJson({
      all: false,
      warnings: true,
      errors: true,
    });

    const messages = formatWebpackMessages(statsData);
    const successful = isCompilationSuccessful(messages);

    if (successful) {
      handleSuccessfulCompilation(messages);
    }

    if (successful && (isInteractive || isFirstCompile)) {
      printInstructions(appName, urls, useYarn);
    }

    if (messages.errors.length) {
      handleCompilationErrors(messages);
      return;
    }

    if (messages.warnings.length) {
      handleCompilationWarnings(messages);
    }
  };
}

/**
 * Checks if running in smoke test mode.
 * @returns {boolean} True if smoke test flag is present
 */
function isSmokeTestMode() {
  return process.argv.some(arg => arg.indexOf('--smoke-test') > -1);
}

/**
 * Sets up TypeScript checking hooks.
 * @param {Object} compiler - Webpack compiler instance
 */
function setupTypeScriptHooks(compiler) {
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

/**
 * Sets up smoke test hooks.
 * @param {Object} compiler - Webpack compiler instance
 * @param {Promise} tsMessagesPromise - TypeScript messages promise
 */
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

  compiler.hooks.invalid.tap('invalid', handleCompilerInvalid);

  let isFirstCompile = true;
  let tsMessagesPromise;

  if (useTypeScript) {
    setupTypeScriptHooks(compiler);
  }

  const doneHandler = createDoneHandler({ appName, urls, useYarn, isFirstCompile });
  compiler.hooks.done.tap('done', async stats => {
    await doneHandler(stats);
    isFirstCompile = false;
  });

  if (isSmokeTestMode()) {
    setupSmokeTestHooks(compiler, tsMessagesPromise);
  }

  return compiler;
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

/**
 * Formats proxy error message.
 * @param {string} proxy - Proxy URL
 * @param {string} url - Request URL
 * @param {string} host - Request host
 * @param {Object} err - Error object
 * @returns {string} Formatted error message
 */
function formatProxyErrorMessage(proxy, url, host, err) {
  const proxyErrorPrefix = chalk.red('Proxy error:');
  const couldNotProxy = 'Could not proxy request';
  const fromText = 'from';
  const toText = 'to';

  return (
    `${proxyErrorPrefix} ${couldNotProxy} ${chalk.cyan(url)} ${fromText} ` +
    `${chalk.cyan(host)} ${toText} ${chalk.cyan(proxy)}.`
  );
}

/**
 * Formats proxy error response.
 * @param {string} url - Request URL
 * @param {string} host - Request host
 * @param {string} proxy - Proxy URL
 * @param {string} errorCode - Error code
 * @returns {string} Formatted error response
 */
function formatProxyErrorResponse(url, host, proxy, errorCode) {
  return (
    `Proxy error: Could not proxy request ${url} from ${host} to ${proxy} ` +
    `(${errorCode}).`
  );
}

/**
 * Creates proxy error handler.
 * @param {string} proxy - Proxy URL
 * @returns {Function} Error handler function
 */
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;

    const errorMessage = formatProxyErrorMessage(proxy, req.url, host, err);
    console.log(errorMessage);

    const errorCodeMessage = (
      'See https://nodejs.org/api/errors.html#errors_common_system_errors for more information ' +
      `(${chalk.cyan(err.code)}).`
    );
    console.log(errorCodeMessage);
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }

    const responseBody = formatProxyErrorResponse(req.url, host, proxy, err.code);
    res.end(responseBody);
  };
}

/**
 * Validates proxy configuration.
 * @param {*} proxy - Proxy value to validate
 * @returns {boolean} True if proxy is valid
 */
function isValidProxyConfig(proxy) {
  if (!proxy) {
    return false;
  }
  if (typeof proxy !== 'string') {
    console.log(
      chalk.red('When specified, "proxy" in package.json must be a string.')
    );
    console.log(
      chalk.red(`Instead, the type of "proxy" was "${typeof proxy}".`)
    );
    console.log(
      chalk.red('Either remove "proxy" from package.json, or make it a string.')
    );
    process.exit(1);
  }
  return true;
}

/**
 * Validates proxy URL format.
 * @param {string} proxy - Proxy URL to validate
 * @returns {boolean} True if proxy URL is valid
 */
function isValidProxyUrl(proxy) {
  if (!/^http(s)?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }
  return true;
}

/**
 * Gets the target proxy URL based on platform.
 * @param {string} proxy - Proxy URL
 * @returns {string} Target proxy URL
 */
function getProxyTarget(proxy) {
  if (process.platform === 'win32') {
    return resolveLoopback(proxy);
  }
  return proxy;
}

/**
 * Checks if a pathname should be proxied.
 * @param {string} pathname - Request pathname
 * @param {string} appPublicFolder - Public folder path
 * @param {string} servedPathname - Served pathname
 * @param {string} sockPath - WebSocket path
 * @param {boolean} isDefaultSockHost - Whether using default socket host
 * @returns {boolean} True if pathname should be proxied
 */
function shouldProxyPath(pathname, appPublicFolder, servedPathname, sockPath, isDefaultSockHost) {
  const maybePublicPath = path.resolve(
    appPublicFolder,
    pathname.replace(new RegExp('^' + servedPathname), '')
  );
  const isPublicFileRequest = fs.existsSync(maybePublicPath);
  const isWdsEndpointRequest = isDefaultSockHost && pathname.startsWith(sockPath);
  return !(isPublicFileRequest || isWdsEndpointRequest);
}

/**
 * Creates proxy context function.
 * @param {string} appPublicFolder - Public folder path
 * @param {string} servedPathname - Served pathname
 * @param {string} sockPath - WebSocket path
 * @param {boolean} isDefaultSockHost - Whether using default socket host
 * @returns {Function} Context function for proxy middleware
 */
function createProxyContext(appPublicFolder, servedPathname, sockPath, isDefaultSockHost) {
  return (pathname, req) => {
    const isGetRequest = req.method === 'GET';
    if (!isGetRequest) {
      return true;
    }

    const shouldProxy = shouldProxyPath(pathname, appPublicFolder, servedPathname, sockPath, isDefaultSockHost);
    const acceptsHtml = req.headers.accept && req.headers.accept.indexOf('text/html') !== -1;

    return shouldProxy && !acceptsHtml;
  };
}

/**
 * Creates proxy request handler.
 * @param {string} target - Target proxy URL
 * @returns {Function} Proxy request handler
 */
function createProxyReqHandler(target) {
  return proxyReq => {
    if (proxyReq.getHeader('origin')) {
      proxyReq.setHeader('origin', target);
    }
  };
}

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!isValidProxyConfig(proxy)) {
    return undefined;
  }

  if (!isValidProxyUrl(proxy)) {
    return undefined;
  }

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;
  const target = getProxyTarget(proxy);

  return [
    {
      target,
      logLevel: 'silent',
      context: createProxyContext(appPublicFolder, servedPathname, sockPath, isDefaultSockHost),
      onProxyReq: createProxyReqHandler(target),
      onError: onProxyError(target),
      secure: false,
      changeOrigin: true,
      ws: true,
      xfwd: true,
    },
  ];
}

/**
 * Determines the error message for port selection.
 * @param {number} defaultPort - Default port number
 * @returns {string} Error message
 */
function getPortErrorMessage(defaultPort) {
  const isWindowsPlatform = process.platform === 'win32';
  const isLowPort = defaultPort < 1024;
  const isRootUser = isRoot();

  if (!isWindowsPlatform && isLowPort && !isRootUser) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }

  return `Something is already running on port ${defaultPort}.`;
}

/**
 * Handles interactive port selection.
 * @param {number} defaultPort - Default port number
 * @param {number} port - Available port number
 * @param {string} message - Error message
 * @returns {Promise<number|null>} Selected port or null
 */
function handleInteractivePortSelection(defaultPort, port, message) {
  return new Promise(resolve => {
    clearConsole();
    const existingProcess = getProcessForPort(defaultPort);
    const processInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';

    const question = {
      type: 'confirm',
      name: 'shouldChangePort',
      message:
        chalk.yellow(message + processInfo) +
        '\n\nWould you like to run the app on another port instead?',
      initial: true,
    };

    prompts(question).then(answer => {
      if (answer.shouldChangePort) {
        resolve(port);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Handles non-interactive port selection.
 * @param {string} message - Error message
 * @returns {Promise<null>} Always resolves to null
 */
function handleNonInteractivePortSelection(message) {
  return new Promise(resolve => {
    console.log(chalk.red(message));
    resolve(null);
  });
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port => {
      if (port === defaultPort) {
        return Promise.resolve(port);
      }

      const message = getPortErrorMessage(defaultPort);

      if (isInteractive) {
        return handleInteractivePortSelection(defaultPort, port, message);
      }

      return handleNonInteractivePortSelection(message);
    },
    err => {
      const errorMessage = (
        chalk.red(`Could not find an open port at ${chalk.bold(host)}.`) +
        '\n' +
        `Network error message: ${err.message || err}` +
        '\n'
      );
      throw new Error(errorMessage);
    }
  );
}

module.exports = {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
};
```