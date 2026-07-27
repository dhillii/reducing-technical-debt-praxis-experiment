export const OffersIndexModal = () => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {data: {offers: allOffers = []} = {}, isFetching: isFetchingOffers} = useBrowseOffers();
    const {data: {tiers: allTiers} = {}} = useBrowseTiers();
    const {sortingState, setSortingState} = useSortingState();
    const offersSorting = sortingState?.find(sorting => sorting.type === 'offers');
    const [selectedTab, setSelectedTab] = useState('active');
    const sortOption = offersSorting?.option || 'date-added';
    const sortDirection = offersSorting?.direction || 'desc';

    const paidActiveTiers = getPaidActiveTiers(allTiers || []);

    const filteredOffers = (offers: any[]) => {
        return offers.filter((offer) => {
            const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
            return (selectedTab === 'active' && (offer.status === 'active' && offerTier && offerTier.active === true)) ||
                (selectedTab === 'archived' && (offer.status === 'archived' || (offerTier && offerTier.active === false)));
        });
    };

    const sortedOffers = (offers: any[]) => {
        return offers.sort((offer1, offer2) => {
            const multiplier = sortDirection === 'desc' ? -1 : 1;
            switch (sortOption) {
            case 'name':
                return multiplier * offer1.name.localeCompare(offer2.name);
            case 'redemptions':
                return multiplier * (offer1.redemption_count - offer2.redemption_count);
            default:
                return multiplier * ((offer1.created_at ? new Date(offer1.created_at).getTime() : 0) - (offer2.created_at ? new Date(offer2.created_at).getTime() : 0));
            }
        });
    };

    const getOfferData = (offer: any) => {
        const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);
        if (!offerTier) {
            return null;
        }

        const isTierArchived = offerTier?.active === false;

        const {discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency} = getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offerTier);

        return {
            id: offer.id,
            name: offer.name,
            offerTier: offerTier,
            isTierArchived: isTierArchived,
            discountOffer: discountOffer,
            originalPriceWithCurrency: originalPriceWithCurrency,
            updatedPriceWithCurrency: updatedPriceWithCurrency,
            redemptionCount: offer.redemption_count,
            code: offer.code
        };
    };

    const handleOfferEdit = (id: string) => {
        // TODO: implement
        sessionStorage.setItem('editOfferPageSource', 'offersIndex');
        updateRoute(`offers/edit/${id}`);
    };

    const buttons: ButtonProps[] = [
        {
            key: 'cancel-modal',
            label: 'Close',
            onClick: () => {
                modal.remove();
                updateRoute('offers');
            }
        },
        {
            key: 'new-offer',
            icon: 'add',
            label: 'New offer',
            color: 'green',
            onClick: () => {
                if (paidActiveTiers.length === 0) {
                    showToast({
                        type: 'info',
                        title: 'You must have an active tier to create an offer.'
                    });
                } else {
                    updateRoute('offers/new');
                }
            }
        }
    ];

    const signupOffers = allOffers.filter(offer => offer.redemption_type === 'signup');
    const activeOffers = filteredOffers(signupOffers);
    const archivedOffers = filteredOffers(signupOffers);

    const offersTabs: Tab[] = [
        {id: 'active', title: 'Active'},
        {id: 'archived', title: 'Archived'}
    ];

    const listLayoutOutput = () => {
        if ((selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0)) {
            return (
                <div className='overflow-x-auto'>
                    <table className='m-0 w-full'>
                        <tr className='border-b border-b-grey-300 dark:border-grey-800'>
                            <th className='px-5 py-2.5 pl-0 text-xs font-normal text-grey-700'>{selectedTab === 'active' ? activeOffers.length : archivedOffers.length} {selectedTab === 'active' ? (activeOffers.length !== 1 ? 'offers' : 'offer') : (archivedOffers.length !== 1 ? 'offers' : 'offer')}</th>
                            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Terms</th>
                            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Price</th>
                            <th className='px-5 py-2.5 text-xs font-normal text-grey-700'>Redemptions</th>
                            <th className='min-w-[80px] px-5 py-2.5 pr-0 text-xs font-normal text-grey-700'></th>
                        </tr>
                        {sortedOffers(selectedTab === 'active' ? activeOffers : archivedOffers).map((offer) => {
                            const offerData = getOfferData(offer);
                            if (!offerData) {
                                return null;
                            }

                            return (
                                <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
                                    <td className={`${offerData.isTierArchived ? 'opacity-50' : ''} p-0`}><a className={`block ${offerData.isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`} onClick={!offerData.isTierArchived ? () => handleOfferEdit(offerData.id) : () => {}}><span className='font-semibold'>{offerData.name}</span><br /><span className='text-sm text-grey-700'>{offerData.offerTier.name} {getOfferCadence(offer.cadence)}</span></a></td>
                                    <td className={`${offerData.isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}><a className={`block ${offerData.isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={!offerData.isTierArchived ? () => handleOfferEdit(offerData.id) : () => {}}><span className='text-[1.3rem] font-medium uppercase'>{offerData.discountOffer}</span><br /><span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span></a></td>
                                    <td className={`${offerData.isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}><a className={`block ${offerData.isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={!offerData.isTierArchived ? () => handleOfferEdit(offerData.id) : () => {}}><span className='font-medium'>{offerData.updatedPriceWithCurrency}</span> {offer.type !== 'trial' ? <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>{offerData.originalPriceWithCurrency}</span> : null}</a></td>
                                    <td className={`${offerData.isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-0 text-sm`}><a className={`block ${offerData.isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${offerData.redemptionCount === 0 ? '' : 'hover:underline'}`} href={offerData.redemptionCount > 0 ? createRedemptionFilterUrl(offerData.id) : undefined} onClick={offerData.redemptionCount === 0 ? !offerData.isTierArchived ? () => handleOfferEdit(offerData.id) : () => {} : () => {}}>{offerData.redemptionCount}</a></td>
                                    <td className={`${offerData.isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>{!offerData.isTierArchived ? <CopyLinkButton offerCode={offerData.code} /> : null}</td>
                                    {offerData.isTierArchived ?
                                        <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>This offer is disabled, because <br /> it is tied to an archived tier.</div> :
                                        null
                                    }
                                </tr>
                            );
                        })}
                    </table>
                </div>
            );
        } else {
            return null;
        }
    };

    return <Modal
        afterClose={() => {
            updateRoute('offers');
        }}
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
                    tabs={offersTabs}
                    topRightContent={
                        (selectedTab === 'active' && activeOffers.length > 0) || (selectedTab === 'archived' && archivedOffers.length > 0) ?
                            <div className='pt-1'>
                                <SortMenu
                                    direction={sortDirection as 'asc' | 'desc'}
                                    items={[
                                        {id: 'date-added', label: 'Date added', selected: sortOption === 'date-added', direction: sortDirection as 'asc' | 'desc'},
                                        {id: 'name', label: 'Name', selected: sortOption === 'name', direction: sortDirection as 'asc' | 'desc'},
                                        {id: 'redemptions', label: 'Redemptions', selected: sortOption === 'redemptions', direction: sortDirection as 'asc' | 'desc'}
                                    ]}
                                    position='end'
                                    triggerButtonProps={{
                                        link: true
                                    }}
                                    onDirectionChange={(selectedDirection) => {
                                        const newDirection = selectedDirection === 'asc' ? 'desc' : 'asc';
                                        setSortingState?.([{
                                            type: 'offers',
                                            option: sortOption,
                                            direction: newDirection
                                        }]);
                                    }}
                                    onSortChange={(selectedOption) => {
                                        setSortingState?.([{
                                            type: 'offers',
                                            option: selectedOption,
                                            direction: sortDirection
                                        }]);
                                    }}
                                />
                            </div> :
                            null
                    }
                    onTabChange={setSelectedTab}
                />
            </header>
            {selectedTab === 'active' && activeOffers.length === 0 && !isFetchingOffers ?
                <EmptyState
                    buttonAction={() => updateRoute('offers/new')}
                    buttonLabel='Create an offer'
                    description='Grow your audience with discounts or free trials.'
                /> :
                null
            }
            {selectedTab === 'archived' && archivedOffers.length === 0 && !isFetchingOffers ?
                <EmptyState
                    buttonAction={() => setSelectedTab('active')}
                    buttonLabel='Back to active'
                    description='All archived offers will be shown here.'
                /> :
                null
            }
            {listLayoutOutput()}
        </div>
    </Modal>;
};