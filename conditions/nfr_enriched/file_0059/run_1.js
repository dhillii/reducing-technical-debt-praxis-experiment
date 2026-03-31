```javascript
// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

process.on('unhandledRejection', err => {
  throw err;
});

const fs = require('fs-extra');
const path = require('path');
const chalk = require('react-dev-utils/chalk');
const { execSync } = require('child_process');
const spawn = require('react-dev-utils/crossSpawn');
const { defaultBrowsers } = require('react-dev-utils/browsersHelper');
const os = require('os');
const verifyTypeScriptSetup = require('./utils/verifyTypeScriptSetup');

// ============================================================================
// VCS Detection and Initialization
// ============================================================================

const VcsManager = {
  isInGitRepository() {
    try {
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },

  isInMercurialRepository() {
    try {
      execSync('hg --cwd . root', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },

  tryInit() {
    try {
      execSync('git --version', { stdio: 'ignore' });
      if (this.isInGitRepository() || this.isInMercurialRepository()) {
        return false;
      }
      execSync('git init', { stdio: 'ignore' });
      return true;
    } catch (e) {
      console.warn('Git repo not initialized', e);
      return false;
    }
  },

  tryCommit(appPath) {
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
      } catch {
        // Ignore
      }
      return false;
    }
  },
};

// ============================================================================
// Package Configuration
// ============================================================================

const PackageConfig = {
  BLACKLIST: [
    'name', 'version', 'description', 'keywords', 'bugs', 'license',
    'author', 'contributors', 'files', 'browser', 'bin', 'man',
    'directories', 'repository', 'peerDependencies', 'bundledDependencies',
    'optionalDependencies', 'engineStrict', 'os', 'cpu', 'preferGlobal',
    'private', 'publishConfig',
  ],

  MERGE_KEYS: ['dependencies', 'scripts'],

  DEFAULT_SCRIPTS: {
    start: 'react-scripts start',
    build: 'react-scripts build',
    test: 'react-scripts test',
    eject: 'react-scripts eject',
  },

  getKeysToReplace(templatePackage) {
    return Object.keys(templatePackage).filter(key =>
      !this.BLACKLIST.includes(key) && !this.MERGE_KEYS.includes(key)
    );
  },

  isReactInstalled(appPackage) {
    const deps = appPackage.dependencies || {};
    return typeof deps.react !== 'undefined' && typeof deps['react-dom'] !== 'undefined';
  },
};

// ============================================================================
// File Operations
// ============================================================================

const FileManager = {
  loadTemplate(templatePath) {
    const templateJsonPath = path.join(templatePath, 'template.json');
    if (!fs.existsSync(templateJsonPath)) {
      return {};
    }
    return require(templateJsonPath);
  },

  validateTemplate(templateJson) {
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
  },

  copyTemplate(templatePath, appPath) {
    const templateDir = path.join(templatePath, 'template');
    if (!fs.existsSync(templateDir)) {
      console.error(`Could not locate supplied template: ${chalk.green(templateDir)}`);
      return false;
    }
    fs.copySync(templateDir, appPath);
    return true;
  },

  handleReadme(appPath) {
    const readmePath = path.join(appPath, 'README.md');
    if (fs.existsSync(readmePath)) {
      fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
      return true;
    }
    return false;
  },

  updateReadmeForPackageManager(appPath, useYarn) {
    if (!useYarn) return;
    try {
      const readmePath = path.join(appPath, 'README.md');
      const readme = fs.readFileSync(readmePath, 'utf8');
      fs.writeFileSync(readmePath, readme.replace(/(npm run |npm )/g, 'yarn '), 'utf8');
    } catch {
      // Silently fail - fallback to npm commands
    }
  },

  handleGitignore(appPath) {
    const gitignorePath = path.join(appPath, '.gitignore');
    const gitignoreSourcePath = path.join(appPath, 'gitignore');

    if (fs.existsSync(gitignorePath)) {
      const data = fs.readFileSync(gitignoreSourcePath);
      fs.appendFileSync(gitignorePath, data);
      fs.unlinkSync(gitignoreSourcePath);
    } else {
      fs.moveSync(gitignoreSourcePath, gitignorePath, []);
    }
  },

  writePackageJson(appPath, appPackage) {
    fs.writeFileSync(
      path.join(appPath, 'package.json'),
      JSON.stringify(appPackage, null, 2) + os.EOL
    );
  },
};

// ============================================================================
// Package Manager Operations
// ============================================================================

const PackageManagerOps = {
  getCommand(useYarn) {
    return useYarn ? 'yarnpkg' : 'npm';
  },

  getRemoveCommand(useYarn) {
    return useYarn ? 'remove' : 'uninstall';
  },

  getInstallArgs(useYarn, verbose) {
    if (useYarn) {
      return ['add'];
    }
    return [
      'install',
      '--no-audit',
      '--save',
      verbose && '--verbose',
    ].filter(Boolean);
  },

  buildDependencyArgs(templatePackage) {
    const dependencies = Object.entries({
      ...templatePackage.dependencies,
      ...templatePackage.devDependencies,
    });

    return dependencies.map(([dep, version]) => `${dep}@${version}`);
  },

  execute(command, args) {
    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return false;
    }
    return true;
  },
};

// ============================================================================
// Output Messages
// ============================================================================

const OutputMessages = {
  printSuccess(appName, appPath, cdpath, useYarn, readmeExists) {
    const cmd = useYarn ? 'yarn' : 'npm';
    const runPrefix = useYarn ? '' : 'run ';

    console.log();
    console.log(`Success! Created ${appName} at ${appPath}`);
    console.log('Inside that directory, you can run several commands:');
    console.log();
    console.log(chalk.cyan(`  ${cmd} start`));
    console.log('    Starts the development server.');
    console.log();
    console.log(chalk.cyan(`  ${cmd} ${runPrefix}build`));
    console.log('    Bundles the app into static files for production.');
    console.log();
    console.log(chalk.cyan(`  ${cmd} test`));
    console.log('    Starts the test runner.');
    console.log();
    console.log(chalk.cyan(`  ${cmd} ${runPrefix}eject`));
    console.log('    Removes this tool and copies build dependencies, configuration files');
    console.log('    and scripts into the app directory. If you do this, you can\'t go back!');
    console.log();
    console.log('We suggest that you begin by typing:');
    console.log();
    console.log(chalk.cyan('  cd'), cdpath);
    console.log(`  ${chalk.cyan(`${cmd} start`)}`);

    if (readmeExists) {
      console.log();
      console.log(chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`'));
    }

    console.log();
    console.log('Happy hacking!');
  },
};

