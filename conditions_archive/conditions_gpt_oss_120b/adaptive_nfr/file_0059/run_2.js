```javascript
// @remove-file-on-eject
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
'use strict';

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

/* -------------------------------------------------------------------------- */
/* Helper predicates                                                          */
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
 * Determines whether React and React‑DOM are listed as dependencies.
 * @param {object} appPackage
 * @returns {boolean}
 */
function isReactInstalled(appPackage) {
  const deps = appPackage.dependencies || {};
  return typeof deps.react !== 'undefined' && typeof deps['react-dom'] !== 'undefined';
}

/* -------------------------------------------------------------------------- */
/* Git utilities                                                              */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Template handling                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Loads template metadata and validates the presence of a template name.
 * @param {string} templateName
 * @param {string} appPath
 * @returns {{templatePath:string, templateJson:object}}
 */
function loadTemplate(templateName, appPath) {
  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJsonPath = path.join(templatePath, 'template.json');
  const templateJson = fs.existsSync(templateJsonPath)
    ? require(templateJsonPath)
    : {};
  return { templatePath, templateJson };
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

  // scripts
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

  // replace fields
  toReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

/**
 * Writes the updated package.json back to disk.
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
 * Handles README renaming and Yarn adjustments.
 * @param {string} appPath
 * @param {boolean} useYarn
 * @returns {boolean} true if a README existed before.
 */
function processReadme(appPath, useYarn) {
  const readmePath = path.join(appPath, 'README.md');
  const readmeExists = fs.existsSync(readmePath);
  if (readmeExists) {
    fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
  }
  if (useYarn) {
    try {
      const content = fs.readFileSync(readmePath, 'utf8');
      fs.writeFileSync(
        readmePath,
        content.replace(/(npm run |npm )/g, 'yarn '),
        'utf8'
      );
    } catch {}
  }
  return readmeExists;
}

/**
 * Copies template files into the new app directory.
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
    process.exit(1);
  }
}

/**
 * Normalises .gitignore handling.
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

/* -------------------------------------------------------------------------- */
/* Package manager abstraction                                                */
/* -------------------------------------------------------------------------- */

/**
 * Returns command configuration based on the chosen package manager.
 * @param {boolean} useYarn
 * @param {boolean} verbose
 * @returns {{command:string, remove:string, args:string[]}}
 */
function getPkgMgrConfig(useYarn, verbose) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', args: ['add'] };
  }
  const base = [
    'install',
    '--no-audit',
    '--save',
    verbose && '--verbose',
  ].filter(Boolean);
  return { command: 'npm', remove: 'uninstall', args: base };
}

/**
 * Extends args with template dependencies and ensures React is present.
 * @param {string[]} args
 * @param {object} templatePackage
 * @param {object} appPackage
 * @returns {string[]}
 */
function augmentInstallArgs(args, templatePackage, appPackage) {
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
  return args;
}

/* -------------------------------------------------------------------------- */
/* Main export                                                                */
/* -------------------------------------------------------------------------- */

module.exports = function (
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  // ------------------------------------------------------------------------
  // Validate template name
  // ------------------------------------------------------------------------
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

  // ------------------------------------------------------------------------
  // Load template metadata
  // ------------------------------------------------------------------------
  const { templatePath, templateJson } = loadTemplate(templateName, appPath);
  const templatePackage = templateJson.package || {};

  // ------------------------------------------------------------------------
  // Deprecation warning
  // ------------------------------------------------------------------------
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

  // ------------------------------------------------------------------------
  // Prepare app package.json
  // ------------------------------------------------------------------------
  const appPackagePath = path.join(appPath, 'package.json');
  const appPackage = require(appPackagePath);
  appPackage.dependencies = appPackage.dependencies || {};

  // scripts & eslint & browserslist
  mergeTemplatePackage(appPackage, templatePackage);
  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  // write back
  writePackageJson(appPath, appPackage);

  // ------------------------------------------------------------------------
  // README handling
  // ------------------------------------------------------------------------
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));
  const readmeHad = processReadme(appPath, useYarn);

  // ------------------------------------------------------------------------
  // Copy template files
  // ------------------------------------------------------------------------
  copyTemplateFiles(path.join(templatePath, 'template'), appPath);

  // ------------------------------------------------------------------------
  // .gitignore handling
  // ------------------------------------------------------------------------
  handleGitignore(appPath);

  // ------------------------------------------------------------------------
  // Git initialisation
  // ------------------------------------------------------------------------
  let initializedGit = false;
  if (tryGitInit()) {
    initializedGit = true;
    console.log();
    console.log('Initialized a git repository.');
  }

  // ------------------------------------------------------------------------
  // Package manager configuration
  // ------------------------------------------------------------------------
  const { command, remove, args: baseArgs } = getPkgMgrConfig(useYarn, verbose);
  let installArgs = augmentInstallArgs(baseArgs, templatePackage, appPackage);

  // ------------------------------------------------------------------------
  // Install dependencies if needed
  // ------------------------------------------------------------------------
  if (installArgs.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    const proc = spawn.sync(command, installArgs, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${installArgs.join(' ')}\` failed`);
      return;
    }
  }

  // ------------------------------------------------------------------------
  // TypeScript verification
  // ------------------------------------------------------------------------
  if (installArgs.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  // ------------------------------------------------------------------------
  // Remove the template package itself
  // ------------------------------------------------------------------------
  console.log(`Removing template package using ${command}...`);
  console.log();
  const rmProc = spawn.sync(command, [remove, templateName], {
    stdio: 'inherit',
  });
  if (rmProc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    return;
  }

  // ------------------------------------------------------------------------
  // Final git commit
  // ------------------------------------------------------------------------
  if (initializedGit && tryGitCommit(appPath)) {
    console.log();
    console.log('Created git commit.');
  }

  // ------------------------------------------------------------------------
  // Success output
  // ------------------------------------------------------------------------
  const cdpath =
    originalDirectory && path.join(originalDirectory, appName) === appPath
      ? appName
      : appPath;
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
  if (readmeHad) {
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
```