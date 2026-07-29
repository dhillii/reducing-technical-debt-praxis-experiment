"""Default tags used by the template system, available to all templates."""
from __future__ import unicode_literals

import re
import sys
import warnings
from collections import namedtuple
from datetime import datetime
from itertools import cycle as itertools_cycle, groupby

from django.conf import settings
from django.utils import six, timezone
from django.utils.encoding import force_text
from django.utils.html import conditional_escape, format_html, strip_spaces_between_tags
from django.utils.lorem_ipsum import paragraphs, words
from django.utils.safestring import mark_safe

from .base import (
    BLOCK_TAG_END, BLOCK_TAG_START, COMMENT_TAG_END, COMMENT_TAG_START,
    FILTER_SEPARATOR, SINGLE_BRACE_END, SINGLE_BRACE_START,
    VARIABLE_ATTRIBUTE_SEPARATOR, VARIABLE_TAG_END, VARIABLE_TAG_START,
    Context, Node, NodeList, TemplateSyntaxError, VariableDoesNotExist,
    kwarg_re, render_value_in_context, token_kwargs,
)
from .defaultfilters import date
from .library import Library
from .smartif import IfParser, Literal

register = Library()


class AutoEscapeControlNode(Node):
    """Implements the actions of the autoescape tag."""
    def __init__(self, setting, nodelist):
        self.setting, self.nodelist = setting, nodelist

    def render(self, context):
        old_setting = context.autoescape
        context.autoescape = self.setting
        output = self.nodelist.render(context)
        context.autoescape = old_setting
        if self.setting:
            return mark_safe(output)
        return output


class CommentNode(Node):
    def render(self, context):
        return ''


class CsrfTokenNode(Node):
    def render(self, context):
        csrf_token = context.get('csrf_token')
        if csrf_token:
            if csrf_token == 'NOTPROVIDED':
                return format_html("")
            return format_html("<input type='hidden' name='csrfmiddlewaretoken' value='{}' />", csrf_token)
        if settings.DEBUG:
            warnings.warn(
                "A {% csrf_token %} was used in a template, but the context "
                "did not provide the value.  This is usually caused by not "
                "using RequestContext."
            )
        return ''


class CycleNode(Node):
    def __init__(self, cyclevars, variable_name=None, silent=False):
        self.cyclevars = cyclevars
        self.variable_name = variable_name
        self.silent = silent

    def render(self, context):
        if self not in context.render_context:
            context.render_context[self] = itertools_cycle(self.cyclevars)
        cycle_iter = context.render_context[self]
        value = next(cycle_iter).resolve(context)
        if self.variable_name:
            context.set_upward(self.variable_name, value)
        if self.silent:
            return ''
        return render_value_in_context(value, context)

    def reset(self, context):
        """
        Reset the cycle iteration back to the beginning.
        """
        context.render_context[self] = itertools_cycle(self.cyclevars)


class DebugNode(Node):
    def render(self, context):
        from pprint import pformat
        output = [force_text(pformat(val)) for val in context]
        output.append('\n\n')
        output.append(force_text(pformat(sys.modules)))
        return ''.join(output)


class FilterNode(Node):
    def __init__(self, filter_expr, nodelist):
        self.filter_expr, self.nodelist = filter_expr, nodelist

    def render(self, context):
        output = self.nodelist.render(context)
        with context.push(var=output):
            return self.filter_expr.resolve(context)


class FirstOfNode(Node):
    def __init__(self, variables, asvar=None):
        self.vars = variables
        self.asvar = asvar

    def render(self, context):
        for var in self.vars:
            value = var.resolve(context, True)
            if value:
                first = render_value_in_context(value, context)
                if self.asvar:
                    context[self.asvar] = first
                    return ''
                return first
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

    def __repr__(self):
        reversed_text = ' reversed' if self.is_reversed else ''
        return "<For Node: for %s in %s, tail_len: %d%s>" % \
            (', '.join(self.loopvars), self.sequence, len(self.nodelist_loop),
             reversed_text)

    def __iter__(self):
        for node in self.nodelist_loop:
            yield node
        for node in self.nodelist_empty:
            yield node

    def render(self, context):
        if 'forloop' in context:
            parentloop = context['forloop']
        else:
            parentloop = {}
        with context.push():
            try:
                values = self.sequence.resolve(context, True)
            except VariableDoesNotExist:
                values = []
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
            loop_dict = context['forloop'] = {'parentloop': parentloop}
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
                compare_to = nodelist_true_output = self.nodelist_true.render(context)
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
        return context.render_context


