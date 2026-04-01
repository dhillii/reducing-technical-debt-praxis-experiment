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
 * Extracts error message from response with fallback to status text
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
 */
const getErrorStatus = (err) => {
  return get(err, 'response.status', get(err, 'status', null));
};

/**
 * Gets HTTP status text from error response
 */
const getErrorStatusText = (err) => {
  return get(err, 'response.statusText', get(err, 'statusText', null));
};

/**
 * Handles file download errors by dispatching error state
 */
const handleFileDownloadError = (dispatch, file) => {
  dispatch({
    type: 'SET_FILE_TO_DOWNLOAD_ERROR',
    originalIndex: file.originalIndex,
    fileTempId: file.tempId,
  });
};

/**
 * Handles successful file download by creating File object and dispatching
 */
const handleFileDownloadSuccess = (dispatch, file, data) => {
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
 * Downloads a single file via axios
 */
const downloadSingleFile = (dispatch, file) => {
  const { source } = file;

  return axios
    .get(file.fileURL, {
      responseType: 'blob',
      cancelToken: source.token,
      timeout: 60000,
    })
    .then(({ data }) => {
      handleFileDownloadSuccess(dispatch, file, data);
    })
    .catch((err) => {
      console.error('fetch file error', err);
      handleFileDownloadError(dispatch, file);
    });
};

/**
 * Handles file upload error by extracting message and dispatching error state
 */
const handleUploadError = (dispatch, err, originalIndex, formatMessage) => {
  const status = getErrorStatus(err);
  const statusText = getErrorStatusText(err);
  let errorMessage = extractErrorMessage(err, statusText);

  if (status === 413) {
    errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
  }

  if (status) {
    dispatch({
      type: 'SET_FILE_ERROR',
      fileIndex: originalIndex,
      errorMessage,
    });
  }
};

/**
 * Handles file edit error by extracting message and dispatching error state
 */
const handleEditError = (dispatch, err, formatMessage) => {
  const status = getErrorStatus(err);
  const statusText = getErrorStatusText(err);
  let errorMessage = extractErrorMessage(err, statusText);

  if (status === 413) {
    errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
  }

  if (status) {
    dispatch({
      type: 'SET_FILE_TO_EDIT_ERROR',
      errorMessage,
    });
  }
};

/**
 * Handles delete file error by showing notification
 */
const handleDeleteError = (err) => {
  const errorMessage = get(err, 'response.payload.message', 'An error occured');

  strapi.notification.toggle({
    type: 'warning',
    message: errorMessage,
  });
};

/**
 * Prepares form data for file upload
 */
const prepareUploadFormData = (file, fileInfo, originalName) => {
  const formData = new FormData();

  if (originalName === fileInfo.name) {
    set(fileInfo, 'name', null);
  }

  formData.append('files', file);
  formData.append('fileInfo', JSON.stringify(fileInfo));

  return formData;
};

/**
 * Prepares form data for file edit
 */
const prepareEditFormData = (file, fileInfo, didCropFile) => {
  const formData = new FormData();

  if (didCropFile) {
    formData.append('files', file);
  }

  formData.append('fileInfo', JSON.stringify(fileInfo));

  return formData;
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

    const downloadPromises = files.map(file => downloadSingleFile(dispatch, file));

    try {
      await Promise.all(downloadPromises);
    } catch (err) {
      // Error handling is done in individual download handlers
    }
  };

  const handleAbortUpload = () => {
    const { abortController } = fileToEdit;

    abortController.abort();

    dispatch({
      type: 'ON_ABORT_UPLOAD',
    });
  };

  const handleCancelFileToUpload = (fileOriginalIndex) => {
    const fileToCancel = filesToUpload.find(file => file.originalIndex === fileOriginalIndex);
    const { source } = fileToCancel;

    if (source) {
      source.cancel('Operation canceled by the user.');
    } else {
      fileToCancel.abortController.abort();
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
      handleDeleteError(err);
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

  const handleClickDeleteFileToUpload = (fileIndex) => {
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

  const handleGoToEditNewFile = (fileIndex) => {
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

  const handleSetCropResult = (blob) => {
    emitEvent('didCropFile', { duplicatedFile: null, location: 'upload' });

    dispatch({
      type: 'SET_CROP_RESULT',
      blob,
    });
  };

  const handleSubmitEditNewFile = (e) => {
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
    const didCropFile = file instanceof File;
    const { abortController, id, fileInfo } = fileToEdit;
    const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;
    const formData = prepareEditFormData(file, fileInfo, didCropFile);

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
      handleEditError(dispatch, err, formatMessage);
    }
  };

  const handleReplaceMedia = () => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current.click();
  };

  const handleToggle = () => {
    if (filesToUploadLength > 0) {
      // eslint-disable-next-line no-alert
      const confirm = window.confirm(
        formatMessage({ id: getTrad('window.confirm.close-modal.files') })
      );

      if (!confirm) {
        return;
      }
    }

    if (!isEqual(initialFileToEdit, fileToEdit) && currentStep === 'edit') {
      // eslint-disable-next-line no-alert
      const confirm = window.confirm(
        formatMessage({ id: getTrad('window.confirm.close-modal.file') })
      );

      if (!confirm) {
        return;
      }
    }

    onToggle(shouldRefetch);
  };

  const handleUploadFiles = async () => {
    dispatch({
      type: 'SET_FILES_UPLOADING_STATE',
    });

    const requests = filesToUpload.map(
      async ({ file, fileInfo, originalName, originalIndex, abortController }) => {
        const formData = prepareUploadFormData(file, fileInfo, originalName);
        const headers = {};

        try {
          await request(
            `/${pluginId}`,
            {
              method: 'POST',
              headers,
              body: formData,
              signal: abortController.signal,
            },
            false,
            false
          );

          setShouldRefetch(true);

          dispatch({
            type: 'REMOVE_FILE_TO_UPLOAD',
            fileIndex: originalIndex,
          });
        } catch (err) {
          console.error(err);
          handleUploadError(dispatch, err, originalIndex, formatMessage);
        }
      }
    );

    await Promise.all(requests);
  };

  const goBack = () => {
    goTo(prev);
  };

  const goNext = () => {
    if (next === null) {
      onToggle();

      return;
    }

    goTo(next);
  };

  const goTo = (to) => {
    dispatch({
      type: 'GO_TO',
      to,
    });
  };

  const toggleModalWarning = () => {