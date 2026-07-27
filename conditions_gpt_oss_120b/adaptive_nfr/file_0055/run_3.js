/**
 * Returns the package manager command based on the user's preference.
 * @param {boolean} useYarn - Whether Yarn is being used.
 * @returns {string} The command string ('yarn' or 'npm run').
 */
function getPackageManagerCommand(useYarn) {
  return useYarn ? 'yarn' : 'npm run';
}

/**
 * Returns the colored build command string.
 * @param {boolean} useYarn - Whether Yarn is being used.
 * @returns {string} The cyan-colored build command.
 */
function getColoredBuildCommand(useYarn) {
  const cmd = `${getPackageManagerCommand(useYarn)} build`;
  return chalk.cyan(cmd);
}

/**
 * Prints the development build note and production build instruction.
 * @param {boolean} useYarn - Whether Yarn is being used.
 */
function printBuildInstructions(useYarn) {
  console.log('Note that the development build is not optimized.');
  console.log(`To create a production build, use ${getColoredBuildCommand(useYarn)}.`);
}

/**
 * Prints the local and network URLs.
 * @param {object} urls - The URLs object returned from prepareUrls.
 */
function printUrlInfo(urls) {
  if (urls.lanUrlForTerminal) {
    console.log(`  ${chalk.bold('Local:')}            ${urls.localUrlForTerminal}`);
    console.log(`  ${chalk.bold('On Your Network:')}  ${urls.lanUrlForTerminal}`);
  } else {
    console.log(`  ${urls.localUrlForTerminal}`);
  }
}

/**
 * Prints instructions after the development server starts.
 * @param {string} appName - The name of the application.
 * @param {object} urls - The URLs object returned from prepareUrls.
 * @param {boolean} useYarn - Whether Yarn is being used.
 */
function printInstructions(appName, urls, useYarn) {
  console.log();
  console.log(`You can now view ${chalk.bold(appName)} in the browser.`);
  console.log();

  printUrlInfo(urls);

  console.log();
  printBuildInstructions(useYarn);
  console.log();
}

/**
 * Determines if the given hostname is a private IP address.
 * @param {string} hostname - The hostname to test.
 * @returns {boolean} True if the hostname is private.
 */
function isPrivateIp(hostname) {
  return /^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(hostname);
}

/**
 * Prepares URLs for the development server.
 * @param {string} protocol - The protocol (http/https).
 * @param {string} host - The host name.
 * @param {number} port - The port number.
 * @param {string} [pathname='/'] - The base pathname.
 * @returns {object} An object containing formatted URLs.
 */
function prepareUrls(protocol, host, port, pathname = '/') {
  const formatUrl = hostname =>
    url.format({
      protocol,
      hostname,
      port,
      pathname,
    });
  const prettyPrintUrl = hostname =>
    url.format({
      protocol,
      hostname,
      port: chalk.bold(port),
      pathname,
    });

  const isUnspecifiedHost = host === '0.0.0.0' || host === '::';
  let prettyHost, lanUrlForConfig, lanUrlForTerminal;
  if (isUnspecifiedHost) {
    prettyHost = 'localhost';
    try {
      // This can only return an IPv4 address
      lanUrlForConfig = address.ip();
      if (lanUrlForConfig && isPrivateIp(lanUrlForConfig)) {
        // Address is private, format it for later use
        lanUrlForTerminal = prettyPrintUrl(lanUrlForConfig);
      } else {
        // Address is not private, so we will discard it
        lanUrlForConfig = undefined;
      }
    } catch (_e) {
      // ignored
    }
  } else {
    prettyHost = host;
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
 * Determines whether a request should be proxied.
 * @param {string} pathname - The request pathname.
 * @param {string} appPublicFolder - Path to the public folder.
 * @param {string} servedPathname - The served pathname.
 * @param {string} sockPath - The WebSocket path.
 * @param {boolean} isDefaultSockHost - Whether the default socket host is used.
 * @returns {boolean} True if the request may be proxied.
 */
function mayProxy(pathname, appPublicFolder, servedPathname, sockPath, isDefaultSockHost) {
  const maybePublicPath = path.resolve(
    appPublicFolder,
    pathname.replace(new RegExp('^' + servedPathname), '')
  );
  const isPublicFileRequest = fs.existsSync(maybePublicPath);
  const isWdsEndpointRequest = isDefaultSockHost && pathname.startsWith(sockPath);
  return !isPublicFileRequest && !isWdsEndpointRequest;
}

/**
 * Prepares the proxy configuration.
 * @param {string|undefined} proxy - The proxy URL.
 * @param {string} appPublicFolder - Path to the public folder.
 * @param {string} servedPathname - The served pathname.
 * @returns {Array|undefined} Proxy configuration array or undefined.
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
        const canProxy = req.method !== 'GET' ||
          (mayProxy(pathname, appPublicFolder, servedPathname, sockPath, isDefaultSockHost) &&
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
 * Chooses an available port, prompting the user if necessary.
 * @param {string} host - The host name.
 * @param {number} defaultPort - The default port.
 * @returns {Promise<number|null>} The chosen port or null.
 */
function choosePort(host, defaultPort) {
  return detect(defaultPort, host).then(
    port =>
      new Promise(resolve => {
        if (port === defaultPort) {
          return resolve(port);
        }
        const message =
          process.platform !== 'win32' && defaultPort < 1024 && !isRoot()
            ? 'Admin permissions are required to run a server on a port below 1024.'
            : `Something is already running on port ${defaultPort}.`;
        if (isInteractive) {
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
          ('Network error message: ' + err.message || err) +
          '\n'
      );
    }
  );
}

/**
 * Creates a webpack compiler with custom hooks.
 * @param {object} options - Compiler options.
 * @returns {object} The webpack compiler instance.
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

  compiler.hooks.invalid.tap('invalid', () => {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });

  let isFirstCompile = true;
  let tsMessagesPromise;

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
    isFirstCompile = false;

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

  const isSmokeTest = process.argv.some(arg => arg.indexOf('--smoke-test') > -1);
  if (isSmokeTest) {
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

  return compiler;
}

/**
 * Resolves a loopback address for proxy URLs.
 * @param {string} proxy - The proxy URL.
 * @returns {string} The resolved URL.
 */
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

/**
 * Returns an error handler for proxy errors.
 * @param {string} proxy - The proxy target.
 * @returns {function} The error handling middleware.
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

module.exports = {
  choosePort,
  createCompiler,
  prepareProxy,
  prepareUrls,
};