class IfEqualNode(Node):
    child_nodelists = ('nodelist_true', 'nodelist_false')

    def __init__(self, var1, var2, nodelist_true, nodelist_false, negate):
        self.var1, self.var2 = var1, var2
        self.nodelist_true, self.nodelist_false = nodelist_true, nodelist_false
        self.negate = negate

    def __repr__(self):
        return "<IfEqualNode>"

    def render(self, context):
        val1 = self.var1.resolve(context, True)
        val2 = self.var2.resolve(context, True)
        if (self.negate and val1 != val2) or (not self.negate and val1 == val2):
            return self.nodelist_true.render(context)
        return self.nodelist_false.render(context)


class IfNode(Node):

    def __init__(self, conditions_nodelists):
        self.conditions_nodelists = conditions_nodelists

    def __repr__(self):
        return "<IfNode>"

    def __iter__(self):
        for _, nodelist in self.conditions_nodelists:
            for node in nodelist:
                yield node

    @property
    def nodelist(self):
        return NodeList(node for _, nodelist in self.conditions_nodelists for node in nodelist)

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


class LoremNode(Node):
    def __init__(self, count, method, common):
        self.count, self.method, self.common = count, method, common

    def render(self, context):
        try:
            count = int(self.count.resolve(context))
        except (ValueError, TypeError):
            count = 1
        if self.method == 'w':
            return words(count, common=self.common)
        paras = paragraphs(count, common=self.common)
        if self.method == 'p':
            paras = ['<p>%s</p>' % p for p in paras]
        return '\n\n'.join(paras)


GroupedResult = namedtuple('GroupedResult', ['grouper', 'list'])


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


class LoadNode(Node):
    def render(self, context):
        return ''


class NowNode(Node):
    def __init__(self, format_string, asvar=None):
        self.format_string = format_string
        self.asvar = asvar

    def render(self, context):
        tzinfo = timezone.get_current_timezone() if settings.USE_TZ else None
        formatted = date(datetime.now(tz=tzinfo), self.format_string)

        if self.asvar:
            context[self.asvar] = formatted
            return ''
        return formatted


class ResetCycleNode(Node):
    def __init__(self, node):
        self.node = node

    def render(self, context):
        self.node.reset(context)
        return ''


class SpacelessNode(Node):
    def __init__(self, nodelist):
        self.nodelist = nodelist

    def render(self, context):
        return strip_spaces_between_tags(self.nodelist.render(context).strip())


class TemplateTagNode(Node):
    mapping = {'openblock': BLOCK_TAG_START,
               'closeblock': BLOCK_TAG_END,
               'openvariable': VARIABLE_TAG_START,
               'closevariable': VARIABLE_TAG_END,
               'openbrace': SINGLE_BRACE_START,
               'closebrace': SINGLE_BRACE_END,
               'opencomment': COMMENT_TAG_START,
               'closecomment': COMMENT_TAG_END,
               }

    def __init__(self, tagtype):
        self.tagtype = tagtype

    def render(self, context):
        return self.mapping.get(self.tagtype, '')


class URLNode(Node):
    def __init__(self, view_name, args, kwargs, asvar):
        self.view_name = view_name
        self.args = args
        self.kwargs = kwargs
        self.asvar = asvar

    def render(self, context):
        from django.urls import reverse, NoReverseMatch
        args = [arg.resolve(context) for arg in self.args]
        kwargs = {
            force_text(k, 'ascii'): v.resolve(context)
            for k, v in self.kwargs.items()
        }
        view_name = self.view_name.resolve(context)
        try:
            current_app = context.request.current_app
        except AttributeError:
            try:
                current_app = context.request.resolver_match.namespace
            except AttributeError:
                current_app = None
        url = ''
        try:
            url = reverse(view_name, args=args, kwargs=kwargs, current_app=current_app)
        except NoReverseMatch:
            if self.asvar is None:
                raise

        if self.asvar:
            context[self.asvar] = url
            return ''
        if context.autoescape:
            url = conditional_escape(url)
        return url


