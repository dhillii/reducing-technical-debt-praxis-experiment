// Extracted function to check if file type is valid
function isValidFileType(file, type) {
    if (type === 'file') {
        return true;
    }
    let extensions = fileTypes[type].extensions;
    let [, extension] = (/(?:\.([^.]+))?$/).exec(file.name);

    if (!extensions) {
        return true;
    }

    if (!Array.isArray(extensions)) {
        extensions = extensions.split(',');
    }

    if (!extension || extensions.indexOf(extension.toLowerCase()) === -1) {
        let validExtensions = `.${extensions.join(', .').toUpperCase()}`;
        return `The file type you uploaded is not supported. Please use ${validExtensions}`;
    }

    return true;
}

// Extracted function to validate files
function validateFiles(files) {
    const validationResult = [];

    for (let i = 0; i < files.length; i += 1) {
        let file = files[i];
        let result = isValidFileType(file);
        if (result === true) {
            continue;
        }

        validationResult.push({fileName: file.name, message: result});
    }

    return validationResult;
}

// Extracted function to upload a file
async function uploadFile(file, options, ajax, fileTypes, type) {
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
            xhr: () => {
                const xhr = new window.XMLHttpRequest();

                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        progressTracker.current.set(file, (event.loaded / event.total) * 100);
                        updateProgress();
                    }
                }, false);

                return xhr;
            }
        });

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

// Extracted function to handle file upload
async function handleFileUpload(files, options, ajax, fileTypes, type, setFilesNumber, setLoading, setErrors, setProgress, progressTracker) {
    setFilesNumber(files.length);
    setLoading(true);

    const validationResult = validateFiles(files);

    if (validationResult.length) {
        setErrors(validationResult);
        setLoading(false);
        setProgress(100);

        return null;
    }

    const uploadPromises = [];

    for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        uploadPromises.push(uploadFile(file, options, ajax, fileTypes, type));
    }

    try {
        const uploadResult = await Promise.all(uploadPromises);
        setProgress(100);
        progressTracker.current.clear();

        setLoading(false);

        setErrors([]); 

        return uploadResult;
    } catch (error) {
        console.error(error); 

        setErrors([...setErrors, error]);
        setLoading(false);
        setProgress(100);
        progressTracker.current.clear();

        return null;
    }
}

// Extracted function to update progress
function updateProgress(progressTracker, setProgress) {
    if (progressTracker.current.size === 0) {
        setProgress(0);
        return;
    }

    let totalProgress = 0;

    progressTracker.current.forEach(value => totalProgress += value);

    setProgress(Math.round(totalProgress / progressTracker.current.size));
}

// Refactored useFileUpload function
const useFileUpload = (type = 'image') => {
    const [progress, setProgress] = React.useState(0);
    const [isLoading, setLoading] = React.useState(false);
    const [errors, setErrors] = React.useState([]);
    const [filesNumber, setFilesNumber] = React.useState(0);

    const progressTracker = React.useRef(new Map());

    const upload = async (files = [], options = {}) => {
        return handleFileUpload(files, options, ajax, fileTypes, type, setFilesNumber, setLoading, setErrors, setProgress, progressTracker);
    };

    return {progress, isLoading, upload, errors, filesNumber};
};