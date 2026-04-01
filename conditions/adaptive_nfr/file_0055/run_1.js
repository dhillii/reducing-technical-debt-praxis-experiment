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
 * @returns {string|undefined} The LAN IP if it's private, undefined otherwise
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
 * @param {string} appName - Application name
 * @param {Object} urls - URL configuration
 * @param {boolean} useYarn - Whether yarn is being used
 * @param {boolean} isFirstCompile - Whether this is the first compilation
 */
function handleCompilationSuccess(messages, appName, urls, useYarn, isFirstCompile) {
  console.log(chalk.green('Compiled successfully!'));
  if (isInteractive || isFirstCompile) {
    printInstructions(appName, urls, useYarn);
  }
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
 * Processes the done hook for webpack compiler.
 * @param {Object} stats - Webpack stats
 * @param {string} appName - Application name
 * @param {Object} urls - URL configuration
 * @param {boolean} useYarn - Whether yarn is being used
 * @param {boolean} isFirstCompile - Whether this is the first compilation
 * @returns {boolean} True if should return early
 */
function processDoneHook(stats, appName, urls, useYarn, isFirstCompile) {
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
    handleCompilationSuccess(messages, appName, urls, useYarn, isFirstCompile);
    return false;
  }

  if (messages.errors.length) {
    handleCompilationErrors(messages);
    return true;
  }

  if (messages.warnings.length) {
    handleCompilationWarnings(messages);
  }

  return false;
}

/**
 * Checks if smoke test mode is enabled.
 * @returns {boolean} True if smoke test is enabled
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

  compiler.hooks.done.tap('done', async stats => {
    const shouldReturn = processDoneHook(stats, appName, urls, useYarn, isFirstCompile);
    isFirstCompile = false;
    if (shouldReturn) {
      return;
    }
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
 * Builds the error message for proxy errors.
 * @param {string} url - The request URL
 * @param {string} host - The request host
 * @param {string} proxy - The proxy target
 * @param {string} code - The error code
 * @returns {string} Formatted error message
 */
function buildProxyErrorMessage(url, host, proxy, code) {
  return (
    `Proxy error: Could not proxy request ${url} from ${host} to ${proxy} (${code}).`
  );
}

/**
 * Logs proxy error details to console.
 * @param {string} url - The request URL
 * @param {string} host - The request host
 * @param {string} proxy - The proxy target
 * @param {Object} err - The error object
 */
function logProxyErrorDetails(url, host, proxy, err) {
  const hostDisplay = host || 'unknown';
  console.log(
    `${chalk.red('Proxy error:')} Could not proxy request ${chalk.cyan(url)} from ${chalk.cyan(hostDisplay)} to ${chalk.cyan(proxy)}.`
  );
  console.log(
    `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(err.code)}).`
  );
  console.log();
}

/**
 * Sends proxy error response to client.
 * @param {Object} res - The response object
 * @param {string} message - The error message
 */
function sendProxyErrorResponse(res, message) {
  if (res.writeHead && !res.headersSent) {
    res.writeHead(500);
  }
  res.end(message);
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    logProxyErrorDetails(req.url, host, proxy, err);
    const errorMessage = buildProxyErrorMessage(req.url, host, proxy, err.code);
    sendProxyErrorResponse(res, errorMessage);
  };
}

/**
 * Checks if proxy configuration is valid.
 * @param {*} proxy - The proxy configuration
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
 * Checks if proxy URL format is valid.
 * @param {string} proxy - The proxy URL
 * @returns {boolean} True if URL format is valid
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
 * Creates a context function for proxy routing.
 * @param {string} sockPath - The WebSocket path
 * @param {boolean} isDefaultSockHost - Whether using default socket host
 * @param {string} appPublicFolder - The public folder path
 * @param {string} servedPathname - The served pathname
 * @returns {Function} Context function for proxy middleware
 */
function createProxyContext(sockPath, isDefaultSockHost, appPublicFolder, servedPathname) {
  return function (pathname, req) {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp('^' + servedPathname), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest = isDefaultSockHost && pathname.startsWith(sock