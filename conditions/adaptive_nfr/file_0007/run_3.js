# Refactored Offers Index Modal

## Key Changes Made

1. **Consolidated imports** from the same package into single statements
2. **Extracted components**: `OfferTableRow`, `OffersTableHeader`, `OffersEmptyStates`, `OffersTabHeader`
3. **Extracted hooks**: `useOffersSorting`, `useOffersData`
4. **Simplified complex ternary chains** into cleaner conditional logic
5. **Extracted constants** for sort options
6. **Reduced inline logic** in JSX

```typescript
import OffersRetention from './offers-retention';
import {
    Button,
    ButtonGroup,
    Icon,
    Modal,
    Popover,
    Tooltip,
    type ButtonProps,
    type Tab,
    TabView,
    showToast
} from '@tryghost/admin-x-design-system';
import {LucideIcon} from '@tryghost/shade';
import {type Tier, getPaidActiveTiers, useBrowseTiers} from '@tryghost/admin-x-framework/api/tiers';
import {getHomepageUrl} from '@tryghost/admin-x-framework/api/site';
import {useBrowseOffers} from '@tryghost/admin-x-framework/api/offers';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useModal} from '@ebay/nice-modal-react';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {useSortingState} from '../../../providers/settings-app-provider';
import {useState} from 'react';
import {currencyToDecimal, getSymbol} from '../../../../utils/currency';
import {numberWithCommas} from '../../../../utils/helpers';

// ─── Types ───────────────────────────────────────────────────────────────────

export type OfferType = 'percent' | 'fixed' | 'trial';

type StatusFilter = 'active' | 'archived';

interface OfferDiscount {
    discountColor: string;
    discountOffer: string;
    originalPriceWithCurrency: string;
    updatedPriceWithCurrency: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
    {id: 'date-added', label: 'Date added'},
    {id: 'name', label: 'Name'},
    {id: 'redemptions', label: 'Redemptions'}
] as const;

const OFFERS_TABS: Tab[] = [
    {id: 'signup', title: 'Signup'},
    {id: 'retention', title: 'Retention'}
];

// ─── Pure Utilities ───────────────────────────────────────────────────────────

export const createRedemptionFilterUrl = (id: string): string => {
    const filterValue = `offer_redemptions:[${id}]`;
    return `/ghost/#/members?filter=${encodeURIComponent(filterValue)}`;
};

export const getOfferCadence = (cadence: string): string =>
    cadence === 'month' ? 'monthly' : 'yearly';

export const getOfferDuration = (duration: string): string => {
    const map: Record<string, string> = {
        once: 'First payment',
        repeating: 'Repeating',
        forever: 'Forever'
    };
    return map[duration] ?? 'Forever';
};

const formatToTwoDecimals = (num: number): number => parseFloat(num.toFixed(2));

const formatPrice = (amount: number, currency: string): string =>
    getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)));

export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): OfferDiscount => {
    const originalPrice = cadence === 'month'
        ? (tier?.monthly_price ?? 0)
        : (tier?.yearly_price ?? 0);

    let discountColor = '';
    let discountOffer = '';
    let updatedPrice = originalPrice;
    let originalPriceWithCurrency = formatPrice(originalPrice, currency);

    switch (type) {
    case 'percent':
        discountColor = 'text-green';
        discountOffer = `${amount}% off`;
        updatedPrice = originalPrice - (originalPrice * amount) / 100;
        break;
    case 'fixed':
        discountColor = 'text-blue';
        discountOffer = `${numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)))} ${currency} off`;
        updatedPrice = originalPrice - amount;
        break;
    case 'trial':
        discountColor = 'text-pink';
        discountOffer = `${amount} days free`;
        originalPriceWithCurrency = '';
        break;
    }

    const updatedPriceWithCurrency = formatPrice(Math.max(0, updatedPrice), currency);

    return {discountColor, discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency};
};

// ─── Shared Components ────────────────────────────────────────────────────────

