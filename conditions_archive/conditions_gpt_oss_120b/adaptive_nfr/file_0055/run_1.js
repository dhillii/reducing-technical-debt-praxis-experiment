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
/* Helper predicates                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns true if the supplied host is an unspecified address.
 * @param {string} host
 * @returns {boolean}
 */
function isUnspecifiedHost(host) {
  return host === '0.0.0.0' || host === '::';
}

/**
 * Returns true if the supplied IP address belongs to a private range.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIp(ip) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(ip);
}

/**
 * Returns true when the compilation succeeded without warnings or errors.
 * @param {{errors: any[], warnings: any[]}} messages
 * @returns {boolean}
 */
function isSuccessfulCompilation(messages) {
  return messages.errors.length === 0 && messages.warnings.length === 0;
}

/**
 * Returns true when there are compilation errors.
 * @param {{errors: any[]}} messages
 * @returns {boolean}
 */
function hasErrors(messages) {
  return messages.errors.length > 0;
}

/**
 * Returns true when there are compilation warnings.
 * @param {{warnings: any[]}} messages
 * @returns {boolean}
 */
function hasWarnings(messages) {
  return messages.warnings.length > 0;
}

/**
 * Returns true when the environment is interactive or this is the first compile.
 * @param {boolean} interactive
 * @param {boolean} firstCompile
 * @returns {boolean}
 */
function shouldPrintInstructions(interactive, firstCompile) {
  return interactive || firstCompile;
}

/**
 * Returns true when the supplied argument looks like a smoke‑test flag.
 * @param {string[]} argv
 * @returns {boolean}
 */
function isSmokeTest(argv) {
  return argv.some(arg => arg.indexOf('--smoke-test') > -1);
}

/**
 * Returns true when the supplied pathname points to a public file.
 * @param {string} pathname
 * @param {string} appPublicFolder
 * @param {string} servedPathname
 * @returns {boolean}
 */
function isPublicFileRequest(pathname, appPublicFolder, servedPathname) {
  const maybePublicPath = path.resolve(
    appPublicFolder,
    pathname.replace(new RegExp('^' + servedPathname), '')
  );
  return fs.existsSync(maybePublicPath);
}

/**
 * Returns true when the request targets the WebpackDevServer socket endpoint.
 * @param {string} pathname
 * @param {boolean} isDefaultSockHost
 * @param {string} sockPath
 * @returns {boolean}
 */
function isWdsEndpointRequest(pathname, isDefaultSockHost, sockPath) {
  return isDefaultSockHost && pathname.startsWith(sockPath);
}

/**
 * Returns true when a request should be proxied.
 * @param {string} pathname
 * @param {string} appPublicFolder
 * @param {string} servedPathname
 * @param {boolean} isDefaultSockHost
 * @param {string} sockPath
 * @returns {boolean}
 */
function mayProxy(pathname, appPublicFolder, servedPathname, isDefaultSockHost, sockPath) {
  return !(
    isPublicFileRequest(pathname, appPublicFolder, servedPathname) ||
    isWdsEndpointRequest(pathname, isDefaultSockHost, sockPath)
  );
}

/**
 * Returns a human‑readable message describing why the default port cannot be used.
 * @param {number} defaultPort
 * @returns {string}
 */
