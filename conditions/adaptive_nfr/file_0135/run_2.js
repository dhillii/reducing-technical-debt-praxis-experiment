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
   * Checks if user should be prompted when navigating from browse step
   * @returns {boolean} - Whether to show confirmation
   */
  const shouldConfirmBrowseNavigation = () => {
    return !isEmpty(filesToUpload);
  };

  /**
   * Handles navigation from browse step
   * @returns {void}
   */
  const handleBrowseStepNavigation = () => {
    if (shouldConfirmBrowseNavigation()) {
      goTo(backButtonDestination);
      return;
    }

    goTo(prev);
  };

  /**
   * Determines if current step is upload with back button destination
   * @returns {boolean}
   */
  const isUploadStepWithBackButton = () => {
    return currentStep === 'upload' && backButtonDestination;
  };

  /**
   * Determines if current step is browse with back button destination
   * @returns {boolean}
   */
  const isBrowseStepWithBackButton = () => {
    return currentStep === 'browse' && backButtonDestination;
  };

  const goBack = (elementName = null) => {
    if (elementName !== 'backButton') {
      goTo(prev);
      return;
    }

    if (isUploadStepWithBackButton()) {
      handleUploadStepNavigation();
      return;
    }

    if (isBrowseStepWithBackButton()) {
      handleBrowseStepNavigation();
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
   * Extracts error message from response with fallback chain
   * @param {Error} err - Error object
   * @returns {string} - Extracted error message
   */
  const extractErrorMessage = (err) => {
    return get(
      err,
      ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
      get(err, ['response', 'payload', 'message'], get(err, 'response.statusText', get(err, 'statusText', null)))
    );
  };

  /**
   * Extracts HTTP status from error response
   * @param {Error} err - Error object
   * @returns {number|null} - HTTP status code
   */
  const extractErrorStatus = (err) => {
    return get(err, 'response.status', get(err, 'status', null));
  };

  /**
   * Handles file deletion error notification
   * @param {Error} err - Error object
   * @returns {void}
   */
  const handleFileDeletionError = (err) => {
    console.error(err);

    const status = extractErrorStatus(err);
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
   * Determines if file was cropped by checking if it's a File instance
   * @param {File|null} file - File object to check
   * @returns {boolean}
   */
  const didCropFile = (file) => {
    return file instanceof File;
  };

  /**
   * Builds request URL for file submission
   * @param {boolean} shouldDuplicateMedia - Whether to duplicate media
   * @param {string} id - File ID
   * @returns {string} - Request URL
   */
  const buildFileSubmissionUrl = (shouldDuplicateMedia, id) => {
    return shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;
  };

  /**
   * Handles file submission error with status-specific logic
   * @param {Error} err - Error object
   * @param {number|null} status - HTTP status code
   * @returns {string} - Error message to display
   */
  const handleFileSubmissionError = (err, status) => {
    let errorMessage = extractErrorMessage(err);

    // TODO fix errors globally when the back-end sends readable one
    if (status === 413) {
      errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
    }

    if (status) {
      handleSetFileToEditError(errorMessage);
    }

    return errorMessage;
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
    const hasCroppedFile = didCropFile(file);
    const { abortController, id, fileInfo } = fileToEdit;
    const requestURL = buildFileSubmissionUrl(shouldDuplicateMedia, id);

    if (hasCroppedFile) {
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
      const status = extractErrorStatus(err);
      handleFileSubmissionError(err, status);
    }
  };

  /**
   * Checks if user has unsaved files to upload
   * @returns {boolean}
   */
  const hasUnsavedFilesToUpload = () => {
    return filesToUploadLength > 0;
  };

  /**
   * Checks if user has unsaved changes in list step
   * @returns {boolean}
   */
  const hasUnsavedListChanges = () => {
    return currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles);
  };

  /**
   * Checks if user has unsaved changes in edit step
   * @returns {boolean}
   */
  const hasUnsavedEditChanges = () => {
    return (
      (currentStep === 'edit' && initialFileToEdit && !isEqual(fileToEdit, initialFileToEdit)) ||
      (currentStep === 'edit' && selectedFiles.length > 0)
    );
  };

  const handleToggle = () => {
    if (hasUnsavedFilesToUpload()) {
      const confirmed = confirmUserAction(getTrad('window.confirm.close-modal.files'));

      if (!confirmed) {
        return;
      }
    }

    if (hasUnsavedListChanges() || hasUnsavedEditChanges()) {
      const confirmed = confirmUserAction(getTrad('window.confirm.close-modal.file'));

      if (!confirmed) {
        return;
      }
    }

    onToggle(true);
  };

  /**
   * Footer button renderer strategy map
   */
  const footerButtonStrategies = {
    upload: () => (
      <Button
        type="button"
        color="success"
        onClick={handleUploadFiles}
        disabled={filesToUpload.some(file => file.isDownloading || file.isUploading)}
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
    edit: () => {
      const isDisabled = isFormDisabled || (currentStep === 'edit' && fileToEdit.isUploading === true);
      return (
        <div style={{ margin: 'auto 0' }}>
          <Button
            disabled={isDisabled}
            color="primary"
            onClick={handleReplaceMedia}
            style={{ marginRight: 10 }}
          >
            {formatMessage({ id: getTrad('control-card.replace-media') })}
          </Button>

          <Button
            disabled={isDisabled}
            color="success"
            type="button"
            onClick={handleSubmitEditExistingFile}
          >
            {formatMessage({ id: 'form.button.finish' })}
          </Button>
        </div>
      );
    },
    list: () => (
      <Button color="success" type="button" onClick={handleSubmit}>
        {formatMessage({ id: 'form.button.finish' })}
      </Button>
    ),
  };

  /**
   * Renders footer buttons based on current step
   * @returns {React.ReactNode|null}
   */
  const renderFooterButtons = () => {
    const strategy = footerButtonStrategies[currentStep];
    if (strategy) {
      return strategy();
    }

    if (currentStep === 'browse' && displayNextButton) {
      return (
        <Button
          type="button"
          color="primary"
          onClick={handleClickNextButton}
          disabled={isEmpty(filesToDownload)}
        >
          {formatMessage({ id: getTrad('button.next') })}
        </Button>
      );
    }

    return null;
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