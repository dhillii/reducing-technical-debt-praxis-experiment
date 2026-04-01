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
 * @returns {boolean} - User confirmation result
 */
const confirmUserAction = (messageId, formatMessage) => {
  // eslint-disable-next-line no-alert
  return globalThis.confirm(formatMessage({ id: messageId }));
};

/**
 * Handles file deletion request and updates UI state
 * @param {Object} fileToEdit - File object to delete
 * @param {Function} handleFileSelection - Selection handler
 * @param {Function} goToList - Navigation to list
 * @param {Function} handleSetFileToEditError - Error handler
 */
const deleteFileAndNavigate = async (
  fileToEdit,
  handleFileSelection,
  goToList,
  handleSetFileToEditError
) => {
  const { id } = fileToEdit;

  try {
    const requestURL = getRequestUrl(`files/${id}`);
    await request(requestURL, { method: 'DELETE' });

    handleFileSelection({ target: { name: id } });
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
 * Handles file edit submission with optional duplication and cropping
 * @param {Object} params - Parameters object
 * @returns {Promise<void>}
 */
const submitFileEdit = async ({
  fileToEdit,
  shouldDuplicateMedia,
  file,
  isSubmittingAfterCrop,
  emitEvent,
  formatMessage,
  handleEditExistingFile,
  goToList,
  handleSetFileToEditError,
}) => {
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
 * Determines if modal close should be prevented based on unsaved changes
 * @param {Object} params - Parameters object
 * @returns {boolean} - Whether to prevent close
 */
const shouldPreventModalClose = ({
  currentStep,
  selectedFiles,
  initialSelectedFiles,
  fileToEdit,
  initialFileToEdit,
  formatMessage,
}) => {
  if (currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles)) {
    return confirmUserAction(getTrad('window.confirm.close-modal.file'), formatMessage);
  }

  if (currentStep === 'edit' && initialFileToEdit && !isEqual(fileToEdit, initialFileToEdit)) {
    return confirmUserAction(getTrad('window.confirm.close-modal.file'), formatMessage);
  }

  if (currentStep === 'edit' && selectedFiles.length > 0) {
    return confirmUserAction(getTrad('window.confirm.close-modal.file'), formatMessage);
  }

  return false;
};

/**
 * Handles back navigation with validation for unsaved uploads
 * @param {Object} params - Parameters object
 * @returns {void}
 */
const handleBackNavigation = ({
  elementName,
  backButtonDestination,
  currentStep,
  filesToUpload,
  formatMessage,
  goTo,
  handleClearFilesToUploadAndDownload,
  prev,
}) => {
  const hasFilesToUpload = !isEmpty(filesToUpload);

  if (elementName === 'backButton' && backButtonDestination && currentStep === 'upload') {
    if (hasFilesToUpload) {
      const userConfirmed = confirmUserAction(
        getTrad('window.confirm.close-modal.files'),
        formatMessage
      );

      if (!userConfirmed) {
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
      backButtonDestination,
      currentStep,
      filesToUpload,
      formatMessage,
      goTo,
      handleClearFilesToUploadAndDownload,
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
      setShouldDeleteFile(false);
      await deleteFileAndNavigate(
        fileToEdit,
        handleFileSelection,
        () => {
          fetchMediaLib();
          goTo('list');
        },
        handleSetFileToEditError
      );
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

    if (isSubmittingAfterCrop) {
      emitEvent('didCropFile', {
        duplicatedFile: shouldDuplicateMedia,
        location: 'content-manager',
      });
    }

    await submitFileEdit({
      fileToEdit,
      shouldDuplicateMedia,
      file,
      isSubmittingAfterCrop,
      emitEvent,
      formatMessage,
      handleEditExistingFile,
      goToList: () => {
        fetchMediaLib();
        goTo('list');
      },
      handleSetFileToEditError,
    });
  };

  const handleToggle = () => {
    if (filesToUploadLength > 0) {
      const userConfirmed = confirmUserAction(
        getTrad('window.confirm.close-modal.files'),
        formatMessage
      );

      if (!userConfirmed) {
        return;
      }
    }

    const shouldPrevent = shouldPreventModalClose({
      currentStep,
      selectedFiles,
      initialSelectedFiles,
      fileToEdit,
      initialFileToEdit,
      formatMessage,
    });

    if (shouldPrevent) {
      return;
    }

    onToggle(true);
  };

  const shouldDisplayNextButton = currentStep === 'browse' && displayNextButton;
  const isFinishButtonDisabled = filesToUpload.some((file) => file.isDownloading || file.isUploading);
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
                  style={{ marginRight: 10