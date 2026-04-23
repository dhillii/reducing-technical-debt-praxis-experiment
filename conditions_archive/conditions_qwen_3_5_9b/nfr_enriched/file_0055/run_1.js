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
 * @param {string} protocol - The URL protocol (http/https).
 * @param {string} hostname - The host address.
 * @param {string} port - The port number.
 * @param {string} pathname - The URL pathname.
 * @param {boolean} isBold - Whether to bold the port number.
 * @returns {string} The formatted URL string.
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
 * Determines if a host is an unspecified host (0.0.0.0 or ::).
 * @param {string} host - The host address.
 * @returns {boolean} True if the host is unspecified.
 */
function isUnspecifiedHost(host) {
  return host === '0.0.0.0' || host === '::';
}

/**
 * Prepares URL objects for terminal and browser display.
 * @param {string} protocol - The URL protocol.
 * @param {string} host - The host address.
 * @param {string} port - The port number.
 * @param {string} pathname - The URL pathname.
 * @returns {Object} Object containing formatted URLs for different contexts.
 */
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

  let prettyHost, lanUrlForConfig, lanUrlForTerminal;

  if (isUnspecifiedHost(host)) {
    prettyHost = 'localhost';
    try {
      // This can only return an IPv4 address
      lanUrlForConfig = address.ip();
      if (lanUrlForConfig) {
        // Check if the address is a private ip
        // https://en.wikipedia.org/wiki/Private_network#Private_IPv4_address_spaces
        if (
          /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
            lanUrlForConfig
          )
        ) {
          // Address is private, format it for later use
          lanUrlForTerminal = prettyPrintUrl(lanUrlForConfig);
        } else {
          // Address is not private, so we will discard it
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
 * Prints development server instructions to the console.
 * @param {string} appName - The name of the application.
 * @param {Object} urls - Object containing formatted URLs.
 * @param {boolean} useYarn - Whether to use yarn for build commands.
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
  console.log(
    `To create a production build, use ` +
      `${chalk.cyan(`${useYarn ? 'yarn' : 'npm run'} build`)}.`
  );
  console.log();
}

/**
 * Formats error messages for display.
 * @param {string[]} errors - Array of error messages.
 * @param {string[]} warnings - Array of warning messages.
 * @returns {Object} Object containing formatted error and warning strings.
 */
function formatErrorMessages(errors, warnings) {
  const errorString = errors.length
    ? errors.join('\n\n')
    : '';
  const warningString = warnings.length
    ? warnings.join('\n\n')
    : '';

  return {
    errorString,
    warningString,
  };
}

/**
 * Formats a proxy error message for console display.
 * @param {string} reqUrl - The requested URL.
 * @param {string} host - The request host header.
 * @param {string} proxy - The proxy target.
 * @param {Error} err - The error object.
 * @returns {string} The formatted error message.
 */
function formatProxyErrorMessage(reqUrl, host, proxy, err) {
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
 * Formats a system error message for console display.
 * @param {string} errorCode - The error code.
 * @returns {string} The formatted error message.
 */
function formatSystemErrorMessage(errCode) {
  return (
    'See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (' +
    chalk.cyan(errCode) +
    ').'
  );
}

/**
 * Formats a response body for proxy errors.
 * @param {string} reqUrl - The requested URL.
 * @param {string} host - The request host header.
 * @param {string} proxy - The proxy target.
 * @param {string} errorCode - The error code.
 * @returns {string} The formatted response body.
 */
function formatProxyErrorResponseBody(reqUrl, host, proxy, errorCode) {
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
 * Handles proxy errors by logging and sending error responses.
 * @param {string} proxy - The proxy target URL.
 * @returns {Function} Error handler function.
 */
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;

    console.log(
      formatProxyErrorMessage(req.url, host, proxy, err)
    );
    console.log(formatSystemErrorMessage(err.code));
    console.log();

    // And immediately send the proper error response to the client.
    // Otherwise, the request will eventually timeout with ERR_EMPTY_RESPONSE on the client side.
    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    res.end(
      formatProxyErrorResponseBody(req.url, host, proxy, err.code)
    );
  };
}

/**
 * Resolves localhost to IPv4 for maximum compatibility.
 * @param {string} proxy - The proxy URL.
 * @returns {string} The resolved proxy URL.
 */
function resolveLoopback(proxy) {
  const o = url.parse(proxy);
  o.host = undefined;

  if (o.hostname !== 'localhost') {
    return proxy;
  }

  // Unfortunately, many languages (unlike node) do not yet support IPv6.
  // This means even though localhost resolves to ::1, the application
  // must fall back to IPv4 (on 127.0.0.1).
  // We can re-enable this in a few years.
  /*try {
    o.hostname = address.ipv6() ? '::1' : '127.0.0.1';
  } catch (_ignored) {
    o.hostname = '127.0.0.1';
  }*/

  try {
    // Check if we're on a network; if we are, chances are we can resolve
    // localhost. Otherwise, we can just be safe and assume localhost is
    // IPv4 for maximum compatibility.
    if (!address.ip()) {
      o.hostname = '127.0.0.1';
    }
  } catch (_ignored) {
    o.hostname = '127.0.0.1';
  }

  return url.format(o);
}

/**
 * Validates and prepares proxy configuration.
 * @param {string|Object} proxy - The proxy configuration.
 * @param {string} appPublicFolder - The public folder path.
 * @param {string} servedPathname - The served pathname.
 * @returns {Object|undefined} Proxy configuration object or undefined.
 */
function prepareProxy(proxy, appPublicFolder, servedPathname) {
  // `proxy` lets you specify alternate servers for specific requests.
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

  // If proxy is specified, let it handle any request except for
  // files in the public folder and requests to the WebpackDevServer socket endpoint.
  // https://github.com/facebook/create-react-app/issues/6720
  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

  /**
   * Determines if a request should be proxied.
   * @param {string} pathname - The request pathname.
   * @returns {boolean} True if the request should be proxied.
   */
  function mayProxy(pathname) {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp('^' + servedPathname), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    // used by webpackHotDevClient
    const isWdsEndpointRequest =
      isDefaultSockHost && pathname.startsWith(sockPath);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  }

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
      // For single page apps, we generally want to fallback to /index.html.
      // However we also want to respect `proxy` for API calls.
      // So if `proxy` is specified as a string, we need to decide which fallback to use.
      // We use a heuristic: We want to proxy all the requests that are not meant
      // for static assets and as all the requests for static assets will be using
      // `GET` method, we can proxy all non-`GET` requests.
      // For `GET` requests, if request `accept`s text/html, we pick /index.html.
      // Modern browsers include text/html into `accept` header when navigating.
      // However API calls like `fetch()` won't generally accept text/html.
      // If this heuristic doesn't work well for you, use `src/setupProxy.js`.
      context: function (pathname, req) {
        return (
          req.method !== 'GET' ||
          (mayProxy(pathname) &&
            req.headers.accept &&
            req.headers.accept.indexOf('text/html') === -1)
        );
      },
      onProxyReq: proxyReq => {
        // Browsers may send Origin headers even with same-origin
        // requests. To prevent CORS issues, we have to change
        // the Origin to match the target URL.
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
 * Formats a message for port selection when port is already in use.
 * @param {boolean} isWindows - Whether the platform is Windows.
 * @param {number} defaultPort - The default port number.
 * @param {boolean} isRoot - Whether the process has root/admin privileges.
 * @param {string|null} existingProcess - The existing process information.
 * @returns {string} The formatted message.
 */
function formatPortSelectionMessage(
  isWindows,
  defaultPort,
  isRoot,
  existingProcess
) {
  const adminMessage =
    process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
      ? `Admin permissions are required to run a server on a port below 1024.`
      : `Something is already running on port ${defaultPort}.`;

  const processInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';

  return chalk.yellow(adminMessage + processInfo) + '\n\n';
}

/**
 * Formats a production build command message.
 * @param {boolean} useYarn - Whether to use yarn for build commands.
 * @returns {string} The formatted message.
 */
function formatProductionBuildMessage(useYarn) {
  return chalk.cyan(`${useYarn ? 'yarn' : 'npm run'} build`);
}

/**
 * Formats a warning search instruction message.
 * @returns {string} The formatted message.
 */
function formatWarningSearchMessage() {
  return (
    '\nSearch for the ' +
    chalk.underline(chalk.yellow('keywords')) +
    ' to learn more about each warning.'
  );
}

/**
 * Formats an ESLint disable instruction message.
 * @returns {string} The formatted message.
 */
function formatEslintDisableMessage() {
  return (
    'To ignore, add ' +
    chalk.cyan('// eslint-disable-next-line') +
    ' to the line before.\n'
  );
}

/**
 * Formats a port selection question message.
 * @param {string} message - The base message.
 * @param {string|null} existingProcess - The existing process information.
 * @returns {string} The formatted question message.
 */
function formatPortSelectionQuestionMessage(message, existingProcess) {
  const processInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';
  return message + processInfo + '\n\nWould you like to run the app on another port instead?';
}

/**
 * Chooses an available port for the development server.
 * @param {string} host - The host address.
 * @param {number} defaultPort - The default port number.
 * @returns {Promise<number|null>} The chosen port or null if not available.
 */
function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }

        const message = formatPortSelectionMessage(
          process.platform !== 'win32',
          defaultPort,
          !isRoot(),
          null
        );

        if (isInteractive) {
          clearConsole();
          const existingProcess = getProcessForPort(defaultPort);
          const question = {
            type: 'confirm',
            name: 'shouldChangePort',
            message: formatPortSelectionQuestionMessage(
              message,
              existingProcess
            ),
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
        chalk.red(`Could not find an open port at ${chalk.bold(host)}.`) +
        '\n' +
        ('Network error message: ' + err.message || err) +
        '\n'
      );
    }
  );
}

/**
 * Creates a webpack compiler with custom event handlers.
 * @param {Object} options - Configuration options.
 * @param {string} options.appName - The application name.
 * @param {Object} options.config - Webpack configuration.
 * @param {Object} options.urls - Formatted URLs.
 * @param {boolean} options.useYarn - Whether to use yarn.
 * @param {boolean} options.useTypeScript - Whether to use TypeScript.
 * @param {Object} options.webpack - Webpack instance.
 * @returns {Object} The webpack compiler instance.
 */
function createCompiler({
  appName,
  config,
  urls,
  useYarn,
  useTypeScript,
  webpack,
}) {
  // "Compiler" is a low-level interface to webpack.
  // It lets us listen to some events and provide our own custom messages.
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

  // "invalid" event fires when you have changed a file, and webpack is
  // recompiling a bundle. WebpackDevServer takes care to pause serving the
  // bundle, so if you refresh, it'll wait instead of serving the old one.
  // "invalid" is short for "bundle invalidated", it doesn't imply any errors.
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

  // "done" event fires when webpack has finished recompiling the bundle.
  // Whether or not you have warnings or errors, you will get this event.
  compiler.hooks.done.tap('done', async stats => {
    if (isInteractive) {
      clearConsole();
    }

    // We have switched off the default webpack output in WebpackDevServer
    // options so we are going to "massage" the warnings and errors and present
    // them in a readable focused way.
    // We only construct the warnings and errors for speed:
    // https://github.com/facebook/create-react-app/issues/4492#issuecomment-421959548
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

    // If errors exist, only show errors.
    if (messages.errors.length) {
      // Only keep the first error. Others are often indicative
      // of the same problem, but confuse the reader with noise.
      if (messages.errors.length > 1) {
        messages.errors.length = 1;
      }
      console.log(chalk.red('Failed to compile.\n'));
      console.log(messages.errors.join('\n\n'));
      return;
    }

    // Show warnings if no errors were found.
    if (messages.warnings.length) {
      console.log(chalk.yellow('Compiled with warnings.\n'));
      console.log(messages.warnings.join('\n\n'));

      // Teach some ESLint tricks.
      console.log(formatWarningSearchMessage());
      console.log(formatEslintDisableMessage());
    }
  });

  // You can safely remove this after ejecting.
  // We only use this block for testing of Create React App itself:
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

module.exports = {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
};
```