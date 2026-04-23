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

/* -------------------------------------------------------------------------- */
/* Helper utilities                                                            */
/* -------------------------------------------------------------------------- */

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
 * Attempts to initialise a new Git repository.
 * @returns {boolean} true if a repository was created.
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
 * Attempts to create an initial commit.
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
 * Determines whether React and React‑DOM are listed as dependencies.
 * @param {{dependencies?: Record<string, string>}} appPackage
 * @returns {boolean}
 */
function isReactInstalled(appPackage) {
  const deps = appPackage.dependencies || {};
  return typeof deps.react !== 'undefined' && typeof deps['react-dom'] !== 'undefined';
}

/**
 * Returns package‑manager specific configuration.
 * @param {boolean} useYarn
 * @returns {{command:string,remove:string,args:string[]}}
 */
function getPkgMgrConfig(useYarn) {
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
      ...(process.argv.includes('--verbose') ? ['--verbose'] : []),
    ],
  };
}

/**
 * Rewrites npm script commands to Yarn equivalents.
 * @param {Record<string,string>} scripts
 * @returns {Record<string,string>}
 */
function rewriteScriptsForYarn(scripts) {
  return Object.entries(scripts).reduce((acc, [k, v]) => {
    acc[k] = v.replace(/(npm run |npm )/, 'yarn ');
    return acc;
  }, {});
}

/**
 * Handles the .gitignore / gitignore renaming logic.
 * @param {string} appPath
 */
function handleGitignore(appPath) {
  const gitignoreExists = fs.existsSync(path.join(appPath, '.gitignore'));
  if (gitignoreExists) {
    const data = fs.readFileSync(path.join(appPath, 'gitignore'));
    fs.appendFileSync(path.join(appPath, '.gitignore'), data);
    fs.unlinkSync(path.join(appPath, 'gitignore'));
  } else {
    fs.moveSync(path.join(appPath, 'gitignore'), path.join(appPath, '.gitignore'), []);
  }
}

/**
 * Installs template and React dependencies using the selected package manager.
 * @param {object} opts
 * @param {string} opts.command
 * @param {string[]} opts.args
 * @param {boolean} opts.verbose
 * @param {boolean} opts.useYarn
 */
function installDependencies({ command, args, verbose, useYarn }) {
  console.log();
  console.log(`Installing template dependencies using ${command}...`);
  const proc = spawn.sync(command, args, { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
    process.exit(1);
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
  const proc = spawn.sync(command, [remove, templateName], { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    process.exit(1);
  }
}

/**
 * Displays the final success message.
 * @param {object} opts
 * @param {string} opts.appName
 * @param {string} opts.appPath
 * @param {boolean} opts.useYarn
 * @param {string} opts.cdpath
 * @param {boolean} opts.readmeExists
 */
function displaySuccess({ appName, appPath, useYarn, cdpath, readmeExists }) {
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
  console.log(chalk.cyan(`  ${displayedCommand} ${useYarn ? '' : 'run '}eject`));
  console.log('    Removes this tool and copies build dependencies, configuration files');
  console.log('    and scripts into the app directory. If you do this, you can’t go back!');
  console.log();
  console.log('We suggest that you begin by typing:');
  console.log();
  console.log(chalk.cyan('  cd'), cdpath);
  console.log(`  ${chalk.cyan(`${displayedCommand} start`)}`);
  if (readmeExists) {
    console.log();
    console.log(
      chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`')
    );
  }
  console.log();
  console.log('Happy hacking!');
}

/* -------------------------------------------------------------------------- */
/* Main exported function                                                     */
/* -------------------------------------------------------------------------- */

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
      )} or ${chalk.cyan('yarn global remove create-react-app')} before using ${chalk.cyan(
        'create-react-app'
      )} again.`
    );
    return;
  }

  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJsonPath = path.join(templatePath, 'template.json');
  const templateJson = fs.existsSync(templateJsonPath) ? require(templateJsonPath) : {};

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

  const templatePackage = templateJson.package || {};

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
    key => !templatePackageBlacklist.includes(key) && !templatePackageToMerge.includes(key)
  );

  /* ---- package.json updates ------------------------------------------------ */
  appPackage.dependencies = appPackage.dependencies || {};

  const baseScripts = {
    start: 'react-scripts start',
    build: 'react-scripts build',
    test: 'react-scripts test',
    eject: 'react-scripts eject',
  };
  const mergedScripts = Object.assign(baseScripts, templatePackage.scripts || {});
  appPackage.scripts = useYarn ? rewriteScriptsForYarn(mergedScripts) : mergedScripts;

  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  templatePackageToReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  /* ---- README handling ----------------------------------------------------- */
  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }

  const templateDir = path.join(templatePath, 'template');
  if (!fs.existsSync(templateDir)) {
    console.error(`Could not locate supplied template: ${chalk.green(templateDir)}`);
    return;
  }
  fs.copySync(templateDir, appPath);

  if (useYarn) {
    try {
      const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
      fs.writeFileSync(
        path.join(appPath, 'README.md'),
        readme.replace(/(npm run |npm )/g, 'yarn '),
        'utf8'
      );
    } catch {}
  }

  /* ---- .gitignore handling ------------------------------------------------- */
  handleGitignore(appPath);

  /* ---- Git initialisation -------------------------------------------------- */
  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  /* ---- Dependency installation --------------------------------------------- */
  const { command, remove, args: baseArgs } = getPkgMgrConfig(useYarn);
  let args = [...baseArgs];

  const depsToInstall = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });
  if (depsToInstall.length) {
    args = args.concat(
      depsToInstall.map(([dep, ver]) => `${dep}@${ver}`)
    );
  }

  if (!isReactInstalled(appPackage)) {
    args = args.concat(['react', 'react-dom']);
  }

  if (( !isReactInstalled(appPackage) || templateName) && args.length > 1) {
    installDependencies({ command, args, verbose, useYarn });
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  /* ---- Remove template package --------------------------------------------- */
  removeTemplatePackage(command, remove, templateName);

  /* ---- Final git commit ----------------------------------------------------- */
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  /* ---- Success message ------------------------------------------------------ */
  const cdpath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;

  displaySuccess({
    appName,
    appPath,
    useYarn,
    cdpath,
    readmeExists,
  });
};
```