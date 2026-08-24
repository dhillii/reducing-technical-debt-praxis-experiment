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
    console.warn('Git commit not created', e);
    console.warn('Removing .git directory...');
    try {
      fs.removeSync(path.join(appPath, '.git'));
    } catch (removeErr) {
      // Ignore.
    }
    return false;
  }
}

/**
 * Determines whether to use Yarn based on presence of yarn.lock
 * @param {string} appPath - Path to the application directory
 * @returns {boolean} - True if Yarn should be used
 */
function shouldUseYarn(appPath) {
  return fs.existsSync(path.join(appPath, 'yarn.lock'));
}

/**
 * Returns command configuration based on package manager
 * @param {boolean} useYarn - Whether to use Yarn
 * @returns {{ command: string, remove: string, args: string[] }} - Command configuration
 */
function getPackageManagerConfig(useYarn) {
  if (useYarn) {
    return {
      command: 'yarnpkg',
      remove: 'remove',
      args: ['add'],
    };
  }
  return {
    command: 'npm',
    remove: 'uninstall',
    args: ['install', '--no-audit', '--save'],
  };
}

/**
 * Extracts dependencies to install from template configuration
 * @param {Object} templatePackage - Template package configuration
 * @returns {Array<[string, string]>} - Array of [name, version] pairs
 */
function getDependenciesToInstall(templatePackage) {
  return Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
}

/**
 * Adds React and React DOM to dependencies if missing
 * @param {string[]} args - Current arguments array
 * @param {Object} appPackage - Application package.json object
 * @returns {string[]} - Updated arguments array
 */
function addReactIfMissing(args, appPackage) {
  if (!isReactInstalled(appPackage)) {
    return args.concat(['react', 'react-dom']);
  }
  return args;
}

/**
 * Installs dependencies using the specified command
 * @param {string} command - Package manager command
 * @param {string[]} args - Arguments to pass to the command
 * @returns {boolean} - True if installation succeeded
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
 * Updates README.md commands based on package manager
 * @param {string} appPath - Path to the application directory
 * @param {boolean} useYarn - Whether to use Yarn
 */
function updateReadmeCommands(appPath, useYarn) {
  if (!useYarn) return;

  try {
    const readmePath = path.join(appPath, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(readmePath, readme.replace(/(npm run |npm )/g, 'yarn '), 'utf8');
  } catch (err) {
    // Silencing the error. As it falls back to using default npm commands.
  }
}

/**
 * Handles .gitignore file setup
 * @param {string} appPath - Path to the application directory
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
 * Updates package.json with template configuration
 * @param {Object} appPackage - Application package.json object
 * @param {Object} templatePackage - Template package configuration
 * @param {boolean} useYarn - Whether to use Yarn
 */
function updatePackageJson(appPackage, templatePackage, useYarn) {
  const templatePackageBlacklist = [
    'name', 'version', 'description', 'keywords', 'bugs', 'license',
    'author', 'contributors', 'files', 'browser', 'bin', 'man',
    'directories', 'repository', 'peerDependencies', 'bundledDependencies',
    'optionalDependencies', 'engineStrict', 'os', 'cpu', 'preferGlobal',
    'private', 'publishConfig',
  ];

  const templatePackageToMerge = ['dependencies', 'scripts'];
  const templatePackageToReplace = Object.keys(templatePackage).filter(key => {
    return (
      !templatePackageBlacklist.includes(key) &&
      !templatePackageToMerge.includes(key)
    );
  });

  appPackage.dependencies = appPackage.dependencies || {};
  appPackage.scripts = Object.assign(
    {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test',
      eject: 'react-scripts eject',
    },
    templatePackage.scripts || {}
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

  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

/**
 * Writes updated package.json to disk
 * @param {string} appPath - Path to the application directory
 * @param {Object} appPackage - Application package.json object
 */
function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

/**
 * Renames existing README.md to README.old.md
 * @param {string} appPath - Path to the application directory
 */
function renameReadmeIfExists(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
  }
}

/**
 * Copies template files to application directory
 * @param {string} templatePath - Path to the template directory
 * @param {string} appPath - Path to the application directory
 * @returns {boolean} - True if template was copied successfully
 */
function copyTemplateFiles(templatePath, appPath) {
  const templateDir = path.join(templatePath, 'template');
  if (!fs.existsSync(templateDir)) {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return false;
  }
  fs.copySync(templateDir, appPath);
  return true;
}

/**
 * Checks if React is installed in the application
 * @param {Object} appPackage - Application package.json object
 * @returns {boolean} - True if React and React DOM are installed
 */
function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = shouldUseYarn(appPath);

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

  // This was deprecated in CRA v5.
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

  updatePackageJson(appPackage, templatePackage, useYarn);
  writePackageJson(appPath, appPackage);
  renameReadmeIfExists(appPath);

  if (!copyTemplateFiles(templatePath, appPath)) {
    return;
  }

  updateReadmeCommands(appPath, useYarn);
  setupGitignore(appPath);

  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  const { command, remove, args } = getPackageManagerConfig(useYarn);
  const dependenciesToInstall = getDependenciesToInstall(templatePackage);
  let installArgs = args.concat(
    dependenciesToInstall.map(([dependency, version]) => {
      return `${dependency}@${version}`;
    })
  );

  installArgs = addReactIfMissing(installArgs, appPackage);

  if ((!isReactInstalled(appPackage) || templateName) && installArgs.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    if (!installDependencies(command, installArgs)) {
      return;
    }
  }

  if (installArgs.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  console.log(`Removing template package using ${command}...`);
  console.log();

  if (!installDependencies(command, [remove, templateName])) {
    return;
  }

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  let cdpath;
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    cdpath = appName;
  } else {
    cdpath = appPath;
  }

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
    '    and scripts into the app directory. If you do this, you can’t go back!'
  );
  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdpath);
  console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
  
  if (fs.existsSync(path.join(appPath, 'README.old.md'))) {
    console.log();
    console.log(
      chalk.yellow(
        'You had a `README.md` file, we renamed it to `README.old.md`'
      )
    );
  }
  console.log();
  console.log('Happy hacking!');
};