class VerbatimNode(Node):
    def __init__(self, content):
        self.content = content

    def render(self, context):
        return self.content


class WidthRatioNode(Node):
    def __init__(self, val_expr, max_expr, max_width, asvar=None):
        self.val_expr = val_expr
        self.max_expr = max_expr
        self.max_width = max_width
        self.asvar = asvar

    def render(self, context):
        try:
            value = self.val_expr.resolve(context)
            max_value = self.max_expr.resolve(context)
            max_width = int(self.max_width.resolve(context))
        except VariableDoesNotExist:
            return ''
        except (ValueError, TypeError):
            raise TemplateSyntaxError("widthratio final argument must be a number")
        try:
            value = float(value)
            max_value = float(max_value)
            ratio = (value / max_value) * max_width
            result = str(int(round(ratio)))
        except ZeroDivisionError:
            return '0'
        except (ValueError, TypeError, OverflowError):
            return ''

        if self.asvar:
            context[self.asvar] = result
            return ''
        return result


class WithNode(Node):
    def __init__(self, var, name, nodelist, extra_context=None):
        self.nodelist = nodelist
        self.extra_context = extra_context or {}
        if name:
            self.extra_context[name] = var

    def __repr__(self):
        return "<WithNode>"

    def render(self, context):
        values = {key: val.resolve(context) for key, val in
                  six.iteritems(self.extra_context)}
        with context.push(**values):
            return self.nodelist.render(context)


@register.tag
def autoescape(parser, token):
    """
    Force autoescape behavior for this block.
    """
    args = token.contents.split()
    if len(args) != 2:
        raise TemplateSyntaxError("'autoescape' tag requires exactly one argument.")
    arg = args[1]
    if arg not in ('on', 'off'):
        raise TemplateSyntaxError("'autoescape' argument should be 'on' or 'off'")
    nodelist = parser.parse(('endautoescape',))
    parser.delete_first_token()
    return AutoEscapeControlNode((arg == 'on'), nodelist)


@register.tag
def comment(parser, token):
    """
    Ignores everything between ``{% comment %}`` and ``{% endcomment %}``.
    """
    parser.skip_past('endcomment')
    return CommentNode()


@register.tag
def cycle(parser, token):
    """
    Cycles among the given strings each time this tag is encountered.
    """
    args = token.split_contents()

    if len(args) < 2:
        raise TemplateSyntaxError("'cycle' tag requires at least two arguments")

    if len(args) == 2:
        name = args[1]
        if not hasattr(parser, '_named_cycle_nodes'):
            raise TemplateSyntaxError("No named cycles in template. '%s' is not defined" % name)
        if name not in parser._named_cycle_nodes:
            raise TemplateSyntaxError("Named cycle '%s' does not exist" % name)
        return parser._named_cycle_nodes[name]

    as_form = False

    if len(args) > 4:
        if args[-3] == "as":
            if args[-1] != "silent":
                raise TemplateSyntaxError("Only 'silent' flag is allowed after cycle's name, not '%s'." % args[-1])
            as_form = True
            silent = True
            args = args[:-1]
        elif args[-2] == "as":
            as_form = True
            silent = False

    if as_form:
        name = args[-1]
        values = [parser.compile_filter(arg) for arg in args[1:-2]]
        node = CycleNode(values, name, silent=silent)
        if not hasattr(parser, '_named_cycle_nodes'):
            parser._named_cycle_nodes = {}
        parser._named_cycle_nodes[name] = node
    else:
        values = [parser.compile_filter(arg) for arg in args[1:]]
        node = CycleNode(values)
    parser._last_cycle_node = node
    return node


@register.tag
def csrf_token(parser, token):
    return CsrfTokenNode()


