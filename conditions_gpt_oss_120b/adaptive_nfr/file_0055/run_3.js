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
 * Determines if the given host is unspecified (0.0.0.0 or ::).
 * @param {string} host
 * @returns {boolean}
 */
function isUnspecifiedHost(host) {
  return host === '0.0.0.0' || host === '::';
}

/**
 * Determines if the given IP address is within private ranges.
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateIp(ip) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(ip);
}

/**
 * Returns the host to be used for local URLs.
 * @param {string} host
 * @returns {string}
 */
function getPrettyHost(host) {
  if (isUnspecifiedHost(host)) {
    return 'localhost';
  }
  return host;
}

/**
 * Attempts to obtain LAN URLs when the host is unspecified.
 * @param {string} host
 * @param {function(string): string} prettyPrintUrl
 * @returns {{lanUrlForConfig: string|undefined, lanUrlForTerminal: string|undefined}}
 */
function getLanUrls(host, prettyPrintUrl) {
  if (!isUnspecifiedHost(host)) {
    return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
  }

  try {
    const ip = address.ip();
    if (!ip) {
      return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
    }
    if (isPrivateIp(ip)) {
      return { lanUrlForConfig: ip, lanUrlForTerminal: prettyPrintUrl(ip) };
    }
    return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
  } catch {
    return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
  }
}

/**
 * Prepares various URL strings for display and configuration.
 * @param {string} protocol
 * @param {string} host
 * @param {number|string} port
 * @param {string} [pathname='/']
 * @returns {{lanUrlForConfig: string|undefined, lanUrlForTerminal: string|undefined, localUrlForTerminal: string, localUrlForBrowser: string}}
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const formatUrl = hostname =>
    url.format({ protocol, hostname, port, pathname });
  const prettyPrintUrl = hostname =>
    url.format({ protocol, hostname, port: chalk.bold(port), pathname });

  const prettyHost = getPrettyHost(host);
  const { lanUrlForConfig, lanUrlForTerminal } = getLanUrls(host, prettyPrintUrl);
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
 * Returns the appropriate build command string.
 * @param {boolean} useYarn
 * @returns {string}
 */
function getBuildCommand(useYarn) {
  const cmd = useYarn ? 'yarn' : 'npm run';
  return `${cmd} build`;
}

/**
 * Prints usage instructions to the console.
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
    `To create a production build, use ${chalk.cyan(getBuildCommand(useYarn))}.`
  );
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
 * Determines if there are any compilation errors.
 * @param {{errors:Array}} messages
 * @returns {boolean}
 */
function hasErrors(messages) {
  return messages.errors.length > 0;
}

/**
 * Determines if there are any compilation warnings.
 * @param {{warnings:Array}} messages
 * @returns {boolean}
 */
function hasWarnings(messages) {
  return messages.warnings.length > 0;
}

/**
 * Prints compilation success message.
 */
function printSuccess() {
  console.log(chalk.green('Compiled successfully!'));
}

/**
 * Prints compilation error messages.
 * @param {{errors:Array}} messages
 */
function printErrors(messages) {
  if (messages.errors.length > 1) {
    messages.errors.length = 1;
  }
  console.log(chalk.red('Failed to compile.\n'));
  console.log(messages.errors.join('\n\n'));
}

/**
 * Prints compilation warning messages.
 * @param {{warnings:Array}} messages
 */
function printWarnings(messages) {
  console.log(chalk.yellow('Compiled with warnings.\n'));
  console.log(messages.warnings.join('\n\n'));
  console.log('\nSearch for the ' + chalk.underline(chalk.yellow('keywords')) + ' to learn more about each warning.');
  console.log('To ignore, add ' + chalk.cyan('// eslint-disable-next-line') + ' to the line before.\n');
}

/**
 * Creates a webpack compiler with custom hooks for logging.
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

  let isFirstCompile = true;

  compiler.hooks.done.tap('done', async stats => {
    if (isInteractive) {
      clearConsole();
    }

    const statsData = stats.toJson({ all: false, warnings: true, errors: true });
    const messages = formatWebpackMessages(statsData);
    const successful = isSuccessfulCompilation(messages);

    if (successful) {
      printSuccess();
    }

    if (successful && (isInteractive || isFirstCompile)) {
      printInstructions(appName, urls, useYarn);
    }

    isFirstCompile = false;

    if (hasErrors(messages)) {
      printErrors(messages);
      return;
    }

    if (hasWarnings(messages)) {
      printWarnings(messages);
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
 * Determines if the proxy string starts with http:// or https://.
 * @param {string} proxy
 * @returns {boolean}
 */
function isHttpOrHttps(proxy) {
  return /^https?:\/\//.test(proxy);
}

/**
 * Resolves loopback address for Windows platforms.
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
  } catch {
    parsed.hostname = '127.0.0.1';
  }
  return url.format(parsed);
}

/**
 * Returns a function that logs proxy errors.
 * @param {string} proxy
 * @returns {function(Error, object, object): void}
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
 * Determines if a request should be proxied based on pathname and request details.
 * @param {function(string): boolean} mayProxy
 * @param {object} req
 * @param {string} pathname
 * @returns {boolean}
 */
function shouldProxyRequest(mayProxy, req, pathname) {
  if (req.method !== 'GET') {
    return true;
  }
  if (!mayProxy(pathname)) {
    return false;
  }
  const acceptHeader = req.headers && req.headers.accept;
  return !(acceptHeader && acceptHeader.includes('text/html'));
}

/**
 * Prepares a proxy configuration object.
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
    console.log(chalk.red('Instead, the type of "proxy" was "' + typeof proxy + '".'));
    console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
    process.exit(1);
  }

  if (!isHttpOrHttps(proxy)) {
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
      context: (pathname, req) => shouldProxyRequest(mayProxy, req, pathname),
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
 * Constructs a user-friendly message when the default port is occupied.
 * @param {number} defaultPort
 * @param {string|undefined} existingProcess
 * @returns {string}
 */
function getPortInUseMessage(defaultPort, existingProcess) {
  const baseMessage =
    process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
      ? 'Admin permissions are required to run a server on a port below 1024.'
      : `Something is already running on port ${defaultPort}.`;
  if (existingProcess) {
    return `${baseMessage} Probably:\n  ${existingProcess}`;
  }
  return baseMessage;
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

        const existingProcess = getProcessForPort(defaultPort);
        const message = getPortInUseMessage(defaultPort, existingProcess);
        if (isInteractive) {
          clearConsole();
          const question = {
            type: 'confirm',
            name: 'shouldChangePort',
            message:
              chalk.yellow(message) +
              '\n\nWould you like to run the app on another port instead?',
            initial: true,
          };
          prompts(question).then(answer => {
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