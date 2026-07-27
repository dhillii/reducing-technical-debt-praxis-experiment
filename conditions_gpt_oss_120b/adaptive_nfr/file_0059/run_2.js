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
 * Checks if the current directory is inside a Mercurial repository.
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
    } catch {
      // ignore
    }
    return false;
  }
}

/**
 * Validates that a template name was provided.
 * @param {string} templateName
 * @returns {boolean} true if valid.
 */
function validateTemplateName(templateName) {
  if (templateName) {
    return true;
  }
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
 * Resolves the absolute path of a template.
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
 * @returns {{package?: object, dependencies?: object, scripts?: object}}
 */
function loadTemplateJson(templatePath) {
  const templateJsonPath = path.join(templatePath, 'template.json');
  if (fs.existsSync(templateJsonPath)) {
    return require(templateJsonPath);
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
function mergeTemplatePackage(appPackage, templatePackage) {
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

  appPackage.dependencies = appPackage.dependencies || {};

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

  // Update scripts for Yarn users later via caller.

  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  toReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
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
 * @returns {boolean} true if copy succeeded.
 */
function copyTemplateFiles(templatePath, appPath) {
  const templateDir = path.join(templatePath, 'template');
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
    return true;
  }
  console.error(
    `Could not locate supplied template: ${chalk.green(templateDir)}`
  );
  return false;
}

/**
 * Adjusts README commands for Yarn users.
 * @param {string} appPath
 */
function adjustReadmeForYarn(appPath) {
  try {
    const readmePath = path.join(appPath, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(
      readmePath,
      readme.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch {
    // Silently ignore errors.
  }
}

/**
 * Handles .gitignore / gitignore file migration.
 * @param {string} appPath
 */
function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const gitignoreTmp = path.join(appPath, 'gitignore');
  if (fs.existsSync(gitignorePath)) {
    const data = fs.readFileSync(gitignoreTmp);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(gitignoreTmp);
  } else {
    fs.moveSync(gitignoreTmp, gitignorePath, []);
  }
}

/**
 * Determines the package manager command and arguments.
 * @param {boolean} useYarn
 * @param {boolean} verbose
 * @returns {{command:string, remove:string, args:string[]}}
 */
function selectPackageManager(useYarn, verbose) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', args: ['add'] };
  }
  const baseArgs = [
    'install',
    '--no-audit',
    '--save',
    verbose && '--verbose',
  ].filter(Boolean);
  return { command: 'npm', remove: 'uninstall', args: baseArgs };
}

/**
 * Adds Yarn-specific script prefixes.
 * @param {object} scripts
 * @returns {object}
 */
function adaptScriptsForYarn(scripts) {
  return Object.entries(scripts).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: value.replace(/(npm run |npm )/, 'yarn '),
    }),
    {}
  );
}

/**
 * Installs required dependencies.
 * @param {object} options
 * @param {object} appPackage
 * @param {string} templateName
 * @param {string} command
 * @param {string[]} args
 * @returns {{command:string, args:string[]}|null}
 */
function installDependencies({
  useYarn,
  templatePackage,
  appPackage,
  templateName,
  command,
  args,
}) {
  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (deps.length) {
    args = args.concat(
      deps.map(([dep, ver]) => `${dep}@${ver}`)
    );
  }

  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  if ((!isReactInstalled(appPackage) || templateName) && args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return null;
    }
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  return { command, args };
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
 * Computes the path to display for `cd` command.
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
 * @param {object} params
 */
function displaySuccessMessage({
  appName,
  appPath,
  useYarn,
  displayedCommand,
  cdpath,
  readmeRenamed,
}) {
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
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  if (!validateTemplateName(templateName)) {
    return;
  }

  const templatePath = resolveTemplatePath(templateName, appPath);
  const templateJson = loadTemplateJson(templatePath);
  const templatePackage = templateJson.package || {};

  warnDeprecatedTemplateJson(templateJson);

  mergeTemplatePackage(appPackage, templatePackage);

  if (useYarn) {
    appPackage.scripts = adaptScriptsForYarn(appPackage.scripts);
  }

  writePackageJson(appPath, appPackage);

  const readmeRenamed = renameReadmeIfExists(appPath);

  if (!copyTemplateFiles(templatePath, appPath)) {
    return;
  }

  if (useYarn) {
    adjustReadmeForYarn(appPath);
  }

  handleGitignore(appPath);

  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  const { command, remove, args: baseArgs } = selectPackageManager(
    useYarn,
    verbose
  );

  const installResult = installDependencies({
    useYarn,
    templatePackage,
    appPackage,
    templateName,
    command,
    args: baseArgs,
  });

  if (!installResult) {
    return;
  }

  if (!removeTemplatePackage(command, remove, templateName)) {
    return;
  }

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdpath = computeCdPath(originalDirectory, appPath, appName);
  const displayedCommand = useYarn ? 'yarn' : 'npm';

  displaySuccessMessage({
    appName,
    appPath,
    useYarn,
    displayedCommand,
    cdpath,
    readmeRenamed,
  });
};

/**
 * Checks whether React and ReactDOM are listed as dependencies.
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