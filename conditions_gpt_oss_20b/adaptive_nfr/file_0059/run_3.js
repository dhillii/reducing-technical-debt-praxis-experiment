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
 * Tries to initialize a Git repository if none exists.
 * @returns {boolean} true if a new repo was initialized
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
 * @param {string} appPath - Path to the app directory
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
 * Determines if React and React-DOM are installed in the app package.
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
 * Handles deprecation warning for template.json keys.
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
 * Merges template scripts into app scripts, preserving defaults.
 * @param {object} appPackage
 * @param {object} templatePackage
 */
function mergeScripts(appPackage, templatePackage) {
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
}

/**
 * Updates scripts for Yarn users by replacing npm prefixes.
 * @param {object} appPackage
 */
function updateScriptsForYarn(appPackage) {
  appPackage.scripts = Object.entries(appPackage.scripts).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}

/**
 * Applies template package keys that replace existing entries.
 * @param {object} appPackage
 * @param {object} templatePackage
 * @param {string[]} keysToReplace
 */
function applyTemplatePackageReplacements(appPackage, templatePackage, keysToReplace) {
  keysToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

/**
 * Handles renaming of README.md if it exists.
 * @param {string} appPath
 */
function handleReadmeRename(appPath) {
  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }
}

/**
 * Copies template files into the app directory.
 * @param {string} templateDir
 * @param {string} appPath
 */
function copyTemplateFiles(templateDir, appPath) {
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    throw new Error('Template not found');
  }
}

/**
 * Updates README commands to use Yarn if applicable.
 * @param {string} appPath
 * @param {boolean} useYarn
 */
function updateReadmeCommands(appPath, useYarn) {
  if (useYarn) {
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
}

/**
 * Handles .gitignore creation or merging.
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
 * Returns command configuration based on package manager.
 * @param {boolean} useYarn
 * @param {boolean} verbose
 * @returns {{command: string, remove: string, args: string[]}}
 */
function getCommandConfig(useYarn, verbose) {
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
 * Installs template dependencies and React if missing.
 * @param {object} appPackage
 * @param {object} templatePackage
 * @param {string} command
 * @param {string[]} args
 * @param {boolean} useYarn
 * @param {string} appPath
 */
function installDependencies(appPackage, templatePackage, command, args, useYarn, appPath) {
  const dependenciesToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (dependenciesToInstall.length) {
    args = args.concat(
      dependenciesToInstall.map(
        ([dependency, version]) => `${dependency}@${version}`
      )
    );
  }

  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  if ((!isReactInstalled(appPackage) || templatePackage) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      throw new Error('Dependency installation failed');
    }
  }
}

/**
 * Removes the template package after installation.
 * @param {string} command
 * @param {string} remove
 * @param {string} templateName
 */
function removeTemplatePackage(command, remove, templateName) {
  console.log(`Removing template package using ${command}...`);
  console.log();
  const proc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    throw new Error('Template removal failed');
  }
}

/**
 * Displays the success message after project creation.
 * @param {string} appName
 * @param {string} appPath
 * @param {string} displayedCommand
 * @param {boolean} readmeExists
 * @param {string} cdpath
 */
function displaySuccessMessage(
  appName,
  appPath,
  displayedCommand,
  readmeExists,
  cdpath
) {
  console.log();
  console.log(`Success! Created ${appName} at ${appPath}`);
  console.log('Inside that directory, you can run several commands:');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} start`));
  console.log('    Starts the development server.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'npm' ? 'run ' : ''}build`)
  );
  console.log('    Bundles the app into static files for production.');
  console.log();
  console.log(chalk.cyan(`  ${displayedCommand} test`));
  console.log('    Starts the test runner.');
  console.log();
  console.log(
    chalk.cyan(`  ${displayedCommand} ${displayedCommand === 'npm' ? 'run ' : ''}eject`)
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

  handleDeprecatedTemplateJson(templateJson);

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

  const templatePackageToReplace = Object.keys(templatePackage).filter(key => {
    return (
      !templatePackageBlacklist.includes(key) &&
      !templatePackageToMerge.includes(key)
    );
  });

  appPackage.dependencies = appPackage.dependencies || {};

  mergeScripts(appPackage, templatePackage);

  if (useYarn) {
    updateScriptsForYarn(appPackage);
  }

  appPackage.eslintConfig = {
    extends: 'react-app',
  };

  appPackage.browserslist = defaultBrowsers;

  applyTemplatePackageReplacements(appPackage, templatePackage, templatePackageToReplace);

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  handleReadmeRename(appPath);

  const templateDir = path.join(templatePath, 'template');
  copyTemplateFiles(templateDir, appPath);

  updateReadmeCommands(appPath, useYarn);

  handleGitignore(appPath);

  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  const { command, remove, args: initialArgs } = getCommandConfig(useYarn, verbose);

  installDependencies(appPackage, templatePackage, command, initialArgs, useYarn, appPath);

  if (initialArgs.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  removeTemplatePackage(command, remove, templateName);

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdpath =
    originalDirectory &&
    path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;

  const displayedCommand = useYarn ? 'yarn' : 'npm';

  displaySuccessMessage(appName, appPath, displayedCommand, fs.existsSync(path.join(appPath, 'README.old.md')), cdpath);
};