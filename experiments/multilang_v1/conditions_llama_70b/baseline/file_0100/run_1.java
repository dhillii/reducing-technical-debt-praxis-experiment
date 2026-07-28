public void processKeyEvent(KeyEvent evt)
{
    if(isClosed())
        return;

    if(handleKeyEventInFocusOwner(evt))
        return;

    if(handleKeyEventInJTextComponent(evt))
        return;

    if(evt.isConsumed())
        return;

    evt = KeyEventWorkaround.processKeyEvent(evt);
    if(evt == null)
        return;

    handleKeyEvent(evt);
}

private boolean handleKeyEventInFocusOwner(KeyEvent evt)
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
            {
                return true;
            }
        }
    }
    return false;
}

private boolean handleKeyEventInJTextComponent(KeyEvent evt)
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

        Keymap keymap = ((JTextComponent)getFocusOwner())
            .getKeymap();
        if(keymap.getAction(KeyStroke.getKeyStrokeForEvent(evt)) != null)
            return true;
    }
    return false;
}

private void handleKeyEvent(KeyEvent evt)
{
    switch(evt.getID())
    {
    case KeyEvent.KEY_TYPED:
        if(keyEventInterceptor != null)
            /* keyEventInterceptor.keyTyped(evt) */;
        else if(inputHandler.isPrefixActive()
            && !getTextArea().hasFocus())
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

    if(!evt.isConsumed())
        super.processKeyEvent(evt);
}