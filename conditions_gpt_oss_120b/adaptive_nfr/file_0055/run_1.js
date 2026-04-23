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
 * Checks if the given host is unspecified (0.0.0.0 or ::).
 * @param {string} host
 * @returns {boolean}
 */
function isUnspecifiedHost(host) {
  return host === '0.0.0.0' || host === '::';
}

/**
 * Checks if the given IP address belongs to a private range.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIp(ip) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(ip);
}

/**
 * Formats a URL for display.
 * @param {string} protocol
 * @param {string} hostname
 * @param {number|string} port
 * @param {string} pathname
 * @returns {string}
 */
function formatUrl(protocol, hostname, port, pathname) {
  return url.format({ protocol, hostname, port, pathname });
}

/**
 * Formats a URL for pretty printing (bold port).
 * @param {string} protocol
 * @param {string} hostname
 * @param {number|string} port
 * @param {string} pathname
 * @returns {string}
 */
function prettyPrintUrl(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port: chalk.bold(port),
    pathname,
  });
}

/**
 * Prepares various URL variants for the dev server.
 * @param {string} protocol
 * @param {string} host
 * @param {number|string} port
 * @param {string} [pathname='/']
 * @returns {{lanUrlForConfig?:string, lanUrlForTerminal?:string, localUrlForTerminal:string, localUrlForBrowser:string}}
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecified = isUnspecifiedHost(host);
  let prettyHost = isUnspecified ? 'localhost' : host;
  let lanUrlForConfig;
  let lanUrlForTerminal;

  if (isUnspecified) {
    try {
      const possibleIp = address.ip();
      if (possibleIp && isPrivateIp(possibleIp)) {
        lanUrlForConfig = possibleIp;
        lanUrlForTerminal = prettyPrintUrl(protocol, possibleIp, port, pathname);
      }
    } catch (_) {
      // ignore
    }
  }

  const localUrlForTerminal = prettyPrintUrl(protocol, prettyHost, port, pathname);
  const localUrlForBrowser = formatUrl(protocol, prettyHost, port, pathname);

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
 * @param {{localUrlForTerminal:string, lanUrlForTerminal?:string}} urls
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
  const command = useYarn ? 'yarn' : 'npm run';
  console.log(`To create a production build, use ${chalk.cyan(`${command} build`)}.`);
  console.log();
}

/**
 * Determines if the compilation was successful (no errors and no warnings).
 * @param {{errors:Array, warnings:Array}} messages
 * @returns {boolean}
 */
function isSuccessfulCompilation(messages) {
  return messages.errors.length === 0 && messages.warnings.length === 0;
}

/**
 * Handles the 'done' hook for the webpack compiler.
 * @param {object} params
 * @param {string} params.appName
 * @param {{localUrlForTerminal:string, lanUrlForTerminal?:string}} params.urls
 * @param {boolean} params.useYarn
 * @param {boolean} params.isInteractive
 * @param {boolean} params.isFirstCompile
 * @param {function} params.printInstructions
 * @param {object} stats
 * @returns {boolean} indicates whether first compile flag should be reset
 */
function handleDoneHook({ appName, urls, useYarn, isInteractive, isFirstCompile, printInstructions }, stats) {
  if (isInteractive) {
    clearConsole();
  }

  const statsData = stats.toJson({ all: false, warnings: true, errors: true });
  const messages = formatWebpackMessages(statsData);
  const successful = isSuccessfulCompilation(messages);

  if (successful) {
    console.log(chalk.green('Compiled successfully!'));
  }

  if (successful && (isInteractive || isFirstCompile)) {
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
    console.log('\nSearch for the ' + chalk.underline(chalk.yellow('keywords')) + ' to learn more about each warning.');
    console.log('To ignore, add ' + chalk.cyan('// eslint-disable-next-line') + ' to the line before.\n');
  }

  return true;
}

/**
 * Creates a webpack compiler with custom hooks.
 * @param {object} options
 * @param {string} options.appName
 * @param {object} options.config
 * @param {{localUrlForTerminal:string, lanUrlForTerminal?:string}} options.urls
 * @param {boolean} options.useYarn
 * @param {boolean} options.useTypeScript
 * @param {function} options.webpack
 * @returns {object}
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
        console.log(chalk.yellow('Files successfully emitted, waiting for typecheck results...'));
      });
  }

  let isFirstCompile = true;

  compiler.hooks.done.tap('done', async stats => {
    const shouldContinue = handleDoneHook(
      { appName, urls, useYarn, isInteractive, isFirstCompile, printInstructions },
      stats
    );
    isFirstCompile = false;
    if (!shouldContinue) {
      return;
    }
  });

  const isSmokeTest = process.argv.some(arg => arg.includes('--smoke-test'));
  if (isSmokeTest) {
    compiler.hooks.failed.tap('smokeTest', async () => {
      process.exit(1);
    });
    compiler.hooks.done.tap('smokeTest', async stats => {
      if (stats.hasErrors() || stats.hasWarnings()) {
        process.exit(1);
      }
      process.exit(0);
    });
  }

  return compiler;
}

/**
 * Resolves a proxy URL to a loopback address when needed.
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
 * Generates an error handler for proxy failures.
 * @param {string} proxy
 * @returns {function}
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
      `Proxy error: Could not proxy request ${req.url} from ${host} to ${proxy} (${err.code}).`
    );
  };
}

/**
 * Determines if a request pathname should be proxied.
 * @param {string} pathname
 * @param {string} appPublicFolder
 * @param {string} servedPathname
 * @param {string} sockPath
 * @param {boolean} isDefaultSockHost
 * @returns {boolean}
 */
function shouldProxyPath(pathname, appPublicFolder, servedPathname, sockPath, isDefaultSockHost) {
  const maybePublicPath = path.resolve(
    appPublicFolder,
    pathname.replace(new RegExp('^' + servedPathname), '')
  );
  const isPublicFileRequest = fs.existsSync(maybePublicPath);
  const isWdsEndpointRequest = isDefaultSockHost && pathname.startsWith(sockPath);
  return !(isPublicFileRequest || isWdsEndpointRequest);
}

/**
 * Prepares a proxy configuration for http-proxy-middleware.
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

  if (!/^https?:\/\//.test(proxy)) {
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
      context: (pathname, req) => {
        const canProxy = req.method !== 'GET' ||
          (shouldProxyPath(pathname, appPublicFolder, servedPathname, sockPath, isDefaultSockHost) &&
            req.headers.accept &&
            req.headers.accept.indexOf('text/html') === -1);
        return canProxy;
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
 * Determines the appropriate message when the default port is unavailable.
 * @param {number} defaultPort
 * @param {string} host
 * @returns {string}
 */
function getPortInUseMessage(defaultPort, host) {
  const adminMsg = process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
    ? 'Admin permissions are required to run a server on a port below 1024.'
    : `Something is already running on port ${defaultPort}.`;
  return adminMsg;
}

/**
 * Chooses an available port, prompting the user if necessary.
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

        const message = getPortInUseMessage(defaultPort, host);

        if (isInteractive) {
          clearConsole();
          const existingProcess = getProcessForPort(defaultPort);
          const extraInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';
          const promptMessage = `${chalk.yellow(message + extraInfo)}\n\nWould you like to run the app on another port instead?`;

          prompts({
            type: 'confirm',
            name: 'shouldChangePort',
            message: promptMessage,
            initial: true,
          }).then(answer => {
            if (answer.shouldChangePort) {
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
          ('Network error message: ' + (err.message || err)) +
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