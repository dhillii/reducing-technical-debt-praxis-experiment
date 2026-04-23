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

/* Predicate helpers ------------------------------------------------------- */

/**
 * Checks whether the host is unspecified (0.0.0.0 or ::).
 * @param {string} host
 * @returns {boolean}
 */
function isUnspecifiedHost(host) {
  return host === '0.0.0.0' || host === '::';
}

/**
 * Checks whether an IP address belongs to a private range.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIp(ip) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(ip);
}

/**
 * Determines if the provided proxy value is a string.
 * @param {*} proxy
 * @returns {boolean}
 */
function isStringProxy(proxy) {
  return typeof proxy === 'string';
}

/**
 * Determines if the proxy string starts with http:// or https://.
 * @param {string} proxy
 * @returns {boolean}
 */
function isHttpProxy(proxy) {
  return /^https?:\/\//.test(proxy);
}

/**
 * Returns true when the current platform is Windows.
 * @returns {boolean}
 */
function isWin32Platform() {
  return process.platform === 'win32';
}

/**
 * Returns true when the default port is already free.
 * @param {number} port
 * @param {number} defaultPort
 * @returns {boolean}
 */
function isPortUnchanged(port, defaultPort) {
  return port === defaultPort;
}

/**
 * Returns true when admin permissions are required for the given port.
 * @param {number} defaultPort
 * @returns {boolean}
 */
function requiresAdminPermissions(defaultPort) {
  return process.platform !== 'win32' && defaultPort < 1024 && !isRoot();
}

/**
 * Returns true when the current process is a smoke‑test run.
 * @returns {boolean}
 */
function isSmokeTestRun() {
  return process.argv.some(arg => arg.includes('--smoke-test'));
}

/**
 * Returns true when the hostname is exactly "localhost".
 * @param {string} hostname
 * @returns {boolean}
 */
function isLoopbackHostname(hostname) {
  return hostname === 'localhost';
}

/**
 * Returns true when the request should be proxied.
 * @param {string} appPublicFolder
 * @param {string} servedPathname
 * @param {string} sockPath
 * @param {boolean} isDefaultSockHost
 * @returns {(pathname: string) => boolean}
 */
function createMayProxy(appPublicFolder, servedPathname, sockPath, isDefaultSockHost) {
  return function mayProxy(pathname) {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp('^' + servedPathname), '')
    );
    const isPublicFile = fs.existsSync(maybePublicPath);
    const isWdsEndpoint = isDefaultSockHost && pathname.startsWith(sockPath);
    return !(isPublicFile || isWdsEndpoint);
  };
}

/**
 * Returns true when the compilation messages indicate success.
 * @param {{errors: any[], warnings: any[]}} messages
 * @returns {boolean}
 */
function isSuccessfulCompile(messages) {
  return messages.errors.length === 0 && messages.warnings.length === 0;
}

/**
 * Returns true when there are any compilation errors.
 * @param {{errors: any[]}} messages
 * @returns {boolean}
 */
function hasErrors(messages) {
  return messages.errors.length > 0;
}

/**
 * Returns true when there are any compilation warnings.
 * @param {{warnings: any[]}} messages
 * @returns {boolean}
 */
function hasWarnings(messages) {
  return messages.warnings.length > 0;
}

/**
 * Returns true when more than one error is present.
 * @param {{errors: any[]}} messages
 * @returns {boolean}
 */
function hasMultipleErrors(messages) {
  return messages.errors.length > 1;
}

/* Core utilities ---------------------------------------------------------- */

