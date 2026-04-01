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

// Formats a URL with the given hostname and protocol/port/pathname
function formatUrl(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port,
    pathname,
  });
}

// Formats a URL with bold port for terminal display
function formatUrlForTerminal(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port: chalk.bold(port),
    pathname,
  });
}

// Checks if the given IP address is private
function isPrivateIp(ipAddress) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
    ipAddress
  );
}

// Attempts to get the LAN URL for the given configuration
function getLanUrl(protocol, port, pathname) {
  try {
    const lanIp = address.ip();
    if (lanIp && isPrivateIp(lanIp)) {
      return {
        lanUrlForConfig: lanIp,
        lanUrlForTerminal: formatUrlForTerminal(protocol, lanIp, port, pathname),
      };
    }
  } catch (_e) {
    // ignored
  }
  return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
}

function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  const prettyHost = isUnspecifiedHost ? 'localhost' : host;
  const localUrlForTerminal = formatUrlForTerminal(
    protocol,
    prettyHost,
    port,
    pathname
  );
  const localUrlForBrowser = formatUrl(protocol, prettyHost, port, pathname);

  const lanUrls = isUnspecifiedHost
    ? getLanUrl(protocol, port, pathname)
    : { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };

  return {
    lanUrlForConfig: lanUrls.lanUrlForConfig,
    lanUrlForTerminal: lanUrls.lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

// Prints the local and network URLs to the console
function printLocalUrl(urls) {
  console.log(`  ${chalk.bold('Local:')}            ${urls.localUrlForTerminal}`);
}

// Prints the network URL to the console
function printNetworkUrl(urls) {
  console.log(
    `  ${chalk.bold('On Your Network:')}  ${urls.lanUrlForTerminal}`
  );
}

// Prints build instructions to the console
function printBuildInstructions(useYarn) {
  const buildCommand = useYarn ? 'yarn' : 'npm run';
  const buildCommandFormatted = chalk.cyan(`${buildCommand} build`);
  console.log();
  console.log('Note that the development build is not optimized.');
  console.log(`To create a production build, use ${buildCommandFormatted}.`);
  console.log();
}

function printInstructions(appName, urls, useYarn) {
  console.log();
  console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
  console.log();

  if (urls.lanUrlForTerminal) {
    printLocalUrl(urls);
    printNetworkUrl(urls);
  } else {
    console.log(`  ${urls.localUrlForTerminal}`);
  }

  printBuildInstructions(useYarn);
}

// Handles the invalid hook event
function handleCompilerInvalid() {
  if (isInteractive) {
    clearConsole();
  }
  console.log('Compiling...');
}

// Handles TypeScript checking awaiting
function handleTypeScriptCheckAwaiting() {
  console.log(
    chalk.yellow(
      'Files successfully emitted, waiting for typecheck results...'
    )
  );
}

// Extracts and formats webpack compilation messages
function extractCompilationMessages(stats) {
  const statsData = stats.toJson({
    all: false,
    warnings: true,
    errors: true,
  });
  return formatWebpackMessages(statsData);
}

// Prints successful compilation message
function printCompilationSuccess() {
  console.log(chalk.green('Compiled successfully!'));
}

// Prints compilation failure with errors
function printCompilationErrors(messages) {
  if (messages.errors.length > 1) {
    messages.errors.length = 1;
  }
  console.log(chalk.red('Failed to compile.\n'));
  console.log(messages.errors.join('\n\n'));
}

// Prints compilation warnings
function printCompilationWarnings() {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  const keywordsFormatted = chalk.underline(chalk.yellow('keywords'));
  const eslintDisableFormatted = chalk.cyan('// eslint-disable-next-line');
  console.log(
    `\nSearch for the ${keywordsFormatted} to learn more about each warning.`
  );
  console.log(
    `To ignore, add ${eslintDisableFormatted} to the line before.\n`
  );
}

// Handles the done hook event for compilation
function handleCompilerDone(
  stats,
  appName,
  urls,
  useYarn,
  isFirstCompile,
  setIsFirstCompile
) {
  if (isInteractive) {
    clearConsole();
  }

  const messages = extractCompilationMessages(stats);
  const isSuccessful = !messages.errors.length && !messages.warnings.length;

  if (isSuccessful) {
    printCompilationSuccess();
  }

  if (isSuccessful && (isInteractive || isFirstCompile)) {
    printInstructions(appName, urls, useYarn);
  }

  setIsFirstCompile(false);

  if (messages.errors.length) {
    printCompilationErrors(messages);
    return;
  }

  if (messages.warnings.length) {
    console.log(chalk.yellow('Compiled with warnings.\n'));
    console.log(messages.warnings.join('\n\n'));
    printCompilationWarnings();
  }
}

// Checks if running in smoke test mode
function isSmokeTestMode() {
  return process.argv.some(arg => arg.indexOf('--smoke-test') > -1);
}

// Handles smoke test completion
function handleSmokeTestDone(stats, tsMessagesPromise) {
  if (stats.hasErrors() || stats.hasWarnings()) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Handles smoke test failure
function handleSmokeTestFailed(tsMessagesPromise) {
  process.exit(1);
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

  compiler.hooks.invalid.tap('invalid', () => {
    handleCompilerInvalid();
  });

  let isFirstCompile = true;
  let tsMessagesPromise;

  if (useTypeScript) {
    forkTsCheckerWebpackPlugin
      .getCompilerHooks(compiler)
      .waiting.tap('awaitingTypeScriptCheck', () => {
        handleTypeScriptCheckAwaiting();
      });
  }

  compiler.hooks.done.tap('done', async stats => {
    handleCompilerDone(
      stats,
      appName,
      urls,
      useYarn,
      isFirstCompile,
      newValue => {
        isFirstCompile = newValue;
      }
    );
  });

  if (isSmokeTestMode()) {
    compiler.hooks.failed.tap('smokeTest', async () => {
      await tsMessagesPromise;
      handleSmokeTestFailed(tsMessagesPromise);
    });
    compiler.hooks.done.tap('smokeTest', async stats => {
      await tsMessagesPromise;
      handleSmokeTestDone(stats, tsMessagesPromise);
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

// Formats proxy error message for console output
function formatProxyErrorMessage(req, proxy, err) {
  const host = req.headers && req.headers.host;
  const errorPrefix = chalk.red('Proxy error:');
  const requestUrl = chalk.cyan(req.url);
  const requestHost = chalk.cyan(host);
  const proxyTarget = chalk.cyan(proxy);
  const errorCode = chalk.cyan(err.code);

  return `${errorPrefix} Could not proxy request ${requestUrl} from ${requestHost} to ${proxyTarget}.`;
}

// Formats proxy error response body
function formatProxyErrorResponse(req, host, proxy, err) {
  return (
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
}

// Logs proxy error details to console
function logProxyErrorDetails(req, proxy, err) {
  const errorMessage = formatProxyErrorMessage(req, proxy, err);
  console.log(errorMessage);
  const errorCodeFormatted = chalk.cyan(err.code);
  console.log(
    `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${errorCodeFormatted}).`
  );
  console.log();
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    logProxyErrorDetails(req, proxy, err);

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    const responseBody = formatProxyErrorResponse(req, host, proxy, err);
    res.end(responseBody);
  };
}

// Checks if a pathname should be proxied
function mayProxy(pathname, appPublicFolder, servedPathname, sockPath, isDefaultSockHost) {
  const maybePublicPath = path.resolve(
    appPublicFolder,
    pathname.replace(new RegExp('^' + servedPathname), '')
  );
  const isPublicFileRequest = fs.existsSync(maybePublicPath);
  const isWdsEndpointRequest =
    isDefaultSockHost && pathname.startsWith(sockPath);
  return !(isPublicFileRequest || isWdsEndpointRequest);
}

// Validates proxy configuration
function validateProxyConfig(proxy) {
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

  if (!/^http(s)?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }
}

// Creates proxy context function
function createProxyContext(appPublicFolder, servedPathname, sockPath, isDefaultSockHost) {
  return function (pathname, req) {
    return (
      req.method !== 'GET' ||
      (mayProxy(pathname, appPublicFolder, servedPathname, sockPath, isDefaultSockHost) &&
        req.headers.accept &&
        req.headers.accept.indexOf('text/html') === -1)
    );
  };
}

// Creates proxy request handler
function createProxyReqHandler(target) {
  return proxyReq => {
    if (proxyReq.getHeader('origin')) {
      proxyReq.setHeader('origin', target);
    }
  };
}

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }

  validateProxyConfig(proxy);

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

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
      context: createProxyContext(
        appPublicFolder,
        servedPathname,
        sockPath,
        isDefaultSockHost
      ),
      onProxyReq: createProxyReqHandler(target),
      onError: onProxyError(target),
      secure: false,
      changeOrigin: true,
      ws: true,
      xfwd: true,
    },
  ];
}

// Formats port already in use message
function formatPortInUseMessage(defaultPort) {
  return `Something is already running on port ${defaultPort}.`;
}

// Formats admin permissions required message
function formatAdminPermissionsMessage() {
  return 'Admin permissions are required to run a server on a port below 1024.';
}

// Determines the appropriate error message for port conflict
function getPortConflictMessage(defaultPort) {
  const isWindows = process.platform === 'win32';
  const isLowPort = defaultPort < 1024;
  const isRootUser = isRoot();

  if (!isWindows && isLowPort && !isRootUser) {
    return formatAdminPermissionsMessage();
  }
  return formatPortInUseMessage(defaultPort);
}

// Handles interactive port selection
function handleInteractivePortSelection(message, defaultPort) {
  return new Promise(resolve => {
    clearConsole();
    const existingProcess = getProcessForPort(defaultPort);
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
      resolve(answer.shouldChangePort ? null : null);
    });
  });
}

// Handles non-interactive port conflict
function handleNonInteractivePortConflict(message) {
  console.log(chalk.red(message));
  return null;
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }
        const message = getPortConflictMessage(defaultPort);
        if (isInteractive) {
          handleInteractivePortSelection(message, defaultPort).then(resolve);
        } else {
          resolve(handleNonInteractivePortConflict(message));
        }
      }),
    err => {
      const hostFormatted = chalk.bold(host);
      const errorMessage =
        chalk.red(`Could not find an open port at ${hostFormatted}.`) +
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