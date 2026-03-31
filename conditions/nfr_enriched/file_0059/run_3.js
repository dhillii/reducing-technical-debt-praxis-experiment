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

const VCS = {
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

const TEMPLATE_PACKAGE_BLACKLIST = [
  'name', 'version', 'description', 'keywords', 'bugs', 'license', 'author',
  'contributors', 'files', 'browser', 'bin', 'man', 'directories', 'repository',
  'peerDependencies', 'bundledDependencies', 'optionalDependencies',
  'engineStrict', 'os', 'cpu', 'preferGlobal', 'private', 'publishConfig',
];

const TEMPLATE_PACKAGE_TO_MERGE = ['dependencies', 'scripts'];

const DEFAULT_SCRIPTS = {
  start: 'react-scripts start',
  build: 'react-scripts build',
  test: 'react-scripts test',
  eject: 'react-scripts eject',
};

class PackageConfigurator {
  constructor(appPath, templatePackage, useYarn) {
    this.appPath = appPath;
    this.appPackage = require(path.join(appPath, 'package.json'));
    this.templatePackage = templatePackage;
    this.useYarn = useYarn;
  }

  configure() {
    this.setupDependencies();
    this.setupScripts();
    this.setupEslint();
    this.setupBrowsersList();
    this.mergeTemplatePackage();
    this.write();
  }

  setupDependencies() {
    this.appPackage.dependencies = this.appPackage.dependencies || {};
  }

  setupScripts() {
    const templateScripts = this.templatePackage.scripts || {};
    this.appPackage.scripts = Object.assign({}, DEFAULT_SCRIPTS, templateScripts);

    if (this.useYarn) {
      this.appPackage.scripts = Object.entries(this.appPackage.scripts).reduce(
        (acc, [key, value]) => ({
          ...acc,
          [key]: value.replace(/(npm run |npm )/, 'yarn '),
        }),
        {}
      );
    }
  }

  setupEslint() {
    this.appPackage.eslintConfig = { extends: 'react-app' };
  }

  setupBrowsersList() {
    this.appPackage.browserslist = defaultBrowsers;
  }

  mergeTemplatePackage() {
    const keysToReplace = Object.keys(this.templatePackage).filter(key =>
      !TEMPLATE_PACKAGE_BLACKLIST.includes(key) &&
      !TEMPLATE_PACKAGE_TO_MERGE.includes(key)
    );

    keysToReplace.forEach(key => {
      this.appPackage[key] = this.templatePackage[key];
    });
  }

  write() {
    fs.writeFileSync(
      path.join(this.appPath, 'package.json'),
      JSON.stringify(this.appPackage, null, 2) + os.EOL
    );
  }
}

// ============================================================================
// File Operations
// ============================================================================

class FileManager {
  static handleReadme(appPath) {
    const readmePath = path.join(appPath, 'README.md');
    if (fs.existsSync(readmePath)) {
      fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
      return true;
    }
    return false;
  }

  static copyTemplate(templatePath, appPath) {
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

  static updateReadmeForPackageManager(appPath, useYarn) {
    if (!useYarn) return;

    try {
      const readmePath = path.join(appPath, 'README.md');
      const readme = fs.readFileSync(readmePath, 'utf8');
      fs.writeFileSync(
        readmePath,
        readme.replace(/(npm run |npm )/g, 'yarn '),
        'utf8'
      );
    } catch {
      // Silently fail - fallback to npm commands
    }
  }

  static handleGitignore(appPath) {
    const gitignorePath = path.join(appPath, '.gitignore');
    const gitignoreTemplatePath = path.join(appPath, 'gitignore');

    if (fs.existsSync(gitignorePath)) {
      const data = fs.readFileSync(gitignoreTemplatePath);
      fs.appendFileSync(gitignorePath, data);
      fs.unlinkSync(gitignoreTemplatePath);
    } else {
      fs.moveSync(gitignoreTemplatePath, gitignorePath, []);
    }
  }
}

// ============================================================================
// Package Manager Operations
// ============================================================================

class PackageManager {
  constructor(useYarn, verbose = false) {
    this.useYarn = useYarn;
    this.verbose = verbose;
  }

  getCommand() {
    return this.useYarn ? 'yarnpkg' : 'npm';
  }

  getRemoveCommand() {
    return this.useYarn ? 'remove' : 'uninstall';
  }

  getInstallArgs() {
    if (this.useYarn) {
      return ['add'];
    }
    return [
      'install',
      '--no-audit',
      '--save',
      this.verbose && '--verbose',
    ].filter(Boolean);
  }

  buildInstallCommand(templatePackage) {
    const args = this.getInstallArgs();
    const dependencies = Object.entries({
      ...templatePackage.dependencies,
      ...templatePackage.devDependencies,
    });

    if (dependencies.length) {
      args.push(...dependencies.map(([dep, version]) => `${dep}@${version}`));
    }

    return { command: this.getCommand(), args };
  }

  execute(command, args) {
    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return false;
    }
    return true;
  }

  remove(templateName) {
    return this.execute(this.getCommand(), [this.getRemoveCommand(), templateName]);
  }
}

// ============================================================================
// Utilities
// ============================================================================

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

function loadTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  if (!fs.existsSync(templateJsonPath)) {
    return {};
  }
  return require(templateJsonPath);
}

function validateTemplate(templateJson) {
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

function displaySuccessMessage(appName, appPath, cdpath, displayedCommand, readmeExists) {
  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'yarn' ? '' : 'run '}build`));
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'yarn' ? '' : 'run '}eject`));
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
}

// ============================================================================
// Main Export
// ============================================================================

module.exports = function initializeApp(
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
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );

  const templateJson = loadTemplateJson(templatePath);
  validateTemplate(templateJson);

  const templatePackage = templateJson.package || {};

  // Configure package.json
  const configurator = new PackageConfigurator(appPath, templatePackage, useYarn);
  configurator.configure();

  // Handle README
  const readmeExists = FileManager.handleReadme(appPath);

  // Copy template files
  if (!FileManager.copyTemplate(templatePath, appPath)) {
    return;
  }

  // Update README for package manager
  FileManager.updateReadmeForPackageManager(appPath, useYarn);

  // Handle gitignore
  FileManager.handleGitignore(appPath);

  // Initialize git
  let initializedGit = false;
  if (VCS.tryInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  // Install dependencies
  const packageManager = new PackageManager(useYarn, verbose);
  const { command, args } = packageManager.buildInstallCommand(templatePackage);

  if (!isReactInstalled(configurator.appPackage)) {
    args.push('react', 'react-dom');
  }

  if ((!isReactInstalled(configurator.appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    if (!packageManager.execute(command, args)) {
      return;
    }
  }

  if (args.some(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template package
  console.log(`Removing template package using ${command}...`);
  console.log();
  if (!packageManager.remove(templateName)) {
    return;
  }

  // Create git commit
  if (initializedGit && VCS.tryCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Display success message
  const cdpath = originalDirectory && path.join(originalDirectory, appName) === appPath
    ? appName
    : appPath;
  const displayedCommand = useYarn ? 'yarn' : 'npm';

  displaySuccessMessage(appName, appPath, cdpath, displayedCommand, readmeExists);
};
```