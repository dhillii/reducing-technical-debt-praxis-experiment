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

export function decoratePostSearchResult(item, settings) {
    const date = moment.utc(item.publishedAt).tz(settings.timezone).format('D MMM YYYY');
    item.metaText = date;

    if (!settings.membersEnabled || !item.visibility) {
        return;
    }

    const visibilityConfig = {
        members: {icon: LockIcon, title: 'Members only'},
        paid: {icon: DollarIcon, title: 'Paid-members only'},
        tiers: {icon: DollarIcon, title: 'Specific tiers only'}
    };

    const config = visibilityConfig[item.visibility];
    if (config) {
        item.MetaIcon = config.icon;
        item.metaIconTitle = config.title;
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

// Helper: Build member links for autocomplete
function buildMemberLinks(membersUtils) {
    if (!membersUtils.paidMembersEnabled) {
        return [];
    }
    return [
        {label: 'Paid signup', value: '#/portal/signup'},
        {label: 'Upgrade or change plan', value: '#/portal/account/plans'}
    ];
}

// Helper: Build donation link for autocomplete
function buildDonationLink(settings) {
    if (!settings.donationsEnabled) {
        return [];
    }
    return [{label: 'Tips and donations', value: '#/portal/support'}];
}

// Helper: Build recommendation link for autocomplete
function buildRecommendationLink(settings) {
    if (!settings.recommendationsEnabled) {
        return [];
    }
    return [{label: 'Recommendations', value: '#/portal/recommendations'}];
}

// Helper: Get default autocomplete links
function getDefaultAutocompleteLinks() {
    return [
        {label: 'Homepage', value: window.location.origin + '/'},
        {label: 'Free signup', value: '#/portal/signup/free'}
    ];
}

// Helper: Validate file extension
function validateFileExtension(file, type) {
    if (type === 'file') {
        return true;
    }

    const extensions = fileTypes[type].extensions;
    const [, extension] = (/(?:\.([^.]+))?$/).exec(file.name);

    if (!extensions) {
        return true;
    }

    const extArray = Array.isArray(extensions) ? extensions : extensions.split(',');

    if (!extension || extArray.indexOf(extension.toLowerCase()) === -1) {
        const validExtensions = `.${extArray.join(', .').toUpperCase()}`;
        return `The file type you uploaded is not supported. Please use ${validExtensions}`;
    }

    return true;
}

// Helper: Parse upload response
function parseUploadResponse(response, type) {
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

    return {url: responseUrl};
}

// Helper: Extract error message from response
function extractErrorMessage(error) {
    const message = error.payload?.errors?.[0]?.message || error.message || '';
    const context = error.payload?.errors?.[0]?.context || '';
    return {message, context};
}

// Helper: Build unsplash config
function buildUnsplashConfig() {
    return {
        defaultHeaders: {
            Authorization: `Client-ID 8672af113b0a8573edae3aa3713886265d9bb741d707f6c01a486cde8c278980`,
            'Accept-Version': 'v1',
            'Content-Type': 'application/json',
            'App-Pragma': 'no-cache',
            'X-Unsplash-Cache': true
        }
    };
}

// Helper: Check if Stripe is enabled
function isStripeEnabled(settings, config) {
    const hasDirectKeys = !!(settings.stripeSecretKey && settings.stripePublishableKey);
    const hasConnectKeys = !!(settings.stripeConnectSecretKey && settings.stripeConnectPublishableKey);

    if (config.stripeDirect) {
        return hasDirectKeys;
    }
    return hasDirectKeys || hasConnectKeys;
}

// Helper: Filter search results by group type
function filterSearchResultsByGroup(group, settings) {
    let items = group.options;

    if (group.groupName === 'Posts' || group.groupName === 'Pages') {
        items = items.filter(i => i.status === 'published');
    }

    if (group.groupName === 'Staff') {
        items = items.filter(i => !/\/404\//.test(i.url));
    }

    return items;
}

// Helper: Decorate search results with metadata
function decorateSearchResults(group, settings) {
    if (group.groupName === 'Posts' || group.groupName === 'Pages') {
        group.items.forEach(item => decoratePostSearchResult(item, settings));
    }
}

// Helper: Build default card config
function buildDefaultCardConfig(settings, config, session, feature, unsplashConfig, checkStripeEnabled) {
    return {
        unsplash: settings.unsplash ? unsplashConfig.defaultHeaders : null,
        tenor: config.tenor?.googleApiKey ? config.tenor : null,
        renderLabels: !session.user.isContributor,
        feature: {
            transistor: feature.transistor
        },
        deprecated: {
            headerV1: true
        },
        membersEnabled: settings.membersSignupAccess === 'all',
        siteTitle: settings.title,
        siteDescription: settings.description,
        siteUrl: config.getSiteUrl('/'),
        stripeEnabled: checkStripeEnabled()
    };
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
            return this.