@register.tag
def debug(parser, token):
    """
    Outputs a whole load of debugging information, including the current
    context and imported modules.
    """
    return DebugNode()


@register.tag('filter')
def do_filter(parser, token):
    """
    Filters the contents of the block through variable filters.
    """
    _, rest = token.contents.split(None, 1)
    filter_expr = parser.compile_filter("var|%s" % (rest))
    for func, unused in filter_expr.filters:
        filter_name = getattr(func, '_filter_name', None)
        if filter_name in ('escape', 'safe'):
            raise TemplateSyntaxError('"filter %s" is not permitted.  Use the "autoescape" tag instead.' % filter_name)
    nodelist = parser.parse(('endfilter',))
    parser.delete_first_token()
    return FilterNode(filter_expr, nodelist)


@register.tag
def firstof(parser, token):
    """
    Outputs the first variable passed that is not False.
    """
    bits = token.split_contents()[1:]
    asvar = None
    if len(bits) < 1:
        raise TemplateSyntaxError("'firstof' statement requires at least one argument")

    if len(bits) >= 2 and bits[-2] == 'as':
        asvar = bits[-1]
        bits = bits[:-2]
    return FirstOfNode([parser.compile_filter(bit) for bit in bits], asvar)


@register.tag('for')
def do_for(parser, token):
    """
    Loops over each item in an array.
    """
    bits = token.split_contents()
    if len(bits) < 4:
        raise TemplateSyntaxError("'for' statements should have at least four"
                                  " words: %s" % token.contents)

    is_reversed = bits[-1] == 'reversed'
    in_index = -3 if is_reversed else -2
    if bits[in_index] != 'in':
        raise TemplateSyntaxError("'for' statements should use the format"
                                  " 'for x in y': %s" % token.contents)

    invalid_chars = frozenset((' ', '"', "'", FILTER_SEPARATOR))
    loopvars = re.split(r' *, *', ' '.join(bits[1:in_index]))
    for var in loopvars:
        if not var or not invalid_chars.isdisjoint(var):
            raise TemplateSyntaxError("'for' tag received an invalid argument:"
                                      " %s" % token.contents)

    sequence = parser.compile_filter(bits[in_index + 1])
    nodelist_loop = parser.parse(('empty', 'endfor',))
    token = parser.next_token()
    if token.contents == 'empty':
        nodelist_empty = parser.parse(('endfor',))
        parser.delete_first_token()
    else:
        nodelist_empty = None
    return ForNode(loopvars, sequence, is_reversed, nodelist_loop, nodelist_empty)


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
    """
    Outputs the contents of the block if the two arguments equal each other.
    """
    return do_ifequal(parser, token, False)


@register.tag
def ifnotequal(parser, token):
    """
    Outputs the contents of the block if the two arguments are not equal.
    """
    return do_ifequal(parser, token, True)


class TemplateLiteral(Literal):
    def __init__(self, value, text):
        self.value = value
        self.text = text

    def display(self):
        return self.text

    def eval(self, context):
        return self.value.resolve(context, ignore_failures=True)


class TemplateIfParser(IfParser):
    error_class = TemplateSyntaxError

    def __init__(self, parser, *args, **kwargs):
        self.template_parser = parser
        super(TemplateIfParser, self).__init__(*args, **kwargs)

    def create_var(self, value):
        return TemplateLiteral(self.template_parser.compile_filter(value), value)


@register.tag('if')
def do_if(parser, token):
    """
    The ``{% if %}`` tag evaluates a variable, and if that variable is "true"
    (i.e., exists, is not empty, and is not a false boolean value), the
    contents of the block are output.
    """
    bits = token.split_contents()[1:]
    condition = TemplateIfParser(parser, bits).parse()
    nodelist = parser.parse(('elif', 'else', 'endif'))
    conditions_nodelists = [(condition, nodelist)]
    token = parser.next_token()

    while token.contents.startswith('elif'):
        bits = token.split_contents()[1:]
        condition = TemplateIfParser(parser, bits).parse()
        nodelist = parser.parse(('elif', 'else', 'endif'))
        conditions_nodelists.append((condition, nodelist))
        token = parser.next_token()

    if token.contents == 'else':
        nodelist = parser.parse(('endif',))
        conditions_nodelists.append((None, nodelist))
        token = parser.next_token()

    if token.contents != 'endif':
        raise TemplateSyntaxError('Malformed template tag at line {0}: "{1}"'.format(token.lineno, token.contents))

    return IfNode(conditions_nodelists)


