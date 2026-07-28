def load_from_db(self):
    self.clear()
    for key, val in self.db.conn.get('SELECT key,val FROM preferences'):
        try:
            val = self.raw_to_object(val)
            dict.__setitem__(self, key, val)
        except Exception as e:
            prints('Failed to read value for:', key, 'from db:', str(e))
            continue