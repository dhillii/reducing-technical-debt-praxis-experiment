# Refactored OfferPage Component

Here's the refactored version with reduced complexity, better separation of concerns, and improved readability:

## Helper Functions (extracted to separate file: `offer-page-helpers.js`)

```javascript
// offer-page-helpers.js
import {getCurrencySymbol, isSameCurrency, formatNumber} from '../../utils/helpers';
import {t} from '../../utils/i18n';

export const getPrice = (product, cadence) =>
    cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;

export const getCurrencyClass = (currency) =>
    getCurrencySymbol(currency).length > 1 ? 'long' : '';

export const roundPrice = (price) => {
    if (price % 1 === 0) return price;
    return Number(Math.round(price * 100) / 100).toFixed(2);
};

export const getUpdatedPrice = ({offer, product}) => {
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

export const getOriginalPrice = ({offer, product}) => {
    const price = getPrice(product, offer.cadence);
    return `${getCurrencySymbol(price.currency)}${roundPrice(price.amount / 100)}/${offer.cadence}`;
};

export const getOffAmount = ({offer}) => {
    const typeMap = {
        fixed: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`,
        percent: `${offer.amount}%`,
        trial: offer.amount
    };
    return typeMap[offer.type] ?? '';
};

export const getOfferLabel = (offer, offerMessages) => {
    const {duration, duration_in_months: months} = offer;
    const labelMap = {
        once: {label: offerMessages.firstPeriod, renews: true},
        forever: {label: offerMessages.forever, renews: false},
        repeating: {
            label: months === 1 ? offerMessages.firstPeriod : offerMessages.firstNMonths,
            renews: true
        }
    };
    return labelMap[duration] ?? {label: '', renews: false};
};

export const getSubmitLabel = (action, offer) => {
    if (action === 'signup:running') return t('Sending...');
    if (action === 'signup:failed') return t('Retry');
    if (offer.type === 'trial') return t('Start {amount}-day free trial', {amount: offer.amount});
    return t('Continue');
};
```

## Sub-components (extracted to `offer-page-components.jsx`)

```jsx
// offer-page-components.jsx
import React from 'react';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import ActionButton from '../common/action-button';
import {getCurrencySymbol, formatNumber} from '../../utils/helpers';
import {interceptAnchorClicks} from '../../utils/links';
import {sanitizeHtml} from '../../utils/sanitize-html';
import {t} from '../../utils/i18n';
import {roundPrice, getCurrencyClass} from './offer-page-helpers';

export const SiteLogo = ({icon, title}) => {
    if (!icon) return null;
    return <img className="gh-portal-signup-logo" src={icon} alt={title} />;
};

export const FormHeader = ({site}) => (
    <header className="gh-portal-signup-header">
        <SiteLogo icon={site.icon} title={site.title} />
        <h2 className="gh-portal-main-title">{site.title || ''}</h2>
    </header>
);

export const LoginMessage = ({brandColor, onSignIn}) => (
    <div className="gh-portal-signup-message">
        <div>{t('Already a member?')}</div>
        <button
            className="gh-portal-btn gh-portal-btn-link"
            style={{color: brandColor}}
            onClick={onSignIn}
        >
            <span>{t('Sign in')}</span>
        </button>
    </div>
);

