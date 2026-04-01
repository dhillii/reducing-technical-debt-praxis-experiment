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
 * @param {string} currentStep - Current step in stepper
 * @returns {boolean} True if confirmation is needed
 */
const shouldConfirmClose = (filesToUploadLength, hasFileChanges, currentStep) => {
  return filesToUploadLength > 0 || (hasFileChanges && currentStep === 'edit');
};

/**
 * Gets confirmation message for modal closure
 * @param {number} filesToUploadLength - Number of files to upload
 * @param {Function} formatMessage - Message formatter function
 * @returns {string} Confirmation message
 */
const getCloseConfirmationMessage = (filesToUploadLength, formatMessage) => {
  if (filesToUploadLength > 0) {
    return formatMessage({ id: getTrad('window.confirm.close-modal.files') });
  }
  return formatMessage({ id: getTrad('window.confirm.close-modal.file') });
};

/**
 * Handles URL change input
 * @param {string} name - Input field name
 * @param {string} value - Input field value
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
 * Determines if file was cropped
 * @param {File|Object} file - File object to check
 * @returns {boolean} True if file is a File instance
 */
const isFileCropped = (file) => {
  return file instanceof File;
};

/**
 * Builds request URL for file submission
 * @param {boolean} shouldDuplicateMedia - Whether to duplicate media
 * @param {string} id - File ID
 * @returns {string} Request URL
 */
const buildFileSubmitUrl = (shouldDuplicateMedia, id) => {
  return shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;
};

/**
 * Appends file to form data if it was cropped
 * @param {FormData} formData - Form data object
 * @param {File|Object} file - File to append
 */
const appendFileIfCropped = (formData, file) => {
  if (isFileCropped(file)) {
    formData.append('files', file);
  }
};

/**
 * Normalizes file name in fileInfo if it matches original name
 * @param {Object} fileInfo - File info object
 * @param {string} originalName - Original file name
 */
const normalizeFileName = (fileInfo, originalName) => {
  if (originalName === fileInfo.name) {
    set(fileInfo, 'name', null);
  }
};

/**
 * Determines if delete file button should show delete confirmation
 * @param {string} currentStep - Current step in stepper
 * @returns {boolean} True if on edit step
 */
const shouldShowDeleteConfirmation = (currentStep) => {
  return currentStep === 'edit';
};

/**
 * Determines if file should be reset after deletion
 * @param {string} currentStep - Current step in stepper
 * @returns {boolean} True if on edit-new step
 */
const shouldResetFileAfterDelete = (currentStep) => {
  return currentStep === 'edit-new';
};

/**
 * Determines which submit handler to use based on current step
 * @param {string} currentStep - Current step in stepper
 * @returns {string} Handler name
 */
const getSubmitHandler = (currentStep) => {
  return currentStep === 'edit' ? 'handleSubmitEditExistingFile' : 'handleSubmitEditNewFile';
};

/**
 * Determines which delete handler to use based on current step
 * @param {string} currentStep - Current step in stepper
 * @returns {string} Handler name
 */
const getDeleteHandler = (currentStep) => {
  return currentStep === 'edit' ? 'handleClickDeleteFile' : 'handleClickDeleteFileToUpload';
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

    if (shouldResetFileAfterDelete(currentStep)) {
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
    const requestURL = buildFileSubmitUrl(shouldDuplicateMedia, id);

    appendFileIfCropped(formData, file);
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
      const status = extractErrorStatus(err);
      const errorMessage = extractErrorMessage(err, status, formatMessage);

      if (status) {
        dispatch({
          type: 'SET_FILE_TO_EDIT_ERROR',
          errorMessage,
        });
      }
    }
  };

  const handleReplaceMedia = () => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current.click();
  };

  const handleToggle = () => {
    const hasFileChanges = !isEqual(initialFileToEdit, fileToEdit);

    if (shouldConfirmClose(filesToUploadLength, hasFileChanges, currentStep)) {
      const message = getCloseConfirmationMessage(filesToUploadLength, formatMessage);
      // eslint-disable-next-line no-alert
      const confirm = window.confirm(message);

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

        normalizeFileName(fileInfo, originalName);

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
          const status = extractErrorStatus(err);
          const errorMessage = extractErrorMessage(err, status, formatMessage);

          if (status) {
            dispatch({
              type: 'SET_FILE_ERROR',
              fileIndex: originalIndex,
              errorMessage,
            });
          }
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

  const shouldDisplayNextButton = currentStep === 'browse' && displayNextButton;
  const isFinishButtonDisabled = filesToUpload.some(file => file.isDownloading || file.isUploading);
  const areButtonsDisabledOnEditExistingFile =
    currentStep === 'edit' && fileToEdit.isUploading === true;

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
            onClickDeleteFileToUpload={
              shouldShowDeleteConfirmation(currentStep) ? handleClickDeleteFile : handleClickDeleteFileToUpload
            }
            onClickEditNewFile={handleGoToEditNewFile}
            onGoToAddBrowseFiles={handleGoToAddBrowseFiles}
            onSubmitEdit={
              currentStep === 'edit' ? handleSubmitEditExistingFile : handleSubmitEditNewFile
            }
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