```javascript
import React from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import CloseButton from '../common/close-button';
import InputForm from '../common/input-form';
import {getCurrencySymbol, getProductFromId, hasMultipleProductsFeature, isSameCurrency, formatNumber, hasMultipleNewsletters} from '../../utils/helpers';
import {ValidateInputForm} from '../../utils/form';
import {interceptAnchorClicks} from '../../utils/links';
import {sanitizeHtml} from '../../utils/sanitize-html';
import NewsletterSelectionPage from './newsletter-selection-page';
import {t} from '../../utils/i18n';

export const OfferPageStyles = () => {
    return `
.gh-portal-offer {
    padding-bottom: 0;
    overflow: unset;
    max-height: unset;
}

.gh-portal-offer-container {
    display: flex;
    flex-direction: column;
}

.gh-portal-plans-container.offer {
    justify-content: space-between;
    border-color: var(--grey12);
    border-top: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    padding: 12px 16px;
    font-size: 1.3rem;
}

.gh-portal-offer-bar {
    position: relative;
    padding: 26px 28px 28px;
    margin-bottom: 24px;
    /*border: 1px dashed var(--brandcolor);*/
    background-image: url("data:image/svg+xml,%3csvg width='100%25' height='99.9%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%23C3C3C3' stroke-width='3' stroke-dasharray='3%2c 9' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");
    background-color: var(--white);
    border-radius: 6px;
}

.gh-portal-offer-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.gh-portal-offer-title h4 {
    font-size: 1.8rem;
    margin: 0 110px 0 0;
    width: 100%;
}
html[dir="rtl"] .gh-portal-offer-title h4 {
    margin: 0 0 0 110px;
}

.gh-portal-offer-title h4.placeholder {
    opacity: 0.4;
}

.gh-portal-offer-bar .gh-portal-discount-label {
    position: absolute;
    top: 23px;
    right: 25px;
}

.gh-portal-offer-bar p {
    padding-bottom: 0;
    margin: 12px 0 0;
}

.gh-portal-offer-title h4 + p {
    margin: 12px 0 0;
}

.gh-portal-offer-details .gh-portal-plan-name,
.gh-portal-offer-details p {
    margin-inline-end: 8px;
}

.gh-portal-offer .footnote {
    font-size: 1.35rem;
    color: var(--grey8);
    margin: 4px 0 0;
}

.offer .gh-portal-product-card {
    max-width: unset;
    min-height: 0;
}

.offer .gh-portal-product-card .gh-portal-product-card-pricecontainer:not(.offer-type-trial) {
    margin-top: 0px;
}

.offer .gh-portal-product-card-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
}

.gh-portal-offer-oldprice {
    display: flex;
    position: relative;
    font-size: 1.8rem;
    font-weight: 300;
    color: var(--grey8);
    line-height: 1;
    white-space: nowrap;
    margin: 16px 0 4px;
}

.gh-portal-offer-oldprice:after {
    position: absolute;
    display: block;
    content: "";
    left: 0;
    top: 50%;
    right: 0;
    height: 1px;
    background: var(--grey8);
}

.gh-portal-offer-details p {
    margin-bottom: 12px;
}

.offer .after-trial-amount {
    margin-bottom: 0;
}

.offer .trial-duration {
    margin-top: 16px;
}

.gh-portal-cancel {
    white-space: nowrap;
}

.gh-portal-offer .gh-portal-signup-terms-wrapper {
    margin: 8px auto 16px;
}

