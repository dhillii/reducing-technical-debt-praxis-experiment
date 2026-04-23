import * as Sentry from '@sentry/ember';
import Component from '@glimmer/component';
import React, {Suspense} from 'react';
import ghostPaths from 'ghost-admin/utils/ghost-paths';
import moment from 'moment-timezone';
import {action} from '@ember/object';
import {didCancel, task} from 'ember-concurrency';
import {inject} from 'ghost-admin/decorators/inject';
import {inject as service} from '@ember/service';

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

function LockIcon({...props}) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" {...props}>
            <g transform="matrix(0.6666666666666666,0,0,0.6666666666666666,0,0)">
                <path fill="currentColor" d="M19.5,9.5h-.75V6.75a6.75,6.75,0,0,0-13.5,0V9.5H4.5a2,2,0,0,0-2,2V22a2,2,0,0,0,2,2h15a2,2,0,0,0,2-2V11.5A2,2,0,0,0,19.5,9.5Zm-7.5,9a2,2,0,1,1,2-2A2,2,0,0,1,12,18.5ZM16.25,9a.5.5,0,0,1-.5.5H8.25a.5.5,0,0,1-.5-.5V6.75a4.25,4.25,0,0,1,8.5,0Z"></path>
            </g>
        </svg>
    );
}

function DollarIcon({...props}) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 24 24" {...props}>
            <g fill="currentColor" class="nc-icon-wrapper">
                <path
                    d="M13,10.265V5.013a9.722,9.722,0,0,1,2.6.722l1.342.662,1.327-2.69-1.345-.663A12.4,12.4,0,0,0,13,1.989V0H11V1.983c-3.537.306-5.773,2.3-5.773,5.264,0,3.726,3.174,4.85,5.773,5.577V18.09a15.77,15.77,0,0,1-4.24-.819l-1.411-.509L4.33,19.583l1.411.51A18.577,18.577,0,0,0,11,21.1V24h2V21.087c5.125-.431,5.708-3.776,5.708-5.264C18.708,12.129,15.587,10.993,13,10.265ZM8.227,7.247c0-1.6,1.6-2.1,2.773-2.249V9.69C9.1,9.092,8.227,8.523,8.227,7.247ZM13,18.072V13.4c1.857.591,2.708,1.161,2.708,2.422C15.708,16.382,15.7,17.769,13,18.072Z"
                    fill="currentColor"
                ></path>
            </g>
        </svg>
    );
}

/**
 * Decorates a post search result with metadata.
 * @param {object} item - The post search result.
 * @param {object} settings - The application settings.
 */
export function decoratePostSearchResult(item, settings) {
    const date = moment.utc(item.publishedAt).tz(settings.timezone).format('D MMM YYYY');

    item.metaText = date;

    if (settings.membersEnabled && item.visibility) {
        if (item.visibility === 'members') {
            item.MetaIcon = LockIcon;
            item.metaIconTitle = 'Members only';
        } else if (item.visibility === 'paid') {
            item.MetaIcon = DollarIcon;
            item.metaIconTitle = 'Paid-members only';
        } else if (item.visibility === 'tiers') {
            item.MetaIcon = DollarIcon;
            item.metaIconTitle = 'Specific tiers only';
        }
    }
}

/**
 * Fetches the URLs of all active offers.
 * @returns {Promise<{label: string, value: string}[]>}
 */
export async function offerUrls() {
    let offers = [];

    try {
        offers = await this.fetchOffersTask.perform();
    } catch (e) {
        // No-op: if offers are not available (e.g. missing permissions), return an empty array
        return [];
    }

    return offers.map((offer) => {
        return {
            label: `Offer — ${offer.name}`,
            value: this.config.getSiteUrl(offer.code)
        };
    });
}

class ErrorHandler extends React.Component {
    state = {
        hasError: false
    };

    static getDerivedStateFromError() {
        return {hasError: true};
    }

    componentDidCatch(error) {
        if (this.props.config.sentry_dsn) {
            Sentry.captureException(error, {
                tags: {
                    lexical: true
                }
            });
        }

        console.error(error); // eslint-disable-line
    }

    render() {
        if (this.state.hasError) {
            return (
                <p className="koenig-react-editor-error">Loading has failed. Try refreshing the browser!</p>
            );
        }

        return this.props.children;
    }
}

const KoenigComposer = ({editorResource, ...props}) => {
    const {KoenigComposer: _KoenigComposer} = editorResource.read();
    return <_KoenigComposer {...props} />;
};

const KoenigEditor = ({editorResource, ...props}) => {
    const {KoenigEditor: _KoenigEditor} = editorResource.read();
    return <_KoenigEditor {...props} />;
};

const WordCountPlugin = ({editorResource, ...props}) => {
    const {WordCountPlugin: _WordCountPlugin} = editorResource.read();
    return <_WordCountPlugin {...props} />;
};

