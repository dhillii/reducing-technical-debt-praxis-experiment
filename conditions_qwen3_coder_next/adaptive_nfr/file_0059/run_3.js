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
 * Determines whether to use Yarn package manager based on presence of lockfile.
 * @returns {boolean} True if yarn.lock exists.
 */
function shouldUseYarn(appPath) {
  return fs.existsSync(path.join(appPath, 'yarn.lock'));
}

/**
 * Returns package manager metadata based on detection.
 * @param {boolean} useYarn - Whether to use yarn.
 * @returns {Object} Object containing command, remove command, and install args.
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
 * Applies template package configuration to app package.
 */
function applyTemplatePackageConfiguration(
  appPackage,
  templatePackage,
  useYarn
) {
  // Setup scripts
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

  // Normalize script names for Yarn
  if (useYarn) {
    appPackage.scripts = Object.entries(appPackage.scripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }

  // Setup eslint config
  appPackage.eslintConfig = {
    extends: 'react-app',
  };

  // Setup browsers list
  appPackage.browserslist = defaultBrowsers;

  // Blacklisted keys that should not be merged
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

  // Keys to merge
  const templatePackageToMerge = ['dependencies', 'scripts'];

  // Keys to replace
  const templatePackageToReplace = Object.keys(templatePackage).filter(key => {
    return (
      !templatePackageBlacklist.includes(key) &&
      !templatePackageToMerge.includes(key)
    );
  });

  // Apply merged keys
  templatePackageToMerge.forEach(key => {
    if (templatePackage[key]) {
      appPackage[key] = Object.assign({}, appPackage[key] || {}, templatePackage[key]);
    }
  });

  // Apply replaced keys
  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  return appPackage;
}

/**
 * Handles README.md renaming and Yarn command normalization.
 * @param {string} appPath - Path to app directory.
 * @param {boolean} useYarn - Whether to use yarn.
 */
function processReadme(appPath, useYarn) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
  }

  if (useYarn) {
    try {
      const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
      fs.writeFileSync(
        path.join(appPath, 'README.md'),
        readme.replace(/(npm run |npm )/g, 'yarn '),
        'utf8'
      );
    } catch (err) {
      // Silencing the error. Falls back to default npm commands.
    }
  }
}

/**
 * Handles gitignore setup, including appending or renaming.
 * @param {string} appPath - Path to app directory.
 */
function processGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const gitignoreSrcPath = path.join(appPath, 'gitignore');

  if (fs.existsSync(gitignorePath)) {
    // Append existing .gitignore
    const data = fs.readFileSync(gitignoreSrcPath);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(gitignoreSrcPath);
  } else {
    // Rename gitignore to .gitignore to avoid npm renaming
    fs.moveSync(gitignoreSrcPath, gitignorePath, []);
  }
}

/**
 * Class encapsulating all package manager operations.
 */
class PackageManager {
  constructor(useYarn, appPath) {
    this.config = getPackageManagerConfig(useYarn);
    this.appPath = appPath;
  }

  /**
   * Installs dependencies excluding the template package.
   * @param {Object} appPackage - Parsed package.json content.
   * @param {string} templateName - Name of the template being used.
   * @returns {boolean} Install success.
   */
  installDependencies(appPackage, templateName) {
    const dependenciesToInstall = Object.entries({
      ...appPackage.dependencies,
      ...appPackage.devDependencies,
    }).filter(([name]) => name !== templateName);

    const args = [...this.config.args];

    if (dependenciesToInstall.length) {
      args.push(
        ...dependenciesToInstall.map(([dependency, version]) => {
          return `${dependency}@${version}`;
        })
      );
    }

    if (!this.isReactInstalled(appPackage)) {
      args.push('react', 'react-dom');
    }

    if (dependenciesToInstall.length || !this.isReactInstalled(appPackage)) {
      console.log();
      console.log(`Installing template dependencies using ${this.config.command}...`);

      const proc = spawn.sync(this.config.command, args, { stdio: 'inherit' });
      if (proc.status !== 0) {
        console.error(`\`${this.config.command} ${args.join(' ')}\` failed`);
        return false;
      }
    }

    return true;
  }

  isReactInstalled(appPackage) {
    const dependencies = appPackage.dependencies || {};
    return (
      typeof dependencies.react !== 'undefined' &&
      typeof dependencies['react-dom'] !== 'undefined'
    );
  }

  /**
   * Removes the template package.
   * @returns {boolean} Remove success.
   */
  removeTemplate(templateName) {
    console.log(`Removing template package using ${this.config.command}...`);
    console.log();

    const proc = spawn.sync(this.config.command, [this.config.remove, templateName], {
      stdio: 'inherit',
    });
    if (proc.status !== 0) {
      console.error(`\`${this.config.command} ${this.config.remove} ${templateName}\` failed`);
      return false;
    }

    return true;
  }
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
  const templateJson = fs.existsSync(templateJsonPath)
    ? require(templateJsonPath)
    : {};

  // Handle deprecated keys
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

  const templatePackage = templateJson.package || {};

  // Apply template configuration
  applyTemplatePackageConfiguration(appPackage, templatePackage, useYarn);

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  // Process README.md
  processReadme(appPath, useYarn);

  // Process .gitignore
  processGitignore(appPath);

  // Initialize git if possible
  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  // Run package manager operations
  const pm = new PackageManager(useYarn, appPath);

  if (!pm.installDependencies(appPackage, templateName)) {
    return;
  }

  // Check for TypeScript usage
  if (
    appPackage.dependencies &&
    Object.keys(appPackage.dependencies).some(k => k.includes('typescript'))
  ) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove the template package
  if (!pm.removeTemplate(templateName)) {
    return;
  }

  // Commit git if initialized
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Display cd command logic
  const cdpath =
    originalDirectory &&
    path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;

  // Display success message
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