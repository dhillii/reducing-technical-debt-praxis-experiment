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
    cancelSubscription: ['cancelSubscription:running'],
    updateSubscription: ['updateSubscription:running', 'checkoutPlan:running', 'cancelSubscription:running']
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

function useIsActionRunning(actions) {
    const {action} = useContext(AppContext);
    return actions.includes(action);
}

function useInitialPrices() {
    const {member, site} = useContext(AppContext);
    const allPrices = getAvailablePrices({site});
    const activePrice = getMemberActivePrice({member});

    const prices = activePrice
        ? getFilteredPrices({prices: allPrices, currency: activePrice.currency})
        : allPrices;

    const defaultPrice = activePrice
        ? prices.find(p => p.id === activePrice.id)
        : (!isPaidMember({member}) && prices.length > 0 ? prices[0] : null);

    return {prices, selectedPriceId: defaultPrice?.id ?? null};
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
        <div className="gh-portal-expire-container">
            <ActionButton
                dataTestId="cancel-subscription"
                onClick={() => onCancelSubscription({subscriptionId: subscription.id, cancelAtPeriodEnd: true})}
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
    const isRunning = useIsActionRunning(RUNNING_ACTIONS.updateSubscription);
    const subscription = getMemberSubscription({member});
    const currentActivePlan = getMemberActivePrice({member});

    const planStartDate = getDateString(subscription.current_period_end);
    const planStartingMessage = currentActivePlan.id !== plan.id ? t('Starting today') : t('Starting {startDate}', {startDate: planStartDate});
    const planStartMessage = `${plan.currency_symbol}${formatNumber(plan.price)}/${t(plan.interval)} – ${planStartingMessage}`;

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
                dataTestId="confirm-action"
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
    const isRunning = useIsActionRunning(RUNNING_ACTIONS.updateSubscription);
    const subscription = getMemberSubscription({member});

    return (
        <div className="gh-portal-logged-out-form-container gh-portal-cancellation-form">
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
                    rows="2"
                    maxLength="500"
                />
            </section>
            <ActionButton
                dataTestId="confirm-cancel-subscription"
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

const RetentionOfferPriceDisplay = ({offer, currency, discountedPrice, originalPrice}) => {
    if (offer.type === 'free_months') {
        return null;
    }
    return (
        <>
            <div className="gh-portal-product-price">
                <span className="currency-sign">{currency}</span>
                <span className="amount">{discountedPrice}</span>
            </div>
            <div className="gh-portal-offer-oldprice">
                {currency}{originalPrice}
            </div>
        </>
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
    const cadenceLabel = offer.cadence === 'month' ? 'Monthly' : 'Yearly';

    return (
        <div className="gh-portal-logged-out-form-container gh-portal-offer gh-portal-retention-offer">
            <p className="gh-portal-text-center">
                {'We\'d hate to see you go! How about a special offer to stay?'}
            </p>
            <div className="gh-portal-offer-bar">
                <div className="gh-portal-offer-title">
                    <h4>{product.name} - {cadenceLabel}</h4>
                    <h5 className="gh-portal-discount-label">{discountText}</h5>
                </div>
                <div className="gh-portal-offer-details">
                    <div className="gh-portal-retention-offer-price">
                        <RetentionOfferPriceDisplay
                            offer={offer}
                            currency={currency}
                            discountedPrice={discountedPrice}
                            originalPrice={originalPrice}
                        />
                    </div>
                    <p className="footnote">
                        {getOfferMessage(offer, originalPrice, currency, amountOff)}
                    </p>
                </div>
                <ActionButton
                    dataTestId="accept-retention-offer"
                    onClick={onAcceptOffer}
                    isRunning={isAcceptingOffer}
                    disabled={isAcceptingOffer}
                    isPrimary={true}
                    brandColor={brandColor}
                    label="Accept offer"
                    style={{width: '100%', height: '40px', marginTop: '28px'}}
                />
            </div>
            <ActionButton
                dataTestId="decline-retention-offer"
                onClick={onDeclineOffer}
                isPrimary={false}
                isDestructive={true}
                classes="gh-portal-btn-text"
                brandColor={brandColor}
                label="No thanks, I want to cancel"
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

function useRetentionOfferData(pendingOffer) {
    const {member, site} = useContext(AppContext);

    if (!pendingOffer) {
        return null;
    }

    const offerProduct = pendingOffer.tier
        ? getProductFromId({site, productId: pendingOffer.tier.id})
        : getMemberActiveProduct({member, site});

    const offerPrice = pendingOffer.cadence === 'month'
        ? offerProduct?.monthlyPrice
        : offerProduct?.yearlyPrice;

    if (!offerProduct || !offerPrice) {
        return null;
    }

    return {offerProduct, offerPrice};
}

const PlansContainer = ({
    plans, selectedPlan, confirmationPlan, confirmationType, showConfirmation = false,
    pendingOffer, onPlanSelect, onPlanCheckout, onConfirm, onCancelSubscription,
    onAcceptRetentionOffer, onDeclineRetentionOffer
}) => {
    const {member} = useContext(AppContext);
    const retentionData = useRetentionOfferData(pendingOffer);

    const isFreeMember = !isPaidMember({member}) || isComplimentaryMember({member});

    if (isFreeMember) {
        return <UpgradePlanSection {...{plans, selectedPlan, onPlanSelect, onPlanCheckout}} />;
    }

    if (!showConfirmation) {
        return <ChangePlanSection {...{plans, selectedPlan, onCancelSubscription, onPlanSelect}} />;
    }

    if (confirmationType === 'offerRetention' && retentionData) {
        return (
            <RetentionOfferSection
                offer={pendingOffer}
                product={retentionData.offerProduct}
                price={retentionData.offerPrice}
                onAcceptOffer={onAcceptRetentionOffer}
                onDeclineOffer={onDeclineRetentionOffer}
            />
        );
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
    const {member, site, offers, lastPage, doAction, pageData} = context;

    const {prices, selectedPriceId} = useInitialPrices();
    const [selectedPlan, setSelectedPlan] = useState(selectedPriceId);
    const [confirmationState, setConfirmationState] = useState(INITIAL_CONFIRMATION_STATE);

    const timeoutRef = React.useRef(null);

    // Redirect if no member
    React.useEffect(() => {
        if (!member) {
            doAction('switchPage', {page: 'signin'});
            return;
        }

        // Trigger cancellation flow from external cancel button
        if (pageData?.action === 'cancel' && pageData?.subscriptionId) {
            handleCancelSubscription({subscriptionId: pageData.subscriptionId});
            pageData.action = null;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    React.useEffect(() => {
        return () => clearTimeout(timeoutRef.current);
    }, []);

    const resetConfirmation = useCallback(() => {
        setConfirmationState(INITIAL_CONFIRMATION_STATE);
    }, []);

    const handleBack = useCallback(() => {
        if (confirmationState.showConfirmation) {
            resetConfirmation();
        } else {
            doAction('back');
        }
    }, [confirmationState.showConfirmation, doAction, resetConfirmation]);

    const handlePlanCheckout = useCallback((e, priceId) => {
        const {confirmationPlan} = confirmationState;
        const resolvedPlan = priceId ? prices.find(p => p.id === priceId) : confirmationPlan;

        if (isPaidMember({member}) && !isComplimentaryMember({member})) {
            const subscription = getMemberSubscription({member});
            if (subscription?.id) {
                doAction('updateSubscription', {
                    plan: resolvedPlan?.name,
                    planId: resolvedPlan?.id,
                    subscriptionId: subscription.id,
                    cancelAtPeriodEnd: false
                });
            }
        } else {
            doAction('checkoutPlan', {plan: selectedPlan});
        }
    }, [confirmationState, doAction, member, prices, selectedPlan]);

    const handlePlanSelect = useCallback((e, priceId) => {
        e?.preventDefault();

        if (!isPaidMember({member}) || isComplimentaryMember({member})) {
            timeoutRef.current = setTimeout(() => setSelectedPlan(priceId), 5);
            return;
        }

        const activePriceId = getMemberActivePrice({member})?.id ?? null;
        if (priceId === selectedPlan) {
            return;
        }

        setConfirmationState(prev => ({
            ...prev,
            confirmationPlan: prices.find(p => p.id === priceId),
            confirmationType: activePriceId ? 'changePlan' : 'subscribe',
            showConfirmation: true
        }));
    }, [member, prices, selectedPlan]);

    const handleCancelSubscription = useCallback(({subscriptionId}) => {
        const subscription = getSubscriptionFromId({subscriptionId, member});
        if (!subscription) {
            return;
        }

        const subscriptionPlan = getPriceFromSubscription({subscription});
        const retentionOffers = (offers || []).filter(o => o.redemption_type === 'retention');
        const hasRetentionOffer = retentionOffers.length > 0;

        setConfirmationState({
            showConfirmation: true,
            confirmationPlan: subscriptionPlan,
            confirmationType: hasRetentionOffer ? 'offerRetention' : 'cancel',
            pendingOffer: hasRetentionOffer ? retentionOffers[0] : null,
            targetSubscriptionId: subscriptionId
        });
    }, [member, offers]);

    const handleAcceptRetentionOffer = useCallback(() => {
        const {pendingOffer, targetSubscriptionId} = confirmationState;
        if (!targetSubscriptionId || !pendingOffer) {
            return;
        }
        doAction('applyOffer', {subscriptionId: targetSubscriptionId, offerId: pendingOffer.id});
    }, [confirmationState, doAction]);

    const handleDeclineRetentionOffer = useCallback(() => {
        setConfirmationState(prev => ({
            ...prev,
            confirmationType: 'cancel',
            pendingOffer: null
        }));
    }, []);

    const handleConfirm = useCallback((e, data) => {
        const {confirmationType} = confirmationState;
        if (confirmationType === 'cancel') {
            const {targetSubscriptionId} = confirmationState;
            if (!targetSubscriptionId) {
                return;
            }
            doAction('cancelSubscription', {
                subscriptionId: targetSubscriptionId,
                cancelAtPeriodEnd: true,
                cancellationReason: data
            });
        } else if (['changePlan', 'subscribe'].includes(confirmationType)) {
            handlePlanCheckout(e);
        }
    }, [confirmationState, doAction, handlePlanCheckout]);

    const {showConfirmation, confirmationPlan, confirmationType, pendingOffer} = confirmationState;

    return (
        <div className='gh-portal-content'>
            <BackButton
                onClick={handleBack}
                hidden={!lastPage && !showConfirmation}
            />
            <CloseButton />
            <Header
                confirmationType={confirmationType}
                showConfirmation={showConfirmation}
            />
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

---

## Key Refactoring Decisions

### 1. Class → Functional Component
Converted `AccountPlanPage` from a class component to a functional component using hooks (`useState`, `useCallback`, `useEffect`, `useRef`), eliminating boilerplate and making state logic more composable.

### 2. Extracted Constants
- `CONFIRMATION_TITLES` map replaces the `if/else` chain in `getConfirmationPageTitle`
- `RUNNING_ACTIONS` map centralizes action string arrays
- `INITIAL_CONFIRMATION_STATE` object prevents duplication between reset and init

### 3. Decomposed Large Components
- `PlanConfirmationSection` split into `ChangePlanConfirmation` and `CancelConfirmation` — each has a single responsibility
- `RetentionOfferPriceDisplay` extracted from `RetentionOfferSection` to isolate conditional rendering

### 4. Custom Hooks
- `useIsActionRunning(actions)` — reusable hook for checking running action state
- `useInitialPrices()` — encapsulates price initialization logic previously in `getInitialState()`
- `useRetentionOfferData(pendingOffer)` — isolates offer product/price resolution from `PlansContainer`

### 5. Simplified Props
- `CancelSubscriptionButton` now reads `member`, `action`, `brandColor`, `site` directly from context instead of receiving them as props
- `ChangePlanSection` no longer passes `member/action/brandColor` through manually

### 6. Consistent Naming
All handlers renamed with `handle` prefix (`handleBack`, `handleConfirm`, etc.) for clarity and consistency.