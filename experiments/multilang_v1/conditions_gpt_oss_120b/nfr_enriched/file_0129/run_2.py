from django.utils.translation import ugettext as _
from django.utils.timezone import now as timezone_now
from django.conf import settings
from django.core import validators
from django.core.exceptions import ValidationError
from django.db import connection
from django.http import HttpRequest, HttpResponse
from typing import Dict, List, Set, Any, Callable, Iterable, \
    Optional, Tuple, Union, Sequence
from zerver.lib.exceptions import JsonableError, ErrorCode
from zerver.lib.html_diff import highlight_html_differences
from zerver.decorator import has_request_variables, \
    REQ, to_non_negative_int
from django.utils.html import escape as escape_html
from zerver.lib import bugdown
from zerver.lib.zcommand import process_zcommands
from zerver.lib.actions import recipient_for_emails, do_update_message_flags, \
    compute_irc_user_fullname, compute_jabber_user_fullname, \
    create_mirror_user_if_needed, check_send_message, do_update_message, \
    extract_recipients, truncate_body, render_incoming_message, do_delete_message, \
    do_mark_all_as_read, do_mark_stream_messages_as_read, \
    get_user_info_for_message_updates, check_schedule_message
from zerver.lib.addressee import raw_pm_with_emails
from zerver.lib.queue import queue_json_publish
from zerver.lib.message import (
    access_message,
    messages_for_ids,
    render_markdown,
    get_first_visible_message_id,
)
from zerver.lib.response import json_success, json_error
from zerver.lib.sqlalchemy_utils import get_sqlalchemy_connection
from zerver.lib.streams import access_stream_by_id, can_access_stream_history_by_name
from zerver.lib.timestamp import datetime_to_timestamp, convert_to_UTC
from zerver.lib.timezone import get_timezone
from zerver.lib.topic_mutes import exclude_topic_mutes
from zerver.lib.utils import statsd
from zerver.lib.validator import \
    check_list, check_int, check_dict, check_string, check_bool
from zerver.lib.zephyr import compute_mit_user_fullname
from zerver.models import Message, UserProfile, Stream, Subscription, Client,\
    Realm, RealmDomain, Recipient, UserMessage, bulk_get_recipients, get_personal_recipient, \
    get_stream, email_to_domain, get_realm, get_active_streams, \
    get_user_including_cross_realm, get_stream_recipient

from sqlalchemy import func
from sqlalchemy.sql import select, join, column, literal_column, literal, and_, \
    or_, not_, union_all, alias, Selectable, Select, ColumnElement, table

from dateutil.parser import parse as dateparser
import re
import ujson
import datetime

LARGER_THAN_MAX_MESSAGE_ID = 10000000000000000
MAX_MESSAGES_PER_FETCH = 5000


class BadNarrowOperator(JsonableError):
    code = ErrorCode.BAD_NARROW
    data_fields = ['desc']

    def __init__(self, desc: str) -> None:
        self.desc = desc  # type: str

    @staticmethod
    def msg_format() -> str:
        return _('Invalid narrow operator: {desc}')


# TODO: Should be Select, but sqlalchemy stubs are busted
Query = Any

# TODO: should be Callable[[ColumnElement], ColumnElement], but sqlalchemy stubs are busted
ConditionTransform = Any


