function getWorkspaceArgs(args, workspace) {
  if (workspace) {
    args.unshift(workspace);
  }
  return args;
}

function buildArgsForEditor(editor, fileName, lineNumber, colNumber, workspace) {
  const editorBasename = path.basename(editor).replace(/\.(exe|cmd|bat)$/i, '');
  switch (editorBasename) {
    case 'atom':
    case 'Atom':
    case 'Atom Beta':
    case 'subl':
    case 'sublime':
    case 'sublime_text':
      return [fileName + ':' + lineNumber + ':' + colNumber];
    case 'wstorm':
    case 'charm':
      return [fileName + ':' + lineNumber];
    case 'notepad++':
      return ['-n' + lineNumber, '-c' + colNumber, fileName];
    case 'vim':
    case 'mvim':
    case 'joe':
    case 'gvim':
      return ['+' + lineNumber, fileName];
    case 'emacs':
    case 'emacsclient':
      return ['+' + lineNumber + ':' + colNumber, fileName];
    case 'rmate':
    case 'mate':
    case 'mine':
      return ['--line', lineNumber, fileName];
    case 'code':
    case 'Code':
    case 'code-insiders':
    case 'Code - Insiders':
    case 'vscodium':
    case 'VSCodium':
      return getWorkspaceArgs(
        ['-g', fileName + ':' + lineNumber + ':' + colNumber],
        workspace
      );
    case 'appcode':
    case 'clion':
    case 'clion64':
    case 'idea':
    case 'idea64':
    case 'phpstorm':
    case 'phpstorm64':
    case 'pycharm':
    case 'pycharm64':
    case 'rubymine':
    case 'rubymine64':
    case 'webstorm':
    case 'webstorm64':
    case 'goland':
    case 'goland64':
    case 'rider':
    case 'rider64':
      return getWorkspaceArgs(
        ['--line', lineNumber, fileName],
        workspace
      );
  }
  return [fileName];
}

function isValidFilePath(filePath) {
  return (
    process.platform !== 'win32' ||
    (typeof filePath === 'string' && WINDOWS_FILE_NAME_WHITELIST.test(filePath.trim()))
  );
}

function normalizeWindowsPath(filePath) {
  if (
    process.platform === 'linux' &&
    filePath.startsWith('/mnt/') &&
    /Microsoft/i.test(os.release())
  ) {
    return path.relative('', filePath);
  }
  return filePath;
}

function shouldSkipLaunch(editor) {
  return !editor || editor.toLowerCase() === 'none';
}

function launchEditorWithArgs(editor, args, fileName) {
  if (_childProcess && isTerminalEditor(editor)) {
    _childProcess.kill('SIGKILL');
  }

  const spawnOptions = { stdio: 'inherit' };

  if (process.platform === 'win32') {
    _childProcess = child_process.spawn(
      'cmd.exe',
      ['/C', editor].concat(args),
      spawnOptions
    );
  } else {
    _childProcess = child_process.spawn(editor, args, spawnOptions);
  }

  _childProcess.on('exit', (errorCode) => {
    _childProcess = null;
    if (errorCode) {
      printInstructions(fileName, '(code ' + errorCode + ')');
    }
  });

  _childProcess.on('error', (error) => {
    _childProcess = null;
    printInstructions(fileName, error.message);
  });
}

function launchEditor(fileName, lineNumber, colNumber) {
  if (!fs.existsSync(fileName)) {
    return;
  }

  if (!(Number.isInteger(lineNumber) && lineNumber > 0)) {
    return;
  }

  colNumber = Number.isInteger(colNumber) && colNumber > 0 ? colNumber : 1;

  let [editor, ...args] = guessEditor();

  if (shouldSkipLaunch(editor)) {
    editor ? printInstructions(fileName, null) : null;
    return;
  }

  const safePath = normalizeWindowsPath(fileName);
  if (!isValidFilePath(safePath)) {
    console.log();
    console.log(
      chalk.red('Could not open ' + path.basename(fileName) + ' in the editor.')
    );
    console.log();
    console.log(
      'When running on Windows, file names are checked against a whitelist ' +
        'to protect against remote code execution attacks. File names may ' +
        'consist only of alphanumeric characters (all languages), periods, ' +
        'dashes, slashes, and underscores.'
    );
    console.log();
    return;
  }

  const lineArgs = lineNumber
    ? buildArgsForEditor(editor, safePath, lineNumber, colNumber, null)
    : [safePath];
  launchEditorWithArgs(editor, args.concat(lineArgs), fileName);
}