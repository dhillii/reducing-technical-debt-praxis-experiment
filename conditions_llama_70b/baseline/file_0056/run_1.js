let _childProcess = null;

function validateFileExists(fileName) {
  if (!fs.existsSync(fileName)) {
    return false;
  }
  return true;
}

function validateLineNumber(lineNumber) {
  if (!(Number.isInteger(lineNumber) && lineNumber > 0)) {
    return false;
  }
  return true;
}

function validateColNumber(colNumber) {
  if (!(Number.isInteger(colNumber) && colNumber > 0)) {
    return 1;
  }
  return colNumber;
}

function getEditor() {
  return guessEditor();
}

function getEditorArguments(editor, fileName, lineNumber, colNumber, workspace) {
  return getArgumentsForLineNumber(editor, fileName, lineNumber, colNumber, workspace);
}

function launchEditor(fileName, lineNumber, colNumber) {
  if (!validateFileExists(fileName)) {
    return;
  }

  lineNumber = validateLineNumber(lineNumber);
  colNumber = validateColNumber(colNumber);

  const [editor, ...args] = getEditor();

  if (!editor) {
    printInstructions(fileName, null);
    return;
  }

  if (editor.toLowerCase() === 'none') {
    return;
  }

  if (
    process.platform === 'linux' &&
    fileName.startsWith('/mnt/') &&
    /Microsoft/i.test(os.release())
  ) {
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

  let workspace = null;
  if (lineNumber) {
    args.push(...getEditorArguments(editor, fileName, lineNumber, colNumber, workspace));
  } else {
    args.push(fileName);
  }

  if (_childProcess && isTerminalEditor(editor)) {
    _childProcess.kill('SIGKILL');
  }

  if (process.platform === 'win32') {
    _childProcess = child_process.spawn(
      'cmd.exe',
      ['/C', editor].concat(args),
      { stdio: 'inherit' }
    );
  } else {
    _childProcess = child_process.spawn(editor, args, { stdio: 'inherit' });
  }
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

module.exports = launchEditor;