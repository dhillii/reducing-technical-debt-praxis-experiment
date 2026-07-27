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

// Extracted function to validate files
function validateFiles(files, type, fileTypes) {
    const validationResult = [];

    for (let i = 0; i < files.length; i += 1) {
        let file = files[i];
        let result = defaultValidator(file, type, fileTypes);
        if (result === true) {
            continue;
        }

        validationResult.push({fileName: file.name, message: result});
    }

    return validationResult;
}

// Extracted function to handle default validation
function defaultValidator(file, type, fileTypes) {
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

// ...

const useFileUpload = (type = 'image') => {
    const [progress, setProgress] = React.useState(0);
    const [isLoading, setLoading] = React.useState(false);
    const [errors, setErrors] = React.useState([]);
    const [filesNumber, setFilesNumber] = React.useState(0);

    const progressTracker = createProgressTracker();

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
            uploadPromises.push(uploadFile(file, {progressTracker, setProgress, ...options}, ajax, fileTypes, type));
        }

        try {
            const uploadResult = await Promise.all(uploadPromises);
            setProgress(100);
            progressTracker.clear();

            setLoading(false);

            setErrors([]); 

            return uploadResult;
        } catch (error) {
            console.error(error); 

            setErrors([...errors, error]);
            setLoading(false);
            setProgress(100);
            progressTracker.clear();

            return null;
        }
    };

    return {progress, isLoading, upload, errors, filesNumber};
};