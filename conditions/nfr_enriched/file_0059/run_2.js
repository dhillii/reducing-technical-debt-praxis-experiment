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
    const gitignoreTemplatePath = path.join(appPath, 'gitignore');

    if (fs.existsSync(gitignorePath)) {
      const data = fs.readFileSync(gitignoreTemplatePath);
      fs.appendFileSync(gitignorePath, data);
      fs.unlinkSync(gitignoreTemplatePath);
    } else {
      fs.moveSync(gitignoreTemplatePath, gitignorePath, []);
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

const PackageManager = {
  getConfig(useYarn) {
    if (useYarn) {
      return {
        command: 'yarnpkg',
        remove: 'remove',
        args: ['add'],
        display: 'yarn',
      };
    }
    return {
      command: 'npm',
      remove: 'uninstall',
      args: ['install', '--no-audit', '--save'],
      display: 'npm',
    };
  },

  buildInstallArgs(config, templatePackage, appPackage, verbose) {
    const args = [...config.args];

    if (config.command === 'npm' && verbose) {
      args.push('--verbose');
    }

    const dependencies = Object.entries({
      ...templatePackage.dependencies,
      ...templatePackage.devDependencies,
    });

    if (dependencies.length) {
      args.push(...dependencies.map(([dep, version]) => `${dep}@${version}`));
    }

    if (!PackageConfig.isReactInstalled(appPackage)) {
      args.push('react', 'react-dom');
    }

    return args;
  },

  execute(command, args) {
    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    return proc.status === 0;
  },
};

// ============================================================================
// Output Formatting
// ============================================================================

const OutputFormatter = {
  showSuccessMessage(appName, appPath, originalDirectory, useYarn, readmeExists) {
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
    console.log(chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}build`));
    console.log('    Bundles the app into static files for production.');
    console.log();
    console.log(chalk.cyan(`  ${displayedCommand} test`));
    console.log('    Starts the test runner.');
    console.log();
    console.log(chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}eject`));
    console.log('    Removes this tool and copies build dependencies, configuration files');
    console.log('    and scripts into the app directory. If you do this, you can\'t go back!');
    console.log();
    console.log('We suggest that you begin by typing:');
    console.log();
    console.log(chalk.cyan('  cd'), cdpath);
    console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);

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

  // Load packages
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));
  const templatePath = path.dirname(require.resolve(`${templateName}/package.json`, { paths: [appPath] }));
  const templateJson = FileManager.loadTemplate(templatePath);
  const templatePackage = templateJson.package || {};

  // Validate and warn about deprecated template format
  FileManager.validateTemplate(templateJson);

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
  const pmConfig = PackageManager.getConfig(useYarn);
  const installArgs = PackageManager.buildInstallArgs(pmConfig, templatePackage, appPackage, verbose);

  if ((!PackageConfig.isReactInstalled(appPackage) || templateName) && installArgs.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${pmConfig.command}...`);
    if (!PackageManager.execute(pmConfig.command, installArgs)) {
      console.error(`\`${pmConfig.command} ${installArgs.join(' ')}\` failed`);
      return;
    }
  }

  if (installArgs.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template package
  console.log(`Removing template package using ${pmConfig.command}...`);
  console.log();
  if (!PackageManager.execute(pmConfig.command, [pmConfig.remove, templateName])) {
    console.error(`\`${pmConfig.command} ${pmConfig.remove} ${templateName}\` failed`);
    return;
  }

  // Create git commit
  if (initializedGit && VcsManager.tryCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Show success message
  OutputFormatter.showSuccessMessage(appName, appPath, originalDirectory, useYarn, readmeExists);
};
```