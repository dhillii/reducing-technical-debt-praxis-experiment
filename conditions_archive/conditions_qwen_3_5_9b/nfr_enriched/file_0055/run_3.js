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
 * Formats a URL with optional styling for display.
 * @param {string} protocol - The URL protocol (http/https)
 * @param {string} hostname - The hostname
 * @param {string} port - The port number
 * @param {string} pathname - The URL pathname
 * @param {boolean} isBold - Whether to bold the port
 * @returns {string} Formatted URL string
 */
function formatUrl(protocol, hostname, port, pathname, isBold = false) {
  return url.format({
    protocol,
    hostname,
    port: isBold ? chalk.bold(port) : port,
    pathname,
  });
}

/**
 * Determines if a host is an unspecified host.
 * @param {string} host - The hostname to check
 * @returns {boolean} True if host is 0.0.0.0 or ::
 */
function isUnspecifiedHost(host) {
  return host === '0.0.0.0' || host === '::';
}

/**
 * Prepares URLs for display in terminal and configuration.
 * @param {string} protocol - The URL protocol
 * @param {string} host - The hostname
 * @param {string} port - The port number
 * @param {string} pathname - The URL pathname
 * @returns {Object} Object containing formatted URLs
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const formatUrl = hostname =>
    formatUrl(protocol, hostname, port, pathname);
  const prettyPrintUrl = hostname =>
    formatUrl(protocol, hostname, port, pathname, true);

  let prettyHost, lanUrlForConfig, lanUrlForTerminal;
  if (isUnspecifiedHost(host)) {
    prettyHost = 'localhost';
    try {
      lanUrlForConfig = address.ip();
      if (lanUrlForConfig) {
        if (
          /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
            lanUrlForConfig
          )
        ) {
          lanUrlForTerminal = prettyPrintUrl(lanUrlForConfig);
        } else {
          lanUrlForConfig = undefined;
        }
      }
    } catch (_e) {
      // ignored
    }
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

/**
 * Prints instructions to the console about viewing the app.
 * @param {string} appName - The application name
 * @param {Object} urls - Object containing formatted URLs
 * @param {boolean} useYarn - Whether to use yarn for build command
 */
function printInstructions(appName, urls, useYarn) {
  console.log();
  console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
  console.log();

  if (urls.lanUrlForTerminal) {
    console.log(`  ${chalk.bold('Local:')}            ${urls.localUrlForTerminal}`);
    console.log(`  ${chalk.bold('On Your Network:')}  ${urls.lanUrlForTerminal}`);
  } else {
    console.log(`  ${urls.localUrlForTerminal}`);
  }

  console.log();
  console.log('Note that the development build is not optimized.');
  console.log(
    `To create a production build, use ${chalk.cyan(
      useYarn ? 'yarn build' : 'npm run build'
    )}.`
  );
  console.log();
}

/**
 * Creates a webpack compiler with custom hooks and error handling.
 * @param {Object} options - Configuration options
 * @param {string} options.appName - The application name
 * @param {Object} options.config - Webpack configuration
 * @param {Object} options.urls - Formatted URLs
 * @param {boolean} options.useYarn - Whether to use yarn
 * @param {boolean} options.useTypeScript - Whether TypeScript is enabled
 * @param {Object} options.webpack - Webpack instance
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
          chalk.yellow('Files successfully emitted, waiting for typecheck results...')
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

/**
 * Resolves localhost to appropriate IP address for proxy configuration.
 * @param {string} proxy - The proxy URL
 * @returns {string} Resolved proxy URL
 */
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
 * Builds a formatted error message for proxy failures.
 * @param {string} proxy - The target proxy URL
 * @param {string} host - The request host
 * @param {string} reqUrl - The requested URL
 * @param {Error} err - The error object
 * @returns {string} Formatted error message
 */
