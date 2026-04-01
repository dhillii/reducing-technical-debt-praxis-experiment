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
 * Determines if user should be warned about unsaved changes
 * @param {string} currentStep - Current modal step
 * @param {Array} selectedFiles - Currently selected files
 * @param {Array} initialSelectedFiles - Initial selected files
 * @param {Object} fileToEdit - File being edited
 * @param {Object} initialFileToEdit - Initial file to edit
 * @returns {boolean} Whether warning should be shown
 */
const shouldWarnAboutChanges = (
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
 * Determines if user should be warned about pending uploads
 * @param {number} filesToUploadLength - Number of files pending upload
 * @returns {boolean} Whether warning should be shown
 */
const shouldWarnAboutPendingUploads = (filesToUploadLength) => {
  return filesToUploadLength > 0;
};

/**
 * Determines if back button should trigger special handling
 * @param {string} elementName - Element identifier
 * @param {string} backButtonDestination - Back button destination
 * @param {string} currentStep - Current modal step
 * @returns {boolean} Whether special back handling applies
 */
const isSpecialBackNavigation = (elementName, backButtonDestination, currentStep) => {
  return elementName === 'backButton' && backButtonDestination && currentStep === 'upload';
};

/**
 * Determines if browse step back navigation applies
 * @param {string} elementName - Element identifier
 * @param {string} backButtonDestination - Back button destination
 * @param {string} currentStep - Current modal step
 * @param {boolean} hasFilesToUpload - Whether files are pending upload
 * @returns {boolean} Whether browse back handling applies
 */
const isBrowseBackNavigation = (
  elementName,
  backButtonDestination,
  currentStep,
  hasFilesToUpload
) => {
  return (
    elementName === 'backButton' &&
    backButtonDestination &&
    currentStep === 'browse' &&
    hasFilesToUpload
  );
};

/**
 * Extracts error message from response
 * @param {Object} err - Error object
 * @returns {string} Formatted error message
 */
const extractErrorMessage = (err) => {
  return get(
    err,
    ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
    get(err, ['response', 'payload', 'message'], get(err, 'response.statusText', get(err, 'statusText', null)))
  );
};

/**
 * Gets HTTP status from error
 * @param {Object} err - Error object
 * @returns {number|null} HTTP status code
 */
const getErrorStatus = (err) => {
  return get(err, 'response.status', get(err, 'status', null));
};

/**
 * Footer button renderer strategy map
 */
const footerButtonStrategies = {
  /**
   * Renders upload step buttons
   */
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

  /**
   * Renders browse step next button
   */
  browseNext: (props) => {
    const { handleClickNextButton, filesToDownload, formatMessage, getTrad } = props;
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
   * Renders edit-new step finish button
   */
  editNewFinish: (props) => {
    const { handleSubmitEditNewFile, formatMessage } = props;
    return (
      <Button color="success" type="button" onClick={handleSubmitEditNewFile}>
        {formatMessage({ id: 'form.button.finish' })}
      </Button>
    );
  },

  /**
   * Renders edit step buttons
   */
  editButtons: (props) => {
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

  /**
   * Renders list step finish button
   */
  listFinish: (props) => {
    const { handleSubmit, formatMessage } = props;
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
const renderFooterButtons = (currentStep, shouldDisplayNextButton, props) => {
  const buttons = [];

  if (currentStep === 'upload') {
    buttons.push(
      <React.Fragment key="upload">
        {footerButtonStrategies.upload(props)}
      </React.Fragment>
    );
  }

  if (shouldDisplayNextButton) {
    buttons.push(
      <React.Fragment key="browseNext">
        {footerButtonStrategies.browseNext(props)}
      </React.Fragment>
    );
  }

  if (currentStep === 'edit-new') {
    buttons.push(
      <React.Fragment key="editNewFinish">
        {footerButtonStrategies.editNewFinish(props)}
      </React.Fragment>
    );
  }

  if (currentStep === 'edit') {
    buttons.push(
      <React.Fragment key="editButtons">
        {footerButtonStrategies.editButtons(props)}
      </React.Fragment>
    );
  }

  if (currentStep === 'list') {
    buttons.push(
      <React.Fragment key="listFinish">
        {footerButtonStrategies.listFinish(props)}
      </React.Fragment>
    );
  }

  return buttons;
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

    if (isSpecialBackNavigation(elementName, backButtonDestination, currentStep)) {
      if (hasFilesToUpload) {
        const confirm = confirmAction(
          getTrad('window.confirm.close-modal.files'),
          formatMessage
        );

        if (!confirm) {
          return;
        }
      }

      goTo(backButtonDestination);
      handleClearFilesToUploadAndDownload();
      return;
    }

    if (isBrowseBackNavigation(elementName, backButtonDestination, currentStep, hasFilesToUpload)) {
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
        console.error(err);

        const status = getErrorStatus(err);
        const errorMessage = extractErrorMessage(err);
        
        globalThis.strapi.notification.toggle({
          type: 'warning',
          message: errorMessage,
        });

        if (status) {
          handleSetFileToEditError(errorMessage);
        }
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
      const status = getErrorStatus(err);
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
    if (shouldWarnAboutPendingUploads(filesToUploadLength)) {
      const confirm = confirmAction(
        getTrad('window.confirm.close-modal.files'),
        formatMessage
      );

      if (!confirm) {
        return;
      }
    }

    if (
      shouldWarnAboutChanges(
        currentStep,
        selectedFiles,
        initialSelectedFiles,