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
 * Checks whether the current directory is inside a Git repository.
 * @returns {boolean}
 */
function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether the current directory is inside a Mercurial repository.
 * @returns {boolean}
 */
function isInMercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Attempts to initialize a new Git repository.
 * @returns {boolean} true if a new repo was created.
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
 * Attempts to create an initial Git commit.
 * @param {string} appPath
 * @returns {boolean}
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
    } catch {}
    return false;
  }
}

/**
 * Determines whether React and ReactDOM are already listed as dependencies.
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
 * Validates that a template name was provided.
 * @param {string} templateName
 * @returns {boolean} true if valid.
 */
function validateTemplateName(templateName) {
  if (templateName) return true;
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
    )} or ${chalk.cyan('yarn global remove create-react-app')} before using ${chalk.cyan(
      'create-react-app'
    )} again.`
  );
  return false;
}

/**
 * Resolves the absolute path to a template.
 * @param {string} templateName
 * @param {string} appPath
 * @returns {string}
 */
function resolveTemplatePath(templateName, appPath) {
  return path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
}

/**
 * Loads template.json if it exists.
 * @param {string} templatePath
 * @returns {object}
 */
function loadTemplateJson(templatePath) {
  const jsonPath = path.join(templatePath, 'template.json');
  if (fs.existsSync(jsonPath)) {
    return require(jsonPath);
  }
  return {};
}

/**
 * Warns about deprecated keys in template.json.
 * @param {object} templateJson
 */
function warnDeprecatedTemplateJson(templateJson) {
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
 * Merges template package fields into the app's package.json.
 * @param {object} appPackage
 * @param {object} templatePackage
 */
function mergePackageFields(appPackage, templatePackage) {
  const blacklist = [
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
  const toMerge = ['dependencies', 'scripts'];
  const toReplace = Object.keys(templatePackage).filter(
    key => !blacklist.includes(key) && !toMerge.includes(key)
  );

  // Ensure dependencies object exists
  appPackage.dependencies = appPackage.dependencies || {};

  // Merge scripts
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

  // Replace fields
  toReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

/**
 * Adjusts script commands for Yarn users.
 * @param {object} scripts
 * @returns {object}
 */
function adaptScriptsForYarn(scripts) {
  return Object.entries(scripts).reduce((acc, [key, value]) => {
    acc[key] = value.replace(/(npm run |npm )/, 'yarn ');
    return acc;
  }, {});
}

/**
 * Writes the updated package.json to disk.
 * @param {string} appPath
 * @param {object} appPackage
 */
function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

/**
 * Renames existing README if present.
 * @param {string} appPath
 * @returns {boolean} true if a README was renamed.
 */
function renameReadmeIfExists(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
    return true;
  }
  return false;
}

/**
 * Copies template files into the new app directory.
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
    throw new Error('TemplateMissing');
  }
}

/**
 * Rewrites README commands for Yarn users.
 * @param {string} appPath
 */
function rewriteReadmeForYarn(appPath) {
  try {
    const readmePath = path.join(appPath, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      content.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch {}
}

/**
 * Normalizes .gitignore handling.
 * @param {string} appPath
 */
function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const placeholderPath = path.join(appPath, 'gitignore');

  if (fs.existsSync(gitignorePath)) {
    const data = fs.readFileSync(placeholderPath);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(placeholderPath);
  } else {
    fs.moveSync(placeholderPath, gitignorePath, []);
  }
}

/**
 * Determines package manager command configuration.
 * @param {boolean} useYarn
 * @param {boolean} verbose
 * @returns {{command:string, remove:string, args:string[]}}
 */
function getPackageManagerConfig(useYarn, verbose) {
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
 * Builds the list of dependencies to install.
 * @param {object} templatePackage
 * @returns {string[]}
 */
function buildDependenciesList(templatePackage) {
  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
  return deps.map(([dep, version]) => `${dep}@${version}`);
}

/**
 * Installs dependencies using the selected package manager.
 * @param {string} command
 * @param {string[]} args
 * @returns {boolean} true if installation succeeded.
 */
function installDependencies(command, args) {
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    return false;
  }
  return true;
}

/**
 * Removes the template package after installation.
 * @param {string} command
 * @param {string} remove
 * @param {string} templateName
 * @returns {boolean}
 */
function removeTemplatePackage(command, remove, templateName) {
  console.log(`Removing template package using ${command}...`);
  console.log();
  const proc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    return false;
  }
  return true;
}

/**
 * Computes the path to display for the cd command.
 * @param {string} originalDirectory
 * @param {string} appPath
 * @param {string} appName
 * @returns {string}
 */
function computeCdPath(originalDirectory, appPath, appName) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}

/**
 * Displays the final success message.
 * @param {object} options
 */
function displaySuccessMessage({
  appName,
  appPath,
  useYarn,
  cdpath,
  readmeRenamed,
}) {
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
  if (readmeRenamed) {
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
 * Main entry point exported by the module.
 */
module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  if (!validateTemplateName(templateName)) {
    return;
  }

  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  const templatePath = resolveTemplatePath(templateName, appPath);
  const templateJson = loadTemplateJson(templatePath);
  const templatePackage = templateJson.package || {};

  warnDeprecatedTemplateJson(templateJson);

  mergePackageFields(appPackage, templatePackage);

  if (useYarn) {
    appPackage.scripts = adaptScriptsForYarn(appPackage.scripts);
  }

  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  writePackageJson(appPath, appPackage);

  const readmeRenamed = renameReadmeIfExists(appPath);

  copyTemplateFiles(templatePath, appPath);

  if (useYarn) {
    rewriteReadmeForYarn(appPath);
  }

  handleGitignore(appPath);

  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  const { command, remove, args: baseArgs } = getPackageManagerConfig(
    useYarn,
    verbose
  );
  let args = [...baseArgs];

  const depsToInstall = buildDependenciesList(templatePackage);
  if (depsToInstall.length) {
    args = args.concat(depsToInstall);
  }

  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  if (( !isReactInstalled(appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    if (!installDependencies(command, args)) {
      return;
    }
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  if (!removeTemplatePackage(command, remove, templateName)) {
    return;
  }

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdpath = computeCdPath(originalDirectory, appPath, appName);
  displaySuccessMessage({
    appName,
    appPath,
    useYarn,
    cdpath,
    readmeRenamed,
  });
};