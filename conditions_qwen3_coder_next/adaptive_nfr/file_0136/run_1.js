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

// Extracted predicate functions for complex conditions
/**
 * Checks if the current step is 'browse' and displayNextButton flag is true
 */
const shouldDisplayNextButtonFn = (currentStep, displayNextButton) =>
  currentStep === 'browse' && displayNextButton;

/**
 * Checks if any file is currently downloading or uploading
 */
const isFinishButtonDisabledFn = filesToUpload =>
  filesToUpload.some(file => file.isDownloading || file.isUploading);

/**
 * Checks if edit existing file is being uploaded
 */
const areButtonsDisabledOnEditExistingFileFn = (currentStep, fileToEdit) =>
  currentStep === 'edit' && fileToEdit.isUploading === true;

/**
 * Handles file download systematically avoiding inline catch blocks
 */
const downloadFiles = async (files, emitEvent, dispatch) => {
  if (files.length === 0) return;

  emitEvent('didSelectFile', { source: 'url', location: 'upload' });

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
    // Silent
  }
};

// Map file removal types to targeted operation handlers
const createFileRemovalHandler = (dispatch, currentStep) => (type, payload) => {
  dispatch({ type, ...payload });

  if (currentStep === 'edit-new' && type === 'REMOVE_FILE_TO_UPLOAD') {
    dispatch({ type: 'RESET_FILE_TO_EDIT' });
  }
};

// Map upload URL validation and navigation
const handleUrlValidationAndNavigation = async (
  filesToDownload,
  dispatch,
  setFormErrors,
  next
) => {
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
      // Close the modal
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
    await downloadFiles(files, emitEvent, dispatch);
  };

  const handleAbortUpload = () => {
    fileToEdit.abortController.abort();

    dispatch({
      type: 'ON_ABORT_UPLOAD',
    });
  };

  const handleCancelFileToUpload = fileOriginalIndex => {
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
      const errorMessage = get(err, 'response.payload.message', 'An error occured');

      strapi.notification.toggle({
        type: 'warning',
        message: errorMessage,
      });
    } finally {
      setShowModalConfirmButtonLoading(true);
      toggleModalWarning();
    }
  }, [fileToEdit]);

  const handleClickNextButton = async () => {
    await handleUrlValidationAndNavigation(filesToDownload, dispatch, setFormErrors, next);
  };

  const handleClickDeleteFile = async () => {
    toggleModalWarning();
  };

  const handleClickDeleteFileToUpload = fileIndex => {
    const handler = createFileRemovalHandler(dispatch, currentStep);
    handler('REMOVE_FILE_TO_UPLOAD', { fileIndex });
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

  const shouldDisplayNextButton = shouldDisplayNextButtonFn(currentStep, displayNextButton);
  const isFinishButtonDisabled = isFinishButtonDisabledFn(filesToUpload);
  const areButtonsDisabledOnEditExistingFile = areButtonsDisabledOnEditExistingFileFn(currentStep, fileToEdit);

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