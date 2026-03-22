# Refactored GhPostSettingsMenu Component

The main complexity issues are:
1. **Massive duplication** in setter actions (setMetaTitle, setOgTitle, setTwitterTitle, etc. all follow the same pattern)
2. **Duplication** in image actions (setCoverImage, clearCoverImage, setOgImage, etc.)
3. **Verbose post history logic** that can be simplified
4. **Repeated save-with-error-handling** pattern

```javascript
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

    // --- Scratch aliases ---
    @alias('post.canonicalUrlScratch') canonicalUrlScratch;
    @alias('post.customExcerptScratch') customExcerptScratch;
    @alias('post.codeinjectionFootScratch') codeinjectionFootScratch;
    @alias('post.codeinjectionHeadScratch') codeinjectionHeadScratch;
    @alias('post.metaDescriptionScratch') metaDescriptionScratch;
    @alias('post.metaTitleScratch') metaTitleScratch;
    @alias('post.ogDescriptionScratch') ogDescriptionScratch;
    @alias('post.ogTitleScratch') ogTitleScratch;
    @alias('post.twitterDescriptionScratch') twitterDescriptionScratch;
    @alias('post.twitterTitleScratch') twitterTitleScratch;

    @boundOneWay('post.slug') slugValue;
    @boundOneWay('post.uuid') uuidValue;

    // --- Computed social/SEO properties ---
    @or('metaDescriptionScratch', 'customExcerptScratch')
        seoDescription;

    @or('ogDescriptionScratch', 'customExcerptScratch', 'seoDescription', 'post.excerpt', 'settings.description', '')
        facebookDescription;

    @or('post.ogImage', 'post.featureImage', 'settings.ogImage', 'settings.coverImage')
        facebookImage;

    @or('ogTitleScratch', 'seoTitle')
        facebookTitle;

    @or('twitterDescriptionScratch', 'customExcerptScratch', 'seoDescription', 'post.excerpt', 'settings.description', '')
        twitterDescription;

    @or('post.twitterImage', 'post.featureImage', 'settings.twitterImage', 'settings.coverImage')
        twitterImage;

    @or('twitterTitleScratch', 'seoTitle')
        twitterTitle;

    @or('session.user.isOwnerOnly', 'session.user.isAdminOnly', 'session.user.isEitherEditor')
        showVisibilityInput;

    @computed('metaTitleScratch', 'post.titleScratch')
    get seoTitle() {
        return this.metaTitleScratch || this.post.titleScratch || '(Untitled)';
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        const buildParts = (url, extraSegment = null) => {
            const parsed = new URL(url);
            const parts = [
                parsed.host,
                ...parsed.pathname.split('/').filter(Boolean)
            ];
            if (extraSegment) {
                parts.push(extraSegment);
            }
            return parts;
        };

        try {
            const parts = this.post.canonicalUrl
                ? buildParts(this.post.canonicalUrl)
                : buildParts(this.config.blogUrl, this.post.slug);

            return parts.join(' › ');
        } catch (e) {
            return '';
        }
    }

    get canViewPostHistory() {
        const {post} = this;

        if (post.isNew || post.lexical === null) {
            return false;
        }

        if (!post.isPublished && !post.isSent) {
            return true;
        }

        return !post.emailOnly;
    }

    get themeMissingShowTitleAndFeatureImage() {
        return !this.themeManagement.activeTheme.hasPageBuilderFeature('show_title_and_feature_image');
    }

    // --- Lifecycle ---

    willDestroyElement() {
        super.willDestroyElement(...arguments);

        const {post} = this;
        const errors = post.get('errors');

        if (errors.has('publishedAtBlogDate') || errors.has('publishedAtBlogTime')) {
            post.set('publishedAtBlogTZ', post.get('publishedAtUTC'));
            post.validate({attribute: 'publishedAtBlog'});
        }

        this.setSidebarWidthVariable(0);
    }

    // --- Private helpers ---

    /**
     * Performs savePostTask and handles errors with rollback.
     */
    _saveWithRollback() {
        return this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Generic setter for simple post text properties.
     * Validates the property and saves if the post is not new.
     */
    _setPostProperty(property, value) {
        const post = this.post;

        if (post.get(property) === value) {
            return;
        }

        post.set(property, value);

        return post.validate({property}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    /**
     * Generic setter for post image properties.
     * Saves immediately unless the post is new.
     */
    _setPostImage(property, value) {
        this.set(property, value);

        if (!this.get('post.isNew')) {
            this._saveWithRollback();
        }
    }

    // --- Subview actions ---

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

    // --- Post history actions ---

    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    // --- Misc actions ---

    @action
    discardEnter() {
        return false;
    }

    @action
    toggleFeatured() {
        this.post.featured = !this.post.featured;

        if (!this.post.isNew) {
            this._saveWithRollback();
        }
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;

        if (!this.post.isNew) {
            this._saveWithRollback();
        }
    }

    @action
    updateSlug(newSlug) {
        return this.updateSlugTask.perform(newSlug).catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    // --- Date/time actions ---

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

    // --- Visibility action ---

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
            if (e) {
                throw e;
            }
            // validation error — swallow silently
        }
    }

    // --- Text property setters (delegated to _setPostProperty) ---

    @action
    setCustomExcerpt(excerpt) {
        return this._setPostProperty('customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        return this._setPostProperty('codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        return this._setPostProperty('codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        return this._setPostProperty('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        return this._setPostProperty('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        return this._setPostProperty('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        return this._setPostProperty('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        return this._setPostProperty('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this._setPostProperty('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this._setPostProperty('twitterDescription', twitterDescription);
    }

    // --- Image setters (delegated to _setPostImage) ---

    @action
    setCoverImage(image) {
        this._setPostImage('post.featureImage', image);
    }

    @action
    clearCoverImage() {
        this._setPostImage('post.featureImage', '');
    }

    @action
    setOgImage(image) {
        this._setPostImage('post.ogImage', image);
    }

    @action
    clearOgImage() {
        this._setPostImage('post.ogImage', '');
    }

    @action
    setTwitterImage(image) {
        this._setPostImage('post.twitterImage', image);
    }

    @action
    clearTwitterImage() {
        this._setPostImage('post.twitterImage', '');
    }

    // --- Author action ---

    @action
    changeAuthors(newAuthors) {
        const post = this.post;
        const authorsUnchanged = newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join();

        if (authorsUnchanged) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (!post.get('isNew')) {
            this._saveWithRollback();
        }
    }

    // --- Save / delete actions ---

    @action
    savePost() {
        this._saveWithRollback();
    }

    @action
    deletePostInternal() {
        this.deletePost?.();
    }

    // --- Sidebar width actions ---

    @action
    setSidebarWidthFromElement(element) {
        this.setSidebarWidthVariable(element.getBoundingClientRect().width);
    }

    // --- Utility methods ---

    showError(error) {
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}
```

## Key Refactoring Changes

| Problem | Solution |
|---|---|
| 10 near-identical setter actions (setMetaTitle, setOgTitle, etc.) | Extracted `_setPostProperty(property, value)` helper — each action is now a one-liner |
| 6 near-identical image actions (setCoverImage, clearCoverImage, etc.) | Extracted `_setPostImage(property, value)` helper |
| Repeated `savePostTask.perform().catch(showError + rollback)` pattern | Extracted `_saveWithRollback()` helper |
| Verbose `canViewPostHistory` with redundant comments | Simplified to clear early-returns without noise comments |
| `seoURL` try/catch with duplicated URL parsing logic | Extracted `buildParts()` inner function, unified try/catch |
| `deletePostInternal` verbose null check | Used optional chaining `this.deletePost?.()` |
| Inconsistent `let` vs `const` | Standardized to `const`/destructuring where appropriate |