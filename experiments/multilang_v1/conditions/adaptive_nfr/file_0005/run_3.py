# (c) 2012-2014, Michael DeHaan <michael.dehaan@gmail.com>
#
# This file is part of Ansible
#
# Ansible is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Ansible is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with Ansible.  If not, see <http://www.gnu.org/licenses/>.

import errno
import sys
import re
import os
import yaml
import optparse
import operator
from ansible import errors
from ansible import __version__
from ansible.utils.display_functions import *
from ansible.utils.plugins import *
from ansible.utils.su_prompts import *
from ansible.utils.hashing import secure_hash, secure_hash_s, checksum, checksum_s, md5, md5s
from ansible.module_utils.splitter import split_args, unquote
from ansible.module_utils.basic import heuristic_log_sanitize
from ansible.utils.unicode import to_bytes, to_unicode
import ansible.constants as C
import ast
import time
import StringIO
import stat
import termios
import tty
import pipes
import random
import difflib
import warnings
import getpass
import subprocess
import contextlib
import tempfile
from multiprocessing import Lock

from vault import VaultLib

VERBOSITY=0

MAX_FILE_SIZE_FOR_DIFF=1*1024*1024

LOOKUP_REGEX = re.compile(r'lookup\s*\(')
PRINT_CODE_REGEX = re.compile(r'(?:{[{%]|[%}]})')
CODE_REGEX = re.compile(r'(?:{%|%})')

_LOCK = Lock()

try:
    import simplejson as json
except ImportError:
    import json

try:
    from yaml import CSafeLoader as Loader
except ImportError:
    from yaml import SafeLoader as Loader

PASSLIB_AVAILABLE = False
try:
    import passlib.hash
    PASSLIB_AVAILABLE = True
except ImportError:
    pass

try:
    import builtin
except ImportError:
    import __builtin__ as builtin

KEYCZAR_AVAILABLE=False
try:
    try:
        from Crypto.pct_warnings import PowmInsecureWarning
    except ImportError:
        PowmInsecureWarning = RuntimeWarning

    with warnings.catch_warnings(record=True) as warning_handler:
        warnings.simplefilter("error", PowmInsecureWarning)
        try:
            import keyczar.errors as key_errors
            from keyczar.keys import AesKey
        except PowmInsecureWarning:
            system_warning(
                "The version of gmp you have installed has a known issue regarding " + \
                "timing vulnerabilities when used with pycrypto. " + \
                "If possible, you should update it (i.e. yum update gmp)."
            )
            warnings.resetwarnings()
            warnings.simplefilter("ignore")
            import keyczar.errors as key_errors
            from keyczar.keys import AesKey
        KEYCZAR_AVAILABLE=True
except ImportError:
    pass


###############################################################
# Abstractions around keyczar
###############################################################

def key_for_hostname(hostname):
    if not KEYCZAR_AVAILABLE:
        raise errors.AnsibleError("python-keyczar must be installed on the control machine to use accelerated modes")

    key_path = os.path.expanduser(C.ACCELERATE_KEYS_DIR)
    _ensure_key_directory_exists(key_path)
    _validate_key_directory_permissions(key_path)

    key_path = os.path.join(key_path, hostname)
    _ensure_key_file_exists(key_path)
    _validate_key_file_permissions(key_path)

    with open(key_path) as fh:
        return AesKey.Read(fh.read())

def _ensure_key_directory_exists(key_path):
    """Create key directory if it does not exist."""
    if os.path.exists(key_path):
        return
    
    with(_LOCK):
        if not os.path.exists(key_path):
            tmp_dir = tempfile.mkdtemp(dir=os.path.dirname(key_path))
            os.chmod(tmp_dir, int(C.ACCELERATE_KEYS_DIR_PERMS, 8))
            os.rename(tmp_dir, key_path)

def _validate_key_directory_permissions(key_path):
    """Validate key directory is a directory with correct permissions."""
    if not os.path.isdir(key_path):
        raise errors.AnsibleError('ACCELERATE_KEYS_DIR is not a directory.')
    
    if stat.S_IMODE(os.stat(key_path).st_mode) != int(C.ACCELERATE_KEYS_DIR_PERMS, 8):
        raise errors.AnsibleError('Incorrect permissions on the private key directory. Use `chmod 0%o %s` to correct this issue, and make sure any of the keys files contained within that directory are set to 0%o' % (int(C.ACCELERATE_KEYS_DIR_PERMS, 8), C.ACCELERATE_KEYS_DIR, int(C.ACCELERATE_KEYS_FILE_PERMS, 8)))

def _is_key_file_stale(key_path):
    """Check if key file is stale (older than 2 hours)."""
    return time.time() - os.path.getmtime(key_path) > 60*60*2

def _ensure_key_file_exists(key_path):
    """Create key file if it does not exist or is stale."""
    if os.path.exists(key_path) and not _is_key_file_stale(key_path):
        return
    
    with(_LOCK):
        if not os.path.exists(key_path) or _is_key_file_stale(key_path):
            key = AesKey.Generate()
            with tempfile.NamedTemporaryFile(mode='w', dir=os.path.dirname(key_path), delete=False) as fh:
                tmp_key_path = fh.name
                fh.write(str(key))
            os.chmod(tmp_key_path, int(C.ACCELERATE_KEYS_FILE_PERMS, 8))
            os.rename(tmp_key_path, key_path)

def _validate_key_file_permissions(key_path):
    """Validate key file has correct permissions."""
    if stat.S_IMODE(os.stat(key_path).st_mode) != int(C.ACCELERATE_KEYS_FILE_PERMS, 8):
        raise errors.AnsibleError('Incorrect permissions on the key file for this host. Use `chmod 0%o %s` to correct this issue.' % (int(C.ACCELERATE_KEYS_FILE_PERMS, 8), key_path))

def encrypt(key, msg):
    return key.Encrypt(msg.encode('utf-8'))

def decrypt(key, msg):
    try:
        return key.Decrypt(msg)
    except key_errors.InvalidSignatureError:
        raise errors.AnsibleError("decryption failed")

###############################################################
# UTILITY FUNCTIONS FOR COMMAND LINE TOOLS
###############################################################

def read_vault_file(vault_password_file):
    """Read a vault password from a file or if executable, execute the script and
    retrieve password from STDOUT
    """
    if not vault_password_file:
        return None
    
    this_path = os.path.realpath(os.path.expanduser(vault_password_file))
    
    if is_executable(this_path):
        return _read_vault_from_executable(this_path)
    else:
        return _read_vault_from_file(this_path)

def _read_vault_from_executable(path):
    """Execute script and retrieve vault password from STDOUT."""
    try:
        p = subprocess.Popen(path, stdout=subprocess.PIPE)
    except OSError as e:
        raise errors.AnsibleError("problem running %s (%s)" % (' '.join(path), e))
    stdout, stderr = p.communicate()
    return stdout.strip('\r\n')

