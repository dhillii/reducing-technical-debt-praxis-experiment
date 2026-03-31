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

  // ============ Effects ============
  useEffect(() => {
    if (currentStep === 'upload' && filesToUploadLength === 0) {
      goToList();
    } else if (currentStep === 'upload') {
      downloadFiles();
    }
  }, [filesToUploadLength, currentStep, goToList, downloadFiles]);

  // ============ Navigation Helpers ============
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
      if (hasFilesToUpload && !confirmClose('files')) {
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
  }, [filesToUpload, backButtonDestination, currentStep, goTo, handleClearFilesToUploadAndDownload, prev]);

  // ============ File Upload Handlers ============
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

  // ============ File Deletion Handlers ============
  const handleClickDeleteFile = useCallback(() => {
    toggleModalWarning();
  }, [toggleModalWarning]);

  const handleConfirmDeleteFile = useCallback(() => {
    setShouldDeleteFile(true);
    toggleModalWarning();
  }, [toggleModalWarning]);

  const handleCloseModalWarning = useCallback(async () => {
    if (!shouldDeleteFile) return;

    const { id } = fileToEdit;
    try {
      const requestURL = getRequestUrl(`files/${id}`);
      await request(requestURL, { method: 'DELETE' });
      setShouldDeleteFile(false);
      handleFileSelection({ target: { name: id } });
      goToList();
    } catch (err) {
      handleDeleteFileError(err);
    }
  }, [shouldDeleteFile, fileToEdit, handleFileSelection, goToList]);

  const handleDeleteFileError = (err) => {
    console.error(err);
    const status = get(err, 'response.status', get(err, 'status', null));
    const errorMessage = extractErrorMessage(err);
    
    strapi.notification.toggle({
      type: 'warning',
      message: errorMessage,
    });

    if (status) {
      handleSetFileToEditError(errorMessage);
    }
  };

  // ============ Form Submission Handlers ============
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

    try {
      const editedFile = await submitEditExistingFileRequest(
        shouldDuplicateMedia,
        file,
        fileToEdit
      );
      handleEditExistingFile(editedFile);
      goToList();
    } catch (err) {
      handleEditFileError(err);
    }
  }, [submitEditExistingFile, emitEvent, fileToEdit, handleEditExistingFile, goToList]);

  // ============ Modal Toggle Handler ============
  const handleToggle = useCallback(() => {
    if (filesToUploadLength > 0 && !confirmClose('files')) {
      return;
    }

    if (shouldConfirmUnsavedChanges()) {
      if (!confirmClose('file')) {
        return;
      }
    }

    onToggle(true);
  }, [filesToUploadLength, currentStep, selectedFiles, initialSelectedFiles, fileToEdit, initialFileToEdit, onToggle]);

  const handleCloseModal = useCallback(() => {
    setDisplayNextButton(false);
    handleClose();
  }, [handleClose]);

  const handleGoToAddBrowseFiles = useCallback(() => {
    handleCleanFilesError();
    goBack();
  }, [handleCleanFilesError, goBack]);

  const handleReplaceMedia = useCallback(() => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current?.click();
  }, [emitEvent]);

  // ============ Utility Functions ============
  const confirmClose = (type) => {
    const messageId = getTrad(`window.confirm.close-modal.${type}`);
    return window.confirm(formatMessage({ id: messageId }));
  };

  const shouldConfirmUnsavedChanges = () => {
    return (
      (currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles)) ||
      (currentStep === 'edit' && initialFileToEdit && !isEqual(fileToEdit, initialFileToEdit)) ||
      (currentStep === 'edit' && selectedFiles.length > 0)
    );
  };

  const extractErrorMessage = (err) => {
    return get(
      err,
      ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
      get(err, ['response', 'payload', 'message'], get(err, 'response.statusText', get(err, 'statusText', null)))
    );
  };

  const submitEditExistingFileRequest = async (shouldDuplicateMedia, file, fileToEditData) => {
    const formData = new FormData();
    const didCropFile = file instanceof File;
    const { abortController, id, fileInfo } = fileToEditData;
    const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;

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

  const handleEditFileError = (err) => {
    const status = get(err, 'response.status', get(err, 'status', null));
    let errorMessage = extractErrorMessage(err);

    if (status === 413) {
      errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
    }

    if (status) {
      handleSetFileToEditError(errorMessage);
    }
  };

  // ============ Computed Values ============
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
    canUpdate: