```javascript
import React, {useContext, useState} from 'react';
import PropTypes from 'prop-types';
import AppContext from '../../app-context';
import ActionButton from '../common/action-button';
import CloseButton from '../common/close-button';
import BackButton from '../common/back-button';
import {MultipleProductsPlansSection} from '../common/plans-section';
import {getDateString} from '../../utils/date-time';
import {formatNumber, getAvailablePrices, getCurrencySymbol, getFilteredPrices, getMemberActivePrice, getMemberActiveProduct, getMemberSubscription, getOfferOffAmount, getPriceFromSubscription, getProductFromId, getProductFromPrice, getSubscriptionFromId, getUpdatedOfferPrice, getUpgradeProducts, hasMultipleProductsFeature, isComplimentaryMember, isPaidMember} from '../../utils/helpers';
import Interpolate from '@doist/react-interpolate';
import {t} from '../../utils/i18n';

export const AccountPlanPageStyles = `
    .account-plan.full-size .gh-portal-main-title {
        font-size: 3.2rem;
        margin-top: 44px;
    }

    .gh-portal-accountplans-main {
        margin-top: 24px;
        margin-bottom: 0;
    }

    .gh-portal-expire-container {
        margin: 32px 0 0;
    }

    .gh-portal-cancellation-form p {
        margin-bottom: 12px;
    }

    .gh-portal-cancellation-form .gh-portal-input-section {
        margin-bottom: 20px;
    }

    .gh-portal-cancellation-form .gh-portal-input {
        resize: none;
        width: 100%;
        height: 62px;
        padding: 6px 12px;
    }

    .gh-portal-retention-offer-price {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 20px;
    }

    .gh-portal-retention-offer-price .gh-portal-offer-oldprice {
        margin: 4px 0 0;
    }
