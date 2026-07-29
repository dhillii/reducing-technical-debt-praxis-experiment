public void processKeyEvent(KeyEvent evt)
{
    if(isClosed())
        return;

    if(hasComponentBinding(evt))
        return;

    if(hasTextComponentKeymapAction(evt))
        return;

    if(evt.isConsumed())
        return;

    evt = KeyEventWorkaround.processKeyEvent(evt);
    if(evt == null)
        return;

    handleKeyEventById(evt);

    if(!evt.isConsumed())
        super.processKeyEvent(evt);
}

private boolean hasComponentBinding(KeyEvent evt)
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

private boolean hasTextComponentKeymapAction(KeyEvent evt)
{
    if(getFocusOwner() instanceof JTextComponent)
    {
        if(evt.getID() == KeyEvent.KEY_PRESSED)
        {
            if(isIgnoredKeyCode(evt))
                return true;
        }

        Keymap keymap = ((JTextComponent)getFocusOwner()).getKeymap();
        if(keymap.getAction(KeyStroke.getKeyStrokeForEvent(evt)) != null)
            return true;
    }
    return false;
}

private boolean isIgnoredKeyCode(KeyEvent evt)
{
    int code = evt.getKeyCode();
    return code == KeyEvent.VK_BACK_SPACE ||
           code == KeyEvent.VK_TAB ||
           code == KeyEvent.VK_ENTER;
}

private void handleKeyEventById(KeyEvent evt)
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