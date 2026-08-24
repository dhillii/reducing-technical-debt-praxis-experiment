function initProject(
  appPath,
  appName,
  verbose,
  originalDirectory,
  templateName
) {
  const appPackage = require(path.join(appPath, 'package.json'));
  const useYarn = fs.existsSync(path.join(appPath, 'yarn.lock'));

  if (!templateName) {
    printNoTemplateError();
    return;
  }

  const templatePath = path.dirname(
    require.resolve(`${templateName}/package.json`, { paths: [appPath] })
  );
  const templateJsonPath = path.join(templatePath, 'template.json');
  const templateJson = fs.existsSync(templateJsonPath)
    ? require(templateJsonPath)
    : {};
  const templatePackage = templateJson.package || {};

  if (templateJson.dependencies || templateJson.scripts) {
    printDeprecatedTemplateWarning();
    return;
  }

  applyPackageChanges(appPackage, templatePackage, useYarn);
  fs.writeFileSync(
    path.join(appPath, 'package.json'),
    JSON.stringify(appPackage, null, 2) + os.EOL
  );

  handleReadme(appPath);
  copyTemplateFiles(appPath, templatePath);

  if (useYarn) {
    updateReadmeWithYarn(appPath);
  }

  handleGitignore(appPath);

  const initializedGit = tryGitInit();
  if (initializedGit) {
    console.log('\nInitialized a git repository.');
  }

  const { command, remove, args } = setupCommand(useYarn, verbose);

  installDependencies(appPath, command, remove, args, appPackage, templatePackage, templateName);

  if (shouldVerifyTypeScript(args)) {
    verifyTypeScriptSetup();
  }

  removeTemplatePackage(command, remove, templateName);

  if (initializedGit && tryGitCommit(appPath)) {
    console.log('\nCreated git commit.');
  }

  showSuccessMessage(appName, appPath, originalDirectory, useYarn, fs.existsSync(path.join(appPath, 'README.md')));
}

function printNoTemplateError() {
  console.log('\n' +
    chalk.red('A template was not provided.') + '\n' +
    'This is likely because you\'re using an outdated version of ' + chalk.cyan('create-react-app') + '.\n' +
    'Please note that global installs of ' + chalk.cyan('create-react-app') + ' are no longer supported.\n' +
    'You can fix this by running ' + chalk.cyan('npm uninstall -g create-react-app') + ' or ' +
    chalk.cyan('yarn global remove create-react-app') + ' before using ' + chalk.cyan('create-react-app') + ' again.'
  );
}

function printDeprecatedTemplateWarning() {
  console.log('\n' +
    chalk.red(
      'Root-level `dependencies` and `scripts` keys in `template.json` were deprecated for Create React App 5.\n' +
      'This template needs to be updated to use the new `package` key.'
    ) +
    '\nFor more information, visit https://cra.link/templates'
  );
}

function applyPackageChanges(appPackage, templatePackage, useYarn) {
  appPackage.dependencies = appPackage.dependencies || {};
  appPackage.scripts = Object.assign(
    { start: 'react-scripts start', build: 'react-scripts build', test: 'react-scripts test', eject: 'react-scripts eject' },
    templatePackage.scripts || {}
  );

  if (useYarn) {
    updateScriptsForYarn(appPackage);
  }

  appPackage.eslintConfig = { extends: 'react-app' };
  appPackage.browserslist = defaultBrowsers;

  const keysToReplace = Object.keys(templatePackage).filter(
    key => !['name', 'version', 'description', 'keywords', 'bugs', 'license', 'author', 'contributors',
      'files', 'browser', 'bin', 'man', 'directories', 'repository', 'peerDependencies',
      'bundledDependencies', 'optionalDependencies', 'engineStrict', 'os', 'cpu',
      'preferGlobal', 'private', 'publishConfig', 'dependencies', 'scripts'].includes(key)
  );

  keysToReplace.forEach(key => { appPackage[key] = templatePackage[key]; });
}

