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

// Refactored helper: Checks and returns product and price info for the offer, or null if missing
function getOfferProductPrice({site, offer}) {
    if (!offer?.tier) {
        return null;
    }
    const product = getProductFromId({site, productId: offer.tier.id});
    if (!product) {
        return null;
    }
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    return {product, price};
}

// Refactored helper: Returns cleaned price value after applying offer discount
function computeUpdatedPrice({offer, price}) {
    if (price == null) {
        return 0;
    }

    const originalAmount = price.amount;

    if (offer.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
        return Math.max(0, ((originalAmount - offer.amount)) / 100);
    } else if (offer.type === 'percent') {
        return ((originalAmount - ((originalAmount * offer.amount) / 100)) / 100);
    }

    return originalAmount / 100;
}

// Refactored helper: Formats price to 2 decimal places when needed
function formatOfferPrice(price) {
    if (price % 1 !== 0) {
        return Number(Math.round(price * 100) / 100).toFixed(2);
    }
    return price;
}

// Refactored helper: Formats human-readable offer description text
function formatOfferMessage({offer, product, originalPrice}) {
    const messages = {
        forever: t('{amount} off forever.', {
            amount: formatOffAmount(offer)
        }),
        firstPeriod: t('{amount} off for first {period}.', {
            amount: formatOffAmount(offer),
            period: offer.cadence
        }),
        firstNMonths: t('{amount} off for first {number} months.', {
            amount: formatOffAmount(offer),
            number: offer.duration_in_months || ''
        })
    };

    const renewsLabel = t('Renews at {price}.', {price: originalPrice, interpolation: {escapeValue: false}});
    let message = '';
    let useRenewsLabel = false;

    switch (offer.duration) {
        case 'once':
            message = messages.firstPeriod;
            useRenewsLabel = true;
            break;
        case 'forever':
            message = messages.forever;
            break;
        case 'repeating': {
            const duration = offer.duration_in_months;
            if (duration === 1) {
                message = messages.firstPeriod;
            } else {
                message = messages.firstNMonths;
            }
            useRenewsLabel = true;
            break;
        }
        default:
            break;
    }

    if (offer.type === 'trial') {
        return t('Try free for {amount} days, then {originalPrice}. Cancel anytime.', {
            amount: offer.amount,
            originalPrice: originalPrice,
            interpolation: {escapeValue: false}
        });
    }

    return `${message}${useRenewsLabel ? ' ' + renewsLabel : ''}`;
}

// Refactored helper: Formats human-readable off amount string
function formatOffAmount(offer) {
    if (offer.type === 'fixed') {
        return `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`;
    } else if (offer.type === 'percent') {
        return `${offer.amount}%`;
    } else if (offer.type === 'trial') {
        return offer.amount;
    }
    return '';
}

