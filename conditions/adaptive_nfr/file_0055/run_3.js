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
 * Attempts to get the LAN URL configuration.
 * @returns {string|undefined} The LAN IP address if it's private, undefined otherwise
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
 * Handles webpack compilation errors.
 * @param {Object} err - The error object
 */
function handleCompilationError(err) {
  console.log(chalk.red('Failed to compile.'));
  console.log();
  console.log(err.message || err);
  console.log();
  process.exit(1);
}

/**
 * Sets up the invalid hook for the compiler.
 * @param {Object} compiler - The webpack compiler
 */
function setupInvalidHook(compiler) {
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });
}

/**
 * Sets up TypeScript checking hooks.
 * @param {Object} compiler - The webpack compiler
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
 * Checks if the current process is a smoke test.
 * @returns {boolean} True if running as smoke test
 */
function isSmokeTest() {
  return process.argv.some(arg => arg.indexOf('--smoke-test') > -1);
}

/**
 * Sets up smoke test hooks.
 * @param {Object} compiler - The webpack compiler
 * @param {Promise} tsMessagesPromise - Promise for TypeScript messages
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
 * @param {boolean} isSuccessful - Whether compilation was successful
 * @param {string} appName - Application name
 * @param {Object} urls - Prepared URLs
 * @param {boolean} useYarn - Whether using yarn
 * @param {boolean} isFirstCompile - Whether this is the first compilation
 */
function handleSuccessfulCompilation(
  messages,
  isSuccessful,
  appName,
  urls,
  useYarn,
  isFirstCompile
) {
  if (isSuccessful) {
    console.log(chalk.green('Compiled successfully!'));
  }
  if (isSuccessful && (isInteractive || isFirstCompile)) {
    printInstructions(appName, urls, useYarn);
  }
}

/**
 * Handles compilation errors output.
 * @param {Object} messages - Formatted webpack messages
 */
function handleCompilationErrors(messages) {
  if (messages.errors.length <= 1) {
    console.log(chalk.red('Failed to compile.\n'));
    console.log(messages.errors.join('\n\n'));
    return;
  }

  messages.errors.length = 1;
  console.log(chalk.red('Failed to compile.\n'));
  console.log(messages.errors.join('\n\n'));
}

/**
 * Handles compilation warnings output.
 * @param {Object} messages - Formatted webpack messages
 */
function handleCompilationWarnings(messages) {
  if (!messages.warnings.length) {
    return;
  }

  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(messages.warnings.join('\n\n'));

  console.log(
    '\nSearch for the ' +
      chalk.underline(chalk.yellow('keywords')) +
      ' to learn more about each warning.'
  );
  console.log(
    'To ignore, add ' +
      chalk.cyan('// eslint-disable-next-line') +
      ' to the line before.\n'
  );
}

/**
 * Sets up the done hook for the compiler.
 * @param {Object} compiler - The webpack compiler
 * @param {Object} options - Configuration options
 */
function setupDoneHook(compiler, options) {
  const { appName, urls, useYarn } = options;
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

    handleSuccessfulCompilation(
      messages,
      isSuccessful,
      appName,
      urls,
      useYarn,
      isFirstCompile
    );
    isFirstCompile = false;

    if (messages.errors.length) {
      handleCompilationErrors(messages);
      return;
    }

    handleCompilationWarnings(messages);
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
    handleCompilationError(err);
  }

  setupInvalidHook(compiler);

  let tsMessagesPromise;

  if (useTypeScript) {
    setupTypeScriptHooks(compiler);
  }

  setupDoneHook(compiler, { appName, urls, useYarn });

  if (isSmokeTest()) {
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
 * Creates an error handler for proxy requests.
 * @param {string} proxy - The proxy URL
 * @returns {Function} Error handler function
 */
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    const errorMessage = buildProxyErrorMessage(req.url, host, proxy, err.code);

    console.log(chalk.red('Proxy error:') + ' ' + errorMessage);
    console.log(
      'See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (' +
        chalk.cyan(err.code) +
        ').'
    );
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }

    res.end(buildProxyErrorResponseBody(req.url, host, proxy, err.code));
  };
}

/**
 * Builds the proxy error message.
 * @param {string} reqUrl - The request URL
 * @param {string} host - The host header
 * @param {string} proxy - The proxy URL
 * @param {string} errorCode - The error code
 * @returns {string} Formatted error message
 */
function buildProxyErrorMessage(reqUrl, host, proxy, errorCode) {
  return (
    'Could not proxy request ' +
    chalk.cyan(reqUrl) +
    ' from ' +
    chalk.cyan(host) +
    ' to ' +
    chalk.cyan(proxy) +
    '.'
  );
}

/**
 * Builds the proxy error response body.
 * @param {string} reqUrl - The request URL
 * @param {string} host - The host header
 * @param {string} proxy - The proxy URL
 * @param {string} errorCode - The error code
 * @returns {string} Formatted error response
 */
function buildProxyErrorResponseBody(reqUrl, host, proxy, errorCode) {
  return (
    'Proxy error: Could not proxy request ' +
    reqUrl +
    ' from ' +
    host +
    ' to ' +
    proxy +
    ' (' +
    errorCode +
    ').'
  );
}

/**
 * Checks if proxy type is valid.
 * @param {*} proxy - The proxy value
 * @returns {boolean} True if proxy is a string
 */
function isValidProxyType(proxy) {
  return typeof proxy === 'string';
}

/**
 * Checks if proxy URL format is valid.
 * @param {string} proxy - The proxy URL
 * @returns {boolean} True if proxy starts with http:// or https://
 */
function isValidProxyUrl(proxy) {
  return /^http(s)?:\/\//.test(proxy);
}

/**
 * Logs proxy type error.
 */
function logProxyTypeError(proxy) {
  console.log(
    chalk.red('When specified, "proxy" in package.json must be a string.')
  );
  console.log(
    chalk.red('Instead, the type of "proxy" was "' + typeof proxy + '".')
  );
  console.log(
    chalk.red('Either remove "proxy" from package.json, or make it a string.')
  );
}

/**
 * Logs proxy URL format error.
 */
function logProxyUrlError() {
  console.log(
    chalk.red(
      'When "proxy" is specified in package.json it must start with either http:// or https://'
    )
  );
}

/**
 * Determines the proxy target based on platform.
 * @param {string} proxy - The proxy URL
 * @returns {string} The resolved proxy target
 */
function getProxyTarget(proxy) {
  if (process.platform === 'win32') {
    return resolveLoopback(proxy);
  }
  return proxy;
}

/**
 * Checks if a pathname should be proxied.
 * @param {string} pathname - The request pathname
 * @param {string} appPublicFolder - The public folder path
 * @param {string} servedPathname - The served pathname
 * @param {string} sockPath - The WebSocket path
 * @param {boolean} isDefaultSockHost - Whether using default socket host
 * @returns {boolean} True if the request should be proxied
 */
function shouldProxyRequest(
  pathname,
  appPublicFolder,