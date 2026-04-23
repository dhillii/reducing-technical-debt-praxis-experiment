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
      // Go to the modal list view when file uploading is over

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

  /**
   * Confirms user action with globalThis.confirm dialog
   * @param {string} messageId - Translation ID for confirmation message
   * @returns {boolean} - User confirmation result
   */
  const confirmUserAction = (messageId) => {
    return globalThis.confirm(formatMessage({ id: messageId }));
  };

  /**
   * Checks if user should be prompted when navigating from upload step
   * @returns {boolean} - Whether to show confirmation
   */
  const shouldConfirmUploadNavigation = () => {
    return !isEmpty(filesToUpload);
  };

  /**
   * Handles navigation from upload step with confirmation
   * @returns {void}
   */
  const handleUploadStepNavigation = () => {
    if (shouldConfirmUploadNavigation()) {
      const confirmed = confirmUserAction(getTrad('window.confirm.close-modal.files'));
      if (!confirmed) {
        return;
      }
    }

    goTo(backButtonDestination);
    handleClearFilesToUploadAndDownload();
  };

  /**
   * Checks if changes exist in current step
   * @returns {boolean} - Whether unsaved changes exist
   */
  const hasUnsavedChanges = () => {
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

  const goBack = (elementName = null) => {
    const hasFilesToUpload = !isEmpty(filesToUpload);

    // Redirect the user to the list modal from the upload one
    if (elementName === 'backButton' && backButtonDestination && currentStep === 'upload') {
      if (hasFilesToUpload) {
        const confirmed = confirmUserAction(getTrad('window.confirm.close-modal.files'));
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

  const goNext = () => {
    if (next === null) {
      onToggle();

      return;
    }

    goTo(next);
  };

  const goToList = () => {
    fetchMediaLib();
    goTo('list');
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

  /**
   * Extracts error message from response object
   * @param {Object} err - Error object
   * @returns {string} - Formatted error message
   */
  const extractErrorMessage = (err) => {
    return get(
      err,
      ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
      get(err, ['response', 'payload', 'message'], get(err, 'response.statusText', get(err, 'statusText', null)))
    );
  };

  /**
   * Handles file deletion error response
   * @param {Object} err - Error object
   * @returns {void}
   */
  const handleFileDeletionError = (err) => {
    console.error(err);

    const status = get(err, 'response.status', get(err, 'status', null));
    const errorMessage = extractErrorMessage(err);
    
    globalThis.strapi.notification.toggle({
      type: 'warning',
      message: errorMessage,
    });

    if (status) {
      handleSetFileToEditError(errorMessage);
    }
  };

  const handleCloseModalWarning = async () => {
    if (shouldDeleteFile) {
      const { id } = fileToEdit;

      try {
        const requestURL = getRequestUrl(`files/${id}`);

        await request(requestURL, { method: 'DELETE' });

        setShouldDeleteFile(false);

        // Remove file from selected files on delete and go back to the list.
        handleFileSelection({ target: { name: id } });
        goToList();
      } catch (err) {
        handleFileDeletionError(err);
      }
    }
  };

  /**
   * Handles file edit submission error
   * @param {Object} err - Error object
   * @param {number} status - HTTP status code
   * @returns {void}
   */
  const handleFileEditError = (err, status) => {
    let errorMessage = extractErrorMessage(err);

    // TODO fix errors globally when the back-end sends readable one
    if (status === 413) {
      errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
    }

    if (status) {
      handleSetFileToEditError(errorMessage);
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

    const headers = {};
    const formData = new FormData();

    // If the file has been cropped we need to add it to the formData
    // otherwise we just don't send it
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
      handleFileEditError(err, status);
    }
  };

  const handleToggle = () => {
    if (filesToUploadLength > 0) {
      const confirmed = confirmUserAction(getTrad('window.confirm.close-modal.files'));

      if (!confirmed) {
        return;
      }
    }

    if (hasUnsavedChanges()) {
      const confirmed = confirmUserAction(getTrad('window.confirm.close-modal.file'));

      if (!confirmed) {
        return;
      }
    }

    onToggle(true);
  };

  /**
   * Determines which delete handler to use based on current step
   * @returns {Function} - Appropriate delete handler
   */
  const getDeleteHandler = () => {
    return currentStep === 'edit' ? handleClickDeleteFile : handleClickDeleteFileToUpload;
  };

  /**
   * Determines which submit handler to use based on current step
   * @returns {Function} - Appropriate submit handler
   */
  const getSubmitHandler = () => {
    return currentStep === 'edit' ? handleSubmitEditExistingFile : handleSubmitEditNewFile;
  };

  /**
   * Determines edit modal ref based on current step
   * @returns {Object|null} - Ref object or null
   */
  const getEditModalRef = () => {
    return currentStep === 'edit' ? editModalRef : null;
  };

  const shouldDisplayNextButton = currentStep === 'browse' && displayNextButton;
  const isFinishButtonDisabled = filesToUpload.some(file => file.isDownloading || file.isUploading);
  const areButtonsDisabledOnEditExistingFile =
    currentStep === 'edit' && fileToEdit.isUploading === true;

  /**
   * Footer button renderer strategy map
   */
  const footerButtonStrategies = {
    upload: () => (
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
    ),
    'edit-new': () => (
      <Button color="success" type="button" onClick={handleSubmitEditNewFile}>
        {formatMessage({ id: 'form.button.finish' })}
      </Button>
    ),
    edit: () => (
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
    ),
    list: () => (
      <Button color="success" type="button" onClick={handleSubmit}>
        {formatMessage({ id: 'form.button.finish' })}
      </Button>
    ),
  };

  /**
   * Renders footer buttons based on current step
   * @returns {React.ReactNode} - Button elements
   */
  const renderFooterButtons = () => {
    const buttons = [];

    if (shouldDisplayNextButton) {
      buttons.push(
        <Button
          key="next"
          type="button"
          color="primary"
          onClick={handleClickNextButton}
          disabled={isEmpty(filesToDownload)}
        >
          {formatMessage({ id: getTrad('button.next') })}
        </Button>
      );
    }

    const stepButton = footerButtonStrategies[currentStep];
    if (stepButton) {
      buttons.push(
        <React.Fragment key={currentStep}>
          {stepButton()}
        </React.Fragment>
      );
    }

    return buttons;
  };

  return (
    <>
      <Modal isOpen={isOpen} onToggle={handleToggle} onClosed={handleCloseModal}>
        {/* header title */}
        <ModalHeader
          goBack={goBack}
          HeaderComponent={HeaderComponent}
          headerBreadcrumbs={headerBreadcrumbs}
          withBackButton={withBackButton}
        />
        {/* body of the modal */}
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
            onClickDeleteFileToUpload={getDeleteHandler()}
            onSubmitEdit={getSubmitHandler()}
            onClickEditNewFile={handleGoToEditNewFile}
            onGoToAddBrowseFiles={handleGoToAddBrowseFiles}
            onSubmitEditNewFile={handleSubmitEditNewFile}
            ref={getEditModalRef()}
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
            {renderFooterButtons()}
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