// ============================================================================
// Main Initialization Function
// ============================================================================

module.exports = function initializeApp(appPath, appName, verbose, originalDirectory, templateName) {
  // Validate template
  if (!templateName) {
    console.log('');
    console.error(`A template was not provided. This is likely because you're using an outdated version of ${chalk.cyan('create-react-app')}.`);
    console.error(`Please note that global installs of ${chalk.cyan('create-react-app')} are no longer supported.`);
    console.error(`You can fix this by running ${chalk.cyan('npm uninstall -g create-react-app')} or ${chalk.cyan('yarn global remove create-react-app')} before using ${chalk.cyan('create-react-app')} again.`);
    return;
  }

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  // Load and validate template
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJson = FileManager.loadTemplate(templatePath);
  FileManager.validateTemplate(templateJson);

  const templatePackage = templateJson.package || {};

  // Configure app package
  appPackage.dependencies = appPackage.dependencies || {};
  appPackage.scripts = Object.assign({}, PackageConfig.DEFAULT_SCRIPTS, templatePackage.scripts || {});

  if (useYarn) {
    appPackage.scripts = Object.entries(appPackage.scripts).reduce(
      (acc, [key, value]) => ({ ...acc, [key]: value.replace(/(npm run |npm )/g, 'yarn ') }),
      {}
    );
  }

  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  PackageConfig.getKeysToReplace(templatePackage).forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  FileManager.writePackageJson(appPath, appPackage);

  // Handle files
  const readmeExists = FileManager.handleReadme(appPath);
  if (!FileManager.copyTemplate(templatePath, appPath)) {
    return;
  }

  FileManager.updateReadmeForPackageManager(appPath, useYarn);
  FileManager.handleGitignore(appPath);

  // Initialize git
  let initializedGit = false;
  if (VcsManager.tryInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  // Install dependencies
  const command = PackageManagerOps.getCommand(useYarn);
  let args = PackageManagerOps.getInstallArgs(useYarn, verbose);

  const depArgs = PackageManagerOps.buildDependencyArgs(templatePackage);
  if (depArgs.length) {
    args = args.concat(depArgs);
  }

  if (!PackageConfig.isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  if ((!PackageConfig.isReactInstalled(appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    if (!PackageManagerOps.execute(command, args)) {
      return;
    }
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template package
  console.log(`Removing template package using ${command}...`);
  console.log();
  if (!PackageManagerOps.execute(command, [PackageManagerOps.getRemoveCommand(useYarn), templateName])) {
    return;
  }

  // Create git commit
  if (initializedGit && VcsManager.tryCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Display success message
  const cdpath = originalDirectory && path.join(originalDirectory, appName) === appPath ? appName : appPath;
  OutputMessages.printSuccess(appName, appPath, cdpath, useYarn, readmeExists);
};
```