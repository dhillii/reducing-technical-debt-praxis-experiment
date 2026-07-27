// ...

@action
applyClasses(element) {
    if (!this.shouldAnimate ||
        (element.classList.contains('sent') && this.post.email.emailCount === this.previousSentCount) ||
        (element.classList.contains('opened') && this.post.email.openedCount === this.previousOpenedCount) ||
        (element.classList.contains('clicked') && this.post.count.clicks === this.previousClickedCount) ||
        (element.classList.contains('feedback') && this.totalFeedback === this.previousFeedbackCount) ||
        (element.classList.contains('conversions') && this.post.count.conversions === this.previousConversionsCount)
    ) {
        return;
    }

    const targets = this.getTargets(element);
    this.animateNewNumber(targets);
    this.animateOldNumber(targets);
}

getTargets(element) {
    // Extract the class names from the element
    const classNames = Array.from(element.classList);
    // Create a string of class names prefixed with a dot
    const classString = classNames.map(className => `.${className}`).join('');
    // Return the targets string
    return `${classString} .new-number span, ${classString} .old-number span`;
}

animateNewNumber(targets) {
    // Animate the new number
    anime({
        targets: targets,
        translateY: [10,0],
        opacity: [0,1],
        easing: 'easeOutElastic',
        elasticity: 650,
        duration: 1000,
        delay: (el, i) => 100 + 30 * i
    });
}

animateOldNumber(targets) {
    // Animate the old number
    anime({
        targets: targets,
        translateY: [0,-10],
        opacity: [1,0],
        easing: 'easeOutExpo',
        duration: 400,
        delay: (el, i) => 100 + 10 * i
    });
}

// ...