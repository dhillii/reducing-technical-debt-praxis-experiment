import * as Sentry from '@sentry/ember';
import Component from '@glimmer/component';
import React, {Suspense, useState, useRef} from 'react';
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

function LockIcon(props) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" {...props}>
            <g transform="matrix(0.6666666666666666,0,0,0.6666666666666666,0,0)">
                <path fill="currentColor" d="M19.5,9.5h-.75V6.75a6.75,6.75,0,0,0-13.5,0V9.5H4.5a2,2,0,0,0-2,2V22a2,2,0,0,0,2,2h15a2,2,0,0,0,2-2V11.5A2,2,0,0,0,19.5,9.5Zm-7.5,9a2,2,0,1,1,2-2A2,2,0,0,1,12,18.5ZM16.25,9a.5.5,0,0,1-.5.5H8.25a.5.5,0,0,1-.5-.5V6.75a4.25,4.25,0,0,1,8.5,0Z"></path>
            </g>
        </svg>
    );
}

function DollarIcon(props) {
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
 * Decorate a search result item with formatted date and visibility icons.
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
 * Fetch URLs for active signup offers.
 */
export async function offerUrls(context) {
    try {
        const offers = await context.fetchOffersTask.perform();
        return offers.map((offer) => ({
            label: `Offer — ${offer.name}`,
            value: context.config.getSiteUrl(offer.code)
        }));
    } catch {
        return [];
    }
}

/**
 * Custom hook handling file uploads with progress tracking.
 */
function useFileUpload(type = 'image', deps) {
    const [progress, setProgress] = useState(0);
    const [isLoading, setLoading] = useState(false);
    const [errors, setErrors] = useState([]);
    const [filesNumber, setFilesNumber] = useState(0);
    const progressTracker = useRef(new Map());

    const updateProgress = () => {
        if (progressTracker.current.size === 0) {
            setProgress(0);
            return;
        }
        let total = 0;
        progressTracker.current.forEach((v) => (total += v));
        setProgress(Math.round(total / progressTracker.current.size));
    };

    const defaultValidator = (file) => {
        if (type === 'file') {
            return true;
        }
        const extensions = fileTypes[type].extensions;
        const [, ext] = (/(?:\.([^.]+))?$/).exec(file.name);
        if (!extensions) {
            return true;
        }
        const allowed = Array.isArray(extensions) ? extensions : extensions.split(',');
        if (!ext || !allowed.includes(ext.toLowerCase())) {
            return `The file type you uploaded is not supported. Please use ${allowed.map((e) => '.' + e).join(', ')}`;
        }
        return true;
    };

    const validate = (files = []) => {
        const results = [];
        for (const file of files) {
            const res = defaultValidator(file);
            if (res !== true) {
                results.push({fileName: file.name, message: res});
            }
        }
        return results;
    };

    const _uploadFile = async (file, {formData = {}} = {}) => {
        progressTracker.current.set(file, 0);
        const payload = new FormData();
        payload.append('file', file, file.name);
        Object.entries(formData).forEach(([k, v]) => payload.append(k, v));

        const url = `${ghostPaths().apiRoot}${fileTypes[type].endpoint}`;
        const method = fileTypes[type].requestMethod || 'post';

        try {
            const response = await deps.ajax[method](url, {
                data: payload,
                processData: false,
                contentType: false,
                dataType: 'text',
                xhr: () => {
                    const xhr = new window.XMLHttpRequest();
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            progressTracker.current.set(file, (e.loaded / e.total) * 100);
                            updateProgress();
                        }
                    });
                    return xhr;
                }
            });

            progressTracker.current.set(file, 100);
            updateProgress();

            let parsed;
            try {
                parsed = JSON.parse(response);
            } catch (e) {
                if (!(e instanceof SyntaxError)) {
                    throw e;
                }
            }

            let urlResult;
            if (parsed) {
                const resource = parsed[fileTypes[type].resourceName];
                if (Array.isArray(resource) && resource[0]) {
                    urlResult = resource[0].url;
                }
            }

            return {url: urlResult, fileName: file.name};
        } catch (err) {
            const message = err.payload?.errors?.[0]?.message || err.message || '';
            const context = err.payload?.errors?.[0]?.context || '';
            throw {message, context, fileName: file.name};
        }
    };

    const upload = async (files = [], options = {}) => {
        setFilesNumber(files.length);
        setLoading(true);
        const validation = validate(files);
        if (validation.length) {
            setErrors(validation);
            setLoading(false);
            setProgress(100);
            return null;
        }

        try {
            const results = await Promise.all(files.map((f) => _uploadFile(f, options)));
            setProgress(100);
            progressTracker.current.clear();
            setLoading(false);
            setErrors([]);
            return results;
        } catch (err) {
            setErrors((prev) => [...prev, err]);
            setLoading(false);
            setProgress(100);
            progressTracker.current.clear();
            return null;
        }
    };

    return {progress, isLoading, upload, errors, filesNumber};
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
        return this.state.hasError ? (
            <p className="koenig-react-editor-error">Loading has failed. Try refreshing the browser!</p>
        ) : (
            this.props.children
        );
    }
}

