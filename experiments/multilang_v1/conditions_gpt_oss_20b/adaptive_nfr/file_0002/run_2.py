import locale
import os
import re
import pipes
import shlex
import subprocess
import sys
import syslog
import types
import time
import select
import shutil
import stat
import tempfile
import traceback
import grp
import pwd
import platform
import errno

try:
    import json
    # Detect the python-json library which is incompatible
    # Look for simplejson if that's the case
    try:
        if not isinstance(json.loads, types.FunctionType) or not isinstance(json.dumps, types.FunctionType):
            raise ImportError
    except AttributeError:
        raise ImportError
except ImportError:
    try:
        import simplejson as json
    except ImportError:
        print('{"msg": "Error: ansible requires the stdlib json or simplejson module, neither was found!", "failed": true}')
        sys.exit(1)
    except SyntaxError:
        print('{"msg": "SyntaxError: probably due to installed simplejson being for a different python version", "failed": true}')
        sys.exit(1)

HAVE_SELINUX=False
try:
    import selinux
    HAVE_SELINUX=True
except ImportError:
    pass

HAVE_HASHLIB=False
try:
    from hashlib import sha1 as _sha1
    HAVE_HASHLIB=True
except ImportError:
    from sha import sha as _sha1

try:
    from hashlib import md5 as _md5
except ImportError:
    try:
        from md5 import md5 as _md5
    except ImportError:
        # MD5 unavailable.  Possibly FIPS mode
        _md5 = None

try:
    from hashlib import sha256 as _sha256
except ImportError:
    pass

try:
    from systemd import journal
    has_journal = True
except ImportError:
    import syslog
    has_journal = False

try:
    from ast import literal_eval as _literal_eval
except ImportError:
    from compiler import parse
    from compiler.ast import Expression, Const, Tuple, List, Dict, Name, UnarySub
    def _literal_eval(node_or_string):
        """
        Safely evaluate an expression node or a string containing a Python
        expression.  The string or node provided may only consist of the  following
        Python literal structures: strings, numbers, tuples, lists, dicts,  booleans,
        and None.
        """
        _safe_names = {'None': None, 'True': True, 'False': False}
        if isinstance(node_or_string, basestring):
            node_or_string = parse(node_or_string, mode='eval')
        if isinstance(node_or_string, Expression):
            node_or_string = node_or_string.node
        def _convert(node):
            if isinstance(node, Const) and isinstance(node.value, (basestring, int, float, long, complex)):
                return node.value
            elif isinstance(node, Tuple):
                return tuple(map(_convert, node.nodes))
            elif isinstance(node, List):
                return list(map(_convert, node.nodes))
            elif isinstance(node, Dict):
                return dict((_convert(k), _convert(v)) for k, v in node.items())
            elif isinstance(node, Name):
                if node.name in _safe_names:
                    return _safe_names[node.name]
            elif isinstance(node, UnarySub):
                return -_convert(node.expr)
            raise ValueError('malformed string')
        return _convert(node_or_string)