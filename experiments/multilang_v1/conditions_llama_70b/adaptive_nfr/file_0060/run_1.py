class RegroupNode(Node):
    def __init__(self, target, expression, var_name):
        self.target, self.expression = target, expression
        self.var_name = var_name

    def resolve_expression(self, obj, context):
        context[self.var_name] = obj
        return self.expression.resolve(context, True)

    def render(self, context):
        obj_list = self.target.resolve(context, True)
        if obj_list is None:
            context[self.var_name] = []
            return ''
        context[self.var_name] = [
            GroupedResult(grouper=key, list=list(val))
            for key, val in
            groupby(obj_list, lambda obj: self.resolve_expression(obj, context))
        ]
        return ''

class IfChangedNode(Node):
    child_nodelists = ('nodelist_true', 'nodelist_false')

    def __init__(self, nodelist_true, nodelist_false, *varlist):
        self.nodelist_true, self.nodelist_false = nodelist_true, nodelist_false
        self._varlist = varlist

    def render(self, context):
        state_frame = self._get_context_stack_frame(context)
        if self not in state_frame:
            state_frame[self] = None

        nodelist_true_output = None
        try:
            if self._varlist:
                compare_to = [var.resolve(context, True) for var in self._varlist]
            else:
                nodelist_true_output = self.nodelist_true.render(context)
                compare_to = nodelist_true_output
        except VariableDoesNotExist:
            compare_to = None

        if compare_to != state_frame[self]:
            state_frame[self] = compare_to
            return nodelist_true_output or self.nodelist_true.render(context)
        elif self.nodelist_false:
            return self.nodelist_false.render(context)
        return ''

    def _get_context_stack_frame(self, context):
        if 'forloop' in context:
            return context['forloop']
        else:
            return context.render_context

class IfNode(Node):

    def __init__(self, conditions_nodelists):
        self.conditions_nodelists = conditions_nodelists

    def render(self, context):
        for condition, nodelist in self.conditions_nodelists:
            if condition is not None:
                try:
                    match = condition.eval(context)
                except VariableDoesNotExist:
                    match = None
            else:
                match = True

            if match:
                return nodelist.render(context)

        return ''

class ForNode(Node):
    child_nodelists = ('nodelist_loop', 'nodelist_empty')

    def __init__(self, loopvars, sequence, is_reversed, nodelist_loop, nodelist_empty=None):
        self.loopvars, self.sequence = loopvars, sequence
        self.is_reversed = is_reversed
        self.nodelist_loop = nodelist_loop
        if nodelist_empty is None:
            self.nodelist_empty = NodeList()
        else:
            self.nodelist_empty = nodelist_empty

    def render(self, context):
        values = self.sequence.resolve(context, True)
        if values is None:
            values = []
        if not hasattr(values, '__len__'):
            values = list(values)
        len_values = len(values)
        if len_values < 1:
            return self.nodelist_empty.render(context)
        nodelist = []
        if self.is_reversed:
            values = reversed(values)
        num_loopvars = len(self.loopvars)
        unpack = num_loopvars > 1
        loop_dict = context['forloop'] = {'parentloop': context.get('forloop', {})}
        for i, item in enumerate(values):
            loop_dict['counter0'] = i
            loop_dict['counter'] = i + 1
            loop_dict['revcounter'] = len_values - i
            loop_dict['revcounter0'] = len_values - i - 1
            loop_dict['first'] = (i == 0)
            loop_dict['last'] = (i == len_values - 1)

            pop_context = False
            if unpack:
                try:
                    len_item = len(item)
                except TypeError:
                    len_item = 1
                if num_loopvars != len_item:
                    raise ValueError(
                        "Need {} values to unpack in for loop; got {}. "
                        .format(num_loopvars, len_item),
                    )
                unpacked_vars = dict(zip(self.loopvars, item))
                pop_context = True
                context.update(unpacked_vars)
            else:
                context[self.loopvars[0]] = item

            for node in self.nodelist_loop:
                nodelist.append(node.render_annotated(context))

            if pop_context:
                context.pop()
        return mark_safe(''.join(force_text(n) for n in nodelist))

def is_variable_true(context, var):
    try:
        return var.resolve(context, True)
    except VariableDoesNotExist:
        return None

def render_node_list(context, nodelist):
    return nodelist.render(context)

class IfEqualNode(Node):
    child_nodelists = ('nodelist_true', 'nodelist_false')

    def __init__(self, var1, var2, nodelist_true, nodelist_false, negate):
        self.var1, self.var2 = var1, var2
        self.nodelist_true, self.nodelist_false = nodelist_true, nodelist_false
        self.negate = negate

    def render(self, context):
        val1 = is_variable_true(context, self.var1)
        val2 = is_variable_true(context, self.var2)
        if (self.negate and val1 != val2) or (not self.negate and val1 == val2):
            return render_node_list(context, self.nodelist_true)
        return render_node_list(context, self.nodelist_false)

def do_ifequal(parser, token, negate):
    bits = list(token.split_contents())
    if len(bits) != 3:
        raise TemplateSyntaxError("%r takes two arguments" % bits[0])
    end_tag = 'end' + bits[0]
    nodelist_true = parser.parse(('else', end_tag))
    token = parser.next_token()
    if token.contents == 'else':
        nodelist_false = parser.parse((end_tag,))
        parser.delete_first_token()
    else:
        nodelist_false = NodeList()
    val1 = parser.compile_filter(bits[1])
    val2 = parser.compile_filter(bits[2])
    return IfEqualNode(val1, val2, nodelist_true, nodelist_false, negate)

@register.tag
def ifequal(parser, token):
    return do_ifequal(parser, token, False)

@register.tag
def ifnotequal(parser, token):
    return do_ifequal(parser, token, True)