`;

function getConfirmationPageTitle({confirmationType}) {
    if (confirmationType === 'changePlan') {
        return t('Confirm subscription');
    } else if (confirmationType === 'cancel') {
        return t('Cancel subscription');
    } else if (confirmationType === 'subscribe') {
        return t('Subscribe');
    } else if (confirmationType === 'offerRetention') {
        return 'Before you go';
    }
}

const Header = ({showConfirmation, confirmationType}) => {
    const {member} = useContext(AppContext);
    let title = isPaidMember({member}) ? t('Change plan') : t('Choose a plan');
    if (showConfirmation) {
        title = getConfirmationPageTitle({confirmationType});
    }
    return (
        <header className='gh-portal-detail-header'>
            <h3 className='gh-portal-main-title'>{title}</h3>
        </header>
    );
};

const CancelSubscriptionButton = ({member, onCancelSubscription, action, brandColor}) => {
    const {site} = useContext(AppContext);
    if (!member.paid) {
        return null;
    }
    const subscription = getMemberSubscription({member});
    if (!subscription) {
        return null;
    }

    // Hide the button if subscription is due cancellation
    if (subscription.cancel_at_period_end) {
        return null;
    }
    const label = t('Cancel subscription');
    const isRunning = ['cancelSubscription:running'].includes(action);
    const disabled = (isRunning) ? true : false;
    const isPrimary = !!subscription.cancel_at_period_end;
    const isDestructive = !subscription.cancelAtPeriodEnd;

    return (
        <div className="gh-portal-expire-container">
            <ActionButton
                dataTestId={'cancel-subscription'}
                onClick={() => {
                    onCancelSubscription({
                        subscriptionId: subscription.id,
                        cancelAtPeriodEnd: true
                    });
                }}
                isRunning={isRunning}
                disabled={disabled}
                isPrimary={isPrimary}
                isDestructive={isDestructive}
                classes={hasMultipleProductsFeature({site}) ? 'gh-portal-btn-text mt2 mb4' : ''}
                brandColor={brandColor}
                label={label}
                style={{
                    width: '100%'
                }}
            />
        </div>
    );
};

// For confirmation flows
const PlanConfirmationSection = ({plan, type, onConfirm}) => {
    const {site, action, member, brandColor} = useContext(AppContext);
    const [reason, setReason] = useState('');
    const subscription = getMemberSubscription({member});
    const isRunning = ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'].includes(action);
    const label = t('Confirm');
    const planStartDate = getDateString(subscription.current_period_end);
    const currentActivePlan = getMemberActivePrice({member});
    let planStartingMessage = t('Starting {startDate}', {startDate: planStartDate});
    if (currentActivePlan.id !== plan.id) {
        planStartingMessage = t('Starting today');
    }
    const priceString = formatNumber(plan.price);
    const planStartMessage = `${plan.currency_symbol}${priceString}/${t(plan.interval)} – ${planStartingMessage}`;
    const product = getProductFromPrice({site, priceId: plan?.id});
    const priceLabel = hasMultipleProductsFeature({site}) ? product?.name : t('Price');
    if (type === 'changePlan') {
        return (
            <div className='gh-portal-logged-out-form-container'>
                <div className='gh-portal-list mb6'>
                    <section>
                        <div className='gh-portal-list-detail'>
                            <h3>{t('Account')}</h3>
                            <p>{member.email}</p>
                        </div>
                    </section>
                    <section>
                        <div className='gh-portal-list-detail'>
                            <h3>{priceLabel}</h3>
                            <p>{planStartMessage}</p>
                        </div>
                    </section>
                </div>
                <ActionButton
                    dataTestId={'confirm-action'}
                    onClick={e => onConfirm(e, plan)}
                    isRunning={isRunning}
                    isPrimary={true}
                    brandColor={brandColor}
                    label={label}
                    style={{
                        width: '100%',
                        height: '40px'
                    }}
                />
            </div>
        );
    } else {
        return (
            <div className="gh-portal-logged-out-form-container gh-portal-cancellation-form">
                <p>
                    <Interpolate
                        string={t(`If you cancel your subscription now, you will continue to have access until {periodEnd}.`)}
                        mapping={{
                            periodEnd: <strong>{getDateString(subscription.current_period_end)}</strong>
                        }}
                    />
                </p>
                <section className='gh-portal-input-section'>
                    <div className='gh-portal-input-labelcontainer'>
                        <label className='gh-portal-input-label'>{t('Cancellation reason')}</label>
                    </div>
                    <textarea
                        data-test-input='cancellation-reason'
                        className='gh-portal-input'
                        key='cancellation_reason'
                        label='Cancellation reason'
                        type='text'
                        name='cancellation_reason'
                        placeholder=''
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        rows="2"
                        maxLength="500"
                    />
                </section>
                <ActionButton
                    dataTestId={'confirm-cancel-subscription'}
                    onClick={e => onConfirm(e, reason)}
                    isRunning={isRunning}
                    isPrimary={true}
                    brandColor={brandColor}
                    label={t('Confirm cancellation')}
                    style={{
                        width: '100%',
                        height: '40px'
                    }}
                />
            </div>
        );
    }
};

// For paid members
const ChangePlanSection = ({plans, selectedPlan, onPlanSelect, onCancelSubscription}) => {
    const {member, action, brandColor} = useContext(AppContext);
    return (
        <section>
            <div className='gh-portal-section gh-portal-accountplans-main'>
                <PlansOrProductSection
                    showLabel={false}
                    plans={plans}
                    selectedPlan={selectedPlan}
                    onPlanSelect={onPlanSelect}
                    changePlan={true}
                />
            </div>
            <CancelSubscriptionButton {...{member, onCancelSubscription, action, brandColor}} />
        </section>
    );
};

function PlansOrProductSection({selectedPlan, onPlanSelect, onPlanCheckout, changePlan = false}) {
    const {site, member} = useContext(AppContext);
    const products = getUpgradeProducts({site, member});
    const isComplimentary = isComplimentaryMember({member});
    const activeProduct = getMemberActiveProduct({member, site});
    return (
        <MultipleProductsPlansSection
            products={products.length > 0 || isComplimentary || !activeProduct ? products : [activeProduct]}
            selectedPlan={selectedPlan}
            changePlan={changePlan}
            onPlanSelect={onPlanSelect}
            onPlanCheckout={onPlanCheckout}
        />
    );
}

// TODO: Add i18n once copy is finalized
function getOfferMessage(offer, originalPrice, currency, amountOff) {
    if (offer.type === 'free_months') {
        const months = offer.amount;
        const monthLabel = months === 1 ? '1 month' : `${months} months`;
        const dayLabel = months * 30;

        return `Enjoy ${monthLabel} on us. Your next billing date will be pushed back by ${dayLabel} days.`;
    }

    if (offer.duration === 'forever') {
        return `Enjoy ${amountOff} off forever.`;
    }

    if (offer.duration === 'once') {
        return `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${offer.cadence}.`;
    }

    if (offer.duration === 'repeating' && offer.duration_in_months === 1) {
        return `Save ${amountOff} on your next billing cycle. Then ${currency}${originalPrice}/${offer.cadence}.`;
    }

    if (offer.duration === 'repeating' && offer.duration_in_months > 1) {
        return `Save ${amountOff} on your next ${offer.duration_in_months} billing cycles. Then ${currency}${originalPrice}/${offer.cadence}.`;
    }

    return '';
}

const RetentionOfferSection = ({offer, product, price, onAcceptOffer, onDeclineOffer}) => {
    const {brandColor, action} = useContext(AppContext);
    const isAcceptingOffer = action === 'applyOffer:running';

    const originalPrice = formatNumber(price.amount / 100);
    const currency = getCurrencySymbol(price.currency);
    const discountedPrice = formatNumber(getUpdatedOfferPrice({offer, price}));
    const amountOff = getOfferOffAmount({offer});
    const discountText = offer.type === 'free_months' ? `${amountOff} free` : `${amountOff} off`;

    const offerMessage = getOfferMessage(offer, originalPrice, currency, amountOff);

    // TODO: Add i18n once copy is finalized
    return (
        <div className="gh-portal-logged-out-form-container gh-portal-offer gh-portal-retention-offer">
            <p className="gh-portal-text-center">
                {'We\'d hate to see you go! How about a special offer to stay?'}
            </p>

            <div className="gh-portal-offer-bar">
                <div className="gh-portal-offer-title">
                    <h4>{product.name} - {offer.cadence === 'month' ? 'Monthly' : 'Yearly'}</h4>
                    <h5 className="gh-portal-discount-label">{discountText}</h5>
                </div>

                <div className="gh-portal-offer-details">
                    <div className="gh-portal-retention-offer-price">
                        {!(offer.type === 'free_months') && (
                            <>
                                <div className="gh-portal-product-price">
                                    <span className="currency-sign">{currency}</span>
                                    <span className="amount">{discountedPrice}</span>
                                </div>
                                <div className="gh-portal-offer-oldprice">
                                    {currency}{originalPrice}
                                </div>
                            </>
                        )}
                    </div>
                    <p className="footnote">
                        {offerMessage}
                    </p>
                </div>

                <ActionButton
                    dataTestId={'accept-retention-offer'}
                    onClick={onAcceptOffer}
                    isRunning={isAcceptingOffer}
                    disabled={isAcceptingOffer}
                    isPrimary={true}
                    brandColor={brandColor}
                    label="Accept offer"
                    style={{
                        width: '100%',
                        height: '40px',
                        marginTop: '28px'
                    }}
                />
            </div>

            <ActionButton
                dataTestId={'decline-retention-offer'}
                onClick={onDeclineOffer}
                isPrimary={false}
                isDestructive={true}
                classes={'gh-portal-btn-text'}
                brandColor={brandColor}
                label="No thanks, I want to cancel"
                style={{
                    width: '100%',
                    marginTop: '32px',
                    marginBottom: '24px'
                }}
            />
        </div>
    );
    /* eslint-enable i18next/no-literal-strings */
};

RetentionOfferSection.propTypes = {
    offer: PropTypes.shape({
        type: PropTypes.string.isRequired,
        cadence: PropTypes.string.isRequired,
        duration: PropTypes.string,
        duration_in_months: PropTypes.number,
        amount: PropTypes.number
    }).isRequired,
    product: PropTypes.shape({
        name: PropTypes.string.isRequired
    }).isRequired,
    price: PropTypes.shape({
        amount: PropTypes.number.isRequired,
        currency: PropTypes.string.isRequired
    }).isRequired,
    onAcceptOffer: PropTypes.func.isRequired,
    onDeclineOffer: PropTypes.func.isRequired
};

// For free members
const UpgradePlanSection = ({
    plans, selectedPlan, onPlanSelect, onPlanCheckout
}) => {
    // const {action, brandColor} = useContext(AppContext);
    // const isRunning = ['checkoutPlan:running'].includes(action);
    let singlePlanClass = '';
    if (plans.length === 1) {
        singlePlanClass = 'singleplan';
    }
    return (
        <section>
            <div className={`gh-portal-section gh-portal-accountplans-main ${singlePlanClass}`}>
                <PlansOrProductSection
                    showLabel={false}
                    plans={plans}
                    selectedPlan={