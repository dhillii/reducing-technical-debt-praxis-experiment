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
 * Determines if item has members-only visibility
 * @param {Object} item - The item to check
 * @returns {boolean}
 */
function isMembersOnlyVisibility(item) {
    return item.visibility === 'members';
}

/**
 * Determines if item has paid-members visibility
 * @param {Object} item - The item to check
 * @returns {boolean}
 */
function isPaidMembersVisibility(item) {
    return item.visibility === 'paid';
}

/**
 * Determines if item has tier-specific visibility
 * @param {Object} item - The item to check
 * @returns {boolean}
 */
function isTierSpecificVisibility(item) {
    return item.visibility === 'tiers';
}

/**
 * Determines if members feature is enabled and item has visibility
 * @param {Object} settings - Settings object
 * @param {Object} item - The item to check
 * @returns {boolean}
 */
function shouldDecorateWithVisibility(settings, item) {
    return settings.membersEnabled && item.visibility;
}

/**
 * Applies visibility decoration to search result item
 * @param {Object} item - The item to decorate
 */
function applyMembersOnlyDecoration(item) {
    item.MetaIcon = LockIcon;
    item.metaIconTitle = 'Members only';
}

/**
 * Applies paid members decoration to search result item
 * @param {Object} item - The item to decorate
 */
function applyPaidMembersDecoration(item) {
    item.MetaIcon = DollarIcon;
    item.metaIconTitle = 'Paid-members only';
}

/**
 * Applies tier-specific decoration to search result item
 * @param {Object} item - The item to decorate
 */
function applyTierSpecificDecoration(item) {
    item.MetaIcon = DollarIcon;
    item.metaIconTitle = 'Specific tiers only';
}

export function decoratePostSearchResult(item, settings) {
    const date = moment.utc(item.publishedAt).tz(settings.timezone).format('D MMM YYYY');
    item.metaText = date;

    if (!shouldDecorateWithVisibility(settings, item)) {
        return;
    }

    if (isMembersOnlyVisibility(item)) {
        applyMembersOnlyDecoration(item);
        return;
    }

    if (isPaidMembersVisibility(item)) {
        applyPaidMembersDecoration(item);
        return;
    }

    if (isTierSpecificVisibility(item)) {
        applyTierSpecificDecoration(item);
    }
}

/**
 * Fetches the URLs of all active offers
 * @returns {Promise<{label: string, value: string}[]>}
 */
