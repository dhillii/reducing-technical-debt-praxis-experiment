import * as Sentry from '@sentry/ember';
import Component from '@glimmer/component';
import React, {Suspense} from 'react';
import ghostPaths from 'ghost-admin/utils/ghost-paths';
import moment from 'moment-timezone';
import {action} from '@ember/object';
import {didCancel, task} from 'ember-concurrency';
import {inject} from 'ghost-admin/decorators/inject';
import {inject as service} from '@ember/service';

/**
 * File type definitions used for uploads.
 */
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
 * Lock icon component.
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
 * Dollar icon component.
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
 * Decorates a search result item with formatted date and visibility icons.
 * @param {Object} item - Search result item.
 * @param {Object} settings - Site settings.
 */
export function decoratePostSearchResult(item, settings) {
    const date = moment.utc(item.publishedAt).tz(settings.timezone).format('D MMM YYYY');
    item.metaText = date;

    if (!settings.membersEnabled || !item.visibility) {
        return;
    }

    switch (item.visibility) {
        case 'members':
            item.MetaIcon = LockIcon;
            item.metaIconTitle = 'Members only';
            break;
        case 'paid':
            item.MetaIcon = DollarIcon;
            item.metaIconTitle = 'Paid-members only';
            break;
        case 'tiers':
            item.MetaIcon = DollarIcon;
            item.metaIconTitle = 'Specific tiers only';
            break;
        default:
            break;
    }
}

/**
 * Fetches the URLs of all active offers.
 * @returns {Promise<Array<{label:string,value:string}>>}
 */
export async function offerUrls() {
    try {
        const offers = await this.fetchOffersTask.perform();
        return offers.map((offer) => ({
            label: `Offer — ${offer.name}`,
            value: this.config.getSiteUrl(offer.code)
        }));
    } catch {
        return [];
    }
}

/**
 * Error boundary component for React.
 */
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

/**
 * Resolve a possibly relative URL against the admin root.
 * @param {string|null} importUrl
 * @param {Object} ghostPathsService
 * @returns {string|null}
 */
function resolveUrl(importUrl, ghostPathsService) {
    if (!importUrl) {
        return null;
    }
    if (importUrl.startsWith('/')) {
        return (
            window.location.origin +
            ghostPathsService.adminRoot.replace(/\/$/, '') +
            importUrl
        );
    }
    return importUrl;
}

/**
 * Guard predicate for Stripe enablement.
 * @param {Object} settings
 * @param {Object} config
 * @returns {boolean}
 */
function isStripeEnabled(settings, config) {
    const hasDirectKeys = !!(settings.stripeSecretKey && settings.stripePublishableKey);
    const hasConnectKeys = !!(settings.stripeConnectSecretKey && settings.stripeConnectPublishableKey);
    return config.stripeDirect ? hasDirectKeys : hasDirectKeys || hasConnectKeys;
}

/**
 * Predicate to determine if a search term is empty.
 * @param {string} term
 * @returns {boolean}
 */
function isEmptyTerm(term) {
    return !term;
}

/**
 * Predicate to check if a group is Posts or Pages.
 * @param {Object} group
 * @returns {boolean}
 */
function isPostsOrPagesGroup(group) {
    return group.groupName === 'Posts' || group.groupName === 'Pages';
}

/**
 * Predicate to check if a group is Staff.
 * @param {Object} group
 * @returns {boolean}
 */
function isStaffGroup(group) {
    return group.groupName === 'Staff';
}

/**
 * Predicate to check if an item is published.
 * @param {Object} item
 * @returns {boolean}
 */
function isPublished(item) {
    return item.status === 'published';
}

/**
 * Predicate to check if a URL points to a 404 page.
 * @param {Object} item
 * @returns {boolean}
 */
function isNot404(item) {
    return !/\/404\//.test(item.url);
}

/**
 * Fetch embed data via oEmbed endpoint.
 * @param {Object} instance - KoenigLexicalEditor instance.
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<any>}
 */
async function fetchEmbed(instance, url, {type}) {
    const oembedEndpoint = instance.ghostPaths.url.api('oembed');
    const response = await instance.ajax.request(oembedEndpoint, {
        data: {url, type}
    });
    return response;
}

/**
 * Generate default autocomplete links.
 * @param {Object} instance
 * @returns {Array<{label:string,value:string}>}
 */
function getDefaultAutocompleteLinks(instance) {
    return [
        {label: 'Homepage', value: window.location.origin + '/'},
        {label: 'Free signup', value: '#/portal/signup/free'}
    ];
}

/**
 * Generate member-specific autocomplete links.
 * @param {Object} instance
 * @returns {Array<{label:string,value:string}>}
 */
