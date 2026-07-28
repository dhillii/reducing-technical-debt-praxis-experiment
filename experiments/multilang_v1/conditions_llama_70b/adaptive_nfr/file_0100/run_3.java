public void processKeyEvent(KeyEvent evt)
{
    if(isClosed())
        return;

    if(getFocusOwner() instanceof JComponent)
    {
        JComponent comp = (JComponent)getFocusOwner();
        InputMap map = comp.getInputMap();
        ActionMap am = comp.getActionMap();

        if(map != null && am != null && comp.isEnabled())
        {
            Object binding = map.get(KeyStroke.getKeyStrokeForEvent(evt));
            if(binding != null && am.get(binding) != null)
            {
                return;
            }
        }
    }

    if(getFocusOwner() instanceof JTextComponent)
    {
        if(evt.getID() == KeyEvent.KEY_PRESSED)
        {
            if(isSpecialKey(evt.getKeyCode()))
                return;
        }

        Keymap keymap = ((JTextComponent)getFocusOwner())
            .getKeymap();
        if(keymap.getAction(KeyStroke.getKeyStrokeForEvent(evt)) != null)
            return;
    }

    if(evt.isConsumed())
        return;

    evt = KeyEventWorkaround.processKeyEvent(evt);
    if(evt == null)
        return;

    processKeyEventBasedOnId(evt);
}

private boolean isSpecialKey(int keyCode)
{
    return keyCode == KeyEvent.VK_BACK_SPACE
        || keyCode == KeyEvent.VK_TAB
        || keyCode == KeyEvent.VK_ENTER;
}

private void processKeyEventBasedOnId(KeyEvent evt)
{
    switch(evt.getID())
    {
    case KeyEvent.KEY_TYPED:
        handleKeyTypedEvent(evt);
        break;
    case KeyEvent.KEY_PRESSED:
        handleKeyPressedEvent(evt);
        break;
    case KeyEvent.KEY_RELEASED:
        handleKeyReleasedEvent(evt);
        break;
    }

    if(!evt.isConsumed())
        super.processKeyEvent(evt);
}

private void handleKeyTypedEvent(KeyEvent evt)
{
    if(keyEventInterceptor != null)
        /* keyEventInterceptor.keyTyped(evt) */;
    else if(inputHandler.isPrefixActive()
        && !getTextArea().hasFocus())
        inputHandler.keyTyped(evt);
}

private void handleKeyPressedEvent(KeyEvent evt)
{
    if(keyEventInterceptor != null)
        keyEventInterceptor.keyPressed(evt);
    else
        inputHandler.keyPressed(evt);
}

private void handleKeyReleasedEvent(KeyEvent evt)
{
    if(keyEventInterceptor != null)
        keyEventInterceptor.keyReleased(evt);
    else
        inputHandler.keyReleased(evt);
}