/* Helper components that lazily read resources */
const KoenigComposer = ({editorResource, ...props}) => {
    const {KoenigComposer: Comp} = editorResource.read();
    return <Comp {...props} />;
};

const KoenigEditor = ({editorResource, ...props}) => {
    const {KoenigEditor: Comp} = editorResource.read();
    return <Comp {...props} />;
};

const WordCountPlugin = ({editorResource, ...props}) => {
    const {WordCountPlugin: Comp} = editorResource.read();
    return <Comp {...props} />;
};

const TKCountPlugin = ({editorResource, ...props}) => {
    const {TKCountPlugin: Comp} = editorResource.read();
    return <Comp {...props} />;
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
    labels = null;
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
        return jsUrl && cssUrl ? {jsUrl, cssUrl} : null;
    }

    getImageEditorJSUrl() {
        let url = this.pinturaJsUrl;
        if (!url) return null;
        if (url.startsWith('/')) {
            url = window.location.origin + this.ghostPaths.adminRoot.replace(/\/$/, '') + url;
        }
        return url;
    }

    getImageEditorCSSUrl() {
        let url = this.pinturaCSSUrl;
        if (!url) return null;
        if (url.startsWith('/')) {
            url = window.location.origin + this.ghostPaths.adminRoot.replace(/\/$/, '') + url;
        }
        return url;
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
        if (this.offers) return this.offers;
        this.offers = yield this.store.query('offer', {filter: 'status:active+redemption_type:signup'});
        return this.offers;
    }

    @task({restartable: false})
    *fetchLabelsTask() {
        if (this.labels) return this.labels;
        this.labels = yield this.store.query('label', {limit: 'all', fields: 'id, name'});
        return this.labels;
    }

    /* Helper to fetch oembed data */
    async fetchEmbed(url, type) {
        const endpoint = this.ghostPaths.url.api('oembed');
        return await this.ajax.request(endpoint, {data: {url, type}});
    }

    /* Build autocomplete link list */
    async fetchAutocompleteLinks() {
        const defaults = [
            {label: 'Homepage', value: window.location.origin + '/'},
            {label: 'Free signup', value: '#/portal/signup/free'}
        ];

        const memberLinks = () => {
            if (!this.membersUtils.paidMembersEnabled) return [];
            return [
                {label: 'Paid signup', value: '#/portal/signup'},
                {label: 'Upgrade or change plan', value: '#/portal/account/plans'}
            ];
        };

        const donationLink = () =>
            this.settings.donationsEnabled ? [{label: 'Tips and donations', value: '#/portal/support'}] : [];

        const recommendationLink = () =>
            this.settings.recommendationsEnabled ? [{label: 'Recommendations', value: '#/portal/recommendations'}] : [];

        const offersLinks = await offerUrls(this);
        return [...defaults, ...memberLinks(), ...donationLink(), ...recommendationLink(), ...offersLinks];
    }

    /* Retrieve label names */
    async fetchLabels() {
        try {
            const labels = await this.fetchLabelsTask.perform();
            return labels.map((l) => l.name);
        } catch (e) {
            if (didCancel(e)) return [];
            throw e;
        }
    }

    /* Search link handling */
    async searchLinks(term) {
        if (!term) {
            if (this.defaultLinks) return this.defaultLinks;
            const posts = await this.store.query('post', {
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
            results.forEach((item) => decoratePostSearchResult(item, this.settings));
            this.defaultLinks = [{label: 'Latest posts', items: results}];
            return this.defaultLinks;
        }

        try {
            const raw = await this.search.searchTask.perform(term);
            const filtered = [];

            raw.forEach((group) => {
                let items = group.options;
                if (group.groupName === 'Posts' || group.groupName === 'Pages') {
                    items = items.filter((i) => i.status === 'published');
                }
                if (group.groupName === 'Staff') {
                    items = items.filter((i) => !/\/404\//.test(i.url));
                }
                if (!items.length) return;

                if (group.groupName === 'Posts' || group.groupName === 'Pages') {
                    items.forEach((item) => decoratePostSearchResult(item, this.settings));
                }

                filtered.push({label: group.groupName, items});
            });

            return filtered;
        } catch (error) {
            if (!didCancel(error)) throw error;
            return [];
        }
    }

    /* Determine Stripe availability */
    isStripeEnabled() {
        const hasDirect = !!(this.settings.stripeSecretKey && this.settings.stripePublishableKey);
        const hasConnect = !!(this.settings.stripeConnectSecretKey && this.settings.stripeConnectPublishableKey);
        return this.config.stripeDirect ? hasDirect : hasDirect || hasConnect;
    }

    /* Build default card configuration */
    getDefaultCardConfig() {
        const unsplashHeaders = this.settings.unsplash
            ? {
                  Authorization: `Client-ID 8672af113b0a8573edae3aa3713886265d9bb741d707f6c01a486cde8c278980`,
                  'Accept-Version': 'v1',
                  'Content-Type': 'application/json',
                  'App-Pragma': 'no-cache',
                  'X-Unsplash-Cache': true
              }
            : null;

        return {
            unsplash: unsplashHeaders,
            tenor: this.config.tenor?.googleApiKey ? this.config.tenor : null,
            fetchAutocompleteLinks: this.fetchAutocompleteLinks.bind(this),
            fetchEmbed: this.fetchEmbed.bind(this),
            fetchLabels: this.fetchLabels.bind(this),
            renderLabels: !this.session.user.isContributor,
            feature: {transistor: this.feature.transistor},
            deprecated: {headerV1: true},
            membersEnabled: this.settings.membersSignupAccess === 'all',
            searchLinks: this.searchLinks.bind(this),
            siteTitle: this.settings.title,
            siteDescription: this.settings.description,
            siteUrl: this.config.getSiteUrl('/'),
            stripeEnabled: this.isStripeEnabled()
        };
    }

    ReactComponent = (props) => {
        const cardConfig = Object.assign(
            {},
            this.getDefaultCardConfig(),
            props.cardConfig,
            {pinturaConfig: this.pinturaConfig}
        );

        const {progress, isLoading, upload, errors, filesNumber} = useFileUpload('image', {ajax: this.ajax});

        const KGEditorComponent = ({isInitInstance}) => (
            <div
                data-secondary-instance={isInitInstance ? true : false}
                style={isInitInstance ? {display: 'none'} : {}}
            >
                <KoenigComposer editorResource={this.editorResource} cardConfig={cardConfig} fileUploader={{useFileUpload, fileTypes}}>
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