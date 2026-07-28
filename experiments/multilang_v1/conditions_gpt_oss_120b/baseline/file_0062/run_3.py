# -*- coding: utf-8 -*-

# Unit tests for cache framework
# Uses whatever cache backend is set in the test settings file.
from __future__ import unicode_literals

import copy
import io
import os
import re
import shutil
import tempfile
import threading
import time
import unittest
import warnings

from django.conf import settings
from django.core import management, signals
from django.core.cache import (
    DEFAULT_CACHE_ALIAS, CacheKeyWarning, cache, caches,
)
from django.core.cache.utils import make_template_fragment_key
from django.db import close_old_connections, connection, connections
from django.http import (
    HttpRequest, HttpResponse, HttpResponseNotModified, StreamingHttpResponse,
)
from django.middleware.cache import (
    CacheMiddleware, FetchFromCacheMiddleware, UpdateCacheMiddleware,
)
from django.middleware.csrf import CsrfViewMiddleware
from django.template import engines
from django.template.context_processors import csrf
from django.template.response import TemplateResponse
from django.test import (
    RequestFactory, SimpleTestCase, TestCase, TransactionTestCase,
    ignore_warnings, mock, override_settings,
)
from django.test.signals import setting_changed
from django.utils import six, timezone, translation
from django.utils.cache import (
    get_cache_key, learn_cache_key, patch_cache_control,
    patch_response_headers, patch_vary_headers,
)
from django.utils.deprecation import RemovedInDjango21Warning
from django.utils.encoding import force_text
from django.views.decorators.cache import cache_page

from .models import Poll, expensive_calculation

try:    # Use the same idiom as in cache backends
    from django.utils.six.moves import cPickle as pickle
except ImportError:
    import pickle


def f():
    return 42


class C:
    def m(n):
        return 24


class Unpicklable(object):
    def __getstate__(self):
        raise pickle.PickleError()


class UnpicklableType(object):
    __slots__ = 'a',


@override_settings(CACHES={
    'default': {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    }
})
class DummyCacheTests(SimpleTestCase):
    def test_simple(self):
        cache.set("key", "value")
        self.assertIsNone(cache.get("key"))

    def test_add(self):
        cache.add("addkey1", "value")
        result = cache.add("addkey1", "newvalue")
        self.assertTrue(result)
        self.assertIsNone(cache.get("addkey1"))

    def test_non_existent(self):
        self.assertIsNone(cache.get("does_not_exist"))
        self.assertEqual(cache.get("does_not_exist", "bang!"), "bang!")

    def test_get_many(self):
        cache.set('a', 'a')
        cache.set('b', 'b')
        cache.set('c', 'c')
        cache.set('d', 'd')
        self.assertEqual(cache.get_many(['a', 'c', 'd']), {})
        self.assertEqual(cache.get_many(['a', 'b', 'e']), {})

    def test_delete(self):
        cache.set("key1", "spam")
        cache.set("key2", "eggs")
        self.assertIsNone(cache.get("key1"))
        cache.delete("key1")
        self.assertIsNone(cache.get("key1"))
        self.assertIsNone(cache.get("key2"))

    def test_has_key(self):
        cache.set("hello1", "goodbye1")
        self.assertFalse(cache.has_key("hello1"))
        self.assertFalse(cache.has_key("goodbye1"))

    def test_in(self):
        cache.set("hello2", "goodbye2")
        self.assertNotIn("hello2", cache)
        self.assertNotIn("goodbye2", cache)

    def test_incr(self):
        cache.set('answer', 42)
        with self.assertRaises(ValueError):
            cache.incr('answer')
        with self.assertRaises(ValueError):
            cache.incr('does_not_exist')

    def test_decr(self):
        cache.set('answer', 42)
        with self.assertRaises(ValueError):
            cache.decr('answer')
        with self.assertRaises(ValueError):
            cache.decr('does_not_exist')

    def test_data_types(self):
        stuff = {
            'string': 'this is a string',
            'int': 42,
            'list': [1, 2, 3, 4],
            'tuple': (1, 2, 3, 4),
            'dict': {'A': 1, 'B': 2},
            'function': f,
            'class': C,
        }
        cache.set("stuff", stuff)
        self.assertIsNone(cache.get("stuff"))

    def test_expiration(self):
        cache.set('expire1', 'very quickly', 1)
        cache.set('expire2', 'very quickly', 1)
        cache.set('expire3', 'very quickly', 1)

        time.sleep(2)
        self.assertIsNone(cache.get("expire1"))

        cache.add("expire2", "newvalue")
        self.assertIsNone(cache.get("expire2"))
        self.assertFalse(cache.has_key("expire3"))

    def test_unicode(self):
        stuff = {
            'ascii': 'ascii_value',
            'unicode_ascii': 'Iñtërnâtiônàlizætiøn1',
            'Iñtërnâtiônàlizætiøn': 'Iñtërnâtiônàlizætiøn2',
            'ascii2': {'x': 1}
        }
        for (key, value) in stuff.items():
            cache.set(key, value)
            self.assertIsNone(cache.get(key))

    def test_set_many(self):
        cache.set_many({'a': 1, 'b': 2})
        cache.set_many({'a': 1, 'b': 2}, timeout=2, version='1')

    def test_delete_many(self):
        cache.delete_many(['a', 'b'])

    def test_clear(self):
        cache.clear()

    def test_incr_version(self):
        cache.set('answer', 42)
        with self.assertRaises(ValueError):
            cache.incr_version('answer')
        with self.assertRaises(ValueError):
            cache.incr_version('does_not_exist')

    def test_decr_version(self):
        cache.set('answer', 42)
        with self.assertRaises(ValueError):
            cache.decr_version('answer')
        with self.assertRaises(ValueError):
            cache.decr_version('does_not_exist')

    def test_get_or_set(self):
        self.assertEqual(cache.get_or_set('mykey', 'default'), 'default')
        self.assertEqual(cache.get_or_set('mykey', None), None)

    def test_get_or_set_callable(self):
        def my_callable():
            return 'default'

        self.assertEqual(cache.get_or_set('mykey', my_callable), 'default')
        self.assertEqual(cache.get_or_set('mykey', my_callable()), 'default')