.gh-portal-offer .gh-portal-signup-terms.gh-portal-error {
    margin: 0;
}
    `;
};

/**
 * Determines if name field should be displayed based on portal settings and member state
 * @param {Object} portalName - Portal name setting
 * @param {Object} member - Current member object
 * @returns {boolean} Whether to show name field
 */
const shouldShowNameField = (portalName, member) => {
    if (!portalName) {
        return false;
    }
    return !member || !!member?.name;
};

/**
 * Determines if terms checkbox is required
 * @param {Object} site - Site configuration
 * @returns {boolean} Whether checkbox is required
 */
const isCheckboxRequired = (site) => {
    return site?.portal_signup_checkbox_required && site?.portal_signup_terms_html;
};

/**
 * Determines if terms HTML exists
 * @param {string} termsHtml - Terms HTML content
 * @returns {boolean} Whether terms HTML is present
 */
const hasTermsHtml = (termsHtml) => {
    return termsHtml !== null && termsHtml !== '';
};

/**
 * Gets the appropriate submit button label based on offer type and action state
 * @param {Object} offer - Offer data
 * @param {string} action - Current action state
 * @returns {Object} Label and state flags
 */
const getSubmitButtonState = (offer, action) => {
    const states = {
        'signup:running': {label: t('Sending...'), isRunning: true, retry: false},
        'signup:failed': {label: t('Retry'), isRunning: false, retry: true}
    };

    if (states[action]) {
        return states[action];
    }

    if (offer?.type === 'trial') {
        return {
            label: t('Start {amount}-day free trial', {amount: offer.amount}),
            isRunning: false,
            retry: false
        };
    }

    return {label: t('Continue'), isRunning: false, retry: false};
};

/**
 * Gets the discount amount formatted for display
 * @param {Object} offer - Offer data
 * @returns {string} Formatted discount amount
 */
const getOffAmountForDisplay = (offer) => {
    const offAmountStrategies = {
        fixed: () => `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`,
        percent: () => `${offer.amount}%`,
        trial: () => String(offer.amount)
    };

    return offAmountStrategies[offer.type]?.() || '';
};

/**
 * Gets the offer tag display based on offer type
 * @param {Object} offer - Offer data
 * @returns {JSX.Element|null} Offer tag element
 */
const getOfferTagElement = (offer) => {
    if (offer.amount <= 0) {
        return null;
    }

    const tagStrategies = {
        fixed: () => t('{amount} off', {amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`}),
        trial: () => t('{amount} days free', {amount: offer.amount}),
        percent: () => t('{amount} off', {amount: offer.amount + '%'})
    };

    const label = tagStrategies[offer.type]?.();
    return label ? <h5 className="gh-portal-discount-label">{label}</h5> : null;
};

/**
 * Gets offer message based on discount duration
 * @param {Object} offer - Offer data
 * @param {string} originalPrice - Original price string
 * @returns {Object} Message and renewal label flag
 */
const getOfferMessageData = (offer, originalPrice) => {
    const renewsLabel = t(`Renews at {price}.`, {price: originalPrice, interpolation: {escapeValue: false}});
    const offAmount = getOffAmountForDisplay(offer);

    const messageStrategies = {
        once: {
            label: t(`{amount} off for first {period}.`, {amount: offAmount, period: offer.cadence}),
            useRenewsLabel: true
        },
        forever: {
            label: t(`{amount} off forever.`, {amount: offAmount}),
            useRenewsLabel: false
        },
        repeating: {
            label: offer.duration_in_months === 1
                ? t(`{amount} off for first {period}.`, {amount: offAmount, period: offer.cadence})
                : t(`{amount} off for first {number} months.`, {amount: offAmount, number: offer.duration_in_months || ''}),
            useRenewsLabel: true
        }
    };

    return messageStrategies[offer.duration] || {label: '', useRenewsLabel: false};
};

/**
 * Gets the price based on cadence
 * @param {Object} product - Product data
 * @param {string} cadence - 'month' or 'year'
 * @returns {Object} Price object
 */
const getPriceByCADence = (product, cadence) => {
    return cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
};

/**
 * Calculates updated price based on offer type
 * @param {number} originalAmount - Original price amount
 * @param {Object} offer - Offer data
 * @param {Object} price - Price object
 * @returns {number} Updated price
 */
