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

function formatUrl(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port,
    pathname,
  });
}

function prettyPrintUrl(protocol, hostname, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port: chalk.bold(port),
    pathname,
  });
}

function isPrivateIpAddress(ipAddress) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(
    ipAddress
  );
}

function getLanUrlForUnspecifiedHost() {
  try {
    const lanUrl = address.ip();
    if (lanUrl && isPrivateIpAddress(lanUrl)) {
      return lanUrl;
    }
  } catch (_e) {
    // ignored
  }
  return undefined;
}

function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  let prettyHost = host;
  let lanUrlForConfig;
  let lanUrlForTerminal;

  if (isUnspecifiedHost) {
    prettyHost = 'localhost';
    lanUrlForConfig = getLanUrlForUnspecifiedHost();
    if (lanUrlForConfig) {
      lanUrlForTerminal = prettyPrintUrl(protocol, lanUrlForConfig, port, pathname);
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

function printLocalUrlLine(urls) {
  console.log(
    `  ${chalk.bold('Local:')}            ${urls.localUrlForTerminal}`
  );
}

function printNetworkUrlLine(urls) {
  console.log(
    `  ${chalk.bold('On Your Network:')}  ${urls.lanUrlForTerminal}`
  );
}

function printUrlLines(urls) {
  if (urls.lanUrlForTerminal) {
    printLocalUrlLine(urls);
    printNetworkUrlLine(urls);
  } else {
    console.log(`  ${urls.localUrlForTerminal}`);
  }
}

function printBuildInstructions(useYarn) {
  const buildCommand = useYarn ? 'yarn' : 'npm run';
  const buildText = `${buildCommand} build`;
  console.log('Note that the development build is not optimized.');
  console.log(`To create a production build, use ${chalk.cyan(buildText)}.`);
}

function printInstructions(appName, urls, useYarn) {
  console.log();
  console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
  console.log();
  printUrlLines(urls);
  console.log();
  printBuildInstructions(useYarn);
  console.log();
}

function handleCompilerInvalidation() {
  if (isInteractive) {
    clearConsole();
  }
  console.log('Compiling...');
}

function handleTypeScriptWaiting() {
  console.log(
    chalk.yellow(
      'Files successfully emitted, waiting for typecheck results...'
    )
  );
}

function setupTypeScriptHooks(compiler) {
  forkTsCheckerWebpackPlugin
    .getCompilerHooks(compiler)
    .waiting.tap('awaitingTypeScriptCheck', handleTypeScriptWaiting);
}

function truncateErrorsIfNeeded(messages) {
  if (messages.errors.length > 1) {
    messages.errors.length = 1;
  }
}

function printCompilationErrors(messages) {
  console.log(chalk.red('Failed to compile.\n'));
  console.log(messages.errors.join('\n\n'));
}

function printCompilationWarnings(messages) {
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

function handleCompilationDone(appName, urls, useYarn, isFirstCompile, messages) {
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
    truncateErrorsIfNeeded(messages);
    printCompilationErrors(messages);
    return;
  }

  if (messages.warnings.length) {
    printCompilationWarnings(messages);
  }
}

function setupCompilerHooks(compiler, appName, urls, useYarn, useTypeScript) {
  let isFirstCompile = true;

  compiler.hooks.invalid.tap('invalid', handleCompilerInvalidation);

  if (useTypeScript) {
    setupTypeScriptHooks(compiler);
  }

  compiler.hooks.done.tap('done', async stats => {
    const statsData = stats.toJson({
      all: false,
      warnings: true,
      errors: true,
    });

    const messages = formatWebpackMessages(statsData);
    handleCompilationDone(appName, urls, useYarn, isFirstCompile, messages);
    isFirstCompile = false;
  });
}

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

function isSmokeTestMode() {
  return process.argv.some(arg => arg.indexOf('--smoke-test') > -1);
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

  setupCompilerHooks(compiler, appName, urls, useYarn, useTypeScript);

  if (isSmokeTestMode()) {
    const tsMessagesPromise = Promise.resolve();
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

function formatProxyErrorMessage(req, proxy, err) {
  const host = req.headers && req.headers.host;
  const firstLine = `${chalk.red('Proxy error:')} Could not proxy request ${chalk.cyan(req.url)} from ${chalk.cyan(host)} to ${chalk.cyan(proxy)}.`;
  const secondLine = `See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (${chalk.cyan(err.code)}).`;
  return { firstLine, secondLine, host };
}

function formatProxyErrorResponse(req, host, proxy, err) {
  return `Proxy error: Could not proxy request ${req.url} from ${host} to ${proxy} (${err.code}).`;
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const { firstLine, secondLine, host } = formatProxyErrorMessage(req, proxy, err);
    console.log(firstLine);
    console.log(secondLine);
    console.log();

    if (res.writeHead && !res.headersSent) {
      res.writeHead(500);
    }
    const errorResponse = formatProxyErrorResponse(req, host, proxy, err);
    res.end(errorResponse);
  };
}

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

function validateProxyProtocol(proxy) {
  if (!/^http(s)?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }
}

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

function prepareProxy(proxy, appPublicFolder, servedPathname) {
  if (!proxy) {
    return undefined;
  }

  validateProxyType(proxy);
  validateProxyProtocol(proxy);

  const sockPath = process.env.WDS_SOCKET_PATH || '/ws';
  const isDefaultSockHost = !process.env.WDS_SOCKET_HOST;
  const mayProxy = createMayProxyFunction(appPublicFolder, servedPathname, sockPath, isDefaultSockHost);

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
      context: createProxyContextFunction(mayProxy),
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

function getPortSelectionMessage(defaultPort) {
  if (process.platform !== 'win32' && defaultPort < 1024 && !isRoot()) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

function createPortSelectionQuestion(message, defaultPort, existingProcess) {
  const processInfo = existingProcess ? ` Probably:\n  ${existingProcess}` : '';
  return {
    type: 'confirm',
    name: 'shouldChangePort',
    message: chalk.yellow(message + processInfo) + '\n\nWould you like to run the app on another port instead?',
    initial: true,
  };
}

function handlePortSelection(port, defaultPort) {
  return new Promise(resolve => {
    if (port === defaultPort) {
      return resolve(port);
    }

    const message = getPortSelectionMessage(defaultPort);

    if (isInteractive) {
      clearConsole();
      const existingProcess = getProcessForPort(defaultPort);
      const question = createPortSelectionQuestion(message, defaultPort, existingProcess);

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
  });
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port => handlePortSelection(port, defaultPort),
    err => {
      const errorMessage = `Could not find an open port at ${chalk.bold(host)}.`;
      const networkError = `Network error message: ${err.message || err}`;
      throw new Error(chalk.red(errorMessage) + '\n' + networkError + '\n');
    }
  );
}

module.exports = {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
};