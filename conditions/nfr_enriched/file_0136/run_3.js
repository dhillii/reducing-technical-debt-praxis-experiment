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

// Handle file download completion
const handleFileDownloadSuccess = (data, file, dispatch) => {
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

// Handle file download error
const handleFileDownloadError = (file, dispatch) => {
  dispatch({
    type: 'SET_FILE_TO_DOWNLOAD_ERROR',
    originalIndex: file.originalIndex,
    fileTempId: file.tempId,
  });
};

// Download a single file from URL
const downloadSingleFile = (file) => {
  const { source } = file;

  return axios
    .get(file.fileURL, {
      responseType: 'blob',
      cancelToken: source.token,
      timeout: 60000,
    })
    .then(({ data }) => ({ success: true, data, file }))
    .catch((err) => {
      console.error('fetch file error', err);
      return { success: false, file };
    });
};

// Validate URL schema and handle errors
const validateUrlSchema = async (filesToDownload) => {
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

// Handle file upload request
const uploadFileRequest = async (fileData, pluginId) => {
  const { file, fileInfo, originalName, originalIndex, abortController } = fileData;
  const formData = new FormData();
  const headers = {};

  if (originalName === fileInfo.name) {
    set(fileInfo, 'name', null);
  }

  formData.append('files', file);
  formData.append('fileInfo', JSON.stringify(fileInfo));

  return request(
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
};

// Handle delete file request
const deleteFileRequest = async (fileId, pluginId) => {
  return request(`/${pluginId}/files/${fileId}`, {
    method: 'DELETE',
  });
};

// Handle edit existing file submission
const submitEditExistingFileRequest = async (fileToEdit, fileData, shouldDuplicateMedia, pluginId) => {
  const { abortController, id, fileInfo } = fileToEdit;
  const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;
  const formData = new FormData();
  const headers = {};

  const didCropFile = fileData instanceof File;
  if (didCropFile) {
    formData.append('files', fileData);
  }

  formData.append('fileInfo', JSON.stringify(fileInfo));

  return request(
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

    const downloadPromises = files.map(downloadSingleFile);
    const results = await Promise.allSettled(downloadPromises);

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { success, data, file } = result.value;
        if (success) {
          handleFileDownloadSuccess(data, file, dispatch);
        } else {
          handleFileDownloadError(file, dispatch);
        }
      }
    });
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
      await deleteFileRequest(id, pluginId);
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
  }, [fileToEdit]);

  const handleClickNextButton = async () => {
    const validation = await validateUrlSchema(filesToDownload);

    if (validation.valid) {
      setFormErrors(null);
      dispatch({
        type: 'ADD_URLS_TO_FILES_TO_UPLOAD',
        nextStep: next,
      });
    } else {
      setFormErrors(validation.errors);
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

    try {
      await submitEditExistingFileRequest(fileToEdit, file, shouldDuplicateMedia, pluginId);
      toggleRef.current(true);
    } catch (err) {
      console.error(err);
      const { status, errorMessage } = extractErrorMessage(err, formatMessage);

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

    const requests = filesToUpload.map(async (fileData) => {
      const { originalIndex } = fileData;

      try {
        await uploadFileRequest(fileData, pluginId);
        setShouldRefetch(true);

        dispatch({
          type: 'REMOVE_FILE_TO_UPLOAD',
          fileIndex: originalIndex,
        });
      } catch (err) {
        console.error(err);
        const { status, errorMessage } = extractErrorMessage(err, formatMessage);

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