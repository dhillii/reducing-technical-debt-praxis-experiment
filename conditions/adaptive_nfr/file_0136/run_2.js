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
const extractErrorStatus = (err) => {
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
 * Determines if file has abort source (axios) vs abort controller (fetch)
 * @param {Object} fileToCancel - File object to check
 * @returns {boolean} True if file uses axios source
 */
const hasAxiosSource = (fileToCancel) => {
  return !!fileToCancel.source;
};

/**
 * Cancels file download/upload based on its source type
 * @param {Object} fileToCancel - File object to cancel
 */
const cancelFileTransfer = (fileToCancel) => {
  if (hasAxiosSource(fileToCancel)) {
    fileToCancel.source.cancel('Operation canceled by the user.');
  } else {
    fileToCancel.abortController.abort();
  }
};

/**
 * Determines if form should show next button
 * @param {string} currentStep - Current step in stepper
 * @param {boolean} displayNextButton - Display flag
 * @returns {boolean} True if next button should display
 */
const shouldShowNextButton = (currentStep, displayNextButton) => {
  return currentStep === 'browse' && displayNextButton;
};

/**
 * Determines if finish button should be disabled
 * @param {Array} filesToUpload - Files pending upload
 * @returns {boolean} True if button should be disabled
 */
const isFinishButtonDisabled = (filesToUpload) => {
  return filesToUpload.some(file => file.isDownloading || file.isUploading);
};

/**
 * Determines if edit buttons should be disabled
 * @param {string} currentStep - Current step in stepper
 * @param {Object} fileToEdit - File being edited
 * @returns {boolean} True if buttons should be disabled
 */
const areEditButtonsDisabled = (currentStep, fileToEdit) => {
  return currentStep === 'edit' && fileToEdit.isUploading === true;
};

/**
 * Determines if user should confirm modal close
 * @param {number} filesToUploadLength - Number of files to upload
 * @param {boolean} hasFileChanges - Whether file was modified
 * @param {string} currentStep - Current step in stepper
 * @returns {boolean} True if confirmation is needed
 */
const shouldConfirmClose = (filesToUploadLength, hasFileChanges, currentStep) => {
  return filesToUploadLength > 0 || (hasFileChanges && currentStep === 'edit');
};

/**
 * Gets confirmation message key based on close reason
 * @param {number} filesToUploadLength - Number of files to upload
 * @returns {string} Translation key for confirmation message
 */
const getCloseConfirmationKey = (filesToUploadLength) => {
  return filesToUploadLength > 0
    ? 'window.confirm.close-modal.files'
    : 'window.confirm.close-modal.file';
};

/**
 * Handles step-specific button rendering logic
 * @param {string} currentStep - Current step in stepper
 * @returns {Object} Button configuration for current step
 */
const getStepButtonConfig = (currentStep) => {
  const stepConfigs = {
    upload: { type: 'upload' },
    'edit-new': { type: 'finish' },
    edit: { type: 'edit' },
  };

  return stepConfigs[currentStep] || null;
};

/**
 * Determines if file was cropped (is File instance vs string)
 * @param {File|string} file - File to check
 * @returns {boolean} True if file is a File instance
 */
const wasFileCropped = (file) => {
  return file instanceof File;
};

/**
 * Builds request URL for file submission
 * @param {boolean} shouldDuplicateMedia - Whether to duplicate media
 * @param {string} fileId - File ID for update
 * @returns {string} Request URL
 */
const buildFileRequestUrl = (shouldDuplicateMedia, fileId) => {
  return shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${fileId}`;
};

/**
 * Handles file upload error dispatch
 * @param {Function} dispatch - Reducer dispatch function
 * @param {number} status - HTTP status code
 * @param {string} errorMessage - Error message
 * @param {number} fileIndex - File index
 * @param {string} dispatchType - Dispatch action type
 */
const dispatchFileError = (dispatch, status, errorMessage, fileIndex, dispatchType) => {
  if (status) {
    dispatch({
      type: dispatchType,
      fileIndex,
      errorMessage,
    });
  }
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
            .catch(err => {
              handleDownloadError(dispatch, file);
            });
        })
      );
    } catch (err) {
      // Silent catch - download process completed with individual error handling
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

    cancelFileTransfer(fileToCancel);

    dispatch({
      type: 'REMOVE_FILE_TO_UPLOAD',
      fileIndex: fileOriginalIndex,
    });
  };

  const handleChange = ({ target: { name, value } }) => {
    const isUrlField = name === 'url';
    const val = isUrlField ? value.split('\n') : value;
    const type = isUrlField ? 'ON_CHANGE_URLS_TO_DOWNLOAD' : 'ON_CHANGE';

    if (isUrlField) {
      setFormErrors(null);
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
    } catch (err) {
      const errorMessage = get(err, 'response.payload.message', 'An error occured');

      strapi.notification.toggle({
        type: 'warning',
        message: errorMessage,
      });
    } finally {
      setShowModalConfirmButtonLoading(false);
      toggleModalWarning();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileToEdit]);

  const handleClickNextButton = async () => {
    try {
      await urlSchema.validate(
        { filesToDownload: filesToDownload.filter(url => !isEmpty(url)) },
        { abortEarly: false }
      );

      setFormErrors(null);
      dispatch({
        type: 'ADD_URLS_TO_FILES_TO_UPLOAD',
        nextStep: next,
      });
    } catch (err) {
      const formattedErrors = getYupError(err);

      setFormErrors(formattedErrors.filesToDownload);
    }
  };

  const handleClickDeleteFile = async () => {
    toggleModalWarning();
  };

  const handleClickDeleteFileToUpload = fileIndex => {
    dispatch({
      type: 'REMOVE_FILE_TO_UPLOAD',
      fileIndex,
    });

    if (currentStep === 'edit-new') {
      dispatch({
        type: 'RESET_FILE_TO_EDIT',
      });

      goNext();
    }
  };

  const handleClose = () => {
    onClosed();
    setIsFormDisabled(false);
    setDisplayNextButton(false);
    setFormErrors(null);
    setShouldRefetch(false);

    dispatch({
      type: 'RESET_PROPS',
    });
  };

  const handleCloseModalWarning = async () => {
    setShowModalConfirmButtonLoading(false);

    onToggle(shouldRefetch);
  };

  const handleGoToEditNewFile = fileIndex => {
    dispatch({
      type: 'SET_FILE_TO_EDIT',
      fileIndex,
    });

    goTo('edit-new');
  };

  const handleGoToAddBrowseFiles = () => {
    dispatch({
      type: 'CLEAN_FILES_ERROR',
    });

    goBack();
  };

  const handleSetCropResult = blob => {
    emitEvent('didCropFile', { duplicatedFile: null, location: 'upload' });

    dispatch({
      type: 'SET_CROP_RESULT',
      blob,
    });
  };

  const handleSubmitEditNewFile = e => {
    e.preventDefault();

    dispatch({
      type: 'ON_SUBMIT_EDIT_NEW_FILE',
    });

    goNext();
  };

  const handleSubmitEditExistingFile = async (
    e,
    shouldDuplicateMedia = false,
    file = fileToEdit.file,
    isSubmittingAfterCrop = false
  ) => {
    e.preventDefault();

    if (isSubmittingAfterCrop) {
      emitEvent('didCropFile', { duplicatedFile: shouldDuplicateMedia, location: 'upload' });
    }

    dispatch({
      type: 'ON_SUBMIT_EDIT_EXISTING_FILE',
    });

    const headers = {};
    const formData = new FormData();

    const didCropFile = wasFileCropped(file);
    const { abortController, id, fileInfo } = fileToEdit;
    const requestURL = buildFileRequestUrl(shouldDuplicateMedia, id);

    if (didCropFile) {
      formData.append('files', file);
    }

    formData.append('fileInfo', JSON.stringify(fileInfo));

    try {