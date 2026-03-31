```javascript
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
const PRIVATE_IP_REGEX = /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/;
const UNSPECIFIED_HOSTS = ['0.0.0.0', '::'];
const SMOKE_TEST_FLAG = '--smoke-test';
const WDS_SOCKET_PATH = process.env.WDS_SOCKET_PATH || '/ws';
const IS_DEFAULT_SOCK_HOST = !process.env.WDS_SOCKET_HOST;

// ============================================================================
// URL Preparation
// ============================================================================

function isPrivateIp(ip) {
  return PRIVATE_IP_REGEX.test(ip);
}

function getLanUrl(host) {
  try {
    const ip = address.ip();
    if (ip && isPrivateIp(ip)) {
      return ip;
    }
  } catch (_e) {
    // ignored
  }
  return undefined;
}

function formatUrl(hostname, protocol, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port,
    pathname,
  });
}

function formatUrlForTerminal(hostname, protocol, port, pathname) {
  return url.format({
    protocol,
    hostname,
    port: chalk.bold(port),
    pathname,
  });
}

function prepareUrls(protocol, host, port, pathname = '/') {
  const isUnspecifiedHost = UNSPECIFIED_HOSTS.includes(host);
  const prettyHost = isUnspecifiedHost ? 'localhost' : host;
  
  const lanUrlForConfig = isUnspecifiedHost ? getLanUrl(host) : undefined;
  const lanUrlForTerminal = lanUrlForConfig
    ? formatUrlForTerminal(lanUrlForConfig, protocol, port, pathname)
    : undefined;

  const localUrlForTerminal = formatUrlForTerminal(prettyHost, protocol, port, pathname);
  const localUrlForBrowser = formatUrl(prettyHost, protocol, port, pathname);

  return {
    lanUrlForConfig,
    lanUrlForTerminal,
    localUrlForTerminal,
    localUrlForBrowser,
  };
}

// ============================================================================
// Console Output
// ============================================================================

function printInstructions(appName, urls, useYarn) {
  console.log();
  console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
  console.log();

  if (urls.lanUrlForTerminal) {
    console.log(
      `  ${chalk.bold('Local:')}            ${urls.localUrlForTerminal}`
    );
    console.log(
      `  ${chalk.bold('On Your Network:')}  ${urls.lanUrlForTerminal}`
    );
  } else {
    console.log(`  ${urls.localUrlForTerminal}`);
  }

  console.log();
  console.log('Note that the development build is not optimized.');
  const buildCommand = useYarn ? 'yarn' : 'npm run';
  console.log(
    `To create a production build, use ${chalk.cyan(`${buildCommand} build`)}.`
  );
  console.log();
}

// ============================================================================
// Compiler Hooks
// ============================================================================

function setupInvalidHook(compiler) {
  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });
}

function setupTypeScriptHook(compiler) {
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

function handleCompilationSuccess(appName, urls, useYarn) {
  console.log(chalk.green('Compiled successfully!'));
  printInstructions(appName, urls, useYarn);
}

function handleCompilationErrors(messages) {
  if (messages.errors.length > 1) {
    messages.errors.length = 1;
  }
  console.log(chalk.red('Failed to compile.\n'));
  console.log(messages.errors.join('\n\n'));
}

function handleCompilationWarnings(messages) {
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

function setupDoneHook(compiler, appName, urls, useYarn) {
  let isFirstCompile = true;

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
      handleCompilationSuccess(appName, urls, useYarn);
    }

    if (isSuccessful && !isFirstCompile && !isInteractive) {
      isFirstCompile = false;
      return;
    }

    isFirstCompile = false;

    if (messages.errors.length) {
      handleCompilationErrors(messages);
      return;
    }

    if (messages.warnings.length) {
      handleCompilationWarnings(messages);
    }
  });
}

function setupSmokeTestHooks(compiler, tsMessagesPromise) {
  compiler.hooks.failed.tap('smokeTest', async () => {
    await tsMessagesPromise;
    process.exit(1);
  });

  compiler.hooks.done.tap('smokeTest', async stats => {
    await tsMessagesPromise;
    process.exit(stats.hasErrors() || stats.hasWarnings() ? 1 : 0);
  });
}

function isSmokeTest() {
  return process.argv.some(arg => arg.includes(SMOKE_TEST_FLAG));
}

// ============================================================================
// Compiler Creation
// ============================================================================

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

  if (useTypeScript) {
    setupTypeScriptHook(compiler);
  }

  const tsMessagesPromise = Promise.resolve();
  setupDoneHook(compiler, appName, urls, useYarn);

  if (isSmokeTest()) {
    setupSmokeTestHooks(compiler, tsMessagesPromise);
  }

  return compiler;
}

// ============================================================================
// Proxy Configuration
// ============================================================================

function resolveLoopback(proxy) {
  const o = url.parse(proxy);
  o.host = undefined;

  if (o.hostname !== 'localhost') {
    return proxy;
  }

  try {
    o.hostname = address.ip() ? 'localhost' : '127.0.0.1';
  } catch (_ignored) {
    o.hostname = '127.0.0.1';
  }

  return url.format(o);
}

function formatProxyError(err, req, proxy) {
  const host = req.headers?.host || 'unknown';
  return (
    `Proxy error: Could not proxy request ${req.url} from ${host} to ${proxy} (${err.code}).`
  );
}

function onProxyError(proxy) {
  return (err, req, res) => {
    const host = req.headers?.host;
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
    res.end(formatProxyError(err, req, proxy));
  };
}

function validateProxyConfig(proxy) {
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

  if (!/^https?:\/\//.test(proxy)) {
    console.log(
      chalk.red(
        'When "proxy" is specified in package.json it must start with either http:// or https://'
      )
    );
    process.exit(1);
  }
}

function createMayProxyFunction(appPublicFolder, servedPathname) {
  return (pathname) => {
    const maybePublicPath = path.resolve(
      appPublicFolder,
      pathname.replace(new RegExp('^' + servedPathname), '')
    );
    const isPublicFileRequest = fs.existsSync(maybePublicPath);
    const isWdsEndpointRequest =
      IS_DEFAULT_SOCK_HOST && pathname.startsWith(WDS_SOCKET_PATH);
    return !(isPublicFileRequest || isWdsEndpointRequest);
  };
}

function createProxyContext(mayProxy, target) {
  return (pathname, req) => {
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

  validateProxyConfig(proxy);

  const mayProxy = createMayProxyFunction(appPublicFolder, servedPathname);
  const target = process.platform === 'win32' ? resolveLoopback(proxy) : proxy;

  return [
    {
      target,
      logLevel: 'silent',
      context: createProxyContext(mayProxy, target),
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

// ============================================================================
// Port Selection
// ============================================================================

function getPortSelectionMessage(defaultPort) {
  if (process.platform !== 'win32' && defaultPort < 1024 && !isRoot()) {
    return 'Admin permissions are required to run a server on a port below 1024.';
  }
  return `Something is already running on port ${defaultPort}.`;
}

function promptPortChange(defaultPort, message) {
  clearConsole();
  const existingProcess = getProcessForPort(defaultPort);
  const question = {
    type: 'confirm',
    name: 'shouldChangePort',
    message:
      chalk.yellow(
        message +
          `${existingProcess ? ` Probably:\n  ${existingProcess}` : ''}`
      ) + '\n\nWould you like to run the app on another port instead?',
    initial: true,
  };

  return prompts(question).then(answer => answer.shouldChangePort);
}

function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }

        const message = getPortSelectionMessage(defaultPort);

        if (isInteractive) {
          promptPortChange(defaultPort, message).then(shouldChange => {
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
```