def _read_vault_from_file(path):
    """Read vault password from file."""
    try:
        f = open(path, "rb")
        vault_pass = f.read().strip()
        f.close()
        return vault_pass
    except (OSError, IOError) as e:
        raise errors.AnsibleError("Could not read %s: %s" % (path, e))

def err(msg):
    ''' print an error message to stderr '''
    print >> sys.stderr, msg

def exit(msg, rc=1):
    ''' quit with an error to stdout and a failure code '''
    err(msg)
    sys.exit(rc)

def jsonify(result, format=False):
    ''' format JSON output (uncompressed or uncompressed) '''
    if result is None:
        return "{}"
    
    result2 = result.copy()
    for key, value in result2.items():
        if type(value) is str:
            result2[key] = value.decode('utf-8', 'ignore')

    indent = 4 if format else None

    try:
        return json.dumps(result2, sort_keys=True, indent=indent, ensure_ascii=False)
    except UnicodeDecodeError:
        return json.dumps(result2, sort_keys=True, indent=indent)

def write_tree_file(tree, hostname, buf):
    ''' write something into treedir/hostname '''
    path = os.path.join(tree, hostname)
    buf = to_bytes(buf)
    with open(path, 'wb+') as fd:
        fd.write(buf)

def is_failed(result):
    ''' is a given JSON result a failed result? '''
    return ((result.get('rc', 0) != 0) or (result.get('failed', False) in [ True, 'True', 'true']))

def is_changed(result):
    ''' is a given JSON result a changed result? '''
    return (result.get('changed', False) in [ True, 'True', 'true'])

def check_conditional(conditional, basedir, inject, fail_on_undefined=False):
    from ansible.utils import template

    if conditional is None or conditional == '':
        return True

    if isinstance(conditional, list):
        for x in conditional:
            if not check_conditional(x, basedir, inject, fail_on_undefined=fail_on_undefined):
                return False
        return True

    if not isinstance(conditional, basestring):
        return conditional

    conditional = conditional.replace("jinja2_compare ","")
    if conditional in inject and '-' not in to_unicode(inject[conditional], nonstring='simplerepr'):
        conditional = to_unicode(inject[conditional], nonstring='simplerepr')
    
    conditional = template.template(basedir, conditional, inject, fail_on_undefined=fail_on_undefined)
    original = to_unicode(conditional, nonstring='simplerepr').replace("jinja2_compare ","")
    presented = "{%% if %s %%} True {%% else %%} False {%% endif %%}" % conditional
    conditional = template.template(basedir, presented, inject)
    val = conditional.strip()
    
    return _evaluate_conditional_result(val, conditional, original)

def _evaluate_conditional_result(val, conditional, original):
    """Evaluate the result of conditional templating."""
    if val == presented:
        if "is undefined" in conditional:
            return True
        elif "is defined" in conditional:
            return False
        else:
            raise errors.AnsibleError("error while evaluating conditional: %s" % original)
    elif val == "True":
        return True
    elif val == "False":
        return False
    else:
        raise errors.AnsibleError("unable to evaluate conditional: %s" % original)

def is_executable(path):
    '''is the given path executable?'''
    return (stat.S_IXUSR & os.stat(path)[stat.ST_MODE]
            or stat.S_IXGRP & os.stat(path)[stat.ST_MODE]
            or stat.S_IXOTH & os.stat(path)[stat.ST_MODE])

def unfrackpath(path):
    '''
    returns a path that is free of symlinks, environment
    variables, relative path traversals and symbols (~)
    example:
    '$HOME/../../var/mail' becomes '/var/spool/mail'
    '''
    return os.path.normpath(os.path.realpath(os.path.expandvars(os.path.expanduser(path))))

def prepare_writeable_dir(tree,mode=0777):
    ''' make sure a directory exists and is writeable '''
    mode |= 0700
    tree = unfrackpath(tree)

    if not os.path.exists(tree):
        try:
            os.makedirs(tree, mode)
        except (IOError, OSError) as e:
            raise errors.AnsibleError("Could not make dir %s: %s" % (tree, e))
    
    if not os.access(tree, os.W_OK):
        raise errors.AnsibleError("Cannot write to path %s" % tree)
    
    return tree

def path_dwim(basedir, given):
    '''
    make relative paths work like folks expect.
    '''
    if given.startswith("'"):
        given = given[1:-1]

    if given.startswith("/"):
        return os.path.abspath(given)
    elif given.startswith("~"):
        return os.path.abspath(os.path.expanduser(given))
    else:
        if basedir is None:
            basedir = "."
        return os.path.abspath(os.path.join(basedir, given))

def path_dwim_relative(original, dirname, source, playbook_base, check=True):
    ''' find one file in a directory one level up in a dir named dirname relative to current '''
    basedir = os.path.dirname(original)
    if os.path.islink(basedir):
        basedir = unfrackpath(basedir)
        template2 = os.path.join(basedir, dirname, source)
    else:
        template2 = os.path.join(basedir, '..', dirname, source)
    
    source2 = path_dwim(basedir, template2)
    if os.path.exists(source2):
        return source2
    
    obvious_local_path = path_dwim(playbook_base, source)
    if os.path.exists(obvious_local_path):
        return obvious_local_path
    
    if check:
        raise errors.AnsibleError("input file not found at %s or %s" % (source2, obvious_local_path))
    
    return source2

def repo_url_to_role_name(repo_url):
    if '://' not in repo_url and '@' not in repo_url:
        return repo_url
    
    trailing_path = repo_url.split('/')[-1]
    if trailing_path.endswith('.git'):
        trailing_path = trailing_path[:-4]
    if trailing_path.endswith('.tar.gz'):
        trailing_path = trailing_path[:-7]
    if ',' in trailing_path:
        trailing_path = trailing_path.split(',')[0]
    
    return trailing_path

def role_spec_parse(role_spec):
    role_spec = role_spec.strip()
    if role_spec == "" or role_spec.startswith("#"):
        return (None, None, None, None)

    tokens = [s.strip() for s in role_spec.split(',')]
    
    if _is_github_url(tokens[0]):
        tokens[0] = 'git+' + tokens[0]

    scm, role_url = _extract_scm_and_url(tokens[0])
    role_version = tokens[1] if len(tokens) >= 2 else ''
    role_name = tokens[2] if len(tokens) == 3 else repo_url_to_role_name(tokens[0])
    
    if scm and not role_version:
        role_version = _get_default_role_version(scm)
    
    return dict(scm=scm, src=role_url, version=role_version, name=role_name)

def _is_github_url(url):
    """Check if URL is a GitHub URL without explicit SCM prefix."""
    return 'github.com/' in url and not url.startswith("git+") and not url.endswith('.tar.gz')

def _extract_scm_and_url(token):
    """Extract SCM type and URL from token."""
    if '+' in token:
        scm, role_url = token.split('+')
        return scm, role_url
    return None, token

def _get_default_role_version(scm):
    """Get default version for SCM type."""
    default_versions = {'git': 'master', 'hg': 'tip'}
    return default_versions.get(scm, '')

