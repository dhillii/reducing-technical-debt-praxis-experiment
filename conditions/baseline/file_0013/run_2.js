# Refactored AccountPlanPage

Here's the refactored code with improved structure, reduced complexity, and better separation of concerns:

```jsx
import React, {useCallback, useContext, useState} from 'react';
import AppContext from '../../app-context';
import ActionButton from '../common/action-button';
import CloseButton from '../common/close-button';
import BackButton from '../common/back-button';
import {MultipleProductsPlansSection} from '../common/plans-section';
import {getDateString} from '../../utils/date-time';
import {
    formatNumber,
    getAvailablePrices,
    getCurrencySymbol,
    getFilteredPrices,
    getMemberActivePrice,
    getMemberActiveProduct,
    getMemberSubscription,
    getOfferOffAmount,
    getPriceFromSubscription,
    getProductFromId,
    getProductFromPrice,
    getSubscriptionFromId,
    getUpdatedOfferPrice,
    getUpgradeProducts,
    hasMultipleProductsFeature,
    isComplimentaryMember,
    isPaidMember
} from '../../utils/helpers';
import Interpolate from '@doist/react-interpolate';
import {t} from '../../utils/i18n';

// ─── Styles ──────────────────────────────────────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────────────────────────

const CONFIRMATION_TITLES = {
    changePlan: () => t('Confirm subscription'),
    cancel: () => t('Cancel subscription'),
    subscribe: () => t('Subscribe'),
    offerRetention: () => 'Before you go'
};

const RUNNING_ACTIONS = {
    update: ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'],
    cancel: ['cancelSubscription:running'],
    applyOffer: ['applyOffer:running']
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getConfirmationPageTitle({confirmationType}) {
    return CONFIRMATION_TITLES[confirmationType]?.() ?? '';
}

// TODO: Add i18n once copy is finalized
function getOfferMessage(offer, originalPrice, currency, amountOff) {
    const {type, duration, amount, duration_in_months: durationInMonths, cadence} = offer;

    if (type === 'free_months') {
        const monthLabel = amount === 1 ? '1 month' : `${amount} months`;
        return `Enjoy ${monthLabel} on us. Your next billing date will be pushed back by ${amount * 30} days.`;
    }

    const suffix = `Then ${currency}${originalPrice}/${cadence}.`;

    if (duration === 'forever') {
        return `Enjoy ${amountOff} off forever.`;
    }
    if (duration === 'once' || (duration === 'repeating' && durationInMonths === 1)) {
        return `Save ${amountOff} on your next billing cycle. ${suffix}`;
    }
    if (duration === 'repeating' && durationInMonths > 1) {
        return `Save ${amountOff} on your next ${durationInMonths} billing cycles. ${suffix}`;
    }

    return '';
}

function useInitialPrices(member, site) {
    const prices = getAvailablePrices({site});
    const activePrice = getMemberActivePrice({member});
    const filteredPrices = activePrice
        ? getFilteredPrices({prices, currency: activePrice.currency})
        : prices;

    const selectedPrice = activePrice
        ? filteredPrices.find(d => d.id === activePrice.id)
        : (!isPaidMember({member}) && filteredPrices.length > 0 ? filteredPrices[0] : null);

    return {prices: filteredPrices, selectedPriceId: selectedPrice?.id ?? null};
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Header = ({showConfirmation, confirmationType}) => {
    const {member} = useContext(AppContext);
    const defaultTitle = isPaidMember({member}) ? t('Change plan') : t('Choose a plan');
    const title = showConfirmation ? getConfirmationPageTitle({confirmationType}) : defaultTitle;

    return (
        <header className='gh-portal-detail-header'>
            <h3 className='gh-portal-main-title'>{title}</h3>
        </header>
    );
};

const CancelSubscriptionButton = ({member, onCancelSubscription, action, brandColor}) => {
    const {site} = useContext(AppContext);
    const subscription = getMemberSubscription({member});

    if (!member.paid || !subscription || subscription.cancel_at_period_end) {
        return null;
    }

    const isRunning = RUNNING_ACTIONS.cancel.includes(action);

    return (
        <div className='gh-portal-expire-container'>
            <ActionButton
                dataTestId='cancel-subscription'
                onClick={() => onCancelSubscription({
                    subscriptionId: subscription.id,
                    cancelAtPeriodEnd: true
                })}
                isRunning={isRunning}
                disabled={isRunning}
                isPrimary={!!subscription.cancel_at_period_end}
                isDestructive={!subscription.cancelAtPeriodEnd}
                classes={hasMultipleProductsFeature({site}) ? 'gh-portal-btn-text mt2 mb4' : ''}
                brandColor={brandColor}
                label={t('Cancel subscription')}
                style={{width: '100%'}}
            />
        </div>
    );
};

const ChangePlanConfirmation = ({plan, onConfirm}) => {
    const {site, action, member, brandColor} = useContext(AppContext);
    const subscription = getMemberSubscription({member});
    const isRunning = RUNNING_ACTIONS.update.includes(action);

    const planStartDate = getDateString(subscription.current_period_end);
    const currentActivePlan = getMemberActivePrice({member});
    const planStartingMessage = currentActivePlan.id !== plan.id
        ? t('Starting today')
        : t('Starting {startDate}', {startDate: planStartDate});

    const priceString = formatNumber(plan.price);
    const planStartMessage = `${plan.currency_symbol}${priceString}/${t(plan.interval)} – ${planStartingMessage}`;
    const product = getProductFromPrice({site, priceId: plan?.id});
    const priceLabel = hasMultipleProductsFeature({site}) ? product?.name : t('Price');

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
                dataTestId='confirm-action'
                onClick={e => onConfirm(e, plan)}
                isRunning={isRunning}
                isPrimary={true}
                brandColor={brandColor}
                label={t('Confirm')}
                style={{width: '100%', height: '40px'}}
            />
        </div>
    );
};

const CancelConfirmation = ({onConfirm}) => {
    const {action, member, brandColor} = useContext(AppContext);
    const [reason, setReason] = useState('');
    const subscription = getMemberSubscription({member});
    const isRunning = RUNNING_ACTIONS.update.includes(action);

    return (
        <div className='gh-portal-logged-out-form-container gh-portal-cancellation-form'>
            <p>
                <Interpolate
                    string={t('If you cancel your subscription now, you will continue to have access until {periodEnd}.')}
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
                    rows='2'
                    maxLength='500'
                />
            </section>
            <ActionButton
                dataTestId='confirm-cancel-subscription'
                onClick={e => onConfirm(e, reason)}
                isRunning={isRunning}
                isPrimary={true}
                brandColor={brandColor}
                label={t('Confirm cancellation')}
                style={{width: '100%', height: '40px'}}
            />
        </div>
    );
};

// Unified confirmation section — delegates to the appropriate sub-form
const PlanConfirmationSection = ({plan, type, onConfirm}) => {
    if (type === 'changePlan') {
        return <ChangePlanConfirmation plan={plan} onConfirm={onConfirm} />;
    }
    return <CancelConfirmation onConfirm={onConfirm} />;
};

const RetentionOfferPriceDisplay = ({offer, currency, discountedPrice, originalPrice}) => {
    if (offer.type === 'free_months') {
        return null;
    }
    return (
        <div className='gh-portal-retention-offer-price'>
            <div className='gh-portal-product-price'>
                <span className='currency-sign'>{currency}</span>
                <span className='amount'>{discountedPrice}</span>
            </div>
            <div className='gh-portal-offer-oldprice'>
                {currency}{originalPrice}
            </div>
        </div>
    );
};

const RetentionOfferSection = ({offer, product, price, onAcceptOffer, onDeclineOffer}) => {
    const {brandColor, action} = useContext(AppContext);
    const isAcceptingOffer = action === 'applyOffer:running';

    const originalPrice = formatNumber(price.amount / 100);
    const currency = getCurrencySymbol(price.currency);
    const discountedPrice = formatNumber(getUpdatedOfferPrice({offer, price}));
    const amountOff = getOfferOffAmount({offer});
    const discountText = offer.type === 'free_months' ? `${amountOff} free` : `${amountOff} off`;
    const offerMessage = getOfferMessage(offer, originalPrice, currency, amountOff);
    const cadenceLabel = offer.cadence === 'month' ? 'Monthly' : 'Yearly';

    return (
        <div className='gh-portal-logged-out-form-container gh-portal-offer gh-portal-retention-offer'>
            <p className='gh-portal-text-center'>
                {'We\'d hate to see you go! How about a special offer to stay?'}
            </p>
            <div className='gh-portal-offer-bar'>
                <div className='gh-portal-offer-title'>
                    <h4>{product.name} - {cadenceLabel}</h4>
                    <h5 className='gh-portal-discount-label'>{discountText}</h5>
                </div>
                <div className='gh-portal-offer-details'>
                    <RetentionOfferPriceDisplay
                        offer={offer}
                        currency={currency}
                        discountedPrice={discountedPrice}
                        originalPrice={originalPrice}
                    />
                    <p className='footnote'>{offerMessage}</p>
                </div>
                <ActionButton
                    dataTestId='accept-retention-offer'
                    onClick={onAcceptOffer}
                    isRunning={isAcceptingOffer}
                    disabled={isAcceptingOffer}
                    isPrimary={true}
                    brandColor={brandColor}
                    label='Accept offer'
                    style={{width: '100%', height: '40px', marginTop: '28px'}}
                />
            </div>
            <ActionButton
                dataTestId='decline-retention-offer'
                onClick={onDeclineOffer}
                isPrimary={false}
                isDestructive={true}
                classes='gh-portal-btn-text'
                brandColor={brandColor}
                label='No thanks, I want to cancel'
                style={{width: '100%', marginTop: '32px', marginBottom: '24px'}}
            />
        </div>
    );
};

function PlansOrProductSection({selectedPlan, onPlanSelect, onPlanCheckout, changePlan = false}) {
    const {site, member} = useContext(AppContext);
    const products = getUpgradeProducts({site, member});
    const isComplimentary = isComplimentaryMember({member});
    const activeProduct = getMemberActiveProduct({member, site});
    const displayProducts = products.length > 0 || isComplimentary || !activeProduct
        ? products
        : [activeProduct];

    return (
        <MultipleProductsPlansSection
            products={displayProducts}
            selectedPlan={selectedPlan}
            changePlan={changePlan}
            onPlanSelect={onPlanSelect}
            onPlanCheckout={onPlanCheckout}
        />
    );
}

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

const UpgradePlanSection = ({plans, selectedPlan, onPlanSelect, onPlanCheckout}) => {
    const singlePlanClass = plans.length === 1 ? 'singleplan' : '';
    return (
        <section>
            <div className={`gh-portal-section gh-portal-accountplans-main ${singlePlanClass}`}>
                <PlansOrProductSection
                    showLabel={false}
                    plans={plans}
                    selectedPlan={selectedPlan}
                    onPlanSelect={onPlanSelect}
                    onPlanCheckout={onPlanCheckout}
                />
            </div>
        </section>
    );
};

// ─── PlansContainer ───────────────────────────────────────────────────────────

function resolveRetentionOfferData(pendingOffer, member, site) {
    const offerProduct = pendingOffer.tier
        ? getProductFromId({site, productId: pendingOffer.tier.id})
        : getMemberActiveProduct({member, site});
    const offerPrice = pendingOffer.cadence === 'month'
        ? offerProduct?.monthlyPrice
        : offerProduct?.yearlyPrice;

    return {offerProduct, offerPrice};
}

const PlansContainer = ({
    plans, selectedPlan, confirmationPlan, confirmationType, showConfirmation = false,
    pendingOffer, onPlanSelect, onPlanCheckout, onConfirm, onCancelSubscription,
    onAcceptRetentionOffer, onDeclineRetentionOffer
}) => {
    const {member, site} = useContext(AppContext);
    const isFreeMember = !isPaidMember({member}) || isComplimentaryMember({member});

    if (isFreeMember) {
        return (
            <UpgradePlanSection {...{plans, selectedPlan, onPlanSelect, onPlanCheckout}} />
        );
    }

    if (!showConfirmation) {
        return (
            <ChangePlanSection {...{plans, selectedPlan, onCancelSubscription, onPlanSelect}} />
        );
    }

    if (confirmationType === 'offerRetention' && pendingOffer) {
        const {offerProduct, offerPrice} = resolveRetentionOfferData(pendingOffer, member, site);
        if (offerProduct && offerPrice) {
            return (
                <RetentionOfferSection
                    offer={pendingOffer}
                    product={offerProduct}
                    price={offerPrice}
                    onAcceptOffer={onAcceptRetentionOffer}
                    onDeclineOffer={onDeclineRetentionOffer}
                />
            );
        }
    }

    return (
        <PlanConfirmationSection
            plan={confirmationPlan}
            type={confirmationType}
            onConfirm={onConfirm}
        />
    );
};

// ─── AccountPlanPage (converted to functional component) ──────────────────────

export default function AccountPlanPage() {
    const context = useContext(AppContext);
    const {member, site, lastPage, offers, doAction, pageData} = context;

    const {prices, selectedPriceId} = useInitialPrices(member, site);

    const [selectedPlan, setSelectedPlan] = useState(selectedPriceId);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [confirmationPlan, setConfirmationPlan] = useState(null);
    const [confirmationType, setConfirmationType] = useState(null);
    const [pendingOffer, setPendingOffer] = useState(null);
    const [targetSubscriptionId, setTargetSubscriptionId] = useState(null);

    // Redirect if not logged in
    React.useEffect(() => {
        if (!member) {
            doAction('switchPage', {page: 'signin'});
        }
    }, [member, doAction]);

    // Handle cancel action from pageData
    React.useEffect(() => {
        if (pageData?.action === 'cancel' && pageData?.subscriptionId) {
            onCancelSubscription({subscriptionId: pageData.subscriptionId});
            pageData.action = null;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cancelConfirmPage = useCallback(() => {
        setShowConfirmation(false);
        setConfirmationPlan(null);
        setConfirmationType(null);
        setPendingOffer(null);
        setTargetSubscriptionId(null);
    }, []);

    const onBack = useCallback(() => {
        if (showConfirmation) {
            cancelConfirmPage();
        } else {
            doAction('back');
        }
    }, [showConfirmation, cancelConfirmPage, doAction]);

    const onPlanCheckout = useCallback((e, priceId) => {
        const resolvedPlan = priceId ?? selectedPlan;

        if (isPaidMember({member}) && !isComplimentaryMember({member})) {
            const subscription = getMemberSubscription({member});
            const subscriptionId = subscription?.id;
            if (subscriptionId && confirmationPlan) {
                doAction('updateSubscription', {
                    plan: confirmationPlan.name,
                    planId: confirmationPlan.id,
                    subscriptionId,
                    cancelAtPeriodEnd: false
                });
            }
        } else {
            doAction('checkoutPlan', {plan: resolvedPlan});
        }
    }, [member, selectedPlan, confirmationPlan, doAction]);

    const onPlanSelect = useCallback((e, priceId) => {
        e?.preventDefault();

        if (!isPaidMember({member}) || isComplimentaryMember({member})) {
            setTimeout(() => setSelectedPlan(priceId), 5);
            return;
        }

        const confirmationPrice = prices.find(d => d.id === priceId);
        const activePrice = getMemberActivePrice({member});
        const type = activePrice ? 'changePlan' : 'subscribe';

        if (priceId !== selectedPlan) {
            setConfirmationPlan(confirmationPrice);
            setConfirmationType(type);
            setShowConfirmation(true);
        }
    }, [member, prices, selectedPlan]);

    const onCancelSubscription = useCallback(({subscriptionId}) => {
        const subscription = getSubscriptionFromId({subscriptionId, member});
        if (!subscription) {
            return;
        }

        const subscriptionPlan = getPriceFromSubscription({subscription});
        const retentionOffers = (offers || []).filter(o => o.redemption_type === 'retention');

        setShowConfirmation(true);
        setConfirmationPlan(subscriptionPlan);
        setTargetSubscriptionId(subscriptionId);

        if (retentionOffers.length > 0) {
            setConfirmationType('offerRetention');
            setPendingOffer(retentionOffers[0]);
        } else {
            setConfirmationType('cancel');
            setPendingOffer(null);
        }
    }, [member, offers]);

    const onAcceptRetentionOffer = useCallback(() => {
        if (!targetSubscriptionId || !pendingOffer) {
            return;
        }
        doAction('applyOffer', {subscriptionId: targetSubscriptionId, offerId: pendingOffer.id});
    }, [targetSubscriptionId, pendingOffer, doAction]);

    const onDeclineRetentionOffer = useCallback(() => {
        setConfirmationType('cancel');
        setPendingOffer(null);
    }, []);

    const onConfirm = useCallback((e, data) => {
        if (confirmationType === 'cancel') {
            if (!targetSubscriptionId) {
                return;
            }
            doAction('cancelSubscription', {
                subscriptionId: targetSubscriptionId,
                cancelAtPeriodEnd: true,
                cancellationReason: data
            });
        } else if (['changePlan', 'subscribe'].includes(confirmationType)) {
            onPlanCheckout();
        }
    }, [confirmationType, targetSubscriptionId, doAction, onPlanCheckout]);

    return (
        <div className='gh-portal-content'>
            <BackButton onClick={onBack} hidden={!lastPage && !showConfirmation} />
            <CloseButton />
            <Header confirmationType={confirmationType} showConfirmation={showConfirmation} />
            <PlansContainer
                plans={prices}
                selectedPlan={selectedPlan}
                showConfirmation={showConfirmation}
                confirmationPlan={confirmationPlan}
                confirmationType={confirmationType}
                pendingOffer={pendingOffer}
                onConfirm={onConfirm}
                onCancelSubscription={onCancelSubscription}
                onAcceptRetentionOffer={onAcceptRetentionOffer}
                onDeclineRetentionOffer={onDeclineRetentionOffer}
                onPlanSelect={onPlanSelect}
                onPlanCheckout={onPlanCheckout}
            />
        </div>
    );
}
```

---

## Key Changes

### Architecture
| Before | After |
|---|---|
| Class component with `this` binding | Functional component with hooks |
| Mixed state initialization in constructor | `useInitialPrices` custom hook |
| Monolithic `PlanConfirmationSection` | Split into `ChangePlanConfirmation` + `CancelConfirmation` |

### Complexity Reductions
1. **`getConfirmationPageTitle`** — replaced `if/else` chain with a lookup map (`CONFIRMATION_TITLES`)
2. **`getOfferMessage`** — destructured `offer` at the top, extracted shared `suffix` string to eliminate repetition
3. **`CancelSubscriptionButton`** — merged guard clauses into a single early return
4. **`PlanConfirmationSection`** — delegated to focused sub-components instead of a large `if/else` block
5. **`RetentionOfferSection`** — extracted `RetentionOfferPriceDisplay` to remove inline conditional rendering noise
6. **`PlansOrProductSection`** — extracted ternary into a named `displayProducts` variable
7. **`resolveRetentionOfferData`** — extracted from `PlansContainer` to keep the render logic readable
8. **Running action arrays** — centralized into `RUNNING_ACTIONS` constant to avoid magic strings scattered across components