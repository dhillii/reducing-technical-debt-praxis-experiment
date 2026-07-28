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

class NarrowBuilder:
    def __init__(self, user_profile: UserProfile, msg_id_column: str) -> None:
        self.user_profile = user_profile
        self.msg_id_column = msg_id_column
        self.user_realm = user_profile.realm

    def add_term(self, query: Any, term: Dict[str, Any]) -> Any:
        operator = term['operator']
        operand = term['operand']

        negated = term.get('negated', False)

        method_name = 'by_' + operator.replace('-', '_')
        method = getattr(self, method_name, None)
        if method is None:
            raise BadNarrowOperator('unknown operator ' + operator)

        if negated:
            maybe_negate = not_
        else:
            maybe_negate = lambda cond: cond

        return method(query, operand, maybe_negate)

    def by_has(self, query: Any, operand: str, maybe_negate: Any) -> Any:
        if operand not in ['attachment', 'image', 'link']:
            raise BadNarrowOperator("unknown 'has' operand " + operand)
        col_name = 'has_' + operand
        cond = column(col_name)
        return query.where(maybe_negate(cond))

    def by_in(self, query: Any, operand: str, maybe_negate: Any) -> Any:
        if operand == 'home':
            conditions = exclude_muting_conditions(self.user_profile, [])
            return query.where(and_(*conditions))
        elif operand == 'all':
            return query

        raise BadNarrowOperator("unknown 'in' operand " + operand)

    def by_is(self, query: Any, operand: str, maybe_negate: Any) -> Any:
        if operand == 'private':
            cond = column("flags").op("&")(UserMessage.flags.is_private.mask) != 0
            return query.where(maybe_negate(cond))
        elif operand == 'starred':
            cond = column("flags").op("&")(UserMessage.flags.starred.mask) != 0
            return query.where(maybe_negate(cond))
        elif operand == 'unread':
            cond = column("flags").op("&")(UserMessage.flags.read.mask) == 0
            return query.where(maybe_negate(cond))
        elif operand == 'mentioned':
            cond1 = column("flags").op("&")(UserMessage.flags.mentioned.mask) != 0
            cond2 = column("flags").op("&")(UserMessage.flags.wildcard_mentioned.mask) != 0
            cond = or_(cond1, cond2)
            return query.where(maybe_negate(cond))
        elif operand == 'alerted':
            cond = column("flags").op("&")(UserMessage.flags.has_alert_word.mask) != 0
            return query.where(maybe_negate(cond))
        raise BadNarrowOperator("unknown 'is' operand " + operand)

    def by_stream(self, query: Any, operand: str, maybe_negate: Any) -> Any:
        try:
            stream = get_stream(operand, self.user_profile.realm)
        except Stream.DoesNotExist:
            raise BadNarrowOperator('unknown stream ' + operand)

        if self.user_profile.realm.is_zephyr_mirror_realm:
            m = re.search(r'^(?:un)*(.+?)(?:\.d)*$', stream.name, re.IGNORECASE)
            base_stream_name = m.group(1)

            matching_streams = get_active_streams(self.user_profile.realm).filter(
                name__iregex=r'^(un)*%s(\.d)*$' % (self._pg_re_escape(base_stream_name),))
            matching_stream_ids = [matching_stream.id for matching_stream in matching_streams]
            recipients_map = bulk_get_recipients(Recipient.STREAM, matching_stream_ids)
            cond = column("recipient_id").in_([recipient.id for recipient in recipients_map.values()])
            return query.where(maybe_negate(cond))

        recipient = get_stream_recipient(stream.id)
        cond = column("recipient_id") == recipient.id
        return query.where(maybe_negate(cond))

    def by_topic(self, query: Any, operand: str, maybe_negate: Any) -> Any:
        if self.user_profile.realm.is_zephyr_mirror_realm:
            m = re.search(r'^(.*?)(?:\.d)*$', operand, re.IGNORECASE)
            base_topic = m.group(1)

            cond = or_(
                func.upper(column("subject")) == func.upper(literal("")),
                func.upper(column("subject")) == func.upper(literal(".d")),
                func.upper(column("subject")) == func.upper(literal(".d.d")),
                func.upper(column("subject")) == func.upper(literal(".d.d.d")),
                func.upper(column("subject")) == func.upper(literal(".d.d.d.d")),
                func.upper(column("subject")) == func.upper(literal("personal")),
                func.upper(column("subject")) == func.upper(literal("personal.d")),
                func.upper(column("subject")) == func.upper(literal("personal.d.d")),
                func.upper(column("subject")) == func.upper(literal("personal.d.d.d")),
                func.upper(column("subject")) == func.upper(literal("personal.d.d.d.d")),
                func.upper(column("subject")) == func.upper(literal('(instance "")')),
                func.upper(column("subject")) == func.upper(literal('(instance "").d')),
                func.upper(column("subject")) == func.upper(literal('(instance "").d.d')),
                func.upper(column("subject")) == func.upper(literal('(instance "").d.d.d')),
                func.upper(column("subject")) == func.upper(literal('(instance "").d.d.d.d')),
            )
        else:
            cond = func.upper(column("subject")) == func.upper(literal(operand))
        return query.where(maybe_negate(cond))

    def by_sender(self, query: Any, operand: str, maybe_negate: Any) -> Any:
        try:
            sender = get_user_including_cross_realm(operand, self.user_realm)
        except UserProfile.DoesNotExist:
            raise BadNarrowOperator('unknown user ' + operand)

        cond = column("sender_id") == literal(sender.id)
        return query.where(maybe_negate(cond))

    def by_near(self, query: Any, operand: str, maybe_negate: Any) -> Any:
        return query

    def by_id(self, query: Any, operand: str, maybe_negate: Any) -> Any:
        if not str(operand).isdigit():
            raise BadNarrowOperator("Invalid message ID")
        cond = self.msg_id_column == literal(operand)
        return query.where(maybe_negate(cond))

    def by_pm_with(self, query: Any, operand: str, maybe_negate: Any) -> Any:
        emails = raw_pm_with_emails(
            email_str=operand,
            my_email=self.user_profile.email,
        )

        if len(emails) == 0:
            raise BadNarrowOperator('empty pm-with clause')

        if len(emails) >= 2:
            try:
                recipient = recipient_for_emails(emails, False,
                                                 self.user_profile, self.user_profile)
            except ValidationError:
                raise BadNarrowOperator('unknown recipient ' + operand)
            cond = column("recipient_id") == recipient.id
            return query.where(maybe_negate(cond))
        else:
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

    def by_group_pm_with(self, query: Any, operand: str,
                         maybe_negate: Any) -> Any:
        try:
            narrow_profile = get_user_including_cross_realm(operand, self.user_realm)
        except UserProfile.DoesNotExist:
            raise BadNarrowOperator('unknown user ' + operand)

        self_recipient_ids = [
            recipient_tuple['recipient_id'] for recipient_tuple
            in Subscription.objects.filter(
                user_profile=self.user_profile,
                recipient__type=Recipient.HUDDLE
            ).values("recipient_id")]
        narrow_recipient_ids = [
            recipient_tuple['recipient_id'] for recipient_tuple
            in Subscription.objects.filter(
                user_profile=narrow_profile,
                recipient__type=Recipient.HUDDLE
            ).values("recipient_id")]

        recipient_ids = set(self_recipient_ids) & set(narrow_recipient_ids)
        cond = column("recipient_id").in_(recipient_ids)
        return query.where(maybe_negate(cond))

    def by_search(self, query: Any, operand: str, maybe_negate: Any) -> Any:
        if settings.USING_PGROONGA:
            return self._by_search_pgroonga(query, operand, maybe_negate)
        else:
            return self._by_search_tsearch(query, operand, maybe_negate)

    def _by_search_pgroonga(self, query: Any, operand: str,
                            maybe_negate: Any) -> Any:
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

    def _by_search_tsearch(self, query: Any, operand: str,
                           maybe_negate: Any) -> Any:
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
    """Highlights a string based on the given locations."""
    highlight_start = '<span class="highlight">'
    highlight_stop = '</span>'
    pos = 0
    result = ''
    in_tag = False

    text_utf8 = text.encode('utf8')

    for loc in locs:
        (offset, length) = loc

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
            result += prefix
            result += match
        else:
            result += prefix
            result += highlight_start
            result += match
            result += highlight_stop
        pos = match_end

    if settings.USING_PGROONGA:
        final_frag = text[pos:]
    else:
        final_frag = text_utf8[pos:].decode()

    result += final_frag
    return result