function buildProxyErrorMessage(proxy, host, reqUrl, err) {
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
 * Builds a formatted error message with code for proxy failures.
 * @param {string} proxy - The target proxy URL
 * @param {string} host - The request host
 * @param {string} reqUrl - The requested URL
 * @param {Error} err - The error object
 * @returns {string} Formatted error message with code
 */
function buildProxyErrorMessageWithCode(proxy, host, reqUrl, err) {
  return (
    'Proxy error: Could not proxy request ' +
    reqUrl +
    ' from ' +
    host +
    ' to ' +
    proxy +
    ' (' +
    err.code +
    ').'
  );
}

/**
 * Handles proxy errors by logging and sending error response.
 * @param {string} proxy - The target proxy URL
 * @returns {Function} Error handler function
 */
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    console.log(buildProxyErrorMessage(proxy, host, req.url, err));
    console.log(
      'See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (' +
      chalk.cyan(err.code) +
      ').'
    );
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    res.end(buildProxyErrorMessageWithCode(proxy, host, req.url, err));
  };
}

/**
 * Determines if a request should be proxied based on path and headers.
 * @param {string} pathname - The request pathname
 * @param {string} appPublicFolder - The public folder path
 * @param {string} servedPathname - The served pathname
 * @returns {boolean} True if request should be proxied
 */
function mayProxy(pathname, appPublicFolder, servedPathname) {
  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;
  const maybePublicPath = path.resolve(
    appPublicFolder,
    pathname.replace(new RegExp('^' + servedPathname), '')
  );
  const isPublicFileRequest = fs.existsSync(maybePublicPath);
  const isWdsEndpointRequest =
    isDefaultSockHost && pathname.startsWith(sockPath);
  return !(isPublicFileRequest || isWdsEndpointRequest);
}

/**
 * Prepares proxy configuration for webpack dev server.
 * @param {string} proxy - The proxy configuration
 * @param {string} appPublicFolder - The public folder path
 * @param {string} servedPathname - The served pathname
 * @returns {Array} Proxy configuration array
 */
function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }
  if (typeof proxy !== 'string') {
    console.log(
      chalk.red('When specified, "proxy" in package.json must be a string.')
    );
    console.log(
      chalk.red('Instead, the type of "proxy" was "' + typeof proxy + '".')
    );
    console.log(
      chalk.red('Either remove "proxy" from package.json, or make it a string.')
    );
    process.exit(1);
  }

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

  if (!/^http(s)?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }

  let target;
  if (process.platform === 'win32') {
    target = resolveLoopback(proxy);
  } else {
    target = proxy;
  }

  return [
    {
      target,
      logLevel: 'silent',
      context: function (pathname, req) {
        return (
          req.method !== 'GET' ||
          (mayProxy(pathname, appPublicFolder, servedPathname) &&
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
 * Builds a message about port availability and permissions.
 * @param {boolean} isWin32 - Whether running on Windows
 * @param {number} defaultPort - The default port number
 * @param {boolean} isRoot - Whether running as root
 * @returns {string} Formatted message
 */
function buildPortMessage(isWin32, defaultPort, isRoot) {
  if (!isWin32 && defaultPort < 1024 && !isRoot) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

/**
 * Builds a message for port detection failure.
 * @param {string} host - The host to check
 * @param {string} errMessage - The error message
 * @returns {string} Formatted error message
 */
function buildPortErrorMessage(host, errMessage) {
  return (
    chalk.red(`Could not find an open port at ${chalk.bold(host)}.`) +
    '\n' +
    ('Network error message: ' + errMessage || err) +
    '\n'
  );
}

/**
 * Finds an available port with user interaction for port conflicts.
 * @param {string} host - The host to bind to
 * @param {number} defaultPort - The default port to use
 * @returns {Promise<number|null>} Available port or null if user declined
 */
function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }
        const message = buildPortMessage(
          process.platform !== 'win32',
          defaultPort,
          !isRoot()
        );
        if (isInteractive) {
          clearConsole();
          const existingProcess = getProcessForPort(defaultPort);
          const question = {
            type: 'confirm',
            name: 'shouldChangePort',
            message:
              chalk.yellow(
                message +
                  `${existingProcess ? ` Probably:\n  ${existingProcess}` : ''}`
              ) + '\n\nWould you like to run the app on another port instead?',
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
      }),
    err => {
      throw new Error(
        buildPortErrorMessage(host, err.message)
      );
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