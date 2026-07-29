public void processKeyEvent(KeyEvent evt)
{
    if(isClosed())
        return;

    if(handleComponentKeyMap(evt))
        return;

    if(handleTextComponentKeyMap(evt))
        return;

    if(evt.isConsumed())
        return;

    evt = KeyEventWorkaround.processKeyEvent(evt);
    if(evt == null)
        return;

    dispatchToHandlers(evt);

    if(!evt.isConsumed())
        super.processKeyEvent(evt);
}

/**
 * Handles key events that are mapped in the focus owner's
 * {@link InputMap} and {@link ActionMap}.  If a binding is found
 * and the corresponding action is non‑null, the event is considered
 * handled and the method returns {@code true}.
 */
private boolean handleComponentKeyMap(KeyEvent evt)
{
    if(getFocusOwner() instanceof JComponent)
    {
        JComponent comp = (JComponent)getFocusOwner();
        InputMap map = comp.getInputMap();
        ActionMap am = comp.getActionMap();

        if(map != null && am != null && comp.isEnabled())
        {
            Object binding = map.get(KeyStroke.getKeyStrokeForEvent(evt));
            if(binding != null && am.get(binding) != null)
                return true;
        }
    }
    return false;
}

/**
 * Handles key events that are mapped in a {@link JTextComponent}
 * {@link Keymap}.  Certain key codes are ignored for {@code
 * KEY_PRESSED} events.  If a mapped action is found, the event is
 * considered handled and the method returns {@code true}.
 */
private boolean handleTextComponentKeyMap(KeyEvent evt)
{
    if(getFocusOwner() instanceof JTextComponent)
    {
        if(evt.getID() == KeyEvent.KEY_PRESSED)
        {
            switch(evt.getKeyCode())
            {
                case KeyEvent.VK_BACK_SPACE:
                case KeyEvent.VK_TAB:
                case KeyEvent.VK_ENTER:
                    return true;
            }
        }

        Keymap keymap = ((JTextComponent)getFocusOwner()).getKeymap();
        if(keymap.getAction(KeyStroke.getKeyStrokeForEvent(evt)) != null)
            return true;
    }
    return false;
}

/**
 * Dispatches the key event to the appropriate handler based on its
 * type.  The method respects the presence of a {@link
 * KeyListener} interceptor and the state of the {@link
 * InputHandler}.
 */
private void dispatchToHandlers(KeyEvent evt)
{
    switch(evt.getID())
    {
        case KeyEvent.KEY_TYPED:
            if(keyEventInterceptor != null)
            {
                // Interceptor does not handle typed events.
            }
            else if(inputHandler.isPrefixActive() && !getTextArea().hasFocus())
            {
                inputHandler.keyTyped(evt);
            }
            break;

        case KeyEvent.KEY_PRESSED:
            if(keyEventInterceptor != null)
                keyEventInterceptor.keyPressed(evt);
            else
                inputHandler.keyPressed(evt);
            break;

        case KeyEvent.KEY_RELEASED:
            if(keyEventInterceptor != null)
                keyEventInterceptor.keyReleased(evt);
            else
                inputHandler.keyReleased(evt);
            break;
    }
}