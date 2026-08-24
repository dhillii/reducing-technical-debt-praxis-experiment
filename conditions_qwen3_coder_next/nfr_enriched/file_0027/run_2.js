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

// Helper function: Extract and validate URL path segments (used for SEO URL construction)
function extractUrlPathSegments(urlString) {
    try {
        const url = new URL(urlString);
        return [
            url.host,
            ...url.pathname.split('/').filter(segment => segment.length > 0)
        ];
    } catch (e) {
        // Invalid URL — produce empty path segments
        return [];
    }
}

// Helper function: Determine whether visibility change should trigger save
function shouldSaveVisibility(post) {
    return post.isDraft && !!(post.changedAttributes().tiers);
}

// Helper function: Common pattern for validating and optionally saving post attributes
async function validateAndSaveIfNeeded(post, attribute, saveTask) {
    try {
        await post.validate({property: attribute});
        if (shouldSave(post)) {
            await saveTask.perform();
        }
    } catch (e) {
        if (!e) {
            // Validation failure — gracefully return
            return;
        }
        throw e;
    }
}

// Helper function: Determine if post should be saved (not new)
function shouldSave(post) {
    return !post.isNew;
}

// Helper function: Validate and update attribute, then optionally save
async function updatePostAttribute({post, key, value, attributeToValidate, saveTask}) {
    if (post.get(key) === value) {
        return;
    }
    post.set(key, value);
    await post.validate({property: attributeToValidate});
    if (shouldSave(post)) {
        await saveTask.perform();
    }
}

// Helper function: Common pattern for non-attribute actions (e.g., toggles, images)
async function performToggledOrImageAction({post, key, value, saveTask}) {
    post.set(key, value);
    if (post.isNew) {
        return;
    }
    try {
        await saveTask.perform();
    } catch (error) {
        post.rollbackAttributes();
        throw error;
    }
}

// Helper function: Build canonical URL path segments for SEO display
function buildSeoUrlParts(post, blogConfig) {
    let urlParts = [];

    if (post.canonicalUrl) {
        urlParts.push(...extractUrlPathSegments(post.canonicalUrl));
    } else {
        const canonicalBase = extractUrlPathSegments(blogConfig);
        urlParts.push(...canonicalBase, post.slug);
    }

    return urlParts;
}

