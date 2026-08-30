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

def key_for_hostname(hostname):
    if not KEYCZAR_AVAILABLE:
        raise errors.AnsibleError("python-keyczar must be installed on the control machine to use accelerated modes")

    key_path = os.path.expanduser(C.ACCELERATE_KEYS_DIR)
    if not os.path.exists(key_path):
        with(_LOCK):
            if not os.path.exists(key_path):
                tmp_dir = tempfile.mkdtemp(dir=os.path.dirname(key_path))
                os.chmod(tmp_dir, int(C.ACCELERATE_KEYS_DIR_PERMS, 8))
                os.rename(tmp_dir, key_path)
    elif not os.path.isdir(key_path):
        raise errors.AnsibleError('ACCELERATE_KEYS_DIR is not a directory.')

    if stat.S_IMODE(os.stat(key_path).st_mode) != int(C.ACCELERATE_KEYS_DIR_PERMS, 8):
        raise errors.AnsibleError('Incorrect permissions on the private key directory. Use `chmod 0%o %s` to correct this issue, and make sure any of the keys files contained within that directory are set to 0%o' % (int(C.ACCELERATE_KEYS_DIR_PERMS, 8), C.ACCELERATE_KEYS_DIR, int(C.ACCELERATE_KEYS_FILE_PERMS, 8)))

    key_path = os.path.join(key_path, hostname)

    if not os.path.exists(key_path) or (time.time() - os.path.getmtime(key_path) > 60*60*2):
        with(_LOCK):
            if not os.path.exists(key_path) or (time.time() - os.path.getmtime(key_path) > 60*60*2):
                key = AesKey.Generate()
                with tempfile.NamedTemporaryFile(mode='w', dir=os.path.dirname(key_path), delete=False) as fh:
                    tmp_key_path = fh.name
                    fh.write(str(key))
                os.chmod(tmp_key_path, int(C.ACCELERATE_KEYS_FILE_PERMS, 8))
                os.rename(tmp_key_path, key_path)
                return key

    if stat.S_IMODE(os.stat(key_path).st_mode) != int(C.ACCELERATE_KEYS_FILE_PERMS, 8):
        raise errors.AnsibleError('Incorrect permissions on the key file for this host. Use `chmod 0%o %s` to correct this issue.' % (int(C.ACCELERATE_KEYS_FILE_PERMS, 8), key_path))

    with open(key_path) as fh:
        return AesKey.Read(fh.read())

def encrypt(key, msg):
    return key.Encrypt(msg.encode('utf-8'))

def decrypt(key, msg):
    try:
        return key.Decrypt(msg)
    except key_errors.InvalidSignatureError:
        raise errors.AnsibleError("decryption failed")

def read_vault_file(vault_password_file):
    if not vault_password_file:
        return None

    this_path = os.path.realpath(os.path.expanduser(vault_password_file))
    if is_executable(this_path):
        try:
            p = subprocess.Popen(this_path, stdout=subprocess.PIPE)
        except OSError, e:
            raise errors.AnsibleError("problem running %s (%s)" % (' '.join(this_path), e))
        stdout, stderr = p.communicate()
        vault_pass = stdout.strip('\r\n')
    else:
        try:
            f = open(this_path, "rb")
            vault_pass=f.read().strip()
            f.close()
        except (OSError, IOError), e:
            raise errors.AnsibleError("Could not read %s: %s" % (this_path, e))

    return vault_pass

def err(msg):
    print >> sys.stderr, msg

def exit(msg, rc=1):
    err(msg)
    sys.exit(rc)

def jsonify(result, format=False):
    if result is None:
        return "{}"
    result2 = result.copy()
    for key, value in result2.items():
        if type(value) is str:
            result2[key] = value.decode('utf-8', 'ignore')

    indent = None
    if format:
        indent = 4

    try:
        return json.dumps(result2, sort_keys=True, indent=indent, ensure_ascii=False)
    except UnicodeDecodeError:
        return json.dumps(result2, sort_keys=True, indent=indent)

def write_tree_file(tree, hostname, buf):
    path = os.path.join(tree, hostname)
    buf = to_bytes(buf)
    with open(path, 'wb+') as fd:
        fd.write(buf)

def is_failed(result):
    return ((result.get('rc', 0) != 0) or (result.get('failed', False) in [ True, 'True', 'true']))

