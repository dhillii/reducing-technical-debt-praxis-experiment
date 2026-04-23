import Component from '@ember/component';
import boundOneWay from 'ghost-admin/utils/bound-one-way';
import classic from 'ember-classic-decorator';
import moment from 'moment-timezone';
import {action, computed} from '@ember/object';
import {alias, or} from '@ember/object/computed';
import {inject} from 'ghost-admin/decorators/inject';
import {inject as service} from '@ember/service';
import {tagName} from '@ember-decorators/component';
import {tracked} from '@glimmer/tracking';

@classic
@tagName('')
export default class GhPostSettingsMenu extends Component {
    @service feature;
    @service store;
    @service ajax;
    @service ghostPaths;
    @service notifications;
    @service slugGenerator;
    @service session;
    @service settings;
    @service themeManagement;
    @service ui;

    @inject config;

    @tracked showPostHistory = false;

    post = null;
    isViewingSubview = false;

    @alias('post.canonicalUrlScratch')
        canonicalUrlScratch;

    @alias('post.customExcerptScratch')
        customExcerptScratch;

    @alias('post.codeinjectionFootScratch')
        codeinjectionFootScratch;

    @alias('post.codeinjectionHeadScratch')
        codeinjectionHeadScratch;

    @alias('post.metaDescriptionScratch')
        metaDescriptionScratch;

    @alias('post.metaTitleScratch')
        metaTitleScratch;

    @alias('post.ogDescriptionScratch')
        ogDescriptionScratch;

    @alias('post.ogTitleScratch')
        ogTitleScratch;

    @alias('post.twitterDescriptionScratch')
        twitterDescriptionScratch;

    @alias('post.twitterTitleScratch')
        twitterTitleScratch;

    @boundOneWay('post.slug')
        slugValue;

    @boundOneWay('post.uuid')
        uuidValue;

    @or('metaDescriptionScratch', 'customExcerptScratch')
        seoDescription;

    @or(
        'ogDescriptionScratch',
        'customExcerptScratch',
        'seoDescription',
        'post.excerpt',
        'settings.description',
        ''
    )
        facebookDescription;

    @or(
        'post.ogImage',
        'post.featureImage',
        'settings.ogImage',
        'settings.coverImage'
    )
        facebookImage;

    @or('ogTitleScratch', 'seoTitle')
        facebookTitle;

    @or(
        'twitterDescriptionScratch',
        'customExcerptScratch',
        'seoDescription',
        'post.excerpt',
        'settings.description',
        ''
    )
        twitterDescription;

    @or(
        'post.twitterImage',
        'post.featureImage',
        'settings.twitterImage',
        'settings.coverImage'
    )
        twitterImage;

    @or('twitterTitleScratch', 'seoTitle')
        twitterTitle;

    @or(
        'session.user.isOwnerOnly',
        'session.user.isAdminOnly',
        'session.user.isEitherEditor'
    )
        showVisibilityInput;

    @computed('metaTitleScratch', 'post.titleScratch')
    get seoTitle() {
        return this.metaTitleScratch || this.post.titleScratch || '(Untitled)';
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        const urlParts = this.buildUrlParts(this.post.canonicalUrl, this.config.blogUrl);

        return urlParts.join(' › ');
    }

    get canViewPostHistory() {
        return this.canViewPostHistoryForNewPost()
            && this.canViewPostHistoryForLexical()
            && this.canViewPostHistoryForPublishedStatus()
            && this.canViewPostHistoryForEmailOnly();
    }

    get themeMissingShowTitleAndFeatureImage() {
        return !this.themeManagement.activeTheme.hasPageBuilderFeature('show_title_and_feature_image');
    }

    willDestroyElement() {
        super.willDestroyElement(...arguments);

        let post = this.post;
        let errors = post.get('errors');

        if (errors.has('publishedAtBlogDate') || errors.has('publishedAtBlogTime')) {
            post.set('publishedAtBlogTZ', post.get('publishedAtUTC'));
            post.validate({attribute: 'publishedAtBlog'});
        }

        this.setSidebarWidthVariable(0);
    }

    @action
    showSubview(subview) {
        this.set('isViewingSubview', true);
        this.set('subview', subview);
    }

    @action
    closeSubview() {
        this.set('isViewingSubview', false);
        this.set('subview', null);
    }

    @action
    discardEnter() {
        return false;
    }

    @action
    toggleFeatured() {
        this.post.featured = !this.post.featured;

        if (this.post.isNew) {
            return;
        }

        this.performSaveWithValidation();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;

        if (this.post.isNew) {
            return;
        }

        this.performSaveWithValidation();
    }

    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    @action
    updateSlug(newSlug) {
        return this.updateSlugTask
            .perform(newSlug)
            .catch((error) => {
                this.showError(error);
                this.post.rollbackAttributes();
            });
    }

    @action
    setPublishedAtBlogDate(date) {
        let dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');

        this.post.get('errors').remove('publishedAtBlogDate');

        if (this.post.get('isNew') || date === this.post.get('publishedAtBlogDate')) {
            this.post.validate({property: 'publishedAtBlog'});
        } else {
            this.post.set('publishedAtBlogDate', dateString);
            return this.savePostTask.perform();
        }
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);

