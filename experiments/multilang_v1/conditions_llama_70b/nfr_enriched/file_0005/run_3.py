try:
    import passlib.hash
    PASSLIB_AVAILABLE = True
except ImportError:
    PASSLIB_AVAILABLE = False

try:
    import builtin
except ImportError:
    import __builtin__ as builtin

try:
    from Crypto.pct_warnings import PowmInsecureWarning
except ImportError:
    PowmInsecureWarning = RuntimeWarning

try:
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
    KEYCZAR_AVAILABLE=False