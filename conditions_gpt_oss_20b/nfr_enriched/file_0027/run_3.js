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
            urlParts.push(...this.parseUrlParts(this.post.canonicalUrl));
        } else {
            const blogUrl = new URL(this.config.blogUrl);
            urlParts.push(blogUrl.host);
            urlParts.push(...blogUrl.pathname.split('/').filter(p => p));
            urlParts.push(this.post.slug);
        }

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

        const post = this.post;
        const errors = post.get('errors');

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
        this.toggleAttribute('featured');
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.toggleAttribute('showTitleAndFeatureImage', event.target.checked);
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
        const post = this.post;
        const dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || date === post.get('publishedAtBlogDate')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogDate', dateString);
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
        } catch {
            // validation error, do nothing
        }
    }

    @action
    setPublishedAtBlogTime(time) {
        const post = this.post;

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || time === post.get('publishedAtBlogTime')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogTime', time);
            return this.savePostTask.perform();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        return this.setAttributeIfChanged('customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        return this.setAttributeIfChanged('codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        return this.setAttributeIfChanged('codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        return this.setAttributeIfChanged('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        return this.setAttributeIfChanged('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        return this.setAttributeIfChanged('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        return this.setAttributeIfChanged('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        return this.setAttributeIfChanged('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this.setAttributeIfChanged('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this.setAttributeIfChanged('twitterDescription', twitterDescription);
    }

    @action
    setCoverImage(image) {
        return this.setImageAttribute('featureImage', image);
    }

    @action
    clearCoverImage() {
        return this.setImageAttribute('featureImage', '');
    }

    @action
    setOgImage(image) {
        return this.setImageAttribute('ogImage', image);
    }

    @action
    clearOgImage() {
        return this.setImageAttribute('ogImage', '');
    }

    @action
    setTwitterImage(image) {
        return this.setImageAttribute('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        return this.setImageAttribute('twitterImage', '');
    }

    @action
    changeAuthors(newAuthors) {
        return this.setAttributeIfChanged('authors', newAuthors);
    }

    @action
    savePost() {
        return this.savePostTask.perform().catch((error) => {
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

    // ------------------------------------------------------------------
    // Helper methods
    // ------------------------------------------------------------------

    /**
     * Parse a URL string into an array of host and path segments.
     * @param urlString - The URL to parse.
     * @returns Array of host and path segments.
     */
    private parseUrlParts(urlString: string): string[] {
        try {
            const parsed = new URL(urlString);
            return [parsed.host, ...parsed.pathname.split('/').filter(p => p)];
        } catch {
            return [];
        }
    }

    /**
     * Toggle a boolean attribute on the post and persist if not new.
     * @param attribute - The attribute name to toggle.
     * @param value - Optional explicit value to set.
     */
    private toggleAttribute(attribute: string, value?: boolean): void {
        const post = this.post;
        const newValue = value !== undefined ? value : !post.get(attribute);
        post.set(attribute, newValue);
        if (!post.get('isNew')) {
            this.savePostTask.perform().catch((error) => {
                this.showError(error);
                post.rollbackAttributes();
            });
        }
    }

    /**
     * Set an attribute on the post if the value has changed, then validate and persist.
     * @param attribute - The attribute name to set.
     * @param value - The new value.
     */
    private async setAttributeIfChanged(attribute: string, value: any): Promise<void> {
        const post = this.post;
        if (post.get(attribute) === value) {
            return;
        }
        await this.validateAndSave(attribute, value);
    }

    /**
     * Set an image attribute on the post and persist if not new.
     * @param attribute - The attribute name to set.
     * @param image - The image URL or empty string.
     */
    private async setImageAttribute(attribute: string, image: string): Promise<void> {
        const post = this.post;
        if (post.get(attribute) === image) {
            return;
        }
        post.set(attribute, image);
        if (!post.get('isNew')) {
            try {
                await this.savePostTask.perform();
            } catch (error) {
                this.showError(error);
                post.rollbackAttributes();
            }
        }
    }

    /**
     * Validate a single property and persist if not new.
     * @param property - The property to validate.
     * @param value - Optional value to set before validation.
     */
    private async validateAndSave(property: string, value?: any): Promise<void> {
        const post = this.post;
        if (value !== undefined) {
            post.set(property, value);
        }
        try {
            await post.validate({property});
            if (!post.get('isNew')) {
                await this.savePostTask.perform();
            }
        } catch (error) {
            this.showError(error);
            post.rollbackAttributes();
        }
    }
}