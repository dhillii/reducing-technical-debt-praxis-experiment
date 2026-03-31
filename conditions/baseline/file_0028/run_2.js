```javascript
import * as Sentry from '@sentry/ember';
import Component from '@glimmer/component';
import React, {Suspense} from 'react';
import ghostPaths from 'ghost-admin/utils/ghost-paths';
import moment from 'moment-timezone';
import {action} from '@ember/object';
import {didCancel, task} from 'ember-concurrency';
import {inject} from 'ghost-admin/decorators/inject';
import {inject as service} from '@ember/service';

// ─── Constants ───────────────────────────────────────────────────────────────

export const fileTypes = {
    image: {
        mimeTypes: ['image/gif', 'image/jpg', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'],
        extensions: ['gif', 'jpg', 'jpeg', 'png', 'svg', 'svgz', 'webp'],
        endpoint: '/images/upload/',
        resourceName: 'images'
    },
    video: {
        mimeTypes: ['video/mp4', 'video/webm', 'video/ogg'],
        extensions: ['mp4', 'webm', 'ogv'],
        endpoint: '/media/upload/',
        resourceName: 'media'
    },
    audio: {
        mimeTypes: ['audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/vnd.wav', 'audio/wave', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a'],
        extensions: ['mp3', 'wav', 'ogg', 'm4a'],
        endpoint: '/media/upload/',
        resourceName: 'media'
    },
    mediaThumbnail: {
        mimeTypes: ['image/gif', 'image/jpg', 'image/jpeg', 'image/png', 'image/webp'],
        extensions: ['gif', 'jpg', 'jpeg', 'png', 'webp'],
        endpoint: '/media/thumbnail/upload/',
        requestMethod: 'put',
        resourceName: 'media'
    },
    file: {
        endpoint: '/files/upload/',
        resourceName: 'files'
    }
};

const VISIBILITY_CONFIG = {
    members: {Icon: LockIcon, title: 'Members only'},
    paid: {Icon: DollarIcon, title: 'Paid-members only'},
    tiers: {Icon: DollarIcon, title: 'Specific tiers only'}
};

// ─── Icons ───────────────────────────────────────────────────────────────────

function LockIcon(props) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" {...props}>
            <g transform="matrix(0.6666666666666666,0,0,0.6666666666666666,0,0)">
                <path fill="currentColor" d="M19.5,9.5h-.75V6.75a6.75,6.75,0,0,0-13.5,0V9.5H4.5a2,2,0,0,0-2,2V22a2,2,0,0,0,2,2h15a2,2,0,0,0,2-2V11.5A2,2,0,0,0,19.5,9.5Zm-7.5,9a2,2,0,1,1,2-2A2,2,0,0,1,12,18.5ZM16.25,9a.5.5,0,0,1-.5.5H8.25a.5.5,0,0,1-.5-.5V6.75a4.25,4.25,0,0,1,8.5,0Z" />
            </g>
        </svg>
    );
}

function DollarIcon(props) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 24 24" {...props}>
            <g fill="currentColor" className="nc-icon-wrapper">
                <path fill="currentColor" d="M13,10.265V5.013a9.722,9.722,0,0,1,2.6.722l1.342.662,1.327-2.69-1.345-.663A12.4,12.4,0,0,0,13,1.989V0H11V1.983c-3.537.306-5.773,2.3-5.773,5.264,0,3.726,3.174,4.85,5.773,5.577V18.09a15.77,15.77,0,0,1-4.24-.819l-1.411-.509L4.33,19.583l1.411.51A18.577,18.577,0,0,0,11,21.1V24h2V21.087c5.125-.431,5.708-3.776,5.708-5.264C18.708,12.129,15.587,10.993,13,10.265ZM8.227,7.247c0-1.6,1.6-2.1,2.773-2.249V9.69C9.1,9.092,8.227,8.523,8.227,7.247ZM13,18.072V13.4c1.857.591,2.708,1.161,2.708,2.422C15.708,16.382,15.7,17.769,13,18.072Z" />
            </g>
        </svg>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function decoratePostSearchResult(item, settings) {
    item.metaText = moment.utc(item.publishedAt).tz(settings.timezone).format('D MMM YYYY');

    if (!settings.membersEnabled || !item.visibility) {
        return;
    }

    const visibilityConfig = VISIBILITY_CONFIG[item.visibility];
    if (visibilityConfig) {
        item.MetaIcon = visibilityConfig.Icon;
        item.metaIconTitle = visibilityConfig.title;
    }
}

export async function offerUrls() {
    try {
        const offers = await this.fetchOffersTask.perform();
        return offers.map(offer => ({
            label: `Offer — ${offer.name}`,
            value: this.config.getSiteUrl(offer.code)
        }));
    } catch (e) {
        return [];
    }
}

// ─── React Components ─────────────────────────────────────────────────────────

class ErrorHandler extends React.Component {
    state = {hasError: false};

    static getDerivedStateFromError() {
        return {hasError: true};
    }

    componentDidCatch(error) {
        if (this.props.config.sentry_dsn) {
            Sentry.captureException(error, {tags: {lexical: true}});
        }
        console.error(error); // eslint-disable-line
    }

    render() {
        if (this.state.hasError) {
            return <p className="koenig-react-editor-error">Loading has failed. Try refreshing the browser!</p>;
        }
        return this.props.children;
    }
}

function createEditorResourceComponent(componentName) {
    return function EditorResourceComponent({editorResource, ...props}) {
        const Component = editorResource.read()[componentName];
        return <Component {...props} />;
    };
}

const KoenigComposer = createEditorResourceComponent('KoenigComposer');
const KoenigEditor = createEditorResourceComponent('KoenigEditor');
const WordCountPlugin = createEditorResourceComponent('WordCountPlugin');
const TKCountPlugin = createEditorResourceComponent('TKCountPlugin');

// ─── File Upload Hook ─────────────────────────────────────────────────────────

function validateFileExtension(file, type) {
    if (type === 'file') {
        return true;
    }

    let extensions = fileTypes[type]?.extensions;
    if (!extensions) {
        return true;
    }

    if (!Array.isArray(extensions)) {
        extensions = extensions.split(',');
    }

    const [, extension] = (/(?:\.([^.]+))?$/).exec(file.name);
    if (!extension || !extensions.includes(extension.toLowerCase())) {
        const validExtensions = `.${extensions.join(', .').toUpperCase()}`;
        return `The file type you uploaded is not supported. Please use ${validExtensions}`;
    }

    return true;
}

function validateFiles(files, type) {
    return files.reduce((errors, file) => {
        const result = validateFileExtension(file, type);
        if (result !== true) {
            errors.push({fileName: file.name, message: result});
        }
        return errors;
    }, []);
}

function resolveAbsoluteUrl(url, adminRoot) {
    if (url?.startsWith('/')) {
        return window.location.origin + adminRoot.replace(/\/$/, '') + url;
    }
    return url;
}

function useFileUpload(ajax, type = 'image') {
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
        let total = 0;
        progressTracker.current.forEach(v => (total += v));
        setProgress(Math.round(total / progressTracker.current.size));
    }

    function createXhrWithProgress(file) {
        return () => {
            const xhr = new window.XMLHttpRequest();
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    progressTracker.current.set(file, (event.loaded / event.total) * 100);
                    updateProgress();
                }
            }, false);
            return xhr;
        };
    }

    function buildFormData(file, extraFormData = {}) {
        const formData = new FormData();
        formData.append('file', file, file.name);
        Object.entries(extraFormData).forEach(([key, value]) => formData.append(key, value));
        return formData;
    }

    function parseUploadResponse(response, type) {
        try {
            const parsed = JSON.parse(response);
            const resource = parsed?.[fileTypes[type].resourceName];
            return Array.isArray(resource) ? resource[0]?.url : undefined;
        } catch (error) {
            if (!(error instanceof SyntaxError)) {
                throw error;
            }
        }
    }

    async function _uploadFile(file, {formData = {}} = {}) {
        progressTracker.current.set(file, 0);

        const url = `${ghostPaths().apiRoot}${fileTypes[type].endpoint}`;
        const requestMethod = fileTypes[type].requestMethod || 'post';

        try {
            const response = await ajax[requestMethod](url, {
                data: buildFormData(file, formData),
                processData: false,
                contentType: false,
                dataType: 'text',
                xhr: createXhrWithProgress(file)
            });

            progressTracker.current.set(file, 100);
            updateProgress();

            return {url: parseUploadResponse(response, type), fileName: file.name};
        } catch (error) {
            console.error(error); // eslint-disable-line
            const message = error.payload?.errors?.[0]?.message || error.message || '';
            const context = error.payload?.errors?.[0]?.context || '';
            throw {message, context, fileName: file.name};
        }
    }

    async function upload(files = [], options = {}) {
        setFilesNumber(files.length);
        setLoading(true);

        const validationErrors = validateFiles(Array.from(files), type);
        if (validationErrors.length) {
            setErrors(validationErrors);
            setLoading(false);
            setProgress(100);
            return null;
        }

        try {
            const results = await Promise.all(Array.from(files).map(file => _uploadFile(file, options)));
            setProgress(100);
            setLoading(false);
            setErrors([]);
            progressTracker.current.clear();
            return results;
        } catch (error) {
            console.error(error); // eslint-disable-line
            setErrors(prev => [...prev, error]);
            setLoading(false);
            setProgress(100);
            progressTracker.current.clear();
            return null;
        }
    }

    return {progress, isLoading, upload, errors, filesNumber};
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default class KoenigLexicalEditor extends Component {
    @service ajax;
    @service feature;
    @service ghostPaths;
    @service koenig;
    @service membersUtils;
    @service search;
    @service session;
    @service settings;
    @service store;

    @inject config;

    offers = null;
    labels = null;
    contentKey = null;
    defaultLinks = null;

    editorResource = this.koenig.resource;

    // ─── Pintura ───────────────────────────────────────────────────────

    get pinturaJsUrl() {
        return this.settings.pintura ? (this.config.pintura?.js || this.settings.pinturaJsUrl) : null;
    }

    get pinturaCSSUrl() {
        return this.settings.pintura ? (this.config.pintura?.css || this.settings.pinturaCssUrl) : null;
    }

    get pinturaConfig() {
        const jsUrl = this._resolveAdminUrl(this.pinturaJsUrl);
        const cssUrl = this._resolveAdminUrl(this.pinturaCSSUrl);
        return jsUrl && cssUrl ? {jsUrl, cssUrl} : null;
    }

    _resolveAdminUrl(url) {
        return resolveAbsoluteUrl(url, this.ghostPaths.adminRoot);
    }

    // ─── Error Handling ────────────────────────────────────────────────

    @action
    onError(error) {
        console.error(error); // eslint-disable-line
        if (this.config.sentry_dsn) {
            Sentry.captureException(error, {
                tags: {lexical: true},
                contexts: {koenig: {version: window['@tryghost/koenig-lexical']?.version}}
            });
        }
    }

    // ─── Tasks ────────────────────────────────────────────────────────

    @task({restartable: false})
    *fetchOffersTask() {
        if (this.offers) {
            return this.offers;
        }
        this.offers = yield this.store.query('offer', {filter: 'status:active+redemption_type:signup'});
        return this.offers;
    }

    @task({restartable: false})
    *fetchLabelsTask() {
        if (this.labels) {
            return this.labels;
        }
        this.labels = yield this.store.query('label', {limit: 'all', fields: 'id, name'});
        return this.labels;
    }

    // ─── Autocomplete / Search ────────────────────────────────────────

    async _fetchEmbed(url, {type}) {
        const oembedEndpoint = this.ghostPaths.url.api