function buildPortConflictMessage(defaultPort) {
  if (process.platform !== 'win32' && defaultPort < 1024 && !isRoot()) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

/**
 * Returns a formatted prompt message for port selection.
 * @param {string} baseMessage
 * @param {string|undefined} existingProcess
 * @returns {string}
 */
function buildPortPromptMessage(baseMessage, existingProcess) {
  const processInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';
  return `${baseMessage}${processInfo}`;
}

/* -------------------------------------------------------------------------- */
/* Core utilities                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Prepares URLs for local and LAN access.
 * @param {string} protocol
 * @param {string} host
 * @param {number|string} port
 * @param {string} [pathname='/']
 * @returns {{
 *   lanUrlForConfig: string|undefined,
 *   lanUrlForTerminal: string|undefined,
 *   localUrlForTerminal: string,
 *   localUrlForBrowser: string
 * }}
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const formatUrl = hostname => url.format({ protocol, hostname, port, pathname });
  const prettyPrintUrl = hostname =>
    url.format({ protocol, hostname, port: chalk.bold(port), pathname });

  let prettyHost = host;
  let lanUrlForConfig;
  let lanUrlForTerminal;

  if (isUnspecifiedHost(host)) {
    prettyHost = 'localhost';
    try {
      const candidate = address.ip();
      if (candidate && isPrivateIp(candidate)) {
        lanUrlForConfig = candidate;
        lanUrlForTerminal = prettyPrintUrl(candidate);
      }
    } catch (_) {
      // ignore
    }
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

/**
 * Prints startup instructions to the console.
 * @param {string} appName
 * @param {{localUrlForTerminal:string, lanUrlForTerminal:string|undefined}} urls
 * @param {boolean} useYarn
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
  console.log(
    `To create a production build, use ${chalk.cyan(`${useYarn ? 'yarn' : 'npm run'} build`)}.`
  );
  console.log();
}

/**
 * Creates a webpack compiler with custom hooks.
 * @param {object} options
 * @param {string} options.appName
 * @param {object} options.config
 * @param {{localUrlForTerminal:string, lanUrlForTerminal:string|undefined}} options.urls
 * @param {boolean} options.useYarn
 * @param {boolean} options.useTypeScript
 * @param {function} options.webpack
 * @returns {object} webpack compiler
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
        console.log(
          chalk.yellow('Files successfully emitted, waiting for typecheck results...')
        );
      });
  }

  // Done hook – handle success, warnings and errors.
  compiler.hooks.done.tap('done', async stats => {
    if (isInteractive) {
      clearConsole();
    }

    const statsData = stats.toJson({ all: false, warnings: true, errors: true });
    const messages = formatWebpackMessages(statsData);
    const successful = isSuccessfulCompilation(messages);

    if (successful) {
      console.log(chalk.green('Compiled successfully!'));
    }

    if (successful && shouldPrintInstructions(isInteractive, isFirstCompile)) {
      printInstructions(appName, urls, useYarn);
    }

    isFirstCompile = false;

    if (hasErrors(messages)) {
      // Show only the first error to avoid noise.
      if (messages.errors.length > 1) {
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

  // Smoke‑test handling.
  if (isSmokeTest(process.argv)) {
    compiler.hooks.failed.tap('smokeTest', async () => {
      await tsMessagesPromise;
      process.exit(1);
    });
    compiler.hooks.done.tap('smokeTest', async stats => {
      await tsMessagesPromise;
      process.exit(stats.hasErrors() || stats.hasWarnings() ? 1 : 0);
    });
  }

  return compiler;
}

/**
 * Resolves a proxy URL that points to localhost, preferring IPv4 for compatibility.
 * @param {string} proxy
 * @returns {string}
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
 * Returns a custom error handler for http‑proxy‑middleware.
 * @param {string} proxy
 * @returns {function}
 */
function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers && req.headers.host;
    console.log(
      `${chalk.red('Proxy error:')} Could not proxy request ${chalk.cyan(
        req.url
      )} from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`
    );
    console.log(
      `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(
        err.code
      )}).`
    );
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    res.end(
      `Proxy error: Could not proxy request ${req.url} from ${host} to ${proxy} (${err.code}).`
    );
  };
}

/**
 * Prepares a proxy configuration for webpack‑dev‑server.
 * @param {string|undefined} proxy
 * @param {string} appPublicFolder
 * @param {string} servedPathname
 * @returns {Array|undefined}
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

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;

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
      context: function (pathname, req) {
        const shouldProxy =
          req.method !== 'GET' ||
          (mayProxy(pathname, appPublicFolder, servedPathname, isDefaultSockHost, sockPath) &&
            req.headers.accept &&
            req.headers.accept.indexOf('text/html') === -1);
        return shouldProxy;
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
 * Chooses an available port, prompting the user if the default is occupied.
 * @param {string} host
 * @param {number} defaultPort
 * @returns {Promise<number|null>}
 */
function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }

        const conflictMessage = buildPortConflictMessage(defaultPort);
        if (isInteractive) {
          clearConsole();
          const existingProcess = getProcessForPort(defaultPort);
          const promptMessage = buildPortPromptMessage(conflictMessage, existingProcess);
          const question = {
            type: 'confirm',
            name: 'shouldChangePort',
            message: chalk.yellow(promptMessage) + '\n\nWould you like to run the app on another port instead?',
            initial: true,
          };
          prompts(question).then(answer => {
            resolve(answer.shouldChangePort ? port : null);
          });
        } else {
          console.log(chalk.red(conflictMessage));
          resolve(null);
        }
      }),
    err => {
      throw new Error(
        `${chalk.red(`Could not find an open port at ${chalk.bold(host)}.`)}\nNetwork error message: ${err.message || err}\n`
      );
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Exported API                                                               */
/* -------------------------------------------------------------------------- */

module.exports = {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
};