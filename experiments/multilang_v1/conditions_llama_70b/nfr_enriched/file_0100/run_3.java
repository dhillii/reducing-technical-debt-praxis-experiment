/**
 * Forwards key events directly to the input handler.
 * This is slightly faster than using a KeyListener
 * because some Swing overhead is avoided.
 */
public void processKeyEvent(KeyEvent evt)
{
    if (isClosed())
        return;

    if (shouldHandleKeyEventInComponent(evt))
        return;

    if (shouldHandleKeyEventInTextComponent(evt))
        return;

    if (evt.isConsumed())
        return;

    evt = KeyEventWorkaround.processKeyEvent(evt);
    if (evt == null)
        return;

    handleKeyEvent(evt);
}

/**
 * Checks if the key event should be handled in the component.
 * 
 * @param evt the key event
 * @return true if the key event should be handled in the component, false otherwise
 */
private boolean shouldHandleKeyEventInComponent(KeyEvent evt)
{
    if (getFocusOwner() instanceof JComponent)
    {
        JComponent comp = (JComponent) getFocusOwner();
        InputMap map = comp.getInputMap();
        ActionMap am = comp.getActionMap();

        if (map != null && am != null && comp.isEnabled())
        {
            Object binding = map.get(KeyStroke.getKeyStrokeForEvent(evt));
            if (binding != null && am.get(binding) != null)
            {
                return true;
            }
        }
    }
    return false;
}

/**
 * Checks if the key event should be handled in the text component.
 * 
 * @param evt the key event
 * @return true if the key event should be handled in the text component, false otherwise
 */
private boolean shouldHandleKeyEventInTextComponent(KeyEvent evt)
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

        Keymap keymap = ((JTextComponent) getFocusOwner()).getKeymap();
        if (keymap.getAction(KeyStroke.getKeyStrokeForEvent(evt)) != null)
            return true;
    }
    return false;
}

/**
 * Handles the key event.
 * 
 * @param evt the key event
 */
private void handleKeyEvent(KeyEvent evt)
{
    switch (evt.getID())
    {
    case KeyEvent.KEY_TYPED:
        // Handled in text area
        if (keyEventInterceptor != null)
            /* keyEventInterceptor.keyTyped(evt) */;
        else if (inputHandler.isPrefixActive() && !getTextArea().hasFocus())
            inputHandler.keyTyped(evt);
        break;
    case KeyEvent.KEY_PRESSED:
        if (keyEventInterceptor != null)
            keyEventInterceptor.keyPressed(evt);
        else
            inputHandler.keyPressed(evt);
        break;
    case KeyEvent.KEY_RELEASED:
        if (keyEventInterceptor != null)
            keyEventInterceptor.keyReleased(evt);
        else
            inputHandler.keyReleased(evt);
        break;
    }

    if (!evt.isConsumed())
        super.processKeyEvent(evt);
}