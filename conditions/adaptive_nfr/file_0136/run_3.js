```javascript
import React, { useCallback, useEffect, useState, useReducer, useRef } from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';
import { isEqual, isEmpty, get, set } from 'lodash';
import { Modal, ModalFooter, PopUpWarning, useGlobalContext, request } from 'strapi-helper-plugin';
import { Button } from '@buffetjs/core';
import pluginId from '../../pluginId';
import { getFilesToDownload, getTrad, getYupError, urlSchema } from '../../utils';
import { useAppContext } from '../../hooks';
import ModalHeader from '../../components/ModalHeader';
import stepper from './stepper';
import init from './init';
import reducer, { initialState } from './reducer';

/**
 * Extracts error message from response with fallback chain
 * @param {Object} err - Error object
 * @param {number} status - HTTP status code
 * @param {Function} formatMessage - Message formatter function
 * @returns {string} Formatted error message
 */
const extractErrorMessage = (err, status, formatMessage) => {
  if (status === 413) {
    return formatMessage({ id: 'app.utils.errors.file-too-big.message' });
  }

  return get(
    err,
    ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
    get(err, ['response', 'payload', 'message'], get(err, 'response.statusText', get(err, 'statusText', null)))
  );
};

/**
 * Extracts HTTP status from error object
 * @param {Object} err - Error object
 * @returns {number|null} HTTP status code
 */
const getErrorStatus = (err) => {
  return get(err, 'response.status', get(err, 'status', null));
};

/**
 * Handles file download errors by dispatching error state
 * @param {Function} dispatch - Reducer dispatch function
 * @param {Object} file - File object with originalIndex and tempId
 */
const handleDownloadError = (dispatch, file) => {
  console.error('fetch file error');
  dispatch({
    type: 'SET_FILE_TO_DOWNLOAD_ERROR',
    originalIndex: file.originalIndex,
    fileTempId: file.tempId,
  });
};

/**
 * Handles successful file download
 * @param {Function} dispatch - Reducer dispatch function
 * @param {Object} file - File object
 * @param {Blob} data - Downloaded file data
 */
const handleDownloadSuccess = (dispatch, file, data) => {
  const fileName = file.fileInfo.name;
  const createdFile = new File([data], fileName, {
    type: data.type,
  });

  dispatch({
    type: 'FILE_DOWNLOADED',
    blob: createdFile,
    originalIndex: file.originalIndex,
    fileTempId: file.tempId,
  });
};

/**
 * Determines if file should be cancelled via axios source
 * @param {Object} fileToCancel - File object to check
 * @returns {boolean} True if file has axios source
 */
const hasAxiosSource = (fileToCancel) => {
  return !!fileToCancel.source;
};

/**
 * Cancels file download/upload operation
 * @param {Object} fileToCancel - File object to cancel
 */
const cancelFileOperation = (fileToCancel) => {
  if (hasAxiosSource(fileToCancel)) {
    fileToCancel.source.cancel('Operation canceled by the user.');
  } else {
    fileToCancel.abortController.abort();
  }
};

/**
 * Determines if user should confirm modal closure
 * @param {number} filesToUploadLength - Number of files to upload
 * @param {boolean} hasFileChanges - Whether file was edited
 * @returns {boolean} True if confirmation is needed
 */
const shouldConfirmModalClosure = (filesToUploadLength, hasFileChanges) => {
  return filesToUploadLength > 0 || hasFileChanges;
};

/**
 * Gets confirmation message key based on closure reason
 * @param {number} filesToUploadLength - Number of files to upload
 * @returns {string} Translation key for confirmation message
 */
const getConfirmationMessageKey = (filesToUploadLength) => {
  return filesToUploadLength > 0
    ? 'window.confirm.close-modal.files'
    : 'window.confirm.close-modal.file';
};

/**
 * Handles upload request error and dispatches appropriate action
 * @param {Object} err - Error object
 * @param {number} originalIndex - File index
 * @param {Function} dispatch - Reducer dispatch function
 * @param {Function} formatMessage - Message formatter function
 */
const handleUploadError = (err, originalIndex, dispatch, formatMessage) => {
  console.error(err);
  const status = getErrorStatus(err);

  if (status) {
    const errorMessage = extractErrorMessage(err, status, formatMessage);
    dispatch({
      type: 'SET_FILE_ERROR',
      fileIndex: originalIndex,
      errorMessage,
    });
  }
};

/**
 * Handles edit existing file request error
 * @param {Object} err - Error object
 * @param {Function} dispatch - Reducer dispatch function
 * @param {Function} formatMessage - Message formatter function
 */
const handleEditFileError = (err, dispatch, formatMessage) => {
  console.error(err);
  const status = getErrorStatus(err);

  if (status) {
    const errorMessage = extractErrorMessage(err, status, formatMessage);
    dispatch({
      type: 'SET_FILE_TO_EDIT_ERROR',
      errorMessage,
    });
  }
};

/**
 * Determines if file was cropped (is a File instance)
 * @param {*} file - File to check
 * @returns {boolean} True if file is a File instance
 */
const isFileCropped = (file) => {
  return file instanceof File;
};

/**
 * Builds form data for file upload
 * @param {File} file - File to upload
 * @param {Object} fileInfo - File metadata
 * @param {boolean} didCropFile - Whether file was cropped
 * @returns {FormData} Prepared form data
 */
const buildFileFormData = (file, fileInfo, didCropFile) => {
  const formData = new FormData();

  if (didCropFile) {
    formData.append('files', file);
  }

  formData.append('fileInfo', JSON.stringify(fileInfo));
  return formData;
};

/**
 * Determines request URL for file submission
 * @param {boolean} shouldDuplicateMedia - Whether to duplicate media
 * @param {string} id - File ID
 * @returns {string} Request URL
 */
const getFileSubmissionUrl = (shouldDuplicateMedia, id) => {
  return shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;
};

/**
 * Determines if file name should be cleared in metadata
 * @param {string} originalName - Original file name
 * @param {string} currentName - Current file name in metadata
 * @returns {boolean} True if name should be cleared
 */
const shouldClearFileName = (originalName, currentName) => {
  return originalName === currentName;
};

/**
 * Determines if next button should be displayed
 * @param {string} currentStep - Current step in stepper
 * @param {boolean} displayNextButton - Display flag
 * @returns {boolean} True if button should be shown
 */
const shouldShowNextButton = (currentStep, displayNextButton) => {
  return currentStep === 'browse' && displayNextButton;
};

/**
 * Determines if finish button should be disabled
 * @param {Array} filesToUpload - Files to upload
 * @returns {boolean} True if button should be disabled
 */
const isFinishButtonDisabled = (filesToUpload) => {
  return filesToUpload.some(file => file.isDownloading || file.isUploading);
};

/**
 * Determines if edit buttons should be disabled
 * @param {string} currentStep - Current step
 * @param {Object} fileToEdit - File being edited
 * @returns {boolean} True if buttons should be disabled
 */
const areEditButtonsDisabled = (currentStep, fileToEdit) => {
  return currentStep === 'edit' && fileToEdit.isUploading === true;
};

/**
 * Renders footer buttons based on current step
 * @param {Object} config - Configuration object
 * @returns {React.ReactNode} Footer button elements
 */
const renderFooterButtons = ({
  currentStep,
  filesToUploadLength,
  shouldDisplayNextButton,
  isFinishButtonDisabled: isFinishDisabled,
  areButtonsDisabledOnEditExistingFile,
  isFormDisabled,
  filesToDownload,
  formatMessage,
  onClickNextButton,
  onUploadFiles,
  onSubmitEditNewFile,
  onReplaceMedia,
  onSubmitEditExistingFile,
}) => {
  const buttonConfigs = {
    browse: shouldDisplayNextButton ? {
      type: 'next',
      render: () => (
        <Button
          type="button"
          color="primary"
          onClick={onClickNextButton}
          disabled={isEmpty(filesToDownload)}
        >
          {formatMessage({ id: getTrad('button.next') })}
        </Button>
      ),
    } : null,
    upload: {
      type: 'upload',
      render: () => (
        <Button
          type="button"
          color="success"
          onClick={onUploadFiles}
          disabled={isFinishDisabled}
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
    },
    'edit-new': {
      type: 'finish',
      render: () => (
        <Button color="success" type="button" onClick={onSubmitEditNewFile}>
          {formatMessage({ id: 'form.button.finish' })}
        </Button>
      ),
    },
    edit: {
      type: 'edit',
      render: () => (
        <div style={{ margin: 'auto 0' }}>
          <Button
            disabled={isFormDisabled || areButtonsDisabledOnEditExistingFile}
            color="primary"
            onClick={onReplaceMedia}
            style={{ marginRight: 10 }}
          >
            {formatMessage({ id: getTrad('control-card.replace-media') })}
          </Button>

          <Button
            disabled={isFormDisabled || areButtonsDisabledOnEditExistingFile}
            color="success"
            type="button"
            onClick={onSubmitEditExistingFile}
          >
            {formatMessage({ id: 'form.button.finish' })}
          </Button>
        </div>
      ),
    },
  };

  const config = buttonConfigs[currentStep];
  return config ? config.render() : null;
};

const ModalStepper = ({
  initialFileToEdit,
  initialStep,
  isOpen,
  onClosed,
  onRemoveFileFromDataToDelete,
  onToggle,
}) => {
  const { allowedActions } = useAppContext();
  const { emitEvent, formatMessage } = useGlobalContext();
  const [isWarningDeleteOpen, setIsWarningDeleteOpen] = useState(false);
  const [showModalConfirmButtonLoading, setShowModalConfirmButtonLoading] = useState(false);
  const [isFormDisabled, setIsFormDisabled] = useState(false);
  const [formErrors, setFormErrors] = useState(null);
  const [shouldRefetch, setShouldRefetch] = useState(false);
  const [displayNextButton, setDisplayNextButton] = useState(false);
  const [reducerState, dispatch] = useReducer(reducer, initialState, init);
  const { currentStep, fileToEdit, filesToDownload, filesToUpload } = reducerState.toJS();
  const { Component, components, headerBreadcrumbs, next, prev, withBackButton } = stepper[
    currentStep
  ];
  const filesToUploadLength = filesToUpload.length;
  const toggleRef = useRef(onToggle);
  const editModalRef = useRef();
  const downloadFilesRef = useRef();

  useEffect(() => {
    if (currentStep === 'upload') {
      if (filesToUploadLength === 0) {
        toggleRef.current(true);
      } else {
        downloadFilesRef.current();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesToUploadLength, currentStep]);

  useEffect(() => {
    if (isOpen) {
      goTo(initialStep);

      if (initialFileToEdit) {
        dispatch({
          type: 'INIT_FILE_TO_EDIT',
          fileToEdit: initialFileToEdit,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const addFilesToUpload = ({ target: { value } }) => {
    emitEvent('didSelectFile', { source: 'computer', location: 'upload' });

    dispatch({
      type: 'ADD_FILES_TO_UPLOAD',
      filesToUpload: value,
    });

    goTo(next);
  };

  downloadFilesRef.current = async () => {
    const files = getFilesToDownload(filesToUpload);

    if (files.length > 0) {
      emitEvent('didSelectFile', { source: 'url', location: 'upload' });
    }

    try {
      await Promise.all(
        files.map(file => {
          const { source } = file;

          return axios
            .get(file.fileURL, {
              responseType: 'blob',
              cancelToken: source.token,
              timeout: 60000,
            })
            .then(({ data }) => {
              handleDownloadSuccess(dispatch, file, data);
            })
            .catch(() => {
              handleDownloadError(dispatch, file);
            });
        })
      );
    } catch (err) {
      // Silent catch for Promise.all wrapper
    }
  };

  const handleAbortUpload = () => {
    const { abortController } = fileToEdit;

    abortController.abort();

    dispatch({
      type: 'ON_ABORT_UPLOAD',
    });
  };

  const handleCancelFileToUpload = fileOriginalIndex => {
    const fileToCancel = filesToUpload.find(file => file.originalIndex === fileOriginalIndex);

    cancelFileOperation(fileToCancel);

    dispatch({
      type: 'REMOVE_FILE_TO_UPLOAD',
      fileIndex: fileOriginalIndex,
    });
  };

  const handleChange = ({ target: { name, value } }) => {
    let val = value;
    let type = 'ON_CHANGE';

    if (name === 'url') {
      setFormErrors(null);

      val = value.split('\n');
      type = 'ON_CHANGE_URLS_TO_DOWNLOAD';
    }

    dispatch({
      type,
      keys: name,
      value: val,
    });
  };

  const handleConfirmDeleteFile = useCallback(async () => {
    const { id } = fileToEdit;
    onRemoveFileFromDataToDelete(id);

    setShowModalConfirmButtonLoading(true);

    try {
      await request(`/${pluginId}/files/${id}`, {
        method: 'DELETE',
      });

      setShouldRefetch(true);
    } catch (