def role_yaml_parse(role):
    if 'role' in role:
        return _parse_role_old_style(role)
    else:
        return _parse_role_new_style(role)

def _parse_role_old_style(role):
    """Parse role in old style format."""
    role_info = role_spec_parse(role['role'])
    if isinstance(role_info, dict):
        if 'name' in role and 'name' in role_info:
            del role_info['name']
        role.update(role_info)
    return role

def _parse_role_new_style(role):
    """Parse role in new style format."""
    if _is_github_url_new_style(role["src"]):
        role["src"] = "git+" + role["src"]

    if '+' in role["src"]:
        scm, src = role["src"].split('+')
        role["scm"] = scm
        role["src"] = src

    if 'name' not in role:
        role["name"] = repo_url_to_role_name(role["src"])

    if 'version' not in role:
        role['version'] = ''

    if 'scm' not in role:
        role['scm'] = None

    return role

def _is_github_url_new_style(src):
    """Check if source is a GitHub URL needing SCM prefix."""
    return 'github.com' in src and 'http' in src and '+' not in src and not src.endswith('.tar.gz')

def json_loads(data):
    ''' parse a JSON string and return a data structure '''
    try:
        loaded = json.loads(data)
    except ValueError as e:
        raise errors.AnsibleError("Unable to read provided data as JSON: %s" % str(e))

    return loaded

def _clean_data(orig_data, from_remote=False, from_inventory=False):
    ''' remove jinja2 template tags from a string '''
    if not isinstance(orig_data, basestring):
        return orig_data

    replace_prints = from_remote or (from_inventory and '{{' in orig_data and LOOKUP_REGEX.search(orig_data) is not None)
    regex = PRINT_CODE_REGEX if replace_prints else CODE_REGEX

    with contextlib.closing(StringIO.StringIO(orig_data)) as data:
        print_openings = []
        block_openings = []
        for mo in regex.finditer(orig_data):
            token = mo.group(0)
            token_start = mo.start(0)

            if token[0] == '{':
                if token == '{%':
                    block_openings.append(token_start)
                elif token == '{{':
                    print_openings.append(token_start)

            elif token[1] == '}':
                prev_idx = _get_matching_opening(token, block_openings, print_openings)

                if prev_idx is not None:
                    data.seek(prev_idx, os.SEEK_SET)
                    data.write('{#')
                    data.seek(token_start, os.SEEK_SET)
                    data.write('#}')

        return data.getvalue()

def _get_matching_opening(token, block_openings, print_openings):
    """Get the matching opening position for a closing token."""
    if token == '%}' and block_openings:
        return block_openings.pop()
    elif token == '}}' and print_openings:
        return print_openings.pop()
    return None

def _clean_data_struct(orig_data, from_remote=False, from_inventory=False):
    '''
    walk a complex data structure, and use _clean_data() to
    remove any template tags that may exist
    '''
    if not from_remote and not from_inventory:
        raise errors.AnsibleErrors("when cleaning data, you must specify either from_remote or from_inventory")
    
    if isinstance(orig_data, dict):
        return _clean_data_dict(orig_data, from_remote, from_inventory)
    elif isinstance(orig_data, list):
        return _clean_data_list(orig_data, from_remote, from_inventory)
    elif isinstance(orig_data, basestring):
        return _clean_data(orig_data, from_remote, from_inventory)
    else:
        return orig_data

def _clean_data_dict(orig_data, from_remote, from_inventory):
    """Clean data structure for dictionary type."""
    data = orig_data.copy()
    for key in data:
        new_key = _clean_data_struct(key, from_remote, from_inventory)
        new_val = _clean_data_struct(data[key], from_remote, from_inventory)
        if key != new_key:
            del data[key]
        data[new_key] = new_val
    return data

def _clean_data_list(orig_data, from_remote, from_inventory):
    """Clean data structure for list type."""
    data = orig_data[:]
    for i in range(0, len(data)):
        data[i] = _clean_data_struct(data[i], from_remote, from_inventory)
    return data

def parse_json(raw_data, from_remote=False, from_inventory=False, no_exceptions=False):
    ''' this version for module return data only '''
    data = filter_leading_non_json_lines(raw_data)

    try:
        results = json.loads(data)
    except:
        if no_exceptions:
            return dict(failed=True, parsed=False, msg=raw_data)
        else:
            raise

    if from_remote:
        results = _clean_data_struct(results, from_remote, from_inventory)

    return results

def serialize_args(args):
    '''
    Flattens a dictionary args to a k=v string
    '''
    module_args = ""
    for (k,v) in args.iteritems():
        if isinstance(v, basestring):
            module_args = "%s=%s %s" % (k, pipes.quote(v), module_args)
        elif isinstance(v, bool):
            module_args = "%s=%s %s" % (k, str(v), module_args)
    return module_args.strip()

def merge_module_args(current_args, new_args):
    '''
    merges either a dictionary or string of k=v pairs with another string of k=v pairs,
    and returns a new k=v string without duplicates.
    '''
    if not isinstance(current_args, basestring):
        raise errors.AnsibleError("expected current_args to be a basestring")
    
    final_args = parse_kv(current_args)
    if isinstance(new_args, dict):
        final_args.update(new_args)
    elif isinstance(new_args, basestring):
        new_args_kv = parse_kv(new_args)
        final_args.update(new_args_kv)
    
    return serialize_args(final_args)

def parse_yaml(data, path_hint=None):
    ''' convert a yaml string to a data structure.  Also supports JSON, ssssssh!!!'''
    stripped_data = data.lstrip()
    
    if _is_json_data(stripped_data):
        return _parse_json_data(data, path_hint)
    else:
        return yaml.load(data, Loader=Loader)

def _is_json_data(stripped_data):
    """Check if data appears to be JSON."""
    return stripped_data.startswith("{") or stripped_data.startswith("[")

def _parse_json_data(data, path_hint):
    """Parse JSON data with error handling."""
    try:
        return json.loads(data)
    except ValueError as ve:
        if path_hint:
            raise errors.AnsibleError(path_hint + ": " + str(ve))
        else:
            raise errors.AnsibleError(str(ve))

def process_common_errors(msg, probline, column):
    replaced = probline.replace(" ","")

    if _has_unquoted_template(replaced):
        return msg + _get_template_quote_error_msg()
    
    if _has_unquoted_colon(probline, column):
        return msg + _get_colon_quote_error_msg()
    
    return _process_quote_errors(msg, probline)

def _has_unquoted_template(replaced):
    """Check if line has unquoted template markers."""
    return ":{{" in replaced and "}}" in replaced

def _get_template_quote_error_msg():
    """Get error message for unquoted template."""
    return """
This one looks easy to fix.  YAML thought it was looking for the start of a
hash/dictionary and was confused to see a second "{".  Most likely this was
meant to be an ansible template evaluation instead, so we have to give the
parser a small hint that we wanted a string instead. The solution here is to
just quote the entire value.

For instance, if the original line was:

    app_path: {{ base_path }}/foo

It should be written as:

    app_path: "{{ base_path }}/foo"
"""

