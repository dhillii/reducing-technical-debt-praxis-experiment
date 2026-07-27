/**
 * Checks if a file exists on disk.
 */
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Returns a valid positive integer line number or null.
 */
function normalizeLineNumber(lineNumber) {
  return Number.isInteger(lineNumber) && lineNumber > 0 ? lineNumber : null;
}

/**
 * Returns a valid positive integer column number; defaults to 1.
 */
function normalizeColNumber(colNumber) {
  return Number.isInteger(colNumber) && colNumber > 0 ? colNumber : 1;
}

/**
 * Adjusts a Linux path when running under WSL.
 */
function adjustPathForWSL(filePath) {
  if (
    process.platform === 'linux' &&
    filePath.startsWith('/mnt/') &&
    /Microsoft/i.test(os.release())
  ) {
    return path.relative('', filePath);
  }
  return filePath;
}

/**
 * Validates a Windows file name against a whitelist.
 */
function isValidWindowsFileName(filePath) {
  return WINDOWS_FILE_NAME_WHITELIST.test(filePath.trim());
}

/**
 * Builds the argument list for the chosen editor.
 */
function buildEditorArguments(editor, filePath, lineNumber, colNumber, workspace) {
  if (lineNumber) {
    return getArgumentsForLineNumber(
      editor,
      filePath,
      lineNumber,
      colNumber,
      workspace
    );
  }
  return [filePath];
}

/**
 * Spawns the editor process with appropriate options per platform.
 */
function spawnEditor(editor, args) {
  if (process.platform === 'win32') {
    return child_process.spawn('cmd.exe', ['/C', editor].concat(args), {
      stdio: 'inherit',
    });
  }
  return child_process.spawn(editor, args, { stdio: 'inherit' });
}

/**
 * Attaches exit and error handlers to the child process.
 */
function attachProcessHandlers(child, filePath) {
  child.on('exit', function (errorCode) {
    _childProcess = null;
    if (errorCode) {
      printInstructions(filePath, '(code ' + errorCode + ')');
    }
  });
  child.on('error', function (error) {
    printInstructions(filePath, error.message);
  });
}

/**
 * Launches the editor for a given file and location.
 */
function launchEditor(fileName, lineNumber, colNumber) {
  if (!fileExists(fileName)) {
    return;
  }

  const validLine = normalizeLineNumber(lineNumber);
  if (!validLine) {
    return;
  }

  const validCol = normalizeColNumber(colNumber);

  let [editor, ...initialArgs] = guessEditor();

  if (!editor) {
    printInstructions(fileName, null);
    return;
  }

  if (editor.toLowerCase() === 'none') {
    return;
  }

  fileName = adjustPathForWSL(fileName);

  if (process.platform === 'win32' && !isValidWindowsFileName(fileName)) {
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
  const editorArgs = buildEditorArguments(
    editor,
    fileName,
    validLine,
    validCol,
    workspace
  );
  const finalArgs = initialArgs.concat(editorArgs);

  if (_childProcess && isTerminalEditor(editor)) {
    _childProcess.kill('SIGKILL');
  }

  _childProcess = spawnEditor(editor, finalArgs);
  attachProcessHandlers(_childProcess, fileName);
}

module.exports = launchEditor