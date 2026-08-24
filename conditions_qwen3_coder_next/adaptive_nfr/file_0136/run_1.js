import React, { useCallback, useEffect, useState, useReducer, useRef } from 'react';
import axios from 'axios';
import PropTypes from 'prop-types';
import { isEqual, isEmpty, get } from 'lodash';
import { Modal, ModalFooter, PopUpWarning, useGlobalContext, request } from 'strapi-helper-plugin';
import { Button } from '@buffetjs/core';
import pluginId from '../../pluginId';
import {
  getFilesToDownload,
  getTrad,
  getYupError,
} from '../../utils';
import { useAppContext } from '../../hooks';
import ModalHeader from '../../components/ModalHeader';
import stepper from './stepper';
import init from './init';
import reducer, { initialState } from './reducer';

/**
 * Strategy object for handling file upload/download completion flows
 */
const completionStrategies = {
  upload: {
    handled: ({ filesToUploadLength, toggleRef }) => {
      if (filesToUploadLength === 0) {
        toggleRef.current(true);
      }
    },
    download: async ({ filesToDownload, emitEvent, dispatch }) => {
      if (filesToDownload.length > 0) {
        emitEvent('didSelectFile', { source: 'url', location: 'upload' });
      }

      await Promise.all(
        filesToDownload.map(async file => {
          const { source, fileURL, fileInfo, originalIndex, tempId } = file;

          try {
            const { data } = await axios.get(fileURL, {
              responseType: 'blob',
              cancelToken: source?.token,
              timeout: 60000,
            });

            const createdFile = new File([data], fileInfo.name, { type: data.type });

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
    },
  },
};

/**
 * Strategy object for handling file abort scenarios
 */
const abortStrategies = {
  axios: ({ source }) => {
    source.cancel('Operation canceled by the user.');
  },
  fetch: ({ abortController }) => {
    abortController.abort();
  },
};

/**
 * Strategy object for handling error formatting in upload/download scenarios
 */
const errorStrategies = {
  format({ err, formatMessage }) {
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
  },
};

/**
 * Strategy object for file upload submission logic
 */
const uploadStrategies = {
  prepare({ file, fileInfo, originalName }) {
    const formData = new FormData();
    const headers = {};

    if (originalName === fileInfo.name) {
      set(fileInfo, 'name', null);
    }

    formData.append('files', file);
    formData.append('fileInfo', JSON.stringify(fileInfo));

    return { formData, headers };
  },
  requestURL: () => `/${pluginId}`,
};

/**
 * Strategy object for file editing submission logic
 */
const editStrategies = {
  prepare({ fileToEdit, shouldDuplicateMedia, file }) {
    const headers = {};
    const formData = new FormData();

    const didCropFile = file instanceof File;
    const { abortController, id, fileInfo } = fileToEdit;
    const requestURL = shouldDuplicateMedia ? `/${pluginId}` : `/${pluginId}?id=${id}`;

    if (didCropFile && file) {
      formData.append('files', file);
    }

    formData.append('fileInfo', JSON.stringify(fileInfo));

    return { abortController, id, formData, headers, requestURL };
  },
};

/**
 * Strategy object for handling step navigation
 */
const navigationStrategies = {
  back: ({ prev, goTo }) => goTo(prev),
  next: ({ next, onToggle, goTo }) => {
    if (next === null) {
      onToggle();
    } else {
      goTo(next);
    }
  },
};

/**
 * Strategy object for handling modal取消确认逻辑
 */
const modalCancelStrategies = {
  browse({ filesToUploadLength, formatMessage, handleToggle }) {
    if (filesToUploadLength > 0) {
      const confirm = window.confirm(
        formatMessage({ id: getTrad('window.confirm.close-modal.files') })
      );

      if (!confirm) {
        return;
      }
    }

    handleToggle();
  },
  edit({ initialFileToEdit, fileToEdit, currentStep, formatMessage, handleToggle }) {
    if (!isEqual(initialFileToEdit, fileToEdit) && currentStep === 'edit') {
      const confirm = window.confirm(
        formatMessage({ id: getTrad('window.confirm.close-modal.file') })
      );

      if (!confirm) {
        return;
      }
    }

    handleToggle();
  },
  combined({ initialFileToEdit, fileToEdit, filesToUploadLength, currentStep, formatMessage, handleToggle }) {
    if (filesToUploadLength > 0 || (!isEqual(initialFileToEdit, fileToEdit) && currentStep === 'edit')) {
      return modalCancelStrategies.browse({ filesToUploadLength, formatMessage, handleToggle });
    }
    return modalCancelStrategies.edit({ initialFileToEdit, fileToEdit, currentStep, formatMessage, handleToggle });
  },
};

/**
 * Strategy object for handling form submission validations
 */
const validationStrategies = {
  url({ filesToDownload }) {
    return { filesToDownload: filesToDownload.filter(url => !isEmpty(url)) };
  },
};

/**
 * Strategy object for handling modal close and reset logic
 */
const closeStrategies = {
  base({ setFormErrors, setDisplayNextButton, setShouldRefetch, setIsFormDisabled, dispatch }) {
    setFormErrors(null);
    setDisplayNextButton(false);
    setShouldRefetch(false);
    setIsFormDisabled(false);
    dispatch({ type: 'RESET_PROPS' });
  },
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
      const files = getFilesToDownload(filesToUpload);

      completionStrategies.upload.handled({
        filesToUploadLength,
        toggleRef,
      });

      completionStrategies.upload.download({
        filesToDownload: files,
        emitEvent,
        dispatch,
      });
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

  const handleAbortUpload = () => {
    abortStrategies.fetch({ abortController: fileToEdit.abortController });

    dispatch({
      type: 'ON_ABORT_UPLOAD',
    });
  };

  const handleCancelFileToUpload = fileOriginalIndex => {
    const fileToCancel = filesToUpload.find(file => file.originalIndex === fileOriginalIndex);
    const { source } = fileToCancel;

    if (source) {
      abortStrategies.axios({ source });
    } else {
      abortStrategies.fetch({ abortController: fileToCancel.abortController });
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
    try {
      const validationInput = validationStrategies.url({ filesToDownload });
      await urlSchema.validate(validationInput, { abortEarly: false });

      setFormErrors(null);
      dispatch({
        type: 'ADD_URLS_TO_FILES_TO_UPLOAD',
        nextStep: next,
      });
    } catch (err) {
      const formattedErrors = getYupError(err);
      setFormErrors(formattedErrors?.filesToDownload);
    }
  };

  const handleClickDeleteFile = () => {
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
    closeStrategies.base({
      setFormErrors,
      setDisplayNextButton,
      setShouldRefetch,
      setIsFormDisabled,
      dispatch,
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

    const { abortController, formData, headers, requestURL } = editStrategies.prepare({
      fileToEdit,
      shouldDuplicateMedia,
      file,
    });

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
      const { status, errorMessage } = errorStrategies.format({ err, formatMessage });

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
    modalCancelStrategies.combined({
      initialFileToEdit,
      fileToEdit,
      filesToUploadLength,
      currentStep,
      formatMessage,
      handleToggle: onToggle,
    });
  };

  const handleUploadFiles = async () => {
    dispatch({
      type: 'SET_FILES_UPLOADING_STATE',
    });

    const requests = filesToUpload.map(
      async ({ file, fileInfo, originalName, originalIndex, abortController }) => {
        const { formData, headers } = uploadStrategies.prepare({ file, fileInfo, originalName });

        try {
          await request(
            uploadStrategies.requestURL(),
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
          const { status, errorMessage } = errorStrategies.format({ err, formatMessage });

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
    navigationStrategies.back({ prev, goTo });
  };

  const goNext = () => {
    navigationStrategies.next({ next, onToggle, goTo });
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