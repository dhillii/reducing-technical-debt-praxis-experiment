title={() => {
            let title = 'New tier';
            if (tier) {
                title = tier.active ? 'Edit tier' : 'Edit archived tier';
            }
            return title;
        }}