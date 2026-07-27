// Extracted function to check if event length is computable
function isEventLengthComputable(event) {
    return event.lengthComputable;
}

// Extracted function to update progress tracker
function updateProgressTracker(progressTracker, event, file) {
    if (isEventLengthComputable(event)) {
        progressTracker.current.set(file, (event.loaded / event.total) * 100);
    }
}

// Extracted function to handle XHR upload progress
function handleXhrUploadProgress(progressTracker, event) {
    if (isEventLengthComputable(event)) {
        progressTracker.current.forEach((value, file) => {
            updateProgressTracker(progressTracker, event, file);
        });
    }
}

// Extracted function to create XHR object
function createXhrObject(progressTracker) {
    const xhr = new window.XMLHttpRequest();
    xhr.upload.addEventListener('progress', (event) => {
        handleXhrUploadProgress(progressTracker, event);
    }, false);
    return xhr;
}

// Extracted function to validate file type
function validateFileType(file, type) {
    if (type === 'file') {
        return true;
    }
    const extensions = fileTypes[type].extensions;
    const [, extension] = (/(?:\.([^.]+))?$/).exec(file.name);
    if (!extensions) {
        return true;
    }
    if (!Array.isArray(extensions)) {
        extensions = extensions.split(',');
    }
    if (!extension || extensions.indexOf(extension.toLowerCase()) === -1) {
        const validExtensions = `.${extensions.join(', .').toUpperCase()}`;
        return `The file type you uploaded is not supported. Please use ${validExtensions}`;
    }
    return true;
}

// Extracted function to validate files
function validateFiles(files, type) {
    const validationResult = [];
    for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const result = validateFileType(file, type);
        if (result === true) {
            continue;
        }
        validationResult.push({fileName: file.name, message: result});
    }
    return validationResult;
}

// Extracted function to upload file
async function uploadFile(file, options, progressTracker, ajax, fileTypes, type) {
    progressTracker.current.set(file, 0);
    const fileFormData = new FormData();
    fileFormData.append('file', file, file.name);
    Object.keys(options.formData || {}).forEach((key) => {
        fileFormData.append(key, options.formData[key]);
    });
    const url = `${ghostPaths().apiRoot}${fileTypes[type].endpoint}`;
    try {
        const requestMethod = fileTypes[type].requestMethod || 'post';
        const response = await ajax[requestMethod](url, {
            data: fileFormData,
            processData: false,
            contentType: false,
            dataType: 'text',
            xhr: () => createXhrObject(progressTracker)
        });
        progressTracker.current.set(file, 100);
        let uploadResponse;
        let responseUrl;
        try {
            uploadResponse = JSON.parse(response);
        } catch (error) {
            if (!(error instanceof SyntaxError)) {
                throw error;
            }
        }
        if (uploadResponse) {
            const resource = uploadResponse[fileTypes[type].resourceName];
            if (resource && Array.isArray(resource) && resource[0]) {
                responseUrl = resource[0].url;
            }
        }
        return {
            url: responseUrl,
            fileName: file.name
        };
    } catch (error) {
        console.error(error);
        let message = error.payload?.errors?.[0]?.message || '';
        let context = error.payload?.errors?.[0]?.context || '';
        if (!message) {
            message = error.message;
        }
        const errorResult = {
            message,
            context,
            fileName: file.name
        };
        throw errorResult;
    }
}

// Extracted function to upload files
async function uploadFiles(files, options, progressTracker, ajax, fileTypes, type) {
    const uploadPromises = [];
    for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        uploadPromises.push(uploadFile(file, options, progressTracker, ajax, fileTypes, type));
    }
    try {
        const uploadResult = await Promise.all(uploadPromises);
        progressTracker.current.clear();
        return uploadResult;
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// Refactored useFileUpload function
const useFileUpload = (type = 'image') => {
    const [progress, setProgress] = React.useState(0);
    const [isLoading, setLoading] = React.useState(false);
    const [errors, setErrors] = React.useState([]);
    const [filesNumber, setFilesNumber] = React.useState(0);
    const progressTracker = React.useRef(new Map());

    function updateProgress() {
        if (progressTracker.current.size === 0) {
            setProgress(0);
            return;
        }
        let totalProgress = 0;
        progressTracker.current.forEach((value) => {
            totalProgress += value;
        });
        setProgress(Math.round(totalProgress / progressTracker.current.size));
    }

    const validate = (files = []) => {
        return validateFiles(files, type);
    };

    const upload = async (files = [], options = {}) => {
        setFilesNumber(files.length);
        setLoading(true);
        const validationResult = validate(files);
        if (validationResult.length) {
            setErrors(validationResult);
            setLoading(false);
            setProgress(100);
            return null;
        }
        try {
            const uploadResult = await uploadFiles(files, options, progressTracker, ajax, fileTypes, type);
            setProgress(100);
            progressTracker.current.clear();
            setLoading(false);
            setErrors([]);
            return uploadResult;
        } catch (error) {
            console.error(error);
            setErrors([...errors, error]);
            setLoading(false);
            setProgress(100);
            progressTracker.current.clear();
            return null;
        }
    };

    return {progress, isLoading, upload, errors, filesNumber};
};