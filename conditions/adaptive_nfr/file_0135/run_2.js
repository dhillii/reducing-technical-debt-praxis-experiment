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
 * Confirms user action with a dialog
 * @param {string} messageId - Translation ID for confirmation message
 * @param {Function} formatMessage - Message formatter function
 * @returns {boolean} User confirmation result
 */
const confirmAction = (messageId, formatMessage) => {
  return globalThis.confirm(formatMessage({ id: messageId }));
};

/**
 * Determines if user should be prompted when leaving upload step
 * @param {boolean} hasFilesToUpload - Whether files are queued for upload
 * @param {string} elementName - Name of triggering element
 * @param {string} backButtonDestination - Destination for back navigation
 * @param {string} currentStep - Current modal step
 * @returns {boolean} Whether confirmation is needed
 */
const shouldConfirmUploadStepExit = (
  hasFilesToUpload,
  elementName,
  backButtonDestination,
  currentStep
) => {
  return (
    elementName === 'backButton' &&
    backButtonDestination &&
    currentStep === 'upload' &&
    hasFilesToUpload
  );
};

/**
 * Determines if navigation should proceed to back button destination
 * @param {string} elementName - Name of triggering element
 * @param {string} backButtonDestination - Destination for back navigation
 * @param {string} currentStep - Current modal step
 * @param {boolean} hasFilesToUpload - Whether files are queued for upload
 * @returns {boolean} Whether to navigate to back destination
 */
const shouldNavigateToBackDestination = (
  elementName,
  backButtonDestination,
  currentStep,
  hasFilesToUpload
) => {
  return (
    (elementName === 'backButton' &&
      backButtonDestination &&
      currentStep === 'upload') ||
    (elementName === 'backButton' &&
      backButtonDestination &&
      currentStep === 'browse' &&
      hasFilesToUpload)
  );
};

/**
 * Determines if user should be prompted when closing modal with unsaved changes
 * @param {string} currentStep - Current modal step
 * @param {Array} selectedFiles - Currently selected files
 * @param {Array} initialSelectedFiles - Initial selected files
 * @param {Object} fileToEdit - File being edited
 * @param {Object} initialFileToEdit - Initial file being edited
 * @returns {boolean} Whether confirmation is needed
 */
const shouldConfirmUnsavedChanges = (
  currentStep,
  selectedFiles,
  initialSelectedFiles,
  fileToEdit,
  initialFileToEdit
) => {
  return (
    (currentStep === 'list' && !isEqual(selectedFiles, initialSelectedFiles)) ||
    (currentStep === 'edit' && initialFileToEdit && !isEqual(fileToEdit, initialFileToEdit)) ||
    (currentStep === 'edit' && selectedFiles.length > 0)
  );
};

/**
 * Extracts error message from response or error object
 * @param {Object} err - Error object
 * @returns {string} Extracted error message
 */
const extractErrorMessage = (err) => {
  const status = get(err, 'response.status', get(err, 'status', null));
  const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
  return get(
    err,
    ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
    get(err, ['response', 'payload', 'message'], statusText)
  );
};

/**
 * Handles file deletion error notification
 * @param {Object} err - Error object
 * @param {Function} handleSetFileToEditError - Error handler
 */
