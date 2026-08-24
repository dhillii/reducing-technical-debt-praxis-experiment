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

/**
 * Renders a lock icon SVG component
 */
function LockIcon({...props}) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" {...props}>
            <g transform="matrix(0.6666666666666666,0,0,0.6666666666666666,0,0)">
                <path fill="currentColor" d="M19.5,9.5h-.75V6.75a6.75,6.75,0,0,0-13.5,0V9.5H4.5a2,2,0,0,0-2,2V22a2,2,0,0,0,2,2h15a2,2,0,0,0,2-2V11.5A2,2,0,0,0,19.5,9.5Zm-7.5,9a2,2,0,1,1,2-2A2,2,0,0,1,12,18.5ZM16.25,9a.5.5,0,0,1-.5.5H8.25a.5.5,0,0,1-.5-.5V6.75a4.25,4.25,0,0,1,8.5,0Z"></path>
            </g>
        </svg>
    );
}

/**
 * Renders a dollar sign icon SVG component
 */
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
 * Decorates a post search result with metadata such as formatted date and visibility indicator
 * @param {Object} item - The post item to decorate
 * @param {Object} settings - Site settings
 * @returns {void}
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
 * Fetches active signup offers and returns formatted URLs for use in autocompletes
 * @returns {Promise<{label: string, value: string}[]>}
 */
export async function offerUrls() {
    let offers = [];

    try {
        offers = await this.fetchOffersTask.perform();
    } catch (e) {
        return [];
    }

    return offers.map((offer) => ({
        label: `Offer — ${offer.name}`,
        value: this.config.getSiteUrl(offer.code)
    }));
}

/**
 * React component for error boundary handling in Lexical editor
 */
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

/**
 * Parsed resource wrapper component
 */
const KoenigComposer = ({editorResource, ...props}) => {
    const {KoenigComposer: _KoenigComposer} = editorResource.read();
    return <_KoenigComposer {...props} />;
};

/**
 * Parsed editor component
 */
const KoenigEditor = ({editorResource, ...props}) => {
    const {KoenigEditor: _KoenigEditor} = editorResource.read();
    return <_KoenigEditor {...props} />;
};

/**
 * Word count plugin wrapper
 */
const WordCountPlugin = ({editorResource, ...props}) => {
    const {WordCountPlugin: _WordCountPlugin} = editorResource.read();
    return <_WordCountPlugin {...props} />;
};

/**
 * TK count plugin wrapper
 */
const TKCountPlugin = ({editorResource, ...props}) => {
    const {TKCountPlugin: _TKCountPlugin} = editorResource.read();
    return <_TKCountPlugin {...props} />;
};

/**
 * Helper to extract and normalize import URL for JS assets
 */
function normalizeImportUrl(possibleRelativeUrl, adminRootPath) {
    if (!possibleRelativeUrl) {
        return null;
    }

    if (possibleRelativeUrl.startsWith('/')) {
        return window.location.origin + adminRootPath.replace(/\/$/, '') + possibleRelativeUrl;
    }

    return possibleRelativeUrl;
}

/**
 * Helper to perform file type validation based on extension
 */
function validateFileByExtension(file, type) {
    if (type === 'file') {
        return true;
    }

    const extensions = fileTypes[type]?.extensions;

    if (!extensions) {
        return true;
    }

    const [, extension] = (/(?:\.([^.]+))?$/).exec(file.name);
    const extensionList = Array.isArray(extensions) ? extensions : extensions.split(',');

    if (!extension || extensionList.indexOf(extension.toLowerCase()) === -1) {
        const validExtensions = `.${extensionList.join(', .').toUpperCase()}`;
        return `The file type you uploaded is not supported. Please use ${validExtensions}`;
    }

    return true;
}

/**
 * Helper to validate multiple files against extension rules
 */
function validateFiles(files, type) {
    const results = [];

    for (const file of files) {
        const result = validateFileByExtension(file, type);
        if (result !== true) {
            results.push({fileName: file.name, message: result});
        }
    }

    return results;
}

/**
 * Helper to map file upload responses to normalized objects
 */
