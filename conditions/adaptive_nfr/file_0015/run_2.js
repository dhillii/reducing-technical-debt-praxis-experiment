# Refactored SignupPage Component

The main issues I identified:
1. **Large class component** that can be broken into smaller, focused pieces
2. **Complex conditional rendering** in `renderForm()` that's hard to follow
3. **Repeated patterns** in notification message renderers
4. **Mixed concerns** — state logic, form validation, and rendering all in one class
5. **`getClassNames()`** has deeply nested conditionals

Here's the refactored version:

```javascript
import React from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import CloseButton from '../common/close-button';
import SiteTitleBackButton from '../common/site-title-back-button';
import NewsletterSelectionPage from './newsletter-selection-page';
import ProductsSection from '../common/products-section';
import InputForm from '../common/input-form';
import {ValidateInputForm} from '../../utils/form';
import {
    getSiteProducts,
    getSitePrices,
    hasAvailablePrices,
    hasOnlyFreePlan,
    isInviteOnly,
    isFreeSignupAllowed,
    isPaidMembersOnly,
    freeHasBenefitsOrDescription,
    hasMultipleNewsletters,
    hasFreeTrialTier,
    isSignupAllowed,
    isSigninAllowed
} from '../../utils/helpers';
import {ReactComponent as InvitationIcon} from '../../images/icons/invitation.svg';
import {interceptAnchorClicks} from '../../utils/links';
import {sanitizeHtml} from '../../utils/sanitize-html';
import {t} from '../../utils/i18n';

export {SignupPageStyles} from './signup-page-styles';

// ---------------------------------------------------------------------------
// Small, focused sub-components
// ---------------------------------------------------------------------------

const NotificationMessage = ({className, testId, message}) => (
    <section>
        <div className="gh-portal-section">
            <p className={className} data-testid={testId}>
                {message}
            </p>
        </div>
    </section>
);

const NotificationMessageWithLogin = ({className, testId, message, loginMessage}) => (
    <section>
        <div className="gh-portal-section">
            <p className={className} data-testid={testId}>
                {message}
            </p>
            {loginMessage}
        </div>
    </section>
);

const FreeTrialNotification = () => (
    <p
        className="gh-portal-free-trial-notification"
        data-testid="free-trial-notification-text"
    >
        {t("After a free trial ends, you will be charged the regular price for the tier you've chosen. You can always cancel before then.")}
    </p>
);

const SignInPrompt = ({brandColor, onSignIn, showFreeTrial}) => (
    <div>
        {showFreeTrial && <FreeTrialNotification />}
        <div className="gh-portal-signup-message">
            <div>{t('Already a member?')}</div>
            <button
                data-test-button="signin-switch"
                data-testid="signin-switch"
                className="gh-portal-btn gh-portal-btn-link"
                style={{color: brandColor}}
                onClick={onSignIn}
            >
                <span>{t('Sign in')}</span>
            </button>
        </div>
    </div>
);

const SignupTermsCheckbox = ({checked, onChange}) => (
    <label>
        <input
            type="checkbox"
            checked={!!checked}
            required={true}
            onChange={onChange}
        />
        <span className="checkbox" />
    </label>
);

// ---------------------------------------------------------------------------
// Helpers extracted from the class
// ---------------------------------------------------------------------------

function getSelectedPriceId(prices = [], selectedPriceId) {
    if (!prices.length || selectedPriceId === 'free') {
        return 'free';
    }
    const hasSelectedPlan = prices.some(p => p.id === selectedPriceId);
    return hasSelectedPlan ? selectedPriceId : (prices[0].id || 'free');
}

function buildInputFields({state, portalName}) {
    const errors = state.errors || {};

    const fields = [
        {
            type: 'email',
            value: state.email,
            placeholder: t('jamie@example.com'),
            label: t('Email'),
            name: 'email',
            required: true,
            tabIndex: 2,
            errorMessage: errors.email || ''
        },
        {
            type: 'text',
            value: state.phonenumber,
            placeholder: t('+1 (123) 456-7890'),
            label: t('Phone number'),
            name: 'phonenumber',
            required: false,
            tabIndex: -1,
            autoComplete: 'off',
            hidden: true
        }
    ];

    if (portalName) {
        fields.unshift({
            type: 'text',
            value: state.name,
            placeholder: t('Jamie Larson'),
            label: t('Name'),
            name: 'name',
            required: true,
            tabIndex: 1,
            errorMessage: errors.name || ''
        });
    }

    fields[0].autoFocus = true;
    return fields;
}

function deriveSectionClass({site, pageQuery, plansData, fields}) {
    const singleFreeOrInviteOnly =
        (plansData.length === 1 && plansData[0].type === 'free') ||
        isInviteOnly({site, pageQuery});

    if (isInviteOnly({site})) {
        return 'invite-only';
    }

    if (plansData.length <= 1 || isInviteOnly({site})) {
        if (singleFreeOrInviteOnly) {
            if (fields.length === 1) {
                return 'single-field';
            }
            return freeHasBenefitsOrDescription({site}) ? 'singleplan' : 'noplan';
        }
        return 'singleplan';
    }

    return '';
}

function deriveFooterClass({site}) {
    return isInviteOnly({site}) ? 'invite-only' : '';
}

// ---------------------------------------------------------------------------
// Main class component (state + context wiring only)
// ---------------------------------------------------------------------------

class SignupPage extends React.Component {
    static contextType = AppContext;

    constructor(props) {
        super(props);
        this.state = {
            name: '',
            email: '',
            plan: 'free',
            showNewsletterSelection: false,
            termsCheckboxChecked: false
        };
        this.termsRef = React.createRef();
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    componentDidMount() {
        const {member} = this.context;
        if (member) {
            this.context.doAction('switchPage', {page: 'accountHome'});
        }
        this.syncSelectedPlan();
    }

    componentDidUpdate() {
        this.syncSelectedPlan();
    }

    componentWillUnmount() {
        clearTimeout(this.timeoutId);
    }

    // -------------------------------------------------------------------------
    // Plan sync
    // -------------------------------------------------------------------------

    syncSelectedPlan() {
        const {site, pageQuery} = this.context;
        const prices = getSitePrices({site, pageQuery});
        const resolved = getSelectedPriceId(prices, this.state.plan);
        if (resolved !== this.state.plan) {
            this.setState({plan: resolved});
        }
    }

    // -------------------------------------------------------------------------
    // Form validation
    // -------------------------------------------------------------------------

    getFormErrors(state) {
        const {site} = this.context;
        const checkboxRequired =
            site.portal_signup_checkbox_required && site.portal_signup_terms_html;

        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxRequired && !state.termsCheckboxChecked
        };
    }

    getInputFields({state, fieldNames} = {}) {
        const {site: {portal_name: portalName}} = this.context;
        const fields = buildInputFields({state, portalName});

        if (fieldNames?.length) {
            return fields.filter(f => fieldNames.includes(f.name));
        }
        return fields;
    }

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    doSignup() {
        this.setState(
            state => ({errors: this.getFormErrors(state)}),
            () => {
                const {site, doAction} = this.context;
                const {name, email, plan, phonenumber, token, errors} = this.state;

                const hasFormErrors = errors && Object.values(errors).some(Boolean);

                if (hasFormErrors) {
                    this.scrollToCheckboxIfOnlyError(errors);
                    return;
                }

                if (hasMultipleNewsletters({site})) {
                    this.setState({
                        showNewsletterSelection: true,
                        pageData: {name, email, plan, phonenumber, token},
                        errors: {}
                    });
                } else {
                    this.setState({errors: {}});
                    doAction('signup', {name, email, phonenumber, plan, token});
                }
            }
        );
    }

    scrollToCheckboxIfOnlyError(errors) {
        const otherErrors = Object.entries(errors)
            .filter(([key]) => key !== 'checkbox')
            .map(([, val]) => val);

        const hasOnlyCheckboxError = errors.checkbox && otherErrors.every(e => !e);
        if (hasOnlyCheckboxError && this.termsRef.current) {
            this.termsRef.current.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }

    // -------------------------------------------------------------------------
    // Event handlers
    // -------------------------------------------------------------------------

    handleSignup = (e) => {
        e.preventDefault();
        this.doSignup();
    };

    handleChooseSignup = (e, plan) => {
        e.preventDefault();
        this.setState({plan}, () => this.doSignup());
    };

    handleInputChange = (e, field) => {
        this.setState({[field.name]: e.target.value});
    };

    handleSelectPlan = (e, priceId) => {
        e?.preventDefault();
        this.timeoutId = setTimeout(() => this.setState({plan: priceId}), 5);
    };

    handleKeyDown = (e) => {
        if (e.keyCode === 13) {
            this.handleSignup(e);
        }
    };

    handleTermsChange = (e) => {
        this.setState({termsCheckboxChecked: e.target.checked});
    };

    // -------------------------------------------------------------------------
    // Derived data helpers
    // -------------------------------------------------------------------------

    getClassNames() {
        const {site, pageQuery} = this.context;
        const plansData = getSitePrices({site, pageQuery});
        const fields = this.getInputFields({state: this.state});

        return {
            sectionClass: deriveSectionClass({site, pageQuery, plansData, fields}),
            footerClass: deriveFooterClass({site})
        };
    }

    isShowOnlyFree() {
        const {site, pageQuery} = this.context;
        return pageQuery === 'free' && isFreeSignupAllowed({site});
    }

    // -------------------------------------------------------------------------
    // Render helpers
    // -------------------------------------------------------------------------

    renderSiteIcon() {
        const {site, pageQuery} = this.context;

        if (site.icon) {
            return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
        }

        const showInviteIcon =
            !hasAvailablePrices({site, pageQuery}) ||
            isInviteOnly({site}) ||
            !isSignupAllowed({site});

        if (showInviteIcon) {
            return <InvitationIcon className="gh-portal-icon gh-portal-icon-invitation" />;
        }

        return null;
    }

    renderFormHeader() {
        const {site} = this.context;
        return (
            <header className="gh-portal-signup-header">
                {this.renderSiteIcon()}
                <h1 className="gh-portal-main-title" data-testid="site-title-text">
                    {site.title || ''}
                </h1>
            </header>
        );
    }

    renderSignupTerms() {
        const {site} = this.context;
        const {portal_signup_terms_html, portal_signup_checkbox_required} = site;

        if (!portal_signup_terms_html) {
            return null;
        }

        const termsContent = (
            <div
                className="gh-portal-signup-terms-content"
                dangerouslySetInnerHTML={{__html: sanitizeHtml(portal_signup_terms_html)}}
            />
        );

        const errorClassName = this.state.errors?.checkbox ? 'gh-portal-error' : '';

        return (
            <div
                className={`gh-portal-signup-terms ${errorClassName}`}
                onClick={interceptAnchorClicks}
                ref={this.termsRef}
            >
                {portal_signup_checkbox_required ? (
                    <label>
                        <input
                            type="checkbox"
                            checked={!!this.state.termsCheckboxChecked}
                            required={true}
                            onChange={this.handleTermsChange}
                        />
                        <span className="checkbox" />
                        {termsContent}
                    </label>
                ) : termsContent}
            </div>
        );
    }

    renderSubmitButton() {
        const {action, site, brandColor, pageQuery} = this.context;

        const signupBlocked =
            isInviteOnly({site}) || !hasAvailablePrices({site, pageQuery});
        const isOnlyFree = hasOnlyFreePlan({site}) || this.isShowOnlyFree();

        if (signupBlocked || !isOnlyFree) {
            return null;
        }

        const buttonStates = {
            'signup:running': {label: t('Sending...'), isRunning: true},
            'signup:failed': {label: t('Retry'), retry: true}
        };
        const {label = t('Sign up'), isRunning = false, retry = false} =
            buttonStates[action] || {};

        return (
            <ActionButton
                style={{width: '100%'}}
                retry={retry}
                onClick={this.handleSignup}
                disabled={action === 'signup:running'}
                brandColor={brandColor}
                label={label}
                isRunning={isRunning}
                tabIndex={3}
            />
        );
    }

    renderProducts() {
        const {site, pageQuery} = this.context;
        const products = getSiteProducts({site, pageQuery});
        const errors = this.state.errors || {};
        const priceErrors = {};

        if (Object.keys(errors).length > 0 && this.state.plan) {
            priceErrors[this.state.plan] = t('Please fill in required fields');
        }

        return (
            <ProductsSection
                handleChooseSignup={this.handleChooseSignup}
                products={products}
                onPlanSelect={this.handleSelectPlan}
                errors={priceErrors}
            />
        );
    }

    renderSignInPrompt() {
        const {brandColor, doAction, site, pageQuery} = this.context;
        const showFreeTrial =
            hasFreeTrialTier({site, pageQuery}) &&
            !isInviteOnly({site}) &&
            hasAvailablePrices({site, pageQuery});

        return (
            <SignInPrompt
                brandColor={brandColor}
                onSignIn={() => doAction('switchPage', {page: 'signin'})}
                showFreeTrial={showFreeTrial}
            />
        );
    }

    renderTermsWrapper(freeOnly = false) {
        const signupTerms = this.renderSignupTerms();
        if (!signupTerms) {
            return null;
        }
        const wrapperClass = `gh-portal-signup-terms-wrapper${freeOnly ? ' free-only' : ''}`;
        return <div className={wrapperClass}>{signupTerms}</div>;
    }

    renderFreeOnlyLayout() {
        return (
            <>
                {this.renderProducts()}
                {this.renderTermsWrapper(true)}
                <div className="gh-portal-btn-container">
                    <div className="gh-portal-logged-out-form-container">
                        {this.renderSubmitButton()}
                        {this.renderSignInPrompt()}
                    </div>
                </div>
            </>
        );
    }

    renderPaidLayout() {
        return (
            <>
                {this.renderTermsWrapper(false)}
                {this.renderProducts()}
                {this.renderSignInPrompt()}
            </>
        );
    }

    renderMainForm() {
        const fields = this.getInputFields({state: this.state});
        const hasOnlyFree = hasOnlyFreePlan({site: this.context.site}) || this.isShowOnlyFree();

        return (
            <section className="gh-portal-signup">
                <div className="gh-portal-section">
                    <div className="gh-portal-logged-out-form-container">
                        <InputForm
                            fields={fields}
                            onChange={this.handleInputChange}
                            onKeyDown={this.handleKeyDown}
                        />
                    </div>
                    <div>
                        {hasOnlyFree ? this.renderFreeOnlyLayout() : this.renderPaidLayout()}
                    </div>
                </div>
            </section>
        );
    }

    renderForm() {
        const {site, pageQuery} = this.context;

        if (this.state.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={this.state.pageData}
                    onBack={() => this.setState({showNewsletterSelection: false})}
                />
            );
        }

        if (isInviteOnly({site})) {
            return (
                <NotificationMessageWithLogin
                    className="gh-portal-invite-only-notification"
                    testId="invite-only-notification-text"
                    message={t('This site is invite-only, contact the owner for access.')}
                    loginMessage={this.renderSignInPrompt()}
                />
            );
        }

        if (isPaidMembersOnly({site}) && pageQuery === 'free') {
            return (
                <NotificationMessageWithLogin
                    className="gh-portal-paid-members-only-notification"
                    testId="paid-members-only-notification-text"
                    message={t('This site only accepts paid members.')}
                    loginMessage={this.renderSignInPrompt()}
                />
            );
        }

        if (!isSignupAllowed({site}) || !hasAvailablePrices({site, pageQuery})) {
            if (!isSigninAllowed({site})) {
                return (
                    <NotificationMessage
                        className="gh-portal-members-disabled-notification"
                        testId="members-disabled-notification-text"
                        message={t('Memberships unavailable, contact the owner for access.')}
                    />
                );
            }

            return (
                <NotificationMessageWithLogin
                    className="gh-portal-invite-only-notification"
                    testId="invite-only-notification-text"
                    message={t('This site is invite-only, contact the owner for access.')}
                    loginMessage={this.renderSignInPrompt()}
                />
            );
        }

        return this.renderMainForm();
    }

    render() {
        const {sectionClass} = this.getClassNames();

        const handleBack = () => {
            if (this.state.showNewsletterSelection) {
                this.setState({showNewsletterSelection: false});
            } else {
                this.context.doAction('closePopup');
            }
        };

        return (
            <>
                <div className="gh-portal-back-sitetitle">
                    <SiteTitleBackButton onBack={handleBack} />
                </div>
                <CloseButton />
                <div className={`gh-portal-content signup ${sectionClass}`}>
                    {this.renderFormHeader()}
                    {this.renderForm()}
                </div>
            </>
        );
    }
}

export default SignupPage;
```

