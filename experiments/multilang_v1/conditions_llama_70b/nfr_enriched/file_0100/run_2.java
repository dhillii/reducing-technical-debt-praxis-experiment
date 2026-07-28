/**
 * Forwards key events directly to the input handler.
 * This is slightly faster than using a KeyListener
 * because some Swing overhead is avoided.
 */
public void processKeyEvent(KeyEvent evt)
{
    if (isClosed())
        return;

    if (shouldConsumeKeyEvent(evt))
        return;

    if (isKeyEventInterceptorActive())
        handleKeyEventWithInterceptor(evt);
    else
        handleKeyEventWithInputHandler(evt);

    if (!evt.isConsumed())
        super.processKeyEvent(evt);
}

/**
 * Checks if the key event should be consumed.
 * 
 * @param evt the key event
 * @return true if the key event should be consumed, false otherwise
 */
private boolean shouldConsumeKeyEvent(KeyEvent evt)
{
    if (getFocusOwner() instanceof JTextComponent)
    {
        // fix for the bug where key events in JTextComponents
        // inside views are also handled by the input handler
        if (evt.getID() == KeyEvent.KEY_PRESSED)
        {
            switch (evt.getKeyCode())
            {
            case KeyEvent.VK_BACK_SPACE:
            case KeyEvent.VK_TAB:
            case KeyEvent.VK_ENTER:
                return true;
            }
        }

        Keymap keymap = ((JTextComponent) getFocusOwner())
            .getKeymap();
        if (keymap.getAction(KeyStroke.getKeyStrokeForEvent(evt)) != null)
            return true;
    }

    return evt.isConsumed();
}

/**
 * Checks if the key event interceptor is active.
 * 
 * @return true if the key event interceptor is active, false otherwise
 */
private boolean isKeyEventInterceptorActive()
{
    return keyEventInterceptor != null;
}

/**
 * Handles the key event with the key event interceptor.
 * 
 * @param evt the key event
 */
private void handleKeyEventWithInterceptor(KeyEvent evt)
{
    switch (evt.getID())
    {
    case KeyEvent.KEY_TYPED:
        // Handled in text area
        break;
    case KeyEvent.KEY_PRESSED:
        keyEventInterceptor.keyPressed(evt);
        break;
    case KeyEvent.KEY_RELEASED:
        keyEventInterceptor.keyReleased(evt);
        break;
    }
}

/**
 * Handles the key event with the input handler.
 * 
 * @param evt the key event
 */
private void handleKeyEventWithInputHandler(KeyEvent evt)
{
    evt = KeyEventWorkaround.processKeyEvent(evt);
    if (evt == null)
        return;

    switch (evt.getID())
    {
    case KeyEvent.KEY_TYPED:
        // Handled in text area
        if (inputHandler.isPrefixActive()
            && !getTextArea().hasFocus())
            inputHandler.keyTyped(evt);
        break;
    case KeyEvent.KEY_PRESSED:
        inputHandler.keyPressed(evt);
        break;
    case KeyEvent.KEY_RELEASED:
        inputHandler.keyReleased(evt);
        break;
    }
}