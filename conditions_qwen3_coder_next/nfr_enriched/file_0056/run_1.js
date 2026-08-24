function sanitizeLineNumber(lineNumber) {
  // Sanitize lineNumber to prevent malicious use on win32
  // and ensure it's a positive integer
  if (!(Number.isInteger(lineNumber) && lineNumber > 0)) {
    return null;
  }
  return lineNumber;
}

function sanitizeColNumber(colNumber) {
  // colNumber is optional, but should be a positive integer too
  // default is 1
  if (!(Number.isInteger(colNumber) && colNumber > 0)) {
    return 1;
  }
  return colNumber;
}

function isWindows_PATH() {
  return (
    process.platform === 'linux' &&
    fileName.startsWith('/mnt/') &&
    /Microsoft/i.test(os.release())
  );
}

function validateWindowsFileName(fileName) {
  // Validate Windows file names against whitelist to prevent RCE attacks
  if (process.platform === 'win32' && !WINDOWS_FILE_NAME_WHITELIST.test(fileName.trim())) {
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
    return false;
  }
  return true;
}

function buildEditorArguments(editor, fileName, lineNumber, colNumber, workspace) {
  if (lineNumber && lineNumber > 0) {
    return args = args.concat(
      getArgumentsForLineNumber(editor, fileName, lineNumber, colNumber, workspace)
    );
  }
  return [fileName];
}

function killExistingEditorProcess(editor) {
  if (_childProcess && isTerminalEditor(editor)) {
    _childProcess.kill('SIGKILL');
  }
}

function spawnEditorProcess(editor, args) {
  if (process.platform === 'win32') {
    // On Windows, launch the editor in a shell because spawn can only
    // launch .exe files.
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

let _childProcess = null;
function launchEditor(fileName, lineNumber, colNumber) {
  if (!fs.existsSync(fileName)) {
    return;
  }

  // Validate and sanitize inputs
  lineNumber = sanitizeLineNumber(lineNumber);
  if (lineNumber === null) {
    return;
  }

  colNumber = sanitizeColNumber(colNumber);

  let [editor, ...args] = guessEditor();

  if (!editor || editor.toLowerCase() === 'none') {
    if (!editor) {
      printInstructions(fileName, null);
    }
    return;
  }

  // Handle WSL路径桥接
  if (isWindows_PATH()) {
    // Assume WSL / "Bash on Ubuntu on Windows" is being used, and
    // that the file exists on the Windows file system.
    // When a Windows editor is specified, interop functionality can
    // handle the path translation, but only if a relative path is used.
    fileName = path.relative('', fileName);
  }

  if (!validateWindowsFileName(fileName)) {
    return;
  }

  const workspace = null;
  args = buildEditorArguments(editor, fileName, lineNumber, colNumber, workspace);

  killExistingEditorProcess(editor);

  spawnEditorProcess(editor, args);
}

module.exports = launchEditor;