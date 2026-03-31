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
const CONFIRM_CLOSE_WITH_FILES = getTrad('window.confirm.close-modal.files');
const CONFIRM_CLOSE_WITH_CHANGES = getTrad('window.confirm.close-modal.file');
const FILE_TOO_BIG_STATUS = 413;

// Error extraction utility
const extractErrorMessage = (err, formatMessage) => {
  const status = get(err, 'response.status', get(err, 'status', null));
  const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
  
  if (status === FILE_TOO_BIG_STATUS) {
    return formatMessage({ id: 'app.utils.errors.file-too-big.message' });
  }

  return get(
    err,
    ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
    get(err, ['response', 'payload', 'message'], statusText)
  );
};

// File deletion handler
const handleFileDelete = async (fileToEdit, handleFileSelection, goToList, handleSetFileToEditError, formatMessage) => {
  const { id } = fileToEdit;

  try {
    const requestURL = getRequestUrl(`files/${id}`);
    await request(requestURL, { method: 'DELETE' });
    handleFileSelection({ target: { name: id } });
    goToList();
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
  }
};

// File edit submission handler
const handleFileEditSubmit = async (
  e,
  fileToEdit,
  shouldDuplicateMedia,
  file,
  isSubmittingAfterCrop,
  submitEditExistingFile,
  handleEditExistingFile,
  goToList,
  handleSetFileToEditError,
  emitEvent,
  formatMessage
) => {
  e.preventDefault();
  submitEditExistingFile();

  if (isSubmittingAfterCrop) {
    emitEvent('didCropFile', {
      duplicatedFile: shouldDuplicateMedia,
      location: 'content-manager',
    });
  }

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

    handleEditExistingFile(editedFile);
    goToList();
  } catch (err) {
    const errorMessage = extractErrorMessage(err, formatMessage);
    const status = get(err, 'response.status', get(err, 'status', null));

    if (status) {
      handleSetFileToEditError(errorMessage);
    }
  }
};

// Back navigation handler
const handleBackNavigation = (
  elementName,
  backButtonDestination,
  currentStep,
  filesToUpload,
  goTo,
  handleClearFilesToUploadAndDownload,
  prev,
  formatMessage
) => {
  const hasFilesToUpload = !isEmpty(filesToUpload);

  if (elementName === 'backButton' && backButtonDestination && currentStep === 'upload') {
    if (hasFilesToUpload) {
      const confirm = window.confirm(formatMessage({ id: CONFIRM_CLOSE_WITH_FILES }));
      if (!confirm) return;
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
};

// Modal close confirmation handler
const shouldConfirmClose = (currentStep, selectedFiles, initialSelectedFiles, fileToEdit, initialFileToEdit) => {
  if (currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles)) {
    return true;
  }

  if (currentStep === 'edit' && initialFileToEdit && !isEqual(fileToEdit, initialFileToEdit)) {
    return true;
  }

  if (currentStep === 'edit' && selectedFiles.length > 0) {
    return true;
  }

  return false;
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

  // Effects
  useEffect(() => {
    if (currentStep === 'upload' && filesToUploadLength === 0) {
      fetchMediaLib();
      goTo('list');
    } else if (currentStep === 'upload') {
      downloadFiles();
    }
  }, [filesToUploadLength, currentStep, fetchMediaLib, goTo, downloadFiles]);

  // Callbacks
  const goNext = useCallback(() => {
    if (next === null) {
      onToggle();
      return;
    }
    goTo(next);
  }, [next, onToggle, goTo]);

  const goBack = useCallback((elementName = null) => {
    handleBackNavigation(
      elementName,
      backButtonDestination,
      currentStep,
      filesToUpload,
      goTo,
      handleClearFilesToUploadAndDownload,
      prev,
      formatMessage
    );
  }, [backButtonDestination, currentStep, filesToUpload, goTo, handleClearFilesToUploadAndDownload, prev, formatMessage]);

  const addFilesToUploadList = useCallback(({ target: { value } }) => {
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

  const handleReplaceMedia = useCallback(() => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current?.click();
  }, [emitEvent]);

  const handleCloseModalWarning = useCallback(async () => {
    if (shouldDeleteFile) {
      await handleFileDelete(
        fileToEdit,
        handleFileSelection,
        () => {
          fetchMediaLib();
          goTo('list');
        },
        handleSetFileToEditError,
        formatMessage
      );
      setShouldDeleteFile(false);
    }
  }, [shouldDeleteFile, fileToEdit, handleFileSelection, fetchMediaLib, goTo, handleSetFileToEditError, formatMessage]);

  const handleSubmitEditExistingFile = useCallback(async (
    e,
    shouldDuplicateMedia = false,
    file = fileToEdit.file,
    isSubmittingAfterCrop = false
  ) => {
    await handleFileEditSubmit(
      e,
      fileToEdit,
      shouldDuplicateMedia,
      file,
      isSubmittingAfterCrop,
      submitEditExistingFile,
      handleEditExistingFile,
      () => {
        fetchMediaLib();
        goTo('list');
      },
      handleSetFileToEditError,
      emitEvent,
      formatMessage
    );
  }, [fileToEdit, submitEditExistingFile, handleEditExistingFile, fetchMediaLib, goTo, handleSetFileToEditError, emitEvent, formatMessage]);

  const handleToggle = useCallback(() => {
    if (filesToUploadLength > 0) {
      const confirm = window.confirm(formatMessage({ id: CONFIRM_CLOSE_WITH_FILES }));
      if (!confirm) return;
    }

    if (shouldConfirmClose(currentStep, selectedFiles, initialSelectedFiles, fileToEdit, initialFileToEdit)) {
      const confirm = window.confirm(formatMessage({ id: CONFIRM_CLOSE_WITH_CHANGES }));
      if (!confirm) return;
    }

    onToggle(true);
  }, [filesToUploadLength, currentStep, selectedFiles, initialSelectedFiles, fileToEdit, initialFileToEdit, formatMessage, onToggle]);

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
            addFilesToUpload={addFilesToUploadList}
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
                  disabled={isFormDisabled || areButtonsDisa