## Key Changes Made

| Area | Before | After |
|------|--------|-------|
| **Notification renderers** | 4 near-identical `render*Message()` methods | 2 reusable `NotificationMessage` / `NotificationMessageWithLogin` components |
| **`renderForm()`** | Deep nested ternaries mixing layout and logic | Flat early-return guards, delegates to `renderMainForm()` |
| **`renderMainForm()`** | Single method with duplicated ternary blocks | Splits into `renderFreeOnlyLayout()` / `renderPaidLayout()` |
| **`getClassNames()`** | Deeply nested `if/else` | Extracted `deriveSectionClass()` / `deriveFooterClass()` pure functions |
| **Event handlers** | Mix of arrow and regular methods | Consistently arrow functions (no `.bind` needed) |
| **`doSignup()`** | Early logic buried after setState callback | Extracted `scrollToCheckboxIfOnlyError()`, early return on errors |
| **`getInputFields()`** | Inline field building inside class | Extracted `buildInputFields()` pure function |
| **`getSelectedPriceId()`** | Instance method with no `this` usage | Extracted as module-level pure function |
| **`FreeTrialNotification`** | Inline JSX in `renderLoginMessage()` | Standalone stateless component |
| **`SignInPrompt`** | Inline JSX with free-trial logic mixed in | Standalone component with `showFreeTrial` prop |