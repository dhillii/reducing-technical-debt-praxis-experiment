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
  return {
    lanUrlForConfig: undefined,
    lanUrlForTerminal: undefined,
  };
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

// Logs the first error from the messages
function logFirstError(messages) {
  if (messages.errors.length > 1) {
    messages.errors.length = 1;
  }
  console.log(chalk.red('Failed to compile.\n'));
  console.log(messages.errors.join('\n\n'));
}

// Logs warnings and ESLint tips
function logWarnings(messages) {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(messages.warnings.join('\n\n'));

  const keywordsFormatted = chalk.underline(chalk.yellow('keywords'));
  console.log(
    `\nSearch for the ${keywordsFormatted} to learn more about each warning.`
  );

  const eslintDisableFormatted = chalk.cyan('// eslint-disable-next-line');
  console.log(
    `To ignore, add ${eslintDisableFormatted} to the line before.\n`
  );
}

// Handles the done hook event
function handleCompilerDone(
  stats,
  messages,
  isFirstCompile,
  appName,
  urls,
  useYarn
) {
  if (isInteractive) {
    clearConsole();
  }

  const isSuccessful = !messages.errors.length && !messages.warnings.length;
  if (isSuccessful) {
    console.log(chalk.green('Compiled successfully!'));
  }
  if (isSuccessful && (isInteractive || isFirstCompile)) {
    printInstructions(appName, urls, useYarn);
  }

  if (messages.errors.length) {
    logFirstError(messages);
    return;
  }

  if (messages.warnings.length) {
    logWarnings(messages);
  }
}

// Checks if smoke test mode is enabled
function isSmokeTestMode() {
  return process.argv.some(arg => arg.indexOf('--smoke-test') > -1);
}

// Sets up the done hook for smoke test
function setupSmokeTestDoneHook(compiler, tsMessagesPromise) {
  compiler.hooks.done.tap('smokeTest', async stats => {
    await tsMessagesPromise;
    if (stats.hasErrors() || stats.hasWarnings()) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  });
}

// Sets up the failed hook for smoke test
function setupSmokeTestFailedHook(compiler, tsMessagesPromise) {
  compiler.hooks.failed.tap('smokeTest', async () => {
    await tsMessagesPromise;
    process.exit(1);
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
    forkTsCheckerWebpackPlugin
      .getCompilerHooks(compiler)
      .waiting.tap('awaitingTypeScriptCheck', handleTypeScriptCheckAwaiting);
  }

  compiler.hooks.done.tap('done', async stats => {
    const statsData = stats.toJson({
      all: false,
      warnings: true,
      errors: true,
    });

    const messages = formatWebpackMessages(statsData);
    handleCompilerDone(
      stats,
      messages,
      isFirstCompile,
      appName,
      urls,
      useYarn
    );
    isFirstCompile = false;
  });

  if (isSmokeTestMode()) {
    setupSmokeTestFailedHook(compiler, tsMessagesPromise);
    setupSmokeTestDoneHook(compiler, tsMessagesPromise);
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

// Formats the proxy error message for console output
function formatProxyErrorMessage(req, proxy, err) {
  const host = req.headers && req.headers.host;
  const line1 = `${chalk.red('Proxy error:')} Could not proxy request ${chalk.cyan(req.url)} from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`;
  const line2 = `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(err.code)}).`;
  return { line1, line2 };
}

// Formats the proxy error response body
function formatProxyErrorResponse(req, host, proxy, err) {
  return `Proxy error: Could not proxy request ${req.url} from ${host} to ${proxy} (${err.code}).`;
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const { line1, line2 } = formatProxyErrorMessage(req, proxy, err);
    console.log(line1);
    console.log(line2);
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }

    const host = req.headers && req.headers.host;
    const errorResponse = formatProxyErrorResponse(req, host, proxy, err);
    res.end(errorResponse);
  };
}

// Validates that proxy is a string
function validateProxyType(proxy) {
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
}

// Validates that proxy URL starts with http:// or https://
function validateProxyUrl(proxy) {
  if (!/^http(s)?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }
}

// Determines the target proxy URL based on platform
function getProxyTarget(proxy) {
  if (process.platform === 'win32') {
    return resolveLoopback(proxy);
  }
  return proxy;
}

// Creates the mayProxy function for the given configuration
function createMayProxyFunction(appPublicFolder, servedPathname, sockPath, isDefaultSockHost) {
  return function mayProxy(pathname) {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp(`^${servedPathname}`), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest =
      isDefaultSockHost && pathname.startsWith(sockPath);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  };
}

// Creates the context function for proxy middleware
function createProxyContextFunction(mayProxy) {
  return function context(pathname, req) {
    return (
      req.method !== 'GET' ||
      (mayProxy(pathname) &&
        req.headers.accept &&
        req.headers.accept.indexOf('text/html') === -1)
    );
  };
}

// Creates the onProxyReq handler
function createProxyReqHandler(target) {
  return function onProxyReq(proxyReq) {
    if (proxyReq.getHeader('origin')) {
      proxyReq.setHeader('origin', target);
    }
  };
}

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }

  validateProxyType(proxy);
  validateProxyUrl(proxy);

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;
  const mayProxy = createMayProxyFunction(
    appPublicFolder,
    servedPathname,
    sockPath,
    isDefaultSockHost
  );

  const target = getProxyTarget(proxy);

  return [
    {
      target,
      logLevel: 'silent',
      context: createProxyContextFunction(mayProxy),
      onProxyReq: createProxyReqHandler(target),
      onError: onProxyError(target),
      secure: false,
      changeOrigin: true,
      ws: true,
      xfwd: true,
    },
  ];
}

// Formats the port already in use message
function formatPortInUseMessage(defaultPort) {
  if (process.platform !== 'win32' && defaultPort < 1024 && !isRoot()) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

// Creates the prompt question for port change
function createPortChangeQuestion(message, existingProcess) {
  const processInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';
  return {
    type: 'confirm',
    name: 'shouldChangePort',
    message: `${chalk.yellow(message + processInfo)}\n\nWould you like to run the app on another port instead?`,
    initial: true,
  };
}

// Handles the interactive port selection
function handleInteractivePortSelection(defaultPort, port, resolve) {
  clearConsole();
  const existingProcess = getProcessForPort(defaultPort);
  const message = formatPortInUseMessage(defaultPort);
  const question = createPortChangeQuestion(message, existingProcess);

  prompts(question).then(answer => {
    if (answer.shouldChangePort) {
      resolve(port);
    } else {
      resolve(null);
    }
  });
}

// Handles the non-interactive port selection
function handleNonInteractivePortSelection(defaultPort, resolve) {
  const message = formatPortInUseMessage(defaultPort);
  console.log(chalk.red(message));
  resolve(null);
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }

        if (isInteractive) {
          handleInteractivePortSelection(defaultPort, port, resolve);
        } else {
          handleNonInteractivePortSelection(defaultPort, resolve);
        }
      }),
    err => {
      const hostFormatted = chalk.bold(host);
      const errorMessage = `Could not find an open port at ${hostFormatted}.`;
      const networkError = `Network error message: ${err.message || err}`;
      throw new Error(`${chalk.red(errorMessage)}\n${networkError}\n`);
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