# Refactored OfferPage Component

## Key Refactoring Decisions

1. **Convert class component to functional component** - Eliminates verbose lifecycle boilerplate
2. **Extract sub-components** - Break large render methods into focused components
3. **Extract custom hooks** - Isolate form logic and offer calculations
4. **Simplify conditional rendering** - Replace verbose ternaries with cleaner patterns
5. **Extract price calculation utilities** - Move to pure functions

---

### `utils/offer-helpers.js` (extracted pure functions)

```javascript
import {getCurrencySymbol, isSameCurrency, formatNumber} from '../../utils/helpers';

export const roundPrice = (price) => {
    if (price % 1 === 0) return price;
    return Number(Math.round(price * 100) / 100).toFixed(2);
};

export const getPrice = (product, cadence) =>
    cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;

export const getOriginalPriceLabel = (offer, product) => {
    const price = getPrice(product, offer.cadence);
    return `${getCurrencySymbol(price.currency)}${roundPrice(price.amount / 100)}/${offer.cadence}`;
};

export const getUpdatedPrice = (offer, product) => {
    const price = getPrice(product, offer.cadence);
    const original = price.amount;

    if (offer.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
        return Math.max((original - offer.amount) / 100, 0);
    }
    if (offer.type === 'percent') {
        return (original - (original * offer.amount) / 100) / 100;
    }
    return original / 100;
};

export const getOffAmount = (offer) => {
    const formatters = {
        fixed: () => `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`,
        percent: () => `${offer.amount}%`,
        trial: () => offer.amount,
    };
    return formatters[offer.type]?.() ?? '';
};

export const getCurrencyClass = (currency) =>
    getCurrencySymbol(currency).length > 1 ? 'long' : '';
```

---

### `hooks/useOfferForm.js` (extracted form logic)

```javascript
import {useState, useContext} from 'react';
import AppContext from '../../app-context';
import {ValidateInputForm} from '../../utils/form';
import {getProductFromId, hasMultipleNewsletters} from '../../utils/helpers';
import {getPrice} from '../utils/offer-helpers';
import {t} from '../../utils/i18n';

export const useOfferForm = () => {
    const {member, site, pageData: offer, doAction} = useContext(AppContext);

    const [formState, setFormState] = useState({
        name: member?.name ?? '',
        email: member?.email ?? '',
        errors: {},
        showNewsletterSelection: false,
        pageData: null,
        termsCheckboxChecked: false,
    });

    const getInputFields = (state) => {
        const {portal_name: portalName} = site;
        const errors = state.errors ?? {};

        const emailField = {
            type: 'email',
            value: member?.email ?? state.email,
            placeholder: t('jamie@example.com'),
            label: t('Email'),
            name: 'email',
            disabled: !!member,
            required: true,
            tabIndex: 2,
            errorMessage: errors.email ?? '',
        };

        const showName = !!portalName && !(member && !member.name);
        if (!showName) {
            emailField.autoFocus = true;
            return [emailField];
        }

        const nameField = {
            type: 'text',
            value: member?.name ?? state.name,
            placeholder: t('Jamie Larson'),
            label: t('Name'),
            name: 'name',
            disabled: !!member,
            required: true,
            tabIndex: 1,
            autoFocus: true,
            errorMessage: errors.name ?? '',
        };

        return [nameField, emailField];
    };

    const getFormErrors = (state) => {
        const checkboxRequired =
            site.portal_signup_checkbox_required && site.portal_signup_terms_html;

        return {
            ...ValidateInputForm({fields: getInputFields(state)}),
            checkbox: checkboxRequired && !state.termsCheckboxChecked,
        };
    };

    const hasErrors = (errors) =>
        errors && Object.values(errors).some(Boolean);

    const handleInputChange = (e, field) => {
        setFormState(prev => ({...prev, [field.name]: e.target.value}));
    };

    const handleCheckboxChange = (e) => {
        setFormState(prev => ({...prev, termsCheckboxChecked: e.target.checked}));
    };

    const handleSignup = (e) => {
        e.preventDefault();
        if (!offer?.tier) return;

        const product = getProductFromId({site, productId: offer.tier.id});
        const price = getPrice(product, offer.cadence);

        const errors = getFormErrors(formState);
        setFormState(prev => ({...prev, errors}));

        if (hasErrors(errors)) return;

        const signupData = {
            name: formState.name,
            email: formState.email,
            plan: price?.id,
            offerId: offer?.id,
        };

        if (hasMultipleNewsletters({site})) {
            setFormState(prev => ({
                ...prev,
                showNewsletterSelection: true,
                pageData: signupData,
                errors: {},
            }));
        } else {
            doAction('signup', signupData);
            setFormState(prev => ({...prev, errors: {}}));
        }
    };

    return {
        formState,
        setFormState,
        getInputFields,
        handleInputChange,
        handleCheckboxChange,
        handleSignup,
    };
};
```

