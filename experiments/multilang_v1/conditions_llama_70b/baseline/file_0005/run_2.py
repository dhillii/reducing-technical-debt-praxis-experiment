try:
    import passlib.hash
    PASSLIB_AVAILABLE = True
except ImportError:
    pass

try:
    import builtin
except ImportError:
    import __builtin__ as builtin

try:
    from yaml import CSafeLoader as Loader
except ImportError:
    from yaml import SafeLoader as Loader

try:
    # some versions of pycrypto may not have this?
    from Crypto.pct_warnings import PowmInsecureWarning
except ImportError:
    PowmInsecureWarning = RuntimeWarning

try:
    import keyczar.errors as key_errors
    from keyczar.keys import AesKey
    KEYCZAR_AVAILABLE=True
except ImportError:
    pass

try:
    import simplejson as json
except ImportError:
    import json