const TKCountPlugin = ({editorResource, ...props}) => {
    const {TKCountPlugin: _TKCountPlugin} = editorResource.read();
    return <_TKCountPlugin {...props} />;
};

/**
 * Returns the Pintura JS URL.
 * @returns {string|null}
 */
function getPinturaJsUrl(settings, config) {
    if (!settings.pintura) {
        return null;
    }
    return config.pintura?.js || settings.pinturaJsUrl;
}

/**
 * Returns the Pintura CSS URL.
 * @returns {string|null}
 */
function getPinturaCssUrl(settings, config) {
    if (!settings.pintura) {
        return null;
    }
    return config.pintura?.css || settings.pinturaCssUrl;
}

/**
 * Returns the Pintura configuration.
 * @returns {object|null}
 */
function getPinturaConfig(ghostPaths, pinturaJsUrl, pinturaCssUrl) {
    if (!pinturaJsUrl || !pinturaCssUrl) {
        return null;
    }
    return {
        jsUrl: pinturaJsUrl,
        cssUrl: pinturaCssUrl
    };
}

/**
 * Returns the image editor JS URL.
 * @returns {string|null}
 */
function getImageEditorJsUrl(ghostPaths, pinturaJsUrl) {
    if (!pinturaJsUrl) {
        return null;
    }
    if (pinturaJsUrl.startsWith('/')) {
        return window.location.origin + ghostPaths.adminRoot.replace(/\/$/, '') + pinturaJsUrl;
    }
    return pinturaJsUrl;
}

/**
 * Returns the image editor CSS URL.
 * @returns {string|null}
 */
function getImageEditorCssUrl(ghostPaths, pinturaCssUrl) {
    if (!pinturaCssUrl) {
        return null;
    }
    if (pinturaCssUrl.startsWith('/')) {
        return window.location.origin + ghostPaths.adminRoot.replace(/\/$/, '') + pinturaCssUrl;
    }
    return pinturaCssUrl;
}

/**
 * Fetches the URLs of all active offers.
 * @returns {Promise<{label: string, value: string}[]>}
 */
async function fetchOffers(ajax, store) {
    try {
        const offers = await store.query('offer', {filter: 'status:active+redemption_type:signup'});
        return offers;
    } catch (e) {
        // No-op: if offers are not available (e.g. missing permissions), return an empty array
        return [];
    }
}

/**
 * Fetches the labels.
 * @returns {Promise<string[]>}
 */
async function fetchLabels(store) {
    try {
        const labels = await store.query('label', {limit: 'all', fields: 'id, name'});
        return labels.map(label => label.name);
    } catch (e) {
        // Do not throw cancellation errors
        if (didCancel(e)) {
            return;
        }
        throw e;
    }
}

/**
 * Searches for links.
 * @param {string} term - The search term.
 * @returns {Promise<{label: string, items: object[]}[]>}
 */
