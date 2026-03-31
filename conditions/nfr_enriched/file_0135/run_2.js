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
const CONFIRM_CLOSE_WITH_FILES_KEY = 'window.confirm.close-modal.files';
const CONFIRM_CLOSE_WITH_CHANGES_KEY = 'window.confirm.close-modal.file';
const FILE_TOO_LARGE_STATUS = 413;
const FILE_TOO_LARGE_ERROR_KEY = 'app.utils.errors.file-too-big.message';

// Utility functions
const getErrorMessage = (err) => {
  const status = get(err, 'response.status', get(err, 'status', null));
  const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
  return get(
    err,
    ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
    get(err, ['response', 'payload', 'message'], statusText)
  );
};

const showConfirmDialog = (formatMessage, messageKey) => {
  return window.confirm(formatMessage({ id: getTrad(messageKey) }));
};

const handleDeleteFileRequest = async (fileId) => {
  const requestURL = getRequestUrl(`files/${fileId}`);
  return request(requestURL, { method: 'DELETE' });
};

const handleEditFileRequest = async (fileToEdit, formData, shouldDuplicateMedia) => {
  const { abortController, id } = fileToEdit;
  const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;

  return request(
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
};

// Modal Footer Button Components
const UploadButton = ({ filesToUploadLength, isDisabled, onUpload, formatMessage }) => (
  <Button
    type="button"
    color="success"
    onClick={onUpload}
    disabled={isDisabled}
  >
    {formatMessage(
      {
        id: getTrad(
          `modal.upload-list.footer.button.${filesToUploadLength > 1 ? 'plural' : 'singular'}`
        ),
      },
      { number: filesToUploadLength }
    )}
  </Button>
);

const NextButton = ({ isDisabled, onClick, formatMessage }) => (
  <Button
    type="button"
    color="primary"
    onClick={onClick}
    disabled={isDisabled}
  >
    {formatMessage({ id: getTrad('button.next') })}
  </Button>
);

const EditNewFileButton = ({ onClick, formatMessage }) => (
  <Button color="success" type="button" onClick={onClick}>
    {formatMessage({ id: 'form.button.finish' })}
  </Button>
);

const EditExistingFileButtons = ({
  isDisabled,
  onReplace,
  onSubmit,
  formatMessage,
}) => (
  <div style={{ margin: 'auto 0' }}>
    <Button
      disabled={isDisabled}
      color="primary"
      onClick={onReplace}
      style={{ marginRight: 10 }}
    >
      {formatMessage({ id: getTrad('control-card.replace-media') })}
    </Button>
    <Button
      disabled={isDisabled}
      color="success"
      type="button"
      onClick={onSubmit}
    >
      {formatMessage({ id: 'form.button.finish' })}
    </Button>
  </div>
);

const FinishButton = ({ onClick, formatMessage }) => (
  <Button color="success" type="button" onClick={onClick}>
    {formatMessage({ id: 'form.button.finish' })}
  </Button>
);

// Main Component
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
      if (hasFilesToUpload && !showConfirmDialog(formatMessage, CONFIRM_CLOSE_WITH_FILES_KEY)) {
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
    if (currentStep === 'upload' && filesToUploadLength === 0) {
      goToList();
    } else if (currentStep === 'upload') {
      downloadFiles();
    }
  }, [filesToUploadLength, currentStep, goToList, downloadFiles]);

  // File handlers
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

  const handleReplaceMedia = useCallback(() => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current?.click();
  }, [emitEvent]);

  // Form submission handlers
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
    if (!shouldDeleteFile) return;

    const { id } = fileToEdit;

    try {
      await handleDeleteFileRequest(id);
      setShouldDeleteFile(false);
      handleFileSelection({ target: { name: id } });
      goToList();
    } catch (err) {
      console.error(err);
      const errorMessage = getErrorMessage(err);
      const status = get(err, 'response.status', get(err, 'status', null));

      strapi.notification.toggle({
        type: 'warning',
        message: errorMessage,
      });

      if (status) {
        handleSetFileToEditError(errorMessage);
      }
    }
  }, [shouldDeleteFile, fileToEdit, handleFileSelection, goToList, handleSetFileToEditError]);

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

    const formData = new FormData();
    const didCropFile = file instanceof File;

    if (didCropFile) {
      formData.append('files', file);
    }

    formData.append('fileInfo', JSON.stringify(fileToEdit.fileInfo));

    try {
      const editedFile = await handleEditFileRequest(fileToEdit, formData, shouldDuplicateMedia);
      handleEditExistingFile(editedFile);
      goToList();
    } catch (err) {
      const status = get(err, 'response.status', get(err, 'status', null));
      let errorMessage = getErrorMessage(err);

      if (status === FILE_TOO_LARGE_STATUS) {
        errorMessage = formatMessage({ id: FILE_TOO_LARGE_ERROR_KEY });
      }

      if (status) {
        handleSetFileToEditError(errorMessage);
      }
    }
  }, [
    submitEditExistingFile,
    emitEvent,
    fileToEdit,
    handleEditExistingFile,
    goToList,
    formatMessage,
    handleSetFileToEditError,
  ]);

  const handleToggle = useCallback(() => {
    const hasFilesToUpload = !isEmpty(filesToUpload);

    if (hasFilesToUpload && !showConfirmDialog(formatMessage, CONFIRM_CLOSE_WITH_FILES_KEY)) {
      return;
    }

    const hasChanges =
      (currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles)) ||
      (currentStep === 'edit' && initialFileToEdit && !isEqual(fileToEdit, initialFileToEdit)) ||
      (currentStep === 'edit' && selectedFiles.length > 0);

    if (hasChanges && !showConfirmDialog(formatMessage, CONFIRM_CLOSE_WITH_CHANGES_KEY)) {
      return;
    }

    onToggle(true);
  }, [
    filesToUpload,
    currentStep,
    selectedFiles,
    initialSelectedFiles,
    fileToEdit,
    initialFileToEdit,
    formatMessage,
    onToggle,
  ]);

  // Button state calculations
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
              <UploadButton
                filesToUploadLength={filesToUploadLength}
                isDisabled={isFinishButtonDisabled}
                onUpload={handleUploadFiles}
                formatMessage={formatMessage}
              />
            )}

            {shouldDisplayNextButton && (
              <NextButton
                isDisabled={isEmpty(filesToDownload)}
                onClick={handleClickNextButton}
                formatMessage={formatMessage}
              />
            )}

            {currentStep === 'edit-new' && (
              <EditNewFileButton
                onClick={handleSubmitEditNewFile}
                formatMessage={formatMessage}
              />
            )}

            {currentStep === 'edit' && (
              <EditExistingFileButtons
                isDisabled={is