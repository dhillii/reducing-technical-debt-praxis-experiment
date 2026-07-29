public void processKeyEvent(KeyEvent evt)
{
    if(isClosed())
        return;

    Component owner = getFocusOwner();
    if(handleInputMap(owner,evt))
        return;
    if(handleTextComponent(owner,evt))
        return;
    if(evt.isConsumed())
        return;

    evt = KeyEventWorkaround.processKeyEvent(evt);
    if(evt == null)
        return;

    handleEvent(evt);
    if(!evt.isConsumed())
        super.processKeyEvent(evt);
}

private boolean handleInputMap(Component owner, KeyEvent evt)
{
    if(!(owner instanceof JComponent))
        return false;
    JComponent comp = (JComponent)owner;
    InputMap map = comp.getInputMap();
    ActionMap am = comp.getActionMap();
    if(map == null || am == null || !comp.isEnabled())
        return false;
    Object binding = map.get(KeyStroke.getKeyStrokeForEvent(evt));
    return binding != null && am.get(binding) != null;
}

private boolean handleTextComponent(Component owner, KeyEvent evt)
{
    if(!(owner instanceof JTextComponent))
        return false;
    if(evt.getID() == KeyEvent.KEY_PRESSED)
    {
        int code = evt.getKeyCode();
        if(code == KeyEvent.VK_BACK_SPACE || code == KeyEvent.VK_TAB || code == KeyEvent.VK_ENTER)
            return true;
    }
    Keymap keymap = ((JTextComponent)owner).getKeymap();
    return keymap.getAction(KeyStroke.getKeyStrokeForEvent(evt)) != null;
}

private void handleEvent(KeyEvent evt)
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