        try {
            await this.post.validate({property: 'visibility'});
            await this.post.validate({property: 'tiers'});

            if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
                await this.savePostTask.perform();
            }
        } catch (e) {
            throw e;
        }
    }

    @action
    setPublishedAtBlogTime(time) {
        if (this.post.get('isNew') || time === this.post.get('publishedAtBlogTime')) {
            this.post.validate({property: 'publishedAtBlog'});
        } else {
            this.post.set('publishedAtBlogTime', time);
            return this.savePostTask.perform();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        let currentExcerpt = this.post.get('customExcerpt');

        if (excerpt === currentExcerpt) {
            return;
        }

        this.post.set('customExcerpt', excerpt);

        return this.post.validate({property: 'customExcerpt'}).then(() => this.savePostTask.perform());
    }

    @action
    setHeaderInjection(code) {
        let currentCode = this.post.get('codeinjectionHead');

        if (code === currentCode) {
            return;
        }

        this.post.set('codeinjectionHead', code);

        return this.post.validate({property: 'codeinjectionHead'}).then(() => this.savePostTask.perform());
    }

    @action
    setFooterInjection(code) {
        let currentCode = this.post.get('codeinjectionFoot');

        if (code === currentCode) {
            return;
        }

        this.post.set('codeinjectionFoot', code);

        return this.post.validate({property: 'codeinjectionFoot'}).then(() => this.savePostTask.perform());
    }

    @action
    setMetaTitle(metaTitle) {
        let currentTitle = this.post.get('metaTitle');

        if (currentTitle === metaTitle) {
            return;
        }

        this.post.set('metaTitle', metaTitle);

        return this.post.validate({property: 'metaTitle'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setMetaDescription(metaDescription) {
        let currentDescription = this.post.get('metaDescription');

        if (currentDescription === metaDescription) {
            return;
        }

        this.post.set('metaDescription', metaDescription);

        return this.post.validate({property: 'metaDescription'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setCanonicalUrl(value) {
        let currentCanonicalUrl = this.post.canonicalUrl;

        if (currentCanonicalUrl === value) {
            return;
        }

        this.post.set('canonicalUrl', value);

        return this.post.validate({property: 'canonicalUrl'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setOgTitle(ogTitle) {
        let currentTitle = this.post.get('ogTitle');

        if (currentTitle === ogTitle) {
            return;
        }

        this.post.set('ogTitle', ogTitle);

        return this.post.validate({property: 'ogTitle'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setOgDescription(ogDescription) {
        let currentDescription = this.post.get('ogDescription');

        if (currentDescription === ogDescription) {
            return;
        }

        this.post.set('ogDescription', ogDescription);

        return this.post.validate({property: 'ogDescription'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setTwitterTitle(twitterTitle) {
        let currentTitle = this.post.get('twitterTitle');

        if (currentTitle === twitterTitle) {
            return;
        }

        this.post.set('twitterTitle', twitterTitle);

        return this.post.validate({property: 'twitterTitle'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setTwitterDescription(twitterDescription) {
        let currentDescription = this.post.get('twitterDescription');

        if (currentDescription === twitterDescription) {
            return;
        }

        this.post.set('twitterDescription', twitterDescription);

        return this.post.validate({property: 'twitterDescription'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setCoverImage(image) {
        this.set('post.featureImage', image);

        if (this.post.isNew) {
            return;
        }

        this.performSaveWithValidation();
    }

    @action
    clearCoverImage() {
        this.set('post.featureImage', '');

        if (this.post.isNew) {
            return;
        }

        this.performSaveWithValidation();
    }

    @action
    setOgImage(image) {
        this.set('post.ogImage', image);

        if (this.post.isNew) {
            return;
        }

        this.performSaveWithValidation();
    }

    @action
    clearOgImage() {
        this.set('post.ogImage', '');

        if (this.post.isNew) {
            return;
        }

        this.performSaveWithValidation();
    }

    @action
    setTwitterImage(image) {
        this.set('post.twitterImage', image);

        if (this.post.isNew) {
            return;
        }

        this.performSaveWithValidation();
    }

    @action
    clearTwitterImage() {
        this.set('post.twitterImage', '');

        if (this.post.isNew) {
            return;
        }

        this.performSaveWithValidation();
    }

    @action
    changeAuthors(newAuthors) {
        let post = this.post;

        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (post.get('isNew')) {
            return;
        }

        this.performSaveWithValidation();
    }

    @action
    savePost() {
        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    deletePostInternal() {
        if (this.deletePost) {
            this.deletePost();
        }
    }

    @action
    setSidebarWidthFromElement(element) {
        const width = element.getBoundingClientRect().width;
        this.setSidebarWidthVariable(width);
    }

    showError(error) {
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }

    /**
     * Builds URL parts from canonical URL or blog URL with slug
     * @param {string} canonicalUrl - The canonical URL of the post
     * @param {string} blogUrl - The blog URL from config
     * @returns {string[]} Array of URL parts
     */
    buildUrlParts(canonicalUrl, blogUrl) {
        if (canonicalUrl) {
            try {
                const canonical = new URL(canonicalUrl);
                return [canonical.host, ...canonical.pathname.split('/').filter(p => p)];
            } catch {
                // Invalid URL, fall through to blog URL
            }
        }

        const blog = new URL(blogUrl);
        return [blog.host, ...blog.pathname.split('/').filter(p => p), this.post.slug];
    }

    /**
     * Checks if post can view history for new posts
     * @returns {boolean} True if post is not new
     */
    canViewPostHistoryForNewPost() {
        return !this.post.isNew;
    }

    /**
     * Checks if post can view history for lexical posts
     * @returns {boolean} True if post has lexical content
     */
    canViewPostHistoryForLexical() {
        return this.post.lexical !== null;
    }

    /**
     * Checks if post can view history based on published status
     * @returns {boolean} True if post is unpublished or unsent
     */
    canViewPostHistoryForPublishedStatus() {
        return !this.post.isPublished && !this.post.isSent;
    }

    /**
     * Checks if post can view history for email-only posts
     * @returns {boolean} True if post is not email-only
     */
    canViewPostHistoryForEmailOnly() {
        return !this.post.emailOnly;
    }

    /**
     * Performs save operation with consistent error handling
     */
    performSaveWithValidation() {
        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }
}