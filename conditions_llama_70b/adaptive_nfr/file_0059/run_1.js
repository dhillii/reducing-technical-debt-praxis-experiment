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

function getPackageManager(useYarn) {
  /**
   * Returns the package manager command and arguments based on the useYarn flag.
   * @param {boolean} useYarn - Whether to use Yarn or npm.
   * @returns {object} - An object containing the package manager command and arguments.
   */
  if (useYarn) {
    return {
      command: 'yarnpkg',
      remove: 'remove',
      args: ['add'],
    };
  } else {
    return {
      command: 'npm',
      remove: 'uninstall',
      args: [
        'install',
        '--no-audit', // https://github.com/facebook/create-react-app/issues/11174
        '--save',
      ],
    };
  }
}

function getDisplayedCommand(useYarn) {
  /**
   * Returns the displayed command based on the useYarn flag.
   * @param {boolean} useYarn - Whether to use Yarn or npm.
   * @returns {string} - The displayed command.
   */
  return useYarn ? 'yarn' : 'npm';
}

function isReactInstalled(appPackage) {
  /**
   * Checks if React is installed in the app package.
   * @param {object} appPackage - The app package.json object.
   * @returns {boolean} - Whether React is installed.
   */
  const dependencies = appPackage.dependencies || {};

  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

function setupPackageJson(appPath, appName, templateName, verbose, originalDirectory) {
  /**
   * Sets up the package.json file for the app.
   * @param {string} appPath - The path to the app directory.
   * @param {string} appName - The name of the app.
   * @param {string} templateName - The name of the template.
   * @param {boolean} verbose - Whether to display verbose output.
   * @param {string} originalDirectory - The original directory.
   */
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

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

  // Keys to ignore in templatePackage
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

  // Keys from templatePackage that will be merged with appPackage
  const templatePackageToMerge = ['dependencies', 'scripts'];

  // Keys from templatePackage that will be added to appPackage,
  // replacing any existing entries.
  const templatePackageToReplace = Object.keys(templatePackage).filter(key => {
    return (
      !templatePackageBlacklist.includes(key) &&
      !templatePackageToMerge.includes(key)
    );
  });

  // Copy over some of the devDependencies
  appPackage.dependencies = appPackage.dependencies || {};

  // Setup the script rules
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

  // Update scripts for Yarn users
  if (useYarn) {
    appPackage.scripts = Object.entries(appPackage.scripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }

  // Setup the eslint config
  appPackage.eslintConfig = {
    extends: 'react-app',
  };

  // Setup the browsers list
  appPackage.browserslist = defaultBrowsers;

  // Add templatePackage keys/values to appPackage, replacing existing entries
  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

function installDependencies(appPath, templateName, verbose, useYarn) {
  /**
   * Installs the dependencies for the app.
   * @param {string} appPath - The path to the app directory.
   * @param {string} templateName - The name of the template.
   * @param {boolean} verbose - Whether to display verbose output.
   * @param {boolean} useYarn - Whether to use Yarn or npm.
   */
  const packageManager = getPackageManager(useYarn);
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJsonPath = path.join(templatePath, 'template.json');

  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }

  const templatePackage = templateJson.package || {};

  // Install additional template dependencies, if present.
  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
  if (dependenciesToInstall.length) {
    packageManager.args = packageManager.args.concat(
      dependenciesToInstall.map(([dependency, version]) => {
        return `${dependency}@${version}`;
      })
    );
  }

  // Install react and react-dom for backward compatibility with old CRA cli
  // which doesn't install react and react-dom along with react-scripts
  const appPackage = require(path.join(appPath, 'package.json'));
  if (!isReactInstalled(appPackage)) {
    packageManager.args = packageManager.args.concat(['react', 'react-dom']);
  }

  // Install template dependencies, and react and react-dom if missing.
  if (
    (!isReactInstalled(appPackage) || templateName) &&
    packageManager.args.length > 1
  ) {
    console.log();
    console.log(`Installing template dependencies using ${packageManager.command}...`);

    const proc = spawn.sync(packageManager.command, packageManager.args, {
      stdio: 'inherit',
    });
    if (proc.status !== 0) {
      console.error(`\`${packageManager.command} ${packageManager.args.join(' ')}\` failed`);
      return;
    }
  }

  if (packageManager.args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }
}

function removeTemplate(appPath, templateName, useYarn) {
  /**
   * Removes the template package.
   * @param {string} appPath - The path to the app directory.
   * @param {string} templateName - The name of the template.
   * @param {boolean} useYarn - Whether to use Yarn or npm.
   */
  const packageManager = getPackageManager(useYarn);

  console.log(`Removing template package using ${packageManager.command}...`);
  console.log();

  const proc = spawn.sync(packageManager.command, [packageManager.remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${packageManager.command} ${packageManager.remove} ${templateName}\` failed`);
    return;
  }
}

function createGitCommit(appPath) {
  /**
   * Creates a git commit for the app.
   * @param {string} appPath - The path to the app directory.
   */
  if (tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }
}

function displaySuccessMessage(appPath, appName, originalDirectory, useYarn) {
  /**
   * Displays the success message for the app creation.
   * @param {string} appPath - The path to the app directory.
   * @param {string} appName - The name of the app.
   * @param {string} originalDirectory - The original directory.
   * @param {boolean} useYarn - Whether to use Yarn or npm.
   */
  const displayedCommand = getDisplayedCommand(useYarn);

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
  let cdpath;
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    cdpath = appName;
  } else {
    cdpath = appPath;
  }
  console.log(chalk.cyan('  cd'), cdpath);
  console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
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

  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  setupPackageJson(appPath, appName, templateName, verbose, originalDirectory);

  const templateDir = path.join(
    path.dirname(
      require.resolve(`${templateName}/package.json`, { paths: [appPath] })
    ),
    'template'
  );
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return;
  }

  // modifies README.md commands based on user used package manager.
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

  const gitignoreExists = fs.existsSync(path.join(appPath, '.gitignore'));
  if (gitignoreExists) {
    // Append if there's already a `.gitignore` file there
    const data = fs.readFileSync(path.join(appPath, 'gitignore'));
    fs.appendFileSync(path.join(appPath, '.gitignore'), data);
    fs.unlinkSync(path.join(appPath, 'gitignore'));
  } else {
    // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
    // See: https://github.com/npm/npm/issues/1862
    fs.moveSync(
      path.join(appPath, 'gitignore'),
      path.join(appPath, '.gitignore'),
      []
    );
  }

  // Initialize git repo
  let initializedGit = false;

  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  installDependencies(appPath, templateName, verbose, useYarn);

  removeTemplate(appPath, templateName, useYarn);

  createGitCommit(appPath);

  displaySuccessMessage(appPath, appName, originalDirectory, useYarn);
};