def get_search_fields(rendered_content: str, subject: str, content_matches: Iterable[Tuple[int, int]],
                      subject_matches: Iterable[Tuple[int, int]]) -> Dict[str, str]:
    """Returns a dictionary of search fields."""
    return dict(match_content=highlight_string(rendered_content, content_matches),
                match_subject=highlight_string(escape_html(subject), subject_matches))

def narrow_parameter(json: str) -> Optional[List[Dict[str, Any]]]:
    """Parses a narrow parameter from JSON."""
    data = ujson.loads(json)
    if not isinstance(data, list):
        raise ValueError("argument is not a list")
    if len(data) == 0:
        return None

    def convert_term(elem: Union[Dict[str, Any], List[str]]) -> Dict[str, Any]:
        """Converts a term to a dictionary."""
        if isinstance(elem, list):
            if (len(elem) != 2 or
                any(not isinstance(x, str) and not isinstance(x, str)
                    for x in elem)):
                raise ValueError("element is not a string pair")
            return dict(operator=elem[0], operand=elem[1])

        if isinstance(elem, dict):
            validator = check_dict([
                ('operator', check_string),
                ('operand', check_string),
            ])

            error = validator('elem', elem)
            if error:
                raise JsonableError(error)

            return dict(
                operator=elem['operator'],
                operand=elem['operand'],
                negated=elem.get('negated', False),
            )

        raise ValueError("element is not a dictionary")

    return list(map(convert_term, data))

