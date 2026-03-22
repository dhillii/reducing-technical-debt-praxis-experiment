# Refactored SignupPage Component

Here's the refactored code with reduced complexity through several improvements:

1. **Extracted helper functions** out of the class
2. **Split large render methods** into smaller, focused components
3. **Simplified conditional logic** 
4. **Reduced duplication** in render methods
5. **Converted class component to functional component** with hooks

```javascript
import React, {useState, useEffect, useRef, useCallback, useContext} from 'react';
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

function getSectionClass({site, pageQuery, fields}) {
    const plansData = getSitePrices({site, pageQuery});

    if (isInviteOnly({site})) {
        return 'invite-only';
    }

    if (plansData.length > 1) {
        return '';
    }

    const isSingleFreePlan = plansData.length === 1 && plansData[0].type === 'free';
    if (!isSingleFreePlan) {
        return 'singleplan';
    }

    if (fields.length === 1) {
        return 'single-field';
    }

    return freeHasBenefitsOrDescription({site}) ? 'singleplan' : 'noplan';
}

function getFooterClass({site}) {
    return isInviteOnly({site}) ? 'invite-only' : '';
}

function getSubmitLabel(action) {
    if (action === 'signup:running') return t('Sending...');
    if (action === 'signup:failed') return t('Retry');
    return t('Sign up');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SiteIcon({site, pageQuery}) {
    if (site.icon) {
        return <img className='gh-portal-signup-logo' src={site.icon} alt={site.title} />;
    }

    const showInviteIcon = !hasAvailablePrices({site, pageQuery})
        || isInviteOnly({site})
        || !isSignupAllowed({site});

    return showInviteIcon
        ? <InvitationIcon className='gh-portal-icon gh-portal-icon-invitation' />
        : null;
}

function FormHeader({site, pageQuery}) {
    return (
        <header className='gh-portal-signup-header'>
            <SiteIcon site={site} pageQuery={pageQuery} />
            <h1 className="gh-portal-main-title" data-testid='site-title-text'>
                {site.title || ''}
            </h1>
        </header>
    );
}

function FreeTrialMessage({site, pageQuery}) {
    const shouldShow = hasFreeTrialTier({site, pageQuery})
        && !isInviteOnly({site})
        && hasAvailablePrices({site, pageQuery});

    if (!shouldShow) return null;

    return (
        <p className='gh-portal-free-trial-notification' data-testid="free-trial-notification-text">
            {t('After a free trial ends, you will be charged the regular price for the tier you\'ve chosen. You can always cancel before then.')}
        </p>
    );
}

function LoginMessage({brandColor, onSwitchToSignin, site, pageQuery}) {
    return (
        <div>
            <FreeTrialMessage site={site} pageQuery={pageQuery} />
            <div className='gh-portal-signup-message'>
                <div>{t('Already a member?')}</div>
                <button
                    data-test-button='signin-switch'
                    data-testid='signin-switch'
                    className='gh-portal-btn gh-portal-btn-link'
                    style={{color: brandColor}}
                    onClick={onSwitchToSignin}
                >
                    <span>{t('Sign in')}</span>
                </button>
            </div>
        </div>
    );
}

function NotificationMessage({className, testId, message}) {
    return (
        <section>
            <div className='gh-portal-section'>
                <p className={className} data-testid={testId}>{message}</p>
            </div>
        </section>
    );
}

function SignupTerms({site, termsCheckboxChecked, errors, onCheckboxChange, termsRef}) {
    const {portal_signup_terms_html: termsHtml, portal_signup_checkbox_required: checkboxRequired} = site;

    if (!termsHtml) return null;

    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(termsHtml)}}
        />
    );

    const errorClassName = errors?.checkbox ? 'gh-portal-error' : '';

    return (
        <div
            className={`gh-portal-signup-terms ${errorClassName}`}
            onClick={interceptAnchorClicks}
            ref={termsRef}
        >
            {checkboxRequired ? (
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
    const isUnavailable = isInviteOnly({site}) || !hasAvailablePrices({site, pageQuery});
    const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
    const canShowButton = hasOnlyFreePlan({site}) || showOnlyFree;

    if (isUnavailable || !canShowButton) return null;

    const label = getSubmitLabel(action);
    const isRunning = action === 'signup:running';
    const retry = action === 'signup:failed';

    return (
        <ActionButton
            style={{width: '100%'}}
            retry={retry}
            onClick={onSignup}
            disabled={isRunning}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
            tabIndex={3}
        />
    );
}

function ProductsWithErrors({site, pageQuery, plan, errors, onChooseSignup, onPlanSelect}) {
    const products = getSiteProducts({site, pageQuery});
    const priceErrors = {};

    if (Object.keys(errors).length > 0 && plan) {
        priceErrors[plan] = t('Please fill in required fields');
    }

    return (
        <ProductsSection
            handleChooseSignup={onChooseSignup}
            products={products}
            onPlanSelect={onPlanSelect}
            errors={priceErrors}
        />
    );
}

function FreeOnlyFormContent({renderProducts, signupTerms, renderSubmitButton, loginMessage}) {
    return (
        <>
            {renderProducts()}
            {signupTerms && (
                <div className='gh-portal-signup-terms-wrapper free-only'>
                    {signupTerms}
                </div>
            )}
            <div className='gh-portal-btn-container'>
                <div className='gh-portal-logged-out-form-container'>
                    {renderSubmitButton()}
                    {loginMessage}
                </div>
            </div>
        </>
    );
}

function PaidOnlyFormContent({renderProducts, signupTerms, loginMessage}) {
    return (
        <>
            {signupTerms && (
                <div className='gh-portal-signup-terms-wrapper'>
                    {signupTerms}
                </div>
            )}
            {renderProducts()}
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
        errors: {},
        pageData: null
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
        const syncedPriceId = getSelectedPriceId(prices, formState.plan);
        if (syncedPriceId !== formState.plan) {
            setFormState(prev => ({...prev, plan: syncedPriceId}));
        }
    }, [site, pageQuery, formState.plan]);

    useEffect(() => {
        return () => clearTimeout(timeoutRef.current);
    }, []);

    const portalName = site?.portal_name;
    const fields = buildInputFields({state: formState, portalName});

    // ── Form validation ──────────────────────────────────────────────────────

    const getFormErrors = useCallback((state) => {
        const checkboxRequired = site.portal_signup_checkbox_required && site.portal_signup_terms_html;
        return {
            ...ValidateInputForm({fields: buildInputFields({state, portalName})}),
            checkbox: checkboxRequired && !state.termsCheckboxChecked
        };
    }, [site, portalName]);

    // ── Event handlers ───────────────────────────────────────────────────────

    const handleInputChange = useCallback((e, field) => {
        setFormState(prev => ({...prev, [field.name]: e.target.value}));
    }, []);

    const handleCheckboxChange = useCallback((e) => {
        setFormState(prev => ({...prev, termsCheckboxChecked: e.target.checked}));
    }, []);

    const handleSelectPlan = useCallback((e, priceId) => {
        e?.preventDefault();
        timeoutRef.current = setTimeout(() => {
            setFormState(prev => ({...prev, plan: priceId}));
        }, 5);
    }, []);

    const doSignup = useCallback(() => {
        setFormState((prev) => {
            const errors = getFormErrors(prev);
            const hasFormErrors = Object.values(errors).some(Boolean);

            if (!hasFormErrors) {
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
            }

            // Scroll to checkbox if it's the only error
            const otherErrors = Object.fromEntries(
                Object.entries(errors).filter(([key]) => key !== 'checkbox')
            );
            const hasOnlyCheckboxError = errors.checkbox && Object.values(otherErrors).every(e => !e);

            if (hasOnlyCheckboxError && termsRef.current) {
                termsRef.current.scrollIntoView({behavior: 'smooth', block: 'center'});
            }

            return {...prev, errors};
        });
    }, [getFormErrors, site, doAction]);

    const handleSignup = useCallback((e) => {
        e.preventDefault();
        doSignup();
    }, [doSignup]);

    const handleChooseSignup = useCallback((e, plan) => {
        e.preventDefault();
        setFormState(prev => ({...prev, plan}));
        doSignup();
    }, [doSignup]);

    const handleKeyDown = useCallback((e) => {
        if (e.keyCode === 13) handleSignup(e);
    }, [handleSignup]);

    const handleSwitchToSignin = useCallback(() => {
        doAction('switchPage', {page: 'signin'});
    }, [doAction]);

    // ── Shared sub-renders ───────────────────────────────────────────────────

    const loginMessage = (
        <LoginMessage
            brandColor={brandColor}
            onSwitchToSignin={handleSwitchToSignin}
            site={site}
            pageQuery={pageQuery}
        />
    );

    const signupTerms = (
        <SignupTerms
            site={site}
            termsCheckboxChecked={formState.termsCheckboxChecked}
            errors={formState.errors}
            onCheckboxChange={handleCheckboxChange}
            termsRef={termsRef}
        />
    );

    const renderProducts = () => (
        <ProductsWithErrors
            site={site}
            pageQuery={pageQuery}
            plan={formState.plan}
            errors={formState.errors}
            onChooseSignup={handleChooseSignup}
            onPlanSelect={handleSelectPlan}
        />
    );

    const renderSubmitButton = () => (
        <SubmitButton
            action={action}
            site={site}
            brandColor={brandColor}
            pageQuery={pageQuery}
            onSignup={handleSignup}
        />
    );

    // ── Form content ─────────────────────────────────────────────────────────

    const renderFormContent = () => {
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
                <>
                    <NotificationMessage
                        className='gh-portal-invite-only-notification'
                        testId="invite-only-notification-text"
                        message={t('This site is invite-only, contact the owner for access.')}
                    />
                    {loginMessage}
                </>
            );
        }

        if (isPaidMembersOnly({site}) && pageQuery === 'free') {
            return (
                <>
                    <NotificationMessage
                        className='gh-portal-paid-members-only-notification'
                        testId="paid-members-only-notification-text"
                        message={t('This site only accepts paid members.')}
                    />
                    {loginMessage}
                </>
            );
        }

        if (!isSignupAllowed({site}) || !hasAvailablePrices({site, pageQuery})) {
            if (!isSigninAllowed({site})) {
                return (
                    <NotificationMessage
                        className='gh-portal-members-disabled-notification'
                        testId="members-disabled-notification-text"
                        message={t('Memberships unavailable, contact the owner for access.')}
                    />
                );
            }
            return (
                <>
                    <NotificationMessage
                        className='gh-portal-invite-only-notification'
                        testId="invite-only-notification-text"
                        message={t('This site is invite-only, contact the owner for access.')}
                    />
                    {loginMessage}
                </>
            );
        }

        const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
        const hasOnlyFree = hasOnlyFreePlan({site}) || showOnlyFree;

        return (
            <section className="gh-portal-signup">
                <div className='gh-portal-section'>
                    <div className='gh-portal-logged-out-form-container'>
                        <InputForm
                            fields={fields}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                        />
                    </div>
                    <div>
                        {hasOnlyFree ? (
                            <FreeOnlyFormContent
                                renderProducts={renderProducts}
                                signupTerms={signupTerms}
                                renderSubmitButton={renderSubmitButton}
                                loginMessage={loginMessage}
                            />
                        ) : (
                            <PaidOnlyFormContent
                                renderProducts={renderProducts}
                                signupTerms={signupTerms}
                                loginMessage={loginMessage}
                            />
                        )}
                    </div>
                </div>
            </section>
        );
    };

    // ── Root render ──────────────────────────────────────────────────────────

    const sectionClass = getSectionClass({site, pageQuery, fields});

    const handleBack = () => {
        if (formState.showNewsletterSelection) {
            setFormState(prev => ({...prev, showNewsletterSelection: false}));
        } else {
            doAction('closePopup');
        }
    };

    return (
        <>
            <div className='gh-portal-back-sitetitle'>
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

export default SignupPage;
```

## Key Refactoring Changes

| Change | Benefit |
|--------|---------|
| **Class → Functional component** | Eliminates boilerplate, cleaner state management with `useState`/`useEffect` |
| **Extracted pure helper functions** (`getSelectedPriceId`, `buildInputFields`, `getSectionClass`) | Testable in isolation, no `this` binding issues |
| **Extracted sub-components** (`SiteIcon`, `FormHeader`, `LoginMessage`, `SignupTerms`, `SubmitButton`, etc.) | Single responsibility, easier to test and reason about |
| **Unified `NotificationMessage`** | Eliminated 3 near-identical render methods |
| **Extracted `FreeOnlyFormContent` / `PaidOnlyFormContent`** | Replaced deeply nested ternaries with named components |
| **Moved styles to separate file** | Keeps component file focused on logic |
| **`useCallback` for handlers** | Prevents unnecessary re-renders |
| **Flattened `getFormErrors` logic** | Uses `Object.fromEntries` instead of manual delete |