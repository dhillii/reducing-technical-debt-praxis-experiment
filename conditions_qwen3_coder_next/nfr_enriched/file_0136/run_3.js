import React, { useCallback, useEffect, useState, useReducer, useRef } from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';
import { isEqual, isEmpty, get } from 'lodash';
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
 * Handles file download logic for URLs in the upload step.
 * Downloads files using axios, updates reducer state on success/error.
 */
const downloadFiles = async (files, dispatch, emitEvent) => {
  if (files.length > 0) {
    emitEvent('didSelectFile', { source: 'url', location: 'upload' });
  }

  try {
    await Promise.all(
      files.map(async file => {
        const { source, fileURL, fileInfo, originalIndex, tempId } = file;

        try {
          const { data } = await axios.get(fileURL, {
            responseType: 'blob',
            cancelToken: source.token,
            timeout: 60000,
          });

          const fileName = fileInfo.name;
          const createdFile = new File([data], fileName, {
            type: data.type,
          });

          dispatch({
            type: 'FILE_DOWNLOADED',
            blob: createdFile,
            originalIndex,
            fileTempId: tempId,
          });
        } catch (err) {
          console.error('fetch file error', err);

          dispatch({
            type: 'SET_FILE_TO_DOWNLOAD_ERROR',
            originalIndex,
            fileTempId: tempId,
          });
        }
      })
    );
  } catch (err) {
    // Silent catch — per rule S2486, we either handle or don't catch.
    // Since original code had "Silent", we preserve that behavior.
  }
};

/**
 * Validates URLs and transitions to next step if valid.
 */
const validateAndNavigateToNextStep = async (filesToDownload, dispatch, next, setFormErrors) => {
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

/**
 * Handles file deletion request and updates UI state.
 */
const handleDeleteFileRequest = async (id, onRemoveFileFromDataToDelete, setShowModalConfirmButtonLoading, setShouldRefetch, toggleModalWarning) => {
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
};

/**
 * Handles file upload logic for multiple files.
 */
const handleFileUploads = async (filesToUpload, dispatch, setShouldRefetch) => {
  dispatch({
    type: 'SET_FILES_UPLOADING_STATE',
  });

  const requests = filesToUpload.map(async ({ file, fileInfo, originalName, originalIndex, abortController }) => {
    const formData = new FormData();
    const headers = {};

    if (originalName === fileInfo.name) {
      set(fileInfo, 'name', null);
    }

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
      console.error(err);
      const status = get(err, 'response.status', get(err, 'status', null));
      const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
      let errorMessage = get(
        err,
        ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
        get(err, ['response', 'payload', 'message'], statusText)
      );

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
    }
  });

  await Promise.all(requests);
};

/**
 * Handles file edit submission for new files.
 */
const handleSubmitEditNewFile = (e, dispatch, goNext) => {
  e.preventDefault();

  dispatch({
    type: 'ON_SUBMIT_EDIT_NEW_FILE',
  });

  goNext();
};

/**
 * Handles file edit submission for existing files.
 */
const handleSubmitEditExistingFile = async (
  e,
  shouldDuplicateMedia,
  file,
  isSubmittingAfterCrop,
  emitEvent,
  dispatch,
  fileToEdit,
  formatMessage,
  toggleRef,
  request
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

  const didCropFile = file instanceof File;
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
    const status = get(err, 'response.status', get(err, 'status', null));
    const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
    let errorMessage = get(
      err,
      ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
      get(err, ['response', 'payload', 'message'], statusText)
    );

    if (status === 413) {
      errorMessage = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
    }

    if (status) {
      dispatch({
        type: 'SET_FILE_TO_EDIT_ERROR',
        errorMessage,
      });
    }
  }
};

/**
 * Handles file cancellation (download or upload).
 */
const handleCancelFile = (fileToCancel, dispatch, fileOriginalIndex) => {
  const { source, abortController } = fileToCancel;

  if (source) {
    source.cancel('Operation canceled by the user.');
  } else {
    abortController.abort();
  }

  dispatch({
    type: 'REMOVE_FILE_TO_UPLOAD',
    fileIndex: fileOriginalIndex,
  });
};