def ok_to_include_history(narrow: Optional[Iterable[Dict[str, Any]]], user_profile: UserProfile) -> bool:
    """Checks if it's okay to include history in a narrow."""
    include_history = False
    if narrow is not None:
        for term in narrow:
            if term['operator'] == "stream" and not term.get('negated', False):
                if can_access_stream_history_by_name(user_profile, term['operand']):
                    include_history = True
        for term in narrow:
            if term['operator'] == "is":
                include_history = False

    return include_history

def get_stream_name_from_narrow(narrow: Optional[Iterable[Dict[str, Any]]]) -> Optional[str]:
    """Gets the stream name from a narrow."""
    if narrow is not None:
        for term in narrow:
            if term['operator'] == 'stream':
                return term['operand'].lower()
    return None

def exclude_muting_conditions(user_profile: UserProfile,
                              narrow: Optional[Iterable[Dict[str, Any]]]) -> List[Any]:
    """Excludes muting conditions from a narrow."""
    conditions = []
    stream_name = get_stream_name_from_narrow(narrow)

    stream_id = None
    if stream_name is not None:
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
        muted_recipient_ids = [row['recipient_id'] for row in rows]
        if len(muted_recipient_ids) > 0:
            condition = not_(column("recipient_id").in_(muted_recipient_ids))
            conditions.append(condition)

    conditions = exclude_topic_mutes(conditions, user_profile, stream_id)

    return conditions

def get_base_query_for_search(user_profile: UserProfile,
                              need_message: bool,
                              need_user_message: bool) -> Tuple[Any, Any]:
    """Gets the base query for a search."""
    if need_message and need_user_message:
        query = select([column("message_id"), column("flags")],
                       column("user_profile_id") == literal(user_profile.id),
                       join(table("zerver_usermessage"), table("zerver_message"),
                            literal_column("zerver_usermessage.message_id") ==
                            literal_column("zerver_message.id")))
        inner_msg_id_col = column("message_id")
        return (query, inner_msg_id_col)

    if need_user_message:
        query = select([column("message_id"), column("flags")],
                       column("user_profile_id") == literal(user_profile.id),
                       table("zerver_usermessage"))
        inner_msg_id_col = column("message_id")
        return (query, inner_msg_id_col)

    else:
        assert(need_message)
        query = select([column("id").label("message_id")],
                       None,
                       table("zerver_message"))
        inner_msg_id_col = literal_column("zerver_message.id")
        return (query, inner_msg_id_col)

def add_narrow_conditions(user_profile: UserProfile,
                          inner_msg_id_col: Any,
                          query: Any,
                          narrow: List[Dict[str, Any]]) -> Tuple[Any, bool]:
    """Adds narrow conditions to a query."""
    is_search = False

    if narrow is None:
        return (query, is_search)

    builder = NarrowBuilder(user_profile, inner_msg_id_col)
    search_operands = []

    for term in narrow:
        if term['operator'] == 'search':
            search_operands.append(term['operand'])
        else:
            query = builder.add_term(query, term)

    if search_operands:
        is_search = True
        query = query.column(column("subject")).column(column("rendered_content"))
        search_term = dict(
            operator='search',
            operand=' '.join(search_operands)
        )
        query = builder.add_term(query, search_term)

    return (query, is_search)