def custom_key_func(key, key_prefix, version):
    return 'CUSTOM-' + '-'.join([key_prefix, str(version), key])


_caches_setting_base = {
    'default': {},
    'prefix': {'KEY_PREFIX': 'cacheprefix{}'.format(os.getpid())},
    'v2': {'VERSION': 2},
    'custom_key': {'KEY_FUNCTION': custom_key_func},
    'custom_key2': {'KEY_FUNCTION': 'cache.tests.custom_key_func'},
    'cull': {'OPTIONS': {'MAX_ENTRIES': 30}},
    'zero_cull': {'OPTIONS': {'CULL_FREQUENCY': 0, 'MAX_ENTRIES': 30}},
}


def caches_setting_for_tests(base=None, exclude=None, **params):
    base = base or {}
    exclude = exclude or set()
    setting = {k: base.copy() for k in _caches_setting_base.keys() if k not in exclude}
    for key, cache_params in setting.items():
        cache_params.update(_caches_setting_base[key])
        cache_params.update(params)
    return setting


class BaseCacheTests(object):
    def setUp(self):
        self.factory = RequestFactory()

    def tearDown(self):
        cache.clear()

    def test_simple(self):
        cache.set("key", "value")
        self.assertEqual(cache.get("key"), "value")

    def test_add(self):
        cache.add("addkey1", "value")
        result = cache.add("addkey1", "newvalue")
        self.assertFalse(result)
        self.assertEqual(cache.get("addkey1"), "value")

    def test_prefix(self):
        cache.set('somekey', 'value')
        self.assertFalse(caches['prefix'].has_key('somekey'))
        caches['prefix'].set('somekey', 'value2')
        self.assertEqual(cache.get('somekey'), 'value')
        self.assertEqual(caches['prefix'].get('somekey'), 'value2')

    def test_non_existent(self):
        self.assertIsNone(cache.get("does_not_exist"))
        self.assertEqual(cache.get("does_not_exist", "bang!"), "bang!")

    def test_get_many(self):
        cache.set('a', 'a')
        cache.set('b', 'b')
        cache.set('c', 'c')
        cache.set('d', 'd')
        self.assertDictEqual(cache.get_many(['a', 'c', 'd']), {'a': 'a', 'c': 'c', 'd': 'd'})
        self.assertDictEqual(cache.get_many(['a', 'b', 'e']), {'a': 'a', 'b': 'b'})

    def test_delete(self):
        cache.set("key1", "spam")
        cache.set("key2", "eggs")
        self.assertEqual(cache.get("key1"), "spam")
        cache.delete("key1")
        self.assertIsNone(cache.get("key1"))
        self.assertEqual(cache.get("key2"), "eggs")

    def test_has_key(self):
        cache.set("hello1", "goodbye1")
        self.assertTrue(cache.has_key("hello1"))
        self.assertFalse(cache.has_key("goodbye1"))
        cache.set("no_expiry", "here", None)
        self.assertTrue(cache.has_key("no_expiry"))

    def test_in(self):
        cache.set("hello2", "goodbye2")
        self.assertIn("hello2", cache)
        self.assertNotIn("goodbye2", cache)

    def test_incr(self):
        cache.set('answer', 41)
        self.assertEqual(cache.incr('answer'), 42)
        self.assertEqual(cache.get('answer'), 42)
        self.assertEqual(cache.incr('answer', 10), 52)
        self.assertEqual(cache.get('answer'), 52)
        self.assertEqual(cache.incr('answer', -10), 42)
        with self.assertRaises(ValueError):
            cache.incr('does_not_exist')

    def test_decr(self):
        cache.set('answer', 43)
        self.assertEqual(cache.decr('answer'), 42)
        self.assertEqual(cache.get('answer'), 42)
        self.assertEqual(cache.decr('answer', 10), 32)
        self.assertEqual(cache.get('answer'), 32)
        self.assertEqual(cache.decr('answer', -10), 42)
        with self.assertRaises(ValueError):
            cache.decr('does_not_exist')

    def test_close(self):
        self.assertTrue(hasattr(cache, 'close'))
        cache.close()

    def test_data_types(self):
        stuff = {
            'string': 'this is a string',
            'int': 42,
            'list': [1, 2, 3, 4],
            'tuple': (1, 2, 3, 4),
            'dict': {'A': 1, 'B': 2},
            'function': f,
            'class': C,
        }
        cache.set("stuff", stuff)
        self.assertEqual(cache.get("stuff"), stuff)

    def test_cache_read_for_model_instance(self):
        expensive_calculation.num_runs = 0
        Poll.objects.all().delete()
        my_poll = Poll.objects.create(question="Well?")
        self.assertEqual(Poll.objects.count(), 1)
        pub_date = my_poll.pub_date
        cache.set('question', my_poll)
        cached_poll = cache.get('question')
        self.assertEqual(cached_poll.pub_date, pub_date)
        self.assertEqual(expensive_calculation.num_runs, 1)

    def test_cache_write_for_model_instance_with_deferred(self):
        expensive_calculation.num_runs = 0
        Poll.objects.all().delete()
        Poll.objects.create(question="What?")
        self.assertEqual(expensive_calculation.num_runs, 1)
        defer_qs = Poll.objects.all().defer('question')
        self.assertEqual(defer_qs.count(), 1)
        self.assertEqual(expensive_calculation.num_runs, 1)
        cache.set('deferred_queryset', defer_qs)
        self.assertEqual(expensive_calculation.num_runs, 1)

    def test_cache_read_for_model_instance_with_deferred(self):
        expensive_calculation.num_runs = 0
        Poll.objects.all().delete()
        Poll.objects.create(question="What?")
        self.assertEqual(expensive_calculation.num_runs, 1)
        defer_qs = Poll.objects.all().defer('question')
        self.assertEqual(defer_qs.count(), 1)
        cache.set('deferred_queryset', defer_qs)
        self.assertEqual(expensive_calculation.num_runs, 1)
        runs_before_cache_read = expensive_calculation.num_runs
        cache.get('deferred_queryset')
        self.assertEqual(expensive_calculation.num_runs, runs_before_cache_read)

    def test_expiration(self):
        cache.set('expire1', 'very quickly', 1)
        cache.set('expire2', 'very quickly', 1)
        cache.set('expire3', 'very quickly', 1)

        time.sleep(2)
        self.assertIsNone(cache.get("expire1"))

        cache.add("expire2", "newvalue")
        self.assertEqual(cache.get("expire2"), "newvalue")
        self.assertFalse(cache.has_key("expire3"))

    def test_unicode(self):
        stuff = {
            'ascii': 'ascii_value',
            'unicode_ascii': 'Iñtërnâtiônàlizætiøn1',
            'Iñtërnâtiônàlizætiøn': 'Iñtërnâtiônàlizætiøn2',
            'ascii2': {'x': 1}
        }
        for (key, value) in stuff.items():
            cache.set(key, value)
            self.assertEqual(cache.get(key), value)

        for (key, value) in stuff.items():
            cache.delete(key)
            cache.add(key, value)
            self.assertEqual(cache.get(key), value)

        for (key, value) in stuff.items():
            cache.delete(key)
        cache.set_many(stuff)
        for (key, value) in stuff.items():
            self.assertEqual(cache.get(key), value)

    def test_binary_string(self):
        from zlib import compress, decompress
        value = 'value_to_be_compressed'
        compressed_value = compress(value.encode())

        cache.set('binary1', compressed_value)
        compressed_result = cache.get('binary1')
        self.assertEqual(compressed_value, compressed_result)
        self.assertEqual(value, decompress(compressed_result).decode())

        cache.add('binary1-add', compressed_value)
        compressed_result = cache.get('binary1-add')
        self.assertEqual(compressed_value, compressed_result)
        self.assertEqual(value, decompress(compressed_result).decode())

        cache.set_many({'binary1-set_many': compressed_value})
        compressed_result = cache.get('binary1-set_many')
        self.assertEqual(compressed_value, compressed_result)
        self.assertEqual(value, decompress(compressed_result).decode())

    def test_set_many(self):
        cache.set_many({"key1": "spam", "key2": "eggs"})
        self.assertEqual(cache.get("key1"), "spam")
        self.assertEqual(cache.get("key2"), "eggs")

    def test_set_many_expiration(self):
        cache.set_many({"key1": "spam", "key2": "eggs"}, 1)
        time.sleep(2)
        self.assertIsNone(cache.get("key1"))
        self.assertIsNone(cache.get("key2"))

    def test_delete_many(self):
        cache.set("key1", "spam")
        cache.set("key2", "eggs")
        cache.set("key3", "ham")
        cache.delete_many(["key1", "key2"])
        self.assertIsNone(cache.get("key1"))
        self.assertIsNone(cache.get("key2"))
        self.assertEqual(cache.get("key3"), "ham")

    def test_clear(self):
        cache.set("key1", "spam")
        cache.set("key2", "eggs")
        cache.clear()
        self.assertIsNone(cache.get("key1"))
        self.assertIsNone(cache.get("key2"))

    def test_long_timeout(self):
        cache.set('key1', 'eggs', 60 * 60 * 24 * 30 + 1)
        self.assertEqual(cache.get('key1'), 'eggs')
        cache.add('key2', 'ham', 60 * 60 * 24 * 30 + 1)
        self.assertEqual(cache.get('key2'), 'ham')
        cache.set_many({'key3': 'sausage', 'key4': 'lobster bisque'}, 60 * 60 * 24 * 30 + 1)
        self.assertEqual(cache.get('key3'), 'sausage')
        self.assertEqual(cache.get('key4'), 'lobster bisque')

    def test_forever_timeout(self):
        cache.set('key1', 'eggs', None)
        self.assertEqual(cache.get('key1'), 'eggs')
        cache.add('key2', 'ham', None)
        self.assertEqual(cache.get('key2'), 'ham')
        added = cache.add('key1', 'new eggs', None)
        self.assertIs(added, False)
        self.assertEqual(cache.get('key1'), 'eggs')
        cache.set_many({'key3': 'sausage', 'key4': 'lobster bisque'}, None)
        self.assertEqual(cache.get('key3'), 'sausage')
        self.assertEqual(cache.get('key4'), 'lobster bisque')

    def test_zero_timeout(self):
        cache.set('key1', 'eggs', 0)
        self.assertIsNone(cache.get('key1'))
        cache.add('key2', 'ham', 0)
        self.assertIsNone(cache.get('key2'))
        cache.set_many({'key3': 'sausage', 'key4': 'lobster bisque'}, 0)
        self.assertIsNone(cache.get('key3'))
        self.assertIsNone(cache.get('key4'))

    def test_float_timeout(self):
        cache.set("key1", "spam", 100.2)
        self.assertEqual(cache.get("key1"), "spam")

    def _perform_cull_test(self, cull_cache, initial_count, final_count):
        for i in range(1, initial_count):
            cull_cache.set('cull%d' % i, 'value', 1000)
        count = sum(1 for i in range(1, initial_count) if cull_cache.has_key('cull%d' % i))
        self.assertEqual(count, final_count)

    def test_cull(self):
        self._perform_cull_test(caches['cull'], 50, 29)

    def test_zero_cull(self):
        self._perform_cull_test(caches['zero_cull'], 50, 19)

    def _perform_invalid_key_test(self, key, expected_warning):
        def func(key, *args):
            return key

        old_func = cache.key_func
        cache.key_func = func
        try:
            with warnings.catch_warnings(record=True) as w:
                warnings.simplefilter("always")
                cache.set(key, 'value')
                self.assertEqual(len(w), 1)
                self.assertIsInstance(w[0].message, CacheKeyWarning)
                self.assertEqual(str(w[0].message.args[0]), expected_warning)
        finally:
            cache.key_func = old_func

    def test_invalid_key_characters(self):
        key = 'key with spaces and 清'
        expected_warning = (
            "Cache key contains characters that will cause errors if used "
            "with memcached: %r" % key
        )
        self._perform_invalid_key_test(key, expected_warning)

    def test_invalid_key_length(self):
        key = ('a' * 250) + '清'
        expected_warning = (
            'Cache key will cause errors if used with memcached: '
            '%r (longer than %s)' % (key, 250)
        )
        self._perform_invalid_key_test(key, expected_warning)

    # Versioning tests split into smaller methods
    def test_versioning_set_get_default(self):
        cache.set('answer1', 42)
        self.assertEqual(cache.get('answer1'), 42)
        self.assertEqual(cache.get('answer1', version=1), 42)
        self.assertIsNone(cache.get('answer1', version=2))

    def test_versioning_set_get_other_cache(self):
        self.assertIsNone(caches['v2'].get('answer1'))
        self.assertEqual(caches['v2'].get('answer1', version=1), 42)
        self.assertIsNone(caches['v2'].get('answer1', version=2))

    def test_versioning_set_custom_version(self):
        cache.set('answer2', 42, version=2)
        self.assertIsNone(cache.get('answer2'))
        self.assertIsNone(cache.get('answer2', version=1))
        self.assertEqual(cache.get('answer2', version=2), 42)

    def test_versioning_v2_set_custom_version(self):
        self.assertEqual(caches['v2'].get('answer2'), 42)
        self.assertIsNone(caches['v2'].get('answer2', version=1))
        self.assertEqual(caches['v2'].get('answer2', version=2), 42)

    def test_versioning_v2_default(self):
        caches['v2'].set('answer3', 42)
        self.assertIsNone(cache.get('answer3'))
        self.assertIsNone(cache.get('answer3', version=1))
        self.assertEqual(cache.get('answer3', version=2), 42)

    def test_versioning_v2_override(self):
        caches['v2'].set('answer4', 42, version=1)
        self.assertEqual(cache.get('answer4'), 42)
        self.assertEqual(cache.get('answer4', version=1), 42)
        self.assertIsNone(cache.get('answer4', version=2))

    def test_versioning_add_default(self):
        cache.add('answer1', 42, version=2)
        self.assertIsNone(cache.get('answer1', version=1))
        self.assertEqual(cache.get('answer1', version=2), 42)

        cache.add('answer1', 37, version=2)
        self.assertIsNone(cache.get('answer1', version=1))
        self.assertEqual(cache.get('answer1', version=2), 42)

        cache.add('answer1', 37, version=1)
        self.assertEqual(cache.get('answer1', version=1), 37)
        self.assertEqual(cache.get('answer1', version=2), 42)

    def test_versioning_add_v2(self):
        caches['v2'].add('answer2', 42)
        self.assertIsNone(cache.get('answer2', version=1))
        self.assertEqual(cache.get('answer2', version=2), 42)

        caches['v2'].add('answer2', 37)
        self.assertIsNone(cache.get('answer2', version=1))
        self.assertEqual(cache.get('answer2', version=2), 42)

        caches['v2'].add('answer2', 37, version=1)
        self.assertEqual(cache.get('answer2', version=1), 37)
        self.assertEqual(cache.get('answer2', version=2), 42)

    def test_versioning_has_key(self):
        cache.set('answer1', 42)
        self.assertTrue(cache.has_key('answer1'))
        self.assertTrue(cache.has_key('answer1', version=1))
        self.assertFalse(cache.has_key('answer1', version=2))
        self.assertFalse(caches['v2'].has_key('answer1'))
        self.assertTrue(caches['v2'].has_key('answer1', version=1))
        self.assertFalse(caches['v2'].has_key('answer1', version=2))

    def test_versioning_delete_default(self):
        cache.set('answer1', 37, version=1)
        cache.set('answer1', 42, version=2)
        cache.delete('answer1')
        self.assertIsNone(cache.get('answer1', version=1))
        self.assertEqual(cache.get('answer1', version=2), 42)

    def test_versioning_delete_specific(self):
        cache.set('answer2', 37, version=1)
        cache.set('answer2', 42, version=2)
        cache.delete('answer2', version=2)
        self.assertEqual(cache.get('answer2', version=1), 37)
        self.assertIsNone(cache.get('answer2', version=2))

    def test_versioning_delete_v2(self):
        cache.set('answer3', 37, version=1)
        cache.set('answer3', 42, version=2)
        caches['v2'].delete('answer3')
        self.assertEqual(cache.get('answer3', version=1), 37)
        self.assertIsNone(cache.get('answer3', version=2))

    def test_versioning_delete_v2_specific(self):
        cache.set('answer4', 37, version=1)
        cache.set('answer4', 42, version=2)
        caches['v2'].delete('answer4', version=1)
        self.assertIsNone(cache.get('answer4', version=1))
        self.assertEqual(cache.get('answer4', version=2), 42)

    def test_versioning_incr_decr_default(self):
        cache.set('answer1', 37, version=1)
        cache.set('answer1', 42, version=2)
        cache.incr('answer1')
        self.assertEqual(cache.get('answer1', version=1), 38)
        self.assertEqual(cache.get('answer1', version=2), 42)
        cache.decr('answer1')
        self.assertEqual(cache.get('answer1', version=1), 37)
        self.assertEqual(cache.get('answer1', version=2), 42)

    def test_versioning_incr_decr_specific(self):
        cache.set('answer2', 37, version=1)
        cache.set('answer2', 42, version=2)
        cache.incr('answer2', version=2)
        self.assertEqual(cache.get('answer2', version=1), 37)
        self.assertEqual(cache.get('answer2', version=2), 43)
        cache.decr('answer2', version=2)
        self.assertEqual(cache.get('answer2', version=1), 37)
        self.assertEqual(cache.get('answer2', version=2), 42)

    def test_versioning_incr_decr_v2(self):
        cache.set('answer3', 37, version=1)
        cache.set('answer3', 42, version=2)
        caches['v2'].incr('answer3')
        self.assertEqual(cache.get('answer3', version=1), 37)
        self.assertEqual(cache.get('answer3', version=2), 43)
        caches['v2'].decr('answer3')
        self.assertEqual(cache.get('answer3', version=1), 37)
        self.assertEqual(cache.get('answer3', version=2), 42)

    def test_versioning_incr_decr_v2_specific(self):
        cache.set('answer4', 37, version=1)
        cache.set('answer4', 42, version=2)
        caches['v2'].incr('answer4', version=1)
        self.assertEqual(cache.get('answer4', version=1), 38)
        self.assertEqual(cache.get('answer4', version=2), 42)
        caches['v2'].decr('answer4', version=1)
        self.assertEqual(cache.get('answer4', version=1), 37)
        self.assertEqual(cache.get('answer4', version=2), 42)

    def test_versioning_get_set_many_default(self):
        cache.set_many({'ford1': 37, 'arthur1': 42})
        self.assertDictEqual(cache.get_many(['ford1', 'arthur1']), {'ford1': 37, 'arthur1': 42})
        self.assertDictEqual(cache.get_many(['ford1', 'arthur1'], version=1), {'ford1': 37, 'arthur1': 42})
        self.assertDictEqual(cache.get_many(['ford1', 'arthur1'], version=2), {})

    def test_versioning_get_set_many_v2(self):
        self.assertDictEqual(caches['v2'].get_many(['ford1', 'arthur1']), {})
        self.assertDictEqual(caches['v2'].get_many(['ford1', 'arthur1'], version=1), {'ford1': 37, 'arthur1': 42})
        self.assertDictEqual(caches['v2'].get_many(['ford1', 'arthur1'], version=2), {})

    def test_versioning_get_set_many_custom_version(self):
        cache.set_many({'ford2': 37, 'arthur2': 42}, version=2)
        self.assertDictEqual(cache.get_many(['ford2', 'arthur2'], version=2), {'ford2': 37, 'arthur2': 42})
        self.assertDictEqual(caches['v2'].get_many(['ford2', 'arthur2']), {'ford2': 37, 'arthur2': 42})
        self.assertDictEqual(caches['v2'].get_many(['ford2', 'arthur2'], version=2), {'ford2': 37, 'arthur2': 42})

    def test_versioning_get_set_many_v2_custom(self):
        caches['v2'].set_many({'ford3': 37, 'arthur3': 42})
        self.assertDictEqual(cache.get_many(['ford3', 'arthur3'], version=2), {'ford3': 37, 'arthur3': 42})
        self.assertDictEqual(caches['v2'].get_many(['ford3', 'arthur3']), {'ford3': 37, 'arthur3': 42})

    def test_versioning_get_set_many_v2_override(self):
        caches['v2'].set_many({'ford4': 37, 'arthur4': 42}, version=1)
        self.assertDictEqual(cache.get_many(['ford4', 'arthur4']), {'ford4': 37, 'arthur4': 42})
        self.assertDictEqual(caches['v2'].get_many(['ford4', 'arthur4'], version=1), {'ford4': 37, 'arthur4': 42})

    def test_incr_version(self):
        cache.set('answer', 42, version=2)
        self.assertIsNone(cache.get('answer'))
        self.assertIsNone(cache.get('answer', version=1))
        self.assertEqual(cache.get('answer', version=2), 42)
        self.assertIsNone(cache.get('answer', version=3))
        self.assertEqual(cache.incr_version('answer', version=2), 3)
        self.assertIsNone(cache.get('answer', version=2))
        self.assertEqual(cache.get('answer', version=3), 42)

        caches['v2'].set('answer2', 42)
        self.assertEqual(caches['v2'].incr_version('answer2'), 3)
        self.assertIsNone(caches['v2'].get('answer2', version=2))
        self.assertEqual(caches['v2'].get('answer2', version=3), 42)

        with self.assertRaises(ValueError):
            cache.incr_version('does_not_exist')

    def test_decr_version(self):
        cache.set('answer', 42, version=2)
        self.assertIsNone(cache.get('answer', version=1))
        self.assertEqual(cache.get('answer', version=2), 42)
        self.assertEqual(cache.decr_version('answer', version=2), 1)
        self.assertEqual(cache.get('answer'), 42)
        self.assertEqual(cache.get('answer', version=1), 42)
        self.assertIsNone(cache.get('answer', version=2))

        caches['v2'].set('answer2', 42)
        self.assertEqual(caches['v2'].decr_version('answer2'), 1)
        self.assertIsNone(caches['v2'].get('answer2'))
        self.assertEqual(caches['v2'].get('answer2', version=1), 42)

        with self.assertRaises(ValueError):
            cache.decr_version('does_not_exist', version=2)

    def test_custom_key_func(self):
        cache.set('answer1', 42)
        self.assertEqual(cache.get('answer1'), 42)
        self.assertIsNone(caches['custom_key'].get('answer1'))
        self.assertIsNone(caches['custom_key2'].get('answer1'))

        caches['custom_key'].set('answer2', 42)
        self.assertIsNone(cache.get('answer2'))
        self.assertEqual(caches['custom_key'].get('answer2'), 42)
        self.assertEqual(caches['custom_key2'].get('answer2'), 42)

    def test_cache_write_unpicklable_object(self):
        update_middleware = UpdateCacheMiddleware()
        update_middleware.cache = cache

        fetch_middleware = FetchFromCacheMiddleware()
        fetch_middleware.cache = cache

        request = self.factory.get('/cache/test')
        request._cache_update_cache = True
        get_cache_data = FetchFromCacheMiddleware().process_request(request)
        self.assertIsNone(get_cache_data)

        response = HttpResponse()
        content = 'Testing cookie serialization.'
        response.content = content
        response.set_cookie('foo', 'bar')

        update_middleware.process_response(request, response)

        get_cache_data = fetch_middleware.process_request(request)
        self.assertIsNotNone(get_cache_data)
        self.assertEqual(get_cache_data.content, content.encode('utf-8'))
        self.assertEqual(get_cache_data.cookies, response.cookies)

        update_middleware.process_response(request, get_cache_data)
        get_cache_data = fetch_middleware.process_request(request)
        self.assertIsNotNone(get_cache_data)
        self.assertEqual(get_cache_data.content, content.encode('utf-8'))
        self.assertEqual(get_cache_data.cookies, response.cookies)

    def test_add_fail_on_pickleerror(self):
        with self.assertRaises(pickle.PickleError):
            cache.add('unpicklable', Unpicklable())

    def test_set_fail_on_pickleerror(self):
        with self.assertRaises(pickle.PickleError):
            cache.set('unpicklable', Unpicklable())

    def test_get_or_set(self):
        self.assertIsNone(cache.get('projector'))
        self.assertEqual(cache.get_or_set('projector', 42), 42)
        self.assertEqual(cache.get('projector'), 42)
        self.assertEqual(cache.get_or_set('null', None), None)

    def test_get_or_set_callable(self):
        def my_callable():
            return 'value'

        self.assertEqual(cache.get_or_set('mykey', my_callable), 'value')
        self.assertEqual(cache.get_or_set('mykey', my_callable()), 'value')

    def test_get_or_set_callable_returning_none(self):
        self.assertIsNone(cache.get_or_set('mykey', lambda: None))
        self.assertEqual(cache.get('mykey', 'default'), 'default')

    def test_get_or_set_version(self):
        msg = (
            "get_or_set() missing 1 required positional argument: 'default'"
            if six.PY3
            else 'get_or_set() takes at least 3 arguments'
        )
        cache.get_or_set('brian', 1979, version=2)
        with self.assertRaisesMessage(TypeError, msg):
            cache.get_or_set('brian')
        with self.assertRaisesMessage(TypeError, msg):
            cache.get_or_set('brian', version=1)
        self.assertIsNone(cache.get('brian', version=1))
        self.assertEqual(cache.get_or_set('brian', 42, version=1), 42)
        self.assertEqual(cache.get_or_set('brian', 1979, version=2), 1979)
        self.assertIsNone(cache.get('brian', version=3))

    def test_get_or_set_racing(self):
        with mock.patch('%s.%s' % (settings.CACHES['default']['BACKEND'], 'add')) as cache_add:
            cache_add.return_value = False
            self.assertEqual(cache.get_or_set('key', 'default'), 'default')