function getMemberLinks(instance) {
    if (!instance.membersUtils.paidMembersEnabled) {
        return [];
    }
    return [
        {label: 'Paid signup', value: '#/portal/signup'},
        {label: 'Upgrade or change plan', value: '#/portal/account/plans'}
    ];
}

/**
 * Generate donation autocomplete link.
 * @param {Object} instance
 * @returns {Array<{label:string,value:string}>}
 */
function getDonationLink(instance) {
    if (!instance.settings.donationsEnabled) {
        return [];
    }
    return [{label: 'Tips and donations', value: '#/portal/support'}];
}

/**
 * Generate recommendation autocomplete link.
 * @param {Object} instance
 * @returns {Array<{label:string,value:string}>}
 */
function getRecommendationLink(instance) {
    if (!instance.settings.recommendationsEnabled) {
        return [];
    }
    return [{label: 'Recommendations', value: '#/portal/recommendations'}];
}

/**
 * Fetch autocomplete links for the editor.
 * @param {Object} instance
 * @returns {Promise<Array<{label:string,value:string}>>}
 */
async function fetchAutocompleteLinks(instance) {
    const defaults = getDefaultAutocompleteLinks(instance);
    const memberLinks = getMemberLinks(instance);
    const donationLink = getDonationLink(instance);
    const recommendationLink = getRecommendationLink(instance);
    const offersLinks = await offerUrls.call(instance);
    return [...defaults, ...memberLinks, ...donationLink, ...recommendationLink, ...offersLinks];
}

/**
 * Fetch label names.
 * @param {Object} instance
 * @returns {Promise<Array<string>>}
 */
async function fetchLabels(instance) {
    try {
        const labels = await instance.fetchLabelsTask.perform();
        return labels.map((label) => label.name);
    } catch (e) {
        if (didCancel(e)) {
            return [];
        }
        throw e;
    }
}

/**
 * Search links based on a term.
 * @param {Object} instance
 * @param {string} term
 * @returns {Promise<Array<Object>>}
 */
async function searchLinks(instance, term) {
    if (isEmptyTerm(term)) {
        if (instance.defaultLinks) {
            return instance.defaultLinks;
        }

        const posts = await instance.store.query('post', {
            filter: 'status:published',
            fields: 'id,url,title,visibility,published_at',
            order: 'published_at desc',
            limit: 5
        });

        const results = posts.toArray().map((post) => ({
            groupName: 'Latest posts',
            id: post.id,
            title: post.title,
            url: post.url,
            visibility: post.visibility,
            publishedAt: post.publishedAtUTC.toISOString()
        }));

        results.forEach((item) => decoratePostSearchResult(item, instance.settings));

        instance.defaultLinks = [{label: 'Latest posts', items: results}];
        return instance.defaultLinks;
    }

    let rawResults;
    try {
        rawResults = await instance.search.searchTask.perform(term);
    } catch (error) {
        if (!didCancel(error)) {
            throw error;
        }
        return [];
    }

    const filtered = [];

    rawResults.forEach((group) => {
        let items = group.options;

        if (isPostsOrPagesGroup(group)) {
            items = items.filter(isPublished);
        }

        if (isStaffGroup(group)) {
            items = items.filter(isNot404);
        }

        if (items.length === 0) {
            return;
        }

        if (isPostsOrPagesGroup(group)) {
            items.forEach((item) => decoratePostSearchResult(item, instance.settings));
        }

        filtered.push({label: group.groupName, items});
    });

    return filtered;
}

/**
 * Default card configuration builder.
 * @param {Object} instance
 * @param {Object} props
 * @returns {Object}
 */
function buildCardConfig(instance, props) {
    const unsplashHeaders = {
        Authorization: `Client-ID 8672af113b0a8573edae3aa3713886265d9bb741d707f6c01a486cde8c278980`,
        'Accept-Version': 'v1',
        'Content-Type': 'application/json',
        'App-Pragma': 'no-cache',
        'X-Unsplash-Cache': true
    };

    const defaultCardConfig = {
        unsplash: instance.settings.unsplash ? unsplashHeaders : null,
        tenor: instance.config.tenor?.googleApiKey ? instance.config.tenor : null,
        fetchAutocompleteLinks: () => fetchAutocompleteLinks(instance),
        fetchEmbed: (url, opts) => fetchEmbed(instance, url, opts),
        fetchLabels: () => fetchLabels(instance),
        renderLabels: !instance.session.user.isContributor,
        feature: {transistor: instance.feature.transistor},
        deprecated: {headerV1: true},
        membersEnabled: instance.settings.membersSignupAccess === 'all',
        searchLinks: (term) => searchLinks(instance, term),
        siteTitle: instance.settings.title,
        siteDescription: instance.settings.description,
        siteUrl: instance.config.getSiteUrl('/'),
        stripeEnabled: isStripeEnabled(instance.settings, instance.config)
    };

    return Object.assign({}, defaultCardConfig, props.cardConfig, {pinturaConfig: instance.pinturaConfig});
}

