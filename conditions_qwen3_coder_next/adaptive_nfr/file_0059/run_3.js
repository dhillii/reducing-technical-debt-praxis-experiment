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
      /* Ignore */
    }
    return false;
  }
}

/**
 * Determines whether to use Yarn based on presence of yarn.lock.
 * @param {string} appPath - Project root path.
 * @returns {boolean} true if Yarn should be used.
 */
function shouldUseYarn(appPath) {
  return fs.existsSync(path.join(appPath, 'yarn.lock'));
}

/**
 * Normalizes npm command strings to use yarn.
 * @param {string} command - Command to normalize.
 * @returns {string} Normalized command.
 */
function normalizeCommandForYarn(command) {
  return command.replace(/(npm run |npm )/g, 'yarn ');
}

/**
 * Loads and parses template.json from the template package.
 * @param {string} templatePath - Absolute path to template directory.
 * @returns {Object} Parsed template.json contents.
 */
function loadTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  return fs.existsSync(templateJsonPath)
    ? require(templateJsonPath)
    : {};
}

/**
 * Extracts keys from template package that should replace app package entries.
 * @param {Object} templatePackage - Template's package.json extension.
 * @param {string[]} blacklist - Keys that must not be merged.
 * @param {string[]} mergeKeys - Keys that should be merged, not replaced.
 * @returns {string[]} Keys to replace.
 */
function getReplaceKeys(templatePackage, blacklist, mergeKeys) {
  return Object.keys(templatePackage).filter(
    key =>
      !blacklist.includes(key) && !mergeKeys.includes(key)
  );
}

/**
 * Updates scripts in appPackage by merging template scripts and normalizing for package manager.
 * @param {Object} appPackage - Target package.json object.
 * @param {Object} templateScripts - Template-provided scripts.
 * @param {boolean} useYarn - Whether Yarn is in use.
 * @returns {Object} Updated scripts object.
 */
function buildFinalScripts(appPackage, templateScripts, useYarn) {
  const defaultScripts = {
    start: 'react-scripts start',
    build: 'react-scripts build',
    test: 'react-scripts test',
    eject: 'react-scripts eject',
  };
  const mergedScripts = Object.assign({}, defaultScripts, templateScripts);
  if (!useYarn) return mergedScripts;

  return Object.entries(mergedScripts).reduce(
    (acc, [key, value]) => ({ ...acc, [key]: value.replace(/(npm run |npm )/, 'yarn ') }),
    {}
  );
}

/**
 * Copies template directory contents to app path.
 * @param {string} templatePath - Absolute path to template directory.
 * @param {string} appPath - Target application path.
 * @returns {boolean} true if template directory exists, false otherwise.
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
 * Rewrites README.md commands if Yarn is in use.
 * @param {string} appPath - Target application path.
 * @param {boolean} useYarn - Whether to use Yarn commands.
 */
function normalizeReadmeCommands(appPath, useYarn) {
  if (!useYarn) return;

  try {
    const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
    fs.writeFileSync(
      path.join(appPath, 'README.md'),
      normalizeCommandForYarn(readme),
      'utf8'
    );
  } catch (err) {
    // Silencing the error. As it falls back to using default npm commands.
  }
}

/**
 * Initializes .gitignore file appropriately.
 * @param {string} appPath - Target application path.
 */
function setupGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
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
 * Determines if 'react' and 'react-dom' are installed in appPackage.
 * @param {Object} appPackage - Package.json contents.
 * @returns {boolean} true if both dependencies are present.
 */
function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return dependencies.react !== undefined && dependencies['react-dom'] !== undefined;
}

/**
 * Installs template and react dependencies using specified package manager.
 * @param {string} appPath - Target application path.
 * @param {string} command - Package manager executable (npm/yarn).
 * @param {string} removeCmd - Package manager uninstall command.
 * @param {string[]} args - Arguments for install step.
 * @param {boolean} useYarn - Whether Yarn is in use.
 * @param {Object} templatePackage - Template's extended package metadata.
 * @param {string} templateName - Name of template package.
 */
function installDependencies(appPath, command, removeCmd, args, useYarn, templatePackage, templateName) {
  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (dependenciesToInstall.length) {
    args = args.concat(dependenciesToInstall.map(([dependency, version]) => {
      return `${dependency}@${version}`;
    }));
  }

  if (!isReactInstalled(templatePackage) && !isReactInstalled({ dependencies: templatePackage.dependencies })) {
    args = args.concat(['react', 'react-dom']);
  }

  const shouldInstall = (dependenciesToInstall.length > 0 || !isReactInstalled(templatePackage)) && args.length > 1;
  if (shouldInstall) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);

    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return false;
    }
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  console.log(`Removing template package using ${command}...`);
  console.log();

  const removalProc = spawn.sync(command, [removeCmd, templateName], {
    stdio: 'inherit',
  });
  if (removalProc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }

  return true;
}

/**
 * Displays final success output.
 * @param {string} appName - Project name.
 * @param {string} appPath - Project root path.
 * @param {string} originalDirectory - User-specified original directory.
 * @param {string} cdpath - Computed cd path.
 * @param {boolean} useYarn - Whether Yarn is used.
 * @param {boolean} readmeExists - Whether README.md existed before copy.
 */
function displaySuccessOutput(appName, appPath, originalDirectory, cdpath, useYarn, readmeExists) {
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

  const templateJson = loadTemplateJson(templatePath);
  const templatePackage = templateJson.package || {};

  // Backward compatibility warning
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
  const templatePackageToReplace = getReplaceKeys(templatePackage, templatePackageBlacklist, templatePackageToMerge);

  // Update appPackage
  appPackage.dependencies = appPackage.dependencies || {};
  appPackage.scripts = buildFinalScripts(appPackage, templatePackage.scripts || {}, useYarn);
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }

  if (!copyTemplateFiles(templatePath, appPath)) {
    return;
  }

  normalizeReadmeCommands(appPath, useYarn);
  setupGitignore(appPath);

  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  const command = useYarn ? 'yarnpkg' : 'npm';
  const removeCmd = useYarn ? 'remove' : 'uninstall';
  const args = useYarn
    ? ['add']
    : ['install', '--no-audit', '--save', verbose && '--verbose'].filter(Boolean);

  if (!installDependencies(appPath, command, removeCmd, args, useYarn, templatePackage, templateName)) {
    return;
  }

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdpath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;

  displaySuccessOutput(appName, appPath, originalDirectory, cdpath, useYarn, readmeExists);
};

function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return typeof dependencies.react !== 'undefined' &&
         typeof dependencies['react-dom'] !== 'undefined';
}