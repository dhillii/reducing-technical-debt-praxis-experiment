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
 * Returns the JSX for the offer tag based on the offer type.
 * @param {object} offer
 * @returns {JSX.Element}
 */
function renderOfferTagContent(offer) {
    if (offer.amount <= 0) {
        return null;
    }
    const tagMap = {
        fixed: (
            <h5 className="gh-portal-discount-label">
                {t('{amount} off', {
                    amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`
                })}
            </h5>
        ),
        trial: (
            <h5 className="gh-portal-discount-label">
                {t('{amount} days free', {amount: offer.amount})}
            </h5>
        ),
        percent: (
            <h5 className="gh-portal-discount-label">
                {t('{amount} off', {amount: `${offer.amount}%`})}
            </h5>
        )
    };
    return tagMap[offer.type] || tagMap.percent;
}

/**
 * Returns the label, running state and retry flag for the submit button.
 * @param {object} ctx
 * @param {object} offer
 * @returns {{label:string, isRunning:boolean, retry:boolean, disabled:boolean}}
 */
function getSubmitButtonState(ctx, offer) {
    const {action} = ctx;
    let label = t('Continue');
    let isRunning = false;
    let retry = false;

    if (offer.type === 'trial') {
        label = t('Start {amount}-day free trial', {amount: offer.amount});
    }

    if (action === 'signup:running') {
        label = t('Sending...');
        isRunning = true;
    } else if (action === 'signup:failed') {
        label = t('Retry');
        retry = true;
    }

    const disabled = action === 'signup:running';
    return {label, isRunning, retry, disabled};
}

/**
 * Returns the formatted off amount string.
 * @param {object} offer
 * @returns {string}
 */
function getOffAmount(offer) {
    const typeMap = {
        fixed: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`,
        percent: `${offer.amount}%`,
        trial: `${offer.amount}`
    };
    return typeMap[offer.type] || '';
}

/**
 * Returns the offer message JSX.
 * @param {object} offer
 * @param {object} product
 * @returns {JSX.Element}
 */
function renderOfferMessageContent(offer, product) {
    const originalPrice = (() => {
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const amount = price.amount / 100;
        return `${getCurrencySymbol(price.currency)}${amount}/${offer.cadence}`;
    })();

    const renewsLabel = t('Renews at {price}.', {
        price: originalPrice,
        interpolation: {escapeValue: false}
    });

    const offAmount = getOffAmount(offer);
    const messages = {
        forever: t('{amount} off forever.', {amount: offAmount}),
        firstPeriod: t('{amount} off for first {period}.', {
            amount: offAmount,
            period: offer.cadence
        }),
        firstNMonths: t('{amount} off for first {number} months.', {
            amount: offAmount,
            number: offer.duration_in_months || ''
        })
    };

    const {duration} = offer;
    if (duration === 'trial') {
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

    let label = '';
    let useRenews = false;

    if (duration === 'once') {
        label = messages.firstPeriod;
        useRenews = true;
    } else if (duration === 'forever') {
        label = messages.forever;
    } else if (duration === 'repeating') {
        const months = offer.duration_in_months;
        label = months === 1 ? messages.firstPeriod : messages.firstNMonths;
        useRenews = true;
    }

    return (
        <p className="footnote">
            {label} {useRenews ? renewsLabel : ''}
        </p>
    );
}

/**
 * Returns the product label JSX.
 * @param {object} ctx
 * @param {object} product
 * @param {object} offer
 * @returns {JSX.Element}
 */
function renderProductLabel(ctx, product, offer) {
    const {site} = ctx;
    const cadenceLabel = offer.cadence === 'month' ? t('Monthly') : t('Yearly');
    if (hasMultipleProductsFeature({site})) {
        return (
            <h4 className="gh-portal-plan-name">
                {product.name} - {cadenceLabel}
            </h4>
        );
    }
    return <h4 className="gh-portal-plan-name">{cadenceLabel}</h4>;
}

/**
 * Returns the updated tier price JSX.
 * @param {object} params
 * @returns {JSX.Element}
 */
function renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price}) {
    const containerClass =
        offer.type === 'trial' ? 'gh-portal-product-card-pricecontainer offer-type-trial' : 'gh-portal-product-card-pricecontainer';
    return (
        <div className={containerClass}>
            <div className="gh-portal-product-price">
                <span className={'currency-sign ' + currencyClass}>{getCurrencySymbol(price.currency)}</span>
                <span className="amount">{formatNumber(updatedPrice)}</span>
            </div>
        </div>
    );
}

/**
 * Returns the old tier price JSX.
 * @param {object} params
 * @returns {JSX.Element|null}
 */
function renderOldTierPrice({offer, price}) {
    if (offer.type === 'trial') {
        return null;
    }
    return (
        <div className="gh-portal-offer-oldprice">
            {getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}
        </div>
    );
}

/**
 * Returns the benefits JSX.
 * @param {object} product
 * @returns {JSX.Element|null}
 */
function renderBenefits(product) {
    const benefits = product.benefits || [];
    if (!benefits.length) {
        return null;
    }
    const benefitsUI = benefits.map((benefit, idx) => (
        <div className="gh-portal-product-benefit" key={`${benefit.name}-${idx}`}>
            <CheckmarkIcon className="gh-portal-benefit-checkmark" />
            <div className="gh-portal-benefit-title">{benefit.name}</div>
        </div>
    ));
    return <div className="gh-portal-product-benefits">{benefitsUI}</div>;
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
 * Calculates the updated price based on the offer.
 * @param {object} params
 * @returns {number}
 */
function calculateUpdatedPrice({offer, product}) {
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const originalAmount = price.amount;
    if (offer.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
        const updated = (originalAmount - offer.amount) / 100;
        return updated > 0 ? updated : 0;
    }
    if (offer.type === 'percent') {
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
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const amount = renderRoundedPrice(price.amount / 100);
    return `${getCurrencySymbol(price.currency)}${amount}/${offer.cadence}`;
}

/**
 * Returns the JSX for the signup terms section.
 * @param {object} ctx
 * @param {object} state
 * @returns {JSX.Element|null}
 */
function renderSignupTerms(ctx, state) {
    const {site} = ctx;
    if (!site?.portal_signup_terms_html) {
        return null;
    }

    const handleCheckboxChange = (e) => {
        ctx.setState({termsCheckboxChecked: e.target.checked});
    };

    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
        />
    );

    const signupTerms = site.portal_signup_checkbox_required ? (
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
 * Returns the JSX for the product card.
 * @param {object} params
 * @returns {JSX.Element|null}
 */
function renderProductCard(params) {
    const {
        ctx,
        product,
        offer,
        currencyClass,
        updatedPrice,
        price,
        benefits,
        state
    } = params;

    if (state.showNewsletterSelection) {
        return null;
    }

    return (
        <>
            <div className="gh-portal-product-card top">
                <div className="gh-portal-product-card-header">
                    <h4 className="gh-portal-product-name">
                        {product.name} - {offer.cadence === 'month' ? t('Monthly') : t('Yearly')}
                    </h4>
                    {renderOldTierPrice({offer, price})}
                    {renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price})}
                    {renderOfferMessageContent(offer, product)}
                </div>
            </div>

            <div>
                <div className="gh-portal-product-card bottom">
                    <div className="gh-portal-product-card-detaildata">
                        {product.description && (
                            <div className="gh-portal-product-description">{product.description}</div>
                        )}
                        {benefits.length > 0 && renderBenefits(product)}
                    </div>
                </div>

                <div className="gh-portal-btn-container sticky m32">
                    <div className="gh-portal-signup-terms-wrapper">
                        {renderSignupTerms(ctx, state)}
                    </div>
                    {ctx.renderSubmitButton()}
                </div>
                {ctx.renderLoginMessage()}
            </div>
        </>
    );
}

/**
 * Returns the JSX for the login message.
 * @param {object} ctx
 * @returns {JSX.Element|null}
 */
function renderLoginMessage(ctx) {
    const {member, brandColor, doAction} = ctx;
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
 * Returns the JSX for the form header.
 * @param {object} ctx
 * @returns {JSX.Element}
 */
function renderFormHeader(ctx) {
    const {site} = ctx;
    const logo = site?.icon ? (
        <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />
    ) : null;
    return (
        <header className="gh-portal-signup-header">
            {logo}
            <h2 className="gh-portal-main-title">{site?.title || ''}</h2>
        </header>
    );
}

/**
 * Returns the JSX for the form section.
 * @param {object} ctx
 * @returns {JSX.Element}
 */
function renderFormSection(ctx) {
    const fields = ctx.getInputFields({state: ctx.state});
    if (ctx.state.showNewsletterSelection) {
        return (
            <NewsletterSelectionPage
                pageData={ctx.state.pageData}
                onBack={() => ctx.setState({showNewsletterSelection: false})}
            />
        );
    }
    return (
        <section>
            <div className="gh-portal-section">
                <InputForm
                    fields={fields}
                    onChange={(e, field) => ctx.handleInputChange(e, field)}
                    onKeyDown={(e) => ctx.onKeyDown(e)}
                />
            </div>
        </section>
    );
}

/**
 * Returns the JSX for the submit button.
 * @param {object} ctx
 * @returns {JSX.Element}
 */
function renderSubmitButton(ctx) {
    const {brandColor} = ctx;
    const {pageData: offer} = ctx.context;
    const {label, isRunning, retry, disabled} = getSubmitButtonState(ctx.context, offer);
    return (
        <ActionButton
            style={{width: '100%'}}
            retry={retry}
            onClick={(e) => ctx.handleSignup(e)}
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
 * Returns the JSX for the offer tag.
 * @param {object} ctx
 * @returns {JSX.Element}
 */
function renderOfferTag(ctx) {
    const {pageData: offer} = ctx.context;
    return renderOfferTagContent(offer);
}

/**
 * Returns the JSX for the product label.
 * @param {object} ctx
 * @param {object} product
 * @param {object} offer
 * @returns {JSX.Element}
 */
function renderProductLabelWrapper(ctx, product, offer) {
    return renderProductLabel(ctx.context, product, offer);
}

/**
 * Returns the JSX for the offer message.
 * @param {object} ctx
 * @param {object} offer
 * @param {object} product
 * @returns {JSX.Element}
 */
function renderOfferMessageWrapper(ctx, offer, product) {
    return renderOfferMessageContent(offer, product);
}

/**
 * Returns the JSX for the product card (wrapper to bind context methods).
 * @param {object} ctx
 * @param {object} params
 * @returns {JSX.Element|null}
 */
function renderProductCardWrapper(ctx, params) {
    return renderProductCard({
        ctx,
        ...params,
        state: ctx.state,
        renderSubmitButton: () => renderSubmitButton(ctx),
        renderLoginMessage: () => renderLoginMessage(ctx)
    });
}

/**
 * Returns the JSX for the site logo.
 * @param {object} ctx
 * @returns {JSX.Element|null}
 */
function renderSiteLogo(ctx) {
    const {site} = ctx.context;
    if (!site?.icon) {
        return null;
    }
    return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
}

/**
 * Returns the form errors object.
 * @param {object} ctx
 * @param {object} state
 * @returns {object}
 */
function getFormErrors(ctx, state) {
    const checkboxRequired = ctx.context.site?.portal_signup_checkbox_required && ctx.context.site?.portal_signup_terms_html;
    const checkboxError = checkboxRequired && !state.termsCheckboxChecked;
    return {
        ...ValidateInputForm({fields: ctx.getInputFields({state})}),
        checkbox: checkboxError
    };
}

/**
 * Returns the input fields array.
 * @param {object} ctx
 * @param {object} options
 * @returns {Array}
 */
function getInputFields(ctx, {state, fieldNames}) {
    const {portal_name: portalName} = ctx.context.site || {};
    const {member} = ctx.context;
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

    if (fieldNames?.length) {
        return fields.filter((f) => fieldNames.includes(f.name));
    }
    return fields;
}

/**
 * Returns the updated price rounded for display.
 * @param {number} price
 * @returns {string|number}
 */
function formatUpdatedPrice(price) {
    return renderRoundedPrice(price);
}

/**
 * Returns the original price string.
 * @param {object} offer
 * @param {object} product
 * @returns {string}
 */
function getOriginalPriceString(offer, product) {
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const amount = renderRoundedPrice(price.amount / 100);
    return `${getCurrencySymbol(price.currency)}${amount}/${offer.cadence}`;
}

/**
 * Returns the JSX for the offer page component.
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

    getFormErrors(state) {
        return getFormErrors(this, state);
    }

    getInputFields({state, fieldNames}) {
        return getInputFields(this, {state, fieldNames});
    }

    renderSignupTerms() {
        return renderSignupTerms(this, this.state);
    }

    onKeyDown(e) {
        if (e.keyCode === 13) {
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
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        this.setState(
            (state) => ({
                errors: this.getFormErrors(state)
            }),
            () => {
                const {doAction} = this.context;
                const {name, email, phonenumber, errors} = this.state;
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
                        this.setState({
                            showNewsletterSelection: true,
                            pageData: signupData,
                            errors: {}
                        });
                    } else {
                        doAction('signup', signupData);
                        this.setState({errors: {}});
                    }
                }
            }
        );
    }

    handleInputChange(e, field) {
        this.setState({[field.name]: e.target.value});
    }

    renderSiteLogo() {
        return renderSiteLogo(this);
    }

    renderFormHeader() {
        return renderFormHeader(this);
    }

    renderForm() {
        return renderFormSection(this);
    }

    renderSubmitButton() {
        return renderSubmitButton(this);
    }

    renderLoginMessage() {
        return renderLoginMessage(this);
    }

    renderOfferTag() {
        return renderOfferTag(this);
    }

    renderProductLabel({product, offer}) {
        return renderProductLabelWrapper(this, product, offer);
    }

    renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits}) {
        return renderProductCardWrapper(this, {
            product,
            offer,
            currencyClass,
            updatedPrice,
            price,
            benefits
        });
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
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const updatedPrice = calculateUpdatedPrice({offer, product});
        const benefits = product.benefits || [];

        const currencyClass = getCurrencySymbol(price.currency).length > 1 ? 'long' : '';

        return (
            <>
                <div className="gh-portal-content gh-portal-offer">
                    <CloseButton />
                    {this.renderFormHeader()}
                    <div className="gh-portal-offer-bar">
                        <div className="gh-portal-offer-title">
                            {offer.display_title ? <h4>{offer.display_title}</h4> : <h4 className="placeholder">{t('Black Friday')}</h4>}
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