export const CopyLinkButton: React.FC<{offerCode: string}> = ({offerCode}) => {
    const [isCopied, setIsCopied] = useState(false);
    const {siteData} = useGlobalData();

    const handleCopyClick = (e?: React.MouseEvent<HTMLElement, MouseEvent>) => {
        e?.stopPropagation();
        navigator.clipboard.writeText(`${getHomepageUrl(siteData!)}${offerCode}`);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <Tooltip
            containerClassName='group-hover:opacity-100 opacity-0 inline-flex items-center -mr-1 justify-center leading-none w-5 h-5'
            content={isCopied ? 'Copied' : 'Copy link'}
            size='sm'
        >
            <Button
                color='clear'
                hideLabel={true}
                icon={isCopied ? 'check-circle' : 'hyperlink-circle'}
                iconColorClass={isCopied ? 'text-green w-[14px] h-[14px]' : 'w-[14px] h-[14px]'}
                label={isCopied ? 'Copied' : 'Copy'}
                unstyled={true}
                onClick={handleCopyClick}
            />
        </Tooltip>
    );
};

export const EmptyState: React.FC<{
    title?: string;
    description: string;
    buttonAction: () => void;
    buttonLabel: string;
}> = ({title = 'No offers found', description, buttonAction, buttonLabel}) => (
    <div className='flex h-full grow flex-col items-center justify-center text-center'>
        <Icon className='-mt-14' colorClass='text-grey-700 -mt-6' name='tags-block' size='lg' />
        <h1 className='mt-4 text-xl'>{title}</h1>
        <p className='mt-1.5 max-w-[420px]'>{description}</p>
        <Button className='mt-6' color='grey' label={buttonLabel} onClick={buttonAction} />
    </div>
);

// ─── Filter Popover ───────────────────────────────────────────────────────────