def is_changed(result):
    return (result.get('changed', False) in [ True, 'True', 'true'])

def check_conditional(conditional, basedir, inject, fail_on_undefined=False):
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
    return (stat.S_IXUSR & os.stat(path)[stat.ST_MODE]
            or stat.S_IXGRP & os.stat(path)[stat.ST_MODE]
            or stat.S_IXOTH & os.stat(path)[stat.ST_MODE])

def unfrackpath(path):
    return os.path.normpath(os.path.realpath(os.path.expandvars(os.path.expanduser(path))))

def prepare_writeable_dir(tree,mode=0777):
    mode |= 0700
    tree = unfrackpath(tree)

    if not os.path.exists(tree):
        try:
            os.makedirs(tree, mode)
        except (IOError, OSError), e:
            raise errors.AnsibleError("Could not make dir %s: %s" % (tree, e))
    if not os.access(tree, os.W_OK):
        raise errors.AnsibleError("Cannot write to path %s" % tree)
    return tree

def path_dwim(basedir, given):
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
    role_version = ''
    default_role_versions = dict(git='master', hg='tip')

    if role_spec == "" or role_spec.startswith("#"):
        return (None, None, None, None)

    tokens = [s.strip() for s in role_spec.split(',')]

    if 'github.com/' in tokens[0] and not tokens[0].startswith("git+") and not tokens[0].endswith('.tar.gz'):
        tokens[0] = 'git+' + tokens[0]

    if '+' in tokens[0]:
        (scm, role_url) = tokens[0].split('+')
    else:
        scm = None
        role_url = tokens[0]
    if len(tokens) >= 2:
        role_version = tokens[1]
    if len(tokens) == 3:
        role_name = tokens[2]
    else:
        role_name = repo_url_to_role_name(tokens[0])
    if scm and not role_version:
        role_version = default_role_versions.get(scm, '')
    return dict(scm=scm, src=role_url, version=role_version, name=role_name)

def role_yaml_parse(role):
    if 'role' in role:
        role_info = role_spec_parse(role['role'])
        if isinstance(role_info, dict):
            if 'name' in role and 'name' in role_info:
                del role_info['name']
            role.update(role_info)
    else:
        if 'github.com' in role["src"] and 'http' in role["src"] and '+' not in role["src"] and not role["src"].endswith('.tar.gz'):
            role["src"] = "git+" + role["src"]

        if '+' in role["src"]:
            (scm, src) = role["src"].split('+')
            role["scm"] = scm
            role["src"] = src

        if 'name' not in role:
            role["name"] = repo_url_to_role_name(role["src"])

        if 'version' not in role:
            role['version'] = ''

        if 'scm' not in role:
            role['scm'] = None

    return role

def json_loads(data):
    try:
        loaded = json.loads(data)
    except ValueError,e:
        raise errors.AnsibleError("Unable to read provided data as JSON: %s" % str(e))

    return loaded

def _clean_data(orig_data, from_remote=False, from_inventory=False):
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
                prev_idx = None
                if token == '%}' and block_openings:
                    prev_idx = block_openings.pop()
                elif token == '}}' and print_openings:
                    prev_idx = print_openings.pop()

                if prev_idx is not None:
                    data.seek(prev_idx, os.SEEK_SET)
                    data.write('{#')
                    data.seek(token_start, os.SEEK_SET)
                    data.write('#}')

        return data.getvalue()

def _clean_data_struct(orig_data, from_remote=False, from_inventory=False):
    if not from_remote and not from_inventory:
        raise errors.AnsibleErrors("when cleaning data, you must specify either from_remote or from_inventory")
    if isinstance(orig_data, dict):
        data = orig_data.copy()
        for key in data:
            new_key = _clean_data_struct(key, from_remote, from_inventory)
            new_val = _clean_data_struct(data[key], from_remote, from_inventory)
            if key != new_key:
                del data[key]
            data[new_key] = new_val
    elif isinstance(orig_data, list):
        data = orig_data[:]
        for i in range(0, len(data)):
            data[i] = _clean_data_struct(data[i], from_remote, from_inventory)
    elif isinstance(orig_data, basestring):
        data = _clean_data(orig_data, from_remote, from_inventory)
    else:
        data = orig_data
    return data

