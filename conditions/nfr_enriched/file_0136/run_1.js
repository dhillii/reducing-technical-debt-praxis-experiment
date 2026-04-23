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

// Extract error message from response
const extractErrorMessage = (err, formatMessage) => {
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

  return { status, errorMessage };
};

// Handle file download error
const handleFileDownloadError = (file, dispatch) => {
  dispatch({
    type: 'SET_FILE_TO_DOWNLOAD_ERROR',
    originalIndex: file.originalIndex,
    fileTempId: file.tempId,
  });
};

// Handle successful file download
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

// Download a single file
const downloadSingleFile = (file, dispatch) => {
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
      console.error('fetch file error', err);
      handleFileDownloadError(file, dispatch);
    });
};

// Handle file upload error
const handleFileUploadError = (err, originalIndex, dispatch, formatMessage) => {
  const { status, errorMessage } = extractErrorMessage(err, formatMessage);

  if (status) {
    dispatch({
      type: 'SET_FILE_ERROR',
      fileIndex: originalIndex,
      errorMessage,
    });
  }
};

// Handle file edit error
const handleFileEditError = (err, dispatch, formatMessage) => {
  const { status, errorMessage } = extractErrorMessage(err, formatMessage);

  if (status) {
    dispatch({
      type: 'SET_FILE_TO_EDIT_ERROR',
      errorMessage,
    });
  }
};

// Upload a single file
const uploadSingleFile = async (fileData, dispatch, formatMessage) => {
  const { file, fileInfo, originalName, originalIndex, abortController } = fileData;
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

    dispatch({
      type: 'REMOVE_FILE_TO_UPLOAD',
      fileIndex: originalIndex,
    });

    return { success: true };
  } catch (err) {
    console.error(err);
    handleFileUploadError(err, originalIndex, dispatch, formatMessage);
    return { success: false };
  }
};

// Validate and process URLs
const validateAndProcessUrls = async (filesToDownload) => {
  try {
    await urlSchema.validate(
      { filesToDownload: filesToDownload.filter(url => !isEmpty(url)) },
      { abortEarly: false }
    );
    return { valid: true, errors: null };
  } catch (err) {
    const formattedErrors = getYupError(err);
    return { valid: false, errors: formattedErrors.filesToDownload };
  }
};

// Handle file cancellation
const cancelFileOperation = (fileToCancel) => {
  if (fileToCancel.source) {
    fileToCancel.source.cancel('Operation canceled by the user.');
  } else {
    fileToCancel.abortController.abort();
  }
};

// Handle delete file request
const deleteFileRequest = async (fileId) => {
  try {
    await request(`/${pluginId}/files/${fileId}`, {
      method: 'DELETE',
    });
    return { success: true, error: null };
  } catch (err) {
    const errorMessage = get(err, 'response.payload.message', 'An error occured');
    return { success: false, error: errorMessage };
  }
};

// Submit edit for existing file
const submitEditExistingFile = async (
  fileToEdit,
  shouldDuplicateMedia,
  file,
  dispatch,
  formatMessage,
  toggleRef
) => {
  const didCropFile = file instanceof File;
  const { abortController, id, fileInfo } = fileToEdit;
  const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;
  const formData = new FormData();
  const headers = {};

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
    return { success: true };
  } catch (err) {
    console.error(err);
    handleFileEditError(err, dispatch, formatMessage);
    return { success: false };
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

    const downloadPromises = files.map(file => downloadSingleFile(file, dispatch));

    try {
      await Promise.all(downloadPromises);
    } catch (err) {
      // Error handling is done in individual file download handlers
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

    const { success, error } = await deleteFileRequest(id);

    if (success) {
      setShouldRefetch(true);
    } else if (error) {
      strapi.notification.toggle({
        type: 'warning',
        message: error,
      });
    }

    setShowModalConfirmButtonLoading(false);
    toggleModalWarning();
  }, [fileToEdit, onRemoveFileFromDataToDelete]);

  const handleClickNextButton = async () => {
    const { valid, errors } = await validateAndProcessUrls(filesToDownload);

    if (valid) {
      setFormErrors(null);
      dispatch({
        type: 'ADD_URLS_TO_FILES_TO_UPLOAD',
        nextStep: next,
      });
    } else {
      setFormErrors(errors);
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

    await submitEditExistingFile(
      fileToEdit,
      shouldDuplicateMedia,
      file,
      dispatch,
      formatMessage,
      toggleRef
    );
  };

  const handleReplaceMedia = () => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current.click();
  };

  const handleToggle = () => {
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

  const handleUploadFiles = async () => {
    dispatch({
      type: 'SET_FILES_UPLOADING_STATE',
    });

    const uploadPromises = filesToUpload.map(fileData =>
      uploadSingleFile(fileData, dispatch, formatMessage)
    );

    const results = await Promise.all(uploadPromises);

    if (results.some(result => result.success)) {
      setShouldRefetch(true);
    }
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
              currentStep === 'edit' ? handleClickDeleteFile : handleClickDeleteFileToUpload
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