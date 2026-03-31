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
const PRIVATE_IP_REGEX = /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/;
const PROTOCOL_REGEX = /^http(s)?:\/\//;
const SMOKE_TEST_FLAG = '--smoke-test';
const WDS_SOCKET_PATH = process.env.WDS_SOCKET_PATH || '/ws';
const IS_DEFAULT_SOCK_HOST = !process.env.WDS_SOCKET_HOST;

// ============================================================================
// URL Preparation
// ============================================================================

function isPrivateIp(ip) {
  return PRIVATE_IP_REGEX.test(ip);
}

function getLanUrl(protocol, port, pathname) {
  try {
    const lanIp = address.ip();
    if (lanIp && isPrivateIp(lanIp)) {
      return url.format({
        protocol,
        hostname: lanIp,
        port: chalk.bold(port),
        pathname,
      });
    }
  } catch (_e) {
    // ignored
  }
  return undefined;
}

function formatUrl(protocol, hostname, port, pathname, bold = false) {
  return url.format({
    protocol,
    hostname,
    port: bold ? chalk.bold(port) : port,
    pathname,
  });
}

function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  const prettyHost = isUnspecifiedHost ? 'localhost' : host;

  const localUrlForTerminal = formatUrl(protocol, prettyHost, port, pathname, true);
  const localUrlForBrowser = formatUrl(protocol, prettyHost, port, pathname);
  const lanUrlForTerminal = isUnspecifiedHost ? getLanUrl(protocol, port, pathname) : undefined;
  const lanUrlForConfig = isUnspecifiedHost ? address.ip() : undefined;

  return {
    lanUrlForConfig: lanUrlForConfig && isPrivateIp(lanUrlForConfig) ? lanUrlForConfig : undefined,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

// ============================================================================
// Console Output
// ============================================================================

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
  const buildCommand = useYarn ? 'yarn' : 'npm run';
  console.log(`To create a production build, use ${chalk.cyan(`${buildCommand} build`)}.`);
  console.log();
}

function printCompilationSuccess(appName, urls, useYarn) {
  console.log(chalk.green('Compiled successfully!'));
  printInstructions(appName, urls, useYarn);
}

function printCompilationErrors(messages) {
  console.log(chalk.red('Failed to compile.\n'));
  console.log(messages.errors.slice(0, 1).join('\n\n'));
}

function printCompilationWarnings(messages) {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(messages.warnings.join('\n\n'));
  console.log(
    `\nSearch for the ${chalk.underline(chalk.yellow('keywords'))} to learn more about each warning.`
  );
  console.log(
    `To ignore, add ${chalk.cyan('// eslint-disable-next-line')} to the line before.\n`
  );
}

// ============================================================================
// Compiler Creation
// ============================================================================

function setupInvalidHook(compiler) {
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });
}

function setupTypeScriptHook(compiler) {
  forkTsCheckerWebpackPlugin
    .getCompilerHooks(compiler)
    .waiting.tap('awaitingTypeScriptCheck', () => {
      console.log(
        chalk.yellow('Files successfully emitted, waiting for typecheck results...')
      );
    });
}

function getCompilationStats(stats) {
  return stats.toJson({
    all: false,
    warnings: true,
    errors: true,
  });
}

function setupDoneHook(compiler, { appName, urls, useYarn }) {
  let isFirstCompile = true;

  compiler.hooks.done.tap('done', stats => {
    if (isInteractive) {
      clearConsole();
    }

    const statsData = getCompilationStats(stats);
    const messages = formatWebpackMessages(statsData);
    const isSuccessful = !messages.errors.length && !messages.warnings.length;

    if (isSuccessful) {
      if (isInteractive || isFirstCompile) {
        printCompilationSuccess(appName, urls, useYarn);
      } else {
        console.log(chalk.green('Compiled successfully!'));
      }
    } else if (messages.errors.length) {
      printCompilationErrors(messages);
    } else if (messages.warnings.length) {
      printCompilationWarnings(messages);
    }

    isFirstCompile = false;
  });
}

function setupSmokeTestHooks(compiler, tsMessagesPromise) {
  compiler.hooks.failed.tap('smokeTest', async () => {
    await tsMessagesPromise;
    process.exit(1);
  });

  compiler.hooks.done.tap('smokeTest', async stats => {
    await tsMessagesPromise;
    process.exit(stats.hasErrors() || stats.hasWarnings() ? 1 : 0);
  });
}

