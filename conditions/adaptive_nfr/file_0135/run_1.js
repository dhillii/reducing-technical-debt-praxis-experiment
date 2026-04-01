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
 * @param {string} currentStep - Current modal step
 * @returns {boolean} Whether to show confirmation
 */
const shouldConfirmUploadExit = (hasFilesToUpload, elementName, currentStep) => {
  return elementName === 'backButton' && currentStep === 'upload' && hasFilesToUpload;
};

/**
 * Determines if user should be prompted when leaving browse step
 * @param {boolean} hasFilesToUpload - Whether files are queued for upload
 * @param {string} elementName - Name of triggering element
 * @param {string} currentStep - Current modal step
 * @returns {boolean} Whether to show confirmation
 */
const shouldConfirmBrowseExit = (hasFilesToUpload, elementName, currentStep) => {
  return (
    elementName === 'backButton' &&
    currentStep === 'browse' &&
    hasFilesToUpload
  );
};

/**
 * Determines if user should be prompted about unsaved changes
 * @param {string} currentStep - Current modal step
 * @param {Array} selectedFiles - Currently selected files
 * @param {Array} initialSelectedFiles - Initial selected files
 * @param {Object} fileToEdit - File being edited
 * @param {Object} initialFileToEdit - Initial file to edit
 * @returns {boolean} Whether to show confirmation
 */
const hasUnsavedChanges = (
  currentStep,
  selectedFiles,
  initialSelectedFiles,
  fileToEdit,
  initialFileToEdit
) => {
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
 * Extracts error message from response or error object
 * @param {Object} err - Error object
 * @returns {string} Extracted error message
 */
const extractErrorMessage = (err) => {
  const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
  return get(
    err,
    ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
    get(err, ['response', 'payload', 'message'], statusText)
  );
};

/**
 * Handles file deletion error response
 * @param {Object} err - Error object
 * @param {Function} handleSetFileToEditError - Error handler
 */
const handleDeleteFileError = (err, handleSetFileToEditError) => {
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
 * Handles file edit submission error response
 * @param {Object} err - Error object
 * @param {number} status - HTTP status code
 * @param {Function} formatMessage - Message formatter
 * @param {Function} handleSetFileToEditError - Error handler
 */
const handleEditFileError = (err, status, formatMessage, handleSetFileToEditError) => {
  let errorMessage = extractErrorMessage(err);

  if (status === 413) {
    errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
  }

  if (status) {
    handleSetFileToEditError(errorMessage);
  }
};

/**
 * Footer button renderer strategy map
 */
const footerButtonStrategies = {
  upload: (props) => {
    const { filesToUploadLength, handleUploadFiles, isFinishButtonDisabled, formatMessage, getTrad } = props;
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
  'edit-new': (props) => {
    const { handleSubmitEditNewFile, formatMessage } = props;
    return (
      <Button color="success" type="button" onClick={handleSubmitEditNewFile}>
        {formatMessage({ id: 'form.button.finish' })}
      </Button>
    );
  },
  edit: (props) => {
    const {
      isFormDisabled,
      areButtonsDisabledOnEditExistingFile,
      handleReplaceMedia,
      handleSubmitEditExistingFile,
      formatMessage,
      getTrad,
    } = props;
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
  list: (props) => {
    const { handleSubmit, formatMessage } = props;
    return (
      <Button color="success" type="button" onClick={handleSubmit}>
        {formatMessage({ id: 'form.button.finish' })}
      </Button>
    );
  },
};

/**
 * Renders footer button based on current step
 * @param {string} currentStep - Current modal step
 * @param {Object} props - Button rendering props
 * @returns {React.ReactNode} Rendered button or null
 */
const renderFooterButton = (currentStep, props) => {
  const strategy = footerButtonStrategies[currentStep];
  return strategy ? strategy(props) : null;
};

/**
 * Component prop dispatcher based on current step
 */
const componentPropStrategies = {
  edit: {
    onClickDeleteFileToUpload: 'handleClickDeleteFile',
    onSubmitEdit: 'handleSubmitEditExistingFile',
    ref: 'editModalRef',
  },
  default: {
    onClickDeleteFileToUpload: 'handleClickDeleteFileToUpload',
    onSubmitEdit: 'handleSubmitEditNewFile',
    ref: null,
  },
};

/**
 * Gets component props based on current step
 * @param {string} currentStep - Current modal step
 * @param {Object} handlers - Handler functions map
 * @returns {Object} Component props
 */
const getComponentProps = (currentStep, handlers) => {
  const strategy = currentStep === 'edit' ? componentPropStrategies.edit : componentPropStrategies.default;
  return {
    onClickDeleteFileToUpload: handlers[strategy.onClickDeleteFileToUpload],
    onSubmitEdit: handlers[strategy.onSubmitEdit],
    ref: strategy.ref ? handlers[strategy.ref] : null,
  };
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

    if (elementName === 'backButton' && backButtonDestination && currentStep === 'upload') {
      if (hasFilesToUpload) {
        const confirm = confirmAction(getTrad('window.confirm.close-modal.files'), formatMessage);
        if (!confirm) {
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
      shouldConfirmBrowseExit(hasFilesToUpload, elementName, currentStep)
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
        handleDeleteFileError(err, handleSetFileToEditError);
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
      handleEditFileError(err, status, formatMessage, handleSetFileToEditError);
    }
  };

  const handleToggle = () => {
    if (filesToUploadLength > 0) {
      const confirm = confirmAction(getTrad('window.confirm.close-modal.files'), formatMessage);
      if (!confirm) {
        return;
      }
    }

    if (
      hasUnsavedChanges(
        currentStep,
        selectedFiles,
        initialSelectedFiles,
        fileToEdit,
        initialFileToEdit
      )
    ) {
      const confirm = confirmAction(getTrad('window.confirm.close-modal.file'), formatMessage);
      if (!confirm) {
        return;
      }
    }

    onToggle(true);
  };

  const