// Helper function: Normalize attribute name — fixes naming inconsistency for SEO fields
function normalizeAttributeName(attribute) {
    if (attribute === 'metaDescription') {
        return 'customExcerpt'; // fall back to custom excerpt when meta desc is empty
    }
    return attribute;
}

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
        const urlParts = buildSeoUrlParts(this.post, this.config.blogUrl);
        return urlParts.join(' › ');
    }

    get canViewPostHistory() {
        if (this.post.isNew) {
            return false;
        }

        if (this.post.lexical === null) {
            return false;
        }

        if (!this.post.isPublished && !this.post.isSent) {
            return true;
        }

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

        return this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;

        if (this.post.isNew) {
            return;
        }

        return this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
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
    async setPublishedAtBlogDate(date) {
        const post = this.post;
        const dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || date === post.get('publishedAtBlogDate')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogDate', dateString);
            await this.savePostTask.perform();
        }
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        await validateAndSaveIfNeeded(this.post, 'visibility', this.savePostTask);
        if (shouldSaveVisibility(this.post)) {
            await validateAndSaveIfNeeded(this.post, 'tiers', this.savePostTask);
        }
    }

    @action
    async setPublishedAtBlogTime(time) {
        const post = this.post;

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || time === post.get('publishedAtBlogTime')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogTime', time);
            await this.savePostTask.perform();
        }
    }

    @action
    async setCustomExcerpt(excerpt) {
        const post = this.post;
        const currentExcerpt = post.get('customExcerpt');

        if (excerpt === currentExcerpt) {
            return;
        }

        post.set('customExcerpt', excerpt);
        await post.validate({property: 'customExcerpt'});
        if (shouldSave(post)) {
            await this.savePostTask.perform();
        }
    }

    @action
    async setHeaderInjection(code) {
        await updatePostAttribute({
            post: this.post,
            key: 'codeinjectionHead',
            value: code,
            attributeToValidate: 'codeinjectionHead',
            saveTask: this.savePostTask
        });
    }

    @action
    async setFooterInjection(code) {
        await updatePostAttribute({
            post: this.post,
            key: 'codeinjectionFoot',
            value: code,
            attributeToValidate: 'codeinjectionFoot',
            saveTask: this.savePostTask
        });
    }

    @action
    async setMetaTitle(metaTitle) {
        await updatePostAttribute({
            post: this.post,
            key: 'metaTitle',
            value: metaTitle,
            attributeToValidate: 'metaTitle',
            saveTask: this.savePostTask
        });
    }

    @action
    async setMetaDescription(metaDescription) {
        await updatePostAttribute({
            post: this.post,
            key: 'metaDescription',
            value: metaDescription,
            attributeToValidate: 'metaDescription',
            saveTask: this.savePostTask
        });
    }

    @action
    async setCanonicalUrl(value) {
        await updatePostAttribute({
            post: this.post,
            key: 'canonicalUrl',
            value: value,
            attributeToValidate: 'canonicalUrl',
            saveTask: this.savePostTask
        });
    }

    @action
    async setOgTitle(ogTitle) {
        await updatePostAttribute({
            post: this.post,
            key: 'ogTitle',
            value: ogTitle,
            attributeToValidate: 'ogTitle',
            saveTask: this.savePostTask
        });
    }

    @action
    async setOgDescription(ogDescription) {
        await updatePostAttribute({
            post: this.post,
            key: 'ogDescription',
            value: ogDescription,
            attributeToValidate: 'ogDescription',
            saveTask: this.savePostTask
        });
    }

    @action
    async setTwitterTitle(twitterTitle) {
        await updatePostAttribute({
            post: this.post,
            key: 'twitterTitle',
            value: twitterTitle,
            attributeToValidate: 'twitterTitle',
            saveTask: this.savePostTask
        });
    }

    @action
    async setTwitterDescription(twitterDescription) {
        await updatePostAttribute({
            post: this.post,
            key: 'twitterDescription',
            value: twitterDescription,
            attributeToValidate: 'twitterDescription',
            saveTask: this.savePostTask
        });
    }

    @action
    async setCoverImage(image) {
        await performToggledOrImageAction({
            post: this.post,
            key: 'featureImage',
            value: image,
            saveTask: this.savePostTask
        });
    }

    @action
    async clearCoverImage() {
        await performToggledOrImageAction({
            post: this.post,
            key: 'featureImage',
            value: '',
            saveTask: this.savePostTask
        });
    }

    @action
    async setOgImage(image) {
        await performToggledOrImageAction({
            post: this.post,
            key: 'ogImage',
            value: image,
            saveTask: this.savePostTask
        });
    }

    @action
    async clearOgImage() {
        await performToggledOrImageAction({
            post: this.post,
            key: 'ogImage',
            value: '',
            saveTask: this.savePostTask
        });
    }

    @action
    async setTwitterImage(image) {
        await performToggledOrImageAction({
            post: this.post,
            key: 'twitterImage',
            value: image,
            saveTask: this.savePostTask
        });
    }

    @action
    async clearTwitterImage() {
        await performToggledOrImageAction({
            post: this.post,
            key: 'twitterImage',
            value: '',
            saveTask: this.savePostTask
        });
    }

    @action
    async changeAuthors(newAuthors) {
        const post = this.post;
        const newAuthorIds = newAuthors.mapBy('id').join();
        const currentAuthorIds = post.get('authors').mapBy('id').join();

        if (newAuthorIds === currentAuthorIds) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (post.get('isNew')) {
            return;
        }

        try {
            await this.savePostTask.perform();
        } catch (error) {
            post.rollbackAttributes();
            throw error;
        }
    }

    @action
    async savePost() {
        try {
            await this.savePostTask.perform();
        } catch (error) {
            this.showError(error);
            this.post.rollbackAttributes();
        }
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