---

### Sub-components

```jsx
// components/offer/OfferTag.jsx
import React from 'react';
import {getCurrencySymbol} from '../../utils/helpers';
import {t} from '../../utils/i18n';

export const OfferTag = ({offer}) => {
    if (offer.amount <= 0) return null;

    const labels = {
        fixed: t('{amount} off', {amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`}),
        trial: t('{amount} days free', {amount: offer.amount}),
        percent: t('{amount} off', {amount: `${offer.amount}%`}),
    };

    const label = labels[offer.type];
    return label ? <h5 className="gh-portal-discount-label">{label}</h5> : null;
};
```

```jsx
// components/offer/OfferMessage.jsx
import React from 'react';
import {t} from '../../utils/i18n';
import {getOffAmount, getOriginalPriceLabel} from '../../utils/offer-helpers';

const DURATION_CONFIG = {
    once: {getLabel: (amounts) => amounts.firstPeriod, renews: true},
    forever: {getLabel: (amounts) => amounts.forever, renews: false},
    repeating: {
        getLabel: (amounts, offer) =>
            offer.duration_in_months === 1 ? amounts.firstPeriod : amounts.firstNMonths,
        renews: true,
    },
};

export const OfferMessage = ({offer, product}) => {
    const offAmount = getOffAmount(offer);
    const originalPrice = getOriginalPriceLabel(offer, product);

    if (offer.duration === 'trial') {
        return (
            <p className="footnote">
                {t('Try free for {amount} days, then {originalPrice}.', {
                    amount: offer.amount,
                    originalPrice,
                    interpolation: {escapeValue: false},
                })}
                {' '}
                <span className="gh-portal-cancel">{t('Cancel anytime.')}</span>
            </p>
        );
    }

    const offerMessages = {
        forever: t('{amount} off forever.', {amount: offAmount}),
        firstPeriod: t('{amount} off for first {period}.', {amount: offAmount, period: offer.cadence}),
        firstNMonths: t('{amount} off for first {number} months.', {
            amount: offAmount,
            number: offer.duration_in_months ?? '',
        }),
    };

    const config = DURATION_CONFIG[offer.duration];
    if (!config) return null;

    const offerLabel = config.getLabel(offerMessages, offer);
    const renewsLabel = config.renews
        ? t('Renews at {price}.', {price: originalPrice, interpolation: {escapeValue: false}})
        : '';

    return <p className="footnote">{offerLabel} {renewsLabel}</p>;
};
```

```jsx
// components/offer/ProductBenefits.jsx
import React from 'react';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';

export const ProductBenefits = ({benefits = []}) => {
    if (!benefits.length) return null;

    return (
        <div className="gh-portal-product-benefits">
            {benefits.map((benefit, idx) => (
                <div className="gh-portal-product-benefit" key={`${benefit.name}-${idx}`}>
                    <CheckmarkIcon className="gh-portal-benefit-checkmark" />
                    <div className="gh-portal-benefit-title">{benefit.name}</div>
                </div>
            ))}
        </div>
    );
};
```

```jsx
// components/offer/TierPrice.jsx
import React from 'react';
import {getCurrencySymbol, formatNumber} from '../../utils/helpers';
import {roundPrice, getCurrencyClass} from '../../utils/offer-helpers';

