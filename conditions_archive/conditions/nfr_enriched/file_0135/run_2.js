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
 * @param {Function} params.onFileSelection - Callback to update file selection
 * @param {Function} params.onGoToList - Callback to navigate to list
 * @param {Function} params.onSetError - Callback to set error state
 * @returns {Promise<void>}
 */
const deleteFileRequest = async ({
  fileId,
  onFileSelection,
  onGoToList,
  onSetError,
}) => {
  try {
    const requestURL = getRequestUrl(`files/${fileId}`);
    await request(requestURL, { method: 'DELETE' });
    onFileSelection({ target: { name: fileId } });
    onGoToList();
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
      onSetError(errorMessage);
    }
  }
};

/**
 * Handles file edit submission with optional duplication and cropping
 * @param {Object} params - Parameters object
 * @param {Object} params.fileToEdit - File being edited
 * @param {File} params.file - File object (may be cropped)
 * @param {boolean} params.shouldDuplicateMedia - Whether to duplicate the file
 * @param {boolean} params.isSubmittingAfterCrop - Whether submission follows crop
 * @param {Function} params.onEditSuccess - Callback on successful edit
 * @param {Function} params.onGoToList - Callback to navigate to list
 * @param {Function} params.onSetError - Callback to set error state
 * @param {Function} params.onEmitEvent - Event emission callback
 * @param {Function} params.formatMessage - Message formatter function
 * @returns {Promise<void>}
 */
const submitFileEdit = async ({
  fileToEdit,
  file,
  shouldDuplicateMedia,
  isSubmittingAfterCrop,
  onEditSuccess,
  onGoToList,
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

    onEditSuccess(editedFile);
    onGoToList();
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
 * Determines if modal close confirmation is needed
 * @param {Object} params - Parameters object
 * @param {string} params.currentStep - Current modal step
 * @param {Array} params.selectedFiles - Currently selected files
 * @param {Array} params.initialSelectedFiles - Initial selected files
 * @param {Object} params.fileToEdit - File being edited
 * @param {Object} params.initialFileToEdit - Initial file to edit
 * @returns {boolean} - Whether confirmation is needed
 */
const shouldConfirmModalClose = ({
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
 * Determines if back navigation requires confirmation
 * @param {Object} params - Parameters object
 * @param {string} params.elementName - Name of triggering element
 * @param {string} params.currentStep - Current modal step
 * @param {string} params.backButtonDestination - Back button destination
 * @param {Array} params.filesToUpload - Files queued for upload
 * @returns {boolean} - Whether confirmation is needed
 */
const shouldConfirmBackNavigation = ({
  elementName,
  currentStep,
  backButtonDestination,
  filesToUpload,
}) => {
  const hasFilesToUpload = !isEmpty(filesToUpload);

  if (
    elementName === 'backButton' &&
    backButtonDestination &&
    currentStep === 'upload' &&
    hasFilesToUpload
  ) {
    return true;
  }

  return false;
};

/**
 * Determines if back navigation should redirect to destination
 * @param {Object} params - Parameters object
 * @param {string} params.elementName - Name of triggering element
 * @param {string} params.currentStep - Current modal step
 * @param {string} params.backButtonDestination - Back button destination
 * @param {Array} params.filesToUpload - Files queued for upload
 * @returns {boolean} - Whether to redirect to destination
 */
const shouldRedirectOnBack = ({
  elementName,
  currentStep,
  backButtonDestination,
  filesToUpload,
}) => {
  const hasFilesToUpload = !isEmpty(filesToUpload);

  if (
    elementName === 'backButton' &&
    backButtonDestination &&
    (currentStep === 'upload' || (currentStep === 'browse' && hasFilesToUpload))
  ) {
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
    if (
      shouldConfirmBackNavigation({
        elementName,
        currentStep,
        backButtonDestination,
        filesToUpload,
      })
    ) {
      const confirmed = getUserConfirmation(
        getTrad('window.confirm.close-modal.files'),
        formatMessage
      );

      if (!confirmed) {
        return;
      }
    }

    if (
      shouldRedirectOnBack({
        elementName,
        currentStep,
        backButtonDestination,
        filesToUpload,
      })
    ) {
      goTo(backButtonDestination);

      if (currentStep === 'upload') {
        handleClearFilesToUploadAndDownload();
      }

      return;
    }

    goTo(prev);
  };

  const handleClickDeleteFile = async () => {
    toggleModalWarning();
  };

  const handleClickDeleteFileToUpload = fileIndex => {
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

  const handleSubmitEditNewFile = e => {
    e.preventDefault();
    submitEditNewFile();
    goNext();
  };

  const handleSubmit = e => {
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
        onGoToList: goToList,
        onSetError: handleSetFileToEditError,
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
      shouldDuplicateMedia,
      isSubmittingAfterCrop,
      onEditSuccess: handleEditExistingFile,
      onGoToList: goToList,
      onSetError: handleSetFileToEditError,
      onEmitEvent: emitEvent,
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
      shouldConfirmModalClose({
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
        onClosed={handleCloseModalWarning}
        isOpen={isWarningDeleteOpen}
        toggleModal={toggleModalWarning}
        popUpWarningType="danger"
        onConfirm={handleConfirmDeleteFile}
      />
    </>
  );
};

InputModalStepper.defaultProps = {
  allowedActions: {
    canCopyLink: true,
    canCreate: true,
    canDownload: true,
    canMain: true,
    canRead: true,
    canSettings: true,
    canUpdate: true,
  },
  noNavigation: false,
  onToggle: () => {},
};

InputModalStepper.propTypes = {
  allowedActions: PropTypes.shape({
    canCopyLink: PropTypes.bool,
    canCreate: PropTypes.bool,
    canDownload: PropTypes.bool,
    canMain: PropTypes.bool,
    canRead: PropTypes.bool,
    canSettings: PropTypes.bool,
    canUpdate: PropTypes.bool,
  }),
  isOpen: PropTypes.bool.isRequired,
  noNavigation: PropTypes.bool,
  onInputMediaChange: PropTypes.func.isRequired,
  onToggle: PropTypes.func,
};

export default memo(InputModalStepper);
```