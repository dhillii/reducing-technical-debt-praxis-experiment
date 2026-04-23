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
 * @returns {string} The formatted URL
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
 * @returns {string} The formatted URL with bold port
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
 * @param {string} ipAddress - The IP address to check
 * @returns {boolean} True if the address is private
 */
function isPrivateIp(ipAddress) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
    ipAddress
  );
}

/**
 * Attempts to get the LAN URL configuration.
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

/**
 * Checks if the host is unspecified (0.0.0.0 or ::).
 * @param {string} host - The host to check
 * @returns {boolean} True if host is unspecified
 */
function isUnspecifiedHost(host) {
  return host === '0.0.0.0' || host === '::';
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
 * Prints setup instructions to the console.
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
 * Handles compiler initialization errors.
 * @param {Error} err - The error that occurred
 */
function handleCompilerError(err) {
  console.log(chalk.red('Failed to compile.'));
  console.log();
  console.log(err.message || err);
  console.log();
  process.exit(1);
}

/**
 * Handles the invalid hook event.
 */
function handleInvalidEvent() {
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

  console.log(
    `\nSearch for the ${chalk.underline(chalk.yellow('keywords'))} to learn more about each warning.`
  );
  console.log(
    `To ignore, add ${chalk.cyan('// eslint-disable-next-line')} to the line before.\n`
  );
}

/**
 * Checks if this is a smoke test run.
 * @returns {boolean} True if smoke test flag is present
 */
function isSmokeTestRun() {
  return process.argv.some(arg => arg.indexOf('--smoke-test') > -1);
}

/**
 * Sets up the done hook handler for the compiler.
 * @param {Object} compiler - The webpack compiler
 * @param {string} appName - The application name
 * @param {Object} urls - URL configuration
 * @param {boolean} useYarn - Whether yarn is being used
 * @param {boolean} useTypeScript - Whether TypeScript is enabled
 */
function setupDoneHook(compiler, appName, urls, useYarn, useTypeScript) {
  let isFirstCompile = true;

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
    const isSuccessful = isCompilationSuccessful(messages);

    if (isSuccessful) {
      handleSuccessfulCompilation(messages);
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
}

/**
 * Sets up the invalid hook handler for the compiler.
 * @param {Object} compiler - The webpack compiler
 */
function setupInvalidHook(compiler) {
  compiler.hooks.invalid.tap('invalid', () => {
    handleInvalidEvent();
  });
}

/**
 * Sets up the TypeScript checking hook.
 * @param {Object} compiler - The webpack compiler
 * @param {boolean} useTypeScript - Whether TypeScript is enabled
 */
function setupTypeScriptHook(compiler, useTypeScript) {
  if (!useTypeScript) {
    return;
  }

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
 * @param {Object} compiler - The webpack compiler
 * @param {Promise} tsMessagesPromise - Promise for TypeScript messages
 */
function setupSmokeTestHooks(compiler, tsMessagesPromise) {
  if (!isSmokeTestRun()) {
    return;
  }

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
    handleCompilerError(err);
  }

  setupInvalidHook(compiler);
  setupTypeScriptHook(compiler, useTypeScript);
  setupDoneHook(compiler, appName, urls, useYarn, useTypeScript);

  const tsMessagesPromise = Promise.resolve();
  setupSmokeTestHooks(compiler, tsMessagesPromise);

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
 * @param {string} proxy - The proxy URL
 * @param {Object} req - The request object
 * @param {Error} err - The error object
 * @returns {string} The formatted error message
 */
function formatProxyErrorMessage(proxy, req, err) {
  const host = req.headers && req.headers.host;
  return (
    `${chalk.red('Proxy error:')} Could not proxy request ${chalk.cyan(req.url)} from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`
  );
}

/**
 * Formats proxy error details.
 * @param {Error} err - The error object
 * @returns {string} The error details
 */
function formatProxyErrorDetails(err) {
  return `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(err.code)}).`;
}

/**
 * Formats proxy error response body.
 * @param {string} proxy - The proxy URL
 * @param {Object} req - The request object
 * @param {Error} err - The error object
 * @returns {string} The response body
 */
function formatProxyErrorResponse(proxy, req, err) {
  const host = req.headers && req.headers.host;
  return `Proxy error: Could not proxy request ${req.url} from ${host} to ${proxy} (${err.code}).`;
}

/**
 * Checks if response headers can be sent.
 * @param {Object} res - The response object
 * @returns {boolean} True if headers can be sent
 */
function canSendResponseHeaders(res) {
  return res.writeHead && !res.headersSent;
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const errorMessage = formatProxyErrorMessage(proxy, req, err);
    console.log(errorMessage);

    const errorDetails = formatProxyErrorDetails(err);
    console.log(errorDetails);
    console.log();

    if (canSendResponseHeaders(res)) {
      res.writeHead(500);
    }

    const responseBody = formatProxyErrorResponse(proxy, req, err);
    res.end(responseBody);
  };
}

/**
 * Checks if proxy configuration is valid.
 * @param {*} proxy - The proxy configuration
 * @returns {boolean} True if proxy is a valid string
 */
function isValidProxyConfig(proxy) {
  return typeof proxy === 'string';
}

/**
 * Logs proxy configuration error.
 */
function logProxyConfigError(proxy) {
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

/**
 * Checks if proxy URL has valid protocol.
 * @param {string} proxy - The proxy URL
 * @returns {boolean} True if URL starts with http:// or https://
 */
function hasValidProxyProtocol(proxy) {
  return /^http(s)?:\/\//.test(proxy);
}

/**
 * Logs invalid proxy protocol error.
 */
function logInvalidProxyProtocolError() {
  console.log(
    chalk.red(
      'When "proxy" is specified in package.json it must start with either http:// or https://'
    )
  );
}

/**
 * Gets the target proxy URL, resolving loopback on Windows.
 * @param {string} proxy - The proxy URL
 * @returns {string} The target proxy URL
 */
function getProxyTarget(proxy) {
  if (process.platform === 'win32') {
    return resolveLoopback(proxy);
  }
  return proxy;
}

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }

  if (!isValidProxyConfig(proxy)) {
    logProxyConfigError(proxy);
    process.exit(1);
  }

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

  /**
   * Determines if a pathname should be proxied.
   * @param {string} pathname - The request pathname
   * @returns {boolean} True if the request should be proxied
   */
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

  if (!hasValidProxyProtocol(proxy)) {
    logInvalidProxyProtocolError();
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

/**
 * Checks if the port is the default port.
 * @param {number} port - The port to check
 * @param {number} defaultPort - The default port
 * @returns {boolean} True if port matches default
 */
function isDefaultPort(port, defaultPort) {
  return port === defaultPort;
}

/**
 * Determines the error message for port conflicts.
 * @param {number} defaultPort - The default port
 * @returns {string} The error message
 */
function getPortErrorMessage(defaultPort) {
  const isLowPort = defaultPort < 1024;
  const isWindows = process.platform === 'win32';
  const isRootUser = isRoot();

  if (!isWindows && isLowPort && !isRootUser) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }

  return `Something is already running on port ${defaultPort}.`;
}

/**
 * Handles interactive port selection.
 * @param {number} port - The available port
 * @param {number} defaultPort - The default port
 * @returns {Promise<number|null>} The selected port or null
 */
function handleInteractivePortSelection(port, defaultPort) {
  return new Promise(resolve => {
    clearConsole();
    const message = getPortErrorMessage(defaultPort);
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
 * @param {number} defaultPort - The default port
 * @returns {Promise<null>} Always resolves to null
 */
function handleNonInteractivePortSelection(defaultPort) {
  return new Promise(resolve => {
    const message = getPortErrorMessage(defaultPort);
    console.log(chalk.red(message));
    resolve(null);
  });
}

/**
 * Handles port detection errors.
 * @param {Error} err - The error that occurred
 * @param {string} host - The host being used
 * @throws {Error} Always throws an error
 */
function handlePortDetectionError(err, host) {
  const errorMessage =
    chalk.red(`Could not find an open port at ${chalk.bold(host)}.`) +
    '\n' +
    ('Network error message: ' + (err.message || err)) +
    '\n';
  throw new Error(errorMessage);
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port => {
      if (isDefaultPort(port, defaultPort)) {
        return Promise.resolve(port);
      }

      if (isInteractive) {
        return handleInteractivePortSelection(port, defaultPort);
      }

      return handleNonInteractivePortSelection(defaultPort);
    },
    err => {
      handlePortDetectionError(err, host);
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