function processUploadResponse(response, type) {
    let resource;

    try {
        resource = JSON.parse(response);
    } catch (e) {
        if (e instanceof SyntaxError) {
            return null;
        }
        throw e;
    }

    const data = resource?.[fileTypes[type]?.resourceName];
    if (!Array.isArray(data) || !data.length) {
        return null;
    }

    return data[0].url;
}

/**
 * Helper to extract error details from API response
 */
function extractUploadErrorDetails(error) {
    let message = error.payload?.errors?.[0]?.message || '';
    let context = error.payload?.errors?.[0]?.context || '';

    if (!message) {
        message = error.message;
    }

    return {message, context};
}

/**
 * Main editor component
 */
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
        if (!this.settings.pintura) {
            return null;
        }
        return this.config.pintura?.js || this.settings.pinturaJsUrl;
    }

    get pinturaCSSUrl() {
        if (!this.settings.pintura) {
            return null;
        }
        return this.config.pintura?.css || this.settings.pinturaCssUrl;
    }

    get pinturaConfig() {
        const jsUrl = this.getImageEditorJSUrl();
        const cssUrl = this.getImageEditorCSSUrl();
        if (!jsUrl || !cssUrl) {
            return null;
        }
        return {jsUrl, cssUrl};
    }

    getImageEditorJSUrl() {
        return normalizeImportUrl(this.pinturaJsUrl, this.ghostPaths.adminRoot);
    }

    getImageEditorCSSUrl() {
        return normalizeImportUrl(this.pinturaCSSUrl, this.ghostPaths.adminRoot);
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

    ReactComponent = (props) => {
        const fetchEmbed = async (url, {type}) => {
            const oembedEndpoint = this.ghostPaths.url.api('oembed');
            const response = await this.ajax.request(oembedEndpoint, {
                data: {url, type}
            });
            return response;
        };

        const fetchKeywords = async () => {
            return [
                {label: 'Homepage', value: window.location.origin + '/'},
                {label: 'Free signup', value: '#/portal/signup/free'}
            ];
        };

        const fetchMemberLinks = () => {
            if (!this.membersUtils.paidMembersEnabled) {
                return [];
            }

            return [
                {label: 'Paid signup', value: '#/portal/signup'},
                {label: 'Upgrade or change plan', value: '#/portal/account/plans'}
            ];
        };

        const fetchDonationLink = () => {
            if (!this.settings.donationsEnabled) {
                return [];
            }

            return [{label: 'Tips and donations', value: '#/portal/support'}];
        };

        const fetchRecommendationLink = () => {
            if (!this.settings.recommendationsEnabled) {
                return [];
            }

            return [{label: 'Recommendations', value: '#/portal/recommendations'}];
        };

        const fetchAutocompleteLinks = async () => {
            const defaults = await fetchKeywords();
            const memberLinks = fetchMemberLinks();
            const donationLink = fetchDonationLink();
            const recommendationLink = fetchRecommendationLink();
            const offers = await offerUrls.call(this);

            return [...defaults, ...memberLinks, ...donationLink, ...recommendationLink, ...offers];
        };

        const fetchLabels = async () => {
            let labels = [];
            try {
                labels = await this.fetchLabelsTask.perform();
            } catch (e) {
                if (didCancel(e)) {
                    return;
                }
                throw e;
            }

            return labels.map(label => label.name);
        };

        const fetchDefaultLinks = async () => {
            const posts = await this.store.query('post', {
                filter: 'status:published',
                fields: 'id,url,title,visibility,published_at',
                order: 'published_at desc',
                limit: 5
            });

            const results = posts.toArray().map(post => ({
                groupName: 'Latest posts',
                id: post.id,
                title: post.title,
                url: post.url,
                visibility: post.visibility,
                publishedAt: post.publishedAtUTC.toISOString()
            }));

            results.forEach(item => decoratePostSearchResult(item, this.settings));

            this.defaultLinks = [{
                label: 'Latest posts',
                items: results
            }];

            return this.defaultLinks;
        };

        const searchLinks = async (term) => {
            if (!term) {
                if (this.defaultLinks) {
                    return this.defaultLinks;
                }

                return fetchDefaultLinks();
            }

            let results = [];

            try {
                results = await this.search.searchTask.perform(term);
            } catch (error) {
                if (!didCancel(error)) {
                    throw error;
                }
                return;
            }

            const processedResults = [];

            for (const group of results) {
                let items = group.options.filter(item => {
                    if (group.groupName === 'Posts' || group.groupName === 'Pages') {
                        return item.status === 'published';
                    }
                    if (group.groupName === 'Staff') {
                        return !/\/404\//.test(item.url);
                    }
                    return true;
                });

                if (!items.length) {
                    continue;
                }

                if (group.groupName === 'Posts' || group.groupName === 'Pages') {
                    items.forEach(item => decoratePostSearchResult(item, this.settings));
                }

                processedResults.push({
                    label: group.groupName,
                    items
                });
            }

            return processedResults;
        };

        const unsplashConfig = {
            defaultHeaders: {
                Authorization: 'Client-ID 8672af113b0a8573edae3aa3713886265d9bb741d707f6c01a486cde8c278980',
                'Accept-Version': 'v1',
                'Content-Type': 'application/json',
                'App-Pragma': 'no-cache',
                'X-Unsplash-Cache': true
            }
        };

        const checkStripeEnabled = () => {
            const hasDirectKeys = !!(this.settings.stripeSecretKey && this.settings.stripePublishableKey);
            const hasConnectKeys = !!(this.settings.stripeConnectSecretKey && this.settings.stripeConnectPublishableKey);

            if (this.config.stripeDirect) {
                return hasDirectKeys;
            }

            return hasDirectKeys || hasConnectKeys;
        };

        const defaultCardConfig = {
            unsplash: this.settings.unsplash ? unsplashConfig.defaultHeaders : null,
            tenor: this.config.tenor?.googleApiKey ? this.config.tenor : null,
            fetchAutocompleteLinks,
            fetchEmbed,
            fetchLabels,
            renderLabels: !this.session.user.isContributor,
            feature: {
                transistor: this.feature.transistor
            },
            deprecated: {
                headerV1: true
            },
            membersEnabled: this.settings.membersSignupAccess === 'all',
            searchLinks,
            siteTitle: this.settings.title,
            siteDescription: this.settings.description,
            siteUrl: this.config.getSiteUrl('/'),
            stripeEnabled: checkStripeEnabled()
        };

        const cardConfig = {
            ...defaultCardConfig,
            ...props.cardConfig,
            pinturaConfig: this.pinturaConfig
        };

        const useFileUpload = (type = 'image') => {
            const [progress, setProgress] = React.useState(0);
            const [isLoading, setLoading] = React.useState(false);
            const [errors, setErrors] = React.useState([]);
            const [filesNumber, setFilesNumber] = React.useState(0);
            const progressTracker = React.useRef(new Map());

            const updateProgress = () => {
                if (progressTracker.current.size === 0) {
                    setProgress(0);
                    return;
                }

                const total = Array.from(progressTracker.current.values()).reduce((acc, val) => acc + val, 0);
                setProgress(Math.round(total / progressTracker.current.size));
            };

            const validate = (files) => validateFiles(files, type);

            const _uploadFile = async (file, options = {}) => {
                progressTracker.current.set(file, 0);
                const formData = new FormData();
                formData.append('file', file, file.name);

                Object.entries(options.formData || {}).forEach(([key, value]) => {
                    formData.append(key, value);
                });

                const url = `${ghostPaths().apiRoot}${fileTypes[type].endpoint}`;
                const method = fileTypes[type].requestMethod || 'post';

                try {
                    const response = await this.ajax[method](url, {
                        data: formData,
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

                    progressTracker.current.set(file, 100);
                    updateProgress();

                    const responseUrl = processUploadResponse(response, type);

                    return {
                        url: responseUrl,
                        fileName: file.name
                    };
                } catch (error) {
                    console.error(error); // eslint-disable-line
                    const {message, context} = extractUploadErrorDetails(error);

                    throw {
                        message,
                        context,
                        fileName: file.name
                    };
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

                const uploadPromises = files.map(file => _uploadFile(file, options));

                try {
                    const results = await Promise.all(uploadPromises);
                    progressTracker.current.clear();
                    setProgress(100);
                    setLoading(false);
                    setErrors([]);
                    return results;
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

        const KGEditorComponent = ({isInitInstance = false}) => {
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