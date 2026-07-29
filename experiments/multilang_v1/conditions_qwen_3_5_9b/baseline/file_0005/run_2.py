try:
    import passlib.hash
    PASSLIB_AVAILABLE = True
except ImportError:
    PASSLIB_AVAILABLE = False