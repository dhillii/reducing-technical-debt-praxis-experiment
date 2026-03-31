```javascript
import React, { useEffect, useState, useRef, memo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Modal, ModalFooter, PopUpWarning, useGlobalContext, request } from 'strapi-helper-plugin';
import { Button } from '@buffetjs/core';
import { get, isEmpty, isEqual } from 'lodash';
import { getRequestUrl, getTrad } from '../../utils';
import ModalHeader from '../../components/ModalHeader';
import pluginId from '../../pluginId';
import stepper from './stepper';
import useModalContext from '../../hooks/useModalContext';

// Constants
const CONFIRM_CLOSE_WITH_FILES_ID = getTrad('window.confirm.close-modal.files');
const CONFIRM_CLOSE_WITH_FILE_ID = getTrad('window.confirm.close-modal.file');
const FILE_TOO_BIG_STATUS = 413;
const FILE_TOO_BIG_ERROR_ID = 'app.utils.errors.file-too-big.message';

// Error handling utility
const extractErrorMessage = (err, formatMessage) => {
  const status = get(err, 'response.status', get(err, 'status', null));
  const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
  
  if (status === FILE_TOO_BIG_STATUS) {
    return formatMessage({ id: FILE_TOO_BIG_ERROR_ID });
  }

  return get(
    err,
    ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
    get(err, ['response', 'payload', 'message'], statusText)
  );
};

// Confirmation dialog utility
const showConfirmDialog = (formatMessage, messageId) => {
  return window.confirm(formatMessage({ id: messageId }));
};

// File deletion handler
const deleteFileRequest = async (fileId, handleSetFileToEditError, formatMessage) => {
  try {
    const requestURL = getRequestUrl(`files/${fileId}`);
    await request(requestURL, { method: 'DELETE' });
    return { success: true };
  } catch (err) {
    console.error(err);
    const errorMessage = extractErrorMessage(err, formatMessage);
    const status = get(err, 'response.status', get(err, 'status', null));

    strapi.notification.toggle({
      type: 'warning',
      message: errorMessage,
    });

    if (status) {
      handleSetFileToEditError(errorMessage);
    }

    return { success: false };
  }
};

// File edit submission handler
const submitFileEditRequest = async (
  fileToEdit,
  shouldDuplicateMedia,
  file,
  handleSetFileToEditError,
  formatMessage
) => {
  const formData = new FormData();
  const didCropFile = file instanceof File;
  const { abortController, id, fileInfo } = fileToEdit;
  const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;

  if (didCropFile) {
    formData.append('files', file);
  }

  formData.append('fileInfo', JSON.stringify(fileInfo));

  try {
    const editedFile = await request(
      requestURL,
      {
        method: 'POST',
        headers: {},
        body: formData,
        signal: abortController.signal,
      },
      false,
      false
    );

    return { success: true, data: editedFile };
  } catch (err) {
    const errorMessage = extractErrorMessage(err, formatMessage);
    const status = get(err, 'response.status', get(err, 'status', null));

    if (status) {
      handleSetFileToEditError(errorMessage);
    }

    return { success: false };
  }
};

const InputModalStepper = ({
  allowedActions,
  isOpen,
  onToggle,
  noNavigation,
  onInputMediaChange,
}) => {
  const { emitEvent, formatMessage } = useGlobalContext();
  const [shouldDeleteFile, setShouldDeleteFile] = useState(false);
  const [displayNextButton, setDisplayNextButton] = useState(false);
  const {
    addFilesToUpload,
    currentStep,
    downloadFiles,
    fetchMediaLib,
    filesToDownload,
    filesToUpload,
    fileToEdit,
    formErrors,
    goTo,
    handleAbortUpload,
    handleCancelFileToUpload,
    handleCleanFilesError,
    handleClearFilesToUploadAndDownload,
    handleClickNextButton,
    handleClose,
    handleEditExistingFile,
    handleFileSelection,
    handleFileToEditChange,
    handleFormDisabled,
    handleGoToEditNewFile,
    handleRemoveFileToUpload,
    handleResetFileToEdit,
    handleSetCropResult,
    handleSetFileToEditError,
    handleUploadFiles,
    initialFileToEdit,
    initialSelectedFiles,
    isFormDisabled,
    isWarningDeleteOpen,
    multiple,
    selectedFiles,
    submitEditNewFile,
    submitEditExistingFile,
    toggleModalWarning,
  } = useModalContext();

  const {
    backButtonDestination,
    Component,
    components,
    headerBreadcrumbs,
    next,
    prev,
    withBackButton,
    HeaderComponent,
  } = stepper[currentStep];

  const filesToUploadLength = filesToUpload.length;
  const editModalRef = useRef();

  // Navigation handlers
  const goToList = useCallback(() => {
    fetchMediaLib();
    goTo('list');
  }, [fetchMediaLib, goTo]);

  const goNext = useCallback(() => {
    if (next === null) {
      onToggle();
      return;
    }
    goTo(next);
  }, [next, onToggle, goTo]);

  const goBack = useCallback((elementName = null) => {
    const hasFilesToUpload = !isEmpty(filesToUpload);

    if (elementName === 'backButton' && backButtonDestination && currentStep === 'upload') {
      if (hasFilesToUpload && !showConfirmDialog(formatMessage, CONFIRM_CLOSE_WITH_FILES_ID)) {
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
      hasFilesToUpload
    ) {
      goTo(backButtonDestination);
      return;
    }

    goTo(prev);
  }, [
    filesToUpload,
    backButtonDestination,
    currentStep,
    formatMessage,
    goTo,
    handleClearFilesToUploadAndDownload,
    prev,
  ]);

  // File upload effect
  useEffect(() => {
    if (currentStep === 'upload') {
      if (filesToUploadLength === 0) {
        goToList();
      } else {
        downloadFiles();
      }
    }
  }, [filesToUploadLength, currentStep, goToList, downloadFiles]);

  // Event handlers
  const handleReplaceMedia = useCallback(() => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current?.click();
  }, [emitEvent]);

  const handleAddFilesToUploadList = useCallback(({ target: { value } }) => {
    addFilesToUpload({ target: { value } });
    goNext();
  }, [addFilesToUpload, goNext]);

  const handleClickDeleteFileToUpload = useCallback((fileIndex) => {
    handleRemoveFileToUpload(fileIndex);

    if (currentStep === 'edit-new') {
      handleResetFileToEdit();
      goNext();
    }
  }, [currentStep, handleRemoveFileToUpload, handleResetFileToEdit, goNext]);

  const handleCloseModal = useCallback(() => {
    setDisplayNextButton(false);
    handleClose();
  }, [handleClose]);

  const handleConfirmDeleteFile = useCallback(() => {
    setShouldDeleteFile(true);
    toggleModalWarning();
  }, [toggleModalWarning]);

  const handleGoToAddBrowseFiles = useCallback(() => {
    handleCleanFilesError();
    goBack();
  }, [handleCleanFilesError, goBack]);

  const handleSubmitEditNewFile = useCallback((e) => {
    e.preventDefault();
    submitEditNewFile();
    goNext();
  }, [submitEditNewFile, goNext]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    onInputMediaChange(multiple ? selectedFiles : selectedFiles[0]);
    goNext();
  }, [onInputMediaChange, multiple, selectedFiles, goNext]);

  const handleCloseModalWarning = useCallback(async () => {
    if (shouldDeleteFile) {
      const { id } = fileToEdit;
      const result = await deleteFileRequest(id, handleSetFileToEditError, formatMessage);

      if (result.success) {
        setShouldDeleteFile(false);
        handleFileSelection({ target: { name: id } });
        goToList();
      }
    }
  }, [shouldDeleteFile, fileToEdit, handleSetFileToEditError, formatMessage, handleFileSelection, goToList]);

  const handleSubmitEditExistingFile = useCallback(async (
    e,
    shouldDuplicateMedia = false,
    file = fileToEdit.file,
    isSubmittingAfterCrop = false
  ) => {
    e.preventDefault();
    submitEditExistingFile();

    if (isSubmittingAfterCrop) {
      emitEvent('didCropFile', {
        duplicatedFile: shouldDuplicateMedia,
        location: 'content-manager',
      });
    }

    const result = await submitFileEditRequest(
      fileToEdit,
      shouldDuplicateMedia,
      file,
      handleSetFileToEditError,
      formatMessage
    );

    if (result.success) {
      handleEditExistingFile(result.data);
      goToList();
    }
  }, [
    fileToEdit,
    submitEditExistingFile,
    emitEvent,
    handleSetFileToEditError,
    formatMessage,
    handleEditExistingFile,
    goToList,
  ]);

  const handleToggle = useCallback(() => {
    if (filesToUploadLength > 0) {
      if (!showConfirmDialog(formatMessage, CONFIRM_CLOSE_WITH_FILES_ID)) {
        return;
      }
    }

    const hasChanges =
      (currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles)) ||
      (currentStep === 'edit' && initialFileToEdit && !isEqual(fileToEdit, initialFileToEdit)) ||
      (currentStep === 'edit' && selectedFiles.length > 0);

    if (hasChanges && !showConfirmDialog(formatMessage, CONFIRM_CLOSE_WITH_FILE_ID)) {
      return;
    }

    onToggle(true);
  }, [
    filesToUploadLength,
    formatMessage,
    currentStep,
    selectedFiles,
    initialSelectedFiles,
    fileToEdit,
    initialFileToEdit,
    onToggle,
  ]);

  // Computed values
  const shouldDisplayNextButton = currentStep === 'browse' && displayNextButton;
  const isFinishButtonDisabled = filesToUpload.some(file => file.isDownloading || file.isUploading);
  const areButtonsDisabledOnEditExistingFile = currentStep === 'edit' && fileToEdit.isUploading === true;

  return (
    <>
      <Modal isOpen={isOpen} onToggle={handleToggle} onClosed={handleCloseModal}>
        <ModalHeader
          goBack={goBack}
          HeaderComponent={HeaderComponent}
          headerBreadcrumbs={headerBreadcrumbs}
          withBackButton={withBackButton}
        />
        {Component && (
          <Component
            {...allowedActions}
            addFilesToUpload={handleAddFilesToUploadList}
            components={components}
            filesToDownload={filesToDownload}
            filesToUpload={filesToUpload}
            fileToEdit={fileToEdit}
            formErrors={formErrors}
            isEditingUploadedFile={currentStep === 'edit'}
            isFormDisabled={isFormDisabled}
            noNavigation={noNavigation}
            onAbortUpload={handleAbortUpload}
            onChange={handleFileToEditChange}
            onClickCancelUpload={handleCancelFileToUpload}
            onClickDeleteFileToUpload={
              currentStep === 'edit' ? handleConfirmDeleteFile : handleClickDeleteFileToUpload
            }
            onSubmitEdit={
              currentStep === 'edit' ? handleSubmitEditExistingFile : handleSubmitEditNewFile
            }
            onClickEditNewFile={handleGoToEditNewFile}
            onGoToAddBrowseFiles={handleGoToAddBrowseFiles}
            onSubmitEditNewFile={handleSubmitEditNewFile}
            ref={currentStep === 'edit' ? editModalRef : null}
            toggleDisableForm={handleFormDisabled}
            onToggle={handleToggle}
            setCropResult={handleSetCropResult}
            setShouldDisplayNextButton={setDisplayNextButton}
            withBackButton={withBackButton}
          />
        )}

        <ModalFooter>
          <section>
            <Button type="button" color="cancel" onClick={handleToggle}>
              {formatMessage({ id: 'app.components.Button.cancel' })}
            </Button>
            {currentStep === 'upload' && (
              <Button
                type="button"
                color="success"
                onClick={handleUploadFiles}
                disabled={isFinishButtonDisabled}
              >
                {formatMessage(
                  {
                    id: getTrad(
                      `modal.upload-list.footer.button.${
                        filesToUploadLength > 1 ? 'plural' : 'singular'
                      }`
                    ),
                  },
                  { number: filesToUploadLength }
                )}
              </Button>
            )}
            {shouldDisplayNextButton && (
              <Button
                type="button"
                color="primary"
                onClick={handleClickNextButton}
                disabled={isEmpty(filesToDownload)}
              >
                {formatMessage({ id: getTrad('button.next') })}
              </Button>
            )}
            {currentStep === 'edit-new' && (
              <Button color="success" type="button" onClick={handleSubmitEditNewFile}>
                {formatMessage({ id: 'form.button.finish' })}
              </Button>
            )}
            {currentStep === 'edit' && (
              <div style={{ margin: 'auto 0' }}>
                <Button
                  disabled={isFormDisabled || areButtonsDisabledOnEditExistingFile}
                  color="primary"
                  onClick={handleReplaceMedia}
                  style={{ marginRight: 10 }}
                >
                  {formatMessage({ id: getTrad('control-card.replace-media') })}
                </Button>

                <Button
                  disabled={isFormDisabled || areButtonsDisabledOnEditExistingFile}
                  color="success"
                  type="button"
                  onClick={handleSubmitEditExistingFile}
                >
                  {formatMessage({ id: 'form.button.finish' })}
                </Button>
              </div>
            )}
            {currentStep === 'list' && (
              <Button color="success" type="button" onClick={handleSubmit}>
                {formatMessage({ id: 'form.button.finish' })}
              </Button>
            )}
          </section>
        </ModalFooter>
      </Modal>
      <PopUpWarning
        onClosed={handleCloseModalWar