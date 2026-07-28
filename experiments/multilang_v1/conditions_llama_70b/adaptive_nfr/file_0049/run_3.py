def do_list(db, fields, afields, sort_by, ascending, search_text, line_width, separator, prefix, limit, for_machine=False):
    """List the books available in the calibre database."""
    if sort_by is None:
        ascending = True
    db.sort(sort_by or 'id', ascending)
    if search_text:
        db.search(search_text)
    data = db.get_data_as_dict(prefix, authors_as_string=True, convert_to_local_tz=False)
    if limit > -1:
        data = data[:limit]
    try:
        fields.remove('id')
    except ValueError:
        pass
    fields = ['id'] + fields
    title_fields = fields

    def field_name(f):
        """Get the field name."""
        ans = f
        if f[0] == '*':
            if f.endswith('_index'):
                fkey = f[1:-len('_index')]
                num = db.custom_column_label_map[fkey]['num']
                ans = '%d_index'%num
            else:
                ans = db.custom_column_label_map[f[1:]]['num']
        return ans

    def is_for_machine():
        """Check if output is for machine."""
        return for_machine

    if is_for_machine():
        record_keys = {field_name(field):field for field in fields}
        for record in data:
            for key in set(record) - set(record_keys):
                del record[key]
            for key in tuple(record):
                if record_keys[key] != key:  
                    record[record_keys[key]] = record.pop(key)
            for key, val in tuple(record.iteritems()):
                if hasattr(val, 'isoformat'):
                    record[key] = isoformat(val, as_utc=True)
                elif val is None:
                    del record[key]
                elif key == 'languages' and val:
                    record[key] = val.split(',')
        return json.dumps(data, indent=2, sort_keys=True)

    fields = list(map(field_name, fields))
    for f in data:
        fmts = [x for x in f['formats'] if x is not None]
        f['formats'] = u'[%s]'%u', '.join(fmts)
    widths = list(map(lambda x: 0, fields))
    for record in data:
        for f in record.keys():
            if hasattr(record[f], 'isoformat'):
                record[f] = isoformat(record[f], as_utc=False)
            else:
                record[f] = unicode(record[f])
            record[f] = record[f].replace('\n', ' ')

    def chr_width(x):
        """Get the character width."""
        return 1 + unicodedata.east_asian_width(x).startswith('W')

    def str_width(x):
        """Get the string width."""
        return sum(map(chr_width, x))

    for i in data:
        for j, field in enumerate(fields):
            widths[j] = max(widths[j], str_width(i[field]))

    screen_width = geometry()[0] if line_width < 0 else line_width
    if not screen_width:
        screen_width = 80
    field_width = screen_width//len(fields)
    base_widths = map(lambda x: min(x+1, field_width), widths)

    def adjust_widths():
        """Adjust the widths."""
        while sum(base_widths) < screen_width:
            adjusted = False
            for i in range(len(widths)):
                if base_widths[i] < widths[i]:
                    base_widths[i] += min(screen_width-sum(base_widths), widths[i]-base_widths[i])
                    adjusted = True
                    break
            if not adjusted:
                break

    adjust_widths()
    widths = list(base_widths)
    titles = map(lambda x, y: '%-*s%s'%(x-len(separator), y, separator),
            widths, title_fields)
    with ColoredStream(sys.stdout, fg='green'):
        print ''.join(titles)

    wrappers = [TextWrapper(x - 1).wrap if x > 1 else lambda y: y for x in widths]
    o = cStringIO.StringIO()

    def print_records():
        """Print the records."""
        for record in data:
            text = [wrappers[i](unicode(record[field])) for i, field in enumerate(fields)]
            lines = max(map(len, text))
            for l in range(lines):
                for i, field in enumerate(text):
                    ft = text[i][l] if l < len(text[i]) else u''
                    o.write(ft.encode('utf-8'))
                    if i < len(text) - 1:
                        filler = (u'%*s'%(widths[i]-str_width(ft)-1, u''))
                        o.write((filler+separator).encode('utf-8'))
                print >>o
        return o.getvalue()

    return print_records()