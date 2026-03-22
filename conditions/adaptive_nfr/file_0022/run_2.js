# Refactored GhPostSettingsMenu Component

The main complexity issues are:
1. **Massive duplication** in setter actions (setMetaTitle, setOgTitle, setTwitterTitle, etc. all follow the same pattern)
2. **Duplication** in image actions (setCoverImage, clearCoverImage, setOgImage, etc.)
3. **Verbose comments** that restate the code
4. **Repeated save-with-error-handling** pattern

## Refactored Code

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
        const urlParts = [];

        if (this.post.canonicalUrl) {
            try {
                const {host, pathname} = new URL(this.post.canonicalUrl);
                urlParts.push(host, ...pathname.split('/').reject(p => !p));
            } catch (e) {
                // no-op, invalid URL
            }
        } else {
            const {host, pathname} = new URL(this.config.blogUrl);
            urlParts.push(host, ...pathname.split('/').reject(p => !p), this.post.slug);
        }

        return urlParts.join(' › ');
    }

    get canViewPostHistory() {
        if (this.post.isNew || this.post.lexical === null) {
            return false;
        }
        if (!this.post.isPublished && !this.post.isSent) {
            return true;
        }
        return !this.post.emailOnly;
    }

    get themeMissingShowTitleAndFeatureImage() {
        return !this.themeManagement.activeTheme.hasPageBuilderFeature('show_title_and_feature_image');
    }

    // --- Lifecycle ---

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

    @action
    discardEnter() {
        return false;
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

    // --- Post property toggle actions ---

    @action
    toggleFeatured() {
        this.post.featured = !this.post.featured;
        this._saveIfNotNew();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        this._saveIfNotNew();
    }

    // --- Slug action ---

    @action
    updateSlug(newSlug) {
        return this.updateSlugTask
            .perform(newSlug)
            .catch((error) => {
                this.showError(error);
                this.post.rollbackAttributes();
            });
    }

    // --- Published date/time actions ---

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
            // validation error — swallow
        }
    }

    // --- Text field setter actions (validate → save pattern) ---

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

    // --- Image setter/clearer actions ---

    @action
    setCoverImage(image) {
        return this._setPostImage('featureImage', image);
    }

    @action
    clearCoverImage() {
        return this._setPostImage('featureImage', '');
    }

    @action
    setOgImage(image) {
        return this._setPostImage('ogImage', image);
    }

    @action
    clearOgImage() {
        return this._setPostImage('ogImage', '');
    }

    @action
    setTwitterImage(image) {
        return this._setPostImage('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        return this._setPostImage('twitterImage', '');
    }

    // --- Authors action ---

    @action
    changeAuthors(newAuthors) {
        const post = this.post;

        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (!post.get('isNew')) {
            this.savePostTask.perform().catch((error) => {
                this.showError(error);
                post.rollbackAttributes();
            });
        }
    }

    // --- Save / delete actions ---

    @action
    savePost() {
        return this._saveWithRollback();
    }

    @action
    deletePostInternal() {
        this.deletePost?.();
    }

    @action
    setSidebarWidthFromElement(element) {
        this.setSidebarWidthVariable(element.getBoundingClientRect().width);
    }

    // --- Private helpers ---

    /**
     * Generic setter for post text properties: skips save if unchanged,
     * validates, then saves unless the post is new.
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
     * Sets a post image property and saves unless the post is new.
     */
    _setPostImage(property, value) {
        this.set(`post.${property}`, value);
        this._saveIfNotNew();
    }

    /**
     * Saves the post only if it has been persisted at least once.
     */
    _saveIfNotNew() {
        if (!this.post.isNew) {
            this._saveWithRollback();
        }
    }

    /**
     * Performs a save and rolls back attributes on failure.
     */
    _saveWithRollback() {
        return this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
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
}
```

## Key Refactoring Changes

| Problem | Solution |
|---|---|
| 10 near-identical setter actions (~200 lines) | Extracted `_setPostProperty(property, value)` helper |
| 6 near-identical image actions (~60 lines) | Extracted `_setPostImage(property, value)` helper |
| Repeated save+rollback pattern | Extracted `_saveWithRollback()` helper |
| Repeated `if (isNew) return` + save pattern | Extracted `_saveIfNotNew()` helper |
| Verbose `canViewPostHistory` with redundant comments | Simplified to 3 early-return conditions |
| `seoURL` destructuring verbosity | Used destructuring directly in `new URL()` calls |
| Noisy inline comments restating the code | Removed; kept only non-obvious ones |
| `deletePost?.()` optional chaining | Replaced verbose `if (this.deletePost)` guard |