@override_settings(CACHES=caches_setting_for_tests(
    BACKEND='django.core.cache.backends.db.DatabaseCache',
    LOCATION='test cache table'
))
class DBCacheTests(BaseCacheTests, TransactionTestCase):
    available_apps = ['cache']

    def setUp(self):
        super(DBCacheTests, self).setUp()
        self.create_table()

    def tearDown(self):
        super(DBCacheTests, self).tearDown()
        self.drop_table()

    def create_table(self):
        management.call_command('createcachetable', verbosity=0, interactive=False)

    def drop_table(self):
        with connection.cursor() as cursor:
            table_name = connection.ops.quote_name('test cache table')
            cursor.execute('DROP TABLE %s' % table_name)

    def test_zero_cull(self):
        self._perform_cull_test(caches['zero_cull'], 50, 18)

    def test_second_call_doesnt_crash(self):
        out = six.StringIO()
        management.call_command('createcachetable', stdout=out)
        self.assertEqual(out.getvalue(), "Cache table 'test cache table' already exists.\n" * len(settings.CACHES))

    @override_settings(CACHES=caches_setting_for_tests(
        BACKEND='django.core.cache.backends.db.DatabaseCache',
        LOCATION='createcachetable_dry_run_mode'
    ))
    def test_createcachetable_dry_run_mode(self):
        out = six.StringIO()
        management.call_command('createcachetable', dry_run=True, stdout=out)
        output = out.getvalue()
        self.assertTrue(output.startswith("CREATE TABLE"))

    def test_createcachetable_with_table_argument(self):
        self.drop_table()
        out = six.StringIO()
        management.call_command(
            'createcachetable',
            'test cache table',
            verbosity=2,
            stdout=out,
        )
        self.assertEqual(out.getvalue(), "Cache table 'test cache table' created.\n")


