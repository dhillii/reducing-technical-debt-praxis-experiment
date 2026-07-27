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

export const OfferPageStyles = () => {
    return `
.gh-portal-offer {
    padding-bottom: 0;
    overflow: unset;
    max-height: unset;
}

/* ...styles omitted for brevity... */
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

    /* ---------- Validation ---------- */
    getFormErrors(state) {
        const checkboxRequired = this.context.site?.portal_signup_checkbox_required && this.context.site?.portal_signup_terms_html;
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;

        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxError
        };
    }

    getInputFields({state, fieldNames}) {
        const {portal_name: portalName} = this.context.site || {};
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
            return fields.filter(f => fieldNames.includes(f.name));
        }
        return fields;
    }

    /* ---------- UI Helpers ---------- */
    renderSignupTerms() {
        const {site} = this.context;
        if (!site?.portal_signup_terms_html) {
            return null;
        }

        const handleCheckboxChange = e => {
            this.setState({termsCheckboxChecked: e.target.checked});
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
                    checked={!!this.state.termsCheckboxChecked}
                    required
                    onChange={handleCheckboxChange}
                />
                <span className="checkbox" />
                {termsContent}
            </label>
        ) : (
            termsContent
        );

        const errorClass = this.state.errors?.checkbox ? 'gh-portal-error' : '';
        const className = `gh-portal-signup-terms ${errorClass}`;

        return (
            <div className={className} onClick={interceptAnchorClicks}>
                {signupTerms}
            </div>
        );
    }

    onKeyDown(e) {
        if (e.keyCode === 13) {
            this.handleSignup(e);
        }
    }

    /* ---------- Signup Flow ---------- */
    handleSignup(e) {
        e.preventDefault();
        const {pageData: offer, site} = this.context;
        if (!offer?.tier) {
            return null;
        }

        const product = getProductFromId({site, productId: offer.tier.id});
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;

        this.setState(
            state => ({errors: this.getFormErrors(state)}),
            () => this._postValidation({offer, product, price})
        );
    }

    _postValidation({offer, product, price}) {
        const {name, email, phonenumber, errors} = this.state;
        const hasFormErrors = errors && Object.values(errors).some(Boolean);
        if (hasFormErrors) {
            return;
        }

        const signupData = {
            name,
            email,
            plan: price?.id,
            offerId: offer?.id,
            phonenumber
        };

        if (hasMultipleNewsletters({site: this.context.site})) {
            this.setState({
                showNewsletterSelection: true,
                pageData: signupData,
                errors: {}
            });
        } else {
            this.context.doAction('signup', signupData);
            this.setState({errors: {}});
        }
    }

    handleInputChange(e, field) {
        this.setState({[field.name]: e.target.value});
    }

    renderSiteLogo() {
        const {site} = this.context;
        const siteLogo = site?.icon;
        if (!siteLogo) {
            return null;
        }
        return <img className="gh-portal-signup-logo" src={siteLogo} alt={site.title} />;
    }

    renderFormHeader() {
        const siteTitle = this.context.site?.title || '';
        return (
            <header className="gh-portal-signup-header">
                {this.renderSiteLogo()}
                <h2 className="gh-portal-main-title">{siteTitle}</h2>
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

        const fields = this.getInputFields({state: this.state});
        return (
            <section>
                <div className="gh-portal-section">
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
        let label = t('Continue');
        if (offer?.type === 'trial') {
            label = t('Start {amount}-day free trial', {amount: offer.amount});
        }
        let isRunning = false;
        let retry = false;
        if (action === 'signup:running') {
            label = t('Sending...');
            isRunning = true;
        } else if (action === 'signup:failed') {
            label = t('Retry');
            retry = true;
        }

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
                classes="sticky bottom"
            />
        );
    }

    renderLoginMessage() {
        if (this.context.member) {
            return null;
        }
        const {brandColor, doAction} = this.context;
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

    renderOfferTag() {
        const {pageData: offer} = this.context;
        if (!offer || offer.amount <= 0) {
            return <></>;
        }

        if (offer.type === 'fixed') {
            return (
                <h5 className="gh-portal-discount-label">
                    {t('{amount} off', {
                        amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`
                    })}
                </h5>
            );
        }

        if (offer.type === 'trial') {
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

    renderBenefits({product}) {
        const benefits = product.benefits ?? [];
        if (!benefits.length) {
            return null;
        }
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
    }

    getOriginalPrice({offer, product}) {
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const originalAmount = this.renderRoundedPrice(price.amount / 100);
        return `${getCurrencySymbol(price.currency)}${originalAmount}/${offer.cadence}`;
    }

    getUpdatedPrice({offer, product}) {
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

    renderRoundedPrice(price) {
        if (price % 1 !== 0) {
            const rounded = Math.round(price * 100) / 100;
            return Number(rounded).toFixed(2);
        }
        return price;
    }

    getOffAmount({offer}) {
        if (offer.type === 'fixed') {
            return `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`;
        }
        if (offer.type === 'percent') {
            return `${offer.amount}%`;
        }
        if (offer.type === 'trial') {
            return offer.amount;
        }
        return '';
    }

    renderOfferMessage({offer, product}) {
        const originalPrice = this.getOriginalPrice({offer, product});
        const renewsLabel = t('Renews at {price}.', {
            price: originalPrice,
            interpolation: {escapeValue: false}
        });

        const offerLabel = this._buildOfferLabel({offer, renewsLabel});
        if (offer.type === 'trial') {
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
        return <p className="footnote">{offerLabel}</p>;
    }

    _buildOfferLabel({offer, renewsLabel}) {
        const messages = {
            forever: t('{amount} off forever.', {
                amount: this.getOffAmount({offer})
            }),
            firstPeriod: t('{amount} off for first {period}.', {
                amount: this.getOffAmount({offer}),
                period: offer.cadence
            }),
            firstNMonths: t('{amount} off for first {number} months.', {
                amount: this.getOffAmount({offer}),
                number: offer.duration_in_months || ''
            })
        };

        const duration = offer.duration;
        if (duration === 'once') {
            return `${messages.firstPeriod} ${renewsLabel}`;
        }
        if (duration === 'forever') {
            return messages.forever;
        }
        if (duration === 'repeating') {
            const months = offer.duration_in_months;
            const label = months === 1 ? messages.firstPeriod : messages.firstNMonths;
            return `${label} ${renewsLabel}`;
        }
        return '';
    }

    renderProductLabel({product, offer}) {
        const {site} = this.context;
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

    renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price}) {
        const priceContainerClass = offer.type === 'trial' ? 'offer-type-trial' : '';
        return (
            <div className={`gh-portal-product-card-pricecontainer ${priceContainerClass}`}>
                <div className="gh-portal-product-price">
                    <span className={`currency-sign ${currencyClass}`}>{getCurrencySymbol(price.currency)}</span>
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
            <div className="gh-portal-offer-oldprice">
                {getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}
            </div>
        );
    }

    renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits}) {
        if (this.state.showNewsletterSelection) {
            return null;
        }

        return (
            <>
                <div className="gh-portal-product-card top">
                    <div className="gh-portal-product-card-header">
                        <h4 className="gh-portal-product-name">
                            {product.name} - {offer.cadence === 'month' ? t('Monthly') : t('Yearly')}
                        </h4>
                        {this.renderOldTierPrice({offer, price})}
                        {this.renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price})}
                        {this.renderOfferMessage({offer, product, price})}
                    </div>
                </div>

                <div>
                    <div className="gh-portal-product-card bottom">
                        <div className="gh-portal-product-card-detaildata">
                            {product.description && (
                                <div className="gh-portal-product-description">{product.description}</div>
                            )}
                            {benefits.length > 0 && this.renderBenefits({product})}
                        </div>
                    </div>

                    <div className="gh-portal-btn-container sticky m32">
                        <div className="gh-portal-signup-terms-wrapper">{this.renderSignupTerms()}</div>
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

        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const updatedPrice = this.getUpdatedPrice({offer, product});
        const benefits = product.benefits ?? [];
        const currencyClass = getCurrencySymbol(price.currency).length > 1 ? 'long' : '';

        return (
            <>
                <div className="gh-portal-content gh-portal-offer">
                    <CloseButton />
                    {this.renderFormHeader()}

                    <div className="gh-portal-offer-bar">
                        <div className="gh-portal-offer-title">
                            {offer.display_title ? (
                                <h4>{offer.display_title}</h4>
                            ) : (
                                <h4 className="placeholder">{t('Black Friday')}</h4>
                            )}
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