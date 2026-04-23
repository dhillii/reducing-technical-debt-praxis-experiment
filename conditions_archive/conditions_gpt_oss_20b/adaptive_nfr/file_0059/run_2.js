```javascript
// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

const fs = require('fs-extra');
const path = require('path');
const chalk = require('react-dev-utils/chalk');
const execSync = require('child_process').execSync;
const spawn = require('react-dev-utils/crossSpawn');
const { defaultBrowsers } = require('react-dev-utils/browsersHelper');
const os = require('os');
const verifyTypeScriptSetup = require('./utils/verifyTypeScriptSetup');

/**
 * Checks if the current directory is inside a Git repository.
 * @returns {boolean}
 */
function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Checks if the current directory is inside a Mercurial repository.
 * @returns {boolean}
 */
function isInMercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Tries to initialize a Git repository.
 * @returns {boolean} true if a new repo was created
 */
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

/**
 * Tries to commit all changes in the Git repository.
 * @param {string} appPath
 * @returns {boolean} true if commit succeeded
 */
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
 * Checks if React and ReactDOM are installed in the package.
 * @param {object} appPackage
 * @returns {boolean}
 */
function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};

  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

/**
 * Main entry point for initializing a new CRA project.
 * @param {string} appPath
 * @param {string} appName
 * @param {boolean} verbose
 * @param {string} originalDirectory
 * @param {string} templateName
 */
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

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  const templatePath = getTemplatePath(templateName, appPath);
  const templateJson = loadTemplateJson(templatePath);
  const templatePackage = templateJson.package || {};

  handleDeprecatedTemplateJson(templateJson);

  const {
    templatePackageBlacklist,
    templatePackageToMerge,
    templatePackageToReplace,
  } = getTemplatePackageKeys(templatePackage);

  const updatedPackage = mergeTemplatePackage(
    appPackage,
    templatePackage,
    templatePackageBlacklist,
    templatePackageToMerge,
    templatePackageToReplace
  );

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(updatedPackage, null, 2) + os.EOL
  );

  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }

  copyTemplateFiles(templatePath, appPath);

  if (useYarn) {
    modifyReadmeForYarn(appPath);
  }

  handleGitignore(appPath);

  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log();
    console.log('Initialized a git repository.');
  }

  const { command, remove, args } = getPackageManagerCommand(useYarn, verbose);

  const dependenciesToInstall = getDependenciesToInstall(templatePackage);
  const argsWithDeps = addDependenciesToArgs(args, dependenciesToInstall);

  const argsWithReact = addReactIfMissing(argsWithDeps, appPackage);

  if (shouldInstallDependencies(argsWithReact)) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    const proc = spawn.sync(command, argsWithReact, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${argsWithReact.join(' ')}\` failed`);
      return;
    }
  }

  if (argsWithReact.find((arg) => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  console.log(`Removing template package using ${command}...`);
  console.log();
  const removeProc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (removeProc.status !== 0) {
    console.error(`\`${command} ${argsWithReact.join(' ')}\` failed`);
    return;
  }

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdpath = getCdPath(originalDirectory, appName, appPath);

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
};

/**
 * Returns the absolute path to the template package.
 * @param {string} templateName
 * @param {string} appPath
 * @returns {string}
 */
function getTemplatePath(templateName, appPath) {
  return path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
}

/**
 * Loads the template.json file if it exists.
 * @param {string} templatePath
 * @returns {object}
 */
function loadTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }
  return templateJson;
}

/**
 * Logs deprecation warnings for old template.json keys.
 * @param {object} templateJson
 */
function handleDeprecatedTemplateJson(templateJson) {
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

/**
 * Returns arrays of keys for blacklist, merge, and replace.
 * @param {object} templatePackage
 * @returns {object}
 */
function getTemplatePackageKeys(templatePackage) {
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

  const templatePackageToReplace = Object.keys(templatePackage).filter(
    (key) =>
      !templatePackageBlacklist.includes(key) &&
      !templatePackageToMerge.includes(key)
  );

  return { templatePackageBlacklist, templatePackageToMerge, templatePackageToReplace };
}

/**
 * Merges template package data into the app package.
 * @param {object} appPackage
 * @param {object} templatePackage
 * @param {string[]} blacklist
 * @param {string[]} mergeKeys
 * @param {string[]} replaceKeys
 * @returns {object}
 */
function mergeTemplatePackage(
  appPackage,
  templatePackage,
  blacklist,
  mergeKeys,
  replaceKeys
) {
  const updated = { ...appPackage };

  // Merge dependencies and scripts
  mergeKeys.forEach((key) => {
    updated[key] = { ...(appPackage[key] || {}), ...(templatePackage[key] || {}) };
  });

  // Replace other keys
  replaceKeys.forEach((key) => {
    updated[key] = templatePackage[key];
  });

  // Setup default scripts if missing
  updated.scripts = Object.assign(
    {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test',
      eject: 'react-scripts eject',
    },
    updated.scripts || {}
  );

  // Update Yarn scripts
  if (fs.existsSync(path.join(updated.appPath || '', 'yarn.lock'))) {
    updated.scripts = Object.entries(updated.scripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }

  // ESLint config
  updated.eslintConfig = { extends: 'react-app' };

  // Browserslist
  updated.browserslist = defaultBrowsers;

  return updated;
}

/**
 * Copies template files into the app directory.
 * @param {string} templatePath
 * @param {string} appPath
 */
function copyTemplateFiles(templatePath, appPath) {
  const templateDir = path.join(templatePath, 'template');
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return;
  }
}

/**
 * Modifies README.md to use Yarn commands.
 * @param {string} appPath
 */
function modifyReadmeForYarn(appPath) {
  try {
    const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
    fs.writeFileSync(
      path.join(appPath, 'README.md'),
      readme.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch (err) {
    // Silencing the error. As it falls back to using default npm commands.
  }
}

/**
 * Handles .gitignore creation or appending.
 * @param {string} appPath
 */
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

/**
 * Returns package manager command details.
 * @param {boolean} useYarn
 * @param {boolean} verbose
 * @returns {object}
 */
function getPackageManagerCommand(useYarn, verbose) {
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
      '--no-audit',
      '--save',
      verbose && '--verbose',
    ].filter(Boolean),
  };
}

/**
 * Extracts dependencies and devDependencies from template package.
 * @param {object} templatePackage
 * @returns {Array<[string, string]>}
 */
function getDependenciesToInstall(templatePackage) {
  return Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
}

/**
 * Adds dependencies to the install args.
 * @param {string[]} args
 * @param {Array<[string, string]>} deps
 * @returns {string[]}
 */
function addDependenciesToArgs(args, deps) {
  return args.concat(
    deps.map(([dep, ver]) => `${dep}@${ver}`)
  );
}

/**
 * Adds react and react-dom if missing.
 * @param {string[]} args
 * @param {object} appPackage
 * @returns {string[]}
 */
function addReactIfMissing(args, appPackage) {
  if (!isReactInstalled(appPackage)) {
    return args.concat(['react', 'react-dom']);
  }
  return args;
}

/**
 * Determines whether to run the install command.
 * @param {string[]} args
 * @returns {boolean}
 */
function shouldInstallDependencies(args) {
  return args.length > 1;
}

/**
 * Computes the path to change into after setup.
 * @param {string} originalDirectory
 * @param {string} appName
 * @param {string} appPath
 * @returns {string}
 */
function getCdPath(originalDirectory, appName, appPath) {
  if (
    originalDirectory &&
    path.join(originalDirectory, appName) === appPath
  ) {
    return appName;
  }
  return appPath;
}
```