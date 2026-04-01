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
 * @param {string} statusText - Status text fallback
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
 * Gets HTTP status from error object
 * @param {Object} err - Error object
 * @returns {number|null} Status code
 */
const getErrorStatus = (err) => {
  return get(err, 'response.status', get(err, 'status', null));
};

/**
 * Gets HTTP status text from error object
 * @param {Object} err - Error object
 * @returns {string|null} Status text
 */
const getErrorStatusText = (err) => {
  return get(err, 'response.statusText', get(err, 'statusText', null));
};

/**
 * Determines if file was cropped (is a File instance)
 * @param {*} file - File to check
 * @returns {boolean} True if file is a File instance
 */
const isFileCropped = (file) => file instanceof File;

/**
 * Handles file download errors by dispatching error action
 * @param {Object} file - File object with originalIndex and tempId
 * @param {Function} dispatch - Dispatch function
 */
const handleFileDownloadError = (file, dispatch) => {
  console.error('fetch file error', file);
  dispatch({
    type: 'SET_FILE_TO_DOWNLOAD_ERROR',
    originalIndex: file.originalIndex,
    fileTempId: file.tempId,
  });
};

/**
 * Handles successful file download
 * @param {Object} file - File object
 * @param {Blob} data - Downloaded blob data
 * @param {Function} dispatch - Dispatch function
 */