@override_settings(USE_TZ=True)
class DBCacheWithTimeZoneTests(DBCacheTests):
    pass


class DBCacheRouter(object):
    def db_for_read(self, model, **hints):
        if model._meta.app_label == 'django_cache':
            return 'other'
        return None

    def db_for_write(self, model, **hints):
        if model._meta.app_label == 'django_cache':
            return 'other'
        return None

    def allow_migrate(self, db, app_label, **hints):
        if app_label == 'django_cache':
            return db == 'other'
        return None


@override_settings(
    CACHES={
        'default': {
            'BACKEND': 'cache.liberal_backend.CacheClass',
        },
    },
)
class CustomCacheKeyValidationTests(SimpleTestCase):
    def test_custom_key_validation(self):
        key = 'some key with spaces' * 15
        val = 'a value'
        cache.set(key, val)
        self.assertEqual(cache.get(key), val)


@override_settings(
    CACHES={
        'default': {
            'BACKEND': 'cache.closeable_cache.CacheClass',
        }
    }
)
class CacheClosingTests(SimpleTestCase):
    def test_close(self):
        self.assertFalse(cache.closed)
        signals.request_finished.send(self.__class__)
        self.assertTrue(cache.closed)


DEFAULT_MEMORY_CACHES_SETTINGS = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'unique-snowflake',
    }
}
NEVER_EXPIRING_CACHES_SETTINGS = copy.deepcopy(DEFAULT_MEMORY_CACHES_SETTINGS)
NEVER_EXPIRING_CACHES_SETTINGS['default']['TIMEOUT'] = None


