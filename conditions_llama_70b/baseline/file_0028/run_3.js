const createXhr = () => {
    const xhr = new window.XMLHttpRequest();
    return xhr;
};

const addProgressEventListener = (xhr, progressTracker, file) => {
    xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
            progressTracker.current.set(file, (event.loaded / event.total) * 100);
            updateProgress();
        }
    }, false);
};

const updateProgress = (progressTracker) => {
    if (progressTracker.current.size === 0) {
        return 0;
    }

    let totalProgress = 0;

    progressTracker.current.forEach(value => totalProgress += value);

    return Math.round(totalProgress / progressTracker.current.size);
};

const useFileUpload = (type = 'image') => {
    const [progress, setProgress] = React.useState(0);
    const [isLoading, setLoading] = React.useState(false);
    const [errors, setErrors] = React.useState([]);
    const [filesNumber, setFilesNumber] = React.useState(0);

    const progressTracker = React.useRef(new Map());

    function defaultValidator(file) {
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

    const validate = (files = []) => {
        const validationResult = [];

        for (let i = 0; i < files.length; i += 1) {
            let file = files[i];
            let result = defaultValidator(file);
            if (result === true) {
                continue;
            }

            validationResult.push({fileName: file.name, message: result});
        }

        return validationResult;
    };

    const _uploadFile = async (file, {formData = {}} = {}) => {
        progressTracker.current[file] = 0;

        const fileFormData = new FormData();
        fileFormData.append('file', file, file.name);

        Object.keys(formData || {}).forEach((key) => {
            fileFormData.append(key, formData[key]);
        });

        const url = `${ghostPaths().apiRoot}${fileTypes[type].endpoint}`;

        try {
            const requestMethod = fileTypes[type].requestMethod || 'post';
            const xhr = createXhr();
            addProgressEventListener(xhr, progressTracker, file);
            const response = await this.ajax[requestMethod](url, {
                data: fileFormData,
                processData: false,
                contentType: false,
                dataType: 'text',
                xhr: () => xhr
            });

            // force tracker progress to 100% in case we didn't get a final event
            progressTracker.current.set(file, 100);
            setProgress(updateProgress(progressTracker));

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

        const validationResult = validate(files);

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
};