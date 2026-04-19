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
 * Formats a URL string.
 */
function formatUrl({ protocol, hostname, port, pathname }) {
  return url.format({ protocol, hostname, port, pathname });
}

/**
 * Formats a URL string with a bold port.
 */
function formatPrettyUrl({ protocol, hostname, port, pathname }) {
  return url.format({
    protocol,
    hostname,
    port: chalk.bold(port),
    pathname,
  });
}

/**
 * Returns a LAN URL for configuration if the host is a private IP.
 */
function getLanUrlForConfig(host) {
  try {
    const lanUrl = address.ip();
    if (!lanUrl) return undefined;
    // Private IP ranges
    if (
      /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
        lanUrl
      )
    ) {
      return lanUrl;
    }
  } catch (_) {
    // ignored
  }
  return undefined;
}

/**
 * Returns a LAN URL for terminal if the host is a private IP.
 */
function getLanUrlForTerminal(host, lanUrlForConfig) {
  if (!lanUrlForConfig) return undefined;
  return formatPrettyUrl({
    protocol: 'http',
    hostname: lanUrlForConfig,
    port: process.env.PORT || 3000,
    pathname: '/',
  });
}

/**
 * Returns a pretty host string.
 */
function getPrettyHost(host) {
  return host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}

/**
 * Prepares URLs for local and LAN access.
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const prettyHost = getPrettyHost(host);
  const lanUrlForConfig = host === '0.0.0.0' || host === '::'
    ? getLanUrlForConfig(host)
    : undefined;
  const lanUrlForTerminal = getLanUrlForTerminal(host, lanUrlForConfig);

  const localUrlForTerminal = formatPrettyUrl({
    protocol,
    hostname: prettyHost,
    port,
    pathname,
  });
  const localUrlForBrowser = formatUrl({
    protocol,
    hostname: prettyHost,
    port,
    pathname,
  });

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

/**
 * Returns the build command string based on the package manager.
 */
function getBuildCommand(useYarn) {
  return `${useYarn ? 'yarn' : 'npm run'} build`;
}

/**
 * Prints instructions to the console after a successful build.
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
  console.log(`To create a production build, use ${chalk.cyan(getBuildCommand(useYarn))}.`);
  console.log();
}

/**
 * Handles the 'invalid' event from the compiler.
 */
function handleInvalidEvent(compiler) {
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });
}

/**
 * Handles the 'done' event from the compiler.
 */
function handleDoneEvent({
  stats,
  urls,
  appName,
  useYarn,
  isInteractive,
  isFirstCompile,
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
  const isSuccessful = !messages.errors.length && !messages.warnings.length;

  if (isSuccessful) {
    console.log(chalk.green('Compiled successfully!'));
  }

  if (isSuccessful && (isInteractive || isFirstCompile)) {
    printInstructions(appName, urls, useYarn);
  }

  // Errors
  if (messages.errors.length) {
    if (messages.errors.length > 1) {
      messages.errors.length = 1;
    }
    console.log(chalk.red('Failed to compile.\n'));
    console.log(messages.errors.join('\n\n'));
    return;
  }

  // Warnings
  if (messages.warnings.length) {
    console.log(chalk.yellow('Compiled with warnings.\n'));
    console.log(messages.warnings.join('\n\n'));

    console.log('\nSearch for the ' + chalk.underline(chalk.yellow('keywords')) + ' to learn more about each warning.');
    console.log('To ignore, add ' + chalk.cyan('// eslint-disable-next-line') + ' to the line before.\n');
  }
}

/**
 * Handles smoke test events for Create React App.
 */
function handleSmokeTestEvents(compiler, tsMessagesPromise) {
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
 * Creates a webpack compiler with custom event handling.
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

  handleInvalidEvent(compiler);

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
    handleDoneEvent({
      stats,
      urls,
      appName,
      useYarn,
      isInteractive,
      isFirstCompile,
    });
    isFirstCompile = false;
  });

  const isSmokeTest = process.argv.some(arg => arg.indexOf('--smoke-test') > -1);
  if (isSmokeTest) {
    handleSmokeTestEvents(compiler, tsMessagesPromise);
  }

  return compiler;
}

/**
 * Resolves loopback addresses for Windows.
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
  } catch (_) {
    o.hostname = '127.0.0.1';
  }
  return url.format(o);
}

/**
 * Handles proxy errors.
 */
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    console.log(
      chalk.red('Proxy error:') +
        ' Could not proxy request ' +
        chalk.cyan(req.url) +
        ' from ' +
        chalk.cyan(host) +
        ' to ' +
        chalk.cyan(proxy) +
        '.'
    );
    console.log(
      'See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (' +
        chalk.cyan(err.code) +
        ').'
    );
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    res.end(
      'Proxy error: Could not proxy request ' +
        req.url +
        ' from ' +
        host +
        ' to ' +
        proxy +
        ' (' +
        err.code +
        ').'
    );
  };
}

/**
 * Prepares proxy configuration for the dev server.
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

  if (!/^http(s)?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
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
        const message =
          process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
            ? `Admin permissions are required to run a server on a port below 1024.`
            : `Something is already running on port ${defaultPort}.`;
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
        chalk.red(`Could not find an open port at ${chalk.bold(host)}.`) +
          '\n' +
          ('Network error message: ' + err.message || err) +
          '\n'
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