export async function offerUrls() {
    let offers = [];

    try {
        offers = await this.fetchOffersTask.perform();
    } catch (e) {
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
        return {
            jsUrl,
            cssUrl
        };
    }

    getImageEditorJSUrl() {
        let importUrl = this.pinturaJsUrl;

        if (!importUrl) {
            return null;
        }

        if (importUrl.startsWith('/')) {
            importUrl = window.location.origin + this.ghostPaths.adminRoot.replace(/\/$/, '') + importUrl;
        }
        return importUrl;
    }

    getImageEditorCSSUrl() {
        let cssImportUrl = this.pinturaCSSUrl;

        if (!cssImportUrl) {
            return null;
        }

        if (cssImportUrl.startsWith('/')) {
            cssImportUrl = window.location.origin + this.ghostPaths.adminRoot.replace(/\/$/, '') + cssImportUrl;
        }
        return cssImportUrl;
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
            let oembedEndpoint = this.ghostPaths.url.api('oembed');
            let response = await this.ajax.request(oembedEndpoint, {
                data: {url, type}
            });
            return response;
        };

        const buildMemberLinks = () => {
            if (!this.membersUtils.paidMembersEnabled) {
                return [];
            }

            return [
                {
                    label: 'Paid signup',
                    value: '#/portal/signup'
                },
                {
                    label: 'Upgrade or change plan',
                    value: '#/portal/account/plans'
                }
            ];
        };

        const buildDonationLink = () => {
            if (!this.settings.donationsEnabled) {
                return [];
            }

            return [{
                label: 'Tips and donations',
                value: '#/portal/support'
            }];
        };

        const buildRecommendationLink = () => {
            if (!this.settings.recommendationsEnabled) {
                return [];
            }

            return [{
                label: 'Recommendations',
                value: '#/portal/recommendations'
            }];
        };

        const fetchAutocompleteLinks = async () => {
            const defaults = [
                {label: 'Homepage', value: window.location.origin + '/'},
                {label: 'Free signup', value: '#/portal/signup/free'}
            ];

            const memberLinks = buildMemberLinks();
            const donationLink = buildDonationLink();
            const recommendationLink = buildRecommendationLink();
            const offersLinks = await offerUrls.call(this);

            return [...defaults, ...memberLinks, ...donationLink, ...recommendationLink, ...offersLinks];
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

        const isPublishedPost = (item) => item.status === 'published';

        const isValidStaffUrl = (item) => !/\/404\//.test(item.url);

        const shouldFilterByStatus = (groupName) => groupName === 'Posts' || groupName === 'Pages';

        const shouldFilterByUrl = (groupName) => groupName === 'Staff';

        const filterResultsByGroup = (group) => {
            let items = group.options;

            if (shouldFilterByStatus(group.groupName)) {
                items = items.filter(isPublishedPost);
            }

            if (shouldFilterByUrl(group.groupName)) {
                items = items.filter(isValidStaffUrl);
            }

            return items;
        };

        const decorateGroupItems = (group, items) => {
            if (shouldFilterByStatus(group.groupName)) {
                items.forEach(item => decoratePostSearchResult(item, this.settings));
            }
        };

        const buildFilteredResults = (results) => {
            const filteredResults = [];

            results.forEach((group) => {
                const items = filterResultsByGroup(group);

                if (items.length === 0) {
                    return;
                }

                decorateGroupItems(group, items);

                filteredResults.push({
                    label: group.groupName,
                    items
                });
            });

            return filteredResults;
        };

        const searchLinks = async (term) => {
            if (!term) {
                if (this.defaultLinks) {
                    return this.defaultLinks;
                }

                const posts = await this.store.query('post', {filter: 'status:published', fields: 'id,url,title,visibility,published_at', order: 'published_at desc', limit: 5});
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

            return buildFilteredResults(results);
        };

        const unsplashConfig = {
            defaultHeaders: {
                Authorization: `Client-ID 8672af113b0a8573edae3aa3713886265d9bb741d707f6c01a486cde8c278980`,
                'Accept-Version': 'v1',
                'Content-Type': 'application/json',
                'App-Pragma': 'no-cache',
                'X-Unsplash-Cache': true
            }
        };

        const hasDirectStripeKeys = () => !!(this.settings.stripeSecretKey && this.settings.stripePublishableKey);

        const hasConnectStripeKeys = () => !!(this.settings.stripeConnectSecretKey && this.settings.stripeConnectPublishableKey);

        const checkStripeEnabled = () => {
            const hasDirectKeys = hasDirectStripeKeys();
            const hasConnectKeys = hasConnectStripeKeys();

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
        const cardConfig = Object.assign({}, defaultCardConfig, props.cardConfig, {pinturaConfig: this.pinturaConfig});

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

                let totalProgress = 0;
                progressTracker.current.forEach(value => totalProgress += value);
                setProgress(Math.round(totalProgress / progressTracker.current.size));
            };

            const isFileType = (fileType) => fileType === 'file';

            const getFileExtension = (fileName) => {
                const match = (/(?:\.([^.]+))?$/).exec(fileName);
                return match[1];
            };

            const hasValidExtensions = (extensions) => extensions && Array.isArray(extensions);

            const normalizeExtensions = (extensions) => {
                if (!Array.isArray(extensions)) {
                    return extensions.split(',');
                }
                return extensions;
            };

            const isExtensionValid = (extension, extensions) => {
                return extension && extensions.indexOf(extension.toLowerCase()) !== -1;
            };

            const buildExtensionError = (extensions) => {
                const validExtensions = `.${extensions.join(', .').toUpperCase()}`;
                return `The file type you uploaded is not supported. Please use ${validExtensions}`;
            };

            const defaultValidator = (file) => {
                if (isFileType(type)) {
                    return true;
                }

                let extensions = fileTypes[type].extensions;
                let extension = getFileExtension(file.name);

                if (!hasValidExtensions(extensions)) {
                    return true;
                }

                extensions = normalizeExtensions(extensions);

                if (!isExtensionValid(extension, extensions)) {
                    return buildExtensionError(extensions);
                }

                return true;
            };

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

            const parseUploadResponse = (response) => {
                try {
                    return JSON.parse(response);
                } catch (error) {
                    if (error instanceof SyntaxError) {
                        return null;
                    }
                    throw error;
                }
            };

            const extractResponseUrl = (uploadResponse) => {
                if (!uploadResponse) {
                    return null;
                }

                const resource = uploadResponse[fileTypes[type].resourceName];
                if (resource && Array.isArray(resource) && resource[0]) {
                    return resource[0].url;
                }

                return null;
            };

            const buildErrorResult = (error, fileName) => {
                const message = error.payload?.errors?.[0]?.message || error.message || '';
                const context = error.payload?.errors?.[0]?.context || '';

                return {
                    message,
                    context,
                    fileName
                };
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
                    const response = await this.ajax[requestMethod](url, {
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

                    progressTracker.current.set(file, 100);
                    updateProgress();

                    const uploadResponse = parseUploadResponse(response);
                    const responseUrl = extractResponseUrl(uploadResponse);

                    return {
                        url: responseUrl,
                        fileName: file.name
                    };
                } catch (error) {
                    console.error(error); // eslint-disable-line

                    const errorResult = buildErrorResult(error, file.name);
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
                    setErrors([]);

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

        const buildKGEditorProps = (isInitInstance) => {
            return {
                cursorDidExitAtTop: isInitInstance ? null : this.args.cursorDidExitAtTop,
                placeholderText: isInitInstance ? null : this.args.placeholderText,
                darkMode: isInitInstance ? null : this.feature.nightShift,
                onChange: isInitInstance ? this.args.updateSecondaryInstanceModel : this.args.onChange,
                registerAPI: isInitInstance ? this.args.registerSecondaryAPI : this.args.registerAPI
            };
        };

        const buildWordCountPluginProps = (isInitInstance) => {
            return {
                onChange: isInitInstance ? () => {} : this.args.updateWordCount
            };
        };

        const buildTKCountPluginProps = (isInitInstance) => {
            return {
                onChange: isInitInstance ? () => {} : this.args.updatePostTkCount
            };
        };

        const KGEditorComponent = ({isInitInstance}) => {
            const editorProps = buildKGEditorProps(isInitInstance);
            const wordCountProps = buildWordCountPluginProps(isInitInstance);
            const tkCountProps = buildTKCountPluginProps(isInitInstance);

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
                            {...editorProps}
                        />
                        <WordCountPlugin editorResource={this.editorResource} {...wordCountProps} />
                        <TKCountPlugin editorResource={this.editorResource} {...tkCountProps} />
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
```