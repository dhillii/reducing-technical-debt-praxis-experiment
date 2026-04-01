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
 * @param {string} statusText - HTTP status text fallback
 * @returns {string} Error message
 */
const extractErrorMessage = (err, statusText) => {
  return get(
    err,
    ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
    get(err, ['response', 'payload', 'message'], statusText)
  );
};

/**
 * Gets HTTP status from error response
 * @param {Object} err - Error object
 * @returns {number|null} HTTP status code
 */
const getErrorStatus = (err) => {
  return get(err, 'response.status', get(err, 'status', null));
};

/**
 * Gets HTTP status text from error response
 * @param {Object} err - Error object
 * @returns {string|null} HTTP status text
 */
const getErrorStatusText = (err) => {
  return get(err, 'response.statusText', get(err, 'statusText', null));
};

/**
 * Handles file download errors by dispatching error state
 * @param {Function} dispatch - Reducer dispatch function
 * @param {Object} file - File object with originalIndex and tempId
 */
const handleDownloadError = (dispatch, file) => {
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
 * @param {Blob} data - Downloaded file blob
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
 * Handles file upload errors by dispatching error state
 * @param {Function} dispatch - Reducer dispatch function
 * @param {number} originalIndex - File index
 * @param {string} errorMessage - Error message
 */
const handleUploadError = (dispatch, originalIndex, errorMessage) => {
  dispatch({
    type: 'SET_FILE_ERROR',
    fileIndex: originalIndex,
    errorMessage,
  });
};

/**
 * Handles file edit errors by dispatching error state
 * @param {Function} dispatch - Reducer dispatch function
 * @param {string} errorMessage - Error message
 */
const handleEditError = (dispatch, errorMessage) => {
  dispatch({
    type: 'SET_FILE_TO_EDIT_ERROR',
    errorMessage,
  });
};

/**
 * Determines if file was cropped
 * @param {File|Object} file - File object
 * @returns {boolean} True if file is a File instance
 */
const isFileCropped = (file) => file instanceof File;

/**
 * Determines if cancel source exists for file
 * @param {Object} fileToCancel - File object
 * @returns {boolean} True if source exists
 */
const hasCancelSource = (fileToCancel) => !!fileToCancel.source;

/**
 * Cancels file download using axios source
 * @param {Object} source - Axios cancel source
 */
const cancelDownload = (source) => {
  source.cancel('Operation canceled by the user.');
};

/**
 * Cancels file upload using abort controller
 * @param {Object} abortController - AbortController instance
 */
const cancelUpload = (abortController) => {
  abortController.abort();
};

/**
 * Determines if file name matches original name
 * @param {string} originalName - Original file name
 * @param {Object} fileInfo - File info object
 * @returns {boolean} True if names match
 */
const isNameUnchanged = (originalName, fileInfo) => originalName === fileInfo.name;

/**
 * Determines if should display next button
 * @param {string} currentStep - Current step
 * @param {boolean} displayNextButton - Display flag
 * @returns {boolean} True if should display
 */
const shouldShowNextButton = (currentStep, displayNextButton) => {
  return currentStep === 'browse' && displayNextButton;
};

/**
 * Determines if finish button should be disabled
 * @param {Array} filesToUpload - Files to upload
 * @returns {boolean} True if should disable
 */
const isFinishDisabled = (filesToUpload) => {
  return filesToUpload.some(file => file.isDownloading || file.isUploading);
};

/**
 * Determines if edit buttons should be disabled
 * @param {string} currentStep - Current step
 * @param {Object} fileToEdit - File being edited
 * @returns {boolean} True if should disable
 */
const areEditButtonsDisabled = (currentStep, fileToEdit) => {
  return currentStep === 'edit' && fileToEdit.isUploading === true;
};

/**
 * Determines if delete button should be shown
 * @param {string} currentStep - Current step
 * @returns {boolean} True if should show
 */
const shouldShowDeleteButton = (currentStep) => currentStep === 'edit';

/**
 * Determines if upload button should be shown
 * @param {string} currentStep - Current step
 * @returns {boolean} True if should show
 */
const shouldShowUploadButton = (currentStep) => currentStep === 'upload';

/**
 * Determines if edit new finish button should be shown
 * @param {string} currentStep - Current step
 * @returns {boolean} True if should show
 */
const shouldShowEditNewFinish = (currentStep) => currentStep === 'edit-new';

/**
 * Determines if edit existing buttons should be shown
 * @param {string} currentStep - Current step
 * @returns {boolean} True if should show
 */
const shouldShowEditExistingButtons = (currentStep) => currentStep === 'edit';

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
              console.error('fetch file error', err);
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

    if (hasCancelSource(fileToCancel)) {
      cancelDownload(fileToCancel.source);
    } else {
      cancelUpload(fileToCancel.abortController);
    }

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

    const didCropFile = isFileCropped(file);
    const { abortController, id, fileInfo } = fileToEdit;
    const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;

    if (didCropFile) {
      formData.append('files', file);
    }

    formData.append('fileInfo', JSON.stringify(fileInfo));

    try {
      await request(
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
      toggleRef.current(true);
    } catch (err) {
      console.error(err);
      const status = getErrorStatus(err);