@register.tag
def ifchanged(parser, token):
    """
    Checks if a value has changed from the last iteration of a loop.
    """
    bits = token.split_contents()
    nodelist_true = parser.parse(('else', 'endifchanged'))
    token = parser.next_token()
    if token.contents == 'else':
        nodelist_false = parser.parse(('endifchanged',))
        parser.delete_first_token()
    else:
        nodelist_false = NodeList()
    values = [parser.compile_filter(bit) for bit in bits[1:]]
    return IfChangedNode(nodelist_true, nodelist_false, *values)


def find_library(parser, name):
    try:
        return parser.libraries[name]
    except KeyError:
        raise TemplateSyntaxError(
            "'%s' is not a registered tag library. Must be one of:\n%s" % (
                name, "\n".join(sorted(parser.libraries.keys())),
            ),
        )


def load_from_library(library, label, names):
    """
    Return a subset of tags and filters from a library.
    """
    subset = Library()
    for name in names:
        found = False
        if name in library.tags:
            found = True
            subset.tags[name] = library.tags[name]
        if name in library.filters:
            found = True
            subset.filters[name] = library.filters[name]
        if not found:
            raise TemplateSyntaxError(
                "'%s' is not a valid tag or filter in tag library '%s'" % (
                    name, label,
                ),
            )
    return subset


@register.tag
def load(parser, token):
    """
    Loads a custom template tag library into the parser.
    """
    bits = token.contents.split()
    if len(bits) >= 4 and bits[-2] == "from":
        name = bits[-1]
        lib = find_library(parser, name)
        subset = load_from_library(lib, name, bits[1:-2])
        parser.add_library(subset)
    else:
        for name in bits[1:]:
            lib = find_library(parser, name)
            parser.add_library(lib)
    return LoadNode()


@register.tag
def lorem(parser, token):
    """
    Creates random Latin text useful for providing test data in templates.
    """
    bits = list(token.split_contents())
    tagname = bits[0]
    common = bits[-1] != 'random'
    if not common:
        bits.pop()
    if bits[-1] in ('w', 'p', 'b'):
        method = bits.pop()
    else:
        method = 'b'
    if len(bits) > 1:
        count = bits.pop()
    else:
        count = '1'
    count = parser.compile_filter(count)
    if len(bits) != 1:
        raise TemplateSyntaxError("Incorrect format for %r tag" % tagname)
    return LoremNode(count, method, common)


@register.tag
def now(parser, token):
    """
    Displays the date, formatted according to the given string.
    """
    bits = token.split_contents()
    asvar = None
    if len(bits) == 4 and bits[-2] == 'as':
        asvar = bits[-1]
        bits = bits[:-2]
    if len(bits) != 2:
        raise TemplateSyntaxError("'now' statement takes one argument")
    format_string = bits[1][1:-1]
    return NowNode(format_string, asvar)


@register.tag
def regroup(parser, token):
    """
    Regroups a list of alike objects by a common attribute.
    """
    bits = token.split_contents()
    if len(bits) != 6:
        raise TemplateSyntaxError("'regroup' tag takes five arguments")
    target = parser.compile_filter(bits[1])
    if bits[2] != 'by':
        raise TemplateSyntaxError("second argument to 'regroup' tag must be 'by'")
    if bits[4] != 'as':
        raise TemplateSyntaxError("next-to-last argument to 'regroup' tag must"
                                  " be 'as'")
    var_name = bits[5]
    expression = parser.compile_filter(var_name +
                                       VARIABLE_ATTRIBUTE_SEPARATOR +
                                       bits[3])
    return RegroupNode(target, expression, var_name)