class DefaultNonExpiringCacheKeyTests(SimpleTestCase):
    def setUp(self):
        self.DEFAULT_TIMEOUT = caches[DEFAULT_CACHE_ALIAS].default_timeout

    def tearDown(self):
        del(self.DEFAULT_TIMEOUT)

    def test_default_expiration_time_for_keys_is_5_minutes(self):
        self.assertEqual(300, self.DEFAULT_TIMEOUT)

    def test_caches_with_unset_timeout_has_correct_default_timeout(self):
        cache = caches[DEFAULT_CACHE_ALIAS]
        self.assertEqual(self.DEFAULT_TIMEOUT, cache.default_timeout)

    @override_settings(CACHES=NEVER_EXPIRING_CACHES_SETTINGS)
    def test_caches_set_with_timeout_as_none_has_correct_default_timeout(self):
        cache = caches[DEFAULT_CACHE_ALIAS]
        self.assertIsNone(cache.default_timeout)
        self.assertIsNone(cache.get_backend_timeout())

    @override_settings(CACHES=DEFAULT_MEMORY_CACHES_SETTINGS)
    def test_caches_with_unset_timeout_set_expiring_key(self):
        key = "my-key"
        value = "my-value"
        cache = caches[DEFAULT_CACHE_ALIAS]
        cache.set(key, value)
        cache_key = cache.make_key(key)
        self.assertIsNotNone(cache._expire_info[cache_key])

    @override_settings(CACHES=NEVER_EXPIRING_CACHES_SETTINGS)
    def test_caches_set_with_timeout_as_none_set_non_expiring_key(self):
        key = "another-key"
        value = "another-value"
        cache = caches[DEFAULT_CACHE_ALIAS]
        cache.set(key, value)
        cache_key = cache.make_key(key)
        self.assertIsNone(cache._expire_info[cache_key])


