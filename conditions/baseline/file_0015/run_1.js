# Refactored SignupPage Component

Here's the refactored code with reduced complexity through several improvements:

1. **Extracted helper functions** out of the class
2. **Split large render methods** into smaller, focused components
3. **Simplified conditional logic** using early returns and lookup tables
4. **Converted class component to functional component** with hooks
5. **Eliminated redundant state updates** and lifecycle methods

```jsx
import React, {useCallback, useContext, useEffect, useRef, useState, useTimeout} from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import CloseButton from '../common/close-button';
import SiteTitleBackButton from '../common/site-title-back-button';
import NewsletterSelectionPage from './newsletter-selection-page';
import ProductsSection from '../common/products-section';
import InputForm from '../common/input-form';
import {ValidateInputForm} from '../../utils/form';
import {
    freeHasBenefitsOrDescription,
    getSiteProducts,
    getSitePrices,
    hasAvailablePrices,
    hasFreeTrialTier,
    hasMultipleNewsletters,
    hasOnlyFreePlan,
    isInviteOnly,
    isFreeSignupAllowed,
    isPaidMembersOnly,
    isSigninAllowed,
    isSignupAllowed
} from '../../utils/helpers';
import {ReactComponent as InvitationIcon} from '../../images/icons/invitation.svg';
import {interceptAnchorClicks} from '../../utils/links';
import {sanitizeHtml} from '../../utils/sanitize-html';
import {t} from '../../utils/i18n';

export {SignupPageStyles} from './signup-page-styles';

// ─── Pure helper functions ────────────────────────────────────────────────────

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

function getFormErrors(state, site) {
    const checkboxRequired = site.portal_signup_checkbox_required && site.portal_signup_terms_html;
    return {
        ...ValidateInputForm({fields: buildInputFields({state, portalName: site.portal_name})}),
        checkbox: checkboxRequired && !state.termsCheckboxChecked
    };
}

function getSectionClass({site, pageQuery, fields}) {
    const plansData = getSitePrices({site, pageQuery});
    const isSingleFreePlan = plansData.length === 1 && plansData[0].type === 'free';

    if (isInviteOnly({site})) {
        return 'invite-only';
    }
    if (plansData.length <= 1) {
        if (isSingleFreePlan || isInviteOnly({site, pageQuery})) {
            if (fields.length === 1) {
                return 'single-field';
            }
            return freeHasBenefitsOrDescription({site}) ? 'singleplan' : 'noplan';
        }
        return 'singleplan';
    }
    return '';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NotificationMessage({className, testId, message}) {
    return (
        <section>
            <div className="gh-portal-section">
                <p className={className} data-testid={testId}>{message}</p>
            </div>
        </section>
    );
}

function LoginMessage({brandColor, doAction, showFreeTrialMessage, site, pageQuery}) {
    return (
        <div>
            {showFreeTrialMessage && (
                <p className="gh-portal-free-trial-notification" data-testid="free-trial-notification-text">
                    {t('After a free trial ends, you will be charged the regular price for the tier you\'ve chosen. You can always cancel before then.')}
                </p>
            )}
            <div className="gh-portal-signup-message">
                <div>{t('Already a member?')}</div>
                <button
                    data-test-button="signin-switch"
                    data-testid="signin-switch"
                    className="gh-portal-btn gh-portal-btn-link"
                    style={{color: brandColor}}
                    onClick={() => doAction('switchPage', {page: 'signin'})}
                >
                    <span>{t('Sign in')}</span>
                </button>
            </div>
        </div>
    );
}

function SignupTerms({site, termsCheckboxChecked, onCheckboxChange, errors, termsRef}) {
    if (!site.portal_signup_terms_html) {
        return null;
    }

    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
        />
    );

    const errorClassName = errors?.checkbox ? 'gh-portal-error' : '';

    return (
        <div
            className={`gh-portal-signup-terms ${errorClassName}`}
            onClick={interceptAnchorClicks}
            ref={termsRef}
        >
            {site.portal_signup_checkbox_required ? (
                <label>
                    <input
                        type="checkbox"
                        checked={!!termsCheckboxChecked}
                        required
                        onChange={onCheckboxChange}
                    />
                    <span className="checkbox" />
                    {termsContent}
                </label>
            ) : termsContent}
        </div>
    );
}

function SubmitButton({action, site, brandColor, pageQuery, onSignup}) {
    if (isInviteOnly({site}) || !hasAvailablePrices({site, pageQuery})) {
        return null;
    }

    const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
    if (!hasOnlyFreePlan({site}) && !showOnlyFree) {
        return null;
    }

    const isRunning = action === 'signup:running';
    const isRetry = action === 'signup:failed';
    const label = isRunning ? t('Sending...') : isRetry ? t('Retry') : t('Sign up');

    return (
        <ActionButton
            style={{width: '100%'}}
            retry={isRetry}
            onClick={onSignup}
            disabled={isRunning}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
            tabIndex={3}
        />
    );
}

function SiteIcon({site, pageQuery}) {
    if (site.icon) {
        return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
    }
    if (!hasAvailablePrices({site, pageQuery}) || isInviteOnly({site}) || !isSignupAllowed({site})) {
        return <InvitationIcon className="gh-portal-icon gh-portal-icon-invitation" />;
    }
    return null;
}

function FormHeader({site, pageQuery}) {
    return (
        <header className="gh-portal-signup-header">
            <SiteIcon site={site} pageQuery={pageQuery} />
            <h1 className="gh-portal-main-title" data-testid="site-title-text">
                {site.title || ''}
            </h1>
        </header>
    );
}

function FreeOnlyLayout({products, signupTerms, submitButton, loginMessage}) {
    return (
        <>
            {products}
            {signupTerms && (
                <div className="gh-portal-signup-terms-wrapper free-only">
                    {signupTerms}
                </div>
            )}
            <div className="gh-portal-btn-container">
                <div className="gh-portal-logged-out-form-container">
                    {submitButton}
                    {loginMessage}
                </div>
            </div>
        </>
    );
}

function PaidLayout({products, signupTerms, loginMessage}) {
    return (
        <>
            {signupTerms && (
                <div className="gh-portal-signup-terms-wrapper">
                    {signupTerms}
                </div>
            )}
            {products}
            {loginMessage}
        </>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

function SignupPage() {
    const context = useContext(AppContext);
    const {site, pageQuery, action, brandColor, doAction} = context;

    const [formState, setFormState] = useState({
        name: '',
        email: '',
        plan: 'free',
        phonenumber: '',
        token: '',
        showNewsletterSelection: false,
        termsCheckboxChecked: false,
        errors: {}
    });

    const termsRef = useRef(null);
    const timeoutRef = useRef(null);

    // Redirect if already logged in
    useEffect(() => {
        if (context.member) {
            doAction('switchPage', {page: 'accountHome'});
        }
    }, [context.member, doAction]);

    // Sync selected plan with available prices
    useEffect(() => {
        const prices = getSitePrices({site, pageQuery});
        const resolvedPriceId = getSelectedPriceId(prices, formState.plan);
        if (resolvedPriceId !== formState.plan) {
            setFormState(prev => ({...prev, plan: resolvedPriceId}));
        }
    }, [site, pageQuery, formState.plan]);

    useEffect(() => {
        return () => clearTimeout(timeoutRef.current);
    }, []);

    const fields = buildInputFields({
        state: formState,
        portalName: site.portal_name
    });

    const handleInputChange = useCallback((e, field) => {
        setFormState(prev => ({...prev, [field.name]: e.target.value}));
    }, []);

    const handleSelectPlan = useCallback((e, priceId) => {
        e?.preventDefault();
        timeoutRef.current = setTimeout(() => {
            setFormState(prev => ({...prev, plan: priceId}));
        }, 5);
    }, []);

    const handleCheckboxChange = useCallback((e) => {
        setFormState(prev => ({...prev, termsCheckboxChecked: e.target.checked}));
    }, []);

    const doSignup = useCallback(() => {
        const errors = getFormErrors(formState, site);
        const hasErrors = Object.values(errors).some(Boolean);

        const otherErrors = {...errors, checkbox: undefined};
        const hasOnlyCheckboxError = errors.checkbox && Object.values(otherErrors).every(e => !e);

        if (hasOnlyCheckboxError && termsRef.current) {
            termsRef.current.scrollIntoView({behavior: 'smooth', block: 'center'});
        }

        if (hasErrors) {
            setFormState(prev => ({...prev, errors}));
            return;
        }

        const {name, email, plan, phonenumber, token} = formState;

        if (hasMultipleNewsletters({site})) {
            setFormState(prev => ({
                ...prev,
                showNewsletterSelection: true,
                pageData: {name, email, plan, phonenumber, token},
                errors: {}
            }));
        } else {
            setFormState(prev => ({...prev, errors: {}}));
            doAction('signup', {name, email, phonenumber, plan, token});
        }
    }, [formState, site, doAction]);

    const handleSignup = useCallback((e) => {
        e.preventDefault();
        doSignup();
    }, [doSignup]);

    const handleChooseSignup = useCallback((e, plan) => {
        e.preventDefault();
        setFormState(prev => ({...prev, plan}), doSignup);
    }, [doSignup]);

    const handleKeyDown = useCallback((e) => {
        if (e.keyCode === 13) {
            handleSignup(e);
        }
    }, [handleSignup]);

    const handleBack = useCallback(() => {
        if (formState.showNewsletterSelection) {
            setFormState(prev => ({...prev, showNewsletterSelection: false}));
        } else {
            doAction('closePopup');
        }
    }, [formState.showNewsletterSelection, doAction]);

    // ── Derived values ──────────────────────────────────────────────────────

    const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
    const hasOnlyFree = hasOnlyFreePlan({site}) || showOnlyFree;
    const showFreeTrialMessage = hasFreeTrialTier({site, pageQuery}) &&
        !isInviteOnly({site}) &&
        hasAvailablePrices({site, pageQuery});

    const sectionClass = getSectionClass({site, pageQuery, fields});

    // ── Shared sub-elements ─────────────────────────────────────────────────

    const loginMessage = (
        <LoginMessage
            brandColor={brandColor}
            doAction={doAction}
            showFreeTrialMessage={showFreeTrialMessage}
            site={site}
            pageQuery={pageQuery}
        />
    );

    const signupTerms = (
        <SignupTerms
            site={site}
            termsCheckboxChecked={formState.termsCheckboxChecked}
            onCheckboxChange={handleCheckboxChange}
            errors={formState.errors}
            termsRef={termsRef}
        />
    );

    const products = (
        <ProductsSection
            handleChooseSignup={handleChooseSignup}
            products={getSiteProducts({site, pageQuery})}
            onPlanSelect={handleSelectPlan}
            errors={
                Object.keys(formState.errors).length > 0 && formState.plan
                    ? {[formState.plan]: t('Please fill in required fields')}
                    : {}
            }
        />
    );

    const submitButton = (
        <SubmitButton
            action={action}
            site={site}
            brandColor={brandColor}
            pageQuery={pageQuery}
            onSignup={handleSignup}
        />
    );

    // ── Form content ────────────────────────────────────────────────────────

    function renderFormContent() {
        if (formState.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={formState.pageData}
                    onBack={() => setFormState(prev => ({...prev, showNewsletterSelection: false}))}
                />
            );
        }

        if (isInviteOnly({site})) {
            return (
                <NotificationMessage
                    className="gh-portal-invite-only-notification"
                    testId="invite-only-notification-text"
                    message={t('This site is invite-only, contact the owner for access.')}
                />
            );
        }

        if (isPaidMembersOnly({site}) && pageQuery === 'free') {
            return (
                <NotificationMessage
                    className="gh-portal-paid-members-only-notification"
                    testId="paid-members-only-notification-text"
                    message={t('This site only accepts paid members.')}
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
                <NotificationMessage
                    className="gh-portal-invite-only-notification"
                    testId="invite-only-notification-text"
                    message={t('This site is invite-only, contact the owner for access.')}
                />
            );
        }

        return (
            <section className="gh-portal-signup">
                <div className="gh-portal-section">
                    <div className="gh-portal-logged-out-form-container">
                        <InputForm
                            fields={fields}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                        />
                    </div>
                    <div>
                        {hasOnlyFree ? (
                            <FreeOnlyLayout
                                products={products}
                                signupTerms={signupTerms}
                                submitButton={submitButton}
                                loginMessage={loginMessage}
                            />
                        ) : (
                            <PaidLayout
                                products={products}
                                signupTerms={signupTerms}
                                loginMessage={loginMessage}
                            />
                        )}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <>
            <div className="gh-portal-back-sitetitle">
                <SiteTitleBackButton onBack={handleBack} />
            </div>
            <CloseButton />
            <div className={`gh-portal-content signup ${sectionClass}`}>
                <FormHeader site={site} pageQuery={pageQuery} />
                {renderFormContent()}
            </div>
        </>
    );
}

SignupPage.contextType = AppContext;

export default SignupPage;
```

## Key Refactoring Decisions

| Change | Reason |
|--------|--------|
| **Class → Function component** | Eliminates lifecycle boilerplate; hooks are more composable |
| **Extracted pure helpers** (`getSelectedPriceId`, `buildInputFields`, `getFormErrors`, `getSectionClass`) | Easier to test in isolation; removes `this` coupling |
| **Split render methods into components** (`NotificationMessage`, `LoginMessage`, `SignupTerms`, `SubmitButton`, `SiteIcon`, `FreeOnlyLayout`, `PaidLayout`) | Single responsibility; each component has one clear job |
| **Unified `formState`** | Reduces `setState` call count and keeps related state co-located |
| **`useCallback` for handlers** | Prevents unnecessary re-renders of child components |
| **Removed redundant `<>` wrappers** in `renderProducts` | Unnecessary fragment wrapping |
| **Simplified error-only-checkbox logic** | Cleaner boolean expression using `every` |
| **Moved CSS to separate file** | Keeps component file focused on logic/structure |