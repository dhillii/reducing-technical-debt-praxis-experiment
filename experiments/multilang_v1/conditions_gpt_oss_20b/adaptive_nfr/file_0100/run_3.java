public void processKeyEvent(KeyEvent evt)
{
    if(isClosed())
        return;

    if(getFocusOwner() instanceof JComponent)
    {
        JComponent comp = (JComponent)getFocusOwner();
        if(handleComponentInputMap(comp, evt))
            return;
    }

    if(getFocusOwner() instanceof JTextComponent)
    {
        if(handleTextComponent((JTextComponent)getFocusOwner(), evt))
            return;
    }

    if(evt.isConsumed())
        return;

    evt = KeyEventWorkaround.processKeyEvent(evt);
    if(evt == null)
        return;

    dispatchKeyEvent(evt);

    if(!evt.isConsumed())
        super.processKeyEvent(evt);
}

/**
 * Handles key events for a {@link JComponent} that has an {@link InputMap}
 * and {@link ActionMap}. Returns {@code true} if the event was consumed
 * by the component's input map.
 */
private boolean handleComponentInputMap(JComponent comp, KeyEvent evt)
{
    InputMap map = comp.getInputMap();
    ActionMap am = comp.getActionMap();

    if(map != null && am != null && comp.isEnabled())
    {
        Object binding = map.get(KeyStroke.getKeyStrokeForEvent(evt));
        if(binding != null && am.get(binding) != null)
            return true;
    }
    return false;
}

/**
 * Handles key events for a {@link JTextComponent}. Returns {@code true}
 * if the event was consumed by the text component's keymap.
 */
private boolean handleTextComponent(JTextComponent comp, KeyEvent evt)
{
    if(evt.getID() == KeyEvent.KEY_PRESSED && isSpecialKey(evt.getKeyCode()))
        return true;

    Keymap keymap = comp.getKeymap();
    if(keymap.getAction(KeyStroke.getKeyStrokeForEvent(evt)) != null)
        return true;

    return false;
}

/**
 * Dispatches the key event to the appropriate handler based on the
 * event type.
 */
private void dispatchKeyEvent(KeyEvent evt)
{
    switch(evt.getID())
    {
        case KeyEvent.KEY_TYPED:
            if(keyEventInterceptor != null)
                /* keyEventInterceptor.keyTyped(evt) */;
            else if(inputHandler.isPrefixActive() && !getTextArea().hasFocus())
                inputHandler.keyTyped(evt);
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

/**
 * Returns {@code true} if the key code corresponds to a special key
 * that should be ignored when a {@link JTextComponent} has focus.
 */
private boolean isSpecialKey(int keyCode)
{
    return keyCode == KeyEvent.VK_BACK_SPACE ||
           keyCode == KeyEvent.VK_TAB ||
           keyCode == KeyEvent.VK_ENTER;
}