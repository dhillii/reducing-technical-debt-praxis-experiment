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

function getTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }
  return templateJson;
}

function getTemplatePackage(templateJson) {
  return templateJson.package || {};
}

function getTemplatePackageBlacklist() {
  return [
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
}

function getTemplatePackageToMerge() {
  return ['dependencies', 'scripts'];
}

function getTemplatePackageToReplace(templatePackage) {
  const blacklist = getTemplatePackageBlacklist();
  const toMerge = getTemplatePackageToMerge();
  return Object.keys(templatePackage).filter(key => {
    return (
      !blacklist.includes(key) &&
      !toMerge.includes(key)
    );
  });
}

function setupScripts(appPackage, templateScripts, useYarn) {
  const defaultScripts = {
    start: 'react-scripts start',
    build: 'react-scripts build',
    test: 'react-scripts test',
    eject: 'react-scripts eject',
  };

  const mergedScripts = Object.assign(
    defaultScripts,
    templateScripts
  );

  if (useYarn) {
    return Object.entries(mergedScripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }

  return mergedScripts;
}

function setupEslintConfig() {
  return {
    extends: 'react-app',
  };
}

function setupBrowsersList() {
  return defaultBrowsers;
}

function mergeTemplatePackageKeys(appPackage, templatePackage, toReplace) {
  toReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

function handleReadme(appPath, useYarn) {
  const readmePath = path.join(appPath, 'README.md');
  if (useYarn) {
    try {
      const readme = fs.readFileSync(readmePath, 'utf8');
      fs.writeFileSync(
        readmePath,
        readme.replace(/(npm run |npm )/g, 'yarn '),
        'utf8'
      );
    } catch (err) {
      // Silencing the error. As it fall backs to using default npm commands.
    }
  }
}

function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const gitignoreFile = path.join(appPath, 'gitignore');
  if (fs.existsSync(gitignoreFile)) {
    // Append if there's already a `.gitignore` file there
    const data = fs.readFileSync(gitignoreFile);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(gitignoreFile);
  } else {
    // Rename gitignore after the fact to prevent npm from renaming it to .npmignore
    // See: https://github.com/npm/npm/issues/1862
    fs.moveSync(
      gitignoreFile,
      gitignorePath,
      []
    );
  }
}

function initializeGit(appPath) {
  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }
  return initializedGit;
}

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
    args: [
      'install',
      '--no-audit', // https://github.com/facebook/create-react-app/issues/11174
      '--save',
      verbose && '--verbose',
    ].filter(e => e),
  };
}

function getDependenciesToInstall(templatePackage) {
  return Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
}

function installDependencies(appPackage, command, args, templatePackage, useYarn) {
  // Install react and react-dom for backward compatibility with old CRA cli
  // which doesn't install react and react-dom along with react-scripts
  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  // Install template dependencies, and react and react-dom if missing.
  if ((!isReactInstalled(appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);

    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return false;
    }
    return true;
  }
  return true;
}

function installTemplateDependencies(command, args, templatePackage) {
  const dependenciesToInstall = getDependenciesToInstall(templatePackage);
  if (dependenciesToInstall.length) {
    args = args.concat(
      dependenciesToInstall.map(([dependency, version]) => {
        return `${dependency}@${version}`;
      })
    );
  }
  return args;
}

function removeTemplate(command, templateName) {
  console.log(`Removing template package using ${command}...`);
  console.log();

  const proc = spawn.sync(command, [command === 'yarnpkg' ? 'remove' : 'uninstall', templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

function createGitCommit(appPath) {
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }
}

function getDisplayPath(originalDirectory, appName, appPath) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}

function getDisplayedCommand(useYarn) {
  return useYarn ? 'yarn' : 'npm';
}

function printSuccessMessage(appName, appPath, displayedCommand, cdpath, useYarn, readmeExists) {
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
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

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

  const templateJson = getTemplateJson(templatePath);
  const templatePackage = getTemplatePackage(templateJson);

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

  // Setup the script rules
  const templateScripts = templatePackage.scripts || {};
  const appPackageScripts = setupScripts(appPackage, templateScripts, useYarn);

  // Setup the eslint config
  const appPackageEslintConfig = setupEslintConfig();

  // Setup the browsers list
  const appPackageBrowsersList = setupBrowsersList();

  // Add templatePackage keys/values to appPackage, replacing existing entries
  const templatePackageToReplace = getTemplatePackageToReplace(templatePackage);
  mergeTemplatePackageKeys(appPackage, templatePackage, templatePackageToReplace);

  appPackage.dependencies = appPackage.dependencies || {};
  appPackage.scripts = appPackageScripts;
  appPackage.eslintConfig = appPackageEslintConfig;
  appPackage.browserslist = appPackageBrowsersList;

  writePackageJson(appPath, appPackage);

  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  handleReadme(appPath, useYarn);

  handleGitignore(appPath);

  const initializedGit = initializeGit(appPath);

  const packageManagerConfig = getPackageManagerConfig(useYarn);
  const command = packageManagerConfig.command;
  const remove = packageManagerConfig.remove;
  let args = packageManagerConfig.args;

  // Install additional template dependencies, if present.
  const dependenciesToInstall = installTemplateDependencies(command, args, templatePackage);

  const installSuccess = installDependencies(appPackage, command, dependenciesToInstall, templatePackage, useYarn);

  if (dependenciesToInstall.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  removeTemplate(command, templateName);

  createGitCommit(appPath);

  const cdpath = getDisplayPath(originalDirectory, appName, appPath);
  const displayedCommand = getDisplayedCommand(useYarn);

  printSuccessMessage(appName, appPath, displayedCommand, cdpath, useYarn, readmeExists);
};