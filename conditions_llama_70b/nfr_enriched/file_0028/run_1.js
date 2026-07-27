// Extracted function to handle file upload progress tracking
function createProgressTracker() {
    const progressTracker = new Map();
    return {
        set: (file, progress) => progressTracker.set(file, progress),
        get: (file) => progressTracker.get(file),
        clear: () => progressTracker.clear(),
        size: () => progressTracker.size
    };
}

// Extracted function to update progress
function updateProgress(progressTracker, setProgress) {
    if (progressTracker.size === 0) {
        setProgress(0);
        return;
    }

    let totalProgress = 0;

    progressTracker.forEach(value => totalProgress += value);

    setProgress(Math.round(totalProgress / progressTracker.size));
}

// Extracted function to handle file upload
function uploadFile(file, options, ajax, fileTypes, type) {
    const url = `${ghostPaths().apiRoot}${fileTypes[type].endpoint}`;
    const fileFormData = new FormData();
    fileFormData.append('file', file, file.name);

    Object.keys(options.formData || {}).forEach((key) => {
        fileFormData.append(key, options.formData[key]);
    });

    const requestMethod = fileTypes[type].requestMethod || 'post';

    return ajax[requestMethod](url, {
        data: fileFormData,
        processData: false,
        contentType: false,
        dataType: 'text',
        xhr: () => {
            const xhr = new window.XMLHttpRequest();

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    options.progressTracker.set(file, (event.loaded / event.total) * 100);
                    updateProgress(options.progressTracker, options.setProgress);
                }
            }, false);

            return xhr;
        }
    });
}

// Extracted function to validate file
function validateFile(file, type, fileTypes) {
    // if type is file we don't need to validate since the card can accept any file type
    if (type === 'file') {
        return true;
    }
    let extensions = fileTypes[type].extensions;
    let [, extension] = (/(?:\.([^.]+))?$/).exec(file.name);

    // if extensions is falsy exit early and accept all files
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

// Extracted function to handle file upload validation
function validateFiles(files, type, fileTypes) {
    const validationResult = [];

    for (let i = 0; i < files.length; i += 1) {
        let file = files[i];
        let result = validateFile(file, type, fileTypes);
        if (result === true) {
            continue;
        }

        validationResult.push({fileName: file.name, message: result});
    }

    return validationResult;
}

// Extracted function to handle file upload
function useFileUpload(type = 'image', ajax, fileTypes, ghostPaths) {
    const [progress, setProgress] = React.useState(0);
    const [isLoading, setLoading] = React.useState(false);
    const [errors, setErrors] = React.useState([]);
    const [filesNumber, setFilesNumber] = React.useState(0);

    const progressTracker = React.useRef(createProgressTracker());

    const _uploadFile = async (file, options = {}) => {
        progressTracker.current.set(file, 0);

        try {
            const response = await uploadFile(file, options, ajax, fileTypes, type);

            // force tracker progress to 100% in case we didn't get a final event
            progressTracker.current.set(file, 100);
            updateProgress(progressTracker.current, setProgress);

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
            console.error(error); // eslint-disable-line

            // grab custom error message if present
            let message = error.payload?.errors?.[0]?.message || '';
            let context = error.payload?.errors?.[0]?.context || '';

            // fall back to EmberData/ember-ajax default message for error type
            if (!message) {
                message = error.message;
            }

            // TODO: check for or expose known error types?
            const errorResult = {
                message,
                context,
                fileName: file.name
            };

            throw errorResult;
        }
    };

    const upload = async (files = [], options = {}) => {
        setFilesNumber(files.length);
        setLoading(true);

        const validationResult = validateFiles(files, type, fileTypes);

        if (validationResult.length) {
            setErrors(validationResult);
            setLoading(false);
            setProgress(100);

            return null;
        }

        const uploadPromises = [];

        for (let i = 0; i < files.length; i += 1) {
            const file = files[i];
            uploadPromises.push(_uploadFile(file, options));
        }

        try {
            const uploadResult = await Promise.all(uploadPromises);
            setProgress(100);
            progressTracker.current.clear();

            setLoading(false);

            setErrors([]); // components expect array of objects: { fileName: string, message: string }[]

            return uploadResult;
        } catch (error) {
            console.error(error); // eslint-disable-line no-console

            setErrors([...errors, error]);
            setLoading(false);
            setProgress(100);
            progressTracker.current.clear();

            return null;
        }
    };

    return {progress, isLoading, upload, errors, filesNumber};
}

// ...

class KoenigLexicalEditor extends Component {
    // ...

    ReactComponent = (props) => {
        // ...

        const useFileUploadHandler = useFileUpload('image', this.ajax, fileTypes, this.ghostPaths);

        // ...
    };
}