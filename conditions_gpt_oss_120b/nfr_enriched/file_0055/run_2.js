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
 * Formats a URL for display in the terminal (with bold port).
 */
function formatPrettyUrl(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port: chalk.bold(port),
    pathname,
  });
}

/**
 * Formats a URL for use by the browser (plain).
 */
function formatPlainUrl(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port,
    pathname,
  });
}

/**
 * Determines LAN and local URLs based on host configuration.
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  let prettyHost = isUnspecifiedHost ? 'localhost' : host;
  let lanUrlForConfig;
  let lanUrlForTerminal;

  if (isUnspecifiedHost) {
    try {
      // This can only return an IPv4 address
      const possibleLan = address.ip();
      if (possibleLan && isPrivateIp(possibleLan)) {
        lanUrlForConfig = possibleLan;
        lanUrlForTerminal = formatPrettyUrl(protocol, possibleLan, port, pathname);
      }
    } catch (_) {
      // ignore errors
    }
  }

  const localUrlForTerminal = formatPrettyUrl(protocol, prettyHost, port, pathname);
  const localUrlForBrowser = formatPlainUrl(protocol, prettyHost, port, pathname);

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

/**
 * Checks whether an IP address belongs to a private range.
 */
function isPrivateIp(ip) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(ip);
}

/**
 * Prints the development server instructions.
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
  console.log(buildCommandMessage(useYarn));
  console.log();
}

/**
 * Returns the message that shows how to create a production build.
 * Avoids nested template literals.
 */
function buildCommandMessage(useYarn) {
  const command = useYarn ? 'yarn' : 'npm run';
  const colored = chalk.cyan(`${command} build`);
  return `To create a production build, use ${colored}.`;
}

/**
 * Registers the "invalid" hook that runs when recompilation starts.
 */
function registerInvalidHook(compiler) {
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });
}

/**
 * Registers the "done" hook that runs after compilation finishes.
 */
function registerDoneHook(compiler, options) {
  const { appName, urls, useYarn, isFirstCompileRef } = options;

  compiler.hooks.done.tap('done', async stats => {
    if (isInteractive) {
      clearConsole();
    }

    const statsData = stats.toJson({ all: false, warnings: true, errors: true });
    const messages = formatWebpackMessages(statsData);
    const isSuccessful = !messages.errors.length && !messages.warnings.length;

    if (isSuccessful) {
      console.log(chalk.green('Compiled successfully!'));
    }
    if (isSuccessful && (isInteractive || isFirstCompileRef.value)) {
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
  });
}

/**
 * Registers smoke test hooks when the process is run with --smoke-test.
 */
function registerSmokeTestHooks(compiler, tsMessagesPromise) {
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
    process.exit(stats.hasErrors() || stats.hasWarnings() ? 1 : 0);
  });
}

/**
 * Creates a webpack compiler with custom hooks for CRA.
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

  registerInvalidHook(compiler);

  // TypeScript type checking integration
  if (useTypeScript) {
    forkTsCheckerWebpackPlugin
      .getCompilerHooks(compiler)
      .waiting.tap('awaitingTypeScriptCheck', () => {
        console.log(
          chalk.yellow('Files successfully emitted, waiting for typecheck results...')
        );
      });
  }

  const isFirstCompileRef = { value: true };
  registerDoneHook(compiler, { appName, urls, useYarn, isFirstCompileRef });

  registerSmokeTestHooks(compiler, undefined);

  return compiler;
}

/**
 * Resolves a proxy URL to an IPv4 loopback address when needed.
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
 * Returns a formatted error handler for proxy failures.
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
 * Validates and prepares the proxy configuration.
 */
function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }
  if (typeof proxy !== 'string') {
    exitWithProxyTypeError(typeof proxy);
  }

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

  const mayProxy = pathname => {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp('^' + servedPathname), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest = isDefaultSockHost && pathname.startsWith(sockPath);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  };

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
      context: (pathname, req) =>
        req.method !== 'GET' ||
        (mayProxy(pathname) && req.headers.accept && req.headers.accept.indexOf('text/html') === -1),
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
 * Exits the process with a helpful error message about proxy type.
 */
function exitWithProxyTypeError(actualType) {
  console.log(chalk.red('When specified, "proxy" in package.json must be a string.'));
  console.log(chalk.red(`Instead, the type of "proxy" was "${actualType}".`));
  console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
  process.exit(1);
}

/**
 * Chooses an available port, prompting the user if the default is occupied.
 */
function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }

        const message = getPortInUseMessage(defaultPort);
        if (isInteractive) {
          clearConsole();
          const existingProcess = getProcessForPort(defaultPort);
          const question = {
            type: 'confirm',
            name: 'shouldChangePort',
            message:
              chalk.yellow(
                message + (existingProcess ? ` Probably:\n  ${existingProcess}` : '')
              ) + '\n\nWould you like to run the app on another port instead?',
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

/**
 * Generates a user-friendly message when the default port is unavailable.
 */
function getPortInUseMessage(defaultPort) {
  if (process.platform !== 'win32' && defaultPort < 1024 && !isRoot()) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

module.exports = {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
};