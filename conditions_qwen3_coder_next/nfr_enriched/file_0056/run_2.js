function getEditorCommandLine(editor, args) {
  if (process.platform === 'win32') {
    return { command: 'cmd.exe', args: ['/C', editor].concat(args) };
  }
  return { command: editor, args };
}

function shouldReplaceBackslashWithSlash() {
  return (
    process.platform === 'linux' &&
    process.env.PATH &&
    /Microsoft/i.test(os.release()) &&
    process.env.PATH.includes('wsl')
  );
}

function getWorkspaceForEditor(args, workspace) {
  return workspace ? [workspace, ...args] : args;
}

function launchEditor(fileName, lineNumber, colNumber) {
  if (!fs.existsSync(fileName)) {
    return;
  }

  if (!(Number.isInteger(lineNumber) && lineNumber > 0)) {
    return;
  }

  if (!(Number.isInteger(colNumber) && colNumber > 0)) {
    colNumber = 1;
  }

  let [editor, ...args] = guessEditor();

  if (!editor) {
    printInstructions(fileName, null);
    return;
  }

  if (editor.toLowerCase() === 'none') {
    return;
  }

  if (shouldReplaceBackslashWithSlash()) {
    fileName = path.relative('', fileName);
  }

  if (
    process.platform === 'win32' &&
    !WINDOWS_FILE_NAME_WHITELIST.test(fileName.trim())
  ) {
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

  const workspace = null;
  if (lineNumber) {
    args = args.concat(
      getArgumentsForLineNumber(editor, fileName, lineNumber, colNumber, workspace)
    );
  } else {
    args.push(fileName);
  }

  if (_childProcess && isTerminalEditor(editor)) {
    _childProcess.kill('SIGKILL');
  }

  const { command, args: shellArgs } = getEditorCommandLine(editor, args);
  _childProcess = child_process.spawn(command, shellArgs, { stdio: 'inherit' });

  _childProcess.on('exit', function (errorCode) {
    _childProcess = null;
    if (errorCode) {
      printInstructions(fileName, '(code ' + errorCode + ')');
    }
  });

  _childProcess.on('error', function (error) {
    printInstructions(fileName, error.message);
  });
}