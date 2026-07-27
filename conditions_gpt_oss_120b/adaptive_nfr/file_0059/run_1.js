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
    } catch (removeErr) {
      // ignore
    }
    return false;
  }
}

/**
 * Exits early if no template name is provided.
 * @param {string} templateName
 */
function exitIfNoTemplate(templateName) {
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
    process.exit(0);
  }
}

/**
 * Resolves template paths and loads its JSON configuration.
 * @param {string} appPath
 * @param {string} templateName
 * @returns {{templatePath:string, templateJson:any, templatePackage:any}}
 */
function loadTemplateInfo(appPath, templateName) {
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJsonPath = path.join(templatePath, 'template.json');
  let templateJson = {};
  if (fs.existsSync(templateJsonPath)) {
    templateJson = require(templateJsonPath);
  }
  const templatePackage = templateJson.package || {};
  return { templatePath, templateJson, templatePackage };
}

/**
 * Warns about deprecated keys in template.json.
 * @param {any} templateJson
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
 * Returns arrays describing which keys to replace or merge.
 * @param {any} templatePackage
 * @returns {{toReplace:string[], toMerge:string[]}}
 */
function getPackageMergeInfo(templatePackage) {
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
  return { toReplace, toMerge };
}

/**
 * Merges template package data into the app's package.json.
 * @param {any} appPackage
 * @param {any} templatePackage
 * @param {{toReplace:string[], toMerge:string[]}} mergeInfo
 * @param {boolean} useYarn
 */
function updateAppPackage(appPackage, templatePackage, mergeInfo, useYarn) {
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

  // Convert npm scripts to yarn if needed
  if (useYarn) {
    appPackage.scripts = Object.entries(appPackage.scripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }

  // ESLint config
  appPackage.eslintConfig = { extends: 'react-app' };
  // Browserslist
  appPackage.browserslist = defaultBrowsers;

  // Replace keys
  mergeInfo.toReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
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
    process.exit(1);
  }
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
  } catch (err) {
    // Silently ignore – fallback to npm commands.
  }
}

/**
 * Handles .gitignore / gitignore file renaming.
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
 * Determines package manager command configuration.
 * @param {boolean} useYarn
 * @param {boolean} verbose
 * @returns {{command:string, remove:string, args:string[]}}
 */
function getPackageManagerConfig(useYarn, verbose) {
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
 * Adds template dependencies (including dev) to args list.
 * @param {string[]} args
 * @param {any} templatePackage
 * @returns {string[]}
 */
function addTemplateDependencies(args, templatePackage) {
  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
  if (deps.length) {
    const depArgs = deps.map(([dep, ver]) => `${dep}@${ver}`);
    return args.concat(depArgs);
  }
  return args;
}

/**
 * Ensures react and react-dom are present in install args.
 * @param {string[]} args
 * @param {any} appPackage
 * @returns {string[]}
 */
function ensureReactInstalled(args, appPackage) {
  if (!isReactInstalled(appPackage)) {
    return args.concat(['react', 'react-dom']);
  }
  return args;
}

/**
 * Installs dependencies if conditions are met.
 * @param {string} command
 * @param {string[]} args
 * @param {boolean} shouldInstall
 */
function installDependenciesIfNeeded(command, args, shouldInstall) {
  if (!shouldInstall) return;
  console.log();
  console.log(`Installing template dependencies using ${command}...`);
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    process.exit(1);
  }
}

/**
 * Runs TypeScript verification if a TypeScript dependency is present.
 * @param {string[]} args
 */
function maybeVerifyTypeScript(args) {
  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
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
    process.exit(1);
  }
}

/**
 * Creates a git commit if a repository was initialized.
 * @param {boolean} initializedGit
 * @param {string} appPath
 */
function createGitCommitIfInitialized(initializedGit, appPath) {
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }
}

/**
 * Computes the path to display for `cd` command.
 * @param {string|undefined} originalDirectory
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
 * Displays the final success instructions.
 * @param {string} appName
 * @param {string} appPath
 * @param {string} displayedCommand
 * @param {string} cdpath
 * @param {boolean} readmeExists
 */
function displaySuccess(appName, appPath, displayedCommand, cdpath, readmeExists) {
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
  exitIfNoTemplate(templateName);

  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));
  const { templatePath, templateJson, templatePackage } = loadTemplateInfo(
    appPath,
    templateName
  );

  warnDeprecatedTemplateJson(templateJson);

  const { toReplace } = getPackageMergeInfo(templatePackage);
  const appPackagePath = path.join(appPath, 'package.json');
  const appPackage = require(appPackagePath);

  updateAppPackage(appPackage, templatePackage, { toReplace }, useYarn);

  fs.writeFileSync(
    appPackagePath,
    JSON.stringify(appPackage, null, 2) + os.EOL
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
    adjustReadmeForYarn(appPath);
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

  let args = baseArgs;
  args = addTemplateDependencies(args, templatePackage);
  args = ensureReactInstalled(args, appPackage);

  const shouldInstall =
    (!isReactInstalled(appPackage) || templateName) && args.length > 1;
  installDependenciesIfNeeded(command, args, shouldInstall);
  maybeVerifyTypeScript(args);
  removeTemplatePackage(command, remove, templateName);
  createGitCommitIfInitialized(initializedGit, appPath);

  const cdpath = computeCdPath(originalDirectory, appPath, appName);
  const displayedCommand = useYarn ? 'yarn' : 'npm';
  displaySuccess(appName, appPath, displayedCommand, cdpath, readmeExists);
};

/**
 * Checks whether react and react-dom are listed as dependencies.
 * @param {any} appPackage
 * @returns {boolean}
 */
function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}