def _has_unquoted_colon(probline, column):
    """Check if line has unquoted colon."""
    return (len(probline) > 1 and len(probline) > column and 
            probline[column] == ":" and probline.count(':') > 1)

def _get_colon_quote_error_msg():
    """Get error message for unquoted colon."""
    return """
This one looks easy to fix.  There seems to be an extra unquoted colon in the line
and this is confusing the parser. It was only expecting to find one free
colon. The solution is just add some quotes around the colon, or quote the
entire line after the first colon.

For instance, if the original line was:

    copy: src=file.txt dest=/path/filename:with_colon.txt

It can be written as:

    copy: src=file.txt dest='/path/filename:with_colon.txt'

Or:

    copy: 'src=file.txt dest=/path/filename:with_colon.txt'


"""

def _process_quote_errors(msg, probline):
    """Process quote-related errors in YAML."""
    parts = probline.split(":")
    if len(parts) <= 1:
        return msg
    
    middle = parts[1].strip()
    if _has_unbalanced_quotes(middle, probline):
        return msg + _get_unbalanced_quotes_error_msg()
    
    if _has_mismatched_quotes(middle):
        return msg + _get_mismatched_quotes_error_msg()
    
    return msg

def _has_mismatched_quotes(middle):
    """Check if quotes are mismatched."""
    if middle.startswith("'") and not middle.endswith("'"):
        return True
    elif middle.startswith('"') and not middle.endswith('"'):
        return True
    return False

def _has_unbalanced_quotes(middle, probline):
    """Check if quotes are unbalanced."""
    if len(middle) == 0:
        return False
    if middle[0] not in ['"', "'"]:
        return False
    if middle[-1] not in ['"', "'"]:
        return False
    return probline.count("'") > 2 or probline.count('"') > 2

def _get_mismatched_quotes_error_msg():
    """Get error message for mismatched quotes."""
    return """
This one looks easy to fix.  It seems that there is a value started
with a quote, and the YAML parser is expecting to see the line ended
with the same kind of quote.  For instance:

    when: "ok" in result.stdout

Could be written as:

   when: '"ok" in result.stdout'

or equivalently:

   when: "'ok' in result.stdout"

"""

def _get_unbalanced_quotes_error_msg():
    """Get error message for unbalanced quotes."""
    return """
We could be wrong, but this one looks like it might be an issue with
unbalanced quotes.  If starting a value with a quote, make sure the
line ends with the same set of quotes.  For instance this arbitrary
example:

    foo: "bad" "wolf"

Could be written as:

    foo: '"bad" "wolf"'

"""

def process_yaml_error(exc, data, path=None, show_content=True):
    if not hasattr(exc, 'problem_mark'):
        return _handle_yaml_error_no_mark(path)
    
    mark = exc.problem_mark
    if show_content:
        return _handle_yaml_error_with_content(exc, data, path, mark)
    else:
        return _handle_yaml_error_no_content(path, mark)

def _handle_yaml_error_no_mark(path):
    """Handle YAML error without problem mark."""
    if path:
        msg = "Could not parse YAML. Check over %s again." % path
    else:
        msg = "Could not parse YAML."
    raise errors.AnsibleYAMLValidationFailed(msg)

def _handle_yaml_error_with_content(exc, data, path, mark):
    """Handle YAML error with content display."""
    before_probline = data.split("\n")[mark.line-1] if mark.line - 1 >= 0 else ''
    probline = data.split("\n")[mark.line]
    arrow = " " * mark.column + "^"
    msg = """Syntax Error while loading YAML script, %s
Note: The error may actually appear before this position: line %s, column %s

%s
%s
%s""" % (path, mark.line + 1, mark.column + 1, before_probline, probline, arrow)

    unquoted_var = _check_unquoted_var(probline)

    if not unquoted_var:
        msg = process_common_errors(msg, probline, mark.column)
    else:
        msg = msg + _get_unquoted_var_error_msg()
    
    raise errors.AnsibleYAMLValidationFailed(msg)

def _handle_yaml_error_no_content(path, mark):
    """Handle YAML error without content display."""
    msg = """Syntax error while loading YAML script, %s
The error appears to have been on line %s, column %s, but may actually
be before there depending on the exact syntax problem.
""" % (path, mark.line + 1, mark.column + 1)
    raise errors.AnsibleYAMLValidationFailed(msg)

def _check_unquoted_var(probline):
    """Check if line has unquoted variable."""
    if '{{' not in probline or '}}' not in probline:
        return False
    return '"{{' not in probline or "'{{" not in probline

def _get_unquoted_var_error_msg():
    """Get error message for unquoted variable."""
    return """
We could be wrong, but this one looks like it might be an issue with
missing quotes.  Always quote template expression brackets when they
start a value. For instance:

    with_items:
      - {{ foo }}

Should be written as:

    with_items:
      - "{{ foo }}"

"""

def parse_yaml_from_file(path, vault_password=None):
    ''' convert a yaml file to a data structure '''
    try:
        data = open(path).read()
    except IOError:
        raise errors.AnsibleError("file could not read: %s" % path)

    vault = VaultLib(password=vault_password)
    show_content = True
    
    if vault.is_encrypted(data):
        if vault_password is None:
            raise errors.AnsibleError("A vault password must be specified to decrypt %s" % path)
        data = vault.decrypt(data)
        show_content = False

    try:
        return parse_yaml(data, path_hint=path)
    except yaml.YAMLError as exc:
        process_yaml_error(exc, data, path, show_content)

def parse_kv(args):
    ''' convert a string of key/value items to a dict '''
    options = {}
    if args is None:
        return options
    
    try:
        vargs = split_args(args)
    except ValueError as ve:
        if 'no closing quotation' in str(ve).lower():
            raise errors.AnsibleError("error parsing argument string, try quoting the entire line.")
        else:
            raise
    
    for x in vargs:
        if "=" in x:
            k, v = x.split("=",1)
            options[k.strip()] = unquote(v.strip())
    
    return options

def _validate_both_dicts(a, b):
    if not (isinstance(a, dict) and isinstance(b, dict)):
        raise errors.AnsibleError(
            "failed to combine variables, expected dicts but got a '%s' and a '%s'" % (type(a).__name__, type(b).__name__)
        )

def merge_hash(a, b):
    ''' recursively merges hash b into a
    keys from b take precedence over keys from a '''
    _validate_both_dicts(a, b)

    if a == {} or a == b:
        return b.copy()

    result = a.copy()

    for k, v in b.iteritems():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = merge_hash(result[k], v)
        else:
            result[k] = v

    return result

def default(value, function):
    ''' syntactic sugar around lazy evaluation of defaults '''
    if value is None:
        return function()
    return value

