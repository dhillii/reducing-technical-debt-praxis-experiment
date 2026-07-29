package org.argouml.uml.diagram.ui;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics;
import java.awt.Point;
import java.awt.Rectangle;
import java.awt.event.KeyEvent;
import java.awt.event.KeyListener;
import java.awt.event.MouseEvent;
import java.awt.event.MouseListener;
import java.beans.PropertyChangeEvent;
import java.beans.PropertyChangeListener;
import java.beans.VetoableChangeListener;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.Vector;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.swing.Action;
import javax.swing.Icon;
import javax.swing.JMenu;
import javax.swing.JSeparator;
import javax.swing.SwingUtilities;

import org.argouml.application.events.ArgoDiagramAppearanceEvent;
import org.argouml.application.events.ArgoDiagramAppearanceEventListener;
import org.argouml.application.events.ArgoEventPump;
import org.argouml.application.events.ArgoEventTypes;
import org.argouml.application.events.ArgoHelpEvent;
import org.argouml.application.events.ArgoNotationEvent;
import org.argouml.application.events.ArgoNotationEventListener;
import org.argouml.cognitive.Designer;
import org.argouml.cognitive.Highlightable;
import org.argouml.cognitive.ToDoItem;
import org.argouml.cognitive.ToDoList;
import org.argouml.cognitive.ui.ActionGoToCritique;
import org.argouml.i18n.Translator;
import org.argouml.kernel.DelayedChangeNotify;
import org.argouml.kernel.DelayedVChangeListener;
import org.argouml.kernel.Owned;
import org.argouml.kernel.Project;
import org.argouml.model.AddAssociationEvent;
import org.argouml.model.AssociationChangeEvent;
import org.argouml.model.AttributeChangeEvent;
import org.argouml.model.DeleteInstanceEvent;
import org.argouml.model.DiElement;
import org.argouml.model.InvalidElementException;
import org.argouml.model.Model;
import org.argouml.model.RemoveAssociationEvent;
import org.argouml.model.UmlChangeEvent;
import org.argouml.notation.Notation;
import org.argouml.notation.NotationName;
import org.argouml.notation.NotationProvider;
import org.argouml.notation.NotationProviderFactory2;
import org.argouml.notation.NotationRenderer;
import org.argouml.notation.NotationSettings;
import org.argouml.ui.ArgoJMenu;
import org.argouml.ui.Clarifier;
import org.argouml.ui.ContextActionFactoryManager;
import org.argouml.ui.ProjectActions;
import org.argouml.ui.targetmanager.TargetManager;
import org.argouml.uml.StereotypeUtility;
import org.argouml.uml.diagram.DiagramElement;
import org.argouml.uml.diagram.DiagramSettings;
import org.argouml.uml.ui.ActionDeleteModelElements;
import org.argouml.util.IItemUID;
import org.argouml.util.ItemUID;
import org.tigris.gef.base.Geometry;
import org.tigris.gef.base.Globals;
import org.tigris.gef.base.Layer;
import org.tigris.gef.base.Selection;
import org.tigris.gef.persistence.pgml.PgmlUtility;
import org.tigris.gef.presentation.ArrowHead;
import org.tigris.gef.presentation.Fig;
import org.tigris.gef.presentation.FigCircle;
import org.tigris.gef.presentation.FigEdge;
import org.tigris.gef.presentation.FigEdgePoly;
import org.tigris.gef.presentation.FigGroup;
import org.tigris.gef.presentation.FigNode;
import org.tigris.gef.presentation.FigPoly;
import org.tigris.gef.presentation.FigText;

/**
 * Abstract class to display diagram lines (edges) for UML ModelElements that
 * look like lines.
 * This Fig is prepared to show a (possibly editable) name,
 * and/or multiple stereotypes.
 * <p>
 * NOTE: This will drop the ArgoNotationEventListener and
 * ArgoDiagramAppearanceEventListener
 * interfaces in the next release.  The corresponding methods have been marked
 * as deprecated.
 */
