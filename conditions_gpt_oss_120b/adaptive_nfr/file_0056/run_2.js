/**
 * @param {string} fileName
 * @returns {boolean}
 */
function fileExists(fileName) {
  return fs.existsSync(fileName);
}

/**
 * @param {any} lineNumber
 * @returns {boolean}
 */
function isValidLineNumber(lineNumber) {
  return Number.isInteger(lineNumber) && lineNumber > 0;
}

/**
 * @param {any} colNumber
 * @returns {number}
 */
function normalizeColNumber(colNumber) {
  return Number.isInteger(colNumber) && colNumber > 0 ? colNumber : 1;
}

/**
 * Adjust file path for WSL environments.
 * @param {string} fileName
 * @returns {string}
 */
function adjustPathForWSL(fileName) {
  if (
    process.platform === 'linux' &&
    fileName.startsWith('/mnt/') &&
    /Microsoft/i.test(os.release())
  ) {
    return path.relative('', fileName);
  }
  return fileName;
}

/**
 * Validate Windows file name against whitelist.
 * @param {string} fileName
 * @returns {boolean}
 */
function isValidWindowsFileName(fileName) {
  return (
    process.platform !== 'win32' ||
    WINDOWS_FILE_NAME_WHITELIST.test(fileName.trim())
  );
}

/**
 * Print warning for invalid Windows file name.
 * @param {string} fileName
 */
function warnInvalidWindowsFileName(fileName) {
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
}

/**
 * Build argument list for the editor.
 * @param {string} editor
 * @param {string} fileName
 * @param {number} lineNumber
 * @param {number} colNumber
 * @param {string|null} workspace
 * @returns {string[]}
 */
function buildEditorArgs(editor, fileName, lineNumber, colNumber, workspace) {
  const args = [];
  if (lineNumber) {
    args.push(
      ...getArgumentsForLineNumber(
        editor,
        fileName,
        lineNumber,
        colNumber,
        workspace
      )
    );
  } else {
    args.push(fileName);
  }
  return args;
}

/**
 * Kill existing terminal editor process if needed.
 * @param {string} editor
 */
function maybeKillExistingTerminalEditor(editor) {
  if (_childProcess && isTerminalEditor(editor)) {
    _childProcess.kill('SIGKILL');
  }
}

/**
 * Spawn the editor process.
 * @param {string} editor
 * @param {string[]} args
 */
function spawnEditor(editor, args) {
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

/**
 * Strategy functions for editor argument generation.
 */
const lineColStrategy = (file, line, col) => [file + ':' + line + ':' + col];
const lineStrategy = (file, line) => [file + ':' + line];
const notepadStrategy = (file, line, col) => ['-n' + line, '-c' + col, file];
const vimStrategy = (file, line) => ['+' + line, file];
const emacsStrategy = (file, line, col) => ['+' + line + ':' + col, file];
const rmateStrategy = (file, line) => ['--line', line, file];
const workspaceAdd = (args, workspace) =>
  workspace ? [workspace, ...args] : args;

/**
 * Mapping of editor basenames to argument generators.
 */
const ARG_STRATEGIES = {
  atom: (e, f, l, c, w) => lineColStrategy(f, l, c),
  Atom: (e, f, l, c, w) => lineColStrategy(f, l, c),
  'Atom Beta': (e, f, l, c, w) => lineColStrategy(f, l, c),
  subl: (e, f, l, c, w) => lineColStrategy(f, l, c),
  sublime: (e, f, l, c, w) => lineColStrategy(f, l, c),
  sublime_text: (e, f, l, c, w) => lineColStrategy(f, l, c),
  wstorm: (e, f, l, c, w) => lineStrategy(f, l),
  charm: (e, f, l, c, w) => lineStrategy(f, l),
  'notepad++': (e, f, l, c, w) => notepadStrategy(f, l, c),
  vim: (e, f, l, c, w) => vimStrategy(f, l),
  mvim: (e, f, l, c, w) => vimStrategy(f, l),
  joe: (e, f, l, c, w) => vimStrategy(f, l),
  gvim: (e, f, l, c, w) => vimStrategy(f, l),
  emacs: (e, f, l, c, w) => emacsStrategy(f, l, c),
  emacsclient: (e, f, l, c, w) => emacsStrategy(f, l, c),
  rmate: (e, f, l, c, w) => rmateStrategy(f, l),
  mate: (e, f, l, c, w) => rmateStrategy(f, l),
  mine: (e, f, l, c, w) => rmateStrategy(f, l),
  code: (e, f, l, c, w) =>
    workspaceAdd(['-g', f + ':' + l + ':' + c], w),
  Code: (e, f, l, c, w) =>
    workspaceAdd(['-g', f + ':' + l + ':' + c], w),
  'code-insiders': (e, f, l, c, w) =>
    workspaceAdd(['-g', f + ':' + l + ':' + c], w),
  'Code - Insiders': (e, f, l, c, w) =>
    workspaceAdd(['-g', f + ':' + l + ':' + c], w),
  vscodium: (e, f, l, c, w) =>
    workspaceAdd(['-g', f + ':' + l + ':' + c], w),
  VSCodium: (e, f, l, c, w) =>
    workspaceAdd(['-g', f + ':' + l + ':' + c], w),
  appcode: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  clion: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  clion64: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  idea: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  idea64: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  phpstorm: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  phpstorm64: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  pycharm: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  pycharm64: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  rubymine: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  rubymine64: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  webstorm: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  webstorm64: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  goland: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  goland64: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  rider: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
  rider64: (e, f, l, c, w) =>
    workspaceAdd(['--line', l, f], w),
};

/**
 * Get arguments for a given editor.
 * @param {string} editor
 * @param {string} fileName
 * @param {number} lineNumber
 * @param {number} colNumber
 * @param {string|null} workspace
 * @returns {string[]}
 */
function getArgumentsForLineNumber(
  editor,
  fileName,
  lineNumber,
  colNumber,
  workspace
) {
  const editorBasename = path
    .basename(editor)
    .replace(/\.(exe|cmd|bat)$/i, '');
  const strategy = ARG_STRATEGIES[editorBasename];
  if (strategy) {
    return strategy(editor, fileName, lineNumber, colNumber, workspace);
  }
  // Fallback: ignore line/col information
  return [fileName];
}

/**
 * Launch the editor for a given file/position.
 * @param {string} fileName
 * @param {number} lineNumber
 * @param {number} colNumber
 */
function launchEditor(fileName, lineNumber, colNumber) {
  if (!fileExists(fileName)) {
    return;
  }

  if (!isValidLineNumber(lineNumber)) {
    return;
  }

  colNumber = normalizeColNumber(colNumber);

  let [editor, ...initialArgs] = guessEditor();

  if (!editor) {
    printInstructions(fileName, null);
    return;
  }

  if (editor.toLowerCase() === 'none') {
    return;
  }

  fileName = adjustPathForWSL(fileName);

  if (!isValidWindowsFileName(fileName)) {
    warnInvalidWindowsFileName(fileName);
    return;
  }

  const workspace = null;
  const args = buildEditorArgs(
    editor,
    fileName,
    lineNumber,
    colNumber,
    workspace
  );

  maybeKillExistingTerminalEditor(editor);

  spawnEditor(editor, args);
}

module.exports = launchEditor;