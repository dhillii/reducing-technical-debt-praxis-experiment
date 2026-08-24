handleSignup(e) {
    e.preventDefault();
    const {pageData: offer, site} = this.context;
    if (!offer?.tier?.id) {
        return null;
    }
    const product = getProductFromId({site, productId: offer.tier.id});
    if (!product) {
        return null;
    }
    const price = this.getPriceForCadence({product, cadence: offer.cadence});
    this.validateAndSignup({offer, price});
}

getPriceForCadence({product, cadence}) {
    return cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
}

validateAndSignup({offer, price}) {
    this.setState((state) => ({
        errors: this.getFormErrors(state)
    }), () => {
        const {doAction} = this.context;
        const {name, email, phonenumber, errors} = this.state;
        if (this.hasFormErrors({errors})) {
            return;
        }
        const signupData = {
            name,
            email,
            plan: price?.id,
            offerId: offer?.id,
            phonenumber
        };
        if (this.shouldShowNewsletterSelection()) {
            this.showNewsletterSelection(signupData);
        } else {
            doAction('signup', signupData);
            this.clearFormErrors();
        }
    });
}

shouldShowNewsletterSelection() {
    const {site} = this.context;
    return hasMultipleNewsletters({site});
}

showNewsletterSelection(signupData) {
    this.setState({
        showNewsletterSelection: true,
        pageData: signupData,
        errors: {}
    });
}

clearFormErrors() {
    this.setState({errors: {}});
}

hasFormErrors({errors}) {
    return errors && Object.values(errors).some(error => !!error);
}