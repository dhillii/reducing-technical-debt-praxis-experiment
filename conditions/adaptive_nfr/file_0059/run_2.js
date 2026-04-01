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
 * Loads template configuration from template.json
 * @param {string} templatePath - Path to template directory
 * @returns {object} Template configuration object
 */
function loadTemplateConfig(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  let templateJson = {};
  
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }

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

  return templateJson;
}

/**
 * Filters template package keys to determine which should be merged/replaced
 * @param {object} templatePackage - Template package configuration
 * @returns {object} Object with keysToMerge and keysToReplace arrays
 */
function getTemplatePackageKeys(templatePackage) {
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

  const keysToReplace = Object.keys(templatePackage).filter(key => {
    return (
      !templatePackageBlacklist.includes(key) &&
      !templatePackageToMerge.includes(key)
    );
  });

  return {
    keysToMerge: templatePackageToMerge,
    keysToReplace,
  };
}

/**
 * Configures app package.json with template and default settings
 * @param {object} appPackage - Application package configuration
 * @param {object} templatePackage - Template package configuration
 * @param {boolean} useYarn - Whether to use yarn as package manager
 * @param {array} keysToReplace - Keys to replace from template
 */
function configureAppPackage(appPackage, templatePackage, useYarn, keysToReplace) {
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

  if (useYarn) {
    appPackage.scripts = Object.entries(appPackage.scripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }

  appPackage.eslintConfig = {
    extends: 'react-app',
  };

  appPackage.browserslist = defaultBrowsers;

  keysToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

/**
 * Handles gitignore file setup
 * @param {string} appPath - Application path
 */
function setupGitignore(appPath) {
  const gitignoreExists = fs.existsSync(path.join(appPath, '.gitignore'));
  if (gitignoreExists) {
    const data = fs.readFileSync(path.join(appPath, 'gitignore'));
    fs.appendFileSync(path.join(appPath, '.gitignore'), data);
    fs.unlinkSync(path.join(appPath, 'gitignore'));
  } else {
    fs.moveSync(
      path.join(appPath, 'gitignore'),
      path.join(appPath, '.gitignore'),
      []
    );
  }
}

/**
 * Gets package manager configuration based on useYarn flag
 * @param {boolean} useYarn - Whether to use yarn
 * @param {boolean} verbose - Verbose output flag
 * @returns {object} Object with command, remove, and args properties
 */
function getPackageManagerConfig(useYarn, verbose) {
  const yarnConfig = {
    command: 'yarnpkg',
    remove: 'remove',
    args: ['add'],
  };

  const npmConfig = {
    command: 'npm',
    remove: 'uninstall',
    args: [
      'install',
      '--no-audit',
      '--save',
      verbose && '--verbose',
    ].filter(e => e),
  };

  return useYarn ? yarnConfig : npmConfig;
}

/**
 * Builds dependency installation arguments
 * @param {array} baseArgs - Base arguments array
 * @param {object} templatePackage - Template package configuration
 * @param {object} appPackage - Application package configuration
 * @returns {array} Complete arguments array
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
 * Determines if dependencies should be installed
 * @param {object} appPackage - Application package configuration
 * @param {string} templateName - Template name
 * @param {array} args - Installation arguments
 * @returns {boolean} True if installation should proceed
 */
function shouldInstallDependencies(appPackage, templateName, args) {
  return (!isReactInstalled(appPackage) || templateName) && args.length > 1;
}

/**
 * Executes package manager install command
 * @param {string} command - Package manager command
 * @param {array} args - Installation arguments
 * @returns {boolean} True if successful, false otherwise
 */
function executeInstall(command, args) {
  console.log();
  console.log(`Installing template dependencies using ${command}...`);

  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

/**
 * Removes template package
 * @param {string} command - Package manager command
 * @param {string} remove - Remove command (uninstall/remove)
 * @param {string} templateName - Template name to remove
 * @returns {boolean} True if successful, false otherwise
 */
function removeTemplate(command, remove, templateName) {
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
 * Determines the cd path for user instructions
 * @param {string} originalDirectory - Original working directory
 * @param {string} appName - Application name
 * @param {string} appPath - Application path
 * @returns {string} The path to display to user
 */
function getCdPath(originalDirectory, appName, appPath) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}

/**
 * Displays success message and instructions
 * @param {string} appName - Application name
 * @param {string} appPath - Application path
 * @param {string} cdpath - Path to cd into
 * @param {boolean} useYarn - Whether yarn is being used
 * @param {boolean} readmeExists - Whether README.md existed
 */
function displaySuccessMessage(appName, appPath, cdpath, useYarn, readmeExists) {
  const displayedCommand = useYarn ? 'yarn' : 'npm';

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
    '    and scripts into the app directory. If you do this, you can't go back!'
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
 * Updates README.md for yarn users
 * @param {string} appPath - Application path
 * @param {boolean} useYarn - Whether yarn is being used
 */
function updateReadmeForPackageManager(appPath, useYarn) {
  if (useYarn) {
    try {
      const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
      fs.writeFileSync(
        path.join(appPath, 'README.md'),
        readme.replace(/(npm run |npm )/g, 'yarn '),
        'utf8'
      );
    } catch (err) {
      // Silencing the error. As it fall backs to using default npm commands.
    }
  }
}

/**
 * Copies template files to app directory
 * @param {string} templatePath - Path to template
 * @param {string} appPath - Application path
 * @returns {boolean} True if successful, false otherwise
 */
function copyTemplateFiles(templatePath, appPath) {
  const templateDir = path.join(templatePath, 'template');
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
    return true;
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return false;
  }
}

/**
 * Handles README.md renaming if it exists
 * @param {string} appPath - Application path
 * @returns {boolean} True if README existed, false otherwise
 */
function handleExistingReadme(appPath) {
  const readmeExists = fs