const handleFileDownloadSuccess = (file, data, dispatch) => {
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
 * Cancels file upload by source or abort controller
 * @param {Object} fileToCancel - File to cancel
 */
const cancelFileUpload = (fileToCancel) => {
  if (fileToCancel.source) {
    fileToCancel.source.cancel('Operation canceled by the user.');
  } else {
    fileToCancel.abortController.abort();
  }
};

/**
 * Handles change event for form inputs
 * @param {string} name - Input name
 * @param {*} value - Input value
 * @returns {Object} Dispatch action object
 */
const createChangeAction = (name, value) => {
  if (name === 'url') {
    return {
      type: 'ON_CHANGE_URLS_TO_DOWNLOAD',
      keys: name,
      value: value.split('\n'),
    };
  }

  return {
    type: 'ON_CHANGE',
    keys: name,
    value,
  };
};

/**
 * Determines request URL for file submission
 * @param {boolean} shouldDuplicateMedia - Whether to duplicate media
 * @param {string} id - File ID
 * @returns {string} Request URL
 */
const getSubmitRequestUrl = (shouldDuplicateMedia, id) => {
  return shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;
};

/**
 * Appends file to form data if it was cropped
 * @param {FormData} formData - Form data object
 * @param {*} file - File to append
 */
const appendCroppedFileToFormData = (formData, file) => {
  if (isFileCropped(file)) {
    formData.append('files', file);
  }
};

/**
 * Handles file upload error by dispatching error action
 * @param {Object} err - Error object
 * @param {number} originalIndex - File original index
 * @param {Function} dispatch - Dispatch function
 * @param {Function} formatMessage - Format message function
 */
const handleUploadError = (err, originalIndex, dispatch, formatMessage) => {
  console.error(err);
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
 * Handles edit existing file error by dispatching error action
 * @param {Object} err - Error object
 * @param {Function} dispatch - Dispatch function
 * @param {Function} formatMessage - Format message function
 */
const handleEditFileError = (err, dispatch, formatMessage) => {
  console.error(err);
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
 * Normalizes file info by clearing name if it matches original
 * @param {Object} fileInfo - File info object
 * @param {string} originalName - Original file name
 */
const normalizeFileInfo = (fileInfo, originalName) => {
  if (originalName === fileInfo.name) {
    set(fileInfo, 'name', null);
  }
};

/**
 * Determines if buttons should be disabled on edit existing file step
 * @param {string} currentStep - Current step
 * @param {Object} fileToEdit - File being edited
 * @returns {boolean} True if buttons should be disabled
 */
const areEditExistingFileButtonsDisabled = (currentStep, fileToEdit) => {
  return currentStep === 'edit' && fileToEdit.isUploading === true;
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
 * Determines if next button should be displayed
 * @param {string} currentStep - Current step
 * @param {boolean} displayNextButton - Display flag
 * @returns {boolean} True if button should be displayed
 */
const shouldShowNextButton = (currentStep, displayNextButton) => {
  return currentStep === 'browse' && displayNextButton;
};

/**
 * Determines which delete handler to use based on current step
 * @param {string} currentStep - Current step
 * @param {Function} editHandler - Handler for edit step
 * @param {Function} uploadHandler - Handler for other steps
 * @returns {Function} Appropriate handler
 */
const getDeleteFileHandler = (currentStep, editHandler, uploadHandler) => {
  return currentStep === 'edit' ? editHandler : uploadHandler;
};

/**
 * Determines which submit handler to use based on current step
 * @param {string} currentStep - Current step
 * @param {Function} editHandler - Handler for edit step
 * @param {Function} newHandler - Handler for edit-new step
 * @returns {Function} Appropriate handler
 */
const getSubmitHandler = (currentStep, editHandler, newHandler) => {
  return currentStep === 'edit' ? editHandler : newHandler;
};

/**
 * Checks if user should be prompted before closing modal
 * @param {number} filesToUploadLength - Number of files to upload
 * @param {Object} initialFileToEdit - Initial file to edit
 * @param {Object} fileToEdit - Current file to edit
 * @param {string} currentStep - Current step
 * @returns {boolean} True if user should be prompted
 */
const shouldPromptBeforeClose = (filesToUploadLength, initialFileToEdit, fileToEdit, currentStep) => {
  if (filesToUploadLength > 0) {
    return true;
  }

  return !isEqual(initialFileToEdit, fileToEdit) && currentStep === 'edit';
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
              handleFileDownloadSuccess(file, data, dispatch);
            })
            .catch(err => {
              handleFileDownloadError(file, dispatch);
            });
        })
      );
    } catch (err) {
      // Silently handle batch error
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

    cancelFileUpload(fileToCancel);

    dispatch({
      type: 'REMOVE_FILE_TO_UPLOAD',
      fileIndex: fileOriginalIndex,
    });
  };

  const handleChange = ({ target: { name, value } }) => {
    setFormErrors(name === 'url' ? null : formErrors);

    const action = createChangeAction(name, value);
    dispatch(action);
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

    const { abortController, id, fileInfo } = fileToEdit;
    const requestURL = getSubmitRequestUrl(shouldDuplicateMedia, id);

    appendCroppedFileToFormData(formData, file);
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
      handleEditFileError(err, dispatch, formatMessage);
    }
  };

  const handleReplaceMedia = () => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current.click();
  };

  const handleToggle = () => {
    if (shouldPromptBeforeClose(filesToUploadLength, initialFileToEdit, fileToEdit, currentStep)) {
      // eslint-disable-next-line no-alert
      const messageKey = filesToUploadLength > 0
        ? getTrad('window.confirm.close-modal.files')
        : getTrad('window.confirm.close-modal.file');

      const confirm = window.confirm(formatMessage({ id: messageKey }));

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
        const formData = new FormData();
        const headers = {};

        normalizeFileInfo(fileInfo, originalName);

        formData.append('files', file);
        formData.append('fileInfo', JSON.stringify(fileInfo));

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
          handleUploadError(err, originalIndex, dispatch, formatMessage);
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

  const goTo = to => {
    dispatch({
      type: 'GO_TO',
      to,
    });
  };

  const toggleModalWarning = () => {
    setIsWarningDeleteOpen(prev => !prev);
  };

  const shouldDisplayNextButton = shouldShowNextButton(currentStep, displayNextButton);
  const isFinishButtonDisabledFlag = isFinishButtonDisabled(filesToUpload);
  const areButtonsDisabledOnEditExistingFile = areEditExistingFileButtonsDisabled(currentStep, fileToEdit);

  return (
    <>
      <Modal isOpen={isOpen} onToggle={handleToggle} onClosed={handleClose}>
        <ModalHeader
          goBack={goBack}
          headerBreadcrumbs={headerBreadcrumbs}
          withBackButton={withBackButton}
        />

        {Component && (
          <Component
            {...allowedActions}
            onAbortUpload={handleAbortUpload}
            addFilesToUpload={addFilesToUpload}
            fileToEdit={fileToEdit}
            filesToDownload={filesToDownload}
            filesToUpload={filesToUpload}
            formErrors={formErrors}
            components={components}
            isEditingUploadedFile={currentStep === 'edit'}
            isFormDisabled={isFormDisabled}
            onChange={handleChange}
            onClickCancelUpload={handleCancelFileToUpload}
            onClickDeleteFileToUpload={getDeleteFileHandler(
              currentStep,
              handleClickDeleteFile,
              handleClickDeleteFileToUpload
            )}
            onClickEditNewFile={handleGoToEditNewFile}
            onGoToAddBrowseFiles={handleGoToAddBrowseFiles}
            onSubmitEdit={getSubmitHandler(
              currentStep,
              handleSubmitEditExistingFile,
              handleSubmitEditNewFile
            )}
            onToggle={handleToggle}
            toggleDisableForm={setIsFormDisabled}
            ref={currentStep === 'edit' ? editModalRef : null}
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
            {currentStep === 'upload' && (
              <Button
                type="button"
                color="success"
                onClick={handleUploadFiles}
                disabled={isFinishButtonDisabledFlag}
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
          </section>
        </ModalFooter>
      </Modal>
      <PopUpWarning
        onClosed={handleCloseModalWarning}
        isOpen={isWarningDeleteOpen}
        toggleModal={toggleModalWarning}
        popUpWarningType="danger"
        onConfirm={handleConfirmDeleteFile}
        isConfirmButtonLoading={showModalConfirmButtonLoading}
      />
    </>
  );
};

ModalStepper.defaultProps = {
  initialFileToEdit: null,
  initialStep: 'browse',
  onClosed: () => {},
  onRemoveFileFromDataToDelete: () => {},
  onToggle: () => {},
};

ModalStepper.propTypes = {
  initialFileToEdit: PropTypes.object,
  initialStep: PropTypes.string,
  isOpen: PropTypes.bool.isRequired,
  onClosed: PropTypes.func,
  onRemoveFileFromDataToDelete: PropTypes.func,
  onToggle: PropTypes.func,
};

export default ModalStepper;
```