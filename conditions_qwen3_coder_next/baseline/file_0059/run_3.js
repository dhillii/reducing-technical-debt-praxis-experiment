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
    handleMissingTemplate();
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
  validateTemplateStructure(templateJson);
  const shouldInstallReact = !isReactInstalled(appPackage);

  prepareAppPackage(appPackage, templatePackage, useYarn, templateJson);
  updateReadmeIfPresent(appPath, useYarn);
  handleGitignore(appPath);
  copyTemplateFiles(appPath, templatePath);

  const initializedGit = initializeGitRepo();
  const dependenciesToInstall = buildDependenciesList(
    appPackage,
    templatePackage,
    shouldInstallReact
  );

  if (dependenciesToInstall.length > 0) {
    installDependencies(appPath, useYarn, dependenciesToInstall);
  }

  if (dependenciesToInstall.includes('typescript')) {
    verifyTypeScriptSetup();
  }

  removeTemplatePackage(appPath, useYarn, templateName);

  if (initializedGit) {
    tryGitCommit(appPath);
  }

  showSuccessMessage(
    appPath,
    appName,
    originalDirectory,
    useYarn,
    readmeExists
  );
};

function handleMissingTemplate() {
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
}

function validateTemplateStructure(templateJson) {
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

function prepareAppPackage(appPackage, templatePackage, useYarn, templateJson) {
  setupScripts(appPackage, templatePackage, useYarn);
  setupESLintConfig(appPackage);
  setupBrowserslist(appPackage);
  mergeTemplatePackageKeys(appPackage, templatePackage);
  writePackageJson(appPackage);
}

function setupScripts(appPackage, templatePackage, useYarn) {
  const defaultScripts = {
    start: 'react-scripts start',
    build: 'react-scripts build',
    test: 'react-scripts test',
    eject: 'react-scripts eject',
  };

  const templateScripts = templatePackage.scripts || {};
  appPackage.scripts = Object.assign(defaultScripts, templateScripts);

  if (useYarn) {
    appPackage.scripts = Object.entries(appPackage.scripts).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value.replace(/(npm run |npm )/, 'yarn '),
      }),
      {}
    );
  }
}

function setupESLintConfig(appPackage) {
  appPackage.eslintConfig = {
    extends: 'react-app',
  };
}

function setupBrowserslist(appPackage) {
  appPackage.browserslist = defaultBrowsers;
}

function mergeTemplatePackageKeys(appPackage, templatePackage) {
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

  replaceKeys.forEach(key => {
    appPackage[key] = templatePackage[key];
  });
}

function writePackageJson(appPackage) {
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );
}

function updateReadmeIfPresent(appPath, useYarn) {
  const readmePath = path.join(appPath, 'README.md');
  if (!fs.existsSync(readmePath)) return;

  fs.renameSync(readmePath, path.join(appPath, 'README.old.md'));
}

function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  const gitignoreContentPath = path.join(appPath, 'gitignore');

  if (fs.existsSync(gitignorePath)) {
    const data = fs.readFileSync(gitignoreContentPath);
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(gitignoreContentPath);
  } else if (fs.existsSync(gitignoreContentPath)) {
    fs.moveSync(gitignoreContentPath, gitignorePath, []);
  }
}

function copyTemplateFiles(appPath, templatePath) {
  const templateDir = path.join(templatePath, 'template');
  if (!fs.existsSync(templateDir)) {
    console.error(
      `Could not locate supplied template: ${chalk.green(templateDir)}`
    );
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
    } catch (err) {
      // Silencing the error as it falls back to using default npm commands.
    }
  }
}

function initializeGitRepo() {
  if (tryGitInit()) {
    console.log();
    console.log('Initialized a git repository.');
    return true;
  }
  return false;
}

function buildDependenciesList(appPackage, templatePackage, shouldInstallReact) {
  const dependenciesToInstall = [];

  const mergedDeps = {
    ...templatePackage.dependencies,
    ...templatePackage.devDependencies,
  };

  Object.entries(mergedDeps).forEach(([dependency, version]) => {
    dependenciesToInstall.push(`${dependency}@${version}`);
  });

  if (shouldInstallReact) {
    dependenciesToInstall.push('react', 'react-dom');
  }

  return dependenciesToInstall;
}

function installDependencies(appPath, useYarn, dependenciesToInstall) {
  const command = useYarn ? 'yarnpkg' : 'npm';
  const argsBase = useYarn ? ['add'] : ['install', '--no-audit', '--save'];

  if (verbose) {
    argsBase.push('--verbose');
  }

  const args = argsBase.concat(dependenciesToInstall);

  console.log();
  console.log(`Installing template dependencies using ${command}...`);
  const proc = spawn.sync(command, args, { stdio: 'inherit' });

  if (proc.status !== 0) {
    console.error(`\`${command} ${args.join(' ')}\` failed`);
  }
}

function removeTemplatePackage(appPath, useYarn, templateName) {
  const removeCmd = useYarn ? 'remove' : 'uninstall';
  const command = useYarn ? 'yarnpkg' : 'npm';

  console.log(`Removing template package using ${command}...`);
  console.log();
  const proc = spawn.sync(command, [removeCmd, templateName], {
    stdio: 'inherit',
  });

  if (proc.status !== 0) {
    console.error(`\`${command} ${removeCmd} ${templateName}\` failed`);
  }
}

function showSuccessMessage(
  appPath,
  appName,
  originalDirectory,
  useYarn,
  readmeExists
) {
  let cdpath;
  if (
    originalDirectory &&
    path.join(originalDirectory, appName) === appPath
  ) {
    cdpath = appName;
  } else {
    cdpath = appPath;
  }

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
}