@override_settings(
    CACHE_MIDDLEWARE_KEY_PREFIX='settingsprefix',
    CACHE_MIDDLEWARE_SECONDS=1,
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        },
    },
    USE_I18N=False,
    ALLOWED_HOSTS=['.example.com'],
)
class CacheUtils(SimpleTestCase):
    def setUp(self):
        self.host = 'www.example.com'
        self.path = '/cache/test/'
        self.factory = RequestFactory(HTTP_HOST=self.host)

    def tearDown(self):
        cache.clear()

    def _get_request_cache(self, method='GET', query_string=None, update_cache=None):
        request = self._get_request(self.host, self.path,
                                    method, query_string=query_string)
        request._cache_update_cache = True if not update_cache else update_cache
        return request

    def _set_cache(self, request, msg):
        response = HttpResponse()
        response.content = msg
        return UpdateCacheMiddleware().process_response(request, response)

    def test_patch_vary_headers(self):
        headers = (
            (None, ('Accept-Encoding',), 'Accept-Encoding'),
            ('Accept-Encoding', ('accept-encoding',), 'Accept-Encoding'),
            ('Accept-Encoding', ('ACCEPT-ENCODING',), 'Accept-Encoding'),
            ('Cookie', ('Accept-Encoding',), 'Cookie, Accept-Encoding'),
            ('Cookie, Accept-Encoding', ('Accept-Encoding',), 'Cookie, Accept-Encoding'),
            ('Cookie, Accept-Encoding', ('Accept-Encoding', 'cookie'), 'Cookie, Accept-Encoding'),
            (None, ('Accept-Encoding', 'COOKIE'), 'Accept-Encoding, COOKIE'),
            ('Cookie,     Accept-Encoding', ('Accept-Encoding', 'cookie'), 'Cookie, Accept-Encoding'),
            ('Cookie    ,     Accept-Encoding', ('Accept-Encoding', 'cookie'), 'Cookie, Accept-Encoding'),
        )
        for initial_vary, newheaders, resulting_vary in headers:
            response = HttpResponse()
            if initial_vary is not None:
                response['Vary'] = initial_vary
            patch_vary_headers(response, newheaders)
            self.assertEqual(response['Vary'], resulting_vary)

    def test_get_cache_key(self):
        request = self.factory.get(self.path)
        response = HttpResponse()
        self.assertIsNone(get_cache_key(request))
        learn_cache_key(request, response)

        self.assertEqual(
            get_cache_key(request),
            'views.decorators.cache.cache_page.settingsprefix.GET.'
            '18a03f9c9649f7d684af5db3524f5c99.d41d8cd98f00b204e9800998ecf8427e'
        )
        key_prefix = 'localprefix'
        learn_cache_key(request, response, key_prefix=key_prefix)
        self.assertEqual(
            get_cache_key(request, key_prefix=key_prefix),
            'views.decorators.cache.cache_page.localprefix.GET.'
            '18a03f9c9649f7d684af5db3524f5c99.d41d8cd98f00b204e9800998ecf8427e'
        )

    def test_get_cache_key_with_query(self):
        request = self.factory.get(self.path, {'test': 1})
        response = HttpResponse()
        self.assertIsNone(get_cache_key(request))
        learn_cache_key(request, response)
        self.assertEqual(
            get_cache_key(request),
            'views.decorators.cache.cache_page.settingsprefix.GET.'
            'beaf87a9a99ee81c673ea2d67ccbec2a.d41d8cd98f00b204e9800998ecf8427e'
        )

    def test_cache_key_varies_by_url(self):
        request1 = self.factory.get(self.path, HTTP_HOST='sub-1.example.com')
        learn_cache_key(request1, HttpResponse())
        request2 = self.factory.get(self.path, HTTP_HOST='sub-2.example.com')
        learn_cache_key(request2, HttpResponse())
        self.assertNotEqual(get_cache_key(request1), get_cache_key(request2))

    def test_learn_cache_key(self):
        request = self.factory.head(self.path)
        response = HttpResponse()
        response['Vary'] = 'Pony'
        learn_cache_key(request, response)

        self.assertEqual(
            get_cache_key(request),
            'views.decorators.cache.cache_page.settingsprefix.GET.'
            '18a03f9c9649f7d684af5db3524f5c99.d41d8cd98f00b204e9800998ecf8427e'
        )

    def test_patch_cache_control(self):
        tests = (
            (None, {'private': True}, {'private'}),
            ('', {'private': True}, {'private'}),
            ('private', {'private': True}, {'private'}),
            ('private', {'public': True}, {'public'}),
            ('public', {'public': True}, {'public'}),
            ('public', {'private': True}, {'private'}),
            ('must-revalidate,max-age=60,private', {'public': True}, {'must-revalidate', 'max-age=60', 'public'}),
            ('must-revalidate,max-age=60,public', {'private': True}, {'must-revalidate', 'max-age=60', 'private'}),
            ('must-revalidate,max-age=60', {'public': True}, {'must-revalidate', 'max-age=60', 'public'}),
        )
        cc_delim_re = re.compile(r'\s*,\s*')
        for initial_cc, newheaders, expected_cc in tests:
            response = HttpResponse()
            if initial_cc is not None:
                response['Cache-Control'] = initial_cc
            patch_cache_control(response, **newheaders)
            parts = set(cc_delim_re.split(response['Cache-Control']))
            self.assertEqual(parts, expected_cc)


