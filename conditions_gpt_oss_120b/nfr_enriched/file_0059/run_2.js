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

/* Git helpers -------------------------------------------------------------- */
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
      // ignore
    }
    return false;
  }
}

/* Helper: check if React is already listed in dependencies ----------------- */
function isReactInstalled(appPackage) {
  const dependencies = appPackage.dependencies || {};
  return (
    typeof dependencies.react !== 'undefined' &&
    typeof dependencies['react-dom'] !== 'undefined'
  );
}

/* Helper: resolve template location ---------------------------------------- */
function resolveTemplatePath(appPath, templateName) {
  return path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
}

/* Helper: load template.json if present ----------------------------------- */
function loadTemplateJson(templatePath) {
  const jsonPath = path.join(templatePath, 'template.json');
  if (fs.existsSync(jsonPath)) {
    return require(jsonPath);
  }
  return {};
}

/* Helper: warn about deprecated root-level keys --------------------------- */
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

/* Helper: process template package data ------------------------------------ */
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

/* Helper: merge template data into the app's package.json ----------------- */
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

/* Helper: write updated package.json to disk -------------------------------- */
function writePackageJson(appPath, appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

/* Helper: backup existing README if present -------------------------------- */
function backupReadmeIfExists(appPath) {
  const readmePath = path.join(appPath, 'README.md');
  if (fs.existsSync(readmePath)) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
    return true;
  }
  return false;
}

/* Helper: copy template files into the new app ----------------------------- */
function copyTemplateFiles(templatePath, appPath) {
  const templateDir = path.join(templatePath, 'template');
  if (fs.existsSync(templateDir)) {
    fs.copySync(templateDir, appPath);
  } else {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
    throw new Error('Missing template directory');
  }
}

/* Helper: adjust README commands for Yarn users ---------------------------- */
function updateReadmeForYarn(appPath) {
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

/* Helper: ensure .gitignore is correctly placed ---------------------------- */
function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const tempPath = path.join(appPath, 'gitignore');

  if (fs.existsSync(gitignorePath)) {
    const data = fs.readFileSync(tempPath);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(tempPath);
  } else {
    fs.moveSync(tempPath, gitignorePath, []);
  }
}

/* Helper: initialize a git repository if possible -------------------------- */
function initGitRepository() {
  if (tryGitInit()) {
    console.log();
    console.log('Initialized a git repository.');
    return true;
  }
  return false;
}

/* Helper: decide which package manager command to use ---------------------- */
function preparePackageManager(useYarn, verbose) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', args: ['add'] };
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

/* Helper: build the final argument list for installing dependencies --------- */
function augmentInstallArgs(baseArgs, templatePackage, appPackage) {
  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  let args = baseArgs.slice();

  if (deps.length) {
    args = args.concat(
      deps.map(([dep, version]) => `${dep}@${version}`)
    );
  }

  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  return args;
}

/* Helper: run the install process ------------------------------------------ */
function installDependencies(command, args) {
  console.log();
  console.log(`Installing template dependencies using ${command}...`);
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    throw new Error('Install failed');
  }
}

/* Helper: remove the template package after installation -------------------- */
function removeTemplatePackage(command, remove, templateName) {
  console.log(`Removing template package using ${command}...`);
  console.log();
  const proc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (proc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    throw new Error('Remove failed');
  }
}

/* Helper: compute the path displayed in the final instructions ------------- */
function computeCdPath(originalDirectory, appPath, appName) {
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    return appName;
  }
  return appPath;
}

/* Helper: display the final success message -------------------------------- */
function displaySuccessMessage({
  appName,
  appPath,
  useYarn,
  cdPath,
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
  console.log(chalk.cyan('  cd'), cdPath);
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

/* Main exported function --------------------------------------------------- */
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

  const readmeRenamed = backupReadmeIfExists(appPath);
  copyTemplateFiles(templatePath, appPath);
  if (useYarn) {
    updateReadmeForYarn(appPath);
  }

  handleGitignore(appPath);
  const initializedGit = initGitRepository();

  const { command, remove, args: baseArgs } = preparePackageManager(
    useYarn,
    verbose
  );
  const installArgs = augmentInstallArgs(baseArgs, templatePackage, appPackage);

  if (installArgs.length > 1) {
    try {
      installDependencies(command, installArgs);
    } catch {
      return;
    }
    if (installArgs.some(arg => arg.includes('typescript'))) {
      console.log();
      verifyTypeScriptSetup();
    }
  }

  try {
    removeTemplatePackage(command, remove, templateName);
  } catch {
    return;
  }

  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  const cdPath = computeCdPath(originalDirectory, appPath, appName);
  displaySuccessMessage({
    appName,
    appPath,
    useYarn,
    cdPath,
    readmeRenamed,
  });
};