// Refactored helper: Returns offer tag UI component
function renderOfferTag(offer) {
    if (!offer || offer.amount <= 0) {
        return null;
    }

    if (offer.type === 'fixed') {
        return (
            <h5 className="gh-portal-discount-label">{t('{amount} off', {
                amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`
            })}</h5>
        );
    }

    if (offer.type === 'trial') {
        return (
            <h5 className="gh-portal-discount-label">{t('{amount} days free', {amount: offer.amount})}</h5>
        );
    }

    return (
        <h5 className="gh-portal-discount-label">{t('{amount} off', {amount: offer.amount + '%'})}</h5>
    );
}

// Refactored helper: Renders benefits section
function renderBenefits(product) {
    const benefits = product.benefits || [];
    if (!benefits?.length) {
        return null;
    }
    return (
        <div className="gh-portal-product-benefits">
            {benefits.map((benefit, idx) => (
                <div className="gh-portal-product-benefit" key={`${benefit.name}-${idx}`}>
                    <CheckmarkIcon className='gh-portal-benefit-checkmark' />
                    <div className="gh-portal-benefit-title">{benefit.name}</div>
                </div>
            ))}
        </div>
    );
}

// Refactored helper: Returns signup terms JSX
function renderSignupTerms(site, checked, onChange) {
    if (!site?.portal_signup_terms_html || site.portal_signup_terms_html === '') {
        return null;
    }

    const termsContent = (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
        />
    );

    if (site.portal_signup_checkbox_required) {
        return (
            <label>
                <input
                    type="checkbox"
                    checked={checked}
                    required
                    onChange={onChange}
                />
                <span className="checkbox"></span>
                {termsContent}
            </label>
        );
    }

    return termsContent;
}

// Refactored helper: Returns "Login" / "Already a member?" prompt
function renderLoginMessage({brandColor, doAction}) {
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

// Refactored helper: Returns product card header with pricing and offer message
function renderProductCardHeader({offer, price, updatedPrice, product}) {
    const originalPriceStr = `${getCurrencySymbol(price.currency)}${formatOfferPrice(price.amount / 100)}/${offer.cadence}`;
    const offerMessage = formatOfferMessage({offer, product, originalPrice: originalPriceStr});

    return (
        <>
            <h4 className="gh-portal-product-name">{product.name} - {(offer.cadence === 'month' ? t('Monthly') : t('Yearly'))}</h4>
            {offer.type !== 'trial' && (
                <div className="gh-portal-offer-oldprice">{getCurrencySymbol(price.currency)} {formatOfferPrice(price.amount / 100)}</div>
            )}
            <div className="gh-portal-product-card-pricecontainer">
                <div className="gh-portal-product-price">
                    <span className={'currency-sign ' + (getCurrencySymbol(price.currency).length > 1 ? 'long' : '')}>{getCurrencySymbol(price.currency)}</span>
                    <span className="amount">{formatNumber(formatOfferPrice(updatedPrice))}</span>
                </div>
            </div>
            <p className="footnote">{offerMessage}</p>
        </>
    );
}

// Refactored helper: Gets form fields with error handling and immutability
function getFormFields({site, member, state, fieldNames}) {
    const errors = state.errors || {};
    const fieldList = [
        {
            type: 'email',
            value: member?.email || state.email,
            placeholder: t('jamie@example.com'),
            label: t('Email'),
            name: 'email',
            disabled: !!member,
            required: true,
            tabIndex: 2,
            autoFocus: true,
            errorMessage: errors.email || ''
        }
    ];

    if ((site.portal_name || false) && (!member || !!member?.name)) {
        fieldList.unshift({
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

    return fieldNames && fieldNames.length > 0
        ? fieldList.filter(field => fieldNames.includes(field.name))
        : fieldList;
}

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
        const checkboxRequired = this.context.site.portal_signup_checkbox_required && this.context.site.portal_signup_terms_html;
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;
        return {
            ...ValidateInputForm({fields: getFormFields({site: this.context.site, member: this.context.member, state, fieldNames: null})}),
            checkbox: checkboxError
        };
    }

    handleCheckboxChange(e) {
        this.setState({termsCheckboxChecked: e.target.checked});
    }

    handleInputChange(e, field) {
        this.setState({[field.name]: e.target.value});
    }

    handleSignup(e) {
        e.preventDefault();

        const {offer, site} = this.context;
        const offerProductPrice = getOfferProductPrice({offer, site});
        if (!offerProductPrice) {
            return;
        }

        const {product, price} = offerProductPrice;
        const updatedPrice = computeUpdatedPrice({offer, price});
        const errors = this.getFormErrors(this.state);

        this.setState({errors}, () => {
            const {doAction} = this.context;
            const {name, email, phonenumber} = this.state;

            if (Object.values(errors).some(val => !!val)) {
                return;
            }

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
        });
    }

    onKeyDown(e) {
        if (e.keyCode === 13) {
            this.handleSignup(e);
        }
    }

    renderSiteLogo() {
        const {icon, title} = this.context.site;
        if (!icon) return null;
        return <img className='gh-portal-signup-logo' src={icon} alt={title} />;
    }

    renderFormHeader() {
        const {title} = this.context.site;
        return (
            <header className='gh-portal-signup-header'>
                {this.renderSiteLogo()}
                <h2 className="gh-portal-main-title">{title}</h2>
            </header>
        );
    }

    renderForm() {
        if (this.state.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={this.state.pageData}
                    onBack={() => this.setState({showNewsletterSelection: false})}
                />
            );
        }

        return (
            <section>
                <div className='gh-portal-section'>
                    <InputForm
                        fields={getFormFields({
                            site: this.context.site,
                            member: this.context.member,
                            state: this.state,
                            fieldNames: null
                        })}
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
        let label = t('Continue');

        if (offer?.type === 'trial') {
            label = t('Start {amount}-day free trial', {amount: offer.amount});
        }

        let isRunning = false;
        if (action === 'signup:running') {
            label = t('Sending...');
            isRunning = true;
        }

        let retry = false;
        if (action === 'signup:failed') {
            label = t('Retry');
            retry = true;
        }

        return (
            <ActionButton
                style={{width: '100%'}}
                retry={retry}
                onClick={e => this.handleSignup(e)}
                disabled={action === 'signup:running'}
                brandColor={brandColor}
                label={label}
                isRunning={isRunning}
                tabIndex={3}
                classes="sticky bottom"
            />
        );
    }

    renderOfferTag() {
        return renderOfferTag(this.context.pageData);
    }

    renderLoginMessage() {
        if (this.context.member) {
            return null;
        }
        const {brandColor, doAction} = this.context;
        return renderLoginMessage({brandColor, doAction});
    }

    renderSignupTerms() {
        const {portal_signup_terms_html, portal_signup_checkbox_required} = this.context.site;
        if (!portal_signup_terms_html || portal_signup_terms_html === '') {
            return null;
        }

        const termsContent = renderSignupTerms(
            this.context.site,
            this.state.termsCheckboxChecked,
            (e) => this.handleCheckboxChange(e)
        );

        const className = this.state.errors?.checkbox ? 'gh-portal-error' : '';
        const errorClassName = className ? ' gh-portal-error' : '';

        return (
            <div className={`gh-portal-signup-terms${errorClassName}`} onClick={interceptAnchorClicks}>
                {portal_signup_checkbox_required ? termsContent : <label>{termsContent}</label>}
            </div>
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
                        {renderProductCardHeader({offer, price, updatedPrice, product})}
                    </div>
                </div>

                <div>
                    <div className='gh-portal-product-card bottom'>
                        <div className='gh-portal-product-card-detaildata'>
                            {product.description && <div className="gh-portal-product-description">{product.description}</div>}
                            {benefits.length > 0 && renderBenefits(product)}
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

        const offerProductPrice = getOfferProductPrice({offer, site});
        if (!offerProductPrice) {
            return null;
        }

        const {product, price} = offerProductPrice;
        const updatedPrice = computeUpdatedPrice({offer, price});
        const benefits = product.benefits || [];
        const currencyClass = (getCurrencySymbol(price.currency)).length > 1 ? 'long' : '';

        return (
            <>
                <div className='gh-portal-content gh-portal-offer'>
                    <CloseButton />
                    {this.renderFormHeader()}

                    <div className="gh-portal-offer-bar">
                        <div className="gh-portal-offer-title">
                            {(offer.display_title ? <h4>{offer.display_title}</h4> : <h4 className='placeholder'>{t('Black Friday')}</h4>)}
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