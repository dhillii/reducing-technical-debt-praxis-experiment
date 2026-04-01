```javascript
import React, { useEffect, useState, useRef, memo } from 'react';
import PropTypes from 'prop-types';
import { Modal, ModalFooter, PopUpWarning, useGlobalContext, request } from 'strapi-helper-plugin';
import { Button } from '@buffetjs/core';
import { get, isEmpty, isEqual } from 'lodash';
import { getRequestUrl, getTrad } from '../../utils';
import ModalHeader from '../../components/ModalHeader';
import pluginId from '../../pluginId';
import stepper from './stepper';
import useModalContext from '../../hooks/useModalContext';

/**
 * Confirms user action with a dialog prompt
 * @param {string} messageId - Translation ID for the confirmation message
 * @param {Function} formatMessage - Message formatter function
 * @returns {boolean} - User confirmation result
 */
const getUserConfirmation = (messageId, formatMessage) => {
  // eslint-disable-next-line no-alert
  return globalThis.confirm(formatMessage({ id: messageId }));
};

/**
 * Handles file deletion request and updates UI state
 * @param {Object} params - Parameters object
 * @param {string} params.fileId - ID of file to delete
 * @param {Function} params.handleFileSelection - Selection handler
 * @param {Function} params.goToList - Navigation to list
 * @param {Function} params.handleSetFileToEditError - Error setter
 */
const deleteFileAndUpdateState = async ({
  fileId,
  handleFileSelection,
  goToList,
  handleSetFileToEditError,
}) => {
  try {
    const requestURL = getRequestUrl(`files/${fileId}`);
    await request(requestURL, { method: 'DELETE' });

    handleFileSelection({ target: { name: fileId } });
    goToList();
  } catch (err) {
    console.error(err);

    const status = get(err, 'response.status', get(err, 'status', null));
    const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
    const errorMessage = get(
      err,
      ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
      get(err, ['response', 'payload', 'message'], statusText)
    );

    strapi.notification.toggle({
      type: 'warning',
      message: errorMessage,
    });

    if (status) {
      handleSetFileToEditError(errorMessage);
    }
  }
};

/**
 * Submits edited file with optional duplication and crop handling
 * @param {Object} params - Parameters object
 * @param {Event} params.event - Form submission event
 * @param {boolean} params.shouldDuplicateMedia - Whether to duplicate the file
 * @param {File} params.file - File to submit
 * @param {boolean} params.isSubmittingAfterCrop - Whether submission follows crop
 * @param {Object} params.fileToEdit - File being edited
 * @param {Function} params.submitEditExistingFile - Submit handler
 * @param {Function} params.emitEvent - Event emitter
 * @param {Function} params.handleEditExistingFile - Edit handler
 * @param {Function} params.goToList - Navigation to list
 * @param {Function} params.handleSetFileToEditError - Error setter
 * @param {Function} params.formatMessage - Message formatter
 */
const submitEditedFile = async ({
  event,
  shouldDuplicateMedia = false,
  file,
  isSubmittingAfterCrop = false,
  fileToEdit,
  submitEditExistingFile,
  emitEvent,
  handleEditExistingFile,
  goToList,
  handleSetFileToEditError,
  formatMessage,
}) => {
  event.preventDefault();
  submitEditExistingFile();

  if (isSubmittingAfterCrop) {
    emitEvent('didCropFile', {
      duplicatedFile: shouldDuplicateMedia,
      location: 'content-manager',
    });
  }

  const headers = {};
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
        headers,
        body: formData,
        signal: abortController.signal,
      },
      false,
      false
    );

    handleEditExistingFile(editedFile);
    goToList();
  } catch (err) {
    const status = get(err, 'response.status', get(err, 'status', null));
    const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
    let errorMessage = get(
      err,
      ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
      get(err, ['response', 'payload', 'message'], statusText)
    );

    if (status === 413) {
      errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
    }

    if (status) {
      handleSetFileToEditError(errorMessage);
    }
  }
};

/**
 * Determines if user should be prompted before closing modal
 * @param {Object} params - Parameters object
 * @param {string} params.currentStep - Current modal step
 * @param {Array} params.selectedFiles - Currently selected files
 * @param {Array} params.initialSelectedFiles - Initial selected files
 * @param {Object} params.fileToEdit - File being edited
 * @param {Object} params.initialFileToEdit - Initial file being edited
 * @returns {boolean} - Whether to show confirmation
 */
const shouldPromptBeforeClose = ({
  currentStep,
  selectedFiles,
  initialSelectedFiles,
  fileToEdit,
  initialFileToEdit,
}) => {
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

/**
 * Handles back navigation with validation for pending uploads
 * @param {Object} params - Parameters object
 * @param {string} params.elementName - Name of triggering element
 * @param {string} params.currentStep - Current modal step
 * @param {string} params.backButtonDestination - Back button destination
 * @param {Array} params.filesToUpload - Files pending upload
 * @param {Function} params.goTo - Navigation function
 * @param {Function} params.handleClearFilesToUploadAndDownload - Clear handler
 * @param {Function} params.formatMessage - Message formatter
 * @param {string} params.prev - Previous step
 * @returns {void}
 */
const handleBackNavigation = ({
  elementName,
  currentStep,
  backButtonDestination,
  filesToUpload,
  goTo,
  handleClearFilesToUploadAndDownload,
  formatMessage,
  prev,
}) => {
  const hasFilesToUpload = !isEmpty(filesToUpload);

  if (elementName === 'backButton' && backButtonDestination && currentStep === 'upload') {
    if (hasFilesToUpload) {
      const confirmed = getUserConfirmation(
        getTrad('window.confirm.close-modal.files'),
        formatMessage
      );

      if (!confirmed) {
        return;
      }
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

  const handleReplaceMedia = () => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current.click();
  };

  useEffect(() => {
    if (currentStep === 'upload') {
      if (filesToUploadLength === 0) {
        fetchMediaLib();
        goTo('list');
      } else {
        downloadFiles();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesToUploadLength, currentStep]);

  const addFilesToUploadList = ({ target: { value } }) => {
    addFilesToUpload({ target: { value } });
    goTo(next);
  };

  const goBack = (elementName = null) => {
    handleBackNavigation({
      elementName,
      currentStep,
      backButtonDestination,
      filesToUpload,
      goTo,
      handleClearFilesToUploadAndDownload,
      formatMessage,
      prev,
    });
  };

  const handleClickDeleteFile = () => {
    toggleModalWarning();
  };

  const handleClickDeleteFileToUpload = (fileIndex) => {
    handleRemoveFileToUpload(fileIndex);

    if (currentStep === 'edit-new') {
      handleResetFileToEdit();
      goTo(next);
    }
  };

  const handleCloseModal = () => {
    setDisplayNextButton(false);
    handleClose();
  };

  const handleConfirmDeleteFile = () => {
    setShouldDeleteFile(true);
    toggleModalWarning();
  };

  const handleGoToAddBrowseFiles = () => {
    handleCleanFilesError();
    goBack();
  };

  const handleSubmitEditNewFile = (e) => {
    e.preventDefault();
    submitEditNewFile();
    goTo(next);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onInputMediaChange(multiple ? selectedFiles : selectedFiles[0]);
    goTo(next);
  };

  const handleCloseModalWarning = async () => {
    if (shouldDeleteFile) {
      const { id } = fileToEdit;

      await deleteFileAndUpdateState({
        fileId: id,
        handleFileSelection,
        goToList: () => {
          fetchMediaLib();
          goTo('list');
        },
        handleSetFileToEditError,
      });

      setShouldDeleteFile(false);
    }
  };

  const handleSubmitEditExistingFile = async (
    e,
    shouldDuplicateMedia = false,
    file = fileToEdit.file,
    isSubmittingAfterCrop = false
  ) => {
    await submitEditedFile({
      event: e,
      shouldDuplicateMedia,
      file,
      isSubmittingAfterCrop,
      fileToEdit,
      submitEditExistingFile,
      emitEvent,
      handleEditExistingFile,
      goToList: () => {
        fetchMediaLib();
        goTo('list');
      },
      handleSetFileToEditError,
      formatMessage,
    });
  };

  const handleToggle = () => {
    if (filesToUploadLength > 0) {
      const confirmed = getUserConfirmation(
        getTrad('window.confirm.close-modal.files'),
        formatMessage
      );

      if (!confirmed) {
        return;
      }
    }

    if (
      shouldPromptBeforeClose({
        currentStep,
        selectedFiles,
        initialSelectedFiles,
        fileToEdit,
        initialFileToEdit,
      })
    ) {
      const confirmed = getUserConfirmation(
        getTrad('window.confirm.close-modal.file'),
        formatMessage
      );

      if (!confirmed) {
        return;
      }
    }

    onToggle(true);
  };

  const shouldDisplayNextButton = currentStep === 'browse' && displayNextButton;
  const isFinishButtonDisabled = filesToUpload.some(file => file.isDownloading || file.isUploading);
  const areButtonsDisabledOnEditExistingFile =
    currentStep === 'edit' && fileToEdit.isUploading === true;

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
              currentStep === 'edit' ? handleClickDeleteFile : handleClickDeleteFileToUpload
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