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

/** @returns {boolean} Whether React is installed in the package */
function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};

  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

/** @returns {Object} Package manager configuration based on useYarn flag */
function getPackageManagerConfig(useYarn) {
  if (useYarn) {
    return {
      command: 'yarnpkg',
      remove: 'remove',
      args: ['add'],
      displayCommand: 'yarn',
    };
  }
  return {
    command: 'npm',
    remove: 'uninstall',
    args: ['install', '--no-audit', '--save'],
    displayCommand: 'npm',
  };
}

/** @returns {string[]} Install arguments with optional verbose flag */
function buildInstallArgs(config, verbose) {
  const args = [...config.args];
  if (!config.displayCommand && verbose) {
    args.push('--verbose');
  }
  return args.filter(e => e);
}

/** Validates template name and returns template path */
function resolveTemplatePath(appPath, templateName) {
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
    return null;
  }

  return path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
}

/** Loads and validates template.json configuration */
function loadTemplateJson(templatePath) {
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

/** Filters template package keys to determine which should be merged */
function getTemplatePackageKeysToReplace(templatePackage) {
  const blacklist = [
    'name', 'version', 'description', 'keywords', 'bugs', 'license',
    'author', 'contributors', 'files', 'browser', 'bin', 'man',
    'directories', 'repository', 'peerDependencies', 'bundledDependencies',
    'optionalDependencies', 'engineStrict', 'os', 'cpu', 'preferGlobal',
    'private', 'publishConfig',
  ];
  const toMerge = ['dependencies', 'scripts'];

  return Object.keys(templatePackage).filter(key => {
    return !blacklist.includes(key) && !toMerge.includes(key);
  });
}

/** Updates app package scripts based on package manager */
function updatePackageScripts(appPackage, templateScripts, useYarn) {
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
}

/** Handles .gitignore file setup */
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

/** Updates README.md for package manager if using Yarn */
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
    // Silencing the error. As it fall backs to using default npm commands.
  }
}

/** Copies template directory to app path */
function copyTemplateFiles(templatePath, appPath) {
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

/** Handles README.md backup if it exists */
function backupExistingReadme(appPath) {
  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }
  return readmeExists;
}

/** Installs dependencies using package manager */
function installDependencies(command, args) {
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

/** Removes template package */
function removeTemplate(command, remove, templateName) {
  const proc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    return false;
  }
  return true;
}

/** Determines the appropriate cd path for user instructions */
function getCdPath(originalDirectory, appName, appPath) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}

/** Displays success message and next steps */
function displaySuccessMessage(appName, appPath, cdpath, displayedCommand, useYarn, readmeExists) {
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

module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  const templatePath = resolveTemplatePath(appPath, templateName);
  if (!templatePath) {
    return;
  }

  const templateJson = loadTemplateJson(templatePath);
  const templatePackage = templateJson.package || {};
  const templatePackageToReplace = getTemplatePackageKeysToReplace(templatePackage);
  const templateScripts = templatePackage.scripts || {};

  appPackage.dependencies = appPackage.dependencies || {};
  updatePackageScripts(appPackage, templateScripts, useYarn);

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

  if (!copyTemplateFiles(templatePath, appPath)) {
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

  const pmConfig = getPackageManagerConfig(useYarn);
  const args = buildInstallArgs(pmConfig, verbose);

  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (dependenciesToInstall.length) {
    args.push(
      ...dependenciesToInstall.map(([dependency, version]) => {
        return `${dependency}@${version}`;
      })
    );
  }

  if (!isReactInstalled(appPackage)) {
    args.push('react', 'react-dom');
  }

  if ((!isReactInstalled(appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${pmConfig.command}...`);

    if (!installDependencies(pmConfig.command, args)) {
      return;
    }
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  console.log(`Removing template package using ${pmConfig.command}...`);
  console.log();

  if (!removeTemplate(pmConfig.command, pmConfig.remove, templateName)) {
    return;
  }

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdpath = getCdPath(originalDirectory, appName, appPath);
  displaySuccessMessage(appName, appPath, cdpath, pmConfig.displayCommand, useYarn, readmeExists);
};