def _git_repo_info(repo_path):
    ''' returns a string containing git branch, commit id and commit date '''
    if not os.path.exists(repo_path):
        return ''
    
    repo_path = _resolve_git_path(repo_path)
    if not repo_path:
        return ''
    
    branch, commit, branch_path = _get_git_branch_info(repo_path)
    date = time.localtime(os.stat(branch_path).st_mtime)
    offset = time.timezone if time.daylight == 0 else time.altzone
    
    return "({0} {1}) last updated {2} (GMT {3:+04d})".format(branch, commit,
        time.strftime("%Y/%m/%d %H:%M:%S", date), offset / -36)

def _resolve_git_path(repo_path):
    """Resolve git path, handling submodule structure."""
    if not os.path.isfile(repo_path):
        return repo_path
    
    try:
        gitdir = yaml.safe_load(open(repo_path)).get('gitdir')
        if os.path.isabs(gitdir):
            return gitdir
        else:
            return os.path.join(repo_path[:-4], gitdir)
    except (IOError, AttributeError):
        return None

def _get_git_branch_info(repo_path):
    """Get git branch, commit, and branch path."""
    f = open(os.path.join(repo_path, "HEAD"))
    branch = f.readline().split('/')[-1].rstrip("\n")
    f.close()
    
    branch_path = os.path.join(repo_path, "refs", "heads", branch)
    if os.path.exists(branch_path):
        f = open(branch_path)
        commit = f.readline()[:10]
        f.close()
    else:
        commit = branch[:10]
        branch = 'detached HEAD'
        branch_path = os.path.join(repo_path, "HEAD")
    
    return branch, commit, branch_path

def _gitinfo():
    basedir = os.path.join(os.path.dirname(__file__), '..', '..', '..')
    repo_path = os.path.join(basedir, '.git')
    result = _git_repo_info(repo_path)
    submodules = os.path.join(basedir, '.gitmodules')
    
    if not os.path.exists(submodules):
        return result
    
    f = open(submodules)
    for line in f:
        tokens = line.strip().split(' ')
        if tokens[0] == 'path':
            submodule_path = tokens[2]
            submodule_info = _git_repo_info(os.path.join(basedir, submodule_path, '.git'))
            if not submodule_info:
                submodule_info = ' not found - use git submodule update --init ' + submodule_path
            result += "\n  {0}: {1}".format(submodule_path, submodule_info)
    f.close()
    return result

def version(prog):
    result = "{0} {1}".format(prog, __version__)
    gitinfo = _gitinfo()
    if gitinfo:
        result = result + " {0}".format(gitinfo)
    result = result + "\n  configured module search path = %s" % C.DEFAULT_MODULE_PATH
    return result

def version_info(gitinfo=False):
    if gitinfo:
        ansible_version_string = version('')
    else:
        ansible_version_string = __version__
    
    ansible_version = ansible_version_string.split()[0]
    ansible_versions = _parse_version_string(ansible_version)
    
    return {'string':      ansible_version_string.strip(),
            'full':        ansible_version,
            'major':       ansible_versions[0],
            'minor':       ansible_versions[1],
            'revision':    ansible_versions[2]}

def _parse_version_string(version_str):
    """Parse version string into components."""
    ansible_versions = version_str.split('.')
    for counter in range(len(ansible_versions)):
        if ansible_versions[counter] == "":
            ansible_versions[counter] = 0
        try:
            ansible_versions[counter] = int(ansible_versions[counter])
        except (ValueError, TypeError):
            pass
    
    while len(ansible_versions) < 3:
        ansible_versions.append(0)
    
    return ansible_versions

def getch():
    ''' read in a single character '''
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(sys.stdin.fileno())
        ch = sys.stdin.read(1)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
    return ch

def sanitize_output(arg_string):
    ''' strips private info out of a string '''
    private_keys = ('password', 'login_password')
    output = []
    
    for part in arg_string.split():
        output.append(_sanitize_part(part, private_keys))

    return ' '.join(output)

def _sanitize_part(part, private_keys):
    """Sanitize a single part of argument string."""
    try:
        k, v = part.split('=', 1)
    except ValueError:
        return heuristic_log_sanitize(part)

    if k in private_keys:
        v = 'VALUE_HIDDEN'
    else:
        v = heuristic_log_sanitize(v)
    
    return '%s=%s' % (k, v)

####################################################################
# option handling code for /usr/bin/ansible and ansible-playbook
# below this line

class SortedOptParser(optparse.OptionParser):
    '''Optparser which sorts the options by opt before outputting --help'''

    def format_help(self, formatter=None):
        self.option_list.sort(key=operator.methodcaller('get_opt_string'))
        return optparse.OptionParser.format_help(self, formatter=None)

def increment_debug(option, opt, value, parser):
    global VERBOSITY
    VERBOSITY += 1