class NarrowBuilder:
    '''
    Build up a SQLAlchemy query to find messages matching a narrow.
    '''

    _alphanum = frozenset(
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')

    def __init__(self, user_profile: UserProfile, msg_id_column: str) -> None:
        self.user_profile = user_profile
        self.msg_id_column = msg_id_column
        self.user_realm = user_profile.realm

    # Public entry point -------------------------------------------------

    def add_term(self, query: Query, term: Dict[str, Any]) -> Query:
        """
        Extend the given query to one narrowed by the given term, and return the result.
        """
        operator = term['operator']
        operand = term['operand']
        negated = term.get('negated', False)

        method_name = 'by_' + operator.replace('-', '_')
        method = getattr(self, method_name, None)
        if method is None:
            raise BadNarrowOperator('unknown operator ' + operator)

        maybe_negate = not_ if negated else lambda cond: cond
        return method(query, operand, maybe_negate)

    # Operator implementations --------------------------------------------

    def by_has(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        if operand not in ['attachment', 'image', 'link']:
            raise BadNarrowOperator("unknown 'has' operand " + operand)
        return query.where(maybe_negate(column('has_' + operand)))

    def by_in(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        if operand == 'home':
            conditions = exclude_muting_conditions(self.user_profile, [])
            return query.where(and_(*conditions))
        if operand == 'all':
            return query
        raise BadNarrowOperator("unknown 'in' operand " + operand)

    def by_is(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        condition = self._is_condition(operand)
        return query.where(maybe_negate(condition))

    def _is_condition(self, operand: str):
        flag = UserMessage.flags
        col = column("flags")
        if operand == 'private':
            return col.op("&")(flag.is_private.mask) != 0
        if operand == 'starred':
            return col.op("&")(flag.starred.mask) != 0
        if operand == 'unread':
            return col.op("&")(flag.read.mask) == 0
        if operand == 'mentioned':
            mentioned = col.op("&")(flag.mentioned.mask) != 0
            wildcard = col.op("&")(flag.wildcard_mentioned.mask) != 0
            return or_(mentioned, wildcard)
        if operand == 'alerted':
            return col.op("&")(flag.has_alert_word.mask) != 0
        raise BadNarrowOperator("unknown 'is' operand " + operand)

    def by_stream(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        try:
            stream = get_stream(operand, self.user_profile.realm)
        except Stream.DoesNotExist:
            raise BadNarrowOperator('unknown stream ' + operand)

        if self.user_profile.realm.is_zephyr_mirror_realm:
            return query.where(maybe_negate(self._zephyr_stream_condition(stream)))
        recipient = get_stream_recipient(stream.id)
        return query.where(maybe_negate(column("recipient_id") == recipient.id))

    def _zephyr_stream_condition(self, stream: Stream):
        base_name = re.search(r'^(?:un)*(.+?)(?:\.d)*$', stream.name, re.IGNORECASE).group(1)
        matching = get_active_streams(self.user_profile.realm).filter(
            name__iregex=r'^(un)*%s(\.d)*$' % (self._pg_re_escape(base_name),))
        ids = [s.id for s in matching]
        recipients = bulk_get_recipients(Recipient.STREAM, ids)
        return column("recipient_id").in_([r.id for r in recipients.values()])

    def by_topic(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        if self.user_profile.realm.is_zephyr_mirror_realm:
            cond = self._zephyr_topic_condition(operand)
        else:
            cond = func.upper(column("subject")) == func.upper(literal(operand))
        return query.where(maybe_negate(cond))

    def _zephyr_topic_condition(self, operand: str):
        base = re.search(r'^(.*?)(?:\.d)*$', operand, re.IGNORECASE).group(1)
        if base in ('', 'personal', '(instance "")'):
            literals = [
                "", ".d", ".d.d", ".d.d.d", ".d.d.d.d",
                "personal", "personal.d", "personal.d.d", "personal.d.d.d", "personal.d.d.d.d",
                '(instance "")', '(instance "").d', '(instance "").d.d',
                '(instance "").d.d.d', '(instance "").d.d.d.d'
            ]
            return or_(*[func.upper(column("subject")) == func.upper(literal(l)) for l in literals])
        else:
            variants = [base, base + ".d", base + ".d.d", base + ".d.d.d", base + ".d.d.d.d"]
            return or_(*[func.upper(column("subject")) == func.upper(literal(v)) for v in variants])

    def by_sender(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        try:
            sender = get_user_including_cross_realm(operand, self.user_realm)
        except UserProfile.DoesNotExist:
            raise BadNarrowOperator('unknown user ' + operand)
        return query.where(maybe_negate(column("sender_id") == literal(sender.id)))

    def by_near(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        return query

    def by_id(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        if not str(operand).isdigit():
            raise BadNarrowOperator("Invalid message ID")
        return query.where(maybe_negate(self.msg_id_column == literal(operand)))

    def by_pm_with(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        emails = raw_pm_with_emails(email_str=operand, my_email=self.user_profile.email)
        if not emails:
            raise BadNarrowOperator('empty pm-with clause')
        if len(emails) >= 2:
            return query.where(maybe_negate(self._huddle_condition(emails)))
        return query.where(maybe_negate(self._personal_pm_condition(emails[0])))

    def _huddle_condition(self, emails: List[str]) -> Any:
        try:
            recipient = recipient_for_emails(emails, False,
                                             self.user_profile, self.user_profile)
        except ValidationError:
            raise BadNarrowOperator('unknown recipient')
        return column("recipient_id") == recipient.id

    def _personal_pm_condition(self, target_email: str) -> Any:
        self_recipient = get_personal_recipient(self.user_profile.id)
        if target_email == self.user_profile.email:
            return and_(column("sender_id") == self.user_profile.id,
                        column("recipient_id") == self_recipient.id)
        try:
            narrow_profile = get_user_including_cross_realm(target_email, self.user_realm)
        except UserProfile.DoesNotExist:
            raise BadNarrowOperator('unknown user')
        narrow_recipient = get_personal_recipient(narrow_profile.id)
        return or_(
            and_(column("sender_id") == narrow_profile.id,
                 column("recipient_id") == self_recipient.id),
            and_(column("sender_id") == self.user_profile.id,
                 column("recipient_id") == narrow_recipient.id)
        )

    def by_group_pm_with(self, query: Query, operand: str,
                         maybe_negate: ConditionTransform) -> Query:
        try:
            narrow_profile = get_user_including_cross_realm(operand, self.user_realm)
        except UserProfile.DoesNotExist:
            raise BadNarrowOperator('unknown user ' + operand)

        self_ids = self._huddle_recipient_ids(self.user_profile)
        narrow_ids = self._huddle_recipient_ids(narrow_profile)
        common = set(self_ids) & set(narrow_ids)
        return query.where(maybe_negate(column("recipient_id").in_(common)))

    def _huddle_recipient_ids(self, profile: UserProfile) -> List[int]:
        rows = Subscription.objects.filter(
            user_profile=profile,
            recipient__type=Recipient.HUDDLE
        ).values("recipient_id")
        return [r['recipient_id'] for r in rows]

    def by_search(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        return self._by_search_pgroonga(query, operand, maybe_negate) if settings.USING_PGROONGA \
            else self._by_search_tsearch(query, operand, maybe_negate)

    def _by_search_pgroonga(self, query: Query, operand: str,
                            maybe_negate: ConditionTransform) -> Query:
        match = func.pgroonga_match_positions_character
        esc = func.escape_html(operand)
        kw = func.pgroonga_query_extract_keywords(esc)
        query = query.column(match(column("rendered_content"), kw).label("content_matches"))
        query = query.column(match(func.escape_html(column("subject")), kw).label("subject_matches"))
        cond = column("search_pgroonga").op("&@~")(esc)
        return query.where(maybe_negate(cond))

    def _by_search_tsearch(self, query: Query, operand: str,
                           maybe_negate: ConditionTransform) -> Query:
        tsq = func.plainto_tsquery(literal("zulip.english_us_search"), literal(operand))
        locs = func.ts_match_locs_array
        query = query.column(locs(literal("zulip.english_us_search"),
                                  column("rendered_content"), tsq).label("content_matches"))
        query = query.column(locs(literal("zulip.english_us_search"),
                                  func.escape_html(column("subject")), tsq).label("subject_matches"))
        for term in re.findall(r'"[^"]+"|\S+', operand):
            if term[0] == '"' and term[-1] == '"':
                term = '%' + connection.ops.prep_for_like_query(term[1:-1]) + '%'
                cond = or_(column("content").ilike(term), column("subject").ilike(term))
                query = query.where(maybe_negate(cond))
        return query.where(maybe_negate(column("search_tsvector").op("@@")(tsq)))

    # Helper --------------------------------------------------------------

    def _pg_re_escape(self, pattern: str) -> str:
        """
        Escape user input to place in a regex for PostgreSQL.
        """
        s = list(pattern)
        for i, c in enumerate(s):
            if c not in self._alphanum:
                if ord(c) >= 128:
                    s[i] = '\\u{:0>4x}'.format(ord(c))
                else:
                    s[i] = '\\' + c
        return ''.join(s)


def highlight_string(text: str, locs: Iterable[Tuple[int, int]]) -> str:
    highlight_start = '<span class="highlight">'
    highlight_stop = '</span>'
    pos = 0
    result = ''
    in_tag = False
    text_utf8 = text.encode('utf8')
    for offset, length in locs:
        prefix_start, prefix_end = pos, offset
        match_start, match_end = offset, offset + length
        if settings.USING_PGROONGA:
            prefix = text[prefix_start:prefix_end]
            match = text[match_start:match_end]
        else:
            prefix = text_utf8[prefix_start:prefix_end].decode()
            match = text_utf8[match_start:match_end].decode()
        for ch in (prefix + match):
            if ch == '<':
                in_tag = True
            elif ch == '>':
                in_tag = False
        if in_tag:
            result += prefix + match
        else:
            result += prefix + highlight_start + match + highlight_stop
        pos = match_end
    final = text[pos:] if settings.USING_PGROONGA else text_utf8[pos:].decode()
    return result + final


def get_search_fields(rendered_content: str, subject: str,
                      content_matches: Iterable[Tuple[int, int]],
                      subject_matches: Iterable[Tuple[int, int]]) -> Dict[str, str]:
    return {
        'match_content': highlight_string(rendered_content, content_matches),
        'match_subject': highlight_string(escape_html(subject), subject_matches)
    }


def narrow_parameter(json: str) -> Optional[List[Dict[str, Any]]]:
    data = ujson.loads(json)
    if not isinstance(data, list):
        raise ValueError("argument is not a list")
    if not data:
        return None

    def convert_term(elem: Union[Dict[str, Any], List[str]]) -> Dict[str, Any]:
        if isinstance(elem, list):
            if len(elem) != 2 or any(not isinstance(x, str) for x in elem):
                raise ValueError("element is not a string pair")
            return {'operator': elem[0], 'operand': elem[1]}
        if isinstance(elem, dict):
            validator = check_dict([
                ('operator', check_string),
                ('operand', check_string),
            ])
            error = validator('elem', elem)
            if error:
                raise JsonableError(error)
            return {
                'operator': elem['operator'],
                'operand': elem['operand'],
                'negated': elem.get('negated', False),
            }
        raise ValueError("element is not a dictionary")

    return list(map(convert_term, data))


def ok_to_include_history(narrow: Optional[Iterable[Dict[str, Any]]],
                          user_profile: UserProfile) -> bool:
    include = False
    if narrow:
        for term in narrow:
            if term['operator'] == "stream" and not term.get('negated', False):
                if can_access_stream_history_by_name(user_profile, term['operand']):
                    include = True
        for term in narrow:
            if term['operator'] == "is":
                include = False
    return include


def get_stream_name_from_narrow(narrow: Optional[Iterable[Dict[str, Any]]]) -> Optional[str]:
    if narrow:
        for term in narrow:
            if term['operator'] == 'stream':
                return term['operand'].lower()
    return None


def exclude_muting_conditions(user_profile: UserProfile,
                              narrow: Optional[Iterable[Dict[str, Any]]]) -> List[Selectable]:
    conditions: List[Selectable] = []
    stream_name = get_stream_name_from_narrow(narrow)
    stream_id = None
    if stream_name:
        try:
            stream_id = get_stream(stream_name, user_profile.realm).id
        except Stream.DoesNotExist:
            pass
    if stream_id is None:
        rows = Subscription.objects.filter(
            user_profile=user_profile,
            active=True,
            in_home_view=False,
            recipient__type=Recipient.STREAM
        ).values('recipient_id')
        muted = [r['recipient_id'] for r in rows]
        if muted:
            conditions.append(not_(column("recipient_id").in_(muted)))
    return exclude_topic_mutes(conditions, user_profile, stream_id)


def get_base_query_for_search(user_profile: UserProfile,
                              need_message: bool,
                              need_user_message: bool) -> Tuple[Query, ColumnElement]:
    if need_message and need_user_message:
        q = select([column("message_id"), column("flags")],
                   column("user_profile_id") == literal(user_profile.id),
                   join(table("zerver_usermessage"), table("zerver_message"),
                        literal_column("zerver_usermessage.message_id") ==
                        literal_column("zerver_message.id")))
        return q, column("message_id")
    if need_user_message:
        q = select([column("message_id"), column("flags")],
                   column("user_profile_id") == literal(user_profile.id),
                   table("zerver_usermessage"))
        return q, column("message_id")
    q = select([column("id").label("message_id")], None, table("zerver_message"))
    return q, literal_column("zerver_message.id")


def add_narrow_conditions(user_profile: UserProfile,
                          inner_msg_id_col: ColumnElement,
                          query: Query,
                          narrow: List[Dict[str, Any]]) -> Tuple[Query, bool]:
    is_search = False
    if narrow is None:
        return query, is_search
    builder = NarrowBuilder(user_profile, inner_msg_id_col)
    search_ops: List[str] = []
    for term in narrow:
        if term['operator'] == 'search':
            search_ops.append(term['operand'])
        else:
            query = builder.add_term(query, term)
    if search_ops:
        is_search = True
        query = query.column(column("subject")).column(column("rendered_content"))
        query = builder.add_term(query, {
            'operator': 'search',
            'operand': ' '.join(search_ops)
        })
    return query, is_search


def find_first_unread_anchor(sa_conn: Any,
                             user_profile: UserProfile,
                             narrow: List[Dict[str, Any]]) -> int:
    need_user_message = True
    need_message = True
    query, inner_msg_id_col = get_base_query_for_search(
        user_profile=user_profile,
        need_message=need_message,
        need_user_message=need_user_message,
    )
    query, _ = add_narrow_conditions(
        user_profile=user_profile,
        inner_msg_id_col=inner_msg_id_col,
        query=query,
        narrow=narrow,
    )
    condition = column("flags").op("&")(UserMessage.flags.read.mask) == 0
    muting = exclude_muting_conditions(user_profile, narrow)
    if muting:
        condition = and_(condition, *muting)
    if not narrow:
        condition = and_(condition, inner_msg_id_col >= user_profile.pointer)
    first_unread = query.where(condition).order_by(inner_msg_id_col.asc()).limit(1)
    rows = list(sa_conn.execute(first_unread).fetchall())
    return rows[0][0] if rows else LARGER_THAN_MAX_MESSAGE_ID


@has_request_variables
def zcommand_backend(request: HttpRequest, user_profile: UserProfile,
                     command: str = REQ('command')) -> HttpResponse:
    return json_success(process_zcommands(command, user_profile))


@has_request_variables
def get_messages_backend(request: HttpRequest, user_profile: UserProfile,
                         anchor: int = REQ(converter=int, default=None),
                         num_before: int = REQ(converter=to_non_negative_int),
                         num_after: int = REQ(converter=to_non_negative_int),
                         narrow: Optional[List[Dict[str, Any]]] = REQ('narrow',
                                                                     converter=narrow_parameter,
                                                                     default=None),
                         use_first_unread_anchor: bool = REQ(validator=check_bool,
                                                            default=False),
                         client_gravatar: bool = REQ(validator=check_bool, default=False),
                         apply_markdown: bool = REQ(validator=check_bool, default=True)) -> HttpResponse:
    if anchor is None and not use_first_unread_anchor:
        return json_error(_("Missing 'anchor' argument (or set 'use_first_unread_anchor'=True)."))
    if num_before + num_after > MAX_MESSAGES_PER_FETCH:
        return json_error(_("Too many messages requested (maximum %s)." % MAX_MESSAGES_PER_FETCH))
    include_history = ok_to_include_history(narrow, user_profile)

    if include_history:
        need_message, need_user_message = True, False
    elif narrow is None:
        need_message, need_user_message = False, True
    else:
        need_message, need_user_message = True, True

    query, inner_msg_id_col = get_base_query_for_search(
        user_profile=user_profile,
        need_message=need_message,
        need_user_message=need_user_message,
    )
    query, is_search = add_narrow_conditions(
        user_profile=user_profile,
        inner_msg_id_col=inner_msg_id_col,
        query=query,
        narrow=narrow,
    )
    if narrow:
        ops = []
        for term in narrow:
            ops.append(term['operator'] if term['operator'] != "is" else f"is:{term['operand']}")
        request._log_data['extra'] = "[%s]" % (",".join(ops),)

    sa_conn = get_sqlalchemy_connection()
    if use_first_unread_anchor:
        anchor = find_first_unread_anchor(sa_conn, user_profile, narrow)

    anchored_left = (anchor == 0)
    anchored_right = (anchor == LARGER_THAN_MAX_MESSAGE_ID)
    if anchored_right:
        num_after = None

    first_visible = get_first_visible_message_id(user_profile.realm)
    query = limit_query_to_range(
        query=query,
        num_before=num_before,
        num_after=num_after,
        anchor=anchor,
        anchored_to_left=anchored_left,
        anchored_to_right=anchored_right,
        id_col=inner_msg_id_col,
        first_visible_message_id=first_visible,
    )
    main = alias(query)
    query = select(main.c, None, main).order_by(column("message_id").asc())
    query = query.prefix_with("/* get_messages */")
    rows = list(sa_conn.execute(query).fetchall())
    info = post_process_limited_query(
        rows=rows,
        num_before=num_before,
        num_after=num_after,
        anchor=anchor,
        anchored_to_left=anchored_left,
        anchored_to_right=anchored_right,
        first_visible_message_id=first_visible,
    )
    rows = info['rows']

    message_ids: List[int] = []
    user_message_flags: Dict[int, List[str]] = {}
    if include_history:
        message_ids = [r[0] for r in rows]
        um_rows = UserMessage.objects.filter(user_profile=user_profile,
                                             message__id__in=message_ids)
        user_message_flags = {um.message_id: um.flags_list() for um in um_rows}
        for mid in message_ids:
            if mid not in user_message_flags:
                user_message_flags[mid] = ["read", "historical"]
    else:
        for r in rows:
            mid, flags = r[0], r[1]
            user_message_flags[mid] = UserMessage.flags_list_for_flags(flags)
            message_ids.append(mid)

    search_fields: Dict[int, Dict[str, str]] = {}
    if is_search:
        for r in rows:
            mid = r[0]
            subject, rendered, c_matches, s_matches = r[-4:]
            try:
                search_fields[mid] = get_search_fields(rendered, subject,
                                                       c_matches, s_matches)
            except UnicodeDecodeError as err:  # nocoverage
                raise Exception(str(err), mid, narrow)

    messages = messages_for_ids(
        message_ids=message_ids,
        user_message_flags=user_message_flags,
        search_fields=search_fields,
        apply_markdown=apply_markdown,
        client_gravatar=client_gravatar,
        allow_edit_history=user_profile.realm.allow_edit_history,
    )
    statsd.incr('loaded_old_messages', len(messages))
    return json_success({
        'messages': messages,
        'result': 'success',
        'msg': '',
        'found_anchor': info['found_anchor'],
        'found_oldest': info['found_oldest'],
        'found_newest': info['found_newest'],
        'history_limited': info['history_limited'],
        'anchor': anchor,
    })


def limit_query_to_range(query: Query,
                         num_before: int,
                         num_after: int,
                         anchor: int,
                         anchored_to_left: bool,
                         anchored_to_right: bool,
                         id_col: ColumnElement,
                         first_visible_message_id: int) -> Query:
    need_before = (not anchored_to_left) and (num_before > 0)
    need_after = (not anchored_to_right) and (num_after > 0)
    both = need_before and need_after

    if both:
        before_anchor, after_anchor = anchor - 1, max(anchor, first_visible_message_id)
        before_limit, after_limit = num_before, num_after + 1
    elif need_before:
        before_anchor = anchor
        before_limit = num_before + (0 if anchored_to_right else 1)
    elif need_after:
        after_anchor = max(anchor, first_visible_message_id)
        after_limit = num_after + 1

    if need_before:
        before_q = query.where(id_col <= before_anchor) if not anchored_to_right else query
        before_q = before_q.order_by(id_col.desc()).limit(before_limit)
    if need_after:
        after_q = query.where(id_col >= after_anchor) if not anchored_to_left else query
        after_q = after_q.order_by(id_col.asc()).limit(after_limit)

    if both:
        return union_all(before_q.self_group(), after_q.self_group())
    if need_before:
        return before_q
    if need_after:
        return after_q
    return query.where(id_col == anchor)


def post_process_limited_query(rows: List[Any],
                               num_before: int,
                               num_after: int,
                               anchor: int,
                               anchored_to_left: bool,
                               anchored_to_right: bool,
                               first_visible_message_id: int) -> Dict[str, Any]:
    visible = [r for r in rows if r[0] >= first_visible_message_id] if first_visible_message_id > 0 else rows
    rows_limited = len(visible) != len(rows)

    if anchored_to_right:
        before_rows, anchor_rows, after_rows = visible[:], [], []
    else:
        before_rows = [r for r in visible if r[0] < anchor]
        anchor_rows = [r for r in visible if r[0] == anchor]
        after_rows = [r for r in visible if r[0] > anchor]

    if num_before:
        before_rows = before_rows[-num_before:]
    if num_after:
        after_rows = after_rows[:num_after]

    visible_rows = before_rows + anchor_rows + after_rows
    found_anchor = len(anchor_rows) == 1
    found_oldest = anchored_to_left or (len(before_rows) < num_before)
    found_newest = anchored_to_right or (len(after_rows) < num_after)
    history_limited = rows_limited and found_oldest

    return {
        'rows': visible_rows,
        'found_anchor': found_anchor,
        'found_newest': found_newest,
        'found_oldest': found_oldest,
        'history_limited': history_limited,
    }


@has_request_variables
def update_message_flags(request: HttpRequest, user_profile: UserProfile,
                         messages: List[int] = REQ(validator=check_list(check_int)),
                         operation: str = REQ('op'), flag: str = REQ()) -> HttpResponse:
    count = do_update_message_flags(user_profile, request.client, operation, flag, messages)
    request._log_data["extra"] = f"[{operation} {flag}/{len(messages)}] actually {count}"
    return json_success({'result': 'success', 'messages': messages, 'msg': ''})


@has_request_variables
def mark_all_as_read(request: HttpRequest, user_profile: UserProfile) -> HttpResponse:
    count = do_mark_all_as_read(user_profile, request.client)
    request._log_data["extra"] = f"[{count} updated]"
    return json_success({'result': 'success', 'msg': ''})


@has_request_variables
def mark_stream_as_read(request: HttpRequest, user_profile: UserProfile,
                        stream_id: int = REQ(validator=check_int)) -> HttpResponse:
    stream, _, _ = access_stream_by_id(user_profile, stream_id)
    count = do_mark_stream_messages_as_read(user_profile, request.client, stream)
    request._log_data["extra"] = f"[{count} updated]"
    return json_success({'result': 'success', 'msg': ''})


@has_request_variables
def mark_topic_as_read(request: HttpRequest, user_profile: UserProfile,
                       stream_id: int = REQ(validator=check_int),
                       topic_name: str = REQ()) -> HttpResponse:
    stream, recipient, _ = access_stream_by_id(user_profile, stream_id)
    if topic_name:
        exists = UserMessage.objects.filter(
            user_profile=user_profile,
            message__recipient=recipient,
            message__subject__iexact=topic_name
        ).exists()
        if not exists:
            raise JsonableError(_('No such topic \'%s\'') % topic_name)
    count = do_mark_stream_messages_as_read(user_profile, request.client, stream, topic_name)
    request._log_data["extra"] = f"[{count} updated]"
    return json_success({'result': 'success', 'msg': ''})


def create_mirrored_message_users(request: HttpRequest, user_profile: UserProfile,
                                  recipients: Iterable[str]) -> Tuple[bool, Optional[UserProfile]]:
    if "sender" not in request.POST:
        return False, None
    sender_email = request.POST["sender"].strip().lower()
    referenced = {sender_email}
    if request.POST['type'] == 'private':
        referenced.update(email.lower() for email in recipients)

    client_name = request.client.name
    if client_name == "zephyr_mirror":
        user_check, fullname_fn = same_realm_zephyr_user, compute_mit_user_fullname
    elif client_name == "irc_mirror":
        user_check, fullname_fn = same_realm_irc_user, compute_irc_user_fullname
    elif client_name in ("jabber_mirror", "JabberMirror"):
        user_check, fullname_fn = same_realm_jabber_user, compute_jabber_user_fullname
    else:
        return False, None

    for email in referenced:
        if not user_check(user_profile, email):
            return False, None

    for email in referenced:
        create_mirror_user_if_needed(user_profile.realm, email, fullname_fn)

    sender = get_user_including_cross_realm(sender_email, user_profile.realm)
    return True, sender


def same_realm_zephyr_user(user_profile: UserProfile, email: str) -> bool:
    try:
        validators.validate_email(email)
    except ValidationError:
        return False
    domain = email_to_domain(email)
    return user_profile.realm.is_zephyr_mirror_realm and \
        RealmDomain.objects.filter(realm=user_profile.realm, domain=domain).exists()


def same_realm_irc_user(user_profile: UserProfile, email: str) -> bool:
    try:
        validators.validate_email(email)
    except ValidationError:
        return False
    domain = email_to_domain(email).replace("irc.", "")
    return RealmDomain.objects.filter(realm=user_profile.realm, domain=domain).exists()


def same_realm_jabber_user(user_profile: UserProfile, email: str) -> bool:
    try:
        validators.validate_email(email)
    except ValidationError:
        return False
    domain = email_to_domain(email)
    return RealmDomain.objects.filter(realm=user_profile.realm, domain=domain).exists()


def handle_deferred_message(sender: UserProfile, client: Client,
                            message_type_name: str, message_to: Sequence[str],
                            topic_name: Optional[str],
                            message_content: str, delivery_type: str,
                            defer_until: str, tz_guess: str,
                            forwarder_user_profile: UserProfile,
                            realm: Optional[Realm]) -> HttpResponse:
    local_tz = tz_guess or sender.timezone or 'UTC'
    try:
        deliver_at = dateparser(defer_until)
    except ValueError:
        return json_error(_("Invalid time format"))
    if deliver_at.tzinfo is None:
        tz = get_timezone(local_tz)
        deliver_at = tz.normalize(tz.localize(deliver_at))  # type: ignore
    deliver_at_utc = convert_to_UTC(deliver_at)
    if deliver_at_utc <= timezone_now():
        return json_error(_("Time must be in the future."))
    check_schedule_message(sender, client, message_type_name, message_to,
                           topic_name, message_content, delivery_type,
                           deliver_at_utc, realm=realm,
                           forwarder_user_profile=forwarder_user_profile)
    return json_success({"deliver_at": str(deliver_at)})


@has_request_variables
def send_message_backend(request: HttpRequest, user_profile: UserProfile,
                         message_type_name: str = REQ('type'),
                         message_to: List[str] = REQ('to', converter=extract_recipients, default=[]),
                         forged: bool = REQ(default=False),
                         topic_name: Optional[str] = REQ('subject',
                                                         converter=lambda x: x.strip(),
                                                         default=None),
                         message_content: str = REQ('content'),
                         widget_content: Optional[str] = REQ(default=None),
                         realm_str: Optional[str] = REQ('realm_str', default=None),
                         local_id: Optional[str] = REQ(default=None),
                         queue_id: Optional[str] = REQ(default=None),
                         delivery_type: Optional[str] = REQ('delivery_type', default='send_now'),
                         defer_until: Optional[str] = REQ('deliver_at', default=None),
                         tz_guess: Optional[str] = REQ('tz_guess', default=None)) -> HttpResponse:
    client = request.client
    is_super = request.user.is_api_super_user
    if forged and not is_super:
        return json_error(_("User not authorized for this query"))

    realm = None
    if realm_str and realm_str != user_profile.realm.string_id:
        if not is_super:
            return json_error(_("User not authorized for this query"))
        realm = get_realm(realm_str)
        if not realm:
            return json_error(_("Unknown organization '%s'") % realm_str)

    if client.name in ["zephyr_mirror", "irc_mirror", "jabber_mirror", "JabberMirror"]:
        if "sender" not in request.POST:
            return json_error(_("Missing sender"))
        if message_type_name != "private" and not is_super:
            return json_error(_("User not authorized for this query"))
        valid, mirror_sender = create_mirrored_message_users(request, user_profile, message_to)
        if not valid:
            return json_error(_("Invalid mirrored message"))
        if client.name == "zephyr_mirror" and not user_profile.realm.is_zephyr_mirror_realm:
            return json_error(_("Zephyr mirroring is not allowed in this organization"))
        sender = mirror_sender
    else:
        sender = user_profile

    if delivery_type in ('send_later', 'remind') and defer_until is None:
        return json_error(_("Missing deliver_at in a request for delayed message delivery"))

    if delivery_type in ('send_later', 'remind'):
        return handle_deferred_message(sender, client, message_type_name,
                                       message_to, topic_name, message_content,
                                       delivery_type, defer_until, tz_guess,
                                       forwarder_user_profile=user_profile,
                                       realm=realm)

    ret = check_send_message(sender, client, message_type_name, message_to,
                             topic_name, message_content, forged=forged,
                             forged_timestamp=request.POST.get('time'),
                             forwarder_user_profile=user_profile, realm=realm,
                             local_id=local_id, sender_queue_id=queue_id,
                             widget_content=widget_content)
    return json_success({"id": ret})


def fill_edit_history_entries(message_history: List[Dict[str, Any]], message: Message) -> None:
    prev_content = message.content
    prev_rendered = message.rendered_content
    prev_topic = message.subject
    if message_history and datetime_to_timestamp(message.last_edit_time) != message_history[0]['timestamp']:
        raise AssertionError
    for entry in message_history:
        entry['topic'] = prev_topic
        if 'prev_subject' in entry:
            prev_topic = entry.pop('prev_subject')
            entry['prev_topic'] = prev_topic
        entry['content'] = prev_content
        entry['rendered_content'] = prev_rendered
        if 'prev_content' in entry:
            del entry['prev_rendered_content_version']
            prev_content = entry.pop('prev_content')
            prev_rendered = entry.pop('prev_rendered_content')
            entry['content_html_diff'] = highlight_html_differences(
                prev_rendered, entry['rendered_content'], message.id)
    message_history.append({
        'topic': prev_topic,
        'content': prev_content,
        'rendered_content': prev_rendered,
        'timestamp': datetime_to_timestamp(message.pub_date),
        'user_id': message.sender_id,
    })


@has_request_variables
def get_message_edit_history(request: HttpRequest, user_profile: UserProfile,
                             message_id: int = REQ(converter=to_non_negative_int)) -> HttpResponse:
    if not user_profile.realm.allow_edit_history:
        return json_error(_("Message edit history is disabled in this organization"))
    message, _ = access_message(user_profile, message_id)
    history = ujson.loads(message.edit_history) if message.edit_history else []
    fill_edit_history_entries(history, message)
    return json_success({"message_history": list(reversed(history))})


@has_request_variables
def update_message_backend(request: HttpRequest, user_profile: UserMessage,
                           message_id: int = REQ(converter=to_non_negative_int),
                           subject: Optional[str] = REQ(default=None),
                           propagate_mode: Optional[str] = REQ(default="change_one"),
                           content: Optional[str] = REQ(default=None)) -> HttpResponse:
    if not user_profile.realm.allow_message_editing:
        return json_error(_("Your organization has turned off message editing"))
    message, _ = access_message(user_profile, message_id)
    is_no_topic = (message.topic_name() == "(no topic)")

    if not _can_edit_message(user_profile, message, content, is_no_topic):
        raise JsonableError(_("You don't have permission to edit this message"))

    if content is not None and user_profile.realm.message_content_edit_limit_seconds > 0:
        if _edit_time_exceeded(message, user_profile.realm.message_content_edit_limit_seconds):
            raise JsonableError(_("The time limit for editing this message has passed"))

    if content is None and message.sender != user_profile and not user_profile.is_realm_admin and not is_no_topic:
        if _edit_time_exceeded(message, Realm.DEFAULT_COMMUNITY_TOPIC_EDITING_LIMIT_SECONDS):
            raise JsonableError(_("The time limit for editing this message has passed"))

    if subject is None and content is None:
        return json_error(_("Nothing to change"))
    if subject is not None:
        subject = subject.strip()
        if not subject:
            raise JsonableError(_("Topic can't be empty"))

    rendered = None
    links = set()
    prior_mentions = set()
    new_mentions = set()
    if content is not None:
        content = content.strip() or "(deleted)"
        content = truncate_body(content)
        user_info = get_user_info_for_message_updates(message.id)
        prior_mentions = user_info['mention_user_ids']
        rendered = render_incoming_message(message, content,
                                           user_info['message_user_ids'],
                                           user_profile.realm)
        links |= message.links_for_preview
        new_mentions = message.mentions_user_ids

    changed = do_update_message(user_profile, message, subject,
                                propagate_mode, content, rendered,
                                prior_mentions, new_mentions)

    request._log_data['extra'] = f"[{changed}]"
    if links and bugdown.url_embed_preview_enabled_for_realm(message):
        queue_json_publish('embed_links', {
            'message_id': message.id,
            'message_content': message.content,
            'message_realm_id': user_profile.realm_id,
            'urls': links
        })
    return json_success()


def _can_edit_message(user_profile: UserMessage, message: Message,
                      content: Optional[str], is_no_topic: bool) -> bool:
    if message.sender == user_profile:
        return True
    if content is None and (is_no_topic or user_profile.is_realm_admin or
                           user_profile.realm.allow_community_topic_editing):
        return True
    return False


def _edit_time_exceeded(message: Message, limit_seconds: int) -> bool:
    deadline = limit_seconds + 20
    return (timezone_now() - message.pub_date) > datetime.timedelta(seconds=deadline)


def validate_can_delete_message(user_profile: UserProfile, message: Message) -> None:
    if user_profile.is_realm_admin:
        return
    if message.sender != user_profile:
        raise JsonableError(_("You don't have permission to delete this message"))
    if not user_profile.realm.allow_message_deleting:
        raise JsonableError(_("You don't have permission to delete this message"))
    limit = user_profile.realm.message_content_delete_limit_seconds
    if limit and (timezone_now() - message.pub_date) > datetime.timedelta(seconds=limit):
        raise JsonableError(_("The time limit for deleting this message has passed"))


@has_request_variables
def delete_message_backend(request: HttpRequest, user_profile: UserProfile,
                           message_id: int = REQ(converter=to_non_negative_int)) -> HttpResponse:
    message, _ = access_message(user_profile, message_id)
    validate_can_delete_message(user_profile, message)
    do_delete_message(user_profile, message)
    return json_success()


@has_request_variables
def json_fetch_raw_message(request: HttpRequest, user_profile: UserProfile,
                           message_id: int = REQ(converter=to_non_negative_int)) -> HttpResponse:
    message, _ = access_message(user_profile, message_id)
    return json_success({"raw_content": message.content})


@has_request_variables
def render_message_backend(request: HttpRequest, user_profile: UserProfile,
                           content: str = REQ()) -> HttpResponse:
    msg = Message()
    msg.sender = user_profile
    msg.content = content
    msg.sending_client = request.client
    rendered = render_markdown(msg, content, realm=user_profile.realm)
    return json_success({"rendered": rendered})


@has_request_variables
def messages_in_narrow_backend(request: HttpRequest, user_profile: UserProfile,
                               msg_ids: List[int] = REQ(validator=check_list(check_int)),
                               narrow: Optional[List[Dict[str, Any]]] = REQ(converter=narrow_parameter)
                               ) -> HttpResponse:
    first_visible = get_first_visible_message_id(user_profile.realm)
    msg_ids = [mid for mid in msg_ids if mid >= first_visible]
    query = select([column("message_id"), column("subject"), column("rendered_content")],
                   and_(column("user_profile_id") == literal(user_profile.id),
                        column("message_id").in_(msg_ids)),
                   join(table("zerver_usermessage"), table("zerver_message"),
                        literal_column("zerver_usermessage.message_id") ==
                        literal_column("zerver_message.id")))
    builder = NarrowBuilder(user_profile, column("message_id"))
    if narrow:
        for term in narrow:
            query = builder.add_term(query, term)
    sa_conn = get_sqlalchemy_connection()
    rows = list(sa_conn.execute(query).fetchall())
    search_fields: Dict[int, Dict[str, str]] = {}
    for row in rows:
        mid = row['message_id']
        subject = row['subject']
        rendered = row['rendered_content']
        if 'content_matches' in row:
            search_fields[mid] = get_search_fields(rendered, subject,
                                                   row['content_matches'],
                                                   row['subject_matches'])
        else:
            search_fields[mid] = {
                'match_content': rendered,
                'match_subject': escape_html(subject)
            }
    return json_success({"messages": search_fields})