def find_first_unread_anchor(sa_conn: Any,
                             user_profile: UserProfile,
                             narrow: List[Dict[str, Any]]) -> int:
    """Finds the first unread anchor."""
    need_user_message = True
    need_message = True

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

    condition = column("flags").op("&")(UserMessage.flags.read.mask) == 0

    muting_conditions = exclude_muting_conditions(user_profile, narrow)
    if muting_conditions:
        condition = and_(condition, *muting_conditions)

    if not narrow:
        pointer_condition = inner_msg_id_col >= user_profile.pointer
        condition = and_(condition, pointer_condition)

    first_unread_query = query.where(condition)
    first_unread_query = first_unread_query.order_by(inner_msg_id_col.asc()).limit(1)
    first_unread_result = list(sa_conn.execute(first_unread_query).fetchall())
    if len(first_unread_result) > 0:
        anchor = first_unread_result[0][0]
    else:
        anchor = LARGER_THAN_MAX_MESSAGE_ID

    return anchor

@has_request_variables
def zcommand_backend(request: HttpRequest, user_profile: UserProfile,
                     command: str=REQ('command')) -> HttpResponse:
    return json_success(process_zcommands(command, user_profile))

@has_request_variables
def get_messages_backend(request: HttpRequest, user_profile: UserProfile,
                         anchor: int=REQ(converter=int, default=None),
                         num_before: int=REQ(converter=to_non_negative_int),
                         num_after: int=REQ(converter=to_non_negative_int),
                         narrow: Optional[List[Dict[str, Any]]]=REQ('narrow', converter=narrow_parameter,
                                                                    default=None),
                         use_first_unread_anchor: bool=REQ(validator=check_bool, default=False),
                         client_gravatar: bool=REQ(validator=check_bool, default=False),
                         apply_markdown: bool=REQ(validator=check_bool, default=True)) -> HttpResponse:
    if anchor is None and not use_first_unread_anchor:
        return json_error(_("Missing 'anchor' argument (or set 'use_first_unread_anchor'=True)."))
    if num_before + num_after > MAX_MESSAGES_PER_FETCH:
        return json_error(_("Too many messages requested (maximum %s)."
                            % (MAX_MESSAGES_PER_FETCH,)))
    include_history = ok_to_include_history(narrow, user_profile)

    if include_history:
        need_message = True
        need_user_message = False
    elif narrow is None:
        need_message = False
        need_user_message = True
    else:
        need_message = True
        need_user_message = True

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

    if narrow is not None:
        verbose_operators = []
        for term in narrow:
            if term['operator'] == "is":
                verbose_operators.append("is:" + term['operand'])
            else:
                verbose_operators.append(term['operator'])
        request._log_data['extra'] = "[%s]" % (",".join(verbose_operators),)

    sa_conn = get_sqlalchemy_connection()

    if use_first_unread_anchor:
        anchor = find_first_unread_anchor(
            sa_conn,
            user_profile,
            narrow,
        )

    anchored_to_left = (anchor == 0)

    anchored_to_right = (anchor == LARGER_THAN_MAX_MESSAGE_ID)
    if anchored_to_right:
        num_after = None

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
    query = select(main_query.c, None, main_query).order_by(column("message_id").asc())
    query = query.prefix_with("/* get_messages */")
    rows = list(sa_conn.execute(query).fetchall())

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

    message_ids = []
    user_message_flags = {}
    if include_history:
        message_ids = [row[0] for row in rows]

        um_rows = UserMessage.objects.filter(user_profile=user_profile,
                                             message__id__in=message_ids)
        user_message_flags = {um.message_id: um.flags_list() for um in um_rows}

        for message_id in message_ids:
            if message_id not in user_message_flags:
                user_message_flags[message_id] = ["read", "historical"]
    else:
        for row in rows:
            message_id = row[0]
            flags = row[1]
            user_message_flags[message_id] = UserMessage.flags_list_for_flags(flags)
            message_ids.append(message_id)

    search_fields = {}
    if is_search:
        for row in rows:
            message_id = row[0]
            subject = row[-4]
            rendered_content = row[-3]
            content_matches = row[-2]
            subject_matches = row[-1]

            search_fields[message_id] = get_search_fields(rendered_content, subject,
                                                          content_matches, subject_matches)

    message_list = messages_for_ids(
        message_ids=message_ids,
        user_message_flags=user_message_flags,
        search_fields=search_fields,
        apply_markdown=apply_markdown,
        client_gravatar=client_gravatar,
        allow_edit_history=user_profile.realm.allow_edit_history,
    )

    statsd.incr('loaded_old_messages', len(message_list))

    ret = dict(
        messages=message_list,
        result='success',
        msg='',
        found_anchor=query_info['found_anchor'],
        found_oldest=query_info['found_oldest'],
        found_newest=query_info['found_newest'],
        history_limited=query_info['history_limited'],
        anchor=anchor,
    )
    return json_success(ret)