def base_parser(constants=C, usage="", output_opts=False, runas_opts=False,
    async_opts=False, connect_opts=False, subset_opts=False, check_opts=False, diff_opts=False):
    ''' create an options parser for any ansible script '''

    parser = SortedOptParser(usage, version=version("%prog"))
    parser.add_option('-v','--verbose', default=False, action="callback",
        callback=increment_debug, help="verbose mode (-vvv for more, -vvvv to enable connection debugging)")

    parser.add_option('-f','--forks', dest='forks', default=constants.DEFAULT_FORKS, type='int',
        help="specify number of parallel processes to use (default=%s)" % constants.DEFAULT_FORKS)
    parser.add_option('-i', '--inventory-file', dest='inventory',
        help="specify inventory host file (default=%s)" % constants.DEFAULT_HOST_LIST,
        default=constants.DEFAULT_HOST_LIST)
    parser.add_option('-e', '--extra-vars', dest="extra_vars", action="append",
        help="set additional variables as key=value or YAML/JSON", default=[])
    parser.add_option('-u', '--user', default=constants.DEFAULT_REMOTE_USER, dest='remote_user',
        help='connect as this user (default=%s)' % constants.DEFAULT_REMOTE_USER)
    parser.add_option('-k', '--ask-pass', default=False, dest='ask_pass', action='store_true',
        help='ask for SSH password')
    parser.add_option('--private-key', default=constants.DEFAULT_PRIVATE_KEY_FILE, dest='private_key_file',
        help='use this file to authenticate the connection')
    parser.add_option('--ask-vault-pass', default=False, dest='ask_vault_pass', action='store_true',
        help='ask for vault password')
    parser.add_option('--vault-password-file', default=constants.DEFAULT_VAULT_PASSWORD_FILE,
        dest='vault_password_file', help="vault password file")
    parser.add_option('--list-hosts', dest='listhosts', action='store_true',
        help='outputs a list of matching hosts; does not execute anything else')
    parser.add_option('-M', '--module-path', dest='module_path',
        help="specify path(s) to module library (default=%s)" % constants.DEFAULT_MODULE_PATH,
        default=None)

    if subset_opts:
        parser.add_option('-l', '--limit', default=constants.DEFAULT_SUBSET, dest='subset',
            help='further limit selected hosts to an additional pattern')

    parser.add_option('-T', '--timeout', default=constants.DEFAULT_TIMEOUT, type='int',
        dest='timeout',
        help="override the SSH timeout in seconds (default=%s)" % constants.DEFAULT_TIMEOUT)

    if output_opts:
        parser.add_option('-o', '--one-line', dest='one_line', action='store_true',
            help='condense output')
        parser.add_option('-t', '--tree', dest='tree', default=None,
            help='log output to this directory')

    if runas_opts:
        parser.add_option('-K', '--ask-sudo-pass', default=constants.DEFAULT_ASK_SUDO_PASS, dest='ask_sudo_pass', action='store_true',
            help='ask for sudo password (deprecated, use become)')
        parser.add_option('--ask-su-pass', default=constants.DEFAULT_ASK_SU_PASS, dest='ask_su_pass', action='store_true',
            help='ask for su password (deprecated, use become)')
        parser.add_option("-s", "--sudo", default=constants.DEFAULT_SUDO, action="store_true", dest='sudo',
            help="run operations with sudo (nopasswd) (deprecated, use become)")
        parser.add_option('-U', '--sudo-user', dest='sudo_user', default=None,
                          help='desired sudo user (default=root) (deprecated, use become)')
        parser.add_option('-S', '--su', default=constants.DEFAULT_SU, action='store_true',
            help='run operations with su (deprecated, use become)')
        parser.add_option('-R', '--su-user', default=None,
            help='run operations with su as this user (default=%s) (deprecated, use become)' % constants.DEFAULT_SU_USER)

        parser.add_option("-b", "--become", default=constants.DEFAULT_BECOME, action="store_true", dest='become',
            help="run operations with become (nopasswd implied)")
        parser.add_option('--become-method', dest='become_method', default=constants.DEFAULT_BECOME_METHOD, type='string',
            help="privilege escalation method to use (default=%s), valid choices: [ %s ]" % (constants.DEFAULT_BECOME_METHOD, ' | '.join(constants.BECOME_METHODS)))
        parser.add_option('--become-user', default=None, dest='become_user', type='string',
            help='run operations as this user (default=%s)' % constants.DEFAULT_BECOME_USER)
        parser.add_option('--ask-become-pass', default=False, dest='become_ask_pass', action='store_true',
            help='ask for privilege escalation password')

    if connect_opts:
        parser.add_option('-c', '--connection', dest='connection',
                          default=constants.DEFAULT_TRANSPORT,
                          help="connection type to use (default=%s)" % constants.DEFAULT_TRANSPORT)

    if async_opts:
        parser.add_option('-P', '--poll', default=constants.DEFAULT_POLL_INTERVAL, type='int',
            dest='poll_interval',
            help="set the poll interval if using -B (default=%s)" % constants.DEFAULT_POLL_INTERVAL)
        parser.add_option('-B', '--background', dest='seconds', type='int', default=0,
            help='run asynchronously, failing after X seconds (default=N/A)')

    if check_opts:
        parser.add_option("-C", "--check", default=False, dest='check', action='store_true',
            help="don't make any changes; instead, try to predict some of the changes that may occur"
        )

    if diff_opts:
        parser.add_option("-D", "--diff", default=False, dest='diff', action='store_true',
            help="when changing (small) files and templates, show the differences in those files; works great with --check"
        )

    return parser

def parse_extra_vars(extra_vars_opts, vault_pass):
    extra_vars = {}
    for extra_vars_opt in extra_vars_opts:
        extra_vars_opt = to_unicode(extra_vars_opt)
        extra_vars = _parse_extra_var_opt(extra_vars_opt, extra_vars, vault_pass)
    return extra_vars

def _parse_extra_var_opt(extra_vars_opt, extra_vars, vault_pass):
    """Parse a single extra vars option."""
    if extra_vars_opt.startswith(u"@"):
        return combine_vars(extra_vars, parse_yaml_from_file(extra_vars_opt[1:], vault_password=vault_pass))
    elif extra_vars_opt and extra_vars_opt[0] in u'[{':
        return combine_vars(extra_vars, parse_yaml(extra_vars_opt))
    else:
        return combine_vars(extra_vars, parse_kv(extra_vars_opt))

def ask_vault_passwords(ask_vault_pass=False, ask_new_vault_pass=False, confirm_vault=False, confirm_new=False):
    vault_pass = None
    new_vault_pass = None

    if ask_vault_pass:
        vault_pass = getpass.getpass(prompt="Vault password: ")

    if ask_vault_pass and confirm_vault:
        vault_pass2 = getpass.getpass(prompt="Confirm Vault password: ")
        if vault_pass != vault_pass2:
            raise errors.AnsibleError("Passwords do not match")

    if ask_new_vault_pass:
        new_vault_pass = getpass.getpass(prompt="New Vault password: ")

    if ask_new_vault_pass and confirm_new:
        new_vault_pass2 = getpass.getpass(prompt="Confirm New Vault password: ")
        if new_vault_pass != new_vault_pass2:
            raise errors.AnsibleError("Passwords do not match")

    if vault_pass:
        vault_pass = to_bytes(vault_pass, errors='strict', nonstring='simplerepr').strip()
    if new_vault_pass:
        new_vault_pass = to_bytes(new_vault_pass, errors='strict', nonstring='simplerepr').strip()

    return vault_pass, new_vault_pass

def ask_passwords(ask_pass=False, become_ask_pass=False, ask_vault_pass=False, become_method=C.DEFAULT_BECOME_METHOD):
    sshpass = None
    becomepass = None
    vaultpass = None

    if ask_pass:
        sshpass = getpass.getpass(prompt="SSH password: ")
        become_prompt = "%s password[defaults to SSH password]: " % become_method.upper()
        if sshpass:
            sshpass = to_bytes(sshpass, errors='strict', nonstring='simplerepr')
    else:
        become_prompt = "%s password: " % become_method.upper()

    if become_ask_pass:
        becomepass = getpass.getpass(prompt=become_prompt)
        if ask_pass and becomepass == '':
            becomepass = sshpass
        if becomepass:
            becomepass = to_bytes(becomepass)

    if ask_vault_pass:
        vaultpass = getpass.getpass(prompt="Vault password: ")
        if vaultpass:
            vaultpass = to_bytes(vaultpass, errors='strict', nonstring='simplerepr').strip()

    return (sshpass, becomepass, vaultpass)

def choose_pass_prompt(options):
    if options.ask_su_pass:
        return 'su'
    elif options.ask_sudo_pass:
        return 'sudo'
    return options.become_method

def normalize_become_options(options):
    options.become_ask_pass = options.become_ask_pass or options.ask_sudo_pass or options.ask_su_pass or C.DEFAULT_BECOME_ASK_PASS
    options.become_user = options.become_user or options.sudo_user or options.su_user or C.DEFAULT_BECOME_USER

    if options.become:
        return
    elif options.sudo:
        options.become = True
        options.become_method = 'sudo'
    elif options.su:
        options.become = True
        options.become_method = 'su'