function prepareUrls(protocol, host, port, pathname = '/') {
  const formatUrl = hostname =>
    url.format({ protocol, hostname, port, pathname });
  const prettyPrintUrl = hostname =>
    url.format({
      protocol,
      hostname,
      port: chalk.bold(port),
      pathname,
    });

  if (!isUnspecifiedHost(host)) {
    const localUrl = prettyPrintUrl(host);
    const browserUrl = formatUrl(host);
    return {
      lanUrlForConfig: undefined,
      lanUrlForTerminal: undefined,
      localUrlForTerminal: localUrl,
      localUrlForBrowser: browserUrl,
    };
  }

  // Unspecified host handling
  const prettyHost = 'localhost';
  let lanUrlForConfig;
  let lanUrlForTerminal;

  try {
    const candidate = address.ip();
    if (candidate && isPrivateIp(candidate)) {
      lanUrlForConfig = candidate;
      lanUrlForTerminal = prettyPrintUrl(candidate);
    }
  } catch (_) {
    // ignore errors
  }

  const localUrl = prettyPrintUrl(prettyHost);
  const browserUrl = formatUrl(prettyHost);
  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal: localUrl,
    localUrlForBrowser: browserUrl,
  };
}

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
  const command = useYarn ? 'yarn' : 'npm run';
  console.log(`To create a production build, use ${chalk.cyan(`${command} build`)}.`);
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

  if (useTypeScript) {
    forkTsCheckerWebpackPlugin
      .getCompilerHooks(compiler)
      .waiting.tap('awaitingTypeScriptCheck', () => {
        console.log(
          chalk.yellow('Files successfully emitted, waiting for typecheck results...')
        );
      });
  }

  compiler.hooks.done.tap('done', async stats => {
    if (isInteractive) {
      clearConsole();
    }

    const statsData = stats.toJson({ all: false, warnings: true, errors: true });
    const messages = formatWebpackMessages(statsData);
    const successful = isSuccessfulCompile(messages);

    if (successful) {
      console.log(chalk.green('Compiled successfully!'));
    }

    if (successful && (isInteractive || createCompiler.isFirstCompile)) {
      printInstructions(appName, urls, useYarn);
    }
    createCompiler.isFirstCompile = false;

    if (hasErrors(messages)) {
      if (hasMultipleErrors(messages)) {
        messages.errors.length = 1;
      }
      console.log(chalk.red('Failed to compile.\n'));
      console.log(messages.errors.join('\n\n'));
      return;
    }

    if (hasWarnings(messages)) {
      console.log(chalk.yellow('Compiled with warnings.\n'));
      console.log(messages.warnings.join('\n\n'));
      console.log('\nSearch for the ' + chalk.underline(chalk.yellow('keywords')) + ' to learn more about each warning.');
      console.log('To ignore, add ' + chalk.cyan('// eslint-disable-next-line') + ' to the line before.\n');
    }
  });
  createCompiler.isFirstCompile = true;

  if (isSmokeTestRun()) {
    compiler.hooks.failed.tap('smokeTest', async () => {
      await createCompiler.tsMessagesPromise;
      process.exit(1);
    });
    compiler.hooks.done.tap('smokeTest', async stats => {
      await createCompiler.tsMessagesPromise;
      process.exit(stats.hasErrors() || stats.hasWarnings() ? 1 : 0);
    });
  }

  return compiler;
}

/**
 * Resolves a proxy URL that points to localhost to an IPv4 loopback address.
 * @param {string} proxy
 * @returns {string}
 */
function resolveLoopback(proxy) {
  const parsed = url.parse(proxy);
  parsed.host = undefined;

  if (!isLoopbackHostname(parsed.hostname)) {
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
 * Returns a custom error handler for http‑proxy‑middleware.
 * @param {string} proxy
 * @returns {(err: Error, req: any, res: any) => void}
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
 * Prepares a proxy configuration for webpack‑dev‑server.
 * @param {string|undefined} proxy
 * @param {string} appPublicFolder
 * @param {string} servedPathname
 * @returns {any[]|undefined}
 */
function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }

  if (!isStringProxy(proxy)) {
    console.log(chalk.red('When specified, "proxy" in package.json must be a string.'));
    console.log(chalk.red(`Instead, the type of "proxy" was "${typeof proxy}".`));
    console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
    process.exit(1);
  }

  if (!isHttpProxy(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;
  const mayProxy = createMayProxy(appPublicFolder, servedPathname, sockPath, isDefaultSockHost);
  const target = isWin32Platform() ? resolveLoopback(proxy) : proxy;

  return [
    {
      target,
      logLevel: 'silent',
      context: function (pathname, req) {
        const isGet = req.method === 'GET';
        const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
        return !isGet || (mayProxy(pathname) && !acceptsHtml);
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
 * Chooses an available port, optionally prompting the user to use a different one.
 * @param {string} host
 * @param {number} defaultPort
 * @returns {Promise<number|null>}
 */
function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (isPortUnchanged(port, defaultPort)) {
          return resolve(port);
        }

        const baseMessage = requiresAdminPermissions(defaultPort)
          ? 'Admin permissions are required to run a server on a port below 1024.'
          : `Something is already running on port ${defaultPort}.`;

        if (!isInteractive) {
          console.log(chalk.red(baseMessage));
          return resolve(null);
        }

        clearConsole();
        const existingProcess = getProcessForPort(defaultPort);
        const extraInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';
        const promptMessage = `${baseMessage}${extraInfo}\n\nWould you like to run the app on another port instead?`;

        const question = {
          type: 'confirm',
          name: 'shouldChangePort',
          message: chalk.yellow(promptMessage),
          initial: true,
        };

        prompts(question).then(answer => {
          resolve(answer.shouldChangePort ? port : null);
        });
      }),
    err => {
      const header = chalk.red(`Could not find an open port at ${chalk.bold(host)}.`);
      const details = `Network error message: ${err.message || err}`;
      throw new Error(`${header}\n${details}\n`);
    }
  );
}

module.exports = {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
};