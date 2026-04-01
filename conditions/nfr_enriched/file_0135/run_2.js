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
 * Confirms user action with a dialog message
 * @param {string} messageId - Translation ID for the confirmation message
 * @param {Function} formatMessage - Message formatter function
 * @returns {boolean} User confirmation result
 */
const confirmUserAction = (messageId, formatMessage) => {
  // eslint-disable-next-line no-alert
  return globalThis.confirm(formatMessage({ id: messageId }));
};

/**
 * Handles file deletion request and updates UI state
 * @param {Object} params - Parameters object
 * @param {string} params.fileId - ID of file to delete
 * @param {Function} params.onFileSelection - Callback to handle file deselection
 * @param {Function} params.onNavigateToList - Callback to navigate to list view
 * @param {Function} params.onSetError - Callback to set error state
 * @param {Function} params.onNotify - Callback to show notification
 * @returns {Promise<void>}
 */
const deleteFileRequest = async ({
  fileId,
  onFileSelection,
  onNavigateToList,
  onSetError,
  onNotify,
}) => {
  try {
    const requestURL = getRequestUrl(`files/${fileId}`);
    await request(requestURL, { method: 'DELETE' });

    onFileSelection({ target: { name: fileId } });
    onNavigateToList();
  } catch (err) {
    console.error(err);

    const status = get(err, 'response.status', get(err, 'status', null));
    const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
    const errorMessage = get(
      err,
      ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
      get(err, ['response', 'payload', 'message'], statusText)
    );

    onNotify({
      type: 'warning',
      message: errorMessage,
    });

    if (status) {
      onSetError(errorMessage);
    }
  }
};

/**
 * Handles file edit submission with optional duplication and cropping
 * @param {Object} params - Parameters object
 * @param {Object} params.fileToEdit - File being edited
 * @param {File} params.file - File object (may be cropped)
 * @param {Object} params.fileInfo - File metadata
 * @param {boolean} params.shouldDuplicateMedia - Whether to duplicate the file
 * @param {boolean} params.isSubmittingAfterCrop - Whether submission follows a crop operation
 * @param {Function} params.onEditSuccess - Callback on successful edit
 * @param {Function} params.onNavigateToList - Callback to navigate to list
 * @param {Function} params.onSetError - Callback to set error state
 * @param {Function} params.onEmitEvent - Callback to emit tracking event
 * @param {Function} params.formatMessage - Message formatter function
 * @returns {Promise<void>}
 */
const submitFileEdit = async ({
  fileToEdit,
  file,
  fileInfo,
  shouldDuplicateMedia,
  isSubmittingAfterCrop,
  onEditSuccess,
  onNavigateToList,
  onSetError,
  onEmitEvent,
  formatMessage,
}) => {
  if (isSubmittingAfterCrop) {
    onEmitEvent('didCropFile', {
      duplicatedFile: shouldDuplicateMedia,
      location: 'content-manager',
    });
  }

  const headers = {};
  const formData = new FormData();
  const didCropFile = file instanceof File;
  const { abortController, id } = fileToEdit;
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

    onEditSuccess(editedFile);
    onNavigateToList();
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
      onSetError(errorMessage);
    }
  }
};

/**
 * Determines if modal close should be prevented based on unsaved changes
 * @param {Object} params - Parameters object
 * @param {string} params.currentStep - Current modal step
 * @param {Array} params.selectedFiles - Currently selected files
 * @param {Array} params.initialSelectedFiles - Initial selected files
 * @param {Object} params.fileToEdit - File being edited
 * @param {Object} params.initialFileToEdit - Initial file to edit
 * @param {Function} params.formatMessage - Message formatter function
 * @returns {boolean} Whether to prevent modal close
 */