function updateScriptsForYarn(appPackage) {
  appPackage.scripts = Object.entries(appPackage.scripts).reduce((acc, [key, value]) => ({
    ...acc,
    [key]: value.replace(/(npm run |npm )/, 'yarn ')
  }), {});
}

function handleReadme(appPath) {
  if (fs.existsSync(path.join(appPath, 'README.md'))) {
    fs.renameSync(
      path.join(appPath, 'README.md'),
      path.join(appPath, 'README.old.md')
    );
  }
}

function copyTemplateFiles(appPath, templatePath) {
  const templateDir = path.join(templatePath, 'template');
  if (!fs.existsSync(templateDir)) {
    console.error(`\nCould not locate supplied template: ${chalk.green(templateDir)}\n`);
    return;
  }
  fs.copySync(templateDir, appPath);
}

function updateReadmeWithYarn(appPath) {
  try {
    const readme = fs.readFileSync(path.join(appPath, 'README.md'), 'utf8');
    fs.writeFileSync(
      path.join(appPath, 'README.md'),
      readme.replace(/(npm run |npm )/g, 'yarn '),
      'utf8'
    );
  } catch (err) {
    // Silencing the error. Falls back to default npm commands.
  }
}

function handleGitignore(appPath) {
  const gitignorePath = path.join(appPath, '.gitignore');
  if (fs.existsSync(path.join(appPath, 'gitignore'))) {
    const data = fs.readFileSync(path.join(appPath, 'gitignore'));
    fs.appendFileSync(gitignorePath, data);
    fs.unlinkSync(path.join(appPath, 'gitignore'));
  } else if (fs.existsSync(gitignorePath)) {
    fs.moveSync(gitignorePath, path.join(appPath, '.gitignore'));
  }
}

function setupCommand(useYarn, verbose) {
  if (useYarn) {
    return { command: 'yarnpkg', remove: 'remove', args: ['add'] };
  } else {
    return {
      command: 'npm',
      remove: 'uninstall',
      args: ['install', '--no-audit', '--save', verbose && '--verbose'].filter(Boolean)
    };
  }
}

function installDependencies(appPath, command, remove, args, appPackage, templatePackage, templateName) {
  const templateDeps = { ...templatePackage.dependencies, ...templatePackage.devDependencies };
  const depsToInstall = Object.entries(templateDeps).map(([dep, version]) => `${dep}@${version}`);

  const baseArgs = [...args];
  if (depsToInstall.length) {
    baseArgs.push(...depsToInstall);
  }

  if (!isReactInstalled(appPackage)) {
    baseArgs.push('react', 'react-dom');
  }

  if (baseArgs.length > 1) {
    console.log(`\nInstalling template dependencies using ${command}...`);
    const proc = spawn.sync(command, baseArgs, { stdio: 'inherit' });
    if (proc.status !== 0) {
      console.error(`\`${command} ${baseArgs.join(' ')}\` failed`);
      return;
    }
  }
}

function shouldVerifyTypeScript(args) {
  return args.some(arg => arg.includes('typescript'));
}

function removeTemplatePackage(command, remove, templateName) {
  console.log(`\nRemoving template package using ${command}...\n`);
  const proc = spawn.sync(command, [remove, templateName], { stdio: 'inherit' });
  if (proc.status !== 0) {
    console.error(`\`${command} ${[remove, templateName].join(' ')}\` failed`);
  }
}

function showSuccessMessage(appName, appPath, originalDirectory, useYarn, readmeExisted) {
  let cdpath;
  if (originalDirectory && path.join(originalDirectory, appName) === appPath) {
    cdpath = appName;
  } else {
    cdpath = appPath;
  }

  const displayedCommand = useYarn ? 'yarn' : 'npm';
  console.log(`\nSuccess! Created ${appName} at ${appPath}`);
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
  if (readmeExisted) {
    console.log();
    console.log(
      chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`')
    );
  }
  console.log();
  console.log('Happy hacking!');
}

function isReactInstalled(appPackage) {
  const deps = appPackage.dependencies || {};
  return typeof deps.react !== 'undefined' && typeof deps['react-dom'] !== 'undefined';
}

module.exports = initProject;