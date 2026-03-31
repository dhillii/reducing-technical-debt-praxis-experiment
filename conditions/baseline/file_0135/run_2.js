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

  // ============ Navigation Handlers ============
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
      if (hasFilesToUpload && !confirmAction('window.confirm.close-modal.files')) {
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

  const handleReplaceMedia = useCallback(() => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current?.click();
  }, [emitEvent]);

  // ============ File Deletion Handlers ============
  const extractErrorMessage = (err) => {
    const status = get(err, 'response.status', get(err, 'status', null));
    const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
    const errorMessage = get(
      err,
      ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
      get(err, ['response', 'payload', 'message'], statusText)
    );
    return { status, errorMessage };
  };

  const handleDeleteFileError = (err) => {
    console.error(err);
    const { status, errorMessage } = extractErrorMessage(err);
    
    strapi.notification.toggle({
      type: 'warning',
      message: errorMessage,
    });

    if (status) {
      handleSetFileToEditError(errorMessage);
    }
  };

  const handleClickDeleteFile = useCallback(() => {
    toggleModalWarning();
  }, [toggleModalWarning]);

  const handleClickDeleteFileToUpload = useCallback((fileIndex) => {
    handleRemoveFileToUpload(fileIndex);
    if (currentStep === 'edit-new') {
      handleResetFileToEdit();
      goNext();
    }
  }, [currentStep, handleRemoveFileToUpload, handleResetFileToEdit, goNext]);

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

  // ============ Form Submission Handlers ============
  const confirmAction = useCallback((tradKey) => {
    const confirm = window.confirm(formatMessage({ id: getTrad(tradKey) }));
    return confirm;
  }, [formatMessage]);

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
      const { status, errorMessage: baseErrorMessage } = extractErrorMessage(err);
      let errorMessage = baseErrorMessage;

      if (status === 413) {
        errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
      }

      if (status) {
        handleSetFileToEditError(errorMessage);
      }
    }
  }, [submitEditExistingFile, emitEvent, fileToEdit, handleEditExistingFile, goToList, formatMessage, handleSetFileToEditError]);

  // ============ Modal Toggle Handler ============
  const handleToggle = useCallback(() => {
    if (filesToUploadLength > 0 && !confirmAction('window.confirm.close-modal.files')) {
      return;
    }

    const hasListChanges = currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles);
    const hasEditChanges = currentStep === 'edit' && initialFileToEdit && !isEqual(fileToEdit, initialFileToEdit);
    const hasSelectedFiles = currentStep === 'edit' && selectedFiles.length > 0;

    if ((hasListChanges || hasEditChanges || hasSelectedFiles) && !confirmAction('window.confirm.close-modal.file')) {
      return;
    }

    onToggle(true);
  }, [filesToUploadLength, currentStep, selectedFiles, initialSelectedFiles, fileToEdit, initialFileToEdit, onToggle, confirmAction]);

  const handleCloseModal = useCallback(() => {
    setDisplayNextButton(false);
    handleClose();
  }, [handleClose]);

  const handleGoToAddBrowseFiles = useCallback(() => {
    handleCleanFilesError();
    goBack();
  }, [handleCleanFilesError, goBack]);

  // ============ Effects ============
  useEffect(() => {
    if (currentStep === 'upload') {
      if (filesToUploadLength === 0) {
        goToList();
      } else {
        downloadFiles();
      }
    }
  }, [filesToUploadLength, currentStep, goToList, downloadFiles]);

  // ============ Computed Values ============
  const shouldDisplayNextButton = currentStep === 'browse' && displayNextButton;
  const isFinishButtonDisabled = filesToUpload.some(file => file.isDownloading || file.isUploading);
  const areButtonsDisabledOnEditExistingFile = currentStep === 'edit' && fileToEdit.isUploading === true;

  // ============ Render ============
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
          <ModalFooterContent
            currentStep={currentStep}
            filesToUploadLength={filesToUploadLength}
            isFinishButtonDisabled={isFinishButtonDisabled}
            shouldDisplayNextButton={shouldDisplayNextButton}
            isFormDisabled={isFormDisabled}
            areButtonsDisabledOnEditExistingFile={areButtonsDisabledOnEditExistingFile}
            filesToDownload={filesToDownload}
            formatMessage={formatMessage}
            handleToggle={handleToggle}
            handleUploadFiles={handleUploadFiles}
            handleClickNextButton={handleClickNextButton}
            handleSubmitEditNewFile={handleSubmitEditNewFile}
            handleReplaceMedia={handleReplaceMedia}
            handleSubmitEditExistingFile={handleSubmitEditExistingFile}
            handleSubmit={handleSubmit}
          />
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

// ============ Footer Component ============
const ModalFooterContent = memo(({
  currentStep,
  filesToUploadLength,
  isFinishButtonDisabled,
  shouldDisplayNextButton,
  isFormDisabled,
  areButtonsDisabledOnEditExistingFile,
  filesToDownload,
  formatMessage,
  handleToggle,
  handleUploadFiles,
  handleClickNextButton,
  handleSubmitEditNewFile,
  handleReplaceMedia,
  handleSubmitEditExistingFile,
  handleSubmit,
}) => (
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
              `modal.upload-list.footer.button.${filesToUploadLength > 1 ? 'plural' : 'singular'}`
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
          onClick={handleSubmitEditExistingFile