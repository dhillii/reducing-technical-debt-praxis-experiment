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

/* Predicate helpers ------------------------------------------------------- */

/**
 * Returns true if the host is unspecified (0.0.0.0 or ::).
 * @param {string} host
 */
function isUnspecifiedHost(host) {
  return host === '0.0.0.0' || host === '::';
}

/**
 * Returns true if the given IP address is private.
 * @param {string} ip
 */
function isPrivateIp(ip) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(ip);
}

/**
 * Returns true when the request should be proxied.
 * @param {string} pathname
 * @param {string} appPublicFolder
 * @param {string} servedPathname
 */
function shouldProxyPath(pathname, appPublicFolder, servedPathname) {
  const maybePublicPath = path.resolve(
    appPublicFolder,
    pathname.replace(new RegExp('^' + servedPathname), '')
  );
  const isPublicFileRequest = fs.existsSync(maybePublicPath);
  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;
  const isWdsEndpointRequest =
    isDefaultSockHost && pathname.startsWith(sockPath);
  return !(isPublicFileRequest || isWdsEndpointRequest);
}

/**
 * Returns true when the compilation succeeded without warnings or errors.
 * @param {{errors: any[], warnings: any[]}} messages
 */
function isCompilationSuccessful(messages) {
  return messages.errors.length === 0 && messages.warnings.length === 0;
}

/**
 * Returns true when the current platform is Windows.
 */
function isWindowsPlatform() {
  return process.platform === 'win32';
}

/**
 * Returns true when the default socket host is not overridden.
 */
function isDefaultSockHost() {
  return !process.env.WDS_SOCKET_HOST;
}

/**
 * Returns true when the request method is not GET.
 * @param {object} req
 */
function isNonGetRequest(req) {
  return req.method !== 'GET';
}

/**
 * Returns true when the request accepts HTML.
 * @param {object} req
 */
function acceptsHtml(req) {
  return (
    req.headers.accept &&
    req.headers.accept.indexOf('text/html') !== -1
  );
}

/* URL preparation -------------------------------------------------------- */

function formatUrl(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port,
    pathname,
  });
}

function formatPrettyUrl(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port: chalk.bold(port),
    pathname,
  });
}

/**
 * Prepares URLs for local and LAN access.
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecified = isUnspecifiedHost(host);
  let prettyHost = isUnspecified ? 'localhost' : host;
  let lanUrlForConfig;
  let lanUrlForTerminal;

  if (isUnspecified) {
    try {
      const candidate = address.ip();
      if (candidate && isPrivateIp(candidate)) {
        lanUrlForConfig = candidate;
        lanUrlForTerminal = formatPrettyUrl(
          protocol,
          candidate,
          port,
          pathname
        );
      }
    } catch (_) {
      // ignore
    }
  }

  const localUrlForTerminal = formatPrettyUrl(
    protocol,
    prettyHost,
    port,
    pathname
  );
  const localUrlForBrowser = formatUrl(
    protocol,
    prettyHost,
    port,
    pathname
  );

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

/* Console output ---------------------------------------------------------- */

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
    `To create a production build, use ${chalk.cyan(
      `${useYarn ? 'yarn' : 'npm run'} build`
    )}.`
  );
  console.log();
}

/* Compiler creation ------------------------------------------------------- */

function handleInvalid() {
  if (isInteractive) {
    clearConsole();
  }
  console.log('Compiling...');
}

/**
 * Handles the "done" hook of the compiler.
 */
function handleDone({
  stats,
  appName,
  urls,
  useYarn,
  isFirstCompileRef,
}) {
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
    console.log(chalk.green('Compiled successfully!'));
  }

  if (successful && (isInteractive || isFirstCompileRef.value)) {
    printInstructions(appName, urls, useYarn);
  }

  isFirstCompileRef.value = false;

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
}

/**
 * Handles smoke test failure.
 */
function handleSmokeTestFailed(tsMessagesPromise) {
  return async () => {
    await tsMessagesPromise;
    process.exit(1);
  };
}

/**
 * Handles smoke test completion.
 */
function handleSmokeTestDone(tsMessagesPromise) {
  return async stats => {
    await tsMessagesPromise;
    if (stats.hasErrors() || stats.hasWarnings()) {
      process.exit(1);
    }
    process.exit(0);
  };
}

/**
 * Creates a webpack compiler with custom hooks.
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

  compiler.hooks.invalid.tap('invalid', handleInvalid);

  let isFirstCompile = { value: true };
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

  compiler.hooks.done.tap('done', stats => {
    handleDone({
      stats,
      appName,
      urls,
      useYarn,
      isFirstCompileRef: isFirstCompile,
    });
  });

  const isSmokeTest = process.argv.some(arg => arg.includes('--smoke-test'));
  if (isSmokeTest) {
    compiler.hooks.failed.tap('smokeTest', handleSmokeTestFailed(tsMessagesPromise));
    compiler.hooks.done.tap('smokeTest', handleSmokeTestDone(tsMessagesPromise));
  }

  return compiler;
}

/* Proxy utilities ---------------------------------------------------------- */

function resolveLoopback(proxy) {
  const parsed = url.parse(proxy);
  parsed.host = undefined;

  if (parsed.hostname !== 'localhost') {
    return proxy;
  }

  try {
    if (!address.ip()) {
      parsed.hostname = '127.0.0.1';
    }
  } catch (_) {
    parsed.hostname = '127.0.0.1';
  }

  return url.format(parsed);
}

/**
 * Returns an error handler for http-proxy-middleware.
 */
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    const errorHeader = chalk.red('Proxy error:');
    const requestInfo = `Could not proxy request ${chalk.cyan(
      req.url
    )} from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`;
    console.log(`${errorHeader} ${requestInfo}`);

    const docLink = `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(
      err.code
    )}).`;
    console.log(docLink);
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    const responseBody = `Proxy error: Could not proxy request ${req.url} from ${host} to ${proxy} (${err.code}).`;
    res.end(responseBody);
  };
}

/**
 * Prepares a proxy configuration for webpack-dev-server.
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
      chalk.red(
        'Either remove "proxy" from package.json, or make it a string.'
      )
    );
    process.exit(1);
  }

  if (!/^http(s)?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }

  const target = isWindowsPlatform() ? resolveLoopback(proxy) : proxy;

  return [
    {
      target,
      logLevel: 'silent',
      context: function (pathname, req) {
        return (
          isNonGetRequest(req) ||
          (shouldProxyPath(pathname, appPublicFolder, servedPathname) &&
            !acceptsHtml(req))
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

/* Port selection ---------------------------------------------------------- */

function buildPortMessage(defaultPort) {
  if (process.platform !== 'win32' && defaultPort < 1024 && !isRoot()) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

/**
 * Chooses an available port, prompting the user if necessary.
 */
function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }

        const message = buildPortMessage(defaultPort);
        if (isInteractive) {
          clearConsole();
          const existingProcess = getProcessForPort(defaultPort);
          const extraInfo = existingProcess
            ? ` Probably:\n  ${existingProcess}`
            : '';
          const promptMessage = `${chalk.yellow(message + extraInfo)}\n\nWould you like to run the app on another port instead?`;

          prompts({
            type: 'confirm',
            name: 'shouldChangePort',
            message: promptMessage,
            initial: true,
          }).then(answer => {
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
        `${chalk.red(
          `Could not find an open port at ${chalk.bold(host)}.`
        )}\nNetwork error message: ${err.message || err}\n`
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