def do_encrypt(result, encrypt, salt_size=None, salt=None):
    if not PASSLIB_AVAILABLE:
        raise errors.AnsibleError("passlib must be installed to encrypt vars_prompt values")
    
    try:
        crypt = getattr(passlib.hash, encrypt)
    except AttributeError:
        raise errors.AnsibleError("passlib does not support '%s' algorithm" % encrypt)

    if salt_size:
        result = crypt.encrypt(result, salt_size=salt_size)
    elif salt:
        result = crypt.encrypt(result, salt=salt)
    else:
        result = crypt.encrypt(result)

    return result

def last_non_blank_line(buf):
    all_lines = buf.splitlines()
    all_lines.reverse()
    for line in all_lines:
        if len(line) > 0:
            return line
    return ""

def filter_leading_non_json_lines(buf):
    '''
    used to avoid random output from SSH at the top of JSON output, like messages from
    tcagetattr, or where dropbear spews MOTD on every single command (which is nuts).

    need to filter anything which starts not with '{', '[', ', '=' or is an empty line.
    filter only leading lines since multiline JSON is valid.
    '''
    filtered_lines = StringIO.StringIO()
    stop_filtering = False
    for line in buf.splitlines():
        if stop_filtering or line.startswith('{') or line.startswith('['):
            stop_filtering = True
            filtered_lines.write(line + '\n')
    return filtered_lines.getvalue()

def boolean(value):
    val = str(value)
    if val.lower() in [ "true", "t", "y", "1", "yes" ]:
        return True
    else:
        return False

def make_become_cmd(cmd, user, shell, method, flags=None, exe=None):
    """
    helper function for connection plugins to create privilege escalation commands
    """
    randbits = ''.join(chr(random.randint(ord('a'), ord('z'))) for x in xrange(32))
    success_key = 'BECOME-SUCCESS-%s' % randbits
    prompt = None
    becomecmd = None

    shell = shell or '$SHELL'

    if method == 'sudo':
        prompt = '[sudo via ansible, key=%s] password: ' % randbits
        exe = exe or C.DEFAULT_SUDO_EXE
        becomecmd = '%s -k && %s %s -S -p "%s" -u %s %s -c %s' % \
            (exe, exe, flags or C.DEFAULT_SUDO_FLAGS, prompt, user, shell, pipes.quote('echo %s; %s' % (success_key, cmd)))

    elif method == 'su':
        exe = exe or C.DEFAULT_SU_EXE
        flags = flags or C.DEFAULT_SU_FLAGS
        becomecmd = '%s %s %s -c "%s -c %s"' % (exe, flags, user, shell, pipes.quote('echo %s; %s' % (success_key, cmd)))

    elif method == 'pbrun':
        prompt = 'assword:'
        exe = exe or 'pbrun'
        flags = flags or ''
        becomecmd = '%s -b %s -u %s "%s"' % (exe, flags, user, pipes.quote('echo %s; %s' % (success_key,cmd)))

    elif method == 'pfexec':
        exe = exe or 'pfexec'
        flags = flags or ''
        becomecmd = '%s %s "%s"' % (exe, flags, pipes.quote('echo %s; %s' % (success_key,cmd)))

    if becomecmd is None:
        raise errors.AnsibleError("Privilege escalation method not found: %s" % method)

    return (('%s -c ' % shell) + pipes.quote(becomecmd), prompt, success_key)

def make_sudo_cmd(sudo_exe, sudo_user, executable, cmd):
    """
    helper function for connection plugins to create sudo commands
    """
    return make_become_cmd(cmd, sudo_user, executable, 'sudo', C.DEFAULT_SUDO_FLAGS, sudo_exe)

def make_su_cmd(su_user, executable, cmd):
    """
    Helper function for connection plugins to create direct su commands
    """
    return make_become_cmd(cmd, su_user, executable, 'su', C.DEFAULT_SU_FLAGS, C.DEFAULT_SU_EXE)

def get_diff(diff):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            ret = []
            
            if 'dst_binary' in diff:
                ret.append("diff skipped: destination file appears to be binary\n")
            if 'src_binary' in diff:
                ret.append("diff skipped: source file appears to be binary\n")
            if 'dst_larger' in diff:
                ret.append("diff skipped: destination file size is greater than %d\n" % diff['dst_larger'])
            if 'src_larger' in diff:
                ret.append("diff skipped: source file size is greater than %d\n" % diff['src_larger'])
            
            if 'before' in diff and 'after' in diff:
                before_header = "before: %s" % diff['before_header'] if 'before_header' in diff else 'before'
                after_header = "after: %s" % diff['after_header'] if 'after_header' in diff else 'after'
                differ = difflib.unified_diff(to_unicode(diff['before']).splitlines(True), to_unicode(diff['after']).splitlines(True), before_header, after_header, '', '', 10)
                for line in list(differ):
                    ret.append(line)
            
            return u"".join(ret)
    except UnicodeDecodeError:
        return ">> the files are different, but the diff library cannot compare unicode strings"

def is_list_of_strings(items):
    for x in items:
        if not isinstance(x, basestring):
            return False
    return True

def list_union(a, b):
    result = []
    for x in a:
        if x not in result:
            result.append(x)
    for x in b:
        if x not in result:
            result.append(x)
    return result

def list_intersection(a, b):
    result = []
    for x in a:
        if x in b and x not in result:
            result.append(x)
    return result

def list_difference(a, b):
    result = []
    for x in a:
        if x not in b and x not in result:
            result.append(x)
    for x in b:
        if x not in a and x not in result:
            result.append(x)
    return result

def contains_vars(data):
    '''
    returns True if the data contains a variable pattern
    '''
    return "$" in data or "{{" in data

def safe_eval(expr, locals={}, include_exceptions=False):
    '''
    This is intended for allowing things like:
    with_items: a_list_variable

    Where Jinja2 would return a string but we do not want to allow it to
    call functions (outside of Jinja2, where the env is constrained). If
    the input data to this function came from an untrusted (remote) source,
    it should first be run through _clean_data_struct() to ensure the data
    is further sanitized prior to evaluation.

    Based on:
    http://stackoverflow.com/questions/12523516/using-ast-and-whitelists-to-make-pythons-eval-safe
    '''
    JSON_TYPES = {
        'false': False,
        'null': None,
        'true': True,
    }

    SAFE_NODES = set(
        (
            ast.Add,
            ast.BinOp,
            ast.Call,
            ast.Compare,
            ast.Dict,
            ast.Div,
            ast.Expression,
            ast.List,
            ast.Load,
            ast.Mult,
            ast.Num,
            ast.Name,
            ast.Str,
            ast.Sub,
            ast.Tuple,
            ast.UnaryOp,
        )
    )

    if not sys.version.startswith('2.6'):
        SAFE_NODES.union(set((ast.Set,)))

    filter_list = []
    for filter in filter_loader.all():
        filter_list.extend(filter.filters().keys())

    CALL_WHITELIST = C.DEFAULT_CALLABLE_WHITELIST + filter_list

    class CleansingNodeVisitor(ast.NodeVisitor):
        def generic_visit(self, node, inside_call=False):
            if type(node) not in SAFE_NODES:
                raise Exception("invalid expression (%s)" % expr)
            elif isinstance(node, ast.Call):
                inside_call = True
            elif isinstance(node, ast.Name) and inside_call:
                if hasattr(builtin, node.id) and node.id not in CALL_WHITELIST:
                    raise Exception("invalid function: %s" % node.id)
            for child_node in ast.iter_child_nodes(node):
                self.generic_visit(child_node, inside_call)

    if not isinstance(expr, basestring):
        if include_exceptions:
            return (expr, None)
        return expr

    cnv = CleansingNodeVisitor()
    try:
        parsed_tree = ast.parse(expr, mode='eval')
        cnv.visit(parsed_tree)
        compiled = compile(parsed_tree, expr, 'eval')
        result = eval(compiled, JSON_TYPES, dict(locals))

        if include_exceptions:
            return (result, None)
        else:
            return result
    except SyntaxError as e:
        if include_exceptions:
            return (expr, None)
        return expr
    except Exception as e:
        if include_exceptions:
            return (expr, e)
        return expr

