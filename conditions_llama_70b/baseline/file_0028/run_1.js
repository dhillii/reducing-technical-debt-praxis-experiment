const KoenigLexicalEditor = class KoenigLexicalEditor extends Component {
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

        // load the script from admin root if relative
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

        // load the css from admin root if relative
        if (cssImportUrl.startsWith('/')) {
            cssImportUrl = window.location.origin + this.ghostPaths.adminRoot.replace(/\/$/, '') + cssImportUrl;
        }
        return cssImportUrl;
    }

    @action
    onError(error) {
        // ensure we're still showing errors in development
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
        // don't rethrow, Lexical will attempt to gracefully recover
    }

    @task({restartable: false})
    *fetchOffersTask() {
        if (this.offers) {
            return this.offers;
        }

        // Only fetch active signup offers for use in link dropdowns
        // - Archived offers (status:archived) should not appear
        // - Retention offers (redemption_type:retention) are only triggered during cancellation flows, not via offer links
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

        const fetchAutocompleteLinks = async () => {
            const defaults = [
                {label: 'Homepage', value: window.location.origin + '/'},
                {label: 'Free signup', value: '#/portal/signup/free'}
            ];

            const memberLinks = () => {
                let links = [];
                if (this.membersUtils.paidMembersEnabled) {
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
                if (this.settings.donationsEnabled) {
                    return [{
                        label: 'Tips and donations',
                        value: '#/portal/support'
                    }];
                }

                return [];
            };

            const recommendationLink = () => {
                if (this.settings.recommendationsEnabled) {
                    return [{
                        label: 'Recommendations',
                        value: '#/portal/recommendations'
                    }];
                }

                return [];
            };

            const offersLinks = await offerUrls.call(this);

            return [...defaults, ...memberLinks(), ...donationLink(), ...recommendationLink(), ...offersLinks];
        };

        const fetchLabels = async () => {
            let labels = [];
            try {
                labels = await this.fetchLabelsTask.perform();
            } catch (e) {
                // Do not throw cancellation errors
                if (didCancel(e)) {
                    return;
                }

                throw e;
            }

            return labels.map(label => label.name);
        };

        const searchLinks = async (term) => {
            // when no term is present we should show latest 5 posts
            if (!term) {
                // we cache the default links to avoid fetching them every time
                if (this.defaultLinks) {
                    return this.defaultLinks;
                }

                const posts = await this.store.query('post', {filter: 'status:published', fields: 'id,url,title,visibility,published_at', order: 'published_at desc', limit: 5});
                // NOTE: these posts are Ember Data models, not plain objects like the search results
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
                // don't surface task cancellation errors
                if (!didCancel(error)) {
                    throw error;
                }
                return;
            }

            // only published posts/pages and staff with posts have URLs
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

                // update the group items with metadata
                if (group.groupName === 'Posts' || group.groupName === 'Pages') {
                    items.forEach(item => decoratePostSearchResult(item, this.settings));
                }

                filteredResults.push({
                    label: group.groupName,
                    items
                });
            });

            return filteredResults;
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
            deprecated: { // todo fix typo
                headerV1: true // if false, shows header v1 in the menu
            },
            membersEnabled: this.settings.membersSignupAccess === 'all',
            searchLinks,
            siteTitle: this.settings.title,
            siteDescription: this.settings.description,
            siteUrl: this.config.getSiteUrl('/'),
            stripeEnabled: checkStripeEnabled() // returns a boolean
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

            const defaultValidator = (file) => {
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

                    // force tracker progress to 100% in case we didn't get a final event
                    progressTracker.current.set(file, 100);
                    updateProgress();

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
};