const handleFileDeletionError = (err, handleSetFileToEditError) => {
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

/**
 * Footer button renderer strategy map
 */
const footerButtonStrategies = {
  /**
   * Renders upload step buttons
   */
  upload: (currentStep, filesToUploadLength, isFinishButtonDisabled, handleUploadFiles, formatMessage, getTrad) => {
    if (currentStep !== 'upload') return null;
    return (
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
    );
  },

  /**
   * Renders browse step next button
   */
  browseNext: (shouldDisplayNextButton, filesToDownload, handleClickNextButton, formatMessage, getTrad) => {
    if (!shouldDisplayNextButton) return null;
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
  },

  /**
   * Renders edit-new step buttons
   */
  editNew: (currentStep, handleSubmitEditNewFile, formatMessage) => {
    if (currentStep !== 'edit-new') return null;
    return (
      <Button color="success" type="button" onClick={handleSubmitEditNewFile}>
        {formatMessage({ id: 'form.button.finish' })}
      </Button>
    );
  },

  /**
   * Renders edit step buttons
   */
  edit: (currentStep, isFormDisabled, areButtonsDisabledOnEditExistingFile, handleReplaceMedia, handleSubmitEditExistingFile, formatMessage, getTrad) => {
    if (currentStep !== 'edit') return null;
    return (
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
    );
  },

  /**
   * Renders list step buttons
   */
  list: (currentStep, handleSubmit, formatMessage) => {
    if (currentStep !== 'list') return null;
    return (
      <Button color="success" type="button" onClick={handleSubmit}>
        {formatMessage({ id: 'form.button.finish' })}
      </Button>
    );
  },
};

/**
 * Renders footer buttons based on current step
 */
const renderFooterButtons = (
  currentStep,
  filesToUploadLength,
  isFinishButtonDisabled,
  shouldDisplayNextButton,
  filesToDownload,
  isFormDisabled,
  areButtonsDisabledOnEditExistingFile,
  handleUploadFiles,
  handleClickNextButton,
  handleSubmitEditNewFile,
  handleReplaceMedia,
  handleSubmitEditExistingFile,
  handleSubmit,
  formatMessage,
  getTrad
) => {
  return [
    footerButtonStrategies.upload(
      currentStep,
      filesToUploadLength,
      isFinishButtonDisabled,
      handleUploadFiles,
      formatMessage,
      getTrad
    ),
    footerButtonStrategies.browseNext(
      shouldDisplayNextButton,
      filesToDownload,
      handleClickNextButton,
      formatMessage,
      getTrad
    ),
    footerButtonStrategies.editNew(
      currentStep,
      handleSubmitEditNewFile,
      formatMessage
    ),
    footerButtonStrategies.edit(
      currentStep,
      isFormDisabled,
      areButtonsDisabledOnEditExistingFile,
      handleReplaceMedia,
      handleSubmitEditExistingFile,
      formatMessage,
      getTrad
    ),
    footerButtonStrategies.list(
      currentStep,
      handleSubmit,
      formatMessage
    ),
  ].filter(Boolean);
};

/**
 * Component prop dispatcher based on current step
 */
const componentPropStrategies = {
  /**
   * Determines delete file handler based on step
   */
  getDeleteHandler: (currentStep, handleClickDeleteFile, handleClickDeleteFileToUpload) => {
    return currentStep === 'edit' ? handleClickDeleteFile : handleClickDeleteFileToUpload;
  },

  /**
   * Determines submit handler based on step
   */
  getSubmitHandler: (currentStep, handleSubmitEditExistingFile, handleSubmitEditNewFile) => {
    return currentStep === 'edit' ? handleSubmitEditExistingFile : handleSubmitEditNewFile;
  },

  /**
   * Determines edit modal ref based on step
   */
  getEditModalRef: (currentStep, editModalRef) => {
    return currentStep === 'edit' ? editModalRef : null;
  },
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

  const goBack = (elementName = null) => {
    const hasFilesToUpload = !isEmpty(filesToUpload);

    if (shouldConfirmUploadStepExit(hasFilesToUpload, elementName, backButtonDestination, currentStep)) {
      const confirmed = confirmAction(
        getTrad('window.confirm.close-modal.files'),
        formatMessage
      );

      if (!confirmed) {
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

  const handleCloseModalWarning = async () => {
    if (shouldDeleteFile) {
      const { id } = fileToEdit;

      try {
        const requestURL = getRequestUrl(`files/${id}`);
        await request(requestURL, { method: 'DELETE' });
        setShouldDeleteFile(false);

        handleFileSelection({ target: { name: id } });
        goToList();
      } catch (err) {
        handleFileDeletionError(err, handleSetFileToEditError);
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
      let errorMessage = extractErrorMessage(err);

      if (status === 413) {
        errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
      }

      if (status) {
        handleSetFileToEditError(errorMessage);
      }
    }
  };

  const handleToggle = () => {
    if (filesToUploadLength > 0) {
      const confirmed = confirmAction(
        getTrad('window.confirm.close-modal.files'),
        formatMessage
      );

      if (!confirmed) {
        return;
      }
    }

    if (shouldConfirmUnsavedChanges(
      currentStep,
      selectedFiles,
      initialSelectedFiles,
      fileToEdit,
      initialFileToEdit
    )) {
      const confirmed = confirmAction(
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

  const footerButtons = renderFooterButtons(
    currentStep,
    filesToUploadLength,
    isFinishButtonDisabled,
    shouldDisplayNextButton,
    filesToDownload,
    isFormDisabled,
    areButtonsDisabledOnEditExistingFile,
    handleUploadFiles,
    handleClickNextButton,
    handleSubmitEditNewFile,
    handleReplaceMedia,
    handleSubmitEditExistingFile,
    handleSubmit,
    formatMessage,
    getTrad
  );

  const deleteHandler = componentPropStrategies.getDeleteHandler(
    currentStep,
    handleClickDeleteFile,
    handleClickDeleteFileToUpload
  );

  const submitHandler = componentPropStrategies.getSubmitHandler(
    currentStep,
    handleSubmitEditExistingFile,
    handleSubmitEditNewFile
  );

  const editRef = componentPropStrategies.getEditModalRef(currentStep, editModalRef);

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
            onClickDeleteFileToUpload={deleteHandler}
            onSubmitEdit={submitHandler}
            onClickEditNewFile={handleGoToEditNewFile}
            onGoToAddBrowseFiles={handleGoToAddBrowseFiles}
            onSubmitEditNewFile={handleSubmitEditNewFile}
            ref={editRef}
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
            {footerButtons}
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