function getArgumentsForLineNumber(
  editor,
  fileName,
  lineNumber,
  colNumber,
  workspace
) {
  const editorBasename = path.basename(editor).replace(/\.(exe|cmd|bat)$/i, '');
  const commonArgs = [fileName + ':' + lineNumber + ':' + colNumber];
  const lineArgs = [fileName + ':' + lineNumber];
  const notepadArgs = ['-n' + lineNumber, '-c' + colNumber, fileName];
  const vimArgs = ['+' + lineNumber, fileName];
  const emacsArgs = ['+' + lineNumber + ':' + colNumber, fileName];
  const mateArgs = ['--line', lineNumber, fileName];
  const codeArgs = addWorkspaceToArgumentsIfExists(
    ['-g', fileName + ':' + lineNumber + ':' + colNumber],
    workspace
  );
  const ideArgs = addWorkspaceToArgumentsIfExists(
    ['--line', lineNumber, fileName],
    workspace
  );

  switch (editorBasename) {
    case 'atom':
    case 'Atom':
    case 'Atom Beta':
    case 'subl':
    case 'sublime':
    case 'sublime_text':
      return commonArgs;
    case 'wstorm':
    case 'charm':
      return lineArgs;
    case 'notepad++':
      return notepadArgs;
    case 'vim':
    case 'mvim':
    case 'joe':
    case 'gvim':
      return vimArgs;
    case 'emacs':
    case 'emacsclient':
      return emacsArgs;
    case 'rmate':
    case 'mate':
    case 'mine':
      return mateArgs;
    case 'code':
    case 'Code':
    case 'code-insiders':
    case 'Code - Insiders':
    case 'vscodium':
    case 'VSCodium':
      return codeArgs;
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
      return ideArgs;
  }

  return [fileName];
}