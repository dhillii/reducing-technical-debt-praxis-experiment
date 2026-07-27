downloadFilesRef.current = async () => {
  const files = getFilesToDownload(filesToUpload);

  // Emit event when the users download files from url
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
  } catch (err) {
    console.error('Error downloading files:', err);
    dispatch({
      type: 'SET_DOWNLOAD_ERROR',
      error: err,
    });
  }
};