export const OfferTag = ({offer}) => {
    if (offer.amount <= 0) return null;

    const tagMap = {
        fixed: t('{amount} off', {amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`}),
        trial: t('{amount} days free', {amount: offer.amount}),
        percent: t('{amount} off', {amount: `${offer.amount}%`})
    };

    const label = tagMap[offer.type];
    return label ? <h5 className="gh-portal-discount-label">{label}</h5> : null;
};

export const Benefits = ({benefits = []}) => {
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

export const OldTierPrice = ({offer, price}) => {
    if (offer.type === 'trial') return null;
    return (
        <div className="gh-portal-offer-oldprice">
            {getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}
        </div>
    );
};

export const UpdatedTierPrice = ({offer, price, updatedPrice}) => {
    const containerClass = offer.type === 'trial'
        ? 'gh-portal-product-card-pricecontainer offer-type-trial'
        : 'gh-portal-product-card-pricecontainer';

    const currencyClass = getCurrencyClass(price.currency);

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

export const OfferMessage = ({offer, product, getOriginalPriceFn, getOffAmountFn}) => {
    const originalPrice = getOriginalPriceFn({offer, product});
    const offAmount = getOffAmountFn({offer});
    const renewsLabel = t('Renews at {price}.', {price: originalPrice, interpolation: {escapeValue: false}});

    if (offer.duration === 'trial') {
        return (
            <p className="footnote">
                {t('Try free for {amount} days, then {originalPrice}.', {
                    amount: offer.amount,
                    originalPrice,
                    interpolation: {escapeValue: false}
                })}
                {' '}<span className="gh-portal-cancel">{t('Cancel anytime.')}</span>
            </p>
        );
    }

    const messages = {
        firstPeriod: t('{amount} off for first {period}.', {amount: offAmount, period: offer.cadence}),
        forever: t('{amount} off forever.', {amount: offAmount}),
        firstNMonths: t('{amount} off for first {number} months.', {
            amount: offAmount,
            number: offer.duration_in_months || ''
        })
    };

    const durationLabelMap = {
        once: {label: messages.firstPeriod, renews: true},
        forever: {label: messages.forever, renews: false},
        repeating: {
            label: offer.duration_in_months === 1 ? messages.firstPeriod : messages.firstNMonths,
            renews: true
        }
    };

    const {label = '', renews = false} = durationLabelMap[offer.duration] ?? {};

    return <p className="footnote">{label} {renews ? renewsLabel : ''}</p>;
};

export const SignupTerms = ({site, termsCheckboxChecked, errors, onCheckboxChange}) => {
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

    const className = `gh-portal-signup-terms${errors?.checkbox ? ' gh-portal-error' : ''}`;

    return (
        <div className={className} onClick={interceptAnchorClicks}>
            {termsBody}
        </div>
    );
};

export const SubmitButton = ({action, offer, brandColor, onSubmit}) => {
    const isRunning = action === 'signup:running';
    const isRetry = action === 'signup:failed';
    const label = getSubmitLabel(action, offer);

    return (
        <ActionButton
            style={{width: '100%'}}
            retry={isRetry}
            onClick={onSubmit}
            disabled={isRunning}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
            tabIndex={3}
            classes="sticky bottom"
        />
    );
};
```

## Refactored Main Component

```jsx
// offer-page.jsx
import React from 'react';
import AppContext from '../../app-context';
import CloseButton from '../common/close-button';
import InputForm from '../common/input-form';
import NewsletterSelectionPage from './newsletter-selection-page';
import {getProductFromId, hasMultipleProductsFeature, hasMultipleNewsletters} from '../../utils/helpers';
import {ValidateInputForm} from '../../utils/form';
import {t} from '../../utils/i18n';
import {
    getPrice,
    getUpdatedPrice,
    getOriginalPrice,
    getOffAmount
} from './offer-page-helpers';
import {
    FormHeader,
    LoginMessage,
    OfferTag,
    Benefits,
    OldTierPrice,
    UpdatedTierPrice,
    OfferMessage,
    SignupTerms,
    SubmitButton
} from './offer-page-components';

export {OfferPageStyles} from './offer-page-styles';

export default class OfferPage extends React.Component {
    static contextType = AppContext;

    constructor(props, context) {
        super(props, context);
        this.state = {
            name: context?.member?.name || '',
            email: context?.member?.email || '',
            plan: 'free',
            showNewsletterSelection: false,
            termsCheckboxChecked: false,
            errors: {}
        };
        this.handleSignup = this.handleSignup.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    // ─── Form Validation ────────────────────────────────────────────────────────

    getFormErrors(state) {
        const {site} = this.context;
        const checkboxRequired = site.portal_signup_checkbox_required && site.portal_signup_terms_html;
        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxRequired && !state.termsCheckboxChecked
        };
    }

    getInputFields({state, fieldNames} = {}) {
        const {site, member} = this.context;
        const errors = state?.errors || {};
        const showName = !!site.portal_name && !(member && !member.name);

        const emailField = {
            type: 'email',
            value: member?.email || state?.email,
            placeholder: t('jamie@example.com'),
            label: t('Email'),
            name: 'email',
            disabled: !!member,
            required: true,
            tabIndex: 2,
            errorMessage: errors.email || ''
        };

        const nameField = {
            type: 'text',
            value: member?.name || state?.name,
            placeholder: t('Jamie Larson'),
            label: t('Name'),
            name: 'name',
            disabled: !!member,
            required: true,
            tabIndex: 1,
            errorMessage: errors.name || ''
        };

        const fields = showName ? [nameField, emailField] : [emailField];
        fields[0].autoFocus = true;

        return fieldNames?.length
            ? fields.filter(f => fieldNames.includes(f.name))
            : fields;
    }

    // ─── Event Handlers ──────────────────────────────────────────────────────────

    onKeyDown(e) {
        if (e.keyCode === 13) this.handleSignup(e);
    }

    handleInputChange(e, field) {
        this.setState({[field.name]: e.target.value});
    }

    handleSignup(e) {
        e.preventDefault();
        const {pageData: offer, site} = this.context;
        if (!offer?.tier) return;

        this.setState(
            state => ({errors: this.getFormErrors(state)}),
            () => this.submitIfValid()
        );
    }

    submitIfValid() {
        const {doAction, pageData: offer, site} = this.context;
        const {name, email, phonenumber, errors} = this.state;
        const hasErrors = errors && Object.values(errors).some(Boolean);
        if (hasErrors) return;

        const product = getProductFromId({site, productId: offer.tier.id});
        const price = getPrice(product, offer.cadence);
        const signupData = {name, email, plan: price?.id, offerId: offer?.id, phonenumber};

        if (hasMultipleNewsletters({site})) {
            this.setState({showNewsletterSelection: true, pageData: signupData, errors: {}});
        } else {
            doAction('signup', signupData);
            this.setState({errors: {}});
        }
    }

    // ─── Render Helpers ──────────────────────────────────────────────────────────

    renderProductLabel({product, offer}) {
        const {site} = this.context;
        const cadenceLabel = offer.cadence === 'month' ? t('Monthly') : t('Yearly');

        return hasMultipleProductsFeature({site})
            ? <h4 className="gh-portal-plan-name">{product.name} - {cadenceLabel}</h4>
            : <h4 className="gh-portal-plan-name">{cadenceLabel}</h4>;
    }

    renderForm() {
        const {showNewsletterSelection, pageData} = this.state;

        if (showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={pageData}
                    onBack={() => this.setState({showNewsletterSelection: false})}
                />
            );
        }

        return (
            <section>
                <div className="gh-portal-section">
                    <InputForm
                        fields={this.getInputFields({state: this.state})}
                        onChange={this.handleInputChange}
                        onKeyDown={this.onKeyDown}
                    />
                </div>
            </section>
        );
    }

    renderProductCard({product, offer, updatedPrice, price}) {
        if (this.state.showNewsletterSelection) return null;

        const {action, brandColor, member, doAction, site} = this.context;
        const benefits = product.benefits || [];

        return (
            <>
                <div className="gh-portal-product-card top">
                    <div className="gh-portal-product-card-header">
                        <h4 className="gh-portal-product-name">
                            {product.name} - {offer.cadence === 'month' ? t('Monthly') : t('Yearly')}
                        </h4>
                        <OldTierPrice offer={offer} price={price} />
                        <UpdatedTierPrice offer={offer} price={price} updatedPrice={updatedPrice} />
                        <OfferMessage
                            offer={offer}
                            product={product}
                            getOriginalPriceFn={getOriginalPrice}
                            getOffAmountFn={getOffAmount}
                        />
                    </div>
                </div>

                <div>
                    <div className="gh-portal-product-card bottom">
                        <div className="gh-portal-product-card-detaildata">
                            {product.description && (
                                <div className="gh-portal-product-description">{product.description}</div>
                            )}
                            <Benefits benefits={benefits} />
                        </div>
                    </div>

                    <div className="gh-portal-btn-container sticky m32">
                        <div className="gh-portal-signup-terms-wrapper">
                            <SignupTerms
                                site={site}
                                termsCheckboxChecked={this.state.termsCheckboxChecked}
                                errors={this.state.errors}
                                onCheckboxChange={e => this.setState({termsCheckboxChecked: e.target.checked})}
                            />
                        </div>
                        <SubmitButton
                            action={action}
                            offer={offer}
                            brandColor={brandColor}
                            onSubmit={this.handleSignup}
                        />
                    </div>

                    {!member && (
                        <LoginMessage
                            brandColor={brandColor}
                            onSignIn={() => doAction('switchPage', {page: 'signin'})}
                        />
                    )}
                </div>
            </>
        );
    }

    render() {
        const {pageData: offer, site} = this.context;
        if (!offer?.tier) return null;

        const product = getProductFromId({site, productId: offer.tier.id});
        if (!product) return null;

        const price = getPrice(product, offer.cadence);
        const updatedPrice = getUpdatedPrice({offer, product});

        return (
            <div className="gh-portal-content gh-portal-offer">
                <CloseButton />
                <FormHeader site={site} />

                <div className="gh-portal-offer-bar">
                    <div className="gh-portal-offer-title">
                        {offer.display_title
                            ? <h4>{offer.display_title}</h4>
                            : <h4 className="placeholder">{t('Black Friday')}</h4>
                        }
                        <OfferTag offer={offer} />
                    </div>
                    {offer.display_description && <p>{offer.display_description}</p>}
                </div>

                {this.renderForm()}
                {this.renderProductCard({product, offer, updatedPrice, price})}
            </div>
        );
    }
}
```

## Key Improvements

| Area | Before | After |
|------|--------|-------|
| **Component size** | ~450 lines in one class | Split into focused modules |
| **Render methods** | 15+ methods in one class | Extracted to pure functional components |
| **Conditional logic** | Nested if/else chains | Lookup maps (`typeMap`, `durationLabelMap`) |
| **Price calculations** | Mixed with render logic | Pure helper functions |
| **State initialization** | Incomplete (no `errors`) | Explicit with all fields |
| **Event binding** | Arrow functions in JSX | Bound in constructor |
| **Null checks** | `offer && offer.tier` | Optional chaining `offer?.tier` |
| **Repeated cadence logic** | Duplicated in 4+ places | Single `getPrice()` helper |
| **`submitIfValid`** | Inlined in callback | Extracted named method |