def parse_json(raw_data, from_remote=False, from_inventory=False, no_exceptions=False):
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
    module_args = ""
    for (k,v) in args.iteritems():
        if isinstance(v, basestring):
            module_args = "%s=%s %s" % (k, pipes.quote(v), module_args)
        elif isinstance(v, bool):
            module_args = "%s=%s %s" % (k, str(v), module_args)
    return module_args.strip()

def merge_module_args(current_args, new_args):
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
    stripped_data = data.lstrip()
    loaded = None
    if stripped_data.startswith("{") or stripped_data.startswith("["):
        try:
            loaded = json.loads(data)
        except ValueError, ve:
            if path_hint:
                raise errors.AnsibleError(path_hint + ": " + str(ve))
            else:
                raise errors.AnsibleError(str(ve))
    else:
        loaded = yaml.load(data, Loader=Loader)

    return loaded

def process_common_errors(msg, probline, column):
    replaced = probline.replace(" ","")

    if ":{{" in replaced and "}}" in replaced:
        msg = msg + """
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
        return msg

    elif len(probline) > 1 and column < len(probline) and probline[column] == ":" and probline.count(':') > 1:
        msg = msg + """
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
        return msg
    else:
        parts = probline.split(":")
        if len(parts) > 1:
            middle = parts[1].strip()
            match = False
            unbalanced = False
            if middle.startswith("'") and not middle.endswith("'"):
                match = True
            elif middle.startswith('"') and not middle.endswith('"'):
                match = True
            if len(middle) > 0 and middle[0] in [ '"', "'" ] and middle[-1] in [ '"', "'" ] and (probline.count("'") > 2 or probline.count('"') > 2):
                unbalanced = True
            if match:
                msg = msg + """
This one looks easy to fix.  It seems that there is a value started
with a quote, and the YAML parser is expecting to see the line ended
with the same kind of quote.  For instance:

    when: "ok" in result.stdout

Could be written as:

   when: '"ok" in result.stdout'

or equivalently:

   when: "'ok' in result.stdout"

"""
                return msg

            if unbalanced:
                msg = msg + """
We could be wrong, but this one looks like it might be an issue with
unbalanced quotes.  If starting a value with a quote, make sure the
line ends with the same set of quotes.  For instance this arbitrary
example:

    foo: "bad" "wolf"

Could be written as:

    foo: '"bad" "wolf"'

"""
                return msg

    return msg

def process_yaml_error(exc, data, path=None, show_content=True):
    if hasattr(exc, 'problem_mark'):
        mark = exc.problem_mark
        if show_content:
            if mark.line -1 >= 0:
                before_probline = data.split("\n")[mark.line-1]
            else:
                before_probline = ''
            probline = data.split("\n")[mark.line]
            arrow = " " * mark.column + "^"
            msg = """Syntax Error while loading YAML script, %s
Note: The error may actually appear before this position: line %s, column %s

%s
%s
%s""" % (path, mark.line + 1, mark.column + 1, before_probline, probline, arrow)

            unquoted_var = None
            if '{{' in probline and '}}' in probline:
                if '"{{' not in probline or "'{{" not in probline:
                    unquoted_var = True

            if not unquoted_var:
                msg = process_common_errors(msg, probline, mark.column)
            else:
                msg = msg + """
We could be wrong, but this one looks like it might be an issue with
missing quotes.  Always quote template expression brackets when they
start a value. For instance:

    with_items:
      - {{ foo }}

Should be written as:

    with_items:
      - "{{ foo }}"

"""
        else:
            msg = """Syntax error while loading YAML script, %s
The error appears to have been on line %s, column %s, but may actually
be before there depending on the exact syntax problem.
""" % (path, mark.line + 1, mark.column + 1)

    else:
        if path:
            msg = "Could not parse YAML. Check over %s again." % path
        else:
            msg = "Could not parse YAML."
    raise errors.AnsibleYAMLValidationFailed(msg)

def parse_yaml_from_file(path, vault_password=None):
    data = None
    show_content = True

    try:
        data = open(path).read()
    except IOError:
        raise errors.AnsibleError("file could not read: %s" % path)

    vault = VaultLib(password=vault_password)
    if vault.is_encrypted(data):
        if vault_password is None:
            raise errors.AnsibleError("A vault password must be specified to decrypt %s" % path)
        data = vault.decrypt(data)
        show_content = False

    try:
        return parse_yaml(data, path_hint=path)
    except yaml.YAMLError, exc:
        process_yaml_error(exc, data, path, show_content)

