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
const execSync = require('child_process').execSync;
const spawn = require('react-dev-utils/crossSpawn');
const { defaultBrowsers } = require('react-dev-utils/browsersHelper');
const os = require('os');
const verifyTypeScriptSetup = require('./utils/verifyTypeScriptSetup');

// ============================================================================
// VCS Detection & Initialization
// ============================================================================

const VCS = {
  isInGitRepository() {
    try {
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
      return true;
    } catch (e) {
      return false;
    }
  },

  isInMercurialRepository() {
    try {
      execSync('hg --cwd . root', { stdio: 'ignore' });
      return true;
    } catch (e) {
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
      } catch (removeErr) {
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

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

function getTemplateKeysToReplace(templatePackage) {
  return Object.keys(templatePackage).filter(key => {
    return (
      !TEMPLATE_PACKAGE_BLACKLIST.includes(key) &&
      !TEMPLATE_PACKAGE_TO_MERGE.includes(key)
    );
  });
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

function validateTemplateExists(templateName) {
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

// ============================================================================
// Package.json Configuration
// ============================================================================

function configureAppPackage(appPackage, templatePackage, useYarn) {
  appPackage.dependencies = appPackage.dependencies || {};

  // Configure scripts
  const templateScripts = templatePackage.scripts || {};
  appPackage.scripts = Object.assign({}, DEFAULT_SCRIPTS, templateScripts);

  if (useYarn) {
    appPackage.scripts = Object.entries(appPackage.scripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }

  // Configure linting and browsers
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  // Merge template package keys
  getTemplateKeysToReplace(templatePackage).forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

// ============================================================================
// File Operations
// ============================================================================

function handleReadme(appPath) {
  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }
  return readmeExists;
}

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

function updateReadmeForPackageManager(appPath, useYarn) {
  if (!useYarn) return;

  try {
    const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
    fs.writeFileSync(
      path.join(appPath, 'README.md'),
      readme.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch (err) {
    // Silencing the error. Falls back to using default npm commands.
  }
}

function handleGitignore(appPath) {
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

// ============================================================================
// Package Manager Operations
// ============================================================================

function getPackageManagerConfig(useYarn, verbose) {
  if (useYarn) {
    return {
      command: 'yarnpkg',
      displayCommand: 'yarn',
      remove: 'remove',
      args: ['add'],
    };
  }
  return {
    command: 'npm',
    displayCommand: 'npm',
    remove: 'uninstall',
    args: [
      'install',
      '--no-audit',
      '--save',
      verbose && '--verbose',
    ].filter(Boolean),
  };
}

function buildInstallArgs(args, templatePackage, appPackage) {
  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (dependenciesToInstall.length) {
    args = args.concat(
      dependenciesToInstall.map(([dependency, version]) => `${dependency}@${version}`)
    );
  }

  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  return args;
}

function installDependencies(config, args, templateName) {
  if ((!isReactInstalled(require(path.join(process.cwd(), 'package.json'))) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${config.command}...`);

    const proc = spawn.sync(config.command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${config.command} ${args.join(' ')}\` failed`);
      return false;
    }
  }
  return true;
}

function removeTemplate(config, templateName) {
  console.log(`Removing template package using ${config.command}...`);
  console.log();

  const proc = spawn.sync(config.command, [config.remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${config.command} ${config.remove} ${templateName}\` failed`);
    return false;
  }
  return true;
}

// ============================================================================
// Success Messages
// ============================================================================

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
}

// ============================================================================
// Main Export
// ============================================================================

module.exports = function (appPath, appName, verbose, originalDirectory, templateName) {
  if (!validateTemplateExists(templateName)) {
    return;
  }

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );

  const templateJson = loadTemplateJson(templatePath);
  validateTemplate(templateJson);

  const templatePackage = templateJson.package || {};

  // Configure and write package.json
  configureAppPackage(appPackage, templatePackage, useYarn);
  writePackageJson(appPath, appPackage);

  // Handle README
  const readmeExists = handleReadme(appPath);

  // Copy template files
  if (!copyTemplateFiles(templatePath, appPath)) {
    return;
  }

  // Update README for package manager
  updateReadmeForPackageManager(appPath, useYarn);

  // Handle gitignore
  handleGitignore(appPath);

  // Initialize git
  let initializedGit = false;
  if (VCS.tryInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  // Install dependencies
  const config = getPackageManagerConfig(useYarn, verbose);
  let args = buildInstallArgs(config.args, templatePackage, appPackage);

  if (!installDependencies(config, args, templateName)) {
    return;
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // Remove template package
  if (!removeTemplate(config, templateName)) {
    return;
  }

  // Create git commit
  if (initializedGit && VCS.tryCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // Display success message
  displaySuccessMessage(appName, appPath, originalDirectory, useYarn, readmeExists);
};
```