/**
 * Hook for uploading files.
 * @param {Object} instance
 * @param {string} type
 * @returns {Object}
 */
function useFileUpload(instance, type = 'image') {
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
        progressTracker.current.forEach((value) => {
            total += value;
        });
        setProgress(Math.round(total / progressTracker.current.size));
    }

    function defaultValidator(file) {
        if (type === 'file') {
            return true;
        }
        let extensions = fileTypes[type].extensions;
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

    function validate(files = []) {
        const results = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const outcome = defaultValidator(file);
            if (outcome !== true) {
                results.push({fileName: file.name, message: outcome});
            }
        }
        return results;
    }

    async function _uploadFile(file, {formData = {}} = {}) {
        progressTracker.current.set(file, 0);
        const fileFormData = new FormData();
        fileFormData.append('file', file, file.name);
        Object.keys(formData).forEach((key) => {
            fileFormData.append(key, formData[key]);
        });
        const url = `${ghostPaths().apiRoot}${fileTypes[type].endpoint}`;
        try {
            const requestMethod = fileTypes[type].requestMethod || 'post';
            const response = await instance.ajax[requestMethod](url, {
                data: fileFormData,
                processData: false,
                contentType: false,
                dataType: 'text',
                xhr: () => {
                    const xhr = new window.XMLHttpRequest();
                    xhr.upload.addEventListener(
                        'progress',
                        (event) => {
                            if (event.lengthComputable) {
                                progressTracker.current.set(
                                    file,
                                    (event.loaded / event.total) * 100
                                );
                                updateProgress();
                            }
                        },
                        false
                    );
                    return xhr;
                }
            });

            progressTracker.current.set(file, 100);
            updateProgress();

            let uploadResponse;
            try {
                uploadResponse = JSON.parse(response);
            } catch (error) {
                if (!(error instanceof SyntaxError)) {
                    throw error;
                }
            }

            let responseUrl;
            if (uploadResponse) {
                const resource = uploadResponse[fileTypes[type].resourceName];
                if (resource && Array.isArray(resource) && resource[0]) {
                    responseUrl = resource[0].url;
                }
            }

            return {url: responseUrl, fileName: file.name};
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
        const validationResult = validate(files);
        if (validationResult.length) {
            setErrors(validationResult);
            setLoading(false);
            setProgress(100);
            return null;
        }

        const promises = files.map((file) => _uploadFile(file, options));

        try {
            const results = await Promise.all(promises);
            setProgress(100);
            progressTracker.current.clear();
            setLoading(false);
            setErrors([]);
            return results;
        } catch (error) {
            console.error(error); // eslint-disable-line no-console
            setErrors([...errors, error]);
            setLoading(false);
            setProgress(100);
            progressTracker.current.clear();
            return null;
        }
    }

    return {progress, isLoading, upload, errors, filesNumber};
}

/**
 * Wrapper component for the Koenig editor.
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
        return this.settings.pintura ? this.config.pintura?.js || this.settings.pinturaJsUrl : null;
    }

    get pinturaCSSUrl() {
        return this.settings.pintura ? this.config.pintura?.css || this.settings.pinturaCssUrl : null;
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
        return resolveUrl(this.pinturaJsUrl, this.ghostPaths);
    }

    getImageEditorCSSUrl() {
        return resolveUrl(this.pinturaCSSUrl, this.ghostPaths);
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
        this.offers = yield this.store.query('offer', {
            filter: 'status:active+redemption_type:signup'
        });
        return this.offers;
    }

    @task({restartable: false})
    *fetchLabelsTask() {
        if (this.labels) {
            return this.labels;
        }
        this.labels = yield this.store.query('label', {
            limit: 'all',
            fields: 'id, name'
        });
        return this.labels;
    }

    ReactComponent = (props) => {
        const cardConfig = buildCardConfig(this, props);
        const {useFileUpload} = {useFileUpload: (type) => useFileUpload(this, type)};

        const KGEditorComponent = ({isInitInstance}) => {
            const containerStyle = isInitInstance ? {display: 'none'} : {};
            const secondaryAttr = isInitInstance ? true : false;

            return (
                <div data-secondary-instance={secondaryAttr} style={containerStyle}>
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
                        <WordCountPlugin
                            editorResource={this.editorResource}
                            onChange={isInitInstance ? () => {} : this.args.updateWordCount}
                        />
                        <TKCountPlugin
                            editorResource={this.editorResource}
                            onChange={isInitInstance ? () => {} : this.args.updatePostTkCount}
                        />
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