const calculateUpdatedPrice = (originalAmount, offer, price) => {
    const priceStrategies = {
        fixed: () => {
            if (isSameCurrency(offer.currency, price.currency)) {
                const updated = (originalAmount - offer.amount) / 100;
                return updated > 0 ? updated : 0;
            }
            return originalAmount / 100;
        },
        percent: () => (originalAmount - ((originalAmount * offer.amount) / 100)) / 100,
        trial: () => originalAmount / 100
    };

    return priceStrategies[offer.type]?.() || originalAmount / 100;
};

export default class OfferPage extends React.Component {
    static contextType = AppContext;

    constructor(props, context) {
        super(props, context);
        this.state = {
            name: context?.member?.name || '',
            email: context?.member?.email || '',
            plan: 'free',
            showNewsletterSelection: false,
            termsCheckboxChecked: false
        };
    }

    getFormErrors(state) {
        const checkboxRequired = isCheckboxRequired(this.context.site);
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;

        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxError
        };
    }

    getInputFields({state, fieldNames}) {
        const {portal_name: portalName} = this.context.site;
        const {member} = this.context;
        const errors = state.errors || {};
        const fields = [
            {
                type: 'email',
                value: member?.email || state.email,
                placeholder: t('jamie@example.com'),
                label: t('Email'),
                name: 'email',
                disabled: !!member,
                required: true,
                tabIndex: 2,
                errorMessage: errors.email || ''
            }
        ];

        if (shouldShowNameField(portalName, member)) {
            fields.unshift({
                type: 'text',
                value: member?.name || state.name,
                placeholder: t('Jamie Larson'),
                label: t('Name'),
                name: 'name',
                disabled: !!member,
                required: true,
                tabIndex: 1,
                errorMessage: errors.name || ''
            });
        }
        fields[0].autoFocus = true;
        if (fieldNames?.length > 0) {
            return fields.filter((f) => {
                return fieldNames.includes(f.name);
            });
        }
        return fields;
    }

    renderSignupTerms() {
        const {site} = this.context;
        if (!hasTermsHtml(site.portal_signup_terms_html)) {
            return null;
        }

        const handleCheckboxChange = (e) => {
            this.setState({
                termsCheckboxChecked: e.target.checked
            });
        };

        const termsText = (
            <div className="gh-portal-signup-terms-content"
                dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
            ></div>
        );

        const signupTerms = isCheckboxRequired(site) ? (
            <label>
                <input
                    type="checkbox"
                    checked={!!this.state.termsCheckboxChecked}
                    required={true}
                    onChange={handleCheckboxChange}
                />
                <span className="checkbox"></span>
                {termsText}
            </label>
        ) : termsText;

        const errorClassName = this.state.errors?.checkbox ? 'gh-portal-error' : '';

        const className = `gh-portal-signup-terms ${errorClassName}`;

        return (
            <div className={className} onClick={interceptAnchorClicks}>
                {signupTerms}
            </div>
        );
    }

    onKeyDown(e) {
        if (e.keyCode === 13){
            this.handleSignup(e);
        }
    }

    handleSignup(e) {
        e.preventDefault();
        const {pageData: offer, site} = this.context;
        if (!offer?.tier) {
            return null;
        }
        const product = getProductFromId({site, productId: offer.tier.id});
        const price = getPriceByCADence(product, offer.cadence);
        this.setState((state) => {
            return {
                errors: this.getFormErrors(state)
            };
        }, () => {
            const {doAction} = this.context;
            const {name, email, phonenumber, errors} = this.state;
            const hasFormErrors = (errors && Object.values(errors).filter(d => !!d).length > 0);
            if (!hasFormErrors) {
                const signupData = {
                    name,
                    email,
                    plan: price?.id,
                    offerId: offer?.id,
                    phonenumber
                };
                if (hasMultipleNewsletters({site})) {
                    this.setState({
                        showNewsletterSelection: true,
                        pageData: signupData,
                        errors: {}
                    });
                } else {
                    doAction('signup', signupData);
                    this.setState({
                        errors: {}
                    });
                }
            }
        });
    }

    handleInputChange(e, field) {
        const fieldName = field.name;
        const value = e.target.value;
        this.setState({
            [fieldName]: value
        });
    }

    renderSiteLogo() {
        const {site} = this.context;
        const siteLogo = site.icon;

        if (siteLogo) {
            return (
                <img className='gh-portal-signup-logo' src={siteLogo} alt={site.title} />
            );
        }
        return null;
    }

    renderFormHeader() {
        const {site} = this.context;
        const siteTitle = site.title || '';
        return (
            <header className='gh-portal-signup-header'>
                {this.renderSiteLogo()}
                <h2 className="gh-portal-main-title">{siteTitle}</h2>
            </header>
        );
    }

    renderForm() {
        const fields = this.getInputFields({state: this.state});

        if (this.state.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={this.state.pageData}
                    onBack={() => {
                        this.setState({
                            showNewsletterSelection: false
                        });
                    }}
                />
            );
        }

        return (
            <section>
                <div className='gh-portal-section'>
                    <InputForm
                        fields={fields}
                        onChange={(e, field) => this.handleInputChange(e, field)}
                        onKeyDown={e => this.onKeyDown(e)}
                    />
                </div>
            </section>
        );
    }

    renderSubmitButton() {
        const {action, brandColor} = this.context;
        const {pageData: offer} = this.context;
        const {label, isRunning, retry} = getSubmitButtonState(offer, action);
        const disabled = action === 'signup:running';

        return (
            <ActionButton
                style={{width: '100%'}}
                retry={retry}
                onClick={e => this.handleSignup(e)}
                disabled={disabled}
                brandColor={brandColor}
                label={label}
                isRunning={isRunning}
                tabIndex={3}
                classes={'sticky bottom'}
            />
        );
    }

    renderLoginMessage() {
        const {member} = this.context;
        if (member) {
            return null;
        }
        const {brandColor, doAction} = this.context;
        return (
            <div className='gh-portal-signup-message'>
                <div>{t('Already a member?')}</div>
                <button
                    className='gh-portal-btn gh-portal-btn-link'
                    style={{color: brandColor}}
                    onClick={() => doAction('switchPage', {page: 'signin'})}
                >
                    <span>{t('Sign in')}</span>
                </button>
            </div>
        );
    }

    renderOfferTag() {
        const {pageData: offer} = this.context;
        return getOfferTagElement(offer) || <></>;
    }

    renderBenefits({product}) {
        const benefits = product.benefits || [];
        if (!benefits?.length) {
            return;
        }
        const benefitsUI = benefits.map((benefit, idx) => {
            return (
                <div className="gh-portal-product-benefit" key={`${benefit.name}-${idx}`}>
                    <CheckmarkIcon className='gh-portal-benefit-checkmark' />
                    <div className="gh-portal-benefit-title">{benefit.name}</div>
                </div>
            );
        });
        return (
            <div className="gh-portal-product-benefits">
                {benefitsUI}
            </div>
        );
    }

    getOriginalPrice({offer, product}) {
        const price = getPriceByCADence(product, offer.cadence);
        const originalAmount = this.renderRoundedPrice(price.amount / 100);
        return `${getCurrencySymbol(price.currency)}${originalAmount}/${offer.cadence}`;
    }

    getUpdatedPrice({offer, product}) {
        const price = getPriceByCADence(product, offer.cadence);
        const originalAmount = price.amount;
        return calculateUpdatedPrice(originalAmount, offer, price);
    }

    renderRoundedPrice(price) {
        if (price % 1 !== 0) {
            const roundedPrice = Math.round(price * 100) / 100;
            return Number(roundedPrice).toFixed(2);
        }
        return price;
    }

    renderOfferMessage({offer, product}) {
        if (offer.duration === 'trial') {
            const originalPrice = this.getOriginalPrice({offer, product});
            return (
                <p className="footnote">{t('Try free for {amount} days, then {originalPrice}.', {
                    amount: offer.amount,
                    originalPrice: originalPrice,
                    interpolation: {escapeValue: false}
                })} <span className="gh-portal-cancel">{t('Cancel anytime.')}</span></p>
            );
        }

        const originalPrice = this.getOriginalPrice({offer, product});
        const renewsLabel = t(`Renews at {price}.`, {price: originalPrice, interpolation: {escapeValue: false}});
        const {label: offerLabel, useRenewsLabel} = getOfferMessageData(offer, originalPrice);

        return (
            <p className="footnote">{offerLabel} {useRenewsLabel ? renewsLabel : ''}</p>
        );
    }

    renderProductLabel({product, offer}) {
        const {site} = this.context;
        const cadenceLabel = offer.cadence === 'month' ? t('Monthly') : t('Yearly');

        if (hasMultipleProductsFeature({site})) {
            return (
                <h4 className="gh-portal-plan-name">{product.name} - {cadenceLabel}</h4>
            );
        }
        return (
            <h4 className="gh-portal-plan-name">{cadenceLabel}</h4>
        );
    }

    renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price}) {
        const containerClass = offer.type === 'trial' ? 'gh-portal-product-card-pricecontainer offer-type-trial' : 'gh-portal-product-card-pricecontainer';

        return (
            <div className={containerClass}>
                <div className="gh-portal-product-price">
                    <span className={'currency-sign ' + currencyClass}>{getCurrencySymbol(price.currency)}</span>
                    <span className="amount">{formatNumber(this.renderRoundedPrice(updatedPrice))}</span>
                </div>
            </div>
        );
    }

    renderOldTierPrice({offer, price}) {
        if (offer.type === 'trial') {
            return null;
        }
        return (
            <div className="gh-portal-offer-oldprice">{getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}</div>
        );
    }

    renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits}) {
        if (this.state.showNewsletterSelection) {
            return null;
        }
        return (
            <>
                <div className='gh-portal-product-card top'>
                    <div className='gh-portal-product-card-header'>
                        <h4 className="gh-portal-product-name">{product.name} - {(offer.cadence === 'month' ? t('Monthly') : t('Yearly'))}</h4>
                        {this.renderOldTierPrice({offer, price})}
                        {this.renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price})}
                        {this.renderOfferMessage({offer, product, price})}
                    </div>
                </div>

                <div>
                    <div className='gh-portal-product-card bottom'>
                        <div className='gh-portal-product-card-detaildata'>
                            {product.description && <div className="gh-portal-product-description">{product.description}</div>}
                            {benefits.length > 0 && this.renderBenefits({product})}
                        </div>
                    </div>

                    <div className='gh-portal-btn-container sticky m32'>
                        <div className='gh-portal-signup-terms-wrapper'>
                            {this.renderSignupTerms()}
                        </div>
                        {this.renderSubmitButton()}
                    </div>
                    {this.renderLoginMessage()}
                </div>
            </>
        );
    }

    render() {
        const {pageData: offer, site} = this.context;
        if (!offer?.tier) {
            return null;
        }
        const product = getProductFromId({site, productId: offer.tier.id});
        if (!product) {
            return null;
        }
        const price = getPriceByCADence(product, offer.cadence);
        const updatedPrice = this.getUpdatedPrice({offer, product});
        const benefits = product.benefits || [];

        const currencyClass = (getCurrencySymbol(price.currency)).length > 1 ? 'long' : '';

        return (
            <>
                <div className='gh-portal-content gh-portal-offer'>
                    <CloseButton />
                    {this.renderFormHeader()}

                    <div className="gh-portal-offer-bar">
                        <div className="gh-portal-offer-title">
                            {offer.display_title ? <h4>{offer.display_title}</h4> : <h4 className='placeholder'>{t('Black Friday')}</h4>}
                            {this.renderOfferTag()}
                        </div>
                        {offer.display_description && <p>{offer.display_description}</p>}
                    </div>

                    {this.renderForm()}
                    {this.renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits})}
                </div>
            </>
        );
    }
}
```