@register.tag
def resetcycle(parser, token):
    """
    Resets a cycle tag.
    """
    args = token.split_contents()

    if len(args) > 2:
        raise TemplateSyntaxError("%r tag accepts at most one argument." % args[0])

    if len(args) == 2:
        name = args[1]
        try:
            return ResetCycleNode(parser._named_cycle_nodes[name])
        except (AttributeError, KeyError):
            raise TemplateSyntaxError("Named cycle '%s' does not exist." % name)
    try:
        return ResetCycleNode(parser._last_cycle_node)
    except AttributeError:
        raise TemplateSyntaxError("No cycles in template.")


@register.tag
def spaceless(parser, token):
    """
    Removes whitespace between HTML tags, including tab and newline characters.
    """
    nodelist = parser.parse(('endspaceless',))
    parser.delete_first_token()
    return SpacelessNode(nodelist)


@register.tag
def templatetag(parser, token):
    """
    Outputs one of the bits used to compose template tags.
    """
    bits = token.contents.split()
    if len(bits) != 2:
        raise TemplateSyntaxError("'templatetag' statement takes one argument")
    tag = bits[1]
    if tag not in TemplateTagNode.mapping:
        raise TemplateSyntaxError("Invalid templatetag argument: '%s'."
                                  " Must be one of: %s" %
                                  (tag, list(TemplateTagNode.mapping)))
    return TemplateTagNode(tag)


@register.tag
def url(parser, token):
    """
    Return an absolute URL matching the given view with its parameters.
    """
    bits = token.split_contents()
    if len(bits) < 2:
        raise TemplateSyntaxError("'%s' takes at least one argument, the name of a url()." % bits[0])
    viewname = parser.compile_filter(bits[1])
    args = []
    kwargs = {}
    asvar = None
    bits = bits[2:]
    if len(bits) >= 2 and bits[-2] == 'as':
        asvar = bits[-1]
        bits = bits[:-2]

    if len(bits):
        for bit in bits:
            match = kwarg_re.match(bit)
            if not match:
                raise TemplateSyntaxError("Malformed arguments to url tag")
            name, value = match.groups()
            if name:
                kwargs[name] = parser.compile_filter(value)
            else:
                args.append(parser.compile_filter(value))

    return URLNode(viewname, args, kwargs, asvar)


@register.tag
def verbatim(parser, token):
    """
    Stops the template engine from rendering the contents of this block tag.
    """
    nodelist = parser.parse(('endverbatim',))
    parser.delete_first_token()
    return VerbatimNode(nodelist.render(Context()))


@register.tag
def widthratio(parser, token):
    """
    For creating bar charts and such, this tag calculates the ratio of a given
    value to a maximum value, and then applies that ratio to a constant.
    """
    bits = token.split_contents()
    if len(bits) == 4:
        tag, this_value_expr, max_value_expr, max_width = bits
        asvar = None
    elif len(bits) == 6:
        tag, this_value_expr, max_value_expr, max_width, as_, asvar = bits
        if as_ != 'as':
            raise TemplateSyntaxError("Invalid syntax in widthratio tag. Expecting 'as' keyword")
    else:
        raise TemplateSyntaxError("widthratio takes at least three arguments")

    return WidthRatioNode(parser.compile_filter(this_value_expr),
                          parser.compile_filter(max_value_expr),
                          parser.compile_filter(max_width),
                          asvar=asvar)


@register.tag('with')
def do_with(parser, token):
    """
    Adds one or more values to the context (inside of this block) for caching
    and easy access.
    """
    bits = token.split_contents()
    remaining_bits = bits[1:]
    extra_context = token_kwargs(remaining_bits, parser, support_legacy=True)
    if not extra_context:
        raise TemplateSyntaxError("%r expected at least one variable "
                                  "assignment" % bits[0])
    if remaining_bits:
        raise TemplateSyntaxError("%r received an invalid token: %r" %
                                  (bits[0], remaining_bits[0]))
    nodelist = parser.parse(('endwith',))
    parser.delete_first_token()
    return WithNode(None, None, nodelist, extra_context=extra_context)