const shouldPreventModalClose = ({
  currentStep,
  selectedFiles,
  initialSelectedFiles,
  fileToEdit,
  initialFileToEdit,
  formatMessage,
}) => {
  const hasListChanges =
    currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles);
  const hasEditChanges =
    currentStep === 'edit' &&
    initialFileToEdit &&
    !isEqual(fileToEdit, initialFileToEdit);
  const hasNewSelection = currentStep === 'edit' && selectedFiles.length > 0;

  if (hasListChanges || hasEditChanges || hasNewSelection) {
    return confirmUserAction(getTrad('window.confirm.close-modal.file'), formatMessage);
  }

  return false;
};

/**
 * Determines if back navigation should be prevented based on pending uploads
 * @param {Object} params - Parameters object
 * @param {Array} params.filesToUpload - Files pending upload
 * @param {Function} params.formatMessage - Message formatter function
 * @returns {boolean} Whether to prevent back navigation
 */
const shouldPreventBackNavigation = ({ filesToUpload, formatMessage }) => {
  if (!isEmpty(filesToUpload)) {
    return confirmUserAction(getTrad('window.confirm.close-modal.files'), formatMessage);
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

  const handleReplaceMedia = () => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current.click();
  };

  useEffect(() => {
    if (currentStep === 'upload') {
      if (filesToUploadLength === 0) {
        goToList();
      } else {
        downloadFiles();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesToUploadLength, currentStep]);

  const addFilesToUploadList = ({ target: { value } }) => {
    addFilesToUpload({ target: { value } });
    goNext();
  };

  const goToList = () => {
    fetchMediaLib();
    goTo('list');
  };

  const goNext = () => {
    if (next === null) {
      onToggle();
      return;
    }

    goTo(next);
  };

  const goBack = (elementName = null) => {
    const hasFilesToUpload = !isEmpty(filesToUpload);

    // Handle back from upload step
    if (elementName === 'backButton' && backButtonDestination && currentStep === 'upload') {
      if (hasFilesToUpload) {
        if (!shouldPreventBackNavigation({ filesToUpload, formatMessage })) {
          return;
        }
      }

      goTo(backButtonDestination);
      handleClearFilesToUploadAndDownload();
      return;
    }

    // Handle back from browse step
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

  const handleClickDeleteFile = async () => {
    toggleModalWarning();
  };

  const handleClickDeleteFileToUpload = (fileIndex) => {
    handleRemoveFileToUpload(fileIndex);

    if (currentStep === 'edit-new') {
      handleResetFileToEdit();
      goNext();
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
    goNext();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onInputMediaChange(multiple ? selectedFiles : selectedFiles[0]);
    goNext();
  };

  const handleCloseModalWarning = async () => {
    if (shouldDeleteFile) {
      const { id } = fileToEdit;

      await deleteFileRequest({
        fileId: id,
        onFileSelection: handleFileSelection,
        onNavigateToList: goToList,
        onSetError: handleSetFileToEditError,
        onNotify: (notification) => {
          strapi.notification.toggle(notification);
        },
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
    e.preventDefault();
    submitEditExistingFile();

    await submitFileEdit({
      fileToEdit,
      file,
      fileInfo: fileToEdit.fileInfo,
      shouldDuplicateMedia,
      isSubmittingAfterCrop,
      onEditSuccess: handleEditExistingFile,
      onNavigateToList: goToList,
      onSetError: handleSetFileToEditError,
      onEmitEvent: emitEvent,
      formatMessage,
    });
  };

  const handleToggle = () => {
    if (filesToUploadLength > 0) {
      if (!shouldPreventBackNavigation({ filesToUpload, formatMessage })) {
        return;
      }
    }

    if (
      shouldPreventModalClose({
        currentStep,
        selectedFiles,
        initialSelectedFiles,
        fileToEdit,
        initialFileToEdit,
        formatMessage,
      })
    ) {
      return;
    }

    onToggle(true);
  };

  const shouldDisplayNextButton = currentStep === 'browse' && displayNextButton;
  const isFinishButtonDisabled = filesToUpload.some(
    (file) => file.isDownloading || file.isUploading
  );
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
            withBackButton={withBackButton}
          />
        )}

        <ModalFooter>
          <section>
            <Button type="button" color="cancel" onClick={handleToggle}>
              {formatMessage({