export const OldTierPrice = ({offer, price}) => {
    if (offer.type === 'trial') return null;
    return (
        <div className="gh-portal-offer-oldprice">
            {getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}
        </div>
    );
};

export const UpdatedTierPrice = ({offer, price, updatedPrice}) => {
    const currencyClass = getCurrencyClass(price.currency);
    const containerClass = offer.type === 'trial'
        ? 'gh-portal-product-card-pricecontainer offer-type-trial'
        : 'gh-portal-product-card-pricecontainer';

    return (
        <div className={containerClass}>
            <div className="gh-portal-product-price">
                <span className={`currency-sign ${currencyClass}`}>
                    {getCurrencySymbol(price.currency)}
                </span>
                <span className="amount">{formatNumber(roundPrice(updatedPrice))}</span>
            </div>
        </div>
    );
};
```

```jsx
// components/offer/SignupTerms.jsx
import React from 'react';
import {sanitizeHtml} from '../../utils/sanitize-html';
import {interceptAnchorClicks} from '../../utils/links';

export const SignupTerms = ({site, termsCheckboxChecked, onCheckboxChange, hasError}) => {
    if (!site.portal_signup_terms_html) return null;

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
        >
            {termsBody}
        </div>
    );
};
```

---

### Refactored Main Component

```jsx
// components/offer/offer-page.jsx
import React, {useContext} from 'react';
import AppContext from '../../app-context';
import ActionButton from '../common/action-button';
import CloseButton from '../common/close-button';
import InputForm from '../common/input-form';
import NewsletterSelectionPage from './newsletter-selection-page';
import {getProductFromId, hasMultipleProductsFeature} from '../../utils/helpers';
import {getPrice, getUpdatedPrice} from '../../utils/offer-helpers';
import {useOfferForm} from '../../hooks/useOfferForm';
import {OfferTag} from './OfferTag';
import {OfferMessage} from './OfferMessage';
import {ProductBenefits} from './ProductBenefits';
import {OldTierPrice, UpdatedTierPrice} from './TierPrice';
import {SignupTerms} from './SignupTerms';
import {t} from '../../utils/i18n';

export {OfferPageStyles} from './offer-page-styles';

// --- Small inline sub-components ---

const SiteLogo = ({site}) => {
    if (!site.icon) return null;
    return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
};

const FormHeader = ({site}) => (
    <header className="gh-portal-signup-header">
        <SiteLogo site={site} />
        <h2 className="gh-portal-main-title">{site.title ?? ''}</h2>
    </header>
);

const LoginMessage = ({member, brandColor, doAction}) => {
    if (member) return null;
    return (
        <div className="gh-portal-signup-message">
            <div>{t('Already a member?')}</div>
            <button
                className="gh-portal-btn gh-portal-btn-link"
                style={{color: brandColor}}
                onClick={() => doAction('switchPage', {page: 'signin'})}
            >
                <span>{t('Sign in')}</span>
            </button>
        </div>
    );
};

const SubmitButton = ({action, brandColor, offer, onSignup}) => {
    const isRunning = action === 'signup:running';
    const isFailed = action === 'signup:failed';

    const label = (() => {
        if (isRunning) return t('Sending...');
        if (isFailed) return t('Retry');
        if (offer.type === 'trial') return t('Start {amount}-day free trial', {amount: offer.amount});
        return t('Continue');
    })();

    return (
        <ActionButton
            style={{width: '100%'}}
            retry={isFailed}
            onClick={onSignup}
            disabled={isRunning}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
            tabIndex={3}
            classes="sticky bottom"
        />
    );
};

const ProductLabel = ({product, offer, site}) => {
    const cadenceLabel = offer.cadence === 'month' ? t('Monthly') : t('Yearly');
    const name = hasMultipleProductsFeature({site})
        ? `${product.name} - ${cadenceLabel}`
        : cadenceLabel;
    return <h4 className="gh-portal-plan-name">{name}</h4>;
};

