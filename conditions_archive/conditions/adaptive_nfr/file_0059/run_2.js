```javascript
// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

// Makes the script crash on unhandled rejections instead of silently
// ignoring them. In the future, promise rejections that are not handled will
// terminate the Node.js process with a non-zero exit code.
process.on('unhandledRejection', err => {
  throw err;
});

const fs = require('fs-extra');
const path = require('path');
const chalk = require('react-dev-utils/chalk');
const execSync = require('child_process').execSync;
const spawn = require('react-dev-utils/crossSpawn');
const { defaultBrowsers } = require('react-dev-utils/browsersHelper');
const os = require('os');
const verifyTypeScriptSetup = require('./utils/verifyTypeScriptSetup');

function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function isInMercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function tryGitInit() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    if (isInGitRepository() || isInMercurialRepository()) {
      return false;
    }

    execSync('git init', { stdio: 'ignore' });
    return true;
  } catch (e) {
    console.warn('Git repo not initialized', e);
    return false;
  }
}

function tryGitCommit(appPath) {
  try {
    execSync('git add -A', { stdio: 'ignore' });
    execSync('git commit -m "Initialize project using Create React App"', {
      stdio: 'ignore',
    });
    return true;
  } catch (e) {
    // We couldn't commit in already initialized git repo,
    // maybe the commit author config is not set.
    // In the future, we might supply our own committer
    // like Ember CLI does, but for now, let's just
    // remove the Git files to avoid a half-done state.
    console.warn('Git commit not created', e);
    console.warn('Removing .git directory...');
    try {
      // unlinkSync() doesn't work on directories.
      fs.removeSync(path.join(appPath, '.git'));
    } catch (removeErr) {
      // Ignore.
    }
    return false;
  }
}

/**
 * Validates template name is provided
 * @param {string} templateName - The template name
 * @returns {boolean} True if valid, false otherwise
 */
function isValidTemplateName(templateName) {
  if (!templateName) {
    console.log('');
    console.error(
      `A template was not provided. This is likely because you're using an outdated version of ${chalk.cyan(
        'create-react-app'
      )}.`
    );
    console.error(
      `Please note that global installs of ${chalk.cyan(
        'create-react-app'
      )} are no longer supported.`
    );
    console.error(
      `You can fix this by running ${chalk.cyan(
        'npm uninstall -g create-react-app'
      )} or ${chalk.cyan(
        'yarn global remove create-react-app'
      )} before using ${chalk.cyan('create-react-app')} again.`
    );
    return false;
  }
  return true;
}

/**
 * Logs deprecation warning for old template.json format
 * @param {object} templateJson - The template JSON object
 */
function logTemplateDeprecationWarning(templateJson) {
  if (templateJson.dependencies || templateJson.scripts) {
    console.log();
    console.log(
      chalk.red(
        'Root-level `dependencies` and `scripts` keys in `template.json` were deprecated for Create React App 5.\n' +
          'This template needs to be updated to use the new `package` key.'
      )
    );
    console.log('For more information, visit https://cra.link/templates');
  }
}

/**
 * Gets keys from template package to replace in app package
 * @param {object} templatePackage - The template package object
 * @param {string[]} blacklist - Keys to exclude
 * @param {string[]} mergeKeys - Keys that will be merged instead of replaced
 * @returns {string[]} Array of keys to replace
 */
function getTemplatePackageKeysToReplace(templatePackage, blacklist, mergeKeys) {
  return Object.keys(templatePackage).filter(key => {
    return !blacklist.includes(key) && !mergeKeys.includes(key);
  });
}

/**
 * Strategy object for package manager commands
 */
const packageManagerStrategies = {
  yarn: {
    command: 'yarnpkg',
    remove: 'remove',
    args: ['add'],
    displayName: 'yarn',
  },
  npm: {
    command: 'npm',
    remove: 'uninstall',
    args: [
      'install',
      '--no-audit',
      '--save',
    ],
    displayName: 'npm',
  },
};

/**
 * Gets package manager strategy based on yarn lock existence
 * @param {boolean} useYarn - Whether yarn is being used
 * @param {boolean} verbose - Verbose output flag
 * @returns {object} Package manager strategy
 */
function getPackageManagerStrategy(useYarn, verbose) {
  const strategy = useYarn
    ? packageManagerStrategies.yarn
    : packageManagerStrategies.npm;

  if (!useYarn && verbose) {
    strategy.args = [...strategy.args, '--verbose'];
  }

  return strategy;
}

/**
 * Updates scripts for yarn users
 * @param {object} scripts - The scripts object
 * @param {boolean} useYarn - Whether yarn is being used
 * @returns {object} Updated scripts
 */
function updateScriptsForPackageManager(scripts, useYarn) {
  if (!useYarn) {
    return scripts;
  }

  return Object.entries(scripts).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}

/**
 * Handles gitignore file setup
 * @param {string} appPath - The app path
 */
function setupGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const gitignoreExists = fs.existsSync(gitignorePath);

  if (gitignoreExists) {
    const data = fs.readFileSync(path.join(appPath, 'gitignore'));
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(path.join(appPath, 'gitignore'));
  } else {
    fs.moveSync(
      path.join(appPath, 'gitignore'),
      gitignorePath,
      []
    );
  }
}

/**
 * Updates README.md for package manager
 * @param {string} appPath - The app path
 * @param {boolean} useYarn - Whether yarn is being used
 */
function updateReadmeForPackageManager(appPath, useYarn) {
  if (!useYarn) {
    return;
  }

  try {
    const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
    fs.writeFileSync(
      path.join(appPath, 'README.md'),
      readme.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch (err) {
    // Silencing the error. As it falls back to using default npm commands.
  }
}

/**
 * Handles template directory copy
 * @param {string} templatePath - The template path
 * @param {string} appPath - The app path
 * @returns {boolean} True if successful, false otherwise
 */
function copyTemplateDirectory(templatePath, appPath) {
  const templateDir = path.join(templatePath, 'template');
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
    return true;
  }

  console.error(
    `Could not locate supplied template: ${chalk.green(templateDir)}`
  );
  return false;
}

/**
 * Handles README.md backup if it exists
 * @param {string} appPath - The app path
 * @returns {boolean} True if README existed, false otherwise
 */
function backupExistingReadme(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  const readmeExists = fs.existsSync(readmePath);

  if (readmeExists) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
  }

  return readmeExists;
}

/**
 * Installs dependencies using package manager
 * @param {string} command - The package manager command
 * @param {string[]} args - The arguments
 * @returns {boolean} True if successful, false otherwise
 */
function installDependencies(command, args) {
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

/**
 * Removes template package
 * @param {string} command - The package manager command
 * @param {string} remove - The remove command
 * @param {string} templateName - The template name
 * @returns {boolean} True if successful, false otherwise
 */
function removeTemplatePackage(command, remove, templateName) {
  console.log(`Removing template package using ${command}...`);
  console.log();

  const proc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });

  if (proc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    return false;
  }

  return true;
}

/**
 * Displays success message and next steps
 * @param {string} appName - The app name
 * @param {string} appPath - The app path
 * @param {string} originalDirectory - The original directory
 * @param {boolean} useYarn - Whether yarn is being used
 * @param {boolean} readmeExists - Whether README existed
 */
function displaySuccessMessage(appName, appPath, originalDirectory, useYarn, readmeExists) {
  const displayedCommand = useYarn ? 'yarn' : 'npm';
  const cdpath = originalDirectory && path.join(originalDirectory, appName) === appPath
    ? appName
    : appPath;

  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}build`)
  );
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}eject`)
  );
  console.log(
    '    Removes this tool and copies build dependencies, configuration files'
  );
  console.log(
    '    and scripts into the app directory. If you do this, you can\'t go back!'
  );
  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdpath);
  console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);

  if (readmeExists) {
    console.log();
    console.log(
      chalk.yellow(
        'You had a `README.md` file, we renamed it to `README.old.md`'
      )
    );
  }

  console.log();
  console.log('Happy hacking!');
}

/**
 * Builds install arguments for dependencies
 * @param {string[]} baseArgs - Base arguments
 * @param {object} templatePackage - Template package object
 * @param {object} appPackage - App package object
 * @returns {string[]} Complete arguments array
 */
function buildInstallArgs(baseArgs, templatePackage, appPackage) {
  let args = [...baseArgs];

  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (dependenciesToInstall.length) {
    args = args.concat(
      dependenciesToInstall.map(([dependency, version]) => {
        return `${dependency}@${version}`;
      })
    );
  }

  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  return args;
}

/**
 * Determines if installation should proceed
 * @param {object} appPackage - App package object
 * @param {string} templateName - Template name
 * @param {string[]} args - Arguments array
 * @returns {boolean} True if installation should proceed
 */
function shouldInstallDependencies(appPackage, templateName, args) {
  return (!isReactInstalled(appPackage) || templateName) && args.length > 1;
}

module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  if (!isValidTemplateName(templateName)) {
    return;
  }

  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );

  const templateJsonPath = path.join(templatePath, 'template.json');

  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }

  const templatePackage = templateJson.package || {};

  logTemplateDeprecationWarning(templateJson);

  const templatePackageBlacklist = [
    'name',
    'version',
    'description',
    'keywords',
    'bugs',
    'license',
    'author',
    'contributors',
    'files',
    'browser',
    'bin',
    'man',
    'directories',
    'repository',
    'peerDependencies',
    'bundledDependencies',
    'optionalDependencies',
    'engineStrict',
    'os',
    'cpu',
    'preferGlobal',
    'private',
    'publishConfig',
  ];

  const templatePackageToMerge = ['dependencies', 'scripts'];

  const templatePackageToReplace = getTemplatePackageKeysToReplace(
    templatePackage,
    templatePackageBlacklist,
    templatePackageToMerge
  );

  appPackage.dependencies = appPackage.dependencies || {};

  const templateScripts = templatePackage.scripts || {};
  appPackage.scripts = Object.assign(
    {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test',
      eject: 'react-scripts eject',
    },
    templateScripts
  );

  appPackage.scripts = updateScriptsForPackageManager(appPackage.scripts, useYarn);

  appPackage.eslintConfig = {
    extends: 'react-app',
  };

  appPackage.browserslist = defaultBrowsers;

  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  const readmeExists = backupExistingReadme(appPath);

  if (!copyTemplateDirectory(templatePath, appPath)) {
    return;
  }

  updateReadmeForPackageManager(appPath, useYarn);

  setupGitignore(appPath);

  let initializedGit = false;

  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  const strategy = getPackageManagerStrategy(useYarn, verbose);
  let args = [...strategy.args];

  args = buildInstallArgs(args, templatePackage, appPackage);

  if (shouldInstallDependencies(appPackage, templateName, args)) {
    console.log();
    console.log(`Installing template dependencies using ${strategy.command}...`);

    if (!installDependencies(strategy.command, args)) {
      return;
    }
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  if (!removeTemplatePackage(strategy.command, strategy.remove, templateName)) {
    return;
  }

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  displaySuccessMessage(appName, appPath, originalDirectory, useYarn, readmeExists);
};

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};

  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}
```