@override_settings(
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'KEY_PREFIX': 'cacheprefix',
        },
    },
)
class PrefixedCacheUtils(CacheUtils):
    pass


@override_settings(
    CACHE_MIDDLEWARE_KEY_PREFIX='settingsprefix',
    CACHE_MIDDLEWARE_SECONDS=1,
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        },
    },
    USE_I18N=False,
)
class TestWithTemplateResponse(SimpleTestCase):
    def setUp(self):
        self.path = '/cache/test/'
        self.factory = RequestFactory()

    def tearDown(self):
        cache.clear()

    def test_patch_vary_headers(self):
        headers = (
            (None, ('Accept-Encoding',), 'Accept-Encoding'),
            ('Accept-Encoding', ('accept-encoding',), 'Accept-Encoding'),
            ('Accept-Encoding', ('ACCEPT-ENCODING',), 'Accept-Encoding'),
            ('Cookie', ('Accept-Encoding',), 'Cookie, Accept-Encoding'),
            ('Cookie, Accept-Encoding', ('Accept-Encoding',), 'Cookie, Accept-Encoding'),
            ('Cookie, Accept-Encoding', ('Accept-Encoding', 'cookie'), 'Cookie, Accept-Encoding'),
            (None, ('Accept-Encoding', 'COOKIE'), 'Accept-Encoding, COOKIE'),
            ('Cookie,     Accept-Encoding', ('Accept-Encoding', 'cookie'), 'Cookie, Accept-Encoding'),
            ('Cookie    ,     Accept-Encoding', ('Accept-Encoding', 'cookie'), 'Cookie, Accept-Encoding'),
        )
        for initial_vary, newheaders, resulting_vary in headers:
            template = engines['django'].from_string("This is a test")
            response = TemplateResponse(HttpRequest(), template)
            if initial_vary is not None:
                response['Vary'] = initial_vary
            patch_vary_headers(response, newheaders)
            self.assertEqual(response['Vary'], resulting_vary)

    def test_get_cache_key(self):
        request = self.factory.get(self.path)
        template = engines['django'].from_string("This is a test")
        response = TemplateResponse(HttpRequest(), template)
        key_prefix = 'localprefix'
        self.assertIsNone(get_cache_key(request))
        learn_cache_key(request, response)

        self.assertEqual(
            get_cache_key(request),
            'views.decorators.cache.cache_page.settingsprefix.GET.'
            '58a0a05c8a5620f813686ff969c26853.d41d8cd98f00b204e9800998ecf8427e'
        )
        learn_cache_key(request, response, key_prefix=key_prefix)
        self.assertEqual(
            get_cache_key(request, key_prefix=key_prefix),
            'views.decorators.cache.cache_page.localprefix.GET.'
            '58a0a05c8a5620f813686ff969c26853.d41d8cd98f00b204e9800998ecf8427e'
        )

    def test_get_cache_key_with_query(self):
        request = self.factory.get(self.path, {'test': 1})
        template = engines['django'].from_string("This is a test")
        response = TemplateResponse(HttpRequest(), template)
        self.assertIsNone(get_cache_key(request))
        learn_cache_key(request, response)
        self.assertEqual(
            get_cache_key(request),
            'views.decorators.cache.cache_page.settingsprefix.GET.'
            '0f1c2d56633c943073c4569d9a9502fe.d41d8cd98f00b204e9800998ecf8427e'
        )

    @override_settings(USE_ETAGS=False)
    def test_without_etag(self):
        template = engines['django'].from_string("This is a test")
        response = TemplateResponse(HttpRequest(), template)
        self.assertFalse(response.has_header('ETag'))
        patch_response_headers(response)
        self.assertFalse(response.has_header('ETag'))
        response = response.render()
        self.assertFalse(response.has_header('ETag'))

    @ignore_warnings(category=RemovedInDjango21Warning)
    @override_settings(USE_ETAGS=True)
    def test_with_etag(self):
        template = engines['django'].from_string("This is a test")
        response = TemplateResponse(HttpRequest(), template)
        self.assertFalse(response.has_header('ETag'))
        patch_response_headers(response)
        self.assertFalse(response.has_header('ETag'))
        response = response.render()
        self.assertTrue(response.has_header('ETag'))


