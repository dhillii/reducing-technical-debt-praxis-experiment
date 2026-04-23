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
 * InputModalStepper component – handles the modal stepper workflow.
 */
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

  // ---------- Helper Functions ----------

  /** Show a confirmation dialog using globalThis */
  const confirmAction = (messageId) =>
    globalThis.confirm(formatMessage({ id: getTrad(messageId) }));

  /** Navigate to the list view after upload completes */
  const goToList = () => {
    fetchMediaLib();
    goTo('list');
  };

  /** Replace media action */
  const handleReplaceMedia = () => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current?.click();
  };

  /** Confirm deletion of a file */
  const handleClickDeleteFile = async () => {
    toggleModalWarning();
  };

  /** Remove a file from the upload list */
  const handleClickDeleteFileToUpload = (fileIndex) => {
    handleRemoveFileToUpload(fileIndex);
    if (currentStep === 'edit-new') {
      handleResetFileToEdit();
      goNext();
    }
  };

  /** Close modal and reset next button visibility */
  const handleCloseModal = () => {
    setDisplayNextButton(false);
    handleClose();
  };

  /** Confirm deletion and trigger warning modal */
  const handleConfirmDeleteFile = () => {
    setShouldDeleteFile(true);
    toggleModalWarning();
  };

  /** Navigate back to the browse step after cleaning errors */
  const handleGoToAddBrowseFiles = () => {
    handleCleanFilesError();
    goBack();
  };

  /** Submit handler for creating a new file */
  const handleSubmitEditNewFile = (e) => {
    e.preventDefault();
    submitEditNewFile();
    goNext();
  };

  /** Submit handler for final media selection */
  const handleSubmit = (e) => {
    e.preventDefault();
    onInputMediaChange(multiple ? selectedFiles : selectedFiles[0]);
    goNext();
  };

  /** Delete the selected file after confirmation */
  const handleCloseModalWarning = async () => {
    if (!shouldDeleteFile) return;

    const { id } = fileToEdit;
    try {
      const requestURL = getRequestUrl(`files/${id}`);
      await request(requestURL, { method: 'DELETE' });
      setShouldDeleteFile(false);
      handleFileSelection({ target: { name: id } });
      goToList();
    } catch (err) {
      console.error(err);
      const status = get(err, 'response.status', get(err, 'status', null));
      const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
      const errorMessage =
        get(
          err,
          ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
          get(err, ['response', 'payload', 'message'], statusText)
        ) || 'An error occurred';
      strapi.notification.toggle({ type: 'warning', message: errorMessage });
      if (status) handleSetFileToEditError(errorMessage);
    }
  };

  /** Submit edited existing file (including optional duplication) */
  const submitEditedExistingFile = async (shouldDuplicateMedia, file, isSubmittingAfterCrop) => {
    const { abortController, id, fileInfo } = fileToEdit;
    const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;
    const formData = new FormData();

    if (file instanceof File) formData.append('files', file);
    formData.append('fileInfo', JSON.stringify(fileInfo));

    const editedFile = await request(
      requestURL,
      { method: 'POST', headers: {}, body: formData, signal: abortController.signal },
      false,
      false
    );
    handleEditExistingFile(editedFile);
    goToList();
  };

  /** Handle submit for editing an existing file */
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

    try {
      await submitEditedExistingFile(shouldDuplicateMedia, file, isSubmittingAfterCrop);
    } catch (err) {
      const status = get(err, 'response.status', get(err, 'status', null));
      const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
      let errorMessage =
        get(
          err,
          ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
          get(err, ['response', 'payload', 'message'], statusText)
        ) || 'An error occurred';

      if (status === 413) {
        errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
      }
      if (status) handleSetFileToEditError(errorMessage);
    }
  };

  /** Determine if the next button should be displayed */
  const shouldDisplayNextButton = currentStep === 'browse' && displayNextButton;

  /** Determine if the finish button should be disabled */
  const isFinishButtonDisabled = filesToUpload.some(
    (file) => file.isDownloading || file.isUploading
  );

  /** Determine if buttons are disabled during edit existing file */
  const areButtonsDisabledOnEditExistingFile =
    currentStep === 'edit' && fileToEdit.isUploading === true;

  // ---------- Navigation Helpers ----------

  /** Navigate back based on the current step and element source */
  const goBack = (elementName = null) => {
    const hasFilesToUpload = !isEmpty(filesToUpload);

    if (elementName === 'backButton' && backButtonDestination && currentStep === 'upload') {
      if (hasFilesToUpload && !confirmAction('window.confirm.close-modal.files')) return;
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

  /** Navigate forward or close modal if at the end */
  const goNext = () => {
    if (next === null) {
      onToggle();
      return;
    }
    goTo(next);
  };

  /** Handle modal toggle with necessary confirmations */
  const handleToggle = () => {
    if (filesToUploadLength > 0 && !confirmAction('window.confirm.close-modal.files')) return;

    const isListChanged =
      currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles);
    const isEditChanged =
      currentStep === 'edit' &&
      ((initialFileToEdit && !isEqual(fileToEdit, initialFileToEdit)) ||
        selectedFiles.length > 0);

    if ((isListChanged || isEditChanged) && !confirmAction('window.confirm.close-modal.file')) {
      return;
    }

    onToggle(true);
  };

  // ---------- Effects ----------

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

  // ---------- Render ----------

  const addFilesToUploadList = ({ target: { value } }) => {
    addFilesToUpload({ target: { value } });
    goNext();
  };

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