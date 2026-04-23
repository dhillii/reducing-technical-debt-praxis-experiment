```javascript
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

/**
 * Checks if the current directory is inside a Git repository.
 * @returns {boolean} True if inside a Git repository, false otherwise.
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
 * @returns {boolean} True if inside a Mercurial repository, false otherwise.
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
 * Attempts to initialize a Git repository in the current directory.
 * @returns {boolean} True if Git was initialized successfully, false otherwise.
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
 * Attempts to create an initial Git commit for the project.
 * @param {string} appPath - Path to the application directory.
 * @returns {boolean} True if commit was created successfully, false otherwise.
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
 * Checks if React and React-Dom are installed in the package.json dependencies.
 * @param {Object} appPackage - The application's package.json object.
 * @returns {boolean} True if React is installed, false otherwise.
 */
function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};

  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

/**
 * Determines the package manager to use based on project configuration.
 * @param {boolean} useYarn - Whether the project uses Yarn.
 * @returns {{ command: string, remove: string, args: string[] }} Package manager configuration.
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
    args: [
      'install',
      '--no-audit',
      '--save',
      verbose && '--verbose',
    ].filter(e => e),
  };
}

/**
 * Updates npm scripts to use Yarn commands if the project uses Yarn.
 * @param {Object} scripts - The scripts object to update.
 * @returns {Object} Updated scripts object with Yarn commands.
 */
function updateScriptsForYarn(scripts) {
  return Object.entries(scripts).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}

/**
 * Merges template package scripts with default CRA scripts.
 * @param {Object} templateScripts - Scripts from the template package.
 * @returns {Object} Merged scripts object.
 */
function mergeTemplateScripts(templateScripts) {
  return Object.assign(
    {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test',
      eject: 'react-scripts eject',
    },
    templateScripts
  );
}

/**
 * Filters template package keys to determine which should replace appPackage keys.
 * @param {Object} templatePackage - The template's package.json object.
 * @param {string[]} blacklist - Keys to ignore.
 * @param {string[]} mergeKeys - Keys to merge instead of replace.
 * @returns {string[]} Array of keys to replace.
 */
function getTemplatePackageReplaceKeys(templatePackage, blacklist, mergeKeys) {
  return Object.keys(templatePackage).filter(key => {
    return (
      !blacklist.includes(key) &&
      !mergeKeys.includes(key)
    );
  });
}

/**
 * Processes and updates the application's package.json with template data.
 * @param {Object} appPackage - The application's package.json object.
 * @param {Object} templatePackage - The template's package.json object.
 * @param {boolean} useYarn - Whether the project uses Yarn.
 * @returns {Object} Updated package.json object.
 */
function processPackageJson(appPackage, templatePackage, useYarn) {
  appPackage.dependencies = appPackage.dependencies || {};

  const templateScripts = templatePackage.scripts || {};
  appPackage.scripts = mergeTemplateScripts(templateScripts);

  if (useYarn) {
    appPackage.scripts = updateScriptsForYarn(appPackage.scripts);
  }

  appPackage.eslintConfig = {
    extends: 'react-app',
  };

  appPackage.browserslist = defaultBrowsers;

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

  const templatePackageToReplace = getTemplatePackageReplaceKeys(
    templatePackage,
    templatePackageBlacklist,
    templatePackageToMerge
  );

  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  return appPackage;
}

/**
 * Installs template dependencies using the specified package manager.
 * @param {string} command - The package manager command (npm or yarn).
 * @param {string[]} args - Arguments for the package manager.
 * @returns {boolean} True if installation succeeded, false otherwise.
 */
function installDependencies(command, args) {
  console.log();
  console.log(`Installing template dependencies using ${command}...`);

  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }

  return true;
}

/**
 * Verifies TypeScript setup if TypeScript dependencies are present.
 * @param {string[]} args - The package manager arguments.
 */
function verifyTypeScriptIfPresent(args) {
  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }
}

/**
 * Removes the template package using the specified package manager.
 * @param {string} command - The package manager command.
 * @param {string} templateName - The name of the template to remove.
 * @returns {boolean} True if removal succeeded, false otherwise.
 */
function removeTemplate(command, templateName) {
  console.log(`Removing template package using ${command}...`);
  console.log();

  const proc = spawn.sync(command, [command === 'yarnpkg' ? 'remove' : 'uninstall', templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} ${templateName}\` failed`);
    return false;
  }

  return true;
}

/**
 * Displays success message with project information.
 * @param {string} appName - The name of the created application.
 * @param {string} appPath - The path to the application directory.
 * @param {string} displayedCommand - The package manager command to display.
 * @param {string} cdpath - The path to cd into.
 * @param {boolean} readmeExists - Whether a README.md file existed.
 */
function displaySuccessMessage(appName, appPath, displayedCommand, cdpath, readmeExists) {
  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'yarn' ? '' : 'run '}build`)
  );
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'yarn' ? '' : 'run '}eject`)
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

/**
 * Determines the correct cd path based on original directory and app path.
 * @param {string} originalDirectory - The original directory where CRA was run.
 * @param {string} appName - The name of the application.
 * @param {string} appPath - The path to the application directory.
 * @returns {string} The path to cd into.
 */
function getCdPath(originalDirectory, appName, appPath) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}

/**
 * Main function to initialize a Create React App project.
 * @param {string} appPath - Path to the application directory.
 * @param {string} appName - Name of the application.
 * @param {boolean} verbose - Whether to run in verbose mode.
 * @param {string} originalDirectory - Original directory where CRA was run.
 * @param {string} templateName - Name of the template to use.
 */
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

  const templateJsonPath = path.join(templatePath, 'template.json');

  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }

  const templatePackage = templateJson.package || {};

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

  const processedPackage = processPackageJson(appPackage, templatePackage, useYarn);

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(processedPackage, null, 2) + os.EOL
  );

  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }

  const templateDir = path.join(templatePath, 'template');
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    return;
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
      // Silencing the error. As it fall backs to using default npm commands.
    }
  }

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

  let initializedGit = false;

  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  const packageManagerConfig = getPackageManagerConfig(useYarn);
  const { command, args } = packageManagerConfig;

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

  if (!isReactInstalled(processedPackage)) {
    args.push('react', 'react-dom');
  }

  if ((!isReactInstalled(processedPackage) || templateName) && args.length > 1) {
    installDependencies(command, args);
  }

  verifyTypeScriptIfPresent(args);

  removeTemplate(command, templateName);

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdpath = getCdPath(originalDirectory, appName, appPath);
  const displayedCommand = useYarn ? 'yarn' : 'npm';

  displaySuccessMessage(appName, appPath, displayedCommand, cdpath, readmeExists);
};
```