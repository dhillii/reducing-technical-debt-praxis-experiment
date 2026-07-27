handleSignup(e) {
    e.preventDefault();
    const {pageData: offer, site} = this.context;
    if (!offer?.tier) {
        return null;
    }
    const product = getProductFromId({site, productId: offer.tier.id});
    const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    this.setState((state) => {
        return {
            errors: this.getFormErrors(state)
        };
    }, () => {
        const {doAction} = this.context;
        const {name, email, phonenumber, errors} = this.state;
        const hasFormErrors = Object.values(errors ?? {}).some((error) => !!error);
        if (!hasFormErrors) {
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
                this.setState({
                    errors: {}
                });
            }
        }
    });
}