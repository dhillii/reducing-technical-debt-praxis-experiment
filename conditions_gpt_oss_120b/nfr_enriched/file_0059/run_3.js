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

/* Helper: check if current directory is inside a Git repo */
function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/* Helper: check if current directory is inside a Mercurial repo */
function isInMercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/* Helper: attempt to initialise a Git repository */
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

/* Helper: attempt to create an initial Git commit */
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

/* Resolve the absolute path of the selected template */
function resolveTemplatePath(appPath, templateName) {
  return path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
}

/* Load template.json if it exists */
function loadTemplateJson(templatePath) {
  const jsonPath = path.join(templatePath, 'template.json');
  if (fs.existsSync(jsonPath)) {
    return require(jsonPath);
  }
  return {};
}

/* Warn about deprecated root-level keys in template.json */
function warnDeprecatedTemplateKeys(templateJson) {
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

/* Process template package data and compute keys to replace */
function processTemplatePackage(templateJson) {
  const templatePackage = templateJson.package || {};

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
  const mergeKeys = ['dependencies', 'scripts'];
  const replaceKeys = Object.keys(templatePackage).filter(
    key => !blacklist.includes(key) && !mergeKeys.includes(key)
  );

  return { templatePackage, replaceKeys };
}

/* Merge template data into the app's package.json */
function mergePackageJson(appPackage, templatePackage, replaceKeys, useYarn) {
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

  if (useYarn) {
    appPackage.scripts = Object.entries(appPackage.scripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }

  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  replaceKeys.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

/* Persist the updated package.json to disk */
function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

/* Rename existing README if present and return flag */
function renameReadmeIfExists(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
    return true;
  }
  return false;
}

/* Copy template files into the new app directory */
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

/* Adjust README commands for Yarn users */
function updateReadmeForYarn(appPath, useYarn) {
  if (!useYarn) return;
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

/* Ensure .gitignore is correctly placed */
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

/* Initialise a Git repository if possible */
function initGitRepoIfNeeded() {
  if (tryGitInit()) {
    console.log();
    console.log('Initialized a git repository.');
    return true;
  }
  return false;
}

/* Determine package manager command and base arguments */
function preparePackageManager(useYarn, verbose) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', baseArgs: ['add'] };
  }
  return {
    command: 'npm',
    remove: 'uninstall',
    baseArgs: [
      'install',
      '--no-audit',
      '--save',
      verbose && '--verbose',
    ].filter(Boolean),
  };
}

/* Build the final argument list for installing dependencies */
function buildInstallArgs(baseArgs, templatePackage, appPackage, templateName) {
  let args = [...baseArgs];

  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
  if (deps.length) {
    args = args.concat(
      deps.map(([dep, version]) => `${dep}@${version}`)
    );
  }

  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  const shouldInstall = (!isReactInstalled(appPackage) || templateName) && args.length > 1;
  const hasTypescript = args.some(arg => arg.includes('typescript'));

  return { args, shouldInstall, hasTypescript };
}

/* Execute the dependency installation step */
function installDependencies(command, args) {
  console.log();
  console.log(`Installing template dependencies using ${command}...`);
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    process.exit(1);
  }
}

/* Remove the template package after installation */
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

/* Create an initial Git commit if a repo was initialised */
function createGitCommitIfPossible(appPath, initializedGit) {
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }
}

/* Compute the path to display for the cd command */
function computeCdPath(originalDirectory, appPath, appName) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}

/* Display the final success instructions */
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

/* Main exported function */
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

  const templatePath = resolveTemplatePath(appPath, templateName);
  const templateJson = loadTemplateJson(templatePath);
  warnDeprecatedTemplateKeys(templateJson);
  const { templatePackage, replaceKeys } = processTemplatePackage(templateJson);
  mergePackageJson(appPackage, templatePackage, replaceKeys, useYarn);
  writePackageJson(appPath, appPackage);

  const readmeRenamed = renameReadmeIfExists(appPath);
  if (!copyTemplateFiles(templatePath, appPath)) return;
  updateReadmeForYarn(appPath, useYarn);
  handleGitignore(appPath);

  const initializedGit = initGitRepoIfNeeded();

  const { command, remove, baseArgs } = preparePackageManager(useYarn, verbose);
  const { args, shouldInstall, hasTypescript } = buildInstallArgs(
    baseArgs,
    templatePackage,
    appPackage,
    templateName
  );

  if (shouldInstall) {
    installDependencies(command, args);
  }

  if (hasTypescript) {
    console.log();
    verifyTypeScriptSetup();
  }

  removeTemplatePackage(command, remove, templateName);
  createGitCommitIfPossible(appPath, initializedGit);

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

/* Helper: determine if React is already listed as a dependency */
function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}