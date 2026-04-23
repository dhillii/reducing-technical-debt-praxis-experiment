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
 * Extracts a user‑friendly error message from a request error.
 * @param {Object} err
 * @param {Function} formatMessage
 * @returns {string}
 */
const extractErrorMessage = (err, formatMessage) => {
  const status = get(err, 'response.status', get(err, 'status', null));
  const statusText = get(err, 'response.statusText', get(err, 'statusText', null));
  let message = get(
    err,
    ['response', 'payload', 'message', '0', 'messages', '0', 'message'],
    get(err, ['response', 'payload', 'message'], statusText)
  );

  if (status === 413) {
    message = formatMessage({ id: 'app.utils.errors.file-too-big.message' });
  }

  return message;
};

/**
 * Returns true if the modal can be closed without confirmation.
 * @param {Object} params
 * @returns {boolean}
 */
const canCloseWithoutConfirm = ({
  filesToUploadLength,
  initialFileToEdit,
  fileToEdit,
  currentStep,
}) => {
  if (filesToUploadLength > 0) return false;
  if (!isEqual(initialFileToEdit, fileToEdit) && currentStep === 'edit') return false;
  return true;
};

/**
 * Shows a confirmation dialog with the given i18n id.
 * @param {Function} formatMessage
 * @param {string} id
 * @returns {boolean}
 */
const showConfirm = (formatMessage, id) => {
  // eslint-disable-next-line no-alert
  return window.confirm(formatMessage({ id }));
};

/**
 * Handles file download logic.
 * @param {Array} filesToUpload
 * @param {Function} emitEvent
 * @param {Function} dispatch
 */
