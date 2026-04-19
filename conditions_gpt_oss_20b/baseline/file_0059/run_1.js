'use strict';

const fs = require('fs-extra');
const path = require('path');
const chalk = require('react-dev-utils/chalk');
const execSync = require('child_process').execSync;
const spawn = require('react-dev-utils/crossSpawn');
const { defaultBrowsers } = require('react-dev-utils/browsersHelper');
const os = require('os');
const verifyTypeScriptSetup = require('./utils/verifyTypeScriptSetup');

process.on('unhandledRejection', err => {
  throw err;
});

function isInGitRepository() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isInMercurialRepository() {
  try {
    execSync('hg --cwd . root', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function tryGitInit() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    if (isInGitRepository() || isInMercurialRepository()) return false;
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
    execSync(
      'git commit -m "Initialize project using Create React App"',
      { stdio: 'ignore' }
    );
    return true;
  } catch (e) {
    console.warn('Git commit not created', e);
    console.warn('Removing .git directory...');
    try {
      fs.removeSync(path.join(appPath, '.git'));
    } catch {
      /* ignore */
    }
    return false;
  }
}

function isReactInstalled(appPackage) {
  const deps = appPackage.dependencies || {};
  return typeof deps.react !== 'undefined' && typeof deps['react-dom'] !== 'undefined';
}

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

function mergePackage(appPackage, templatePackage) {
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

  if (fs.existsSync(path.join(appPath, 'yarn.lock'))) {
    appPackage.scripts = Object.entries(appPackage.scripts).reduce(
      (acc, [k, v]) => ({ ...acc, [k]: v.replace(/(npm run |npm )/, 'yarn ') }),
      {}
    );
  }

  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  toReplace.forEach(key => {
    appPackage[key] = templatePackage[key];
  });

  return appPackage;
}

function copyTemplateFiles(templatePath, appPath) {
  const templateDir = path.join(templatePath, 'template');
  if (!fs.existsSync(templateDir)) {
    console.error(`Could not locate supplied template: ${chalk.green(templateDir)}`);
    return false;
  }
  fs.copySync(templateDir, appPath);
  return true;
}

function adjustReadme(appPath, useYarn) {
  if (!useYarn) return;
  try {
    const readmePath = path.join(appPath, 'README.md');
    const content = fs.readFileSync(readmePath, 'utf8');
    fs.writeFileSync(readmePath, content.replace(/(npm run |npm )/g, 'yarn '), 'utf8');
  } catch {
    /* ignore */
  }
}

function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const sourcePath = path.join(appPath, 'gitignore');
  if (fs.existsSync(gitignorePath)) {
    const data = fs.readFileSync(sourcePath);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(sourcePath);
  } else {
    fs.moveSync(sourcePath, gitignorePath, { overwrite: true });
  }
}

function installDependencies(
  appPackage,
  templatePackage,
  useYarn,
  templateName,
  verbose
) {
  const command = useYarn ? 'yarnpkg' : 'npm';
  const remove = useYarn ? 'remove' : 'uninstall';
  const args = useYarn
    ? ['add']
    : [
        'install',
        '--no-audit',
        '--save',
        ...(verbose ? ['--verbose'] : []),
      ];

  const deps = Object.entries({
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  });

  if (deps.length) {
    args.push(...deps.map(([dep, ver]) => `${dep}@${ver}`));
  }

  if (!isReactInstalled(appPackage)) {
    args.push('react', 'react-dom');
  }

  if (args.length > 1) {
    console.log();
    console.log(`Installing template dependencies using ${command}...`);
    const proc = spawn.sync(command, args, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${args.join(' ')}\` failed`);
      return false;
    }
  }

  if (args.find(arg => arg.includes('typescript'))) {
    console.log();
    verifyTypeScriptSetup();
  }

  console.log(`Removing template package using ${command}...`);
  console.log();
  const removeProc = spawn.sync(command, [remove, templateName], { stdio: 'inherit' });
  if (removeProc.status !== 0) {
    console.error(`\`${command} ${remove} ${templateName}\` failed`);
    return false;
  }

  return true;
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

  const { templatePath, templateJson } = loadTemplate(templateName, appPath);
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

  mergePackage(appPackage, templatePackage);

  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  const readmeExists = fs.existsSync(path.join(appPath, 'README.md'));
  if (readmeExists) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }

  if (!copyTemplateFiles(templatePath, appPath)) return;

  adjustReadme(appPath, useYarn);
  handleGitignore(appPath);

  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log();
    console.log('Initialized a git repository.');
  }

  if (!installDependencies(appPackage, templatePackage, useYarn, templateName, verbose))
    return;

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