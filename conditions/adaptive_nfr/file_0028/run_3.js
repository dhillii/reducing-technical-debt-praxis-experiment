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
 * @param {Object} settings - The settings object
 * @param {Object} item - The item to check
 * @returns {boolean}
 */
function shouldDecorateWithVisibility(settings, item) {
    return settings.membersEnabled && item.visibility;
}

/**
 * Applies members-only icon and title to item
 * @param {Object} item - The item to decorate
 */
function decorateAsMembersOnly(item) {
    item.MetaIcon = LockIcon;
    item.metaIconTitle = 'Members only';
}

/**
 * Applies paid-members icon and title to item
 * @param {Object} item - The item to decorate
 */
function decorateAsPaidMembers(item) {
    item.MetaIcon = DollarIcon;
    item.metaIconTitle = 'Paid-members only';
}

/**
 * Applies tier-specific icon and title to item
 * @param {Object} item - The item to decorate
 */
function decorateAsTierSpecific(item) {
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
        decorateAsMembersOnly(item);
        return;
    }

    if (isPaidMembersVisibility(item)) {
        decorateAsPaidMembers(item);
        return;
    }

    if (isTierSpecificVisibility(item)) {
        decorateAsTierSpecific(item);
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

        const isPublishedPost = (post) => post.status === 'published';

        const isValidStaffUrl = (staffItem) => !/\/404\//.test(staffItem.url);

        const filterPostsAndPages = (items) => items.filter(isPublishedPost);

        const filterStaffItems = (items) => items.filter(isValidStaffUrl);

        const shouldFilterByStatus = (groupName) => groupName === 'Posts' || groupName === 'Pages';

        const shouldFilterByUrl = (groupName) => groupName === 'Staff';

        const filterGroupItems = (group) => {
            let items = group.options;