def parse_kv(args):
    options = {}
    if args is not None:
        try:
            vargs = split_args(args)
        except ValueError, ve:
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
    if value is None:
        return function()
    return value

def _git_repo_info(repo_path):
    result = None
    if os.path.exists(repo_path):
        if os.path.isfile(repo_path):
            try:
                gitdir = yaml.safe_load(open(repo_path)).get('gitdir')
                if os.path.isabs(gitdir):
                    repo_path = gitdir
                else:
                    repo_path = os.path.join(repo_path[:-4], gitdir)
            except (IOError, AttributeError):
                return ''
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

        date = time.localtime(os.stat(branch_path).st_mtime)
        if time.daylight == 0:
            offset = time.timezone
        else:
            offset = time.altzone
        result = "({0} {1}) last updated {2} (GMT {3:+04d})".format(branch, commit,
            time.strftime("%Y/%m/%d %H:%M:%S", date), offset / -36)
    else:
        result = ''
    return result

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
            submodule_info =_git_repo_info(os.path.join(basedir, submodule_path, '.git'))
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
    ansible_versions = ansible_version.split('.')
    for counter in range(len(ansible_versions)):
        if ansible_versions[counter] == "":
            ansible_versions[counter] = 0
        try:
            ansible_versions[counter] = int(ansible_versions[counter])
        except:
            pass
    if len(ansible_versions) < 3:
        for counter in range(len(ansible_versions), 3):
            ansible_versions.append(0)
    return {'string':      ansible_version_string.strip(),
            'full':        ansible_version,
            'major':       ansible_versions[0],
            'minor':       ansible_versions[1],
            'revision':    ansible_versions[2]}

def getch():
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(sys.stdin.fileno())
        ch = sys.stdin.read(1)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
    return ch

def sanitize_output(arg_string):
    private_keys = ('password', 'login_password')

    output = []
    for part in arg_string.split():
        try:
            (k, v) = part.split('=', 1)
        except ValueError:
            v = heuristic_log_sanitize(part)
            output.append(v)
            continue

        if k in private_keys:
            v = 'VALUE_HIDDEN'
        else:
            v = heuristic_log_sanitize(v)
        output.append('%s=%s' % (k, v))

    output = ' '.join(output)
    return output

class SortedOptParser(optparse.OptionParser):
    def format_help(self, formatter=None):
        self.option_list.sort(key=operator.methodcaller('get_opt_string'))
        return optparse.OptionParser.format_help(self, formatter=None)

def increment_debug(option, opt, value, parser):
    global VERBOSITY
    VERBOSITY += 1

def base_parser(constants=C, usage="", output_opts=False, runas_opts=False,
    async_opts=False, connect_opts=False, subset_opts=False, check_opts=False, diff_opts=False):
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
        if extra_vars_opt.startswith(u"@"):
            extra_vars = combine_vars(extra_vars, parse_yaml_from_file(extra_vars_opt[1:], vault_password=vault_pass))
        elif extra_vars_opt and extra_vars_opt[0] in u'[{':
            extra_vars = combine_vars(extra_vars, parse_yaml(extra_vars_opt))
        else:
            extra_vars = combine_vars(extra_vars, parse_kv(extra_vars_opt))
    return extra_vars

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
    become_prompt = ''

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
        pass
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
    except:
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
    return make_become_cmd(cmd, sudo_user, executable, 'sudo', C.DEFAULT_SUDO_FLAGS, sudo_exe)

def make_su_cmd(su_user, executable, cmd):
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
                if 'before_header' in diff:
                    before_header = "before: %s" % diff['before_header']
                else:
                    before_header = 'before'
                if 'after_header' in diff:
                    after_header = "after: %s" % diff['after_header']
                else:
                    after_header = 'after'
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
    return "$" in data or "{{" in data

def safe_eval(expr, locals={}, include_exceptions=False):
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
        SAFE_NODES.union(
            set(
                (ast.Set,)
            )
        )

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
    except SyntaxError, e:
        if include_exceptions:
            return (expr, None)
        return expr
    except Exception, e:
        if include_exceptions:
            return (expr, e)
        return expr