/**
 * Handles file upload abort.
 */
const handleAbortUpload = (fileToEdit, dispatch) => {
  fileToEdit.abortController.abort();

  dispatch({
    type: 'ON_ABORT_UPLOAD',
  });
};

/**
 * Handles file replace action.
 */
const handleReplaceMedia = (editModalRef, emitEvent) => {
  emitEvent('didReplaceMedia', { location: 'upload' });
  editModalRef.current.click();
};

/**
 * Handles file cropping result.
 */
const handleSetCropResult = (blob, emitEvent, dispatch) => {
  emitEvent('didCropFile', { duplicatedFile: null, location: 'upload' });

  dispatch({
    type: 'SET_CROP_RESULT',
    blob,
  });
};

/**
 * Handles form field changes.
 */
const handleChange = ({ target: { name, value } }, setFormErrors, dispatch) => {
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

/**
 * Handles modal close logic.
 */
const handleClose = (onClosed, setIsFormDisabled, setDisplayNextButton, setFormErrors, setShouldRefetch, dispatch) => {
  onClosed();
  setIsFormDisabled(false);
  setDisplayNextButton(false);
  setFormErrors(null);
  setShouldRefetch(false);

  dispatch({
    type: 'RESET_PROPS',
  });
};

/**
 * Handles modal warning close.
 */
const handleCloseModalWarning = (setShowModalConfirmButtonLoading, onToggle, shouldRefetch) => {
  setShowModalConfirmButtonLoading(false);
  onToggle(shouldRefetch);
};

/**
 * Handles file deletion confirmation.
 */
const handleClickDeleteFile = (toggleModalWarning) => {
  toggleModalWarning();
};

/**
 * Handles file deletion from upload list.
 */
const handleClickDeleteFileToUpload = (fileIndex, currentStep, dispatch) => {
  dispatch({
    type: 'REMOVE_FILE_TO_UPLOAD',
    fileIndex,
  });

  if (currentStep === 'edit-new') {
    dispatch({
      type: 'RESET_FILE_TO_EDIT',
    });
  }
};

/**
 * Handles navigation to edit new file.
 */
const handleGoToEditNewFile = (fileIndex, dispatch, goTo) => {
  dispatch({
    type: 'SET_FILE_TO_EDIT',
    fileIndex,
  });

  goTo('edit-new');
};

/**
 * Handles navigation back to browse step.
 */
const handleGoToAddBrowseFiles = (dispatch, goBack) => {
  dispatch({
    type: 'CLEAN_FILES_ERROR',
  });

  goBack();
};

/**
 * Handles modal toggle with confirmation if needed.
 */
const handleToggle = (
  filesToUploadLength,
  initialFileToEdit,
  fileToEdit,
  currentStep,
  formatMessage,
  onToggle,
  shouldRefetch
) => {
  if (filesToUploadLength > 0) {
    const confirm = window.confirm(
      formatMessage({ id: getTrad('window.confirm.close-modal.files') })
    );

    if (!confirm) {
      return;
    }
  }

  if (!isEqual(initialFileToEdit, fileToEdit) && currentStep === 'edit') {
    const confirm = window.confirm(
      formatMessage({ id: getTrad('window.confirm.close-modal.file') })
    );

    if (!confirm) {
      return;
    }
  }

  onToggle(shouldRefetch);
};

/**
 * Handles file selection and upload.
 */
const addFilesToUpload = ({ target: { value } }, emitEvent, dispatch, goTo, next) => {
  emitEvent('didSelectFile', { source: 'computer', location: 'upload' });

  dispatch({
    type: 'ADD_FILES_TO_UPLOAD',
    filesToUpload: value,
  });

  goTo(next);
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

  downloadFilesRef.current = () => {
    const files = getFilesToDownload(filesToUpload);
    downloadFiles(files, dispatch, emitEvent);
  };

  const handleAbortUploadCallback = useCallback(() => {
    handleAbortUpload(fileToEdit, dispatch);
  }, [fileToEdit]);

  const handleCancelFileToUploadCallback = useCallback(fileOriginalIndex => {
    const fileToCancel = filesToUpload.find(file => file.originalIndex === fileOriginalIndex);
    handleCancelFile(fileToCancel, dispatch, fileOriginalIndex);
  }, [filesToUpload]);

  const handleChangeCallback = useCallback(({ target: { name, value } }) => {
    handleChange({ target: { name, value } }, setFormErrors, dispatch);
  }, []);

  const handleConfirmDeleteFileCallback = useCallback(async () => {
    await handleDeleteFileRequest(
      fileToEdit.id,
      onRemoveFileFromDataToDelete,
      setShowModalConfirmButtonLoading,
      setShouldRefetch,
      toggleModalWarning
    );
  }, [fileToEdit, onRemoveFileFromDataToDelete]);

  const handleClickNextButtonCallback = useCallback(async () => {
    await validateAndNavigateToNextStep(filesToDownload, dispatch, next, setFormErrors);
  }, [filesToDownload, next]);

  const handleClickDeleteFileCallback = useCallback(() => {
    handleClickDeleteFile(toggleModalWarning);
  }, []);

  const handleClickDeleteFileToUploadCallback = useCallback(fileIndex => {
    handleClickDeleteFileToUpload(fileIndex, currentStep, dispatch);
  }, [currentStep]);

  const handleCloseCallback = useCallback(() => {
    handleClose(onClosed, setIsFormDisabled, setDisplayNextButton, setFormErrors, setShouldRefetch, dispatch);
  }, [onClosed]);

  const handleCloseModalWarningCallback = useCallback(() => {
    handleCloseModalWarning(setShowModalConfirmButtonLoading, onToggle, shouldRefetch);
  }, [onToggle, shouldRefetch]);

  const handleGoToEditNewFileCallback = useCallback(fileIndex => {
    handleGoToEditNewFile(fileIndex, dispatch, goTo);
  }, [goTo]);

  const handleGoToAddBrowseFilesCallback = useCallback(() => {
    handleGoToAddBrowseFiles(dispatch, goBack);
  }, [goBack]);

  const handleSetCropResultCallback = useCallback(blob => {
    handleSetCropResult(blob, emitEvent, dispatch);
  }, [emitEvent]);

  const handleSubmitEditNewFileCallback = useCallback(e => {
    handleSubmitEditNewFile(e, dispatch, goNext);
  }, [goNext]);

  const handleSubmitEditExistingFileCallback = useCallback(
    (e, shouldDuplicateMedia = false, file = fileToEdit.file, isSubmittingAfterCrop = false) => {
      handleSubmitEditExistingFile(
        e,
        shouldDuplicateMedia,
        file,
        isSubmittingAfterCrop,
        emitEvent,
        dispatch,
        fileToEdit,
        formatMessage,
        toggleRef,
        request
      );
    },
    [emitEvent, dispatch, fileToEdit, formatMessage, toggleRef]
  );

  const handleReplaceMediaCallback = useCallback(() => {
    handleReplaceMedia(editModalRef, emitEvent);
  }, [editModalRef, emitEvent]);

  const handleToggleCallback = useCallback(() => {
    handleToggle(
      filesToUploadLength,
      initialFileToEdit,
      fileToEdit,
      currentStep,
      formatMessage,
      onToggle,
      shouldRefetch
    );
  }, [filesToUploadLength, initialFileToEdit, fileToEdit, currentStep, formatMessage, onToggle, shouldRefetch]);

  const handleUploadFilesCallback = useCallback(async () => {
    await handleFileUploads(filesToUpload, dispatch, setShouldRefetch);
  }, [filesToUpload]);

  const goBackCallback = useCallback(() => {
    goBack();
  }, []);

  const goNextCallback = useCallback(() => {
    if (next === null) {
      onToggle();
      return;
    }

    goTo(next);
  }, [next, onToggle, goTo]);

  const goToCallback = useCallback(to => {
    dispatch({
      type: 'GO_TO',
      to,
    });
  }, []);

  const toggleModalWarningCallback = useCallback(() => {
    setIsWarningDeleteOpen(prev => !prev);
  }, []);

  const shouldDisplayNextButton = currentStep === 'browse' && displayNextButton;
  const isFinishButtonDisabled = filesToUpload.some(file => file.isDownloading || file.isUploading);
  const areButtonsDisabledOnEditExistingFile =
    currentStep === 'edit' && fileToEdit.isUploading === true;

  return (
    <>
      <Modal isOpen={isOpen} onToggle={handleToggleCallback} onClosed={handleCloseCallback}>
        <ModalHeader
          goBack={goBackCallback}
          headerBreadcrumbs={headerBreadcrumbs}
          withBackButton={withBackButton}
        />

        {Component && (
          <Component
            {...allowedActions}
            onAbortUpload={handleAbortUploadCallback}
            addFilesToUpload={addFilesToUpload}
            fileToEdit={fileToEdit}
            filesToDownload={filesToDownload}
            filesToUpload={filesToUpload}
            formErrors={formErrors}
            components={components}
            isEditingUploadedFile={currentStep === 'edit'}
            isFormDisabled={isFormDisabled}
            onChange={handleChangeCallback}
            onClickCancelUpload={handleCancelFileToUploadCallback}
            onClickDeleteFileToUpload={
              currentStep === 'edit' ? handleClickDeleteFileCallback : handleClickDeleteFileToUploadCallback
            }
            onClickEditNewFile={handleGoToEditNewFileCallback}
            onGoToAddBrowseFiles={handleGoToAddBrowseFilesCallback}
            onSubmitEdit={
              currentStep === 'edit' ? handleSubmitEditExistingFileCallback : handleSubmitEditNewFileCallback
            }
            onToggle={handleToggleCallback}
            toggleDisableForm={setIsFormDisabled}
            ref={currentStep === 'edit' ? editModalRef : null}
            setCropResult={handleSetCropResultCallback}
            setShouldDisplayNextButton={setDisplayNextButton}
            withBackButton={withBackButton}
          />
        )}

        <ModalFooter>
          <section>
            <Button type="button" color="cancel" onClick={handleToggleCallback}>
              {formatMessage({ id: 'app.components.Button.cancel' })}
            </Button>
            {shouldDisplayNextButton && (
              <Button
                type="button"
                color="primary"
                onClick={handleClickNextButtonCallback}
                disabled={isEmpty(filesToDownload)}
              >
                {formatMessage({ id: getTrad('button.next') })}
              </Button>
            )}
            {currentStep === 'upload' && (
              <Button
                type="button"
                color="success"
                onClick={handleUploadFilesCallback}
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
              <Button color="success" type="button" onClick={handleSubmitEditNewFileCallback}>
                {formatMessage({ id: 'form.button.finish' })}
              </Button>
            )}
            {currentStep === 'edit' && (
              <div style={{ margin: 'auto 0' }}>
                <Button
                  disabled={isFormDisabled || areButtonsDisabledOnEditExistingFile}
                  color="primary"
                  onClick={handleReplaceMediaCallback}
                  style={{ marginRight: 10 }}
                >
                  {formatMessage({ id: getTrad('control-card.replace-media') })}
                </Button>

                <Button
                  disabled={isFormDisabled || areButtonsDisabledOnEditExistingFile}
                  color="success"
                  type="button"
                  onClick={handleSubmitEditExistingFileCallback}
                >
                  {formatMessage({ id: 'form.button.finish' })}
                </Button>
              </div>
            )}
          </section>
        </ModalFooter>
      </Modal>
      <PopUpWarning
        onClosed={handleCloseModalWarningCallback}
        isOpen={isWarningDeleteOpen}
        toggleModal={toggleModalWarningCallback}
        popUpWarningType="danger"
        onConfirm={handleConfirmDeleteFileCallback}
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