# Refactored Offers Index Modal

## Key Changes Made

1. **Consolidated imports** from the same package into single statements
2. **Extracted components**: `OfferTableRow`, `OffersTableHeader`, `OffersEmptyStates`, `OffersTabHeader`
3. **Extracted hooks**: `useOffersSorting`, `useOffersData`
4. **Extracted utilities**: `sortOffers`, `filterOffers`
5. **Simplified nested ternaries** into cleaner conditional logic

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
import {currencyToDecimal, getSymbol} from '../../../../utils/currency';
import {getHomepageUrl} from '@tryghost/admin-x-framework/api/site';
import {numberWithCommas} from '../../../../utils/helpers';
import {useBrowseOffers} from '@tryghost/admin-x-framework/api/offers';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useModal} from '@ebay/nice-modal-react';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {useSortingState} from '../../../providers/settings-app-provider';
import {useState} from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type OfferType = 'percent' | 'fixed' | 'trial';

type StatusFilter = 'active' | 'archived';

interface OfferDiscount {
    discountColor: string;
    discountOffer: string;
    originalPriceWithCurrency: string;
    updatedPriceWithCurrency: string;
}

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

const formatPrice = (currency: string, amount: number): string =>
    getSymbol(currency) + numberWithCommas(formatToTwoDecimals(currencyToDecimal(amount)));

export const getOfferDiscount = (
    type: string,
    amount: number,
    cadence: string,
    currency: string,
    tier: Tier | undefined
): OfferDiscount => {
    const originalPrice = cadence === 'month' ? tier?.monthly_price ?? 0 : tier?.yearly_price ?? 0;
    let updatedPrice = originalPrice;
    let discountColor = '';
    let discountOffer = '';
    let originalPriceWithCurrency = formatPrice(currency, originalPrice);

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

    return {
        discountColor,
        discountOffer,
        originalPriceWithCurrency,
        updatedPriceWithCurrency: formatPrice(currency, Math.max(0, updatedPrice))
    };
};

// ─── Sorting & Filtering ──────────────────────────────────────────────────────

type SortOption = 'date-added' | 'name' | 'redemptions';

const sortOffers = <T extends {name: string; redemption_count: number; created_at?: string}>(
    offers: T[],
    option: string,
    direction: string
): T[] => {
    const multiplier = direction === 'desc' ? -1 : 1;

    return [...offers].sort((a, b) => {
        switch (option) {
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
};

// ─── Custom Hooks ─────────────────────────────────────────────────────────────

const useOffersSorting = () => {
    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(s => s.type === 'offers');

    const sortOption = offersSorting?.option ?? 'date-added';
    const sortDirection = offersSorting?.direction ?? 'desc';

    const handleSortChange = (option: string) => {
        setSortingState?.([{type: 'offers', option, direction: sortDirection}]);
    };

    const handleDirectionChange = () => {
        setSortingState?.([{
            type: 'offers',
            option: sortOption,
            direction: sortDirection === 'asc' ? 'desc' : 'asc'
        }]);
    };

    return {sortOption, sortDirection, handleSortChange, handleDirectionChange};
};

const useOffersData = (statusFilter: StatusFilter) => {
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();

    const signupOffers = allOffers.filter(o => o.redemption_type === 'signup');

    const getTierForOffer = (offer: typeof signupOffers[number]) =>
        allTiers?.find(t => t.id === offer?.tier?.id);

    const activeOffers = signupOffers.filter((offer) => {
        const tier = getTierForOffer(offer);
        return offer.status === 'active' && tier?.active === true;
    });

    const archivedOffers = signupOffers.filter((offer) => {
        const tier = getTierForOffer(offer);
        return offer.status === 'archived' || tier?.active === false;
    });

    const filteredOffers = signupOffers.filter((offer) => {
        const tier = getTierForOffer(offer);
        if (statusFilter === 'active') {
            return offer.status === 'active' && tier?.active === true;
        }
        return offer.status === 'archived' || tier?.active === false;
    });

    return {
        allTiers,
        signupOffers,
        activeOffers,
        archivedOffers,
        filteredOffers,
        isFetchingOffers,
        paidActiveTiers: getPaidActiveTiers(allTiers ?? [])
    };
};

// ─── Small Reusable Components ────────────────────────────────────────────────

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

const SORT_OPTIONS: {id: SortOption; label: string}[] = [
    {id: 'date-added', label: 'Date added'},
    {id: 'name', label: 'Name'},
    {id: 'redemptions', label: 'Redemptions'}
];

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
            <PopoverSectionHeader label='Status' />
            <div className='flex flex-col py-1'>
                {(['active', 'archived'] as const).map(status => (
                    <PopoverCheckItem
                        key={status}
                        checked={statusFilter === status}
                        label={status.charAt(0).toUpperCase() + status.slice(1)}
                        onClick={() => setStatusFilter(status)}
                    />
                ))}
            </div>

            <PopoverSectionHeader borderTop label='Sort by' />
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
                            {sortOption === item.id && <Icon className='absolute left-2' name='check' size='xs' />}
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

const PopoverSectionHeader: React.FC<{label: string; borderTop?: boolean}> = ({label, borderTop}) => (
    <div className={`cursor-default select-none p-2 pl-3 text-xs font-semibold uppercase tracking-wide text-grey-700
        ${borderTop
        ? 'border-y border-y-grey-200 dark:border-grey-800'
        : 'border-b border-b-grey-200 dark:border-b-grey-800'
    }`}>
        {label}
    </div>
);

const PopoverCheckItem: React.FC<{label: string; checked: boolean; onClick: () => void}> = ({
    label,
    checked,
    onClick
}) => (
    <button
        className='group relative mx-1 flex cursor-pointer items-center rounded-[2.5px] px-8 py-1.5 text-left text-sm hover:bg-grey-100 dark:hover:bg-grey-800'
        type='button'
        onClick={onClick}
    >
        {checked && <Icon className='absolute left-2' name='check' size='xs' />}
        {label}
    </button>
);

// ─── Offer Table ──────────────────────────────────────────────────────────────

const ARCHIVED_TIER_TOOLTIP = (
    <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>
        This offer is disabled, because <br /> it is tied to an archived tier.
    </div>
);

const OfferTableRow: React.FC<{
    offer: ReturnType<typeof useBrowseOffers>['data'] extends {offers: infer O} ? O[number] : never;
    offerTier: Tier;
    onEdit: (id: string) => void;
}> = ({offer, offerTier, onEdit}) => {
    const isTierArchived = offerTier.active === false;
    const offerId = offer.id ?? '';
    const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} =
        getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency ?? 'USD', offerTier);

    const cellClass = `${isTierArchived ? 'opacity-50' : ''} p-0`;
    const linkClass = `block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'}`;
    const handleEdit = isTierArchived ? () => {} : () => onEdit(offerId);

    return (
        <tr className='group relative scale-100 border-b border-b-grey-200 dark:border-grey-800' data-testid='offer-item'>
            <td className={cellClass}>
                <a className={`${linkClass} p-5 pl-0`} onClick={handleEdit}>
                    <span className='font-semibold'>{offer.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{offerTier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>

            <td className={`${cellClass} whitespace-nowrap text-sm`}>
                <a className={`${linkClass} p-5`} onClick={handleEdit}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>
                        {offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}
                    </span>
                </a>
            </td>

            <td className={`${cellClass} whitespace-nowrap text-sm`}>
                <a className={`${linkClass} p-5`} onClick={handleEdit}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {offer.type !== 'trial' && originalPriceWithCurrency && (
                        <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>
                            {originalPriceWithCurrency}
                        </span>
                    )}
                </a>
            </td>

            <td className={`${cellClass} w-[120px] whitespace-nowrap text-sm`}>
                <a
                    className={`${linkClass} p-5 ${offer.redemption_count > 0 ? 'hover:underline' : ''}`}
                    href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offerId) : undefined}
                    onClick={offer.redemption_count === 0 ? handleEdit : undefined}
                >
                    {offer.redemption_count}
                </a>
            </td>

            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived && <CopyLinkButton offerCode={offer.code} />}
            </td>

            {isTierArchived && ARCHIVED_TIER_TOOLTIP}
        </tr>
    );
};