def limit_query_to_range(query: Any,
                         num_before: int,
                         num_after: int,
                         anchor: int,
                         anchored_to_left: bool,
                         anchored_to_right: bool,
                         id_col: Any,
                         first_visible_message_id: int) -> Any:
    """Limits a query to a range."""
    need_before_query = (not anchored_to_left) and (num_before > 0)
    need_after_query = (not anchored_to_right) and (num_after > 0)

    need_both_sides = need_before_query and need_after_query

    if need_both_sides:
        before_anchor = anchor - 1
        after_anchor = max(anchor, first_visible_message_id)
        before_limit = num_before
        after_limit = num_after + 1
    elif need_before_query:
        before_anchor = anchor
        before_limit = num_before
        if not anchored_to_right:
            before_limit += 1
    elif need_after_query:
        after_anchor = max(anchor, first_visible_message_id)
        after_limit = num_after + 1

    if need_before_query:
        before_query = query

        if not anchored_to_right:
            before_query = before_query.where(id_col <= before_anchor)

        before_query = before_query.order_by(id_col.desc())
        before_query = before_query.limit(before_limit)

    if need_after_query:
        after_query = query

        if not anchored_to_left:
            after_query = after_query.where(id_col >= after_anchor)

        after_query = after_query.order_by(id_col.asc())
        after_query = after_query.limit(after_limit)

    if need_both_sides:
        query = union_all(before_query.self_group(), after_query.self_group())
    elif need_before_query:
        query = before_query
    elif need_after_query:
        query = after_query
    else:
        query = query.where(id_col == anchor)

    return query

def post_process_limited_query(rows: List[Any],
                               num_before: int,
                               num_after: int,
                               anchor: int,
                               anchored_to_left: bool,
                               anchored_to_right: bool,
                               first_visible_message_id: int) -> Dict[str, Any]:
    """Post-processes a limited query."""
    visible_rows = [r for r in rows if r[0] >= first_visible_message_id]

    rows_limited = len(visible_rows) != len(rows)

    if anchored_to_right:
        num_after = 0
        before_rows = visible_rows[:]
        anchor_rows = []
        after_rows = []
    else:
        before_rows = [r for r in visible_rows if r[0] < anchor]
        anchor_rows = [r for r in visible_rows if r[0] == anchor]
        after_rows = [r for r in visible_rows if r[0] > anchor]

    if num_before:
        before_rows = before_rows[-1 * num_before:]

    if num_after:
        after_rows = after_rows[:num_after]

    visible_rows = before_rows + anchor_rows + after_rows

    found_anchor = len(anchor_rows) == 1
    found_oldest = anchored_to_left or (len(before_rows) < num_before)
    found_newest = anchored_to_right or (len(after_rows) < num_after)
    history_limited = rows_limited and found_oldest

    return dict(
        rows=visible_rows,
        found_anchor=found_anchor,
        found_newest=found_newest,
        found_oldest=found_oldest,
        history_limited=history_limited,
    )

@has_request_variables
def update_message_flags(request: HttpRequest, user_profile: UserProfile,
                         messages: List[int]=REQ(validator=check_list(check_int)),
                         operation: str=REQ('op'), flag: str=REQ()) -> HttpResponse:
    count = do_update_message_flags(user_profile, request.client, operation, flag, messages)

    target_count_str = str(len(messages))
    log_data_str = "[%s %s/%s] actually %s" % (operation, flag, target_count_str, count)
    request._log_data["extra"] = log_data_str

    return json_success({'result': 'success',
                         'messages': messages,
                         'msg': ''})

@has_request_variables
def mark_all_as_read(request: HttpRequest, user_profile: UserProfile) -> HttpResponse:
    count = do_mark_all_as_read(user_profile, request.client)

    log_data_str = "[%s updated]" % (count,)
    request._log_data["extra"] = log_data_str

    return json_success({'result': 'success',
                         'msg': ''})

@has_request_variables
def mark_stream_as_read(request: HttpRequest,
                        user_profile: UserProfile,
                        stream_id: int=REQ(validator=check_int)) -> HttpResponse:
    stream, recipient, sub = access_stream_by_id(user_profile, stream_id)
    count = do_mark_stream_messages_as_read(user_profile, request.client, stream)

    log_data_str = "[%s updated]" % (count,)
    request._log_data["extra"] = log_data_str

    return json_success({'result': 'success',
                         'msg': ''})

