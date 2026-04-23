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
 * Checks if an IP address belongs to a private range.
 */
function isPrivateIp(ip) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(ip);
}

/**
 * Formats a URL for display in the terminal.
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
 * Formats a URL for use by the browser.
 */
function formatBrowserUrl(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port,
    pathname,
  });
}

/**
 * Determines LAN URL information when the host is unspecified.
 */
function getLanInfo(host) {
  if (host !== '0.0.0.0' && host !== '::') {
    return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
  }

  try {
    const ip = address.ip();
    if (ip && isPrivateIp(ip)) {
      return {
        lanUrlForConfig: ip,
        lanUrlForTerminal: formatPrettyUrl('http', ip, process.env.PORT, '/'),
      };
    }
  } catch (_) {
    // ignore errors
  }
  return { lanUrlForConfig: undefined, lanUrlForTerminal: undefined };
}

/**
 * Prepares URLs for local and LAN access.
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const { lanUrlForConfig, lanUrlForTerminal } = getLanInfo(host);
  const prettyHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;

  const localUrlForTerminal = formatPrettyUrl(protocol, prettyHost, port, pathname);
  const localUrlForBrowser = formatBrowserUrl(protocol, prettyHost, port, pathname);

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

/**
 * Builds the production build instruction message.
 */
function buildProductionMessage(useYarn) {
  const cmd = useYarn ? 'yarn' : 'npm run';
  return `To create a production build, use ${chalk.cyan(`${cmd} build`)}.`;
}

/**
 * Prints usage instructions after the first successful compile.
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
  console.log(buildProductionMessage(useYarn));
  console.log();
}

/**
 * Handles the "invalid" webpack hook.
 */
function handleInvalidHook() {
  if (isInteractive) {
    clearConsole();
  }
  console.log('Compiling...');
}

/**
 * Handles the "done" webpack hook.
 */
function handleDoneHook({
  stats,
  isInteractive,
  isFirstCompile,
  appName,
  urls,
  useYarn,
}) {
  if (isInteractive) {
    clearConsole();
  }

  const statsData = stats.toJson({ all: false, warnings: true, errors: true });
  const messages = formatWebpackMessages(statsData);
  const isSuccessful = !messages.errors.length && !messages.warnings.length;

  if (isSuccessful) {
    console.log(chalk.green('Compiled successfully!'));
  }
  if (isSuccessful && (isInteractive || isFirstCompile)) {
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
 * Sets up smoke test hooks if the process was started with --smoke-test.
 */
function maybeAddSmokeTestHooks(compiler, tsMessagesPromise) {
  const isSmokeTest = process.argv.some(arg => arg.includes('--smoke-test'));
  if (!isSmokeTest) return;

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

  compiler.hooks.invalid.tap('invalid', handleInvalidHook);

  let isFirstCompile = true;
  let tsMessagesPromise;

  if (useTypeScript) {
    forkTsCheckerWebpackPlugin
      .getCompilerHooks(compiler)
      .waiting.tap('awaitingTypeScriptCheck', () => {
        console.log(chalk.yellow('Files successfully emitted, waiting for typecheck results...'));
      });
  }

  compiler.hooks.done.tap('done', async stats => {
    const success = handleDoneHook({
      stats,
      isInteractive,
      isFirstCompile,
      appName,
      urls,
      useYarn,
    });
    isFirstCompile = false;
    if (!success) {
      // early exit after errors have been logged
    }
  });

  maybeAddSmokeTestHooks(compiler, tsMessagesPromise);
  return compiler;
}

/**
 * Resolves localhost to an IPv4 address when necessary.
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
 * Generates a detailed proxy error message.
 */
function buildProxyErrorMessage(err, req, proxy) {
  const host = req.headers && req.headers.host;
  const base = chalk.red('Proxy error:') + ' Could not proxy request ';
  const details = `${chalk.cyan(req.url)} from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`;
  const info = `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(err.code)}).`;
  return `${base}${details}\n${info}\n`;
}

/**
 * Returns a middleware error handler for the proxy.
 */
function onProxyError(proxy) {
  return (err, req, res) => {
    console.log(buildProxyErrorMessage(err, req, proxy));

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    res.end(
      `Proxy error: Could not proxy request ${req.url} from ${req.headers && req.headers.host} to ${proxy} (${err.code}).`
    );
  };
}

/**
 * Validates and prepares the proxy configuration.
 */
function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) return undefined;
  if (typeof proxy !== 'string') {
    console.log(chalk.red('When specified, "proxy" in package.json must be a string.'));
    console.log(chalk.red(`Instead, the type of "proxy" was "${typeof proxy}".`));
    console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
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
 * Builds a user-friendly message describing why a port cannot be used.
 */
function buildPortConflictMessage(defaultPort) {
  if (process.platform !== 'win32' && defaultPort < 1024 && !isRoot()) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
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

        const message = buildPortConflictMessage(defaultPort);
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