async function searchLinks(term, store, search, settings) {
    if (!term) {
        const posts = await store.query('post', {filter: 'status:published', fields: 'id,url,title,visibility,published_at', order: 'published_at desc', limit: 5});
        const results = posts.toArray().map(post => ({
            groupName: 'Latest posts',
            id: post.id,
            title: post.title,
            url: post.url,
            visibility: post.visibility,
            publishedAt: post.publishedAtUTC.toISOString()
        }));
        results.forEach(item => decoratePostSearchResult(item, settings));
        return [{label: 'Latest posts', items: results}];
    }

    let results = [];

    try {
        results = await search.searchTask.perform(term);
    } catch (error) {
        // don't surface task cancellation errors
        if (!didCancel(error)) {
            throw error;
        }
        return;
    }

    const filteredResults = [];
    results.forEach((group) => {
        let items = group.options;

        if (group.groupName === 'Posts' || group.groupName === 'Pages') {
            items = items.filter(i => i.status === 'published');
        }

        if (group.groupName === 'Staff') {
            items = items.filter(i => !/\/404\//.test(i.url));
        }

        if (items.length === 0) {
            return;
        }

        if (group.groupName === 'Posts' || group.groupName === 'Pages') {
            items.forEach(item => decoratePostSearchResult(item, settings));
        }

        filteredResults.push({
            label: group.groupName,
            items
        });
    });

    return filteredResults;
}

/**
 * Checks if Stripe is enabled.
 * @returns {boolean}
 */
function isStripeEnabled(settings, config) {
    const hasDirectKeys = !!(settings.stripeSecretKey && settings.stripePublishableKey);
    const hasConnectKeys = !!(settings.stripeConnectSecretKey && settings.stripeConnectPublishableKey);

    if (config.stripeDirect) {
        return hasDirectKeys;
    }
    return hasDirectKeys || hasConnectKeys;
}

/**
 * Returns the default card configuration.
 * @returns {object}
 */
function getDefaultCardConfig(settings, config, feature, session, store, search, ghostPaths) {
    return {
        unsplash: settings.unsplash ? {
            defaultHeaders: {
                Authorization: `Client-ID 8672af113b0a8573edae3aa3713886265d9bb741d707f6c01a486cde8c278980`,
                'Accept-Version': 'v1',
                'Content-Type': 'application/json',
                'App-Pragma': 'no-cache',
                'X-Unsplash-Cache': true
            }
        } : null,
        tenor: config.tenor?.googleApiKey ? config.tenor : null,
        fetchAutocompleteLinks: async () => {
            const defaults = [
                {label: 'Homepage', value: window.location.origin + '/'},
                {label: 'Free signup', value: '#/portal/signup/free'}
            ];

            const memberLinks = () => {
                let links = [];
                if (settings.membersSignupAccess === 'all') {
                    links = [
                        {
                            label: 'Paid signup',
                            value: '#/portal/signup'
                        },
                        {
                            label: 'Upgrade or change plan',
                            value: '#/portal/account/plans'
                        }];
                }

                return links;
            };

            const donationLink = () => {
                if (settings.donationsEnabled) {
                    return [{
                        label: 'Tips and donations',
                        value: '#/portal/support'
                    }];
                }

                return [];
            };

            const recommendationLink = () => {
                if (settings.recommendationsEnabled) {
                    return [{
                        label: 'Recommendations',
                        value: '#/portal/recommendations'
                    }];
                }

                return [];
            };

            const offersLinks = await fetchOffers(store, ajax);
            offersLinks = offersLinks.map((offer) => {
                return {
                    label: `Offer — ${offer.name}`,
                    value: config.getSiteUrl(offer.code)
                };
            });

            return [...defaults, ...memberLinks(), ...donationLink(), ...recommendationLink(), ...offersLinks];
        },
        fetchEmbed: async (url, {type}) => {
            let oembedEndpoint = ghostPaths.url.api('oembed');
            let response = await ajax.request(oembedEndpoint, {
                data: {url, type}
            });
            return response;
        },
        fetchLabels: async () => {
            let labels = await fetchLabels(store);
            return labels;
        },
        renderLabels: !session.user.isContributor,
        feature: {
            transistor: feature.transistor
        },
        deprecated: { // todo fix typo
            headerV1: true // if false, shows header v1 in the menu
        },
        membersEnabled: settings.membersSignupAccess === 'all',
        searchLinks: async (term) => {
            return searchLinks(term, store, search, settings);
        },
        siteTitle: settings.title,
        siteDescription: settings.description,
        siteUrl: config.getSiteUrl('/'),
        stripeEnabled: isStripeEnabled(settings, config)
    };
}

/**
 * Returns the card configuration.
 * @returns {object}
 */
function getCardConfig(defaultCardConfig, props, pinturaConfig) {
    return Object.assign({}, defaultCardConfig, props.cardConfig, {pinturaConfig});
}

/**
 * Uploads a file.
 * @param {File} file - The file to upload.
 * @param {object} options - The upload options.
 * @returns {Promise<{url: string, fileName: string}>}
 */
async function uploadFile(file, options, ajax, ghostPaths, fileTypes) {
    const fileFormData = new FormData();
    fileFormData.append('file', file, file.name);

    Object.keys(options.formData || {}).forEach((key) => {
        fileFormData.append(key, options.formData[key]);
    });

    const url = `${ghostPaths.apiRoot}${fileTypes.endpoint}`;

    try {
        const requestMethod = fileTypes.requestMethod || 'post';
        const response = await ajax[requestMethod](url, {
            data: fileFormData,
            processData: false,
            contentType: false,
            dataType: 'text',
            xhr: () => {
                const xhr = new window.XMLHttpRequest();

                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        // update progress
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
            const resource = uploadResponse[fileTypes.resourceName];
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

/**
 * Validates a file.
 * @param {File} file - The file to validate.
 * @param {object} fileTypes - The file types.
 * @returns {string|true}
 */
function validateFile(file, fileTypes) {
    if (fileTypes.type === 'file') {
        return true;
    }
    let extensions = fileTypes.extensions;
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

/**
 * Uploads multiple files.
 * @param {File[]} files - The files to upload.
 * @param {object} options - The upload options.
 * @returns {Promise<{url: string, fileName: string}[]>}
 */
async function uploadFiles(files, options, ajax, ghostPaths, fileTypes) {
    const uploadPromises = [];

    for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        uploadPromises.push(uploadFile(file, options, ajax, ghostPaths, fileTypes));
    }

    try {
        const uploadResult = await Promise.all(uploadPromises);
        return uploadResult;
    } catch (error) {
        console.error(error); // eslint-disable-line

        throw error;
    }
}

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
    contentKey = null;
    defaultLinks = null;

    editorResource = this.koenig.resource;

    get pinturaJsUrl() {
        return getPinturaJsUrl(this.settings, this.config);
    }

    get pinturaCssUrl() {
        return getPinturaCssUrl(this.settings, this.config);
    }

    get pinturaConfig() {
        const jsUrl = this.getImageEditorJsUrl();
        const cssUrl = this.getImageEditorCssUrl();
        return getPinturaConfig(this.ghostPaths, jsUrl, cssUrl);
    }

    getImageEditorJsUrl() {
        return getImageEditorJsUrl(this.ghostPaths, this.pinturaJsUrl);
    }

    getImageEditorCssUrl() {
        return getImageEditorCssUrl(this.ghostPaths, this.pinturaCssUrl);
    }

    @action
    onError(error) {
        console.error(error); // eslint-disable-line

        if (this.config.sentry_dsn) {
            Sentry.captureException(error, {
                tags: {lexical: true},
                contexts: {
                    koenig: {
                        version: window['@tryghost/koenig-lexical']?.version
                    }
                }
            });
        }
    }

    @task({restartable: false})
    *fetchOffersTask() {
        if (this.offers) {
            return this.offers;
        }

        this.offers = yield fetchOffers(this.ajax, this.store);
        return this.offers;
    }

    @task({restartable: false})
    *fetchLabelsTask() {
        if (this.labels) {
            return this.labels;
        }

        this.labels = yield fetchLabels(this.store);
        return this.labels;
    }

    ReactComponent = (props) => {
        const defaultCardConfig = getDefaultCardConfig(this.settings, this.config, this.feature, this.session, this.store, this.search, this.ghostPaths);
        const cardConfig = getCardConfig(defaultCardConfig, props, this.pinturaConfig);

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

                progressTracker.current.forEach(value => totalProgress += value);

                setProgress(Math.round(totalProgress / progressTracker.current.size));
            }

            const upload = async (files = [], options = {}) => {
                setFilesNumber(files.length);
                setLoading(true);

                const validationResult = files.map(file => validateFile(file, fileTypes[type]));

                if (validationResult.includes(false)) {
                    setErrors(validationResult.filter(result => result !== true));
                    setLoading(false);
                    setProgress(100);

                    return null;
                }

                try {
                    const uploadResult = await uploadFiles(files, options, this.ajax, this.ghostPaths, fileTypes[type]);
                    setProgress(100);
                    progressTracker.current.clear();

                    setLoading(false);

                    setErrors([]); // components expect array of objects: { fileName: string, message: string }[]

                    return uploadResult;
                } catch (error) {
                    console.error(error); // eslint-disable-line

                    setErrors([...errors, error]);
                    setLoading(false);
                    setProgress(100);
                    progressTracker.current.clear();

                    return null;
                }
            };

            return {progress, isLoading, upload, errors, filesNumber};
        };

        const KGEditorComponent = ({isInitInstance}) => {
            return (
                <div data-secondary-instance={isInitInstance ? true : false} style={isInitInstance ? {display: 'none'} : {}}>
                    <KoenigComposer
                        editorResource={this.editorResource}
                        cardConfig={cardConfig}
                        fileUploader={{useFileUpload, fileTypes}}
                        initialEditorState={this.args.lexical}
                        onError={this.onError}
                        darkMode={this.feature.nightShift}
                        isTKEnabled={true}
                    >
                        <KoenigEditor
                            editorResource={this.editorResource}
                            cursorDidExitAtTop={isInitInstance ? null : this.args.cursorDidExitAtTop}
                            placeholderText={isInitInstance ? null : this.args.placeholderText}
                            darkMode={isInitInstance ? null : this.feature.nightShift}
                            onChange={isInitInstance ? this.args.updateSecondaryInstanceModel : this.args.onChange}
                            registerAPI={isInitInstance ? this.args.registerSecondaryAPI : this.args.registerAPI}
                        />
                        <WordCountPlugin editorResource={this.editorResource} onChange={isInitInstance ? () => {} : this.args.updateWordCount} />
                        <TKCountPlugin editorResource={this.editorResource} onChange={isInitInstance ? () => {} : this.args.updatePostTkCount} />
                    </KoenigComposer>
                </div>
            );
        };

        return (
            <div className={['koenig-react-editor', 'koenig-lexical', this.args.className].filter(Boolean).join(' ')}>
                <ErrorHandler config={this.config}>
                    <Suspense fallback={<p className="koenig-react-editor-loading">Loading editor...</p>}>
                        <KGEditorComponent />
                        <KGEditorComponent isInitInstance={true} />
                    </Suspense>
                </ErrorHandler>
            </div>
        );
    };
}