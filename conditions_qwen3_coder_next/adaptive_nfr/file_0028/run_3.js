xhr: () => {
    const xhr = new window.XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) {
            return;
        }
        progressTracker.current.set(file, (event.loaded / event.total) * 100);
        updateProgress();
    }, false);

    return xhr;
}