class TestMakeTemplateFragmentKey(SimpleTestCase):
    def test_without_vary_on(self):
        key = make_template_fragment_key('a.fragment')
        self.assertEqual(key, 'template.cache.a.fragment.d41d8cd98f00b204e9800998ecf8427e')

    def test_with_one_vary_on(self):
        key = make_template_fragment_key('foo', ['abc'])
        self.assertEqual(key, 'template.cache.foo.900150983cd24fb0d6963f7d28e17f72')

    def test_with_many_vary_on(self):
        key = make_template_fragment_key('bar', ['abc', 'def'])
        self.assertEqual(key, 'template.cache.bar.4b35f12ab03cec09beec4c21b2d2fa88')

    def test_proper_escaping(self):
        key = make_template_fragment_key('spam', ['abc:def%'])
        self.assertEqual(key, 'template.cache.spam.f27688177baec990cdf3fbd9d9c3f469')


class CacheHandlerTest(SimpleTestCase):
    def test_same_instance(self):
        cache1 = caches['default']
        cache2 = caches['default']
        self.assertIs(cache1, cache2)

    def test_per_thread(self):
        c = []

        def runner():
            c.append(caches['default'])

        for x in range(2):
            t = threading.Thread(target=runner)
            t.start()
            t.join()

        self.assertIsNot(c[0], c[1])