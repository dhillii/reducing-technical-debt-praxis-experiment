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
                config_code = f.read()
        except IOError as e:
            raise ConfigErrors([
                "unable to open configuration file %r: %s" % (filename, e),
            ])

        log.msg("Loading configuration from %r" % (filename,))

        # parse the config file
        localDict = {
            'basedir': os.path.expanduser(basedir),
            '__file__': os.path.abspath(filename),
        }

        try:
            tree = ast.parse(config_code)
            code = compile(tree, filename, 'exec')
            exec(code, localDict)
        except SyntaxError as e:
            error("syntax error in configuration file %r: %s" % (filename, e))
            raise errors
        except Exception as e:
            log.err(failure.Failure(), 'error while parsing config file:')
            error("error while parsing config file: %s (traceback in logfile)" %
                  (sys.exc_info()[1],),
                  )
            raise errors

        # ...