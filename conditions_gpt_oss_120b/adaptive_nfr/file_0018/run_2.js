import React from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import CloseButton from '../common/close-button';
import InputForm from '../common/input-form';
import {
    getCurrencySymbol,
    getProductFromId,
    hasMultipleProductsFeature,
    isSameCurrency,
    formatNumber,
    hasMultipleNewsletters
} from '../../utils/helpers';
import {ValidateInputForm} from '../../utils/form';
import {interceptAnchorClicks} from '../../utils/links';
import {sanitizeHtml} from '../../utils/sanitize-html';
import NewsletterSelectionPage from './newsletter-selection-page';
import {t} from '../../utils/i18n';

/**
 * Returns true if the signup terms should be rendered.
 * @param {object} site
 * @returns {boolean}
 */
function shouldRenderSignupTerms(site) {
    return !!site?.portal_signup_terms_html;
}

/**
 * Returns true if the terms checkbox is required.
 * @param {object} site
 * @returns {boolean}
 */
function isTermsCheckboxRequired(site) {
    return !!site?.portal_signup_checkbox_required && !!site?.portal_signup_terms_html;
}

/**
 * Returns the label element for the offer tag.
 * @param {object} offer
 * @returns {JSX.Element|null}
 */
function getOfferTagElement(offer) {
    if (!offer?.amount) {
        return null;
    }
    const type = offer.type;
    if (type === 'fixed') {
        return (
            <h5 className="gh-portal-discount-label">
                {t('{amount} off', {
                    amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`
                })}
            </h5>
        );
    }
    if (type === 'trial') {
        return (
            <h5 className="gh-portal-discount-label">
                {t('{amount} days free', {amount: offer.amount})}
            </h5>
        );
    }
    return (
        <h5 className="gh-portal-discount-label">
            {t('{amount} off', {amount: `${offer.amount}%`})}
        </h5>
    );
}

/**
 * Returns props for the submit button based on action and offer.
 * @param {string} action
 * @param {object} offer
 * @returns {{label:string, isRunning:boolean, retry:boolean, disabled:boolean}}
 */
function getSubmitButtonProps(action, offer) {
    let label = t('Continue');
    let isRunning = false;
    let retry = false;
    if (offer?.type === 'trial') {
        label = t('Start {amount}-day free trial', {amount: offer.amount});
    }
    if (action === 'signup:running') {
        label = t('Sending...');
        isRunning = true;
    }
    if (action === 'signup:failed') {
        label = t('Retry');
        retry = true;
    }
    const disabled = action === 'signup:running';
    return {label, isRunning, retry, disabled};
}

/**
 * Returns true if the offer has a tier.
 * @param {object} offer
 * @returns {boolean}
 */
function hasOfferTier(offer) {
    return !!offer?.tier;
}

/**
 * Returns the off amount string for an offer.
 * @param {object} offer
 * @returns {string}
 */
function getOffAmount(offer) {
    if (offer?.type === 'fixed') {
        return `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`;
    }
    if (offer?.type === 'percent') {
        return `${offer.amount}%`;
    }
    if (offer?.type === 'trial') {
        return `${offer.amount}`;
    }
    return '';
}

/**
 * Returns the offer message JSX.
 * @param {object} params
 * @returns {JSX.Element}
 */
function renderOfferMessage({offer, product}) {
    const offerMessages = {
        forever: t(`{amount} off forever.`, {amount: getOffAmount(offer)}),
        firstPeriod: t(`{amount} off for first {period}.`, {
            amount: getOffAmount(offer),
            period: offer.cadence
        }),
        firstNMonths: t(`{amount} off for first {number} months.`, {
            amount: getOffAmount(offer),
            number: offer.duration_in_months || ''
        })
    };
    const originalPrice = `${getCurrencySymbol(product?.monthlyPrice?.currency || '')}${product?.monthlyPrice?.amount / 100}/${offer?.cadence}`;
    const renewsLabel = t(`Renews at {price}.`, {price: originalPrice, interpolation: {escapeValue: false}});
    const discountDuration = offer?.duration;
    let offerLabel = '';
    let useRenewsLabel = false;
    if (discountDuration === 'once') {
        offerLabel = offerMessages.firstPeriod;
        useRenewsLabel = true;
    } else if (discountDuration === 'forever') {
        offerLabel = offerMessages.forever;
    } else if (discountDuration === 'repeating') {
        const months = offer.duration_in_months || '';
        offerLabel = months === 1 ? offerMessages.firstPeriod : offerMessages.firstNMonths;
        useRenewsLabel = true;
    }
    if (discountDuration === 'trial') {
        return (
            <p className="footnote">
                {t('Try free for {amount} days, then {originalPrice}.', {
                    amount: offer.amount,
                    originalPrice,
                    interpolation: {escapeValue: false}
                })}{' '}
                <span className="gh-portal-cancel">{t('Cancel anytime.')}</span>
            </p>
        );
    }
    return (
        <p className="footnote">
            {offerLabel} {useRenewsLabel ? renewsLabel : ''}
        </p>
    );
}

/**
 * Returns the rounded price string.
 * @param {number} price
 * @returns {string|number}
 */
function renderRoundedPrice(price) {
    if (price % 1 !== 0) {
        const rounded = Math.round(price * 100) / 100;
        return Number(rounded).toFixed(2);
    }
    return price;
}

/**
 * Returns the updated price based on offer.
 * @param {object} params
 * @returns {number}
 */
function getUpdatedPrice({offer, product}) {
    const price = offer?.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const originalAmount = price.amount;
    if (offer?.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
        const updated = (originalAmount - offer.amount) / 100;
        return updated > 0 ? updated : 0;
    }
    if (offer?.type === 'percent') {
        return (originalAmount - (originalAmount * offer.amount) / 100) / 100;
    }
    return originalAmount / 100;
}

/**
 * Returns the original price string.
 * @param {object} params
 * @returns {string}
 */
function getOriginalPrice({offer, product}) {
    const price = offer?.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const amount = renderRoundedPrice(price.amount / 100);
    return `${getCurrencySymbol(price.currency)}${amount}/${offer?.cadence}`;
}

/**
 * Returns true if the product has benefits.
 * @param {object} product
 * @returns {boolean}
 */
function hasBenefits(product) {
    return !!product?.benefits?.length;
}

/**
 * Returns JSX for product benefits.
 * @param {object} product
 * @returns {JSX.Element|null}
 */
function renderBenefits({product}) {
    if (!hasBenefits(product)) {
        return null;
    }
    const benefitsUI = product.benefits.map((benefit, idx) => (
        <div className="gh-portal-product-benefit" key={`${benefit.name}-${idx}`}>
            <CheckmarkIcon className="gh-portal-benefit-checkmark" />
            <div className="gh-portal-benefit-title">{benefit.name}</div>
        </div>
    ));
    return <div className="gh-portal-product-benefits">{benefitsUI}</div>;
}

/**
 * Returns JSX for the old tier price.
 * @param {object} params
 * @returns {JSX.Element|null}
 */
function renderOldTierPrice({offer, price}) {
    if (offer?.type === 'trial') {
        return null;
    }
    return (
        <div className="gh-portal-offer-oldprice">
            {getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}
        </div>
    );
}

/**
 * Returns JSX for the updated tier price.
 * @param {object} params
 * @returns {JSX.Element}
 */
function renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price}) {
    const containerClass = offer?.type === 'trial' ? 'gh-portal-product-card-pricecontainer offer-type-trial' : 'gh-portal-product-card-pricecontainer';
    return (
        <div className={containerClass}>
            <div className="gh-portal-product-price">
                <span className={'currency-sign ' + currencyClass}>{getCurrencySymbol(price.currency)}</span>
                <span className="amount">{formatNumber(renderRoundedPrice(updatedPrice))}</span>
            </div>
        </div>
    );
}

/**
 * Returns JSX for the product label.
 * @param {object} params
 * @returns {JSX.Element}
 */
function renderProductLabel({product, offer, site}) {
    if (hasMultipleProductsFeature({site})) {
        return (
            <h4 className="gh-portal-plan-name">
                {product.name} - {offer?.cadence === 'month' ? t('Monthly') : t('Yearly')}
            </h4>
        );
    }
    return (
        <h4 className="gh-portal-plan-name">
            {offer?.cadence === 'month' ? t('Monthly') : t('Yearly')}
        </h4>
    );
}

/**
 * Returns JSX for the product card.
 * @param {object} params
 * @returns {JSX.Element|null}
 */
function renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits, state, setState, context}) {
    if (state.showNewsletterSelection) {
        return null;
    }
    return (
        <>
            <div className="gh-portal-product-card top">
                <div className="gh-portal-product-card-header">
                    <h4 className="gh-portal-product-name">
                        {product.name} - {offer?.cadence === 'month' ? t('Monthly') : t('Yearly')}
                    </h4>
                    {renderOldTierPrice({offer, price})}
                    {renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price})}
                    {renderOfferMessage({offer, product})}
                </div>
            </div>
            <div>
                <div className="gh-portal-product-card bottom">
                    <div className="gh-portal-product-card-detaildata">
                        {product.description ? <div className="gh-portal-product-description">{product.description}</div> : ''}
                        {benefits.length ? renderBenefits({product}) : ''}
                    </div>
                </div>
                <div className="gh-portal-btn-container sticky m32">
                    <div className="gh-portal-signup-terms-wrapper">{renderSignupTerms({site: context.site, state, setState})}</div>
                    {renderSubmitButton({context, state, setState})}
                </div>
                {renderLoginMessage({context})}
            </div>
        </>
    );
}

/**
 * Returns JSX for the signup terms.
 * @param {object} params
 * @returns {JSX.Element|null}
 */
function renderSignupTerms({site, state, setState}) {
    if (!shouldRenderSignupTerms(site)) {
        return null;
    }
    const handleCheckboxChange = (e) => {
        setState({termsCheckboxChecked: e.target.checked});
    };
    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
        />
    );
    const signupTerms = isTermsCheckboxRequired(site) ? (
        <label>
            <input
                type="checkbox"
                checked={!!state.termsCheckboxChecked}
                required
                onChange={handleCheckboxChange}
            />
            <span className="checkbox" />
            {termsContent}
        </label>
    ) : (
        termsContent
    );
    const errorClass = state.errors?.checkbox ? 'gh-portal-error' : '';
    const className = `gh-portal-signup-terms ${errorClass}`;
    return (
        <div className={className} onClick={interceptAnchorClicks}>
            {signupTerms}
        </div>
    );
}

/**
 * Returns JSX for the submit button.
 * @param {object} params
 * @returns {JSX.Element}
 */
function renderSubmitButton({context, state, setState}) {
    const {action, brandColor} = context;
    const {pageData: offer} = context;
    const {label, isRunning, retry, disabled} = getSubmitButtonProps(action, offer);
    const handleClick = (e) => {
        e.preventDefault();
        handleSignup({e, context, state, setState});
    };
    return (
        <ActionButton
            style={{width: '100%'}}
            retry={retry}
            onClick={handleClick}
            disabled={disabled}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
            tabIndex={3}
            classes="sticky bottom"
        />
    );
}

/**
 * Handles signup logic.
 * @param {object} params
 */
function handleSignup({e, context, state, setState}) {
    e.preventDefault();
    const {pageData: offer, site} = context;
    if (!hasOfferTier(offer)) {
        return null;
    }
    const product = getProductFromId({site, productId: offer.tier.id});
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    setState((prev) => ({
        ...prev,
        errors: getFormErrors({state: prev, context})
    }), () => {
        const {doAction} = context;
        const {name, email, phonenumber, errors} = state;
        const hasFormErrors = errors && Object.values(errors).some(Boolean);
        if (!hasFormErrors) {
            const signupData = {
                name,
                email,
                plan: price?.id,
                offerId: offer?.id,
                phonenumber
            };
            if (hasMultipleNewsletters({site})) {
                setState({
                    showNewsletterSelection: true,
                    pageData: signupData,
                    errors: {}
                });
            } else {
                doAction('signup', signupData);
                setState({errors: {}});
            }
        }
    });
}

/**
 * Returns form errors.
 * @param {object} params
 * @returns {object}
 */
function getFormErrors({state, context}) {
    const checkboxRequired = context.site?.portal_signup_checkbox_required && !!context.site?.portal_signup_terms_html;
    const checkboxError = checkboxRequired && !state.termsCheckboxChecked;
    return {
        ...ValidateInputForm({fields: getInputFields({state, context})}),
        checkbox: checkboxError
    };
}

/**
 * Returns input fields configuration.
 * @param {object} params
 * @returns {Array}
 */
function getInputFields({state, context}) {
    const {portal_name: portalName} = context.site || {};
    const {member} = context;
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
    let showNameField = !!portalName;
    if (member && !member?.name) {
        showNameField = false;
    }
    if (showNameField) {
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
    return fields;
}

/**
 * Returns JSX for the login message.
 * @param {object} params
 * @returns {JSX.Element|null}
 */
function renderLoginMessage({context}) {
    const {member, brandColor, doAction} = context;
    if (member) {
        return null;
    }
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
}

/**
 * Returns JSX for the site logo.
 * @param {object} site
 * @returns {JSX.Element|null}
 */
function renderSiteLogo({site}) {
    const siteLogo = site?.icon;
    if (siteLogo) {
        return <img className="gh-portal-signup-logo" src={siteLogo} alt={site.title} />;
    }
    return null;
}

/**
 * Returns JSX for the form header.
 * @param {object} site
 * @returns {JSX.Element}
 */
function renderFormHeader({site}) {
    const siteTitle = site?.title || '';
    return (
        <header className="gh-portal-signup-header">
            {renderSiteLogo({site})}
            <h2 className="gh-portal-main-title">{siteTitle}</h2>
        </header>
    );
}

/**
 * Returns JSX for the form.
 * @param {object} params
 * @returns {JSX.Element}
 */
function renderForm({state, setState, context}) {
    const fields = getInputFields({state, context});
    if (state.showNewsletterSelection) {
        return (
            <NewsletterSelectionPage
                pageData={state.pageData}
                onBack={() => setState({showNewsletterSelection: false})}
            />
        );
    }
    return (
        <section>
            <div className="gh-portal-section">
                <InputForm
                    fields={fields}
                    onChange={(e, field) => setState({[field.name]: e.target.value})}
                    onKeyDown={(e) => {
                        if (e.keyCode === 13) {
                            handleSignup({e, context, state, setState});
                        }
                    }}
                />
            </div>
        </section>
    );
}

/**
 * Main OfferPage component.
 */
export const OfferPageStyles = () => `
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

    render() {
        const {pageData: offer, site} = this.context;
        if (!hasOfferTier(offer)) {
            return null;
        }
        const product = getProductFromId({site, productId: offer.tier.id});
        if (!product) {
            return null;
        }
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const updatedPrice = getUpdatedPrice({offer, product});
        const benefits = product.benefits || [];
        const currencyClass = getCurrencySymbol(price.currency).length > 1 ? 'long' : '';
        return (
            <>
                <div className="gh-portal-content gh-portal-offer">
                    <CloseButton />
                    {renderFormHeader({site})}
                    <div className="gh-portal-offer-bar">
                        <div className="gh-portal-offer-title">
                            {offer.display_title ? <h4>{offer.display_title}</h4> : <h4 className="placeholder">{t('Black Friday')}</h4>}
                            {getOfferTagElement(offer)}
                        </div>
                        {offer.display_description ? <p>{offer.display_description}</p> : ''}
                    </div>
                    {renderForm({state: this.state, setState: this.setState.bind(this), context: this.context})}
                    {renderProductCard({
                        product,
                        offer,
                        currencyClass,
                        updatedPrice,
                        price,
                        benefits,
                        state: this.state,
                        setState: this.setState.bind(this),
                        context: this.context
                    })}
                </div>
            </>
        );
    }
}