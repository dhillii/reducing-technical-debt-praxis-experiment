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
    or_, not_, union_all, alias, Selectable, ColumnElement, table

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
        self.desc = desc

    @staticmethod
    def msg_format() -> str:
        return _('Invalid narrow operator: {desc}')


Query = Any
ConditionTransform = Any


class NarrowBuilder:
    '''
    Build up a SQLAlchemy query to find messages matching a narrow.
    '''

    def __init__(self, user_profile: UserProfile, msg_id_column: str) -> None:
        self.user_profile = user_profile
        self.msg_id_column = msg_id_column
        self.user_realm = user_profile.realm

    def add_term(self, query: Query, term: Dict[str, Any]) -> Query:
        operator = term['operator']
        operand = term['operand']
        negated = term.get('negated', False)

        method_name = 'by_' + operator.replace('-', '_')
        method = getattr(self, method_name, None)
        if method is None:
            raise BadNarrowOperator('unknown operator ' + operator)

        maybe_negate = not_ if negated else lambda cond: cond
        return method(query, operand, maybe_negate)

    def by_has(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        if operand not in ['attachment', 'image', 'link']:
            raise BadNarrowOperator("unknown 'has' operand " + operand)
        col_name = 'has_' + operand
        cond = column(col_name)
        return query.where(maybe_negate(cond))

    def by_in(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        if operand == 'home':
            conditions = exclude_muting_conditions(self.user_profile, [])
            return query.where(and_(*conditions))
        if operand == 'all':
            return query
        raise BadNarrowOperator("unknown 'in' operand " + operand)

    def by_is(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        if operand == 'private':
            cond = column("flags").op("&")(UserMessage.flags.is_private.mask) != 0
        elif operand == 'starred':
            cond = column("flags").op("&")(UserMessage.flags.starred.mask) != 0
        elif operand == 'unread':
            cond = column("flags").op("&")(UserMessage.flags.read.mask) == 0
        elif operand == 'mentioned':
            cond1 = column("flags").op("&")(UserMessage.flags.mentioned.mask) != 0
            cond2 = column("flags").op("&")(UserMessage.flags.wildcard_mentioned.mask) != 0
            cond = or_(cond1, cond2)
        elif operand == 'alerted':
            cond = column("flags").op("&")(UserMessage.flags.has_alert_word.mask) != 0
        else:
            raise BadNarrowOperator("unknown 'is' operand " + operand)
        return query.where(maybe_negate(cond))

    _alphanum = frozenset(
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')

    def _pg_re_escape(self, pattern: str) -> str:
        s = list(pattern)
        for i, c in enumerate(s):
            if c not in self._alphanum:
                if ord(c) >= 128:
                    s[i] = '\\u{:0>4x}'.format(ord(c))
                else:
                    s[i] = '\\' + c
        return ''.join(s)

    def by_stream(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        try:
            stream = get_stream(operand, self.user_profile.realm)
        except Stream.DoesNotExist:
            raise BadNarrowOperator('unknown stream ' + operand)

        if self.user_profile.realm.is_zephyr_mirror_realm:
            m = re.search(r'^(?:un)*(.+?)(?:\.d)*$', stream.name, re.IGNORECASE)
            assert m is not None
            base_stream_name = m.group(1)
            matching_streams = get_active_streams(self.user_profile.realm).filter(
                name__iregex=r'^(un)*%s(\.d)*$' % (self._pg_re_escape(base_stream_name),))
            matching_ids = [s.id for s in matching_streams]
            recipients_map = bulk_get_recipients(Recipient.STREAM, matching_ids)
            cond = column("recipient_id").in_([r.id for r in recipients_map.values()])
            return query.where(maybe_negate(cond))

        recipient = get_stream_recipient(stream.id)
        cond = column("recipient_id") == recipient.id
        return query.where(maybe_negate(cond))

    def by_topic(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        if self.user_profile.realm.is_zephyr_mirror_realm:
            m = re.search(r'^(.*?)(?:\.d)*$', operand, re.IGNORECASE)
            assert m is not None
            base_topic = m.group(1)

            if base_topic in ('', 'personal', '(instance "")'):
                literals = ["", ".d", ".d.d", ".d.d.d", ".d.d.d.d",
                            "personal", "personal.d", "personal.d.d",
                            "personal.d.d.d", "personal.d.d.d.d",
                            '(instance "")', '(instance "").d',
                            '(instance "").d.d', '(instance "").d.d.d',
                            '(instance "").d.d.d.d']
                cond = or_(*[func.upper(column("subject")) == func.upper(literal(l)) for l in literals])
            else:
                literals = [base_topic, base_topic + ".d", base_topic + ".d.d",
                            base_topic + ".d.d.d", base_topic + ".d.d.d.d"]
                cond = or_(*[func.upper(column("subject")) == func.upper(literal(l)) for l in literals])
            return query.where(maybe_negate(cond))

        cond = func.upper(column("subject")) == func.upper(literal(operand))
        return query.where(maybe_negate(cond))

    def by_sender(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        try:
            sender = get_user_including_cross_realm(operand, self.user_realm)
        except UserProfile.DoesNotExist:
            raise BadNarrowOperator('unknown user ' + operand)
        cond = column("sender_id") == literal(sender.id)
        return query.where(maybe_negate(cond))

    def by_near(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        return query

    def by_id(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        if not str(operand).isdigit():
            raise BadNarrowOperator("Invalid message ID")
        cond = self.msg_id_column == literal(operand)
        return query.where(maybe_negate(cond))

    def by_pm_with(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        emails = raw_pm_with_emails(email_str=operand, my_email=self.user_profile.email)

        if not emails:
            raise BadNarrowOperator('empty pm-with clause')

        if len(emails) >= 2:
            try:
                recipient = recipient_for_emails(emails, False,
                                                 self.user_profile, self.user_profile)
            except ValidationError:
                raise BadNarrowOperator('unknown recipient ' + operand)
            cond = column("recipient_id") == recipient.id
            return query.where(maybe_negate(cond))

        target_email = emails[0]
        self_recipient = get_personal_recipient(self.user_profile.id)

        if target_email == self.user_profile.email:
            cond = and_(column("sender_id") == self.user_profile.id,
                        column("recipient_id") == self_recipient.id)
            return query.where(maybe_negate(cond))

        try:
            narrow_profile = get_user_including_cross_realm(target_email, self.user_realm)
        except UserProfile.DoesNotExist:
            raise BadNarrowOperator('unknown user ' + operand)

        narrow_recipient = get_personal_recipient(narrow_profile.id)
        cond = or_(and_(column("sender_id") == narrow_profile.id,
                        column("recipient_id") == self_recipient.id),
                   and_(column("sender_id") == self.user_profile.id,
                        column("recipient_id") == narrow_recipient.id))
        return query.where(maybe_negate(cond))

    def by_group_pm_with(self, query: Query, operand: str,
                         maybe_negate: ConditionTransform) -> Query:
        try:
            narrow_profile = get_user_including_cross_realm(operand, self.user_realm)
        except UserProfile.DoesNotExist:
            raise BadNarrowOperator('unknown user ' + operand)

        self_ids = Subscription.objects.filter(
            user_profile=self.user_profile,
            recipient__type=Recipient.HUDDLE
        ).values_list("recipient_id", flat=True)

        narrow_ids = Subscription.objects.filter(
            user_profile=narrow_profile,
            recipient__type=Recipient.HUDDLE
        ).values_list("recipient_id", flat=True)

        recipient_ids = set(self_ids) & set(narrow_ids)
        cond = column("recipient_id").in_(recipient_ids)
        return query.where(maybe_negate(cond))

    def by_search(self, query: Query, operand: str, maybe_negate: ConditionTransform) -> Query:
        if settings.USING_PGROONGA:
            return self._by_search_pgroonga(query, operand, maybe_negate)
        return self._by_search_tsearch(query, operand, maybe_negate)

    def _by_search_pgroonga(self, query: Query, operand: str,
                            maybe_negate: ConditionTransform) -> Query:
        match_positions_character = func.pgroonga_match_positions_character
        query_extract_keywords = func.pgroonga_query_extract_keywords
        operand_escaped = func.escape_html(operand)
        keywords = query_extract_keywords(operand_escaped)
        query = query.column(match_positions_character(column("rendered_content"),
                                                       keywords).label("content_matches"))
        query = query.column(match_positions_character(func.escape_html(column("subject")),
                                                       keywords).label("subject_matches"))
        condition = column("search_pgroonga").op("&@~")(operand_escaped)
        return query.where(maybe_negate(condition))

    def _by_search_tsearch(self, query: Query, operand: str,
                           maybe_negate: ConditionTransform) -> Query:
        tsquery = func.plainto_tsquery(literal("zulip.english_us_search"), literal(operand))
        ts_locs_array = func.ts_match_locs_array
        query = query.column(ts_locs_array(literal("zulip.english_us_search"),
                                           column("rendered_content"),
                                           tsquery).label("content_matches"))
        query = query.column(ts_locs_array(literal("zulip.english_us_search"),
                                           func.escape_html(column("subject")),
                                           tsquery).label("subject_matches"))

        for term in re.findall(r'"[^"]+"|\S+', operand):
            if term[0] == '"' and term[-1] == '"':
                term = term[1:-1]
                term = '%' + connection.ops.prep_for_like_query(term) + '%'
                cond = or_(column("content").ilike(term),
                           column("subject").ilike(term))
                query = query.where(maybe_negate(cond))

        cond = column("search_tsvector").op("@@")(tsquery)
        return query.where(maybe_negate(cond))


def highlight_string(text: str, locs: Iterable[Tuple[int, int]]) -> str:
    highlight_start = '<span class="highlight">'
    highlight_stop = '</span>'
    pos = 0
    result = ''
    in_tag = False
    text_utf8 = text.encode('utf8')

    for offset, length in locs:
        prefix_start = pos
        prefix_end = offset
        match_start = offset
        match_end = offset + length

        if settings.USING_PGROONGA:
            prefix = text[prefix_start:prefix_end]
            match = text[match_start:match_end]
        else:
            prefix = text_utf8[prefix_start:prefix_end].decode()
            match = text_utf8[match_start:match_end].decode()

        for character in (prefix + match):
            if character == '<':
                in_tag = True
            elif character == '>':
                in_tag = False
        if in_tag:
            result += prefix + match
        else:
            result += prefix + highlight_start + match + highlight_stop
        pos = match_end

    final_frag = text[pos:] if settings.USING_PGROONGA else text_utf8[pos:].decode()
    return result + final_frag


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
    if not narrow:
        return False
    include_history = any(
        term['operator'] == "stream" and not term.get('negated', False) and
        can_access_stream_history_by_name(user_profile, term['operand'])
        for term in narrow
    )
    if any(term['operator'] == "is" for term in narrow):
        include_history = False
    return include_history


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
        muted_ids = [row['recipient_id'] for row in rows]
        if muted_ids:
            conditions.append(not_(column("recipient_id").in_(muted_ids)))

    return exclude_topic_mutes(conditions, user_profile, stream_id)


def get_base_query_for_search(user_profile: UserProfile,
                              need_message: bool,
                              need_user_message: bool) -> Tuple[Query, ColumnElement]:
    if need_message and need_user_message:
        query = select([column("message_id"), column("flags")],
                       column("user_profile_id") == literal(user_profile.id),
                       join(table("zerver_usermessage"), table("zerver_message"),
                            literal_column("zerver_usermessage.message_id") ==
                            literal_column("zerver_message.id")))
        return query, column("message_id")

    if need_user_message:
        query = select([column("message_id"), column("flags")],
                       column("user_profile_id") == literal(user_profile.id),
                       table("zerver_usermessage"))
        return query, column("message_id")

    query = select([column("id").label("message_id")],
                   None,
                   table("zerver_message"))
    return query, literal_column("zerver_message.id")


def add_narrow_conditions(user_profile: UserProfile,
                          inner_msg_id_col: ColumnElement,
                          query: Query,
                          narrow: List[Dict[str, Any]]) -> Tuple[Query, bool]:
    if not narrow:
        return query, False

    builder = NarrowBuilder(user_profile, inner_msg_id_col)
    search_operands: List[str] = []

    for term in narrow:
        if term['operator'] == 'search':
            search_operands.append(term['operand'])
        else:
            query = builder.add_term(query, term)

    if search_operands:
        query = query.column(column("subject")).column(column("rendered_content"))
        combined = {'operator': 'search', 'operand': ' '.join(search_operands)}
        query = builder.add_term(query, combined)
        return query, True

    return query, False


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
    muting_conditions = exclude_muting_conditions(user_profile, narrow)
    if muting_conditions:
        condition = and_(condition, *muting_conditions)

    if not narrow:
        condition = and_(condition, inner_msg_id_col >= user_profile.pointer)

    first_unread = query.where(condition).order_by(inner_msg_id_col.asc()).limit(1)
    result = list(sa_conn.execute(first_unread).fetchall())
    return result[0][0] if result else LARGER_THAN_MAX_MESSAGE_ID


def _log_narrow_operators(request: HttpRequest, narrow: List[Dict[str, Any]]) -> None:
    verbose = []
    for term in narrow:
        if term['operator'] == "is":
            verbose.append(f"is:{term['operand']}")
        else:
            verbose.append(term['operator'])
    request._log_data['extra'] = f"[{','.join(verbose)}]"


def _determine_query_needs(user_profile: UserProfile,
                           narrow: Optional[List[Dict[str, Any]]],
                           include_history: bool) -> Tuple[bool, bool]:
    if include_history:
        return True, False
    if narrow is None:
        return False, True
    return True, True


def _apply_anchor_logic(anchor: Optional[int],
                       use_first_unread_anchor: bool,
                       sa_conn: Any,
                       user_profile: UserProfile,
                       narrow: Optional[List[Dict[str, Any]]]) -> int:
    if use_first_unread_anchor:
        return find_first_unread_anchor(sa_conn, user_profile, narrow or [])
    assert anchor is not None
    return anchor


def _prepare_limit_parameters(anchor: int,
                              num_before: int,
                              num_after: int,
                              first_visible_message_id: int) -> Tuple[bool, bool, bool]:
    anchored_to_left = (anchor == 0)
    anchored_to_right = (anchor == LARGER_THAN_MAX_MESSAGE_ID)
    if anchored_to_right:
        num_after = None  # type: ignore
    return anchored_to_left, anchored_to_right, anchored_to_left or anchored_to_right


def _process_query_rows(rows: List[Any],
                        is_search: bool,
                        user_profile: UserProfile,
                        include_history: bool,
                        apply_markdown: bool,
                        client_gravatar: bool) -> Tuple[List[int], Dict[int, List[str]], Dict[int, Dict[str, str]]]:
    message_ids: List[int] = []
    user_message_flags: Dict[int, List[str]] = {}
    search_fields: Dict[int, Dict[str, str]] = {}

    if include_history:
        message_ids = [row[0] for row in rows]
        um_rows = UserMessage.objects.filter(user_profile=user_profile,
                                             message__id__in=message_ids)
        user_message_flags = {um.message_id: um.flags_list() for um in um_rows}
        for mid in message_ids:
            if mid not in user_message_flags:
                user_message_flags[mid] = ["read", "historical"]
    else:
        for row in rows:
            mid, flags = row[0], row[1]
            user_message_flags[mid] = UserMessage.flags_list_for_flags(flags)
            message_ids.append(mid)

    if is_search:
        for row in rows:
            mid = row[0]
            subject, rendered_content, content_matches, subject_matches = row[-4:]
            search_fields[mid] = get_search_fields(rendered_content, subject,
                                                   content_matches, subject_matches)

    return message_ids, user_message_flags, search_fields


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
    need_both = need_before and need_after

    if need_both:
        before_anchor = anchor - 1
        after_anchor = max(anchor, first_visible_message_id)
        before_limit = num_before
        after_limit = num_after + 1
    elif need_before:
        before_anchor = anchor
        before_limit = num_before + (0 if anchored_to_right else 1)
    elif need_after:
        after_anchor = max(anchor, first_visible_message_id)
        after_limit = num_after + 1

    if need_before:
        before_q = query
        if not anchored_to_right:
            before_q = before_q.where(id_col <= before_anchor)
        before_q = before_q.order_by(id_col.desc()).limit(before_limit)

    if need_after:
        after_q = query
        if not anchored_to_left:
            after_q = after_q.where(id_col >= after_anchor)
        after_q = after_q.order_by(id_col.asc()).limit(after_limit)

    if need_both:
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
    visible_rows = [r for r in rows if r[0] >= first_visible_message_id] if first_visible_message_id > 0 else rows
    rows_limited = len(visible_rows) != len(rows)

    if anchored_to_right:
        before_rows = visible_rows[:]
        anchor_rows: List[Any] = []
        after_rows: List[Any] = []
    else:
        before_rows = [r for r in visible_rows if r[0] < anchor]
        anchor_rows = [r for r in visible_rows if r[0] == anchor]
        after_rows = [r for r in visible_rows if r[0] > anchor]

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
def get_messages_backend(request: HttpRequest, user_profile: UserProfile,
                         anchor: int = REQ(converter=int, default=None),
                         num_before: int = REQ(converter=to_non_negative_int),
                         num_after: int = REQ(converter=to_non_negative_int),
                         narrow: Optional[List[Dict[str, Any]]] = REQ('narrow',
                                                                     converter=narrow_parameter,
                                                                     default=None),
                         use_first_unread_anchor: bool = REQ(validator=check_bool, default=False),
                         client_gravatar: bool = REQ(validator=check_bool, default=False),
                         apply_markdown: bool = REQ(validator=check_bool, default=True)) -> HttpResponse:
    if anchor is None and not use_first_unread_anchor:
        return json_error(_("Missing 'anchor' argument (or set 'use_first_unread_anchor'=True)."))
    if num_before + num_after > MAX_MESSAGES_PER_FETCH:
        return json_error(_("Too many messages requested (maximum %s)." % (MAX_MESSAGES_PER_FETCH,)))

    include_history = ok_to_include_history(narrow, user_profile)
    need_message, need_user_message = _determine_query_needs(user_profile, narrow, include_history)

    query, inner_msg_id_col = get_base_query_for_search(
        user_profile=user_profile,
        need_message=need_message,
        need_user_message=need_user_message,
    )
    query, is_search = add_narrow_conditions(
        user_profile=user_profile,
        inner_msg_id_col=inner_msg_id_col,
        query=query,
        narrow=narrow or [],
    )

    if narrow:
        _log_narrow_operators(request, narrow)

    sa_conn = get_sqlalchemy_connection()
    anchor = _apply_anchor_logic(anchor, use_first_unread_anchor, sa_conn, user_profile, narrow)

    anchored_to_left = (anchor == 0)
    anchored_to_right = (anchor == LARGER_THAN_MAX_MESSAGE_ID)
    if anchored_to_right:
        num_after = None  # type: ignore

    first_visible_message_id = get_first_visible_message_id(user_profile.realm)
    query = limit_query_to_range(
        query=query,
        num_before=num_before,
        num_after=num_after,
        anchor=anchor,
        anchored_to_left=anchored_to_left,
        anchored_to_right=anchored_to_right,
        id_col=inner_msg_id_col,
        first_visible_message_id=first_visible_message_id,
    )

    main_query = alias(query)
    final_query = select(main_query.c, None, main_query).order_by(column("message_id").asc())
    final_query = final_query.prefix_with("/* get_messages */")
    rows = list(sa_conn.execute(final_query).fetchall())

    query_info = post_process_limited_query(
        rows=rows,
        num_before=num_before,
        num_after=num_after,
        anchor=anchor,
        anchored_to_left=anchored_to_left,
        anchored_to_right=anchored_to_right,
        first_visible_message_id=first_visible_message_id,
    )
    rows = query_info['rows']

    message_ids, user_message_flags, search_fields = _process_query_rows(
        rows=rows,
        is_search=is_search,
        user_profile=user_profile,
        include_history=include_history,
        apply_markdown=apply_markdown,
        client_gravatar=client_gravatar,
    )

    message_list = messages_for_ids(
        message_ids=message_ids,
        user_message_flags=user_message_flags,
        search_fields=search_fields,
        apply_markdown=apply_markdown,
        client_gravatar=client_gravatar,
        allow_edit_history=user_profile.realm.allow_edit_history,
    )

    statsd.incr('loaded_old_messages', len(message_list))

    return json_success({
        'messages': message_list,
        'result': 'success',
        'msg': '',
        'found_anchor': query_info['found_anchor'],
        'found_oldest': query_info['found_oldest'],
        'found_newest': query_info['found_newest'],
        'history_limited': query_info['history_limited'],
        'anchor': anchor,
    })
```