@has_request_variables
def mark_topic_as_read(request: HttpRequest,
                       user_profile: UserProfile,
                       stream_id: int=REQ(validator=check_int),
                       topic_name: str=REQ()) -> HttpResponse:
    stream, recipient, sub = access_stream_by_id(user_profile, stream_id)

    if topic_name:
        topic_exists = UserMessage.objects.filter(user_profile=user_profile,
                                                  message__recipient=recipient,
                                                  message__subject__iexact=topic_name).exists()
        if not topic_exists:
            raise JsonableError(_('No such topic \'%s\'') % (topic_name,))

    count = do_mark_stream_messages_as_read(user_profile, request.client, stream, topic_name)

    log_data_str = "[%s updated]" % (count,)
    request._log_data["extra"] = log_data_str

    return json_success({'result': 'success',
                         'msg': ''})

def create_mirrored_message_users(request: HttpRequest, user_profile: UserProfile,
                                  recipients: Iterable[str]) -> Tuple[bool, Optional[UserProfile]]:
    if "sender" not in request.POST:
        return (False, None)

    sender_email = request.POST["sender"].strip().lower()
    referenced_users = set([sender_email])
    if request.POST['type'] == 'private':
        for email in recipients:
            referenced_users.add(email.lower())

    if request.client.name == "zephyr_mirror":
        user_check = same_realm_zephyr_user
        fullname_function = compute_mit_user_fullname
    elif request.client.name == "irc_mirror":
        user_check = same_realm_irc_user
        fullname_function = compute_irc_user_fullname
    elif request.client.name in ("jabber_mirror", "JabberMirror"):
        user_check = same_realm_jabber_user
        fullname_function = compute_jabber_user_fullname
    else:
        return (False, None)

    for email in referenced_users:
        if not user_check(user_profile, email):
            return (False, None)

    for email in referenced_users:
        create_mirror_user_if_needed(user_profile.realm, email, fullname_function)

    sender = get_user_including_cross_realm(sender_email, user_profile.realm)
    return (True, sender)

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
    deliver_at = None
    local_tz = 'UTC'
    if tz_guess:
        local_tz = tz_guess
    elif sender.timezone:
        local_tz = sender.timezone
    try:
        deliver_at = dateparser(defer_until)
    except ValueError:
        return json_error(_("Invalid time format"))

    deliver_at_usertz = deliver_at
    if deliver_at_usertz.tzinfo is None:
        user_tz = get_timezone(local_tz)
        deliver_at_usertz = user_tz.normalize(user_tz.localize(deliver_at))

    deliver_at = convert_to_UTC(deliver_at_usertz)

    if deliver_at <= timezone_now():
        return json_error(_("Time must be in the future."))

    check_schedule_message(sender, client, message_type_name, message_to,
                           topic_name, message_content, delivery_type,
                           deliver_at, realm=realm,
                           forwarder_user_profile=forwarder_user_profile)
    return json_success({"deliver_at": str(deliver_at_usertz)})

@has_request_variables
def send_message_backend(request: HttpRequest, user_profile: UserProfile,
                         message_type_name: str=REQ('type'),
                         message_to: List[str]=REQ('to', converter=extract_recipients, default=[]),
                         forged: bool=REQ(default=False),
                         topic_name: Optional[str]=REQ('subject',
                                                       converter=lambda x: x.strip(), default=None),
                         message_content: str=REQ('content'),
                         widget_content: Optional[str]=REQ(default=None),
                         realm_str: Optional[str]=REQ('realm_str', default=None),
                         local_id: Optional[str]=REQ(default=None),
                         queue_id: Optional[str]=REQ(default=None),
                         delivery_type: Optional[str]=REQ('delivery_type', default='send_now'),
                         defer_until: Optional[str]=REQ('deliver_at', default=None),
                         tz_guess: Optional[str]=REQ('tz_guess', default=None)) -> HttpResponse:
    client = request.client
    is_super_user = request.user.is_api_super_user
    if forged and not is_super_user:
        return json_error(_("User not authorized for this query"))

    realm = None
    if realm_str and realm_str != user_profile.realm.string_id:
        if not is_super_user:
            return json_error(_("User not authorized for this query"))
        realm = get_realm(realm_str)
        if not realm:
            return json_error(_("Unknown organization '%s'") % (realm_str,))

    if client.name in ["zephyr_mirror", "irc_mirror", "jabber_mirror", "JabberMirror"]:
        valid_input, mirror_sender = create_mirrored_message_users(request, user_profile, message_to)
        if not valid_input:
            return json_error(_("Invalid mirrored message"))
        if client.name == "zephyr_mirror" and not user_profile.realm.is_zephyr_mirror_realm:
            return json_error(_("Zephyr mirroring is not allowed in this organization"))
        sender = mirror_sender
    else:
        sender = user_profile

    if (delivery_type == 'send_later' or delivery_type == 'remind') and defer_until is None:
        return json_error(_("Missing deliver_at in a request for delayed message delivery"))

    if (delivery_type == 'send_later' or delivery_type == 'remind') and defer_until is not None:
        return handle_deferred_message(sender, client, message_type_name,
                                       message_to, topic_name, message_content,
                                       delivery_type, defer_until, tz_guess,
                                       forwarder_user_profile=user_profile,
                                       realm=realm)

    ret = check_send_message(sender, client, message_type_name, message_to,
                             topic_name, message_content, forged=forged,
                             forged_timestamp = request.POST.get('time'),
                             forwarder_user_profile=user_profile, realm=realm,
                             local_id=local_id, sender_queue_id=queue_id,
                             widget_content=widget_content)
    return json_success({"id": ret})

