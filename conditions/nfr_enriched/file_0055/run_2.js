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

// Prints the build instructions to the console
function printBuildInstructions(useYarn) {
  const buildCommand = useYarn ? 'yarn' : 'npm run';
  console.log();
  console.log('Note that the development build is not optimized.');
  console.log(`To create a production build, use ${chalk.cyan(`${buildCommand} build`)}.`);
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

// Handles the invalid hook for webpack compiler
function setupInvalidHook(compiler) {
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });
}

// Handles TypeScript checking hooks
function setupTypeScriptHooks(compiler) {
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

// Logs successful compilation message
function logSuccessfulCompilation() {
  console.log(chalk.green('Compiled successfully!'));
}

// Logs compilation errors
function logCompilationErrors(messages) {
  if (messages.errors.length > 1) {
    messages.errors.length = 1;
  }
  console.log(chalk.red('Failed to compile.\n'));
  console.log(messages.errors.join('\n\n'));
}

// Logs compilation warnings
function logCompilationWarnings(messages) {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(messages.warnings.join('\n\n'));

  const keywordsText = chalk.underline(chalk.yellow('keywords'));
  console.log(
    `\nSearch for the ${keywordsText} to learn more about each warning.`
  );

  const disableComment = chalk.cyan('// eslint-disable-next-line');
  console.log(`To ignore, add ${disableComment} to the line before.\n`);
}

// Handles the done hook for webpack compiler
function setupDoneHook(compiler, appName, urls, useYarn) {
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
      logSuccessfulCompilation();
    }

    if (isSuccessful && isInteractive) {
      printInstructions(appName, urls, useYarn);
    }

    if (messages.errors.length) {
      logCompilationErrors(messages);
      return;
    }

    if (messages.warnings.length) {
      logCompilationWarnings(messages);
    }
  });
}

// Checks if smoke test mode is enabled
function isSmokeTestMode() {
  return process.argv.some(arg => arg.indexOf('--smoke-test') > -1);
}

// Sets up smoke test hooks for webpack compiler
function setupSmokeTestHooks(compiler, tsMessagesPromise) {
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

  let isFirstCompile = true;
  let tsMessagesPromise;

  if (useTypeScript) {
    setupTypeScriptHooks(compiler);
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
      logSuccessfulCompilation();
    }

    if (isSuccessful && (isInteractive || isFirstCompile)) {
      printInstructions(appName, urls, useYarn);
    }

    isFirstCompile = false;

    if (messages.errors.length) {
      logCompilationErrors(messages);
      return;
    }

    if (messages.warnings.length) {
      logCompilationWarnings(messages);
    }
  });

  if (isSmokeTestMode()) {
    setupSmokeTestHooks(compiler, tsMessagesPromise);
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

// We need to provide a custom onError function for httpProxyMiddleware.
// It allows us to log custom error messages on the console.
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    const { line1, line2 } = formatProxyErrorMessage(req, proxy, err);

    console.log(line1);
    console.log(line2);
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }

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

// Creates a function to determine if a pathname should be proxied
function createMayProxyFunction(appPublicFolder, servedPathname, sockPath, isDefaultSockHost) {
  return function mayProxy(pathname) {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp('^' + servedPathname), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest =
      isDefaultSockHost && pathname.startsWith(sockPath);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  };
}

// Creates the proxy context function
function createProxyContext(mayProxy) {
  return function context(pathname, req) {
    return (
      req.method !== 'GET' ||
      (mayProxy(pathname) &&
        req.headers.accept &&
        req.headers.accept.indexOf('text/html') === -1)
    );
  };
}

// Creates the proxy request handler
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
      context: createProxyContext(mayProxy),
      onProxyReq: createProxyReqHandler(target),
      onError: onProxyError(target),
      secure: false,
      changeOrigin: true,
      ws: true,
      xfwd: true,
    },
  ];
}

// Builds the port in use message
function buildPortInUseMessage(defaultPort) {
  const isLowPort = defaultPort < 1024;
  const isWindows = process.platform === 'win32';
  const needsAdmin = isLowPort && !isRoot() && !isWindows;

  if (needsAdmin) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

// Handles interactive port selection
function handleInteractivePortSelection(defaultPort, message) {
  return new Promise(resolve => {
    clearConsole();
    const existingProcess = getProcessForPort(defaultPort);
    const processInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';
    const question = {
      type: 'confirm',
      name: 'shouldChangePort',
      message: `${chalk.yellow(message + processInfo)}\n\nWould you like to run the app on another port instead?`,
      initial: true,
    };

    prompts(question).then(answer => {
      if (answer.shouldChangePort) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// Handles non-interactive port selection
function handleNonInteractivePortSelection(message) {
  console.log(chalk.red(message