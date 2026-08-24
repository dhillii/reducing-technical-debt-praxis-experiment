const shouldConfirmCloseModalWithFiles = (hasFilesToUpload, formatMessage) => {
  if (!hasFilesToUpload) {
    return true;
  }

  // eslint-disable-next-line no-alert
  const confirmed = globalThis.confirm(
    formatMessage({ id: getTrad('window.confirm.close-modal.files') })
  );

  return confirmed;
};

const shouldConfirmCloseModalWithUnsavedChanges = (formatMessage) => {
  // eslint-disable-next-line no-alert
  const confirmed = globalThis.confirm(
    formatMessage({ id: getTrad('window.confirm.close-modal.file') })
  );

  return confirmed;
};

const extractErrorMessage = (err) => {
  const status = get(err, 'response.status', get(err, 'status', null));
  const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
  const messagePath = ['response', 'payload', 'message', '0', 'messages', '0', 'message'];

  return get(err, messagePath, get(err, ['response', 'payload', 'message'], statusText));
};

const showNotificationForError = (errorMessage) => {
  strapi.notification.toggle({
    type: 'warning',
    message: errorMessage,
  });
};

const handleDeleteFileRequest = async (id, handleFileSelection, goToList) => {
  try {
    const requestURL = getRequestUrl(`files/${id}`);

    await request(requestURL, { method: 'DELETE' });

    handleFileSelection({ target: { name: id } });
    goToList();
  } catch (err) {
    const errorMessage = extractErrorMessage(err);

    showNotificationForError(errorMessage);

    throw err;
  }
};

const buildFormDataForEdit = (file, fileInfo, didCropFile) => {
  const formData = new FormData();

  if (didCropFile) {
    formData.append('files', file);
  }

  formData.append('fileInfo', JSON.stringify(fileInfo));

  return formData;
};

const submitEditExistingFileRequest = async (
  formData,
  abortController,
  pluginId,
  fileId,
  shouldDuplicateMedia
) => {
  const headers = {};
  const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${fileId}`;

  const editedFile = await request(
    requestURL,
    {
      method: 'POST',
      headers,
      body: formData,
      signal: abortController.signal,
    },
    false,
    false
  );

  return editedFile;
};

const shouldDisplayNextButton = (currentStep, displayNextButton) => {
  return currentStep === 'browse' && displayNextButton;
};

const isFinishButtonDisabled = (filesToUpload) => {
  return filesToUpload.some(file => file.isDownloading || file.isUploading);
};

const areButtonsDisabledOnEditExistingFile = (currentStep, fileToEdit) => {
  return currentStep === 'edit' && fileToEdit?.isUploading === true;
};

const isUnsavedMediaChange = (currentStep, selectedFiles, initialSelectedFiles, fileToEdit, initialFileToEdit) => {
  if (currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles)) {
    return true;
  }

  if (currentStep === 'edit') {
    if (initialFileToEdit && !isEqual(fileToEdit, initialFileToEdit)) {
      return true;
    }

    if (selectedFiles.length > 0) {
      return true;
    }
  }

  return false;
};

if (elementName === 'backButton' && backButtonDestination && currentStep === 'upload') {
  if (!shouldConfirmCloseModalWithFiles(!isEmpty(filesToUpload), formatMessage)) {
    return;
  }

  goTo(backButtonDestination);
  handleClearFilesToUploadAndDownload();

  return;
}

if (
  elementName === 'backButton' &&
  backButtonDestination &&
  currentStep === 'browse' &&
  !isEmpty(filesToUpload)
) {
  goTo(backButtonDestination);

  return;
}

if (!shouldConfirmCloseModalWithFiles(filesToUploadLength > 0, formatMessage)) {
  return;
}

if (
  isUnsavedMediaChange(
    currentStep,
    selectedFiles,
    initialSelectedFiles,
    fileToEdit,
    initialFileToEdit
  ) &&
  !shouldConfirmCloseModalWithUnsavedChanges(formatMessage)
) {
  return;
}

const errorMessage = extractErrorMessage(err);

if (status === 413) {
  errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
} else {
  showNotificationForError(errorMessage);
}

const formData = buildFormDataForEdit(file, fileInfo, didCropFile);

const editedFile = await submitEditExistingFileRequest(
  formData,
  abortController,
  pluginId,
  id,
  shouldDuplicateMedia
);

const shouldDisplayNext = shouldDisplayNextButton(currentStep, displayNextButton);
const isFinishBtnDisabled = isFinishButtonDisabled(filesToUpload);
const areButtonsDisabled = areButtonsDisabledOnEditExistingFile(currentStep, fileToEdit);