def fill_edit_history_entries(message_history: List[Dict[str, Any]], message: Message) -> None:
    """Fills out the message edit history entries."""
    prev_content = message.content
    prev_rendered_content = message.rendered_content
    prev_topic = message.subject

    for entry in message_history:
        entry['topic'] = prev_topic
        if 'prev_subject' in entry:
            prev_topic = entry['prev_subject']
            entry['prev_topic'] = prev_topic
            del entry['prev_subject']

        entry['content'] = prev_content
        entry['rendered_content'] = prev_rendered_content
        if 'prev_content' in entry:
            del entry['prev_rendered_content_version']
            prev_content = entry['prev_content']
            prev_rendered_content = entry['prev_rendered_content']
            entry['content_html_diff'] = highlight_html_differences(
                prev_rendered_content,
                entry['rendered_content'],
                message.id)

    message_history.append(dict(
        topic = prev_topic,
        content = prev_content,
        rendered_content = prev_rendered_content,
        timestamp = datetime_to_timestamp(message.pub_date),
        user_id = message.sender_id,
    ))

@has_request_variables
def get_message_edit_history(request: HttpRequest, user_profile: UserProfile,
                             message_id: int=REQ(converter=to_non_negative_int)) -> HttpResponse:
    if not user_profile.realm.allow_edit_history:
        return json_error(_("Message edit history is disabled in this organization"))
    message, ignored_user_message = access_message(user_profile, message_id)

    if message.edit_history is not None:
        message_edit_history = ujson.loads(message.edit_history)
    else:
        message_edit_history = []

    fill_edit_history_entries(message_edit_history, message)
    return json_success({"message_history": reversed(message_edit_history)})

@has_request_variables
def update_message_backend(request: HttpRequest, user_profile: UserProfile,
                           message_id: int=REQ(converter=to_non_negative_int),
                           subject: Optional[str]=REQ(default=None),
                           propagate_mode: Optional[str]=REQ(default="change_one"),
                           content: Optional[str]=REQ(default=None)) -> HttpResponse:
    if not user_profile.realm.allow_message_editing:
        return json_error(_("Your organization has turned off message editing"))

    message, ignored_user_message = access_message(user_profile, message_id)
    is_no_topic_msg = (message.topic_name() == "(no topic)")

    if message.sender == user_profile:
        pass
    elif (content is None) and (is_no_topic_msg or
                                user_profile.is_realm_admin or
                                user_profile.realm.allow_community_topic_editing):
        pass
    else:
        raise JsonableError(_("You don't have permission to edit this message"))

    if content is not None and user_profile.realm.message_content_edit_limit_seconds > 0:
        deadline_seconds = user_profile.realm.message_content_edit_limit_seconds + 20
        if (timezone_now() - message.pub_date) > datetime.timedelta(seconds=deadline_seconds):
            raise JsonableError(_("The time limit for editing this message has passed"))

    if content is None and message.sender != user_profile and not user_profile.is_realm_admin and \
            not is_no_topic_msg:
        deadline_seconds = Realm.DEFAULT_COMMUNITY_TOPIC_EDITING_LIMIT_SECONDS + 20
        if (timezone_now() - message.pub_date) > datetime.timedelta(seconds=deadline_seconds):
            raise JsonableError(_("The time limit for editing this message has passed"))

    if subject is None and content is None:
        return json_error(_("Nothing to change"))
    if subject is not None:
        subject = subject.strip()
        if subject == "":
            raise JsonableError(_("Topic can't be empty"))
    rendered_content = None
    links_for_embed = set()
    prior_mention_user_ids = set()
    mention_user_ids = set()
    if content is not None:
        content = content.strip()
        if content == "":
            content = "(deleted)"
        content = truncate_body(content)

        user_info = get_user_info_for_message_updates(message.id)
        prior_mention_user_ids = user_info['mention_user_ids']

        rendered_content = render_incoming_message(message,
                                                   content,
                                                   user_info['message_user_ids'],
                                                   user_profile.realm)
        links_for_embed |= message.links_for_preview

        mention_user_ids = message.mentions_user_ids

    number_changed = do_update_message(user_profile, message, subject,
                                       propagate_mode, content, rendered_content,
                                       prior_mention_user_ids,
                                       mention_user_ids)

    request._log_data['extra'] = "[%s]" % (number_changed,)
    if links_for_embed and bugdown.url_embed_preview_enabled_for_realm(message):
        event_data = {
            'message_id': message.id,
            'message_content': message.content,
            'message_realm_id': user_profile.realm_id,
            'urls': links_for_embed}
        queue_json_publish('embed_links', event_data)
    return json_success()

