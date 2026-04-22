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

/* -------------------------------------------------------------------------- */
/* Helper: URL formatting                                                     */
/* -------------------------------------------------------------------------- */
function formatUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port, pathname });
}

function formatPrettyUrl(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port: chalk.bold(port),
    pathname,
  });
}

/* -------------------------------------------------------------------------- */
/* Helper: LAN URL detection                                                 */
/* -------------------------------------------------------------------------- */
function getLanUrlInfo(host, protocol, port, pathname) {
  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  if (!isUnspecifiedHost) {
    return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
  }

  try {
    const candidate = address.ip(); // IPv4 only
    if (!candidate) {
      return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
    }

    const isPrivate = /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
      candidate
    );
    if (!isPrivate) {
      return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
    }

    return {
      lanUrlForConfig: candidate,
      lanUrlForTerminal: formatPrettyUrl(protocol, candidate, port, pathname),
    };
  } catch (_) {
    return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
  }
}

/* -------------------------------------------------------------------------- */
/* Public: prepareUrls                                                       */
/* -------------------------------------------------------------------------- */
function prepareUrls(protocol, host, port, pathname = '/') {
  const prettyHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;

  const { lanUrlForConfig, lanUrlForTerminal } = getLanUrlInfo(
    host,
    protocol,
    port,
    pathname
  );

  const localUrlForTerminal = formatPrettyUrl(
    protocol,
    prettyHost,
    port,
    pathname
  );
  const localUrlForBrowser = formatUrl(protocol, prettyHost, port, pathname);

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

/* -------------------------------------------------------------------------- */
/* Helper: print build instruction                                            */
/* -------------------------------------------------------------------------- */
function printBuildInstruction(useYarn) {
  const command = useYarn ? 'yarn' : 'npm run';
  const coloredCommand = chalk.cyan(`${command} build`);
  console.log(`To create a production build, use ${coloredCommand}.`);
}

/* -------------------------------------------------------------------------- */
/* Public: printInstructions                                                 */
/* -------------------------------------------------------------------------- */
function printInstructions(appName, urls, useYarn) {
  console.log();
  console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
  console.log();

  if (urls.lanUrlForTerminal) {
    console.log(`  ${chalk.bold('Local:')}            ${urls.localUrlForTerminal}`);
    console.log(
      `  ${chalk.bold('On Your Network:')}  ${urls.lanUrlForTerminal}`
    );
  } else {
    console.log(`  ${urls.localUrlForTerminal}`);
  }

  console.log();
  console.log('Note that the development build is not optimized.');
  printBuildInstruction(useYarn);
  console.log();
}

/* -------------------------------------------------------------------------- */
/* Helper: handle compilation stats                                          */
/* -------------------------------------------------------------------------- */
function handleStatsDone({
  stats,
  isInteractive,
  isFirstCompile,
  appName,
  urls,
  useYarn,
}) {
  if (isInteractive) {
    clearConsole();
  }

  const statsData = stats.toJson({ all: false, warnings: true, errors: true });
  const messages = formatWebpackMessages(statsData);
  const isSuccessful = !messages.errors.length && !messages.warnings.length;

  if (isSuccessful) {
    console.log(chalk.green('Compiled successfully!'));
  }

  if (isSuccessful && (isInteractive || isFirstCompile)) {
    printInstructions(appName, urls, useYarn);
  }

  if (messages.errors.length) {
    if (messages.errors.length > 1) {
      messages.errors.length = 1;
    }
    console.log(chalk.red('Failed to compile.\n'));
    console.log(messages.errors.join('\n\n'));
    return false;
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

  return true;
}

/* -------------------------------------------------------------------------- */
/* Helper: smoke test hooks                                                  */
/* -------------------------------------------------------------------------- */
function attachSmokeTestHooks(compiler, tsMessagesPromise) {
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

/* -------------------------------------------------------------------------- */
/* Public: createCompiler                                                    */
/* -------------------------------------------------------------------------- */
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
    const success = handleStatsDone({
      stats,
      isInteractive,
      isFirstCompile,
      appName,
      urls,
      useYarn,
    });
    isFirstCompile = false;
    if (!success) {
      return;
    }
  });

  const isSmokeTest = process.argv.some(arg => arg.includes('--smoke-test'));
  if (isSmokeTest) {
    attachSmokeTestHooks(compiler, tsMessagesPromise);
  }

  return compiler;
}

/* -------------------------------------------------------------------------- */
/* Helper: resolve loopback address                                           */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Helper: proxy error handler                                               */
/* -------------------------------------------------------------------------- */
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    const message = [
      chalk.red('Proxy error:') + ' Could not proxy request ' + chalk.cyan(req.url),
      ' from ' + chalk.cyan(host) + ' to ' + chalk.cyan(proxy) + '.',
    ].join('');
    console.log(message);
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

/* -------------------------------------------------------------------------- */
/* Helper: validate proxy string                                             */
/* -------------------------------------------------------------------------- */
function validateProxyString(proxy) {
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

  if (!/^https?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }
}

/* -------------------------------------------------------------------------- */
/* Helper: build proxy configuration                                          */
/* -------------------------------------------------------------------------- */
function buildProxyConfig(proxy, appPublicFolder, servedPathname) {
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

/* -------------------------------------------------------------------------- */
/* Public: prepareProxy                                                      */
/* -------------------------------------------------------------------------- */
function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }

  validateProxyString(proxy);
  return buildProxyConfig(proxy, appPublicFolder, servedPathname);
}

/* -------------------------------------------------------------------------- */
/* Helper: build interactive port prompt message                              */
/* -------------------------------------------------------------------------- */
function buildPortPromptMessage(defaultPort, existingProcess) {
  const baseMessage =
    process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
      ? 'Admin permissions are required to run a server on a port below 1024.'
      : `Something is already running on port ${defaultPort}.`;

  const processInfo = existingProcess
    ? ` Probably:\n  ${existingProcess}`
    : '';

  return chalk.yellow(baseMessage + processInfo);
}

/* -------------------------------------------------------------------------- */
/* Public: choosePort                                                        */
/* -------------------------------------------------------------------------- */
function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }

        const existingProcess = getProcessForPort(defaultPort);
        const message = buildPortPromptMessage(defaultPort, existingProcess);

        if (isInteractive) {
          clearConsole();
          const question = {
            type: 'confirm',
            name: 'shouldChangePort',
            message:
              message +
              '\n\nWould you like to run the app on another port instead?',
            initial: true,
          };
          prompts(question).then(answer => {
            resolve(answer.shouldChangePort ? port : null);
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