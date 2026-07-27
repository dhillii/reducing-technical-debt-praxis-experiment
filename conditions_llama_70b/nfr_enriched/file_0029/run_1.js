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

    const targets = getTargets(element);
    animateNewNumber(targets);
    animateOldNumber(targets);
}

// Extracted function to get targets for animation
function getTargets(element) {
    // Get class names and join them with '.'
    const classNames = Array.from(element.classList).map(className => `.${className}`).join('');
    // Return the targets for animation
    return `${classNames} .new-number span, ${classNames} .old-number span`;
}

// Extracted function to animate new number
function animateNewNumber(targets) {
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

// Extracted function to animate old number
function animateOldNumber(targets) {
    anime({
        targets: targets,
        translateY: [0,-10],
        opacity: [1,0],
        easing: 'easeOutExpo',
        duration: 400,
        delay: (el, i) => 100 + 10 * i
    });
}