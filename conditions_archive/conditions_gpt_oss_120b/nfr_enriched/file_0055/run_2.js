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
 * Build a URL string using the given hostname.
 */
function buildUrl({ protocol, hostname, port, pathname, highlightPort = false }) {
  return url.format({
    protocol,
    hostname,
    port: highlightPort ? chalk.bold(port) : port,
    pathname,
  });
}

/**
 * Determine LAN URL information when the host is unspecified.
 */
function getLanUrlInfo(host) {
  if (host !== '0.0.0.0' && host !== '::') {
    return { prettyHost: host, lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
  }

  let lanUrlForConfig;
  try {
    // This can only return an IPv4 address
    const candidate = address.ip();
    if (candidate && /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(candidate)) {
      lanUrlForConfig = candidate;
    }
  } catch (_) {
    // ignore errors
  }

  const prettyHost = 'localhost';
  const lanUrlForTerminal = lanUrlForConfig ? buildUrl({ protocol: 'http', hostname: lanUrlForConfig, port: undefined, pathname: '/', highlightPort: true }) : undefined;

  return { prettyHost, lanUrlForConfig, lanUrlForTerminal };
}

/**
 * Prepare URLs for local and LAN access.
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const { prettyHost, lanUrlForConfig, lanUrlForTerminal } = getLanUrlInfo(host);
  const localUrlForTerminal = buildUrl({ protocol, hostname: prettyHost, port, pathname, highlightPort: true });
  const localUrlForBrowser = buildUrl({ protocol, hostname: prettyHost, port, pathname });

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

/**
 * Print usage instructions after the first successful compile.
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
  const buildCmd = useYarn ? 'yarn' : 'npm run';
  console.log(`To create a production build, use ${chalk.cyan(`${buildCmd} build`)}.`);
  console.log();
}

/**
 * Create a webpack compiler with custom hooks for CRA.
 */
function createCompiler({ appName, config, urls, useYarn, useTypeScript, webpack }) {
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

  // Invalid hook – clear console and show compiling message.
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });

  // TypeScript waiting hook.
  if (useTypeScript) {
    forkTsCheckerWebpackPlugin
      .getCompilerHooks(compiler)
      .waiting.tap('awaitingTypeScriptCheck', () => {
        console.log(chalk.yellow('Files successfully emitted, waiting for typecheck results...'));
      });
  }

  // Done hook – handle success, warnings, and errors.
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
    if (isSuccessful && (isInteractive || createCompiler._firstCompile)) {
      printInstructions(appName, urls, useYarn);
    }
    createCompiler._firstCompile = false;

    if (messages.errors.length) {
      // Show only the first error.
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
      console.log('\nSearch for the ' + chalk.underline(chalk.yellow('keywords')) + ' to learn more about each warning.');
      console.log('To ignore, add ' + chalk.cyan('// eslint-disable-next-line') + ' to the line before.\n');
    }
  });

  // Smoke test handling (used only in CRA's own test suite).
  const isSmokeTest = process.argv.some(arg => arg.includes('--smoke-test'));
  if (isSmokeTest) {
    compiler.hooks.failed.tap('smokeTest', async () => {
      await createCompiler._tsMessagesPromise;
      process.exit(1);
    });
    compiler.hooks.done.tap('smokeTest', async stats => {
      await createCompiler._tsMessagesPromise;
      process.exit(stats.hasErrors() || stats.hasWarnings() ? 1 : 0);
    });
  }

  return compiler;
}
createCompiler._firstCompile = true;
createCompiler._tsMessagesPromise = undefined;

/**
 * Resolve a proxy URL that points to localhost, forcing IPv4 when needed.
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
 * Generate a proxy error handler that logs detailed information.
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
 * Validate the proxy configuration and return a proxy middleware config array.
 */
function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }

  if (typeof proxy !== 'string') {
    console.log(chalk.red('When specified, "proxy" in package.json must be a string.'));
    console.log(chalk.red(`Instead, the type of "proxy" was "${typeof proxy}".`));
    console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
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

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

  function mayProxy(pathname) {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp('^' + servedPathname), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest = isDefaultSockHost && pathname.startsWith(sockPath);
    return !(isPublicFileRequest || isWdsEndpointRequest);
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
 * Build a user‑friendly message describing why a port cannot be used.
 */
function buildPortMessage(defaultPort) {
  if (process.platform !== 'win32' && defaultPort < 1024 && !isRoot()) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

/**
 * Prompt the user to choose an alternative port when the default is unavailable.
 */
function promptForPortChange(defaultPort, message) {
  return new Promise(resolve => {
    clearConsole();
    const existingProcess = getProcessForPort(defaultPort);
    const question = {
      type: 'confirm',
      name: 'shouldChangePort',
      message:
        chalk.yellow(message + (existingProcess ? ` Probably:\n  ${existingProcess}` : '')) +
        '\n\nWould you like to run the app on another port instead?',
      initial: true,
    };
    prompts(question).then(answer => {
      resolve(answer.shouldChangePort ? true : false);
    });
  });
}

/**
 * Choose an available port, optionally prompting the user to switch.
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
          promptForPortChange(defaultPort, message).then(shouldChange => {
            resolve(shouldChange ? port : null);
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