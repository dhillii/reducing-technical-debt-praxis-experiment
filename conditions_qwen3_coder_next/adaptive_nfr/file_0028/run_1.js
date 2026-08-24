xhr: () => {
                            const xhr = new window.XMLHttpRequest();

                            xhr.upload.addEventListener('progress', (event) => {
                                if (this.isLengthComputable(event)) {
                                    progressTracker.current.set(file, (event.loaded / event.total) * 100);
                                    updateProgress();
                                }
                            }, false);

                            return xhr;
                        }


private isLengthComputable(event) {
    return event.lengthComputable;
}