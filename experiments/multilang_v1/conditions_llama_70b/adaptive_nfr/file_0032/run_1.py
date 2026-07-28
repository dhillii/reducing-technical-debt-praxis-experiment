class DBPrefs(dict): 

    'Store preferences as key:value pairs in the db'

    def __init__(self, db):
        dict.__init__(self)
        self.db = db
        self.defaults = {}
        self.disable_setting = False
        self.load_from_db()

    def load_from_db(self):
        self.clear()
        for key, val in self.db.conn.get('SELECT key,val FROM preferences'):
            try:
                val = self.raw_to_object(val)
                dict.__setitem__(self, key, val)
            except Exception as e:
                prints('Failed to read value for:', key, 'from db:', str(e))

    def raw_to_object(self, raw):
        if not isinstance(raw, unicode):
            raw = raw.decode(preferred_encoding)
        return json.loads(raw, object_hook=from_json)

    def to_raw(self, val):
        return json.dumps(val, indent=2, default=to_json, sort_keys=True)

    def has_setting(self, key):
        return key in self

    def __getitem__(self, key):
        try:
            return dict.__getitem__(self, key)
        except KeyError:
            return self.defaults[key]

    def __delitem__(self, key):
        dict.__delitem__(self, key)
        self.db.execute('DELETE FROM preferences WHERE key=?', (key,))

    def __setitem__(self, key, val):
        if not self.disable_setting:
            raw = self.to_raw(val)
            with self.db.conn:
                try:
                    dbraw = self.db.execute('SELECT id,val FROM preferences WHERE key=?', (key,)).next()
                except StopIteration:
                    dbraw = None
                if dbraw is None or dbraw[1] != raw:
                    if dbraw is None:
                        self.db.execute('INSERT INTO preferences (key,val) VALUES (?,?)', (key, raw))
                    else:
                        self.db.execute('UPDATE preferences SET val=? WHERE id=?', (raw, dbraw[0]))
                    dict.__setitem__(self, key, val)

    def set(self, key, val):
        self.__setitem__(key, val)

    def get_namespaced(self, namespace, key, default=None):
        key = u'namespaced:%s:%s'%(namespace, key)
        try:
            return dict.__getitem__(self, key)
        except KeyError:
            return default

    def set_namespaced(self, namespace, key, val):
        if u':' in key:
            raise KeyError('Colons are not allowed in keys')
        if u':' in namespace:
            raise KeyError('Colons are not allowed in the namespace')
        key = u'namespaced:%s:%s'%(namespace, key)
        self[key] = val

    def write_serialized(self, library_path):
        try:
            to_filename = os.path.join(library_path, 'metadata_db_prefs_backup.json')
            with open(to_filename, "wb") as f:
                f.write(json.dumps(self, indent=2, default=to_json))
        except Exception as e:
            import traceback
            traceback.print_exc()

    @classmethod
    def read_serialized(cls, library_path, recreate_prefs=False):
        from_filename = os.path.join(library_path, 'metadata_db_prefs_backup.json')
        with open(from_filename, "rb") as f:
            return json.load(f, object_hook=from_json)