public abstract class FigEdgeModelElement
    extends FigEdgePoly
    implements
        VetoableChangeListener,
        DelayedVChangeListener,
        MouseListener,
        KeyListener,
        PropertyChangeListener,
        ArgoNotationEventListener,
        NotationRenderer,
        ArgoDiagramAppearanceEventListener,
        Highlightable,
        IItemUID,
        ArgoFig,
        Clarifiable,
        DiagramElement,
        Owned {

    private static final Logger LOG =
        Logger.getLogger(FigEdgeModelElement.class.getName());

    private DiElement diElement = null;

    private boolean removeFromDiagram = true;

    private static int popupAddOffset;

    private NotationProvider notationProviderName;

    private FigText nameFig;

    private FigStereotypesGroup stereotypeFig;

    private FigEdgePort edgePort;

    private ItemUID itemUid;

    private Set<Object[]> listeners = new HashSet<Object[]>();

    private DiagramSettings settings;

    protected FigEdgeModelElement(Object element,
            DiagramSettings renderSettings) {
        super();
        settings = renderSettings;

        super.setLineColor(LINE_COLOR);
        super.setLineWidth(LINE_WIDTH);
        getFig().setLineColor(LINE_COLOR);
        getFig().setLineWidth(LINE_WIDTH);

        nameFig = new FigNameWithAbstract(element,
                new Rectangle(X0, Y0 + 20, 90, 20),
                renderSettings, false);
        stereotypeFig = new FigStereotypesGroup(element,
                new Rectangle(X0, Y0, 90, 15),
                settings);

        initFigs();
        initOwner(element);
    }

    private void initFigs() {
        nameFig.setTextFilled(false);
        setBetweenNearestPoints(true);
    }

    private void initOwner(Object element) {
        if (element != null) {
            if (!Model.getFacade().isAUMLElement(element)) {
                throw new IllegalArgumentException(
                        "The owner must be a model element - got a "
                        + element.getClass().getName());
            }
            super.setOwner(element);
            if (edgePort != null) {
                edgePort.setOwner(getOwner());
            }
            if (Model.getFacade().isANamedElement(element)) {
                NotationName nn = Notation.findNotation(
                        settings.getNotationSettings().getNotationLanguage());
                notationProviderName =
                    NotationProviderFactory2.getInstance().getNotationProvider(
                            getNotationProviderType(), element, this, nn);
            }

            addElementListener(element, "remove");
        }
    }

    public void makeEdgePort() {
        if (edgePort == null) {
            edgePort = new FigEdgePort(getOwner(), new Rectangle(),
                    getSettings());
            edgePort.setVisible(false);
            addPathItem(edgePort,
                    new PathItemPlacement(this, edgePort, 50, 0));
        }
    }

    public FigEdgePort getEdgePort() {
        return edgePort;
    }

    public void setItemUID(ItemUID newId) {
        itemUid = newId;
    }

    public ItemUID getItemUID() {
        return itemUid;
    }

    @Override
    public String getTipString(MouseEvent me) {
        ToDoItem item = hitClarifier(me.getX(), me.getY());
        String tip = "";
        if (item != null
            && Globals.curEditor().getSelectionManager().containsFig(this)) {
            tip = item.getHeadline();
        } else if (getOwner() != null) {
            try {
                tip = Model.getFacade().getTipString(getOwner());
            } catch (InvalidElementException e) {
                LOG.log(Level.WARNING, "A deleted element still exists on the diagram");
                return Translator.localize("misc.name.deleted");
            }
        } else {
            tip = toString();
        }

        if (tip != null && tip.length() > 0 && !tip.endsWith(" ")) {
            tip += " ";
        }
        return tip;
    }

    @Override
    public Vector getPopUpActions(MouseEvent me) {
        ActionList popUpActions =
            new ActionList(super.getPopUpActions(me), isReadOnly());

        addModuleActions(popUpActions);
        addStandardActions(popUpActions);
        addCritiquesIfNeeded(popUpActions, me);
        addStereotypeActions(popUpActions);

        return popUpActions;
    }

    private void addModuleActions(ActionList list) {
        final List<Action> modulesActions =
            ContextActionFactoryManager.getContextPopupActions();

        for (Action a : modulesActions) {
            if (a instanceof List) {
                JMenu m = new JMenu((Action) a);
                list.add(m);
                for (Action subAction : (List<Action>) a) {
                    m.add(subAction);
                }
            } else {
                list.add(a);
            }
        }
    }

    private void addStandardActions(ActionList list) {
        list.add(new JSeparator());
        popupAddOffset = 1;
        if (removeFromDiagram) {
            list.add(ProjectActions.getInstance().getRemoveFromDiagramAction());
            popupAddOffset++;
        }
        list.add(new ActionDeleteModelElements());
        popupAddOffset++;
    }

    private void addCritiquesIfNeeded(ActionList list, MouseEvent me) {
        if (TargetManager.getInstance().getTargets().size() != 1) {
            return;
        }
        ToDoList todoList = Designer.theDesigner().getToDoList();
        List<ToDoItem> items = todoList.elementListForOffender(getOwner());
        if (items == null || items.isEmpty()) {
            return;
        }

        ArgoJMenu critiques = new ArgoJMenu("menu.popup.critiques");
        ToDoItem itemUnderMouse = hitClarifier(me.getX(), me.getY());
        if (itemUnderMouse != null) {
            critiques.add(new ActionGoToCritique(itemUnderMouse));
            critiques.addSeparator();
        }
        for (ToDoItem item : items) {
            if (item == itemUnderMouse) {
                continue;
            }
            critiques.add(new ActionGoToCritique(item));
        }
        list.add(0, new JSeparator());
        list.add(0, critiques);
    }

    private void addStereotypeActions(ActionList list) {
        Action[] stereoActions = getApplyStereotypeActions();
        if (stereoActions == null || stereoActions.length == 0) {
            return;
        }
        list.add(0, new JSeparator());
        ArgoJMenu stereotypes = new ArgoJMenu(
                "menu.popup.apply-stereotypes");
        for (Action a : stereoActions) {
            stereotypes.addCheckItem(a);
        }
        list.add(0, stereotypes);
    }

    protected Action[] getApplyStereotypeActions() {
        Collection<Object> elements = new ArrayList<Object>();
        Object owner = getOwner();
        if (owner != null) {
            elements.add(owner);
        }
        for (Object o : TargetManager.getInstance().getTargets()) {
            Object element = null;
            if (Model.getFacade().isAUMLElement(o)) {
                element = o;
            } else if (o instanceof Fig) {
                element = ((Fig) o).getOwner();
            }
            if (element != null && element != owner) {
                elements.add(element);
            }
        }
        return StereotypeUtility.getApplyStereotypeActions(elements);
    }

    protected int getSquaredDistance(Point p1, Point p2) {
        int xSquared = p2.x - p1.x;
        xSquared *= xSquared;
        int ySquared = p2.y - p1.y;
        ySquared *= ySquared;
        return xSquared + ySquared;
    }

    public void paintClarifiers(Graphics g) {
        int iconPos = 25, gap = 1, xOff = -4, yOff = -4;
        Point p = new Point();
        ToDoList tdList = Designer.theDesigner().getToDoList();
        List<ToDoItem> items = tdList.elementListForOffender(getOwner());
        for (ToDoItem item : items) {
            Icon icon = item.getClarifier();
            if (icon instanceof Clarifier) {
                ((Clarifier) icon).setFig(this);
                ((Clarifier) icon).setToDoItem(item);
            }
            if (icon != null) {
                stuffPointAlongPerimeter(iconPos, p);
                icon.paintIcon(null, g, p.x + xOff, p.y + yOff);
                iconPos += icon.getIconWidth() + gap;
            }
        }
        items = tdList.elementListForOffender(this);
        for (ToDoItem item : items) {
            Icon icon = item.getClarifier();
            if (icon instanceof Clarifier) {
                ((Clarifier) icon).setFig(this);
                ((Clarifier) icon).setToDoItem(item);
            }
            if (icon != null) {
                stuffPointAlongPerimeter(iconPos, p);
                icon.paintIcon(null, g, p.x + xOff, p.y + yOff);
                iconPos += icon.getIconWidth() + gap;
            }
        }
    }

    public ToDoItem hitClarifier(int x, int y) {
        int iconPos = 25, xOff = -4, yOff = -4;
        Point p = new Point();
        ToDoList tdList = Designer.theDesigner().getToDoList();
        List<ToDoItem> items = tdList.elementListForOffender(getOwner());
        for (ToDoItem item : items) {
            Icon icon = item.getClarifier();
            stuffPointAlongPerimeter(iconPos, p);
            int width = icon.getIconWidth();
            int height = icon.getIconHeight();
            if (y >= p.y + yOff
                && y <= p.y + height + yOff
                && x >= p.x + xOff
                && x <= p.x + width + xOff) {
                return item;
            }
            iconPos += width;
        }
        for (ToDoItem item : items) {
            Icon icon = item.getClarifier();
            if (icon instanceof Clarifier) {
                ((Clarifier) icon).setFig(this);
                ((Clarifier) icon).setToDoItem(item);
                if (((Clarifier) icon).hit(x, y)) {
                    return item;
                }
            }
        }
        items = tdList.elementListForOffender(this);
        for (ToDoItem item : items) {
            Icon icon = item.getClarifier();
            stuffPointAlongPerimeter(iconPos, p);
            int width = icon.getIconWidth();
            int height = icon.getIconHeight();
            if (y >= p.y + yOff
                && y <= p.y + height + yOff
                && x >= p.x + xOff
                && x <= p.x + width + xOff) {
                return item;
            }
            iconPos += width;
        }
        for (ToDoItem item : items) {
            Icon icon = item.getClarifier();
            if (icon instanceof Clarifier) {
                ((Clarifier) icon).setFig(this);
                ((Clarifier) icon).setToDoItem(item);
                if (((Clarifier) icon).hit(x, y)) {
                    return item;
                }
            }
        }
        return null;
    }

    @Override
    public Selection makeSelection() {
        return new SelectionRerouteEdge(this);
    }

    protected FigText getNameFig() {
        return nameFig;
    }

    public Rectangle getNameBounds() {
        return nameFig.getBounds();
    }

    public String getName() {
        return nameFig.getText();
    }

    protected FigStereotypesGroup getStereotypeFig() {
        return stereotypeFig;
    }

    public void vetoableChange(PropertyChangeEvent pce) {
        Object src = pce.getSource();
        if (src == getOwner()) {
            DelayedChangeNotify delayedNotify =
                new DelayedChangeNotify(this, pce);
            SwingUtilities.invokeLater(delayedNotify);
        }
    }

    public void delayedVetoableChange(PropertyChangeEvent pce) {
        renderingChanged();
        Rectangle bbox = getBounds();
        setBounds(bbox.x, bbox.y, bbox.width, bbox.height);
        endTrans();
    }

    @Override
    public void propertyChange(final PropertyChangeEvent pve) {
        Object src = pve.getSource();
        String pName = pve.getPropertyName();
        if (pve instanceof DeleteInstanceEvent && src == getOwner()) {
            Runnable doWorkRunnable = new Runnable() {
                public void run() {
                    try {
                        removeFromDiagram();
                    } catch (InvalidElementException e) {
                        LOG.log(Level.SEVERE, "updateLayout method accessed "
                                    + "deleted element", e);
                    }
                }
            };
            SwingUtilities.invokeLater(doWorkRunnable);
            return;
        }
        if (pName.equals("editing")
                && Boolean.FALSE.equals(pve.getNewValue())) {
            LOG.log(Level.FINE, "finished editing");
            textEdited((FigText) src);
            calcBounds();
            endTrans();
        } else if (pName.equals("editing")
                && Boolean.TRUE.equals(pve.getNewValue())) {
            textEditStarted((FigText) src);
        } else {
            super.propertyChange(pve);
        }

        if (Model.getFacade().isAUMLElement(src)
                && getOwner() != null
                && !Model.getUmlFactory().isRemoved(getOwner())) {
            modelChanged(pve);
            final UmlChangeEvent event = (UmlChangeEvent) pve;
            Runnable doWorkRunnable = new Runnable() {
                public void run() {
                    try {
                        updateLayout(event);
                    } catch (InvalidElementException e) {
                        LOG.log(Level.FINE, "updateLayout method accessed deleted element ", e);
                    }
                }
            };
            SwingUtilities.invokeLater(doWorkRunnable);
        }
    }

    protected void modelAttributeChanged(AttributeChangeEvent ace) {
    }

    protected void modelAssociationAdded(AddAssociationEvent aae) {
    }

    protected void modelAssociationRemoved(RemoveAssociationEvent rae) {
    }

    protected void updateLayout(UmlChangeEvent event) {
    }

    protected void textEditStarted(FigText ft) {
        if (ft == getNameFig()) {
            showHelp(notationProviderName.getParsingHelp());
            ft.setText(notationProviderName.toString(getOwner(),
                    getNotationSettings()));
        }
    }

    protected void showHelp(String s) {
        ArgoEventPump.fireEvent(new ArgoHelpEvent(
                ArgoEventTypes.HELP_CHANGED, this,
                Translator.localize(s)));
    }

    protected void textEdited(FigText ft) {
        if (ft == nameFig) {
            if (getOwner() == null) {
                return;
            }
            notationProviderName.parse(getOwner(), ft.getText());
            ft.setText(notationProviderName.toString(getOwner(),
                    getNotationSettings()));
        }
    }

    protected boolean canEdit(Fig f) {
        return true;
    }

    public void mousePressed(MouseEvent me) {
    }

    public void mouseReleased(MouseEvent me) {
    }

    public void mouseEntered(MouseEvent me) {
    }

    public void mouseExited(MouseEvent me) {
    }

    public void mouseClicked(MouseEvent me) {
        if (!me.isConsumed() && !isReadOnly() && me.getClickCount() >= 2) {
            Fig f = hitFig(new Rectangle(me.getX() - 2, me.getY() - 2, 4, 4));
            if (f instanceof MouseListener && canEdit(f)) {
                ((MouseListener) f).mouseClicked(me);
            }
        }
        me.consume();
    }

    private boolean isReadOnly() {
        Object owner = getOwner();
        if (Model.getFacade().isAUMLElement(owner)) {
            return Model.getModelManagementHelper().isReadOnly(owner);
        }
        return false;
    }

    public void keyPressed(KeyEvent ke) {
    }

    public void keyReleased(KeyEvent ke) {
    }

    public void keyTyped(KeyEvent ke) {
        if (!ke.isConsumed()
                && !isReadOnly()
                && nameFig != null
                && canEdit(nameFig)) {
            nameFig.keyTyped(ke);
        }
    }

    public void renderingChanged() {
        initNotationProviders(getOwner());
        updateNameText();
        updateStereotypeText();
        damage();
    }

    protected void modelChanged(PropertyChangeEvent e) {
        if (e instanceof DeleteInstanceEvent) {
            return;
        }

        if (e instanceof AssociationChangeEvent
                || e instanceof AttributeChangeEvent) {
            updateListeners(getOwner(), getOwner());
        }

        determineFigNodes();
    }

    protected void updateNameText() {
        if (notationProviderName != null
                && getOwner() != null
                && Model.getFacade().isANamedElement(getOwner())) {
            String nameStr = notationProviderName.toString(
                    getOwner(), getNotationSettings());
            nameFig.setText(nameStr);
            updateFont();
            calcBounds();
            setBounds(getBounds());
        }
    }

    protected void updateStereotypeText() {
        if (getOwner() == null) {
            return;
        }
        stereotypeFig.populate();
    }

    protected void initNotationProviders(Object own) {
        if (notationProviderName != null) {
            notationProviderName.cleanListener();
        }
        if (Model.getFacade().isANamedElement(own)) {
            final NotationName notation = Notation.findNotation(
                    getNotationSettings().getNotationLanguage());
            notationProviderName =
                NotationProviderFactory2.getInstance().getNotationProvider(
                        getNotationProviderType(), own, this,
                        notation);
        }
    }

    protected int getNotationProviderType() {
        return NotationProviderFactory2.TYPE_NAME;
    }

    protected void updateListeners(Object oldOwner, Object newOwner) {
        Set<Object[]> l = new HashSet<Object[]>();
        if (newOwner != null) {
            l.add(new Object[] {newOwner, "remove"});
        }
        updateElementListeners(l);
    }

    @Override
    public void setLayer(Layer lay) {
        super.setLayer(lay);
        getFig().setLayer(lay);
        for (Fig f : (List<Fig>) getPathItemFigs()) {
            f.setLayer(lay);
        }
    }

    @Override
    public void deleteFromModel() {
        Object own = getOwner();
        if (own != null) {
            getProject().moveToTrash(own);
        }
        Iterator it = getPathItemFigs().iterator();
        while (it.hasNext()) {
            ((Fig) it.next()).deleteFromModel();
        }
        super.deleteFromModel();
    }

    @Deprecated
    public void notationChanged(ArgoNotationEvent event) {
        if (getOwner() == null) {
            return;
        }
        renderingChanged();
    }

    @Deprecated
    public void notationAdded(ArgoNotationEvent event) {
    }

    @Deprecated
    public void notationRemoved(ArgoNotationEvent event) {
    }

    @Deprecated
    public void notationProviderAdded(ArgoNotationEvent event) {
    }

    @Deprecated
    public void notationProviderRemoved(ArgoNotationEvent event) {
    }

    @Override
    public boolean hit(Rectangle r) {
        Iterator it = getPathItemFigs().iterator();
        while (it.hasNext()) {
            Fig f = (Fig) it.next();
            if (f.hit(r)) {
                return true;
            }
        }
        return super.hit(r);
    }

    @Override
    public final void removeFromDiagram() {
        Fig delegate = getRemoveDelegate();
        if (delegate instanceof FigNodeModelElement) {
            ((FigNodeModelElement) delegate).removeFromDiagramImpl();
        } else if (delegate instanceof FigEdgeModelElement) {
            ((FigEdgeModelElement) delegate).removeFromDiagramImpl();
        } else if (delegate != null) {
            removeFromDiagramImpl();
        }
    }

    protected Fig getRemoveDelegate() {
        return this;
    }

    protected void removeFromDiagramImpl() {
        Object o = getOwner();
        if (o != null) {
            removeElementListener(o);
        }
        if (notationProviderName != null) {
            notationProviderName.cleanListener();
        }
        Iterator it = getPathItemFigs().iterator();
        while (it.hasNext()) {
            Fig fig = (Fig) it.next();
            fig.removeFromDiagram();
        }
        super.removeFromDiagram();
        damage();
    }

    protected void superRemoveFromDiagram() {
        super.removeFromDiagram();
    }

    @Override
    public void damage() {
        super.damage();
        getFig().damage();
    }

    protected boolean determineFigNodes() {
        Object owner = getOwner();
        if (owner == null) {
            LOG.log(Level.SEVERE, "The FigEdge has no owner");
            return false;
        }
        if (getLayer() == null) {
            LOG.log(Level.SEVERE, "The FigEdge has no layer");
            return false;
        }

        Object newSource = getSource();
        Object newDest = getDestination();

        Fig currentSourceFig = getSourceFigNode();
        Fig currentDestFig = getDestFigNode();
        Object currentSource = null;
        Object currentDestination = null;
        if (currentSourceFig != null && currentDestFig != null) {
            currentSource = currentSourceFig.getOwner();
            currentDestination = currentDestFig.getOwner();
        }
        if (newSource != currentSource || newDest != currentDestination) {
            Fig newSourceFig = getNoEdgePresentationFor(newSource);
            Fig newDestFig = getNoEdgePresentationFor(newDest);
            if (newSourceFig != currentSourceFig) {
                setSourceFigNode((FigNode) newSourceFig);
                setSourcePortFig(newSourceFig);
            }
            if (newDestFig != currentDestFig) {
                setDestFigNode((FigNode) newDestFig);
                setDestPortFig(newDestFig);
            }
            ((FigNode) newSourceFig).updateEdges();
            ((FigNode) newDestFig).updateEdges();
            calcBounds();

            if (newSourceFig == newDestFig) {
                layoutThisToSelf();
            }
        }

        return true;
    }

    private Fig getNoEdgePresentationFor(Object element) {
        if (element == null) {
            throw new IllegalArgumentException("Can't search for a null owner");
        }

        List contents = PgmlUtility.getContentsNoEdges(getLayer());
        int figCount = contents.size();
        for (int figIndex = 0; figIndex < figCount; ++figIndex) {
            Fig fig = (Fig) contents.get(figIndex);
            if (fig.getOwner() == element) {
                return fig;
            }
        }
        throw new IllegalStateException("Can't find a FigNode representing "
                + Model.getFacade().getName(element));
    }

    private void layoutThisToSelf() {
        FigPoly edgeShape = new FigPoly();
        Point fcCenter =
            new Point(getSourceFigNode().getX() / 2,
                    getSourceFigNode().getY() / 2);
        Point centerRight =
            new Point(
		      (int) (fcCenter.x
			     + getSourceFigNode().getSize().getWidth() / 2),
		      fcCenter.y);

        int yoffset = (int) ((getSourceFigNode().getSize().getHeight() / 2));
        edgeShape.addPoint(fcCenter.x, fcCenter.y);
        edgeShape.addPoint(centerRight.x, centerRight.y);
        edgeShape.addPoint(centerRight.x + 30, centerRight.y);
        edgeShape.addPoint(centerRight.x + 30, centerRight.y + yoffset);
        edgeShape.addPoint(centerRight.x, centerRight.y + yoffset);

        this.setBetweenNearestPoints(true);
        edgeShape.setLineColor(LINE_COLOR);
        edgeShape.setFilled(false);
        edgeShape.setComplete(true);
        this.setFig(edgeShape);
    }

    protected Object getSource() {
        Object owner = getOwner();
        if (owner != null) {
            return Model.getCoreHelper().getSource(owner);
        }
        return null;
    }

    public Object getSourceConnector() {
        return null;
    }

    public Object getDestinationConnector() {
        return null;
    }

    protected Object getDestination() {
        Object owner = getOwner();
        if (owner != null) {
            return Model.getCoreHelper().getDestination(owner);
        }
        return null;
    }

    protected void allowRemoveFromDiagram(boolean allowed) {
        this.removeFromDiagram = allowed;
    }

    public void setDiElement(DiElement element) {
        this.diElement = element;
    }

    public DiElement getDiElement() {
        return diElement;
    }

    protected static int getPopupAddOffset() {
        return popupAddOffset;
    }

    protected void addElementListener(Object element) {
        listeners.add(new Object[] {element, null});
        Model.getPump().addModelEventListener(this, element);
    }

    protected void addElementListener(Object element, String property) {
        listeners.add(new Object[] {element, property});
        Model.getPump().addModelEventListener(this, element, property);
    }

    protected void addElementListener(Object element, String[] property) {
        listeners.add(new Object[] {element, property});
        Model.getPump().addModelEventListener(this, element, property);
    }

    protected void removeElementListener(Object element) {
        listeners.remove(new Object[] {element, null});
        Model.getPump().removeModelEventListener(this, element);
    }

    protected void removeAllElementListeners() {
        removeElementListeners(listeners);
    }

    private void removeElementListeners(Set<Object[]> listenerSet) {
        for (Object[] listener : listenerSet) {
            Object property = listener[1];
            if (property == null) {
                Model.getPump().removeModelEventListener(this, listener[0]);
            } else if (property instanceof String[]) {
                Model.getPump().removeModelEventListener(this, listener[0],
                        (String[]) property);
            } else if (property instanceof String) {
                Model.getPump().removeModelEventListener(this, listener[0],
                        (String) property);
            } else {
                throw new RuntimeException(
                        "Internal error in removeAllElementListeners");
            }
        }
        listeners.removeAll(listenerSet);
    }

    private void addElementListeners(Set<Object[]> listenerSet) {
        for (Object[] listener : listenerSet) {
            Object property = listener[1];
            if (property == null) {
                addElementListener(listener[0]);
            } else if (property instanceof String[]) {
                addElementListener(listener[0], (String[]) property);
            } else if (property instanceof String) {
                addElementListener(listener[0], (String) property);
            } else {
                throw new RuntimeException(
                        "Internal error in addElementListeners");
            }
        }
    }

    protected void updateElementListeners(Set<Object[]> listenerSet) {
        Set<Object[]> removes = new HashSet<Object[]>(listeners);
        removes.removeAll(listenerSet);
        removeElementListeners(removes);

        Set<Object[]> adds = new HashSet<Object[]>(listenerSet);
        adds.removeAll(listeners);
        addElementListeners(adds);
    }

    @SuppressWarnings("deprecation")
    @Deprecated
    public void setProject(Project project) {
        throw new UnsupportedOperationException();
    }

    @Deprecated
    public Project getProject() {
        return ArgoFigUtil.getProject(this);
    }

    @Deprecated
    public void diagramFontChanged(ArgoDiagramAppearanceEvent e) {
        updateFont();
        calcBounds();
        redraw();
    }

    protected void updateFont() {
        int style = getNameFigFontStyle();
        Font f = getSettings().getFont(style);
        nameFig.setFont(f);
        deepUpdateFont(this);
    }

    protected int getNameFigFontStyle() {
        return Font.PLAIN;
    }

    private void deepUpdateFont(FigEdge fe) {
        Font f = getSettings().getFont(Font.PLAIN);
        for (Object pathFig : fe.getPathItemFigs()) {
            deepUpdateFontRecursive(f, pathFig);
        }
        fe.calcBounds();
    }

    private void deepUpdateFontRecursive(Font f, Object pathFig) {
        if (pathFig instanceof ArgoFigText) {
            ((ArgoFigText) pathFig).updateFont();
        } else if (pathFig instanceof FigText) {
            ((FigText) pathFig).setFont(f);
        } else if (pathFig instanceof FigGroup) {
            for (Object fge : ((FigGroup) pathFig).getFigs()) {
                deepUpdateFontRecursive(f, fge);
            }
        }
    }

    public DiagramSettings getSettings() {
        if (settings == null) {
            LOG.log(Level.FINE, "Falling back to project-wide settings");
            Project p = getProject();
            if (p != null) {
                return p.getProjectSettings().getDefaultDiagramSettings();
            }
        }
        return settings;
    }

    public void setSettings(DiagramSettings renderSettings) {
        settings = renderSettings;
        renderingChanged();
    }

    protected NotationSettings getNotationSettings() {
        return getSettings().getNotationSettings();
    }

    public void setLineColor(Color c) {
        super.setLineColor(c);
        ArrowHead arrow = getDestArrowHead();
        if (arrow != null) {
            arrow.setLineColor(getLineColor());
        }
    }

    public void setFig(Fig f) {
        super.setFig(f);
        f.setLineColor(getLineColor());
        f.setLineWidth(getLineWidth());
    }

    @SuppressWarnings("deprecation")
    @Deprecated
    public void setOwner(Object owner) {
        if (owner != getOwner()) {
            throw new UnsupportedOperationException(
                    "Owner must be set in constructor and left unchanged");
        }
    }

    public void computeRouteImpl() {
        Fig sourcePortFig = getSourcePortFig();
        Fig destPortFig = getDestPortFig();

        if (sourcePortFig instanceof FigNodeModelElement) {
            sourcePortFig = ((FigNodeModelElement) sourcePortFig).getBigPort();
        }

        if (destPortFig instanceof FigNodeModelElement) {
            destPortFig = ((FigNodeModelElement) destPortFig).getBigPort();
        }

        if (!(sourcePortFig instanceof FigCircle)
                || !(destPortFig instanceof FigCircle)) {
            super.computeRouteImpl();
        } else {
            if (!_initiallyLaidOut) {
                layoutEdge();
                _initiallyLaidOut = true;
            }
            FigPoly p = ((FigPoly) getFig());

            Point srcPt = sourcePortFig.getCenter();
            Point dstPt = destPortFig.getCenter();

            if (_useNearest) {
                if (p.getNumPoints() == 2) {
                    srcPt = sourcePortFig.connectionPoint(p.getPoint(1));
                    dstPt = destPortFig.connectionPoint(p
                            .getPoint(p.getNumPoints() - 2));
                    srcPt = sourcePortFig.connectionPoint(dstPt);
                    dstPt = destPortFig.connectionPoint(srcPt);

                    final int delta = 3;
                    double angle = Geometry.segmentAngle(srcPt, dstPt);
                    double mod = angle % 90;
                    final boolean snapStraight = (mod != 0 && (mod < delta || mod > 90 - delta));

                    if (snapStraight) {
                        int newX = (srcPt.x + dstPt.x) / 2;
                        int newY = (srcPt.y + dstPt.y) / 2;
                        if (newX < getSourcePortFig().getX() + getSourcePortFig().getWidth()
                                && newX >= getSourcePortFig().getX()) {
                            srcPt.x = newX;
                            dstPt.x = newX;
                        } else if (newY >= getSourcePortFig().getY()
                                && newY < getSourcePortFig().getY() + getSourcePortFig().getHeight()) {
                            srcPt.y = newY;
                            dstPt.y = newY;
                        }
                    }
                } else {
                    srcPt = sourcePortFig.connectionPoint(p.getPoint(1));
                    dstPt = destPortFig.connectionPoint(p
                            .getPoint(p.getNumPoints() - 2));
                }
            }

            setEndPoints(srcPt, dstPt);
            calcBounds();
        }
    }

    public void notationRenderingChanged(NotationProvider np, String rendering) {
        if (notationProviderName == np) {
            nameFig.setText(rendering);
            damage();
        }
    }

    public NotationSettings getNotationSettings(NotationProvider np) {
        if (notationProviderName == np) {
            return getNotationSettings();
        }
        return null;
    }

    public Object getOwner(NotationProvider np) {
        if (notationProviderName == np) {
            return getOwner();
        }
        return null;
    }
}