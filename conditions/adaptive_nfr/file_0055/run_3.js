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
 * Initializes the webpack compiler with hooks and event listeners.
 * @param {Object} params - Configuration parameters
 * @returns {Object} The webpack compiler instance
 */
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
      if (messages.errors.length > 1) {
        messages.errors.length = 1;
      }
      console.log(chalk.red('Failed to compile.\n'));
      console.log(messages.errors.join('\n\n'));
      return;
    }

    if (messages.warnings.length) {
      console.log(chalk.yellow('Compiled with warnings.\n'));
      console.log(messages.warnings.join('\n\n'));
      console.log(
        `\nSearch for the ${chalk.underline(chalk.yellow('keywords'))} to learn more about each warning.`
      );
      console.log(
        `To ignore, add ${chalk.cyan('// eslint-disable-next-line')} to the line before.\n`
      );
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
 * Creates an error handler for proxy middleware.
 * @param {string} proxy - The proxy URL
 * @returns {Function} Error handler function
 */
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    const errorMessage = buildProxyErrorMessage(req.url, host, proxy, err.code);
    console.log(errorMessage);
    console.log(
      `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(err.code)}).`
    );
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }

    const responseBody = buildProxyErrorResponse(req.url, host, proxy, err.code);
    res.end(responseBody);
  };
}

/**
 * Builds the proxy error message for console output.
 * @param {string} reqUrl - The request URL
 * @param {string} host - The host header
 * @param {string} proxy - The proxy URL
 * @param {string} errorCode - The error code
 * @returns {string} Formatted error message
 */
function buildProxyErrorMessage(reqUrl, host, proxy, errorCode) {
  return (
    chalk.red('Proxy error:') +
    ' Could not proxy request ' +
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
 * @returns {string} Error response body
 */
function buildProxyErrorResponse(reqUrl, host, proxy, errorCode) {
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
 * Checks if the proxy configuration is valid.
 * @param {*} proxy - The proxy value to validate
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
 * Checks if the proxy URL has a valid protocol.
 * @param {string} proxy - The proxy URL
 * @returns {boolean} True if proxy has valid protocol
 */
function hasValidProxyProtocol(proxy) {
  return /^http(s)?:\/\//.test(proxy);
}

/**
 * Validates proxy protocol and exits if invalid.
 * @param {string} proxy - The proxy URL
 */
function validateProxyProtocol(proxy) {
  if (!hasValidProxyProtocol(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }
}

/**
 * Determines the target proxy URL based on platform.
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
  if (!isValidProxyConfig(proxy)) {
    return undefined;
  }

  validateProxyProtocol(proxy);

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
 * Determines the error message for port conflict.
 * @param {number} defaultPort - The default port
 * @returns {string} The error message
 */
function getPortConflictMessage(defaultPort) {
  const isLowPort = defaultPort < 1024;
  const isWindows = process.platform === 'win32';
  const needsAdmin = isLowPort && !isRoot() && !isWindows;

  if (needsAdmin) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

/**
 * Handles interactive port selection.
 * @param {number} port - The available port
 * @param {number} defaultPort - The default port
 * @param {Function} resolve - Promise resolve function
 */
function handleInteractivePortSelection(port, defaultPort, resolve) {
  clearConsole();
  const existingProcess = getProcessForPort(defaultPort);
  const message = getPortConflictMessage(defaultPort);
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
}

/**
 * Handles non-interactive port selection.
 * @param {number} defaultPort - The default port
 * @param {Function} resolve - Promise resolve function
 */
function handleNonInteractivePortSelection(defaultPort, resolve) {
  const message = getPortConflictMessage(defaultPort);
  console.log(chalk.red(message));
  resolve(null);
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port => {
      return new Promise(resolve => {
        if (isDefaultPort(port, defaultPort)) {
          return resolve(port);
        }

        if (isInteractive) {
          handleInteractivePortSelection(port, defaultPort, resolve);
        } else {
          handleNonInteractivePortSelection(defaultPort, resolve);
        }
      });
    },
    err => {
      const errorMessage =
        chalk.red(`Could not find an open port at ${chalk.bold(host)}.`) +
        '\n' +
        ('Network error message: ' + (err.message || err)) +
        '\n';
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