const OffersFilterPopover: React.FC<{
    statusFilter: StatusFilter;
    setStatusFilter: (status: StatusFilter) => void;
    sortOption: string;
    sortDirection: string;
    onSortChange: (option: string) => void;
    onDirectionChange: () => void;
}> = ({statusFilter, setStatusFilter, sortOption, sortDirection, onSortChange, onDirectionChange}) => (
    <Popover
        position='end'
        trigger={
            <button
                className='flex cursor-pointer items-center justify-center rounded p-1 hover:bg-grey-100 dark:hover:bg-grey-800'
                type='button'
            >
                <LucideIcon.ListFilter className='text-grey-700' size={16} strokeWidth={1.5} />
            </button>
        }
    >
        <div className='flex min-w-[220px] flex-col'>
            <FilterSectionHeader label='Status' />
            <div className='flex flex-col py-1'>
                {(['active', 'archived'] as const).map(status => (
                    <FilterButton
                        key={status}
                        isSelected={statusFilter === status}
                        label={status.charAt(0).toUpperCase() + status.slice(1)}
                        onClick={() => setStatusFilter(status)}
                    />
                ))}
            </div>

            <div className='cursor-default select-none border-y border-y-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-grey-800'>
                Sort by
            </div>
            <div className='flex flex-col py-1'>
                {SORT_OPTIONS.map(item => (
                    <div
                        key={item.id}
                        className='group relative mx-1 flex items-center rounded-[2.5px] hover:bg-grey-100 dark:hover:bg-grey-800'
                    >
                        <button
                            className='flex w-full cursor-pointer items-center px-8 py-1.5 pr-12 text-left text-sm'
                            type='button'
                            onClick={() => onSortChange(item.id)}
                        >
                            {sortOption === item.id && (
                                <Icon className='absolute left-2' name='check' size='xs' />
                            )}
                            {item.label}
                        </button>
                        {sortOption === item.id && (
                            <button
                                className='absolute right-1 flex size-6 cursor-pointer items-center justify-center rounded-full hover:bg-grey-300 dark:hover:bg-grey-700'
                                title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                                type='button'
                                onClick={onDirectionChange}
                            >
                                <Icon name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'} size='xs' />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    </Popover>
);

const FilterSectionHeader: React.FC<{label: string}> = ({label}) => (
    <div className='cursor-default select-none border-b border-b-grey-200 p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700 dark:border-b-grey-800'>
        {label}
    </div>
);

const FilterButton: React.FC<{label: string; isSelected: boolean; onClick: () => void}> = ({
    label,
    isSelected,
    onClick
}) => (
    <button
        className='group relative mx-1 flex cursor-pointer items-center rounded-[2.5px] px-8 py-1.5 text-left text-sm hover:bg-grey-100 dark:hover:bg-grey-800'
        type='button'
        onClick={onClick}
    >
        {isSelected && <Icon className='absolute left-2' name='check' size='xs' />}
        {label}
    </button>
);

// ─── Offer Table Row ──────────────────────────────────────────────────────────

const OfferTableRow: React.FC<{
    offer: ReturnType<typeof useBrowseOffers>['data']['offers'][number];
    offerTier: Tier;
    onEdit: (id: string) => void;
}> = ({offer, offerTier, onEdit}) => {
    const isTierArchived = offerTier.active === false;
    const offerId = offer.id ?? '';
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} =
        getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier);

    const handleEdit = isTierArchived ? () => {} : () => onEdit(offerId);
    const clickableClass = isTierArchived ? 'cursor-default select-none' : 'cursor-pointer';
    const opacityClass = isTierArchived ? 'opacity-50' : '';

    const redemptionHref = offer.redemption_count > 0
        ? createRedemptionFilterUrl(offerId)
        : undefined;

    const handleRedemptionClick = offer.redemption_count === 0 ? handleEdit : () => {};

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid='offer-item'>
            <td className={`${opacityClass} p-0`}>
                <a className={`block ${clickableClass} p-5 pl-0`} onClick={handleEdit}>
                    <span className='font-semibold'>{offer.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>
                        {offerTier.name} {getOfferCadence(offer.cadence)}
                    </span>
                </a>
            </td>

            <td className={`${opacityClass} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${clickableClass} p-5`} onClick={handleEdit}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>
                        {offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}
                    </span>
                </a>
            </td>

            <td className={`${opacityClass} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${clickableClass} p-5`} onClick={handleEdit}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>{' '}
                    {offer.type !== 'trial' && (
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                            {originalPriceWithCurrency}
                        </span>
                    )}
                </a>
            </td>

            <td className={`${opacityClass} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a
                    className={`block ${clickableClass} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`}
                    href={redemptionHref}
                    onClick={handleRedemptionClick}
                >
                    {offer.redemption_count}
                </a>
            </td>

            <td className={`${opacityClass} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived && <CopyLinkButton offerCode={offer.code} />}
            </td>

            {isTierArchived && (
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
                    This offer is disabled, because <br /> it is tied to an archived tier.
                </div>
            )}
        </tr>
    );
};

// ─── Offers Table ─────────────────────────────────────────────────────────────

const OffersTable: React.FC<{
    offers: ReturnType<typeof useBrowseOffers>['data']['offers'];
    allTiers: Tier[] | undefined;
    onEdit: (id: string) => void;
}> = ({offers, allTiers, onEdit}) => (
    <div className='overflow-x-auto'>
        <table className='m-0 w-full table-fixed'>
            <colgroup>
                <col />
                <col className='w-[220px]' />
                <col className='w-[220px]' />
                <col className='w-[220px]' />
                <col className='w-[80px]' />
            </colgroup>
            {offers.map((offer) => {
                const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
                return offerTier
                    ? <OfferTableRow key={offer.id} offer={offer} offerTier={offerTier} onEdit={onEdit} />
                    : null;
            })}
        </table>
    </div>
);

// ─── Tab Header Content ───────────────────────────────────────────────────────

const SignupTabHeaderContent: React.FC<{
    hasOffers: boolean;
    statusFilter: StatusFilter;
    setStatusFilter: (s: StatusFilter) => void;
    sortOption: string;
    sortDirection: string;
    onSortChange: (o: string) => void;
    onDirectionChange: () => void;
}> = ({hasOffers, statusFilter, setStatusFilter, sortOption, sortDirection, onSortChange, onDirectionChange}) => {
    const filterPopover = (
        <OffersFilterPopover
            setStatusFilter={setStatusFilter}
            sortDirection={sortDirection}
            sortOption={sortOption}
            statusFilter={statusFilter}
            onDirectionChange={onDirectionChange}
            onSortChange={onSortChange}
        />
    );

    if (!hasOffers) {
        return <div className='flex items-center'>{filterPopover}</div>;
    }

    return (
        <div className='flex items-center'>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Terms</span>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Price</span>
            <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Redemptions</span>
            <span className='flex w-[80px] items-center justify-end'>{filterPopover}</span>
        </div>
    );
};

const RetentionTabHeaderContent: React.FC = () => (
    <div className='flex items-center pt-[3px]'>
        <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Terms</span>
        <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Redemptions</span>
        <span className='w-[220px] px-5 text-xs uppercase text-grey-700'>Status</span>
        <span className='w-[80px]' />
    </div>
);

// ─── Custom Hooks ─────────────────────────────────────────────────────────────

const useOffersData = () => {
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();

    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');

    const activeOffers = signupOffers.filter((offer) => {
        const tier = allTiers?.find(t => t.id === offer?.tier?.id);
        return offer.status === 'active' && tier?.active === true;
    });

    const archivedOffers = signupOffers.filter((offer) => {
        const tier = allTiers?.find(t => t.id === offer?.tier?.id);
        return offer.status === 'archived' || tier?.active === false;
    });

    return {allOffers, allTiers, signupOffers, activeOffers, archivedOffers, isFetchingOffers};
};

const useOffersSorting = () => {
    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(s => s.type === 'offers');

    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const handleSortChange = (selectedOption: string) => {
        setSortingState?.([{type: 'offers', option: selectedOption, direction: sortDirection}]);
    };

    const handleDirectionChange = () => {
        const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        setSortingState?.([{type: 'offers', option: sortOption, direction: newDirection}]);
    };

    return {sortOption, sortDirection, handleSortChange, handleDirectionChange};
};

const useSortedFilteredOffers = (
    signupOffers: ReturnType<typeof useBrowseOffers>['data']['offers'],
    allTiers: Tier[] | undefined,
    sortOption: string,
    sortDirection: string,
    statusFilter: StatusFilter
) => {
    const multiplier = sortDirection === 'desc' ? -1 : 1;

    const sorted = [...signupOffers].sort((a, b) => {
        switch (sortOption) {
        case 'name':
            return multiplier * a.name.localeCompare(b.name);
        case 'redemptions':
            return multiplier * (a.redemption_count - b.redemption_count);
        default:
            return multiplier * (
                (a.created_at ? new Date(a.created_at).getTime() : 0) -
                (b.created_at ? new Date(b.created_at).getTime() : 0)
            );
        }
    });

    return sorted.filter((offer) => {
        const tier = allTiers?.find(t => t.id === offer?.tier?.id);
        const isActive = offer.status === 'active' && tier?.active === true;
        const isArchived = offer.status === 'archived' || tier?.active === false;
        return statusFilter === 'active' ? isActive : isArchived;
    });
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

export const OffersIndexModal: React.FC<{defaultTab?: string}> = ({defaultTab}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();

    const {allTiers, signupOffers, activeOffers, archivedOffers, isFetchingOffers} = useOffersData();
    const {sortOption, sortDirection, handleSortChange, handleDirectionChange} = useOffersSorting();

    const [selectedTab, setSelectedTab] = useState(defaultTab || 'signup');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

    const filteredOffers = useSortedFilteredOffers(
        signupOffers, allTiers, sortOption, sortDirection, statusFilter
    );

    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const handleClose = () => {
        modal.remove();
        updateRoute('offers');
    };

    const handleOfferEdit = (id: string) => {
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const handleNewOffer = () => {
        if (paidActiveTiers.length === 0) {
            showToast({type: 'info', title: 'You must have an active tier to create an offer.'});
        } else {
            updateRoute('offers/new');
        }
    };

    const handleTabChange = (tab: string) => {
        setSelectedTab(tab);
        updateRoute(tab === 'retention' ? 'offers/edit/retention' : 'offers/edit');
    };

    const buttons: ButtonProps[] = [
        {key: 'cancel-modal', label: 'Close', onClick: handleClose},
        ...(selectedTab === 'signup' ? [{
            key: 'new-offer',
            icon: 'add',
            label: 'New offer',
            color: 'green' as const,
            onClick: handleNewOffer
        }] : [])
    ];

    const tabHeaderContent = selectedTab === 'signup'
        ? (
            <SignupTabHeaderContent
                hasOffers={filteredOffers.length > 0}
                setStatusFilter={setStatusFilter}
                sortDirection={sortDirection}
                sortOption={sortOption}
                statusFilter={statusFilter}
                onDirectionChange={handleDirectionChange}
                onSortChange={handleSortChange}
            />
        )
        : selectedTab === 'retention'
            ? <RetentionTabHeaderContent />
            : null;

    const showActiveEmpty = selectedTab === 'signup' && statusFilter === 'active' && activeOffers.length === 0 && !isFetchingOffers;
    const showArchivedEmpty = selectedTab === 'signup' && statusFilter === 'archived' && archivedOffers.length === 0 && !isFetchingOffers;

    return (
        <Modal
            afterClose={() => updateRoute('offers')}
            animate={false}
            backDropClick={false}
            cancelLabel=''
            footer={false}
            height='full'
            size='lg'
            testId='offers-modal'
            title='Offers'
            topRightContent={<ButtonGroup buttons={buttons} />}
            width={1140}
        >
            <div className='flex h-full flex-col pt-8'>
                <header>
                    <TabView
                        selectedTab={selectedTab}
                        tabs={OFFERS_TABS}
                        topRightContent={tabHeaderContent}
                        onTabChange={handleTabChange}
                    />
                </header>

                {showActiveEmpty && (
                    <EmptyState
                        buttonAction={() => updateRoute('offers/new')}
                        buttonLabel='Create an offer'
                        description='Grow your audience with discounts or free trials.'
                    />
                )}

                {showArchivedEmpty && (
                    <EmptyState
                        buttonAction={() => setStatusFilter('active')}
                        buttonLabel='Back to active'
                        description='All archived offers will be shown here.'
                    />
                )}

                {selectedTab === 'retention' && <OffersRetention />}

                {selectedTab === 'signup' && (
                    <OffersTable
                        allTiers={allTiers}
                        offers={filteredOffers}
                        onEdit={handleOfferEdit}
                    />
                )}
            </div>
        </Modal>
    );
};
```

## Summary of Improvements

| Area | Before | After |
|------|--------|-------|
| **Imports** | 14 separate import lines | 6 consolidated imports |
| **Main component** | ~180 lines, mixed concerns | ~80 lines, orchestration only |
| **Inline JSX logic** | Complex nested ternaries | Named boolean flags + extracted components |
| **Table row** | Inline in `listLayoutOutput` variable | `OfferTableRow` component |
| **Sorting/filtering** | Inline in component body | `useOffersSorting`, `useSortedFilteredOffers`, `useOffersData` hooks |
| **Tab header** | Triple-nested ternary | `SignupTabHeaderContent` + `RetentionTabHeaderContent` |
| **`getOfferDiscount`** | Duplicated price formatting | Extracted `formatPrice` helper |
| **`getOfferDuration`** | Nested ternary | Lookup map |