function isSmokeTest() {
  return process.argv.some(arg => arg.includes(SMOKE_TEST_FLAG));
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

  setupInvalidHook(compiler);

  if (useTypeScript) {
    setupTypeScriptHook(compiler);
  }

  setupDoneHook(compiler, { appName, urls, useYarn });

  if (isSmokeTest()) {
    setupSmokeTestHooks(compiler, Promise.resolve());
  }

  return compiler;
}

// ============================================================================
// Proxy Configuration
// ============================================================================

function resolveLoopback(proxy) {
  const o = url.parse(proxy);
  o.host = undefined;

  if (o.hostname !== 'localhost') {
    return proxy;
  }

  try {
    o.hostname = address.ip() ? 'localhost' : '127.0.0.1';
  } catch (_ignored) {
    o.hostname = '127.0.0.1';
  }

  return url.format(o);
}

function createProxyErrorHandler(proxy) {
  return (err, req, res) => {
    const host = req.headers?.host || 'unknown';
    const errorMessage = `Proxy error: Could not proxy request ${chalk.cyan(req.url)} from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`;

    console.log(chalk.red('Proxy error:') + ` ${errorMessage}`);
    console.log(
      `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(err.code)}).`
    );
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    res.end(`${errorMessage} (${err.code}).`);
  };
}

function createMayProxyFunction(appPublicFolder, servedPathname) {
  return pathname => {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp(`^${servedPathname}`), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest = IS_DEFAULT_SOCK_HOST && pathname.startsWith(WDS_SOCKET_PATH);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  };
}

function createProxyContext(mayProxy) {
  return (pathname, req) => {
    return (
      req.method !== 'GET' ||
      (mayProxy(pathname) &&
        req.headers.accept &&
        req.headers.accept.includes('text/html') === false)
    );
  };
}

function validateProxyConfig(proxy) {
  if (typeof proxy !== 'string') {
    console.log(chalk.red('When specified, "proxy" in package.json must be a string.'));
    console.log(chalk.red(`Instead, the type of "proxy" was "${typeof proxy}".`));
    console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
    process.exit(1);
  }

  if (!PROTOCOL_REGEX.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }
}

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }

  validateProxyConfig(proxy);

  const mayProxy = createMayProxyFunction(appPublicFolder, servedPathname);
  const target = process.platform === 'win32' ? resolveLoopback(proxy) : proxy;

  return [
    {
      target,
      logLevel: 'silent',
      context: createProxyContext(mayProxy),
      onProxyReq: proxyReq => {
        if (proxyReq.getHeader('origin')) {
          proxyReq.setHeader('origin', target);
        }
      },
      onError: createProxyErrorHandler(target),
      secure: false,
      changeOrigin: true,
      ws: true,
      xfwd: true,
    },
  ];
}

// ============================================================================
// Port Selection
// ============================================================================

function getPortConflictMessage(defaultPort) {
  const isPrivilegedPort = defaultPort < 1024 && !isRoot();
  const isWindowsPlatform = process.platform === 'win32';

  if (isWindowsPlatform || !isPrivilegedPort) {
    return `Something is already running on port ${defaultPort}.`;
  }

  return 'Admin permissions are required to run a server on a port below 1024.';
}

function promptPortChange(defaultPort, message) {
  return new Promise(resolve => {
    clearConsole();
    const existingProcess = getProcessForPort(defaultPort);
    const fullMessage =
      message + (existingProcess ? ` Probably:\n  ${existingProcess}` : '');

    prompts({
      type: 'confirm',
      name: 'shouldChangePort',
      message: chalk.yellow(fullMessage) + '\n\nWould you like to run the app on another port instead?',
      initial: true,
    }).then(answer => {
      resolve(answer.shouldChangePort ? 'port_changed' : null);
    });
  });
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port => {
      if (port === defaultPort) {
        return port;
      }

      const message = getPortConflictMessage(defaultPort);

      if (!isInteractive) {
        console.log(chalk.red(message));
        return null;
      }

      return promptPortChange(defaultPort, message).then(result => {
        return result === 'port_changed' ? port : null;
      });
    },
    err => {
      throw new Error(
        chalk.red(`Could not find an open port at ${chalk.bold(host)}.`) +
          '\n' +
          `Network error message: ${err.message || err}\n`
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