def validate_can_delete_message(user_profile: UserProfile, message: Message) -> None:
    if user_profile.is_realm_admin:
        return
    if message.sender != user_profile:
        raise JsonableError(_("You don't have permission to delete this message"))
    if not user_profile.realm.allow_message_deleting:
        raise JsonableError(_("You don't have permission to delete this message"))

    deadline_seconds = user_profile.realm.message_content_delete_limit_seconds
    if deadline_seconds == 0:
        return
    if (timezone_now() - message.pub_date) > datetime.timedelta(seconds=deadline_seconds):
        raise JsonableError(_("The time limit for deleting this message has passed"))

@has_request_variables
def delete_message_backend(request: HttpRequest, user_profile: UserProfile,
                           message_id: int=REQ(converter=to_non_negative_int)) -> HttpResponse:
    message, ignored_user_message = access_message(user_profile, message_id)
    validate_can_delete_message(user_profile, message)
    do_delete_message(user_profile, message)
    return json_success()

@has_request_variables
def json_fetch_raw_message(request: HttpRequest, user_profile: UserProfile,
                           message_id: int=REQ(converter=to_non_negative_int)) -> HttpResponse:
    message, user_message = access_message(user_profile, message_id)
    return json_success({"raw_content": message.content})

@has_request_variables
def render_message_backend(request: HttpRequest, user_profile: UserProfile,
                           content: str=REQ()) -> HttpResponse:
    message = Message()
    message.sender = user_profile
    message.content = content
    message.sending_client = request.client

    rendered_content = render_markdown(message, content, realm=user_profile.realm)
    return json_success({"rendered": rendered_content})

@has_request_variables
def messages_in_narrow_backend(request: HttpRequest, user_profile: UserProfile,
                               msg_ids: List[int]=REQ(validator=check_list(check_int)),
                               narrow: Optional[List[Dict[str, Any]]]=REQ(converter=narrow_parameter)
                               ) -> HttpResponse:
    first_visible_message_id = get_first_visible_message_id(user_profile.realm)
    msg_ids = [message_id for message_id in msg_ids if message_id >= first_visible_message_id]

    query = select([column("message_id"), column("subject"), column("rendered_content")],
                   and_(column("user_profile_id") == literal(user_profile.id),
                        column("message_id").in_(msg_ids)),
                   join(table("zerver_usermessage"), table("zerver_message"),
                        literal_column("zerver_usermessage.message_id") ==
                        literal_column("zerver_message.id")))

    builder = NarrowBuilder(user_profile, column("message_id"))
    if narrow is not None:
        for term in narrow:
            query = builder.add_term(query, term)

    sa_conn = get_sqlalchemy_connection()
    query_result = list(sa_conn.execute(query).fetchall())

    search_fields = {}
    for row in query_result:
        message_id = row['message_id']
        subject = row['subject']
        rendered_content = row['rendered_content']

        if 'content_matches' in row:
            content_matches = row['content_matches']
            subject_matches = row['subject_matches']
            search_fields[message_id] = get_search_fields(rendered_content, subject,
                                                          content_matches, subject_matches)
        else:
            search_fields[message_id] = dict(
                match_content=rendered_content,
                match_subject=escape_html(subject),
            )

    return json_success({"messages": search_fields})