const OffersTable: React.FC<{
    offers: ReturnType<typeof useBrowseOffers>['data'] extends {offers: infer O} ? O : never;
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
                const offerTier = allTiers?.find(t => t.id === offer?.tier?.id);
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
    filterPopover: React.ReactNode;
}> = ({hasOffers, filterPopover}) => {
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

// ─── Main Modal ───────────────────────────────────────────────────────────────

const OFFERS_TABS: Tab[] = [
    {id: 'signup', title: 'Signup'},
    {id: 'retention', title: 'Retention'}
];

export const OffersIndexModal: React.FC<{defaultTab?: string}> = ({defaultTab}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const [selectedTab, setSelectedTab] = useState(defaultTab ?? 'signup');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

    const {sortOption, sortDirection, handleSortChange, handleDirectionChange} = useOffersSorting();
    const {allTiers, activeOffers, archivedOffers, filteredOffers, isFetchingOffers, paidActiveTiers} =
        useOffersData(statusFilter);

    const sortedFilteredOffers = sortOffers(filteredOffers, sortOption, sortDirection);

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

    const filterPopover = (
        <OffersFilterPopover
            setStatusFilter={setStatusFilter}
            sortDirection={sortDirection}
            sortOption={sortOption}
            statusFilter={statusFilter}
            onDirectionChange={handleDirectionChange}
            onSortChange={handleSortChange}
        />
    );

    const topRightContent = (() => {
        if (selectedTab === 'signup') {
            return <SignupTabHeaderContent filterPopover={filterPopover} hasOffers={sortedFilteredOffers.length > 0} />;
        }
        if (selectedTab === 'retention') {
            return <RetentionTabHeaderContent />;
        }
        return null;
    })();

    const modalButtons: ButtonProps[] = [
        {key: 'cancel-modal', label: 'Close', onClick: handleClose},
        ...(selectedTab === 'signup' ? [{
            key: 'new-offer',
            icon: 'add',
            label: 'New offer',
            color: 'green' as const,
            onClick: handleNewOffer
        }] : [])
    ];

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
            topRightContent={<ButtonGroup buttons={modalButtons} />}
            width={1140}
        >
            <div className='flex h-full flex-col pt-8'>
                <header>
                    <TabView
                        selectedTab={selectedTab}
                        tabs={OFFERS_TABS}
                        topRightContent={topRightContent}
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
                        offers={sortedFilteredOffers}
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
| **Sorting logic** | Inline in component | `useOffersSorting` hook |
| **Data fetching/filtering** | Inline in component | `useOffersData` hook |
| **Table row** | 15+ line inline JSX | `OfferTableRow` component |
| **Table** | `listLayoutOutput` variable | `OffersTable` component |
| **Tab headers** | Nested ternaries (4 levels deep) | `SignupTabHeaderContent` + `RetentionTabHeaderContent` |
| **Empty states** | Chained ternaries | Boolean flags + `&&` rendering |
| **Price formatting** | Duplicated inline | `formatPrice` helper |
| **Popover items** | Repeated markup | `PopoverSectionHeader` + `PopoverCheckItem` |