const ProductCard = ({product, offer, price, updatedPrice, site, formState, onSignup, onCheckboxChange}) => {
    const benefits = product.benefits ?? [];

    return (
        <>
            <div className="gh-portal-product-card top">
                <div className="gh-portal-product-card-header">
                    <ProductLabel product={product} offer={offer} site={site} />
                    <OldTierPrice offer={offer} price={price} />
                    <UpdatedTierPrice offer={offer} price={price} updatedPrice={updatedPrice} />
                    <OfferMessage offer={offer} product={product} />
                </div>
            </div>

            <div>
                <div className="gh-portal-product-card bottom">
                    <div className="gh-portal-product-card-detaildata">
                        {product.description && (
                            <div className="gh-portal-product-description">{product.description}</div>
                        )}
                        <ProductBenefits benefits={benefits} />
                    </div>
                </div>

                <div className="gh-portal-btn-container sticky m32">
                    <div className="gh-portal-signup-terms-wrapper">
                        <SignupTerms
                            site={site}
                            termsCheckboxChecked={formState.termsCheckboxChecked}
                            onCheckboxChange={onCheckboxChange}
                            hasError={!!formState.errors?.checkbox}
                        />
                    </div>
                    <SubmitButton offer={offer} onSignup={onSignup} />
                </div>
            </div>
        </>
    );
};

// --- Main Component ---

const OfferPage = () => {
    const context = useContext(AppContext);
    const {pageData: offer, site, member, brandColor, doAction, action} = context;

    const {formState, setFormState, getInputFields, handleInputChange, handleCheckboxChange, handleSignup} =
        useOfferForm();

    if (!offer?.tier) return null;

    const product = getProductFromId({site, productId: offer.tier.id});
    if (!product) return null;

    const price = getPrice(product, offer.cadence);
    const updatedPrice = getUpdatedPrice(offer, product);

    if (formState.showNewsletterSelection) {
        return (
            <NewsletterSelectionPage
                pageData={formState.pageData}
                onBack={() => setFormState(prev => ({...prev, showNewsletterSelection: false}))}
            />
        );
    }

    const fields = getInputFields(formState);

    return (
        <div className="gh-portal-content gh-portal-offer">
            <CloseButton />
            <FormHeader site={site} />

            <div className="gh-portal-offer-bar">
                <div className="gh-portal-offer-title">
                    <h4 className={offer.display_title ? '' : 'placeholder'}>
                        {offer.display_title || t('Black Friday')}
                    </h4>
                    <OfferTag offer={offer} />
                </div>
                {offer.display_description && <p>{offer.display_description}</p>}
            </div>

            <section>
                <div className="gh-portal-section">
                    <InputForm
                        fields={fields}
                        onChange={handleInputChange}
                        onKeyDown={(e) => e.keyCode === 13 && handleSignup(e)}
                    />
                </div>
            </section>

            <ProductCard
                product={product}
                offer={offer}
                price={price}
                updatedPrice={updatedPrice}
                site={site}
                formState={formState}
                onSignup={handleSignup}
                onCheckboxChange={handleCheckboxChange}
            />

            <LoginMessage member={member} brandColor={brandColor} doAction={doAction} />
        </div>
    );
};

export default OfferPage;
```

---

## Summary of Changes

| Before | After |
|--------|-------|
| Single 400+ line class component | Main component ~80 lines |
| 15+ render methods on class | 8 focused sub-components |
| Mixed concerns (form logic + UI) | `useOfferForm` hook isolates form state |
| Price calculations inline | Pure functions in `offer-helpers.js` |
| Verbose `action === 'x' ? true : false` | Direct boolean expressions |
| Nested ternaries for labels | Lookup objects / IIFE label resolution |
| `renderXxx()` pattern | Declarative JSX composition |
| Repeated `offer.cadence === 'month'` checks | `getPrice()` utility |