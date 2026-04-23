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
        const urlParts = [];

        if (this.post.canonicalUrl) {
            try {
                const canonicalUrl = new URL(this.post.canonicalUrl);
                urlParts.push(canonicalUrl.host);
                urlParts.push(...canonicalUrl.pathname.split('/').reject(p => !p));
            } catch (e) {
                // no-op, invalid URL
            }
        } else {
            const blogUrl = new URL(this.config.blogUrl);
            urlParts.push(blogUrl.host);
            urlParts.push(...blogUrl.pathname.split('/').reject(p => !p));
            urlParts.push(this.post.slug);
        }

        return urlParts.join(' › ');
    }

    get canViewPostHistory() {
        // Cannot view history for new posts
        if (this.post.isNew) {
            return false;
        }

        // Can only view history for lexical posts
        if (this.post.lexical === null) {
            return false;
        }

        // Can view history for all unpublished/unsent posts
        if (!this.post.isPublished && !this.post.isSent) {
            return true;
        }

        // Cannot view history for published posts if there isn't a web version
        if (this.post.emailOnly) {
            return false;
        }

        return true;
    }

    get themeMissingShowTitleAndFeatureImage() {
        return !this.themeManagement.activeTheme.hasPageBuilderFeature('show_title_and_feature_image');
    }

    willDestroyElement() {
        super.willDestroyElement(...arguments);

        let post = this.post;
        let errors = post.get('errors');

        // reset the publish date if it has an error
        if (errors.has('publishedAtBlogDate') || errors.has('publishedAtBlogTime')) {
            post.set('publishedAtBlogTZ', post.get('publishedAtUTC'));
            post.validate({attribute: 'publishedAtBlog'});
        }

        this.setSidebarWidthVariable(0);
    }

    /**
     * Update a post attribute, optionally validate and save.
     * @param {string} attr - attribute name on post
     * @param {*} value - new value
     * @param {Object} [options] - options
     * @param {boolean} [options.validate=false] - whether to validate the attribute
     * @param {boolean} [options.skipSaveIfNew=false] - skip saving if post is new
     * @returns {Promise|undefined}
     */
    updatePostAttribute(attr, value, {validate = false, skipSaveIfNew = false} = {}) {
        const post = this.post;
        post.set(attr, value);
        if (validate) {
            post.validate({property: attr});
        }
        if (skipSaveIfNew && post.isNew) {
            return;
        }
        return this.savePostTask.perform().catch((error) => {
            this.showError(error);
            post.rollbackAttributes();
        });
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
        this.updatePostAttribute('featured', !this.post.featured, {skipSaveIfNew: true});
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.updatePostAttribute('showTitleAndFeatureImage', event.target.checked, {skipSaveIfNew: true});
    }

    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    /**
     * triggered by user manually changing slug
     */
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
        const post = this.post;
        const dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || date === post.get('publishedAtBlogDate')) {
            post.validate({property: 'publishedAtBlog'});
            return;
        }

        return this.updatePostAttribute('publishedAtBlogDate', dateString, {validate: true, skipSaveIfNew: true});
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
            if (!e) {
                // validation error
                return;
            }

            throw e;
        }
    }

    @action
    setPublishedAtBlogTime(time) {
        const post = this.post;

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || time === post.get('publishedAtBlogTime')) {
            post.validate({property: 'publishedAtBlog'});
            return;
        }

        return this.updatePostAttribute('publishedAtBlogTime', time, {validate: true, skipSaveIfNew: true});
    }

    @action
    setCustomExcerpt(excerpt) {
        const post = this.post;
        const currentExcerpt = post.get('customExcerpt');

        if (excerpt === currentExcerpt) {
            return;
        }

        return this.updatePostAttribute('customExcerpt', excerpt, {validate: true, skipSaveIfNew: true});
    }

    @action
    setHeaderInjection(code) {
        const post = this.post;
        const currentCode = post.get('codeinjectionHead');

        if (code === currentCode) {
            return;
        }

        return this.updatePostAttribute('codeinjectionHead', code, {validate: true, skipSaveIfNew: true});
    }

    @action
    setFooterInjection(code) {
        const post = this.post;
        const currentCode = post.get('codeinjectionFoot');

        if (code === currentCode) {
            return;
        }

        return this.updatePostAttribute('codeinjectionFoot', code, {validate: true, skipSaveIfNew: true});
    }

    @action
    setMetaTitle(metaTitle) {
        const post = this.post;
        const currentTitle = post.get('metaTitle');

        if (currentTitle === metaTitle) {
            return;
        }

        return this.updatePostAttribute('metaTitle', metaTitle, {validate: true, skipSaveIfNew: true});
    }

    @action
    setMetaDescription(metaDescription) {
        const post = this.post;
        const currentDescription = post.get('metaDescription');

        if (currentDescription === metaDescription) {
            return;
        }

        return this.updatePostAttribute('metaDescription', metaDescription, {validate: true, skipSaveIfNew: true});
    }

    @action
    setCanonicalUrl(value) {
        const post = this.post;
        const currentCanonicalUrl = post.canonicalUrl;

        if (currentCanonicalUrl === value) {
            return;
        }

        return this.updatePostAttribute('canonicalUrl', value, {validate: true, skipSaveIfNew: true});
    }

    @action
    setOgTitle(ogTitle) {
        const post = this.post;
        const currentTitle = post.get('ogTitle');

        if (currentTitle === ogTitle) {
            return;
        }

        return this.updatePostAttribute('ogTitle', ogTitle, {validate: true, skipSaveIfNew: true});
    }

    @action
    setOgDescription(ogDescription) {
        const post = this.post;
        const currentDescription = post.get('ogDescription');

        if (currentDescription === ogDescription) {
            return;
        }

        return this.updatePostAttribute('ogDescription', ogDescription, {validate: true, skipSaveIfNew: true});
    }

    @action
    setTwitterTitle(twitterTitle) {
        const post = this.post;
        const currentTitle = post.get('twitterTitle');

        if (currentTitle === twitterTitle) {
            return;
        }

        return this.updatePostAttribute('twitterTitle', twitterTitle, {validate: true, skipSaveIfNew: true});
    }

    @action
    setTwitterDescription(twitterDescription) {
        const post = this.post;
        const currentDescription = post.get('twitterDescription');

        if (currentDescription === twitterDescription) {
            return;
        }

        return this.updatePostAttribute('twitterDescription', twitterDescription, {validate: true, skipSaveIfNew: true});
    }

    @action
    setCoverImage(image) {
        this.updatePostAttribute('featureImage', image, {skipSaveIfNew: true});
    }

    @action
    clearCoverImage() {
        this.updatePostAttribute('featureImage', '', {skipSaveIfNew: true});
    }

    @action
    setOgImage(image) {
        this.updatePostAttribute('ogImage', image, {skipSaveIfNew: true});
    }

    @action
    clearOgImage() {
        this.updatePostAttribute('ogImage', '', {skipSaveIfNew: true});
    }

    @action
    setTwitterImage(image) {
        this.updatePostAttribute('twitterImage', image, {skipSaveIfNew: true});
    }

    @action
    clearTwitterImage() {
        this.updatePostAttribute('twitterImage', '', {skipSaveIfNew: true});
    }

    @action
    changeAuthors(newAuthors) {
        const post = this.post;

        // return if nothing changed
        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (post.get('isNew')) {
            return;
        }

        return this.savePostTask.perform().catch((error) => {
            this.showError(error);
            post.rollbackAttributes();
        });
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
        // TODO: remove null check once ValidationEngine has been removed
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}