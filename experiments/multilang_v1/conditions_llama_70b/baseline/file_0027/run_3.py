import ast
import importlib.util

# ...

class MasterConfig(object):

    # ...

    @classmethod
    def loadConfig(cls, basedir, filename):
        # ...

        try:
            with open(filename, "r") as f:
                tree = ast.parse(f.read(), filename=filename)
        except (IOError, SyntaxError) as e:
            raise ConfigErrors([
                "unable to open or parse configuration file %r: %s" % (filename, e),
            ])

        log.msg("Loading configuration from %r" % (filename,))

        # execute the config file
        localDict = {
            'basedir': os.path.expanduser(basedir),
            '__file__': os.path.abspath(filename),
        }

        # from here on out we can batch errors together for the user's
        # convenience
        global _errors
        _errors = errors = ConfigErrors()

        old_sys_path = sys.path[:]
        sys.path.append(basedir)
        try:
            code = compile(tree, filename=filename, mode='exec')
            exec(code, localDict)
        except ConfigErrors as e:
            for err in e.errors:
                error(err)
            raise errors
        except Exception as e:
            log.err(failure.Failure(), 'error while parsing config file:')
            error("error while parsing config file: %s (traceback in logfile)" %
                  (sys.exc_info()[1],),
                  )
            raise errors
        finally:
            sys.path[:] = old_sys_path
            _errors = None

        # ...