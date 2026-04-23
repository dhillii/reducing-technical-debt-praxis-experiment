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
 * Formats a URL with the given components.
 */
function formatUrl({ protocol, hostname, port, pathname }) {
  return url.format({ protocol, hostname, port, pathname });
}

/**
 * Formats a URL for terminal output, with the port in bold.
 */
function prettyPrintUrl({ protocol, hostname, port, pathname }) {
  return url.format({
    protocol,
    hostname,
    port: chalk.bold(port),
    pathname,
  });
}

/**
 * Computes LAN URLs for configuration and terminal display.
 */
function computeLanUrls(host, port, pathname) {
  let lanUrlForConfig;
  let lanUrlForTerminal;
  if (host === '0.0.0.0' || host === '::') {
    try {
      const lanIp = address.ip();
      if (lanIp) {
        const isPrivate =
          /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
            lanIp
          );
        if (isPrivate) {
          lanUrlForTerminal = prettyPrintUrl({
            protocol: 'http',
            hostname: lanIp,
            port,
            pathname,
          });
          lanUrlForConfig = lanIp;
        }
      }
    } catch (_) {
      // ignore errors
    }
  }
  return { lanUrlForConfig, lanUrlForTerminal };
}

/**
 * Prepares URLs for local and LAN access.
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const prettyHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  const { lanUrlForConfig, lanUrlForTerminal } = computeLanUrls(
    host,
    port,
    pathname
  );
  const localUrlForTerminal = prettyPrintUrl({
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
 * Prints the instructions shown after a successful compilation.
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
  const buildCommand = useYarn ? 'yarn' : 'npm run';
  console.log(
    'To create a production build, use ' +
      chalk.cyan(buildCommand + ' build') +
      '.'
  );
  console.log();
}

/**
 * Handles the 'invalid' event from the compiler.
 */
function handleInvalid(isInteractive) {
  return () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  };
}

/**
 * Handles the 'done' event from the compiler.
 */
function handleDone({
  appName,
  urls,
  useYarn,
  isInteractive,
  isFirstCompile,
  setFirstCompile,
}) {
  return async stats => {
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

    setFirstCompile(false);

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
  };
}

/**
 * Sets up smoke test hooks on the compiler.
 */
function setupSmokeTestHooks(compiler, tsMessagesPromise) {
  const isSmokeTest = process.argv.some(arg => arg.includes('--smoke-test'));
  if (!isSmokeTest) {
    return;
  }
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
 * Creates a webpack compiler and sets up all necessary hooks.
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

  compiler.hooks.invalid.tap('invalid', handleInvalid(isInteractive));

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

  const setFirstCompile = value => {
    isFirstCompile = value;
  };

  compiler.hooks.done.tap(
    'done',
    handleDone({
      appName,
      urls,
      useYarn,
      isInteractive,
      isFirstCompile,
      setFirstCompile,
    })
  );

  setupSmokeTestHooks(compiler, tsMessagesPromise);

  return compiler;
}

/**
 * Resolves a proxy URL to use IPv4 if necessary.
 */
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
 * Creates an error handler for the proxy middleware.
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
 * Validates that the proxy configuration is a string.
 */
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
}

/**
 * Validates that the proxy URL starts with http:// or https://.
 */
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

/**
 * Determines whether a request should be proxied.
 */
function createMayProxyFunction(appPublicFolder, servedPathname, sockPath, isDefaultSockHost) {
  return pathname => {
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

/**
 * Prepares the proxy configuration for the dev server.
 */
function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }

  validateProxyString(proxy);
  validateProxyUrl(proxy);

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;
  const mayProxy = createMayProxyFunction(
    appPublicFolder,
    servedPathname,
    sockPath,
    isDefaultSockHost
  );

  const target = process.platform === 'win32' ? resolveLoopback(proxy) : proxy;

  return [
    {
      target,
      logLevel: 'silent',
      context: (pathname, req) => {
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
 * Generates the message shown when a port conflict occurs.
 */
function getPortConflictMessage(defaultPort, existingProcess) {
  if (process.platform !== 'win32' && defaultPort < 1024 && !isRoot()) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  let message = `Something is already running on port ${defaultPort}.`;
  if (existingProcess) {
    message += `\n  ${existingProcess}`;
  }
  return message;
}

/**
 * Prompts the user to change the port.
 */
function askUserToChangePort(message) {
  const question = {
    type: 'confirm',
    name: 'shouldChangePort',
    message:
      chalk.yellow(message + '\n\nWould you like to run the app on another port instead?') +
      '\n',
    initial: true,
  };
  return prompts(question).then(answer => answer.shouldChangePort);
}

/**
 * Chooses an available port, handling conflicts interactively.
 */
function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }
        const existingProcess = getProcessForPort(defaultPort);
        const message = getPortConflictMessage(defaultPort, existingProcess);
        if (isInteractive) {
          clearConsole();
          askUserToChangePort(message).then(shouldChange => {
            if (shouldChange) {
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