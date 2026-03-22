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
    planUpdate: ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running'],
    cancelSubscription: ['cancelSubscription:running'],
    applyOffer: ['applyOffer:running']
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getConfirmationPageTitle({confirmationType}) {
    return CONFIRMATION_TITLES[confirmationType]?.() ?? '';
}

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

function useIsActionRunning(actions) {
    const {action} = useContext(AppContext);
    return actions.includes(action);
}

function initializePrices({member, site}) {
    let prices = getAvailablePrices({site});
    const activePrice = getMemberActivePrice({member});

    if (activePrice) {
        prices = getFilteredPrices({prices, currency: activePrice.currency});
    }

    const selectedPrice = activePrice
        ? prices.find(p => p.id === activePrice.id)
        : (!isPaidMember({member}) && prices.length > 0 ? prices[0] : null);

    return {prices, selectedPriceId: selectedPrice?.id ?? null};
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

const CancelSubscriptionButton = ({onCancelSubscription}) => {
    const {member, action, brandColor, site} = useContext(AppContext);

    if (!member.paid) {
        return null;
    }

    const subscription = getMemberSubscription({member});
    if (!subscription || subscription.cancel_at_period_end) {
        return null;
    }

    const isRunning = RUNNING_ACTIONS.cancelSubscription.includes(action);

    return (
        <div className='gh-portal-expire-container'>
            <ActionButton
                dataTestId='cancel-subscription'
                onClick={() => onCancelSubscription({subscriptionId: subscription.id})}
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
    const isRunning = useIsActionRunning(RUNNING_ACTIONS.planUpdate);
    const subscription = getMemberSubscription({member});
    const currentActivePlan = getMemberActivePrice({member});

    const planStartDate = getDateString(subscription.current_period_end);
    const startingMessage = currentActivePlan.id !== plan.id
        ? t('Starting today')
        : t('Starting {startDate}', {startDate: planStartDate});

    const priceString = formatNumber(plan.price);
    const planStartMessage = `${plan.currency_symbol}${priceString}/${t(plan.interval)} – ${startingMessage}`;
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
    const {member, brandColor} = useContext(AppContext);
    const [reason, setReason] = useState('');
    const isRunning = useIsActionRunning(RUNNING_ACTIONS.planUpdate);
    const subscription = getMemberSubscription({member});

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

const PlanConfirmationSection = ({plan, type, onConfirm}) => {
    if (type === 'changePlan') {
        return <ChangePlanConfirmation plan={plan} onConfirm={onConfirm} />;
    }
    return <CancelConfirmation onConfirm={onConfirm} />;
};

const PlansOrProductSection = ({selectedPlan, onPlanSelect, onPlanCheckout, changePlan = false}) => {
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
};

const ChangePlanSection = ({plans, selectedPlan, onPlanSelect, onCancelSubscription}) => (
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
        <CancelSubscriptionButton onCancelSubscription={onCancelSubscription} />
    </section>
);

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
    const {brandColor} = useContext(AppContext);
    const isAcceptingOffer = useIsActionRunning(RUNNING_ACTIONS.applyOffer);

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

const PlansContainer = ({
    plans, selectedPlan, confirmationPlan, confirmationType,
    showConfirmation = false, pendingOffer,
    onPlanSelect, onPlanCheckout, onConfirm, onCancelSubscription,
    onAcceptRetentionOffer, onDeclineRetentionOffer
}) => {
    const {member, site} = useContext(AppContext);
    const isFreeMember = !isPaidMember({member}) || isComplimentaryMember({member});

    if (isFreeMember) {
        return <UpgradePlanSection {...{plans, selectedPlan, onPlanSelect, onPlanCheckout}} />;
    }

    if (!showConfirmation) {
        return <ChangePlanSection {...{plans, selectedPlan, onCancelSubscription, onPlanSelect}} />;
    }

    if (confirmationType === 'offerRetention' && pendingOffer) {
        const offerProduct = pendingOffer.tier
            ? getProductFromId({site, productId: pendingOffer.tier.id})
            : getMemberActiveProduct({member, site});
        const offerPrice = pendingOffer.cadence === 'month'
            ? offerProduct?.monthlyPrice
            : offerProduct?.yearlyPrice;

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

// ─── Main Page (converted to functional component) ───────────────────────────

const INITIAL_CONFIRMATION_STATE = {
    showConfirmation: false,
    confirmationPlan: null,
    confirmationType: null,
    pendingOffer: null,
    targetSubscriptionId: null
};

export default function AccountPlanPage() {
    const context = useContext(AppContext);
    const {member, site, offers, lastPage, doAction} = context;

    const {prices, selectedPriceId} = React.useMemo(
        () => initializePrices({member, site}),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    const [selectedPlan, setSelectedPlan] = useState(selectedPriceId);
    const [confirmationState, setConfirmationState] = useState(INITIAL_CONFIRMATION_STATE);

    const {showConfirmation, confirmationPlan, confirmationType, pendingOffer, targetSubscriptionId} = confirmationState;

    // ── Effects ──────────────────────────────────────────────────────────────

    React.useEffect(() => {
        if (!member) {
            doAction('switchPage', {page: 'signin'});
            return;
        }

        const {pageData} = context;
        if (pageData?.action === 'cancel' && pageData?.subscriptionId) {
            handleCancelSubscription({subscriptionId: pageData.subscriptionId});
            pageData.action = null;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const cancelConfirmPage = useCallback(() => {
        setConfirmationState(INITIAL_CONFIRMATION_STATE);
    }, []);

    const handleBack = useCallback(() => {
        if (showConfirmation) {
            cancelConfirmPage();
        } else {
            doAction('back');
        }
    }, [showConfirmation, cancelConfirmPage, doAction]);

    const handlePlanCheckout = useCallback((e, priceId) => {
        const resolvedPriceId = priceId ?? selectedPlan;

        if (isPaidMember({member}) && !isComplimentaryMember({member})) {
            const subscription = getMemberSubscription({member});
            if (subscription?.id) {
                doAction('updateSubscription', {
                    plan: confirmationPlan.name,
                    planId: confirmationPlan.id,
                    subscriptionId: subscription.id,
                    cancelAtPeriodEnd: false
                });
            }
        } else {
            doAction('checkoutPlan', {plan: resolvedPriceId});
        }
    }, [member, selectedPlan, confirmationPlan, doAction]);

    const handlePlanSelect = useCallback((e, priceId) => {
        e?.preventDefault();

        if (!isPaidMember({member}) || isComplimentaryMember({member})) {
            setTimeout(() => setSelectedPlan(priceId), 5);
            return;
        }

        if (priceId === selectedPlan) {
            return;
        }

        const confirmationPrice = prices.find(p => p.id === priceId);
        const activePriceId = getMemberActivePrice({member})?.id ?? null;
        const type = activePriceId ? 'changePlan' : 'subscribe';

        setConfirmationState(prev => ({
            ...prev,
            confirmationPlan: confirmationPrice,
            confirmationType: type,
            showConfirmation: true
        }));
    }, [member, selectedPlan, prices]);

    const handleCancelSubscription = useCallback(({subscriptionId}) => {
        const subscription = getSubscriptionFromId({subscriptionId, member});
        if (!subscription) {
            return;
        }

        const subscriptionPlan = getPriceFromSubscription({subscription});
        const retentionOffer = (offers || []).find(o => o.redemption_type === 'retention');

        setConfirmationState({
            showConfirmation: true,
            confirmationPlan: subscriptionPlan,
            confirmationType: retentionOffer ? 'offerRetention' : 'cancel',
            pendingOffer: retentionOffer ?? null,
            targetSubscriptionId: subscriptionId
        });
    }, [member, offers]);

    const handleAcceptRetentionOffer = useCallback(() => {
        if (!targetSubscriptionId || !pendingOffer) {
            return;
        }
        doAction('applyOffer', {subscriptionId: targetSubscriptionId, offerId: pendingOffer.id});
    }, [targetSubscriptionId, pendingOffer, doAction]);

    const handleDeclineRetentionOffer = useCallback(() => {
        setConfirmationState(prev => ({
            ...prev,
            confirmationType: 'cancel',
            pendingOffer: null
        }));
    }, []);

    const handleConfirm = useCallback((e, data) => {
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
            handlePlanCheckout();
        }
    }, [confirmationType, targetSubscriptionId, doAction, handlePlanCheckout]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className='gh-portal-content'>
            <BackButton onClick={handleBack} hidden={!lastPage && !showConfirmation} />
            <CloseButton />
            <Header showConfirmation={showConfirmation} confirmationType={confirmationType} />
            <PlansContainer
                plans={prices}
                selectedPlan={selectedPlan}
                showConfirmation={showConfirmation}
                confirmationPlan={confirmationPlan}
                confirmationType={confirmationType}
                pendingOffer={pendingOffer}
                onConfirm={handleConfirm}
                onCancelSubscription={handleCancelSubscription}
                onAcceptRetentionOffer={handleAcceptRetentionOffer}
                onDeclineRetentionOffer={handleDeclineRetentionOffer}
                onPlanSelect={handlePlanSelect}
                onPlanCheckout={handlePlanCheckout}
            />
        </div>
    );
}
```

## Key Changes

### Architecture
- **Converted class component to functional component** — eliminates `this` binding issues, `constructor`, and lifecycle boilerplate
- **Grouped confirmation state** into a single `confirmationState` object to reduce scattered `setState` calls and make transitions atomic

### Complexity Reductions
| Before | After |
|---|---|
| `getConfirmationPageTitle` with chained `if/else` | Lookup table `CONFIRMATION_TITLES` |
| `getOfferMessage` with repeated conditions | Extracted shared `suffix` variable, cleaner branching |
| `PlanConfirmationSection` rendering two large JSX trees | Split into `ChangePlanConfirmation` + `CancelConfirmation` |
| `CancelSubscriptionButton` received 4 props from parent | Reads context directly |
| `onCancelSubscription` with duplicated state shape | Single `setConfirmationState` call with ternary |

### New Utilities
- **`useIsActionRunning(actions)`** — reusable hook replacing repeated `[...].includes(action)` checks
- **`initializePrices()`** — pure function extracted from `getInitialState` for testability
- **`RetentionOfferPriceDisplay`** — extracted conditional price block from `RetentionOfferSection`
- **`RUNNING_ACTIONS` / `INITIAL_CONFIRMATION_STATE`** — named constants replacing magic strings and inline objects