def listify_lookup_plugin_terms(terms, basedir, inject):
    from ansible.utils import template

    if isinstance(terms, basestring):
        stripped = terms.strip()
        if not _is_literal_list_or_path(stripped) and not LOOKUP_REGEX.search(terms):
            try:
                new_terms = template.template(basedir, "{{ %s }}" % terms, inject)
                if not (isinstance(new_terms, basestring) and "{{" in new_terms):
                    terms = new_terms
            except:
                pass

        if '{' in terms or '[' in terms:
            return safe_eval(terms)

        if isinstance(terms, basestring):
            terms = [ terms ]

    return terms

def _is_literal_list_or_path(stripped):
    """Check if string is a literal list or path."""
    return (stripped.startswith('{') or stripped.startswith('[') or 
            stripped.startswith("/") or stripped.startswith('set(['))

def combine_vars(a, b):
    if C.DEFAULT_HASH_BEHAVIOUR == "merge":
        return merge_hash(a, b)
    else:
        _validate_both_dicts(a, b)
        result = a.copy()
        result.update(b)
        return result

def random_password(length=20, chars=C.DEFAULT_PASSWORD_CHARS):
    '''Return a random password string of length containing only chars.'''
    password = []
    while len(password) < length:
        new_char = os.urandom(1)
        if new_char in chars:
            password.append(new_char)

    return ''.join(password)

def before_comment(msg):
    ''' what's the part of a string before a comment? '''
    msg = msg.replace("\#","**NOT_A_COMMENT**")
    msg = msg.split("#")[0]
    msg = msg.replace("**NOT_A_COMMENT**","#")
    return msg

def load_vars(basepath, results, vault_password=None):
    """
    Load variables from any potential yaml filename combinations of basepath,
    returning result.
    """
    paths_to_check = [ "".join([basepath, ext])
                       for ext in C.YAML_FILENAME_EXTENSIONS ]

    found_paths = []

    for path in paths_to_check:
        found, results = _load_vars_from_path(path, results, vault_password=vault_password)
        if found:
            found_paths.append(path)

    if len(found_paths) > 1:
        raise errors.AnsibleError("Multiple variable files found. "
            "There should only be one. %s" % ( found_paths, ))

    return results

def _load_vars_from_path(path, results, vault_password=None):
    """
    Robustly access the file at path and load variables, carefully reporting
    errors in a friendly/informative way.

    Return the tuple (found, new_results, )
    """
    try:
        pathstat = os.lstat(path)
    except os.error as err:
        if err.errno == errno.ENOENT:
            return False, results
        raise errors.AnsibleError(
            "%s is not accessible: %s."
            " Please check its permissions." % ( path, err.strerror))

    if stat.S_ISLNK(pathstat.st_mode):
        return _load_vars_from_symlink(path, results, vault_password)

    if stat.S_ISDIR(pathstat.st_mode):
        return True, _load_vars_from_folder(path, results, vault_password=vault_password)

    if stat.S_ISREG(pathstat.st_mode):
        return _load_vars_from_regular_file(path, results, vault_password)

    raise errors.AnsibleError("Expected a variable file or directory "
        "but found a non-file object at path %s" % (path, ))

def _load_vars_from_symlink(path, results, vault_password):
    """Load variables from symbolic link."""
    try:
        target = os.path.realpath(path)
    except os.error as err2:
        raise errors.AnsibleError("The symbolic link at %s "
            "is not readable: %s.  Please check its permissions."
            % (path, err2.strerror, ))
    return _load_vars_from_path(target, results, vault_password)

def _load_vars_from_regular_file(path, results, vault_password):
    """Load variables from regular file."""
    data = parse_yaml_from_file(path, vault_password=vault_password)
    if data and type(data) != dict:
        raise errors.AnsibleError(
            "%s must be stored as a dictionary/hash" % path)
    elif data is None:
        data = {}

    results = combine_vars(results, data)
    return True, results

def _load_vars_from_folder(folder_path, results, vault_password=None):
    """
    Load all variables within a folder recursively.
    """
    try:
        names = os.listdir(folder_path)
    except os.error as err:
        raise errors.AnsibleError(
            "This folder cannot be listed: %s: %s."
             % ( folder_path, err.strerror))

    names.sort()
    paths = [os.path.join(folder_path, name) for name in names if not name.startswith('.')]
    for path in paths:
        _found, results = _load_vars_from_path(path, results, vault_password=vault_password)
    return results

def update_hash(hash, key, new_value):
    ''' used to avoid nested .update calls on the parent '''
    value = hash.get(key, {})
    value.update(new_value)
    hash[key] = value

def censor_unlogged_data(data):
    '''
    used when the no_log: True attribute is passed to a task to keep data from a callback.
    NOT intended to prevent variable registration, but only things from showing up on
    screen
    '''
    new_data = {}
    for (x,y) in data.iteritems():
       if x in [ 'skipped', 'changed', 'failed', 'rc' ]:
           new_data[x] = y
    new_data['censored'] = 'results hidden due to no_log parameter'
    return new_data

def check_mutually_exclusive_privilege(options, parser):
    if _has_conflicting_privilege_options(options):
        parser.error("Sudo arguments ('--sudo', '--sudo-user', and '--ask-sudo-pass') "
                     "and su arguments ('-su', '--su-user', and '--ask-su-pass') "
                     "and become arguments ('--become', '--become-user', and '--ask-become-pass')"
                     " are exclusive of each other")

def _has_conflicting_privilege_options(options):
    """Check if privilege escalation options conflict."""
    su_opts = options.su or options.su_user or options.ask_su_pass
    sudo_opts = options.sudo or options.sudo_user or options.ask_sudo_pass
    become_opts = options.become or options.become_user or options.become_ask_pass
    
    return (su_opts and sudo_opts) or (su_opts and become_opts) or (sudo_opts and become_opts)

presented = None