const downloadFiles = async (filesToUpload, emitEvent, dispatch) => {
  const files = getFilesToDownload(filesToUpload);

  if (files.length > 0) {
    emitEvent('didSelectFile', { source: 'url', location: 'upload' });
  }

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
          const createdFile = new File([data], file.fileInfo.name, { type: data.type });

          dispatch({
            type: 'FILE_DOWNLOADED',
            blob: createdFile,
            originalIndex: file.originalIndex,
            fileTempId: file.tempId,
          });
        })
        .catch(err => {
          console.error('fetch file error', err);
          dispatch({
            type: 'SET_FILE_TO_DOWNLOAD_ERROR',
            originalIndex: file.originalIndex,
            fileTempId: file.tempId,
          });
        });
    })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesToUploadLength, currentStep]);

  useEffect(() => {
    if (isOpen) {
      goTo(initialStep);
      if (initialFileToEdit) {
        dispatch({ type: 'INIT_FILE_TO_EDIT', fileToEdit: initialFileToEdit });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const addFilesToUpload = ({ target: { value } }) => {
    emitEvent('didSelectFile', { source: 'computer', location: 'upload' });
    dispatch({ type: 'ADD_FILES_TO_UPLOAD', filesToUpload: value });
    goTo(next);
  };

  downloadFilesRef.current = () => downloadFiles(filesToUpload, emitEvent, dispatch);

  const handleAbortUpload = () => {
    fileToEdit.abortController.abort();
    dispatch({ type: 'ON_ABORT_UPLOAD' });
  };

  const handleCancelFileToUpload = fileOriginalIndex => {
    const fileToCancel = filesToUpload.find(f => f.originalIndex === fileOriginalIndex);
    const { source } = fileToCancel;

    if (source) {
      source.cancel('Operation canceled by the user.');
    } else {
      fileToCancel.abortController.abort();
    }

    dispatch({ type: 'REMOVE_FILE_TO_UPLOAD', fileIndex: fileOriginalIndex });
  };

  const handleChange = ({ target: { name, value } }) => {
    const isUrl = name === 'url';
    const payload = {
      type: isUrl ? 'ON_CHANGE_URLS_TO_DOWNLOAD' : 'ON_CHANGE',
      keys: name,
      value: isUrl ? value.split('\n') : value,
    };

    if (isUrl) setFormErrors(null);
    dispatch(payload);
  };

  const handleConfirmDeleteFile = useCallback(async () => {
    const { id } = fileToEdit;
    onRemoveFileFromDataToDelete(id);
    setShowModalConfirmButtonLoading(true);

    try {
      await request(`/${pluginId}/files/${id}`, { method: 'DELETE' });
      setShouldRefetch(true);
    } catch (err) {
      const errorMessage = get(err, 'response.payload.message', 'An error occured');
      strapi.notification.toggle({ type: 'warning', message: errorMessage });
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
      dispatch({ type: 'ADD_URLS_TO_FILES_TO_UPLOAD', nextStep: next });
    } catch (err) {
      const formattedErrors = getYupError(err);
      setFormErrors(formattedErrors.filesToDownload);
    }
  };

  const handleClickDeleteFile = () => toggleModalWarning();

  const handleClickDeleteFileToUpload = fileIndex => {
    dispatch({ type: 'REMOVE_FILE_TO_UPLOAD', fileIndex });
    if (currentStep === 'edit-new') {
      dispatch({ type: 'RESET_FILE_TO_EDIT' });
      goNext();
    }
  };

  const handleClose = () => {
    onClosed();
    setIsFormDisabled(false);
    setDisplayNextButton(false);
    setFormErrors(null);
    setShouldRefetch(false);
    dispatch({ type: 'RESET_PROPS' });
  };

  const handleCloseModalWarning = async () => {
    setShowModalConfirmButtonLoading(false);
    onToggle(shouldRefetch);
  };

  const handleGoToEditNewFile = fileIndex => {
    dispatch({ type: 'SET_FILE_TO_EDIT', fileIndex });
    goTo('edit-new');
  };

  const handleGoToAddBrowseFiles = () => {
    dispatch({ type: 'CLEAN_FILES_ERROR' });
    goBack();
  };

  const handleSetCropResult = blob => {
    emitEvent('didCropFile', { duplicatedFile: null, location: 'upload' });
    dispatch({ type: 'SET_CROP_RESULT', blob });
  };

  const handleSubmitEditNewFile = e => {
    e.preventDefault();
    dispatch({ type: 'ON_SUBMIT_EDIT_NEW_FILE' });
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

    dispatch({ type: 'ON_SUBMIT_EDIT_EXISTING_FILE' });

    const formData = new FormData();
    const { abortController, id, fileInfo } = fileToEdit;
    const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;

    if (file instanceof File) {
      formData.append('files', file);
    }

    formData.append('fileInfo', JSON.stringify(fileInfo));

    try {
      await request(requestURL, { method: 'POST', body: formData, signal: abortController.signal }, false, false);
      toggleRef.current(true);
    } catch (err) {
      console.error(err);
      const errorMessage = extractErrorMessage(err, formatMessage);
      if (errorMessage) {
        dispatch({ type: 'SET_FILE_TO_EDIT_ERROR', errorMessage });
      }
    }
  };

  const handleReplaceMedia = () => {
    emitEvent('didReplaceMedia', { location: 'upload' });
    editModalRef.current.click();
  };

  const handleToggle = () => {
    if (!canCloseWithoutConfirm({ filesToUploadLength, initialFileToEdit, fileToEdit, currentStep })) {
      if (filesToUploadLength > 0) {
        if (!showConfirm(formatMessage, getTrad('window.confirm.close-modal.files'))) return;
      }
      if (!isEqual(initialFileToEdit, fileToEdit) && currentStep === 'edit') {
        if (!showConfirm(formatMessage, getTrad('window.confirm.close-modal.file'))) return;
      }
    }
    onToggle(shouldRefetch);
  };

  const handleUploadFiles = async () => {
    dispatch({ type: 'SET_FILES_UPLOADING_STATE' });

    const requests = filesToUpload.map(
      async ({ file, fileInfo, originalName, originalIndex, abortController }) => {
        const formData = new FormData();

        if (originalName === fileInfo.name) {
          set(fileInfo, 'name', null);
        }

        formData.append('files', file);
        formData.append('fileInfo', JSON.stringify(fileInfo));

        try {
          await request(`/${pluginId}`, { method: 'POST', body: formData, signal: abortController.signal }, false, false);
          setShouldRefetch(true);
          dispatch({ type: 'REMOVE_FILE_TO_UPLOAD', fileIndex: originalIndex });
        } catch (err) {
          console.error(err);
          const errorMessage = extractErrorMessage(err, formatMessage);
          if (errorMessage) {
            dispatch({ type: 'SET_FILE_ERROR', fileIndex: originalIndex, errorMessage });
          }
        }
      }
    );

    await Promise.all(requests);
  };

  const goBack = () => goTo(prev);
  const goNext = () => (next === null ? onToggle() : goTo(next));
  const goTo = to => dispatch({ type: 'GO_TO', to });
  const toggleModalWarning = () => setIsWarningDeleteOpen(prev => !prev);

  const shouldDisplayNextButton = currentStep === 'browse' && displayNextButton;
  const isFinishButtonDisabled = filesToUpload.some(f => f.isDownloading || f.isUploading);
  const areButtonsDisabledOnEditExistingFile = currentStep === 'edit' && fileToEdit.isUploading === true;

  return (
    <>
      <Modal isOpen={isOpen} onToggle={handleToggle} onClosed={handleClose}>
        <ModalHeader goBack={goBack} headerBreadcrumbs={headerBreadcrumbs} withBackButton={withBackButton} />
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
            onClickDeleteFileToUpload={currentStep === 'edit' ? handleClickDeleteFile : handleClickDeleteFileToUpload}
            onClickEditNewFile={handleGoToEditNewFile}
            onGoToAddBrowseFiles={handleGoToAddBrowseFiles}
            onSubmitEdit={currentStep === 'edit' ? handleSubmitEditExistingFile : handleSubmitEditNewFile}
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
              <Button type="button" color="primary" onClick={handleClickNextButton} disabled={isEmpty(filesToDownload)}>
                {formatMessage({ id: getTrad('button.next') })}
              </Button>
            )}
            {currentStep === 'upload' && (
              <Button type="button" color="success" onClick={handleUploadFiles} disabled={isFinishButtonDisabled}>
                {formatMessage(
                  {
                    id: getTrad(`modal.upload-list.footer.button.${filesToUploadLength > 1 ? 'plural' : 'singular'}`),
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