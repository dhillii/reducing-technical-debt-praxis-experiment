# Refactored SignupPage Component

## Key Refactoring Decisions

1. **Convert class component to functional component** - Eliminates verbose lifecycle methods and `this` binding
2. **Extract sub-components** - Break out notification messages, form sections, and terms into focused components
3. **Custom hooks** - Extract state logic and side effects into `useSignupForm`
4. **Simplify conditional rendering** - Replace nested ternaries with early returns and clear conditionals
5. **Reduce duplication** - Consolidate repeated notification section patterns

```jsx
import React, {useCallback, useContext, useEffect, useRef, useState} from 'react';
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
    getSitePrices,
    getSiteProducts,
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function NotificationSection({className, testId, message, children}) {
    return (
        <section>
            <div className="gh-portal-section">
                <p className={className} data-testid={testId}>{message}</p>
                {children}
            </div>
        </section>
    );
}

function FreeTrialMessage({site, pageQuery}) {
    if (!hasFreeTrialTier({site, pageQuery}) || isInviteOnly({site}) || !hasAvailablePrices({site, pageQuery})) {
        return null;
    }
    return (
        <p className="gh-portal-free-trial-notification" data-testid="free-trial-notification-text">
            {t('After a free trial ends, you will be charged the regular price for the tier you\'ve chosen. You can always cancel before then.')}
        </p>
    );
}

function LoginMessage({brandColor, onSignIn, site, pageQuery}) {
    return (
        <div>
            <FreeTrialMessage site={site} pageQuery={pageQuery} />
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
}

function SignupTerms({site, termsCheckboxChecked, onCheckboxChange, hasError, termsRef}) {
    if (!site.portal_signup_terms_html) {
        return null;
    }

    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
        />
    );

    const termsBody = site.portal_signup_checkbox_required ? (
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
    ) : termsContent;

    return (
        <div
            className={`gh-portal-signup-terms${hasError ? ' gh-portal-error' : ''}`}
            onClick={interceptAnchorClicks}
            ref={termsRef}
        >
            {termsBody}
        </div>
    );
}

function SiteIcon({site, pageQuery}) {
    if (site.icon) {
        return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
    }

    const showInviteIcon = !hasAvailablePrices({site, pageQuery})
        || isInviteOnly({site})
        || !isSignupAllowed({site});

    return showInviteIcon
        ? <InvitationIcon className="gh-portal-icon gh-portal-icon-invitation" />
        : null;
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

// ─── Custom Hook ─────────────────────────────────────────────────────────────

function useSignupForm(context) {
    const {site, pageQuery, doAction} = context;
    const [formState, setFormState] = useState({
        name: '',
        email: '',
        plan: 'free',
        phonenumber: '',
        token: '',
        showNewsletterSelection: false,
        pageData: null,
        termsCheckboxChecked: false,
        errors: {}
    });

    const termsRef = useRef(null);
    const timeoutRef = useRef(null);

    // Sync selected plan with available prices
    useEffect(() => {
        const prices = getSitePrices({site, pageQuery});
        const resolvedPlanId = resolveSelectedPriceId(prices, formState.plan);
        if (resolvedPlanId !== formState.plan) {
            setFormState(prev => ({...prev, plan: resolvedPlanId}));
        }
    });

    useEffect(() => {
        return () => clearTimeout(timeoutRef.current);
    }, []);

    function resolveSelectedPriceId(prices = [], selectedPriceId) {
        if (!prices.length || selectedPriceId === 'free') {
            return 'free';
        }
        const isValid = prices.some(p => p.id === selectedPriceId);
        return isValid ? selectedPriceId : (prices[0].id || 'free');
    }

    function getInputFields({state, fieldNames} = {}) {
        const {site: {portal_name: portalName}} = context;
        const errors = state?.errors || formState.errors;
        const currentState = state || formState;

        const fields = [
            {
                type: 'email',
                value: currentState.email,
                placeholder: t('jamie@example.com'),
                label: t('Email'),
                name: 'email',
                required: true,
                tabIndex: 2,
                errorMessage: errors.email || ''
            },
            {
                type: 'text',
                value: currentState.phonenumber,
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
                value: currentState.name,
                placeholder: t('Jamie Larson'),
                label: t('Name'),
                name: 'name',
                required: true,
                tabIndex: 1,
                errorMessage: errors.name || ''
            });
        }

        fields[0].autoFocus = true;

        return fieldNames?.length
            ? fields.filter(f => fieldNames.includes(f.name))
            : fields;
    }

    function getFormErrors(state) {
        const checkboxRequired = site.portal_signup_checkbox_required && site.portal_signup_terms_html;
        return {
            ...ValidateInputForm({fields: getInputFields({state})}),
            checkbox: checkboxRequired && !state.termsCheckboxChecked
        };
    }

    function doSignup() {
        setFormState((prev) => {
            const errors = getFormErrors(prev);
            const hasErrors = Object.values(errors).some(Boolean);

            if (hasErrors) {
                const {checkbox: _, ...otherErrors} = errors;
                const hasOnlyCheckboxError = errors.checkbox && Object.values(otherErrors).every(e => !e);
                if (hasOnlyCheckboxError && termsRef.current) {
                    termsRef.current.scrollIntoView({behavior: 'smooth', block: 'center'});
                }
                return {...prev, errors};
            }

            const {name, email, plan, phonenumber, token} = prev;

            if (hasMultipleNewsletters({site})) {
                return {
                    ...prev,
                    showNewsletterSelection: true,
                    pageData: {name, email, plan, phonenumber, token},
                    errors: {}
                };
            }

            doAction('signup', {name, email, phonenumber, plan, token});
            return {...prev, errors: {}};
        });
    }

    const handleSignup = useCallback((e) => {
        e.preventDefault();
        doSignup();
    }, [formState]);

    const handleChooseSignup = useCallback((e, plan) => {
        e.preventDefault();
        setFormState(prev => ({...prev, plan}));
        // Use updated plan in doSignup via setTimeout to ensure state is set
        setTimeout(() => doSignup(), 0);
    }, [formState]);

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

    const handleKeyDown = useCallback((e) => {
        if (e.keyCode === 13) {
            handleSignup(e);
        }
    }, [handleSignup]);

    const hideNewsletterSelection = useCallback(() => {
        setFormState(prev => ({...prev, showNewsletterSelection: false}));
    }, []);

    return {
        formState,
        termsRef,
        getInputFields,
        handleSignup,
        handleChooseSignup,
        handleInputChange,
        handleSelectPlan,
        handleCheckboxChange,
        handleKeyDown,
        hideNewsletterSelection
    };
}

// ─── Section class helper ─────────────────────────────────────────────────────

function getSectionClass({site, pageQuery, fields}) {
    const plansData = getSitePrices({site, pageQuery});
    const isSingleOrNoPlans = plansData.length <= 1 || isInviteOnly({site});

    if (!isSingleOrNoPlans) {
        return '';
    }

    if (isInviteOnly({site})) {
        return 'invite-only';
    }

    const isSingleFreePlan = plansData.length === 1 && plansData[0].type === 'free';
    if (isSingleFreePlan || isInviteOnly({site, pageQuery})) {
        if (fields.length === 1) {
            return 'single-field';
        }
        return freeHasBenefitsOrDescription({site}) ? 'singleplan' : 'noplan';
    }

    return 'singleplan';
}

// ─── Main Form Content ────────────────────────────────────────────────────────

function SignupFormContent({context, formState, handlers}) {
    const {site, pageQuery, brandColor, doAction} = context;
    const {
        termsRef,
        getInputFields,
        handleSignup,
        handleChooseSignup,
        handleInputChange,
        handleSelectPlan,
        handleCheckboxChange,
        handleKeyDown,
        hideNewsletterSelection
    } = handlers;

    const loginMessage = (
        <LoginMessage
            brandColor={brandColor}
            onSignIn={() => doAction('switchPage', {page: 'signin'})}
            site={site}
            pageQuery={pageQuery}
        />
    );

    if (formState.showNewsletterSelection) {
        return (
            <NewsletterSelectionPage
                pageData={formState.pageData}
                onBack={hideNewsletterSelection}
            />
        );
    }

    if (isInviteOnly({site})) {
        return (
            <NotificationSection
                className="gh-portal-invite-only-notification"
                testId="invite-only-notification-text"
                message={t('This site is invite-only, contact the owner for access.')}
            >
                {loginMessage}
            </NotificationSection>
        );
    }

    if (isPaidMembersOnly({site}) && pageQuery === 'free') {
        return (
            <NotificationSection
                className="gh-portal-paid-members-only-notification"
                testId="paid-members-only-notification-text"
                message={t('This site only accepts paid members.')}
            >
                {loginMessage}
            </NotificationSection>
        );
    }

    if (!isSignupAllowed({site}) || !hasAvailablePrices({site, pageQuery})) {
        if (!isSigninAllowed({site})) {
            return (
                <NotificationSection
                    className="gh-portal-members-disabled-notification"
                    testId="members-disabled-notification-text"
                    message={t('Memberships unavailable, contact the owner for access.')}
                />
            );
        }
        return (
            <NotificationSection
                className="gh-portal-invite-only-notification"
                testId="invite-only-notification-text"
                message={t('This site is invite-only, contact the owner for access.')}
            >
                {loginMessage}
            </NotificationSection>
        );
    }

    const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
    const hasOnlyFree = hasOnlyFreePlan({site}) || showOnlyFree;
    const fields = getInputFields({state: formState});
    const errors = formState.errors || {};
    const priceErrors = Object.keys(errors).length > 0 && formState.plan
        ? {[formState.plan]: t('Please fill in required fields')}
        : {};

    const products = getSiteProducts({site, pageQuery});

    const productsSection = (
        <ProductsSection
            handleChooseSignup={handleChooseSignup}
            products={products}
            onPlanSelect={handleSelectPlan}
            errors={priceErrors}
        />
    );

    const signupTerms = (
        <SignupTerms
            site={site}
            termsCheckboxChecked={formState.termsCheckboxChecked}
            onCheckboxChange={handleCheckboxChange}
            hasError={!!errors.checkbox}
            termsRef={termsRef}
        />
    );

    const hasTerms = !!site.portal_signup_terms_html;

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
                        <>
                            {productsSection}
                            {hasTerms && (
                                <div className="gh-portal-signup-terms-wrapper free-only">
                                    {signupTerms}
                                </div>
                            )}
                            <div className="gh-portal-btn-container">
                                <div className="gh-portal-logged-out-form-container">
                                    <SubmitButton
                                        action={context.action}
                                        site={site}
                                        brandColor={brandColor}
                                        pageQuery={pageQuery}
                                        onSignup={handleSignup}
                                    />
                                    {loginMessage}
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            {hasTerms && (
                                <div className="gh-portal-signup-terms-wrapper">
                                    {signupTerms}
                                </div>
                            )}
                            {productsSection}
                            {loginMessage}
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function SignupPage() {
    const context = useContext(AppContext);
    const {site, pageQuery, member, doAction} = context;

    const hookHandlers = useSignupForm(context);
    const {formState, getInputFields, hideNewsletterSelection} = hookHandlers;

    useEffect(() => {
        if (member) {
            doAction('switchPage', {page: 'accountHome'});
        }
    }, [member, doAction]);

    const fields = getInputFields({state: formState});
    const sectionClass = getSectionClass({site, pageQuery, fields});

    const handleBack = () => {
        if (formState.showNewsletterSelection) {
            hideNewsletterSelection();
        } else {
            doAction('closePopup');
        }
    };

    return (
        <>
            <div className="gh-portal-back-sitetitle">
                <SiteTitleBackButton onBack={handleBack} />
            </div>
            <CloseButton />
            <div className={`gh-portal-content signup ${sectionClass}`}>
                <FormHeader site={site} pageQuery={pageQuery} />
                <SignupFormContent
                    context={context}
                    formState={formState}
                    handlers={hookHandlers}
                />
            </div>
        </>
    );
}

export default SignupPage;
export {SignupPageStyles};
```

## Summary of Changes

| Before | After |
|--------|-------|
| 400+ line class component | Focused functional component ~50 lines |
| 15+ class methods | Logic isolated in `useSignupForm` hook |
| Repeated notification JSX patterns | Single `NotificationSection` component |
| Nested ternaries in `renderForm` | Sequential early returns with clear intent |
| `this.setState` callbacks for side effects | `useEffect` + `useCallback` |
| `getClassNames()` mixed concerns | Pure `getSectionClass()` helper |
| Inline render methods on class | Standalone named components |