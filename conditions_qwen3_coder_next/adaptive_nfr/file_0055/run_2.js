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
    try {
      lanUrlForConfig = address.ip();
      if (!isPrivateAddress(lanUrlForConfig)) {
        lanUrlForConfig = undefined;
      } else {
        lanUrlForTerminal = prettyPrintUrl(lanUrlForConfig);
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

function isPrivateAddress(ip) {
  if (!ip) return false;
  return (
    /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(ip)
  );
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
  console.log(
    `To create a production build, use ` +
      `${chalk.cyan(`${useYarn ? 'yarn' : 'npm run'} build`)}.`
  );
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
  let compiler = tryCreateCompiler(webpack, config);
  if (!compiler) {
    return compiler;
  }

  setupInvalidHook(compiler);
  setupDoneHook(compiler, appName, urls, useYarn);
  setupTypeScriptHooks(compiler, useTypeScript);

  const isSmokeTest = process.argv.some(
    arg => arg.indexOf('--smoke-test') > -1
  );
  if (isSmokeTest) {
    setupSmokeTestHooks(compiler);
  }

  return compiler;
}

function tryCreateCompiler(webpack, config) {
  try {
    return webpack(config);
  } catch (err) {
    console.log(chalk.red('Failed to compile.'));
    console.log();
    console.log(err.message || err);
    console.log();
    process.exit(1);
    return undefined;
  }
}

function setupInvalidHook(compiler) {
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });
}

function setupDoneHook(compiler, appName, urls, useYarn) {
  let isFirstCompile = true;
  let tsMessagesPromise;

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
      handleCompilationErrors(messages.errors);
      return;
    }

    handleCompilationWarnings(messages.warnings);
  });

  return { tsMessagesPromise };
}

function setupTypeScriptHooks(compiler, useTypeScript) {
  if (!useTypeScript) return;

  compiler.hooks.done.tap('done', async stats => {
    const tsMessagesPromise = new Promise(resolve => {
      forkTsCheckerWebpackPlugin
        .getCompilerHooks(compiler)
        .waiting.tap('awaitingTypeScriptCheck', () => {
          console.log(
            chalk.yellow(
              'Files successfully emitted, waiting for typecheck results...'
            )
          );
        });
      resolve();
    });
  });
}

function handleCompilationErrors(errors) {
  if (errors.length > 1) {
    errors.length = 1;
  }
  console.log(chalk.red('Failed to compile.\n'));
  console.log(errors.join('\n\n'));
}

function handleCompilationWarnings(warnings) {
  if (!warnings.length) return;

  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(warnings.join('\n\n'));

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

function setupSmokeTestHooks(compiler) {
  compiler.hooks.failed.tap('smokeTest', async () => {
    await getTsMessagesPromise();
    process.exit(1);
  });
  compiler.hooks.done.tap('smokeTest', async stats => {
    await getTsMessagesPromise();
    process.exit(stats.hasErrors() || stats.hasWarnings() ? 1 : 0);
  });
}

function getTsMessagesPromise() {
  return undefined;
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

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }

  if (typeof proxy !== 'string') {
    handleInvalidProxyType(proxy);
    return undefined;
  }

  if (!startsWithProtocol(proxy)) {
    handleInvalidProxyFormat(proxy);
    return undefined;
  }

  const target = isWindows() ? resolveLoopback(proxy) : proxy;
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

function isWindows() {
  return process.platform === 'win32';
}

function startsWithProtocol(value) {
  return /^http(s)?:\/\//.test(value);
}

function handleInvalidProxyType(proxy) {
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

function handleInvalidProxyFormat(proxy) {
  console.log(
    chalk.red(
      'When "proxy" is specified in package.json it must start with either http:// or https://'
    )
  );
  process.exit(1);
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }
        const message =
          isDevelopmentPortRequirement() &&
          !isRoot()
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

function isDevelopmentPortRequirement() {
  return (
    process.platform !== 'win32' &&
    defaultPortBelow1024()
  );
}

function defaultPortBelow1024() {
  return defaultPort < 1024;
}

module.exports = {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
};