class PopupContent extends React.Component {
    static contextType = AppContext;

    componentDidMount() {
        this.updateContainerHeight();
    }

    componentDidUpdate() {
        this.updateContainerHeight();
    }

    handlePopupClose(e) {
        e.preventDefault();
        if (e.target === e.currentTarget) {
            this.context.dispatch('update', {
                showPopup: false
            });
        }
    }

    updateContainerHeight() {
        // TO DO: implement logic to update container height
    }

    render() {
        return (
            <Search />
        );
    }
}