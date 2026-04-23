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

// Helper function to show confirmation dialog
const showConfirmDialog = (message) => {
  return globalThis.confirm(message);
};

// Helper function to extract error message from response
const extractErrorMessage = (err, fallback) => {
  const status = get(err, 'response.status', get(err, 'status', null));
  const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
  const errorMessage = get(
    err,
    ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
    get(err, ['response', 'payload', 'message'], statusText)
  );
  return { status, errorMessage: errorMessage || fallback };
};

// Helper function to handle file deletion request
const deleteFileRequest = async (fileId) => {
  const requestURL = getRequestUrl(`files/${fileId}`);
  return request(requestURL, { method: 'DELETE' });
};

// Helper function to handle file edit submission request
const submitFileEditRequest = async (shouldDuplicateMedia, fileToEdit, file, fileInfo) => {
  const { abortController, id } = fileToEdit;
  const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;
  const formData = new FormData();
  const didCropFile = file instanceof File;

  if (didCropFile) {
    formData.append('files', file);
  }

  formData.append('fileInfo', JSON.stringify(fileInfo));

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

  // Handle back navigation from upload step
  const handleBackFromUpload = () => {
    const hasFilesToUpload = !isEmpty(filesToUpload);

    if (hasFilesToUpload) {
      const confirmMessage = formatMessage({ id: getTrad('window.confirm.close-modal.files') });
      const confirm = showConfirmDialog(confirmMessage);

      if (!confirm) {
        return false;
      }
    }

    goTo(backButtonDestination);
    handleClearFilesToUploadAndDownload();
    return true;
  };

  // Handle back navigation from browse step
  const handleBackFromBrowse = () => {
    const hasFilesToUpload = !isEmpty(filesToUpload);

    if (hasFilesToUpload) {
      goTo(backButtonDestination);
      return true;
    }

    return false;
  };

  const goBack = (elementName = null) => {
    if (elementName === 'backButton' && backButtonDestination && currentStep === 'upload') {
      handleBackFromUpload();
      return;
    }

    if (
      elementName === 'backButton' &&
      backButtonDestination &&
      currentStep === 'browse'
    ) {
      handleBackFromBrowse();
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
    if (!shouldDeleteFile) {
      return;
    }

    const { id } = fileToEdit;

    try {
      await deleteFileRequest(id);
      setShouldDeleteFile(false);
      handleFileSelection({ target: { name: id } });
      goToList();
    } catch (err) {
      console.error(err);

      const { status, errorMessage } = extractErrorMessage(err, null);

      globalThis.strapi.notification.toggle({
        type: 'warning',
        message: errorMessage,
      });

      if (status) {
        handleSetFileToEditError(errorMessage);
      }
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

    const { fileInfo } = fileToEdit;

    try {
      const editedFile = await submitFileEditRequest(
        shouldDuplicateMedia,
        fileToEdit,
        file,
        fileInfo
      );

      handleEditExistingFile(editedFile);
      goToList();
    } catch (err) {
      const { status, errorMessage: baseErrorMessage } = extractErrorMessage(err, null);
      let errorMessage = baseErrorMessage;

      if (status === 413) {
        errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
      }

      if (status) {
        handleSetFileToEditError(errorMessage);
      }
    }
  };

  // Check if user has unsaved changes in list view
  const hasUnsavedChangesInList = () => {
    return currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles);
  };

  // Check if user has unsaved changes in edit view
  const hasUnsavedChangesInEdit = () => {
    return (
      (currentStep === 'edit' && initialFileToEdit && !isEqual(fileToEdit, initialFileToEdit)) ||
      (currentStep === 'edit' && selectedFiles.length > 0)
    );
  };

  const handleToggle = () => {
    const hasFilesToUpload = !isEmpty(filesToUpload);

    if (hasFilesToUpload) {
      const confirmMessage = formatMessage({ id: getTrad('window.confirm.close-modal.files') });
      const confirm = showConfirmDialog(confirmMessage);

      if (!confirm) {
        return;
      }
    }

    if (hasUnsavedChangesInList() || hasUnsavedChangesInEdit()) {
      const confirmMessage = formatMessage({ id: getTrad('window.confirm.close-modal.file') });
      const confirm = showConfirmDialog(confirmMessage);

      if (!confirm) {
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