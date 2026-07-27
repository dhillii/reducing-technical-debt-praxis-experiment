const OfferRow = ({ offer, handleOfferEdit, isTierArchived }) => {
    const { discountOffer, originalPriceWithCurrency, updatedPriceWithCurrency } = getOfferDiscount(offer.type, offer.amount, offer.cadence, offer.currency || 'USD', offer.tier);

    return (
        <tr className={`group relative scale-100 border-b border-b-grey-200 dark:border-grey-800`} data-testid="offer-item">
            <td className={`${isTierArchived ? 'opacity-50' : ''} p-0`}>
                <a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 pl-0`} onClick={!isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {}}>
                    <span className='font-semibold'>{offer?.name}</span>
                    <br />
                    <span className='text-sm text-grey-700'>{offer.tier.name} {getOfferCadence(offer.cadence)}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={!isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {}}>
                    <span className='text-[1.3rem] font-medium uppercase'>{discountOffer}</span>
                    <br />
                    <span className='text-grey-700'>{offer.type !== 'trial' ? getOfferDuration(offer.duration) : 'Trial period'}</span>
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5`} onClick={!isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {}}>
                    <span className='font-medium'>{updatedPriceWithCurrency}</span>
                    {offer.type !== 'trial' ? <span className='relative text-xs text-grey-700 before:absolute before:-inset-x-0.5 before:top-1/2 before:rotate-[-20deg] before:border-t before:content-[""]'>{originalPriceWithCurrency}</span> : null}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-0 text-sm`}>
                <a className={`block ${isTierArchived ? 'cursor-default select-none' : 'cursor-pointer'} p-5 ${offer.redemption_count === 0 ? '' : 'hover:underline'}`} href={offer.redemption_count > 0 ? createRedemptionFilterUrl(offer.id ? offer.id : '') : undefined} onClick={offer.redemption_count === 0 ? !isTierArchived ? () => handleOfferEdit(offer?.id ? offer.id : '') : () => {} : () => {}}>
                    {offer.redemption_count}
                </a>
            </td>
            <td className={`${isTierArchived ? 'opacity-50' : ''} w-[120px] whitespace-nowrap p-5 pr-8 text-right text-sm leading-none`}>
                {!isTierArchived ? <CopyLinkButton offerCode={offer.code} /> : null}
            </td>
            {isTierArchived ?
                <div className='absolute right-0 top-[11px] whitespace-nowrap rounded-sm bg-black px-2 py-0.5 text-xs leading-normal text-white opacity-0 transition-all group-hover:opacity-100 dark:bg-grey-950'>This offer is disabled, because <br /> it is tied to an archived tier.</div> :
                null
            }
        </tr>
    );
};

const OffersTable = ({ filteredOffers, handleOfferEdit, allTiers }) => {
    return (
        <table className='m-0 w-full table-fixed'>
            <colgroup>
                <col />
                <col className='w-[220px]' />
                <col className='w-[220px]' />
                <col className='w-[220px]' />
                <col className='w-[80px]' />
            </colgroup>
            {filteredOffers.map((offer) => {
                const offerTier = allTiers?.find(tier => tier.id === offer?.tier?.id);

                if (!offerTier) {
                    return null;
                }

                const isTierArchived = offerTier?.active === false;

                return (
                    <OfferRow
                        key={offer.id}
                        offer={offer}
                        handleOfferEdit={handleOfferEdit}
                        isTierArchived={isTierArchived}
                    />
                );
            })}
        </table>
    );
};

const OffersIndexModal = ({ defaultTab }) => {
    // ...

    const listLayoutOutput = <div className='overflow-x-auto'>
        <OffersTable
            filteredOffers={filteredOffers}
            handleOfferEdit={handleOfferEdit}
            allTiers={allTiers}
        />
    </div>;

    // ...
};