def listify_lookup_plugin_terms(terms, basedir, inject):
    from ansible.utils import template

    if isinstance(terms, basestring):
        stripped = terms.strip()
        if not (stripped.startswith('{') or stripped.startswith('[')) and \
           not stripped.startswith("/") and \
           not stripped.startswith('set([') and \
           not LOOKUP_REGEX.search(terms):
            try:
                new_terms = template.template(basedir, "{{ %s }}" % terms, inject)
                if isinstance(new_terms, basestring) and "{{" in new_terms:
                    pass
                else:
                    terms = new_terms
            except:
                pass

        if '{' in terms or '[' in terms:
            return safe_eval(terms)

        if isinstance(terms, basestring):
            terms = [ terms ]

    return terms

def combine_vars(a, b):
    if C.DEFAULT_HASH_BEHAVIOUR == "merge":
        return merge_hash(a, b)
    else:
        _validate_both_dicts(a, b)
        result = a.copy()
        result.update(b)
        return result

def random_password(length=20, chars=C.DEFAULT_PASSWORD_CHARS):
    password = []
    while len(password) < length:
        new_char = os.urandom(1)
        if new_char in chars:
            password.append(new_char)

    return ''.join(password)

def before_comment(msg):
    msg = msg.replace("\#","**NOT_A_COMMENT**")
    msg = msg.split("#")[0]
    msg = msg.replace("**NOT_A_COMMENT**","#")
    return msg

def load_vars(basepath, results, vault_password=None):
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
    try:
        pathstat = os.lstat(path)
    except os.error, err:
        if err.errno == errno.ENOENT:
            return False, results
        raise errors.AnsibleError(
            "%s is not accessible: %s."
            " Please check its permissions." % ( path, err.strerror))

    if stat.S_ISLNK(pathstat.st_mode):
        try:
            target = os.path.realpath(path)
        except os.error, err2:
            raise errors.AnsibleError("The symbolic link at %s "
                "is not readable: %s.  Please check its permissions."
                % (path, err2.strerror, ))
        return _load_vars_from_path(target, results, vault_password)

    if stat.S_ISDIR(pathstat.st_mode):
        return True, _load_vars_from_folder(path, results, vault_password=vault_password)

    elif stat.S_ISREG(pathstat.st_mode):
        data = parse_yaml_from_file(path, vault_password=vault_password)
        if data and type(data) != dict:
            raise errors.AnsibleError(
                "%s must be stored as a dictionary/hash" % path)
        elif data is None:
            data = {}

        results = combine_vars(results, data)
        return True, results

    else:
        raise errors.AnsibleError("Expected a variable file or directory "
            "but found a non-file object at path %s" % (path, ))

def _load_vars_from_folder(folder_path, results, vault_password=None):
    try:
        names = os.listdir(folder_path)
    except os.error, err:
        raise errors.AnsibleError(
            "This folder cannot be listed: %s: %s."
             % ( folder_path, err.strerror))

    names.sort()

    paths = [os.path.join(folder_path, name) for name in names if not name.startswith('.')]
    for path in paths:
        _found, results = _load_vars_from_path(path, results, vault_password=vault_password)
    return results

def update_hash(hash, key, new_value):
    value = hash.get(key, {})
    value.update(new_value)
    hash[key] = value

def censor_unlogged_data(data):
    new_data = {}
    for (x,y) in data.iteritems():
       if x in [ 'skipped', 'changed', 'failed', 'rc' ]:
           new_data[x] = y
    new_data['censored'] = 'results hidden due to no_log parameter'
    return new_data

def check_mutually_exclusive_privilege(options, parser):
    if (options.su or options.su_user or options.ask_su_pass) and \
                (options.sudo or options.sudo_user or options.ask_sudo_pass) or \
        (options.su or options.su_user or options.ask_su_pass) and \
                (options.become or options.become_user or options.become_ask_pass) or \
        (options.sudo or options.sudo_user or options.ask_sudo_pass) and \
                (options.become or options.become_user or options.become_ask_pass):

            parser.error("Sudo arguments ('--sudo', '--sudo-user', and '--ask-sudo-pass') "
                         "and su arguments ('-su', '--su-user', and '--ask-su-pass') "
                         "and become arguments ('--become', '--become-user', and '--ask-become-pass')"
                         " are exclusive of each other")