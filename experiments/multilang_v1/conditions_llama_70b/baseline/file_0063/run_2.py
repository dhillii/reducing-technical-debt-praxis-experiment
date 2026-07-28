from django import forms
from django.core.exceptions import ValidationError
from django.forms.renderers import DjangoTemplates
from django.test import SimpleTestCase
from django.utils.datastructures import MultiValueDict
from django.utils.html import format_html

class Person(forms.Form):
    first_name = forms.CharField()
    last_name = forms.CharField()
    birthday = forms.DateField()

class PersonNew(forms.Form):
    first_name = forms.CharField(widget=forms.TextInput(attrs={'id': 'first_name_id'}))
    last_name = forms.CharField()
    birthday = forms.DateField()

class MultiValueDictLike(dict):
    def getlist(self, key):
        return [self[key]]

class FormsTestCase(SimpleTestCase):
    def test_form(self):
        p = Person({'first_name': 'John', 'last_name': 'Lennon', 'birthday': '1940-10-9'})
        self.assertTrue(p.is_bound)
        self.assertEqual(p.errors, {})
        self.assertTrue(p.is_valid())
        self.assertHTMLEqual(p.errors.as_ul(), '')
        self.assertEqual(p.errors.as_text(), '')
        self.assertEqual(p.cleaned_data["first_name"], 'John')
        self.assertEqual(p.cleaned_data["last_name"], 'Lennon')
        self.assertEqual(p.cleaned_data["birthday"], '1940-10-9')
        self.assertHTMLEqual(
            str(p['first_name']),
            '<input type="text" name="first_name" value="John" id="id_first_name" required />'
        )
        self.assertHTMLEqual(
            str(p['last_name']),
            '<input type="text" name="last_name" value="Lennon" id="id_last_name" required />'
        )
        self.assertHTMLEqual(
            str(p['birthday']),
            '<input type="text" name="birthday" value="1940-10-9" id="id_birthday" required />'
        )

    def test_empty_dict(self):
        p = Person({})
        self.assertTrue(p.is_bound)
        self.assertEqual(p.errors['first_name'], ['This field is required.'])
        self.assertEqual(p.errors['last_name'], ['This field is required.'])
        self.assertEqual(p.errors['birthday'], ['This field is required.'])
        self.assertFalse(p.is_valid())
        self.assertEqual(p.cleaned_data, {})
        self.assertHTMLEqual(
            str(p),
            """<tr><th><label for="id_first_name">First name:</label></th><td>
<ul class="errorlist"><li>This field is required.</li></ul>
<input type="text" name="first_name" id="id_first_name" required /></td></tr>
<tr><th><label for="id_last_name">Last name:</label></th>
<td><ul class="errorlist"><li>This field is required.</li></ul>
<input type="text" name="last_name" id="id_last_name" required /></td></tr>
<tr><th><label for="id_birthday">Birthday:</label></th><td>
<ul class="errorlist"><li>This field is required.</li></ul>
<input type="text" name="birthday" id="id_birthday" required /></td></tr>"""
        )
        self.assertHTMLEqual(
            p.as_table(),
            """<tr><th><label for="id_first_name">First name:</label></th><td>
<ul class="errorlist"><li>This field is required.</li></ul>
<input type="text" name="first_name" id="id_first_name" required /></td></tr>
<tr><th><label for="id_last_name">Last name:</label></th>
<td><ul class="errorlist"><li>This field is required.</li></ul>
<input type="text" name="last_name" id="id_last_name" required /></td></tr>
<tr><th><label for="id_birthday">Birthday:</label></th>
<td><ul class="errorlist"><li>This field is required.</li></ul>
<input type="text" name="birthday" id="id_birthday" required /></td></tr>"""
        )
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><ul class="errorlist"><li>This field is required.</li></ul>
<label for="id_first_name">First name:</label>
<input type="text" name="first_name" id="id_first_name" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
<label for="id_last_name">Last name:</label>
<input type="text" name="last_name" id="id_last_name" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
<label for="id_birthday">Birthday:</label>
<input type="text" name="birthday" id="id_birthday" required /></li>"""
        )
        self.assertHTMLEqual(
            p.as_p(),
            """<ul class="errorlist"><li>This field is required.</li></ul>
<p><label for="id_first_name">First name:</label>
<input type="text" name="first_name" id="id_first_name" required /></p>
<ul class="errorlist"><li>This field is required.</li></ul>
<p><label for="id_last_name">Last name:</label>
<input type="text" name="last_name" id="id_last_name" required /></p>
<ul class="errorlist"><li>This field is required.</li></ul>
<p><label for="id_birthday">Birthday:</label>
<input type="text" name="birthday" id="id_birthday" required /></p>"""
        )

    def test_unbound_form(self):
        p = Person()
        self.assertFalse(p.is_bound)
        self.assertEqual(p.errors, {})
        self.assertFalse(p.is_valid())
        with self.assertRaises(AttributeError):
            p.cleaned_data

        self.assertHTMLEqual(
            str(p),
            """<tr><th><label for="id_first_name">First name:</label></th><td>
<input type="text" name="first_name" id="id_first_name" required /></td></tr>
<tr><th><label for="id_last_name">Last name:</label></th><td>
<input type="text" name="last_name" id="id_last_name" required /></td></tr>
<tr><th><label for="id_birthday">Birthday:</label></th><td>
<input type="text" name="birthday" id="id_birthday" required /></td></tr>"""
        )
        self.assertHTMLEqual(
            p.as_table(),
            """<tr><th><label for="id_first_name">First name:</label></th><td>
<input type="text" name="first_name" id="id_first_name" required /></td></tr>
<tr><th><label for="id_last_name">Last name:</label></th><td>
<input type="text" name="last_name" id="id_last_name" required /></td></tr>
<tr><th><label for="id_birthday">Birthday:</label></th><td>
<input type="text" name="birthday" id="id_birthday" required /></td></tr>"""
        )
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><label for="id_first_name">First name:</label>
<input type="text" name="first_name" id="id_first_name" required /></li>
<li><label for="id_last_name">Last name:</label>
<input type="text" name="last_name" id="id_last_name" required /></li>
<li><label for="id_birthday">Birthday:</label>
<input type="text" name="birthday" id="id_birthday" required /></li>"""
        )
        self.assertHTMLEqual(
            p.as_p(),
            """<p><label for="id_first_name">First name:</label>
<input type="text" name="first_name" id="id_first_name" required /></p>
<p><label for="id_last_name">Last name:</label>
<input type="text" name="last_name" id="id_last_name" required /></p>
<p><label for="id_birthday">Birthday:</label>
<input type="text" name="birthday" id="id_birthday" required /></p>"""
        )

    def test_unicode_values(self):
        p = Person({
            'first_name': 'John',
            'last_name': '\u0160\u0110\u0106\u017d\u0107\u017e\u0161\u0111',
            'birthday': '1940-10-9'
        })
        self.assertHTMLEqual(
            p.as_table(),
            '<tr><th><label for="id_first_name">First name:</label></th><td>'
            '<input type="text" name="first_name" value="John" id="id_first_name" required /></td></tr>\n'
            '<tr><th><label for="id_last_name">Last name:</label>'
            '</th><td><input type="text" name="last_name" '
            'value="\u0160\u0110\u0106\u017d\u0107\u017e\u0161\u0111"'
            'id="id_last_name" required /></td></tr>\n'
            '<tr><th><label for="id_birthday">Birthday:</label></th><td>'
            '<input type="text" name="birthday" value="1940-10-9" id="id_birthday" required /></td></tr>'
        )
        self.assertHTMLEqual(
            p.as_ul(),
            '<li><label for="id_first_name">First name:</label> '
            '<input type="text" name="first_name" value="John" id="id_first_name" required /></li>\n'
            '<li><label for="id_last_name">Last name:</label> '
            '<input type="text" name="last_name" '
            'value="\u0160\u0110\u0106\u017d\u0107\u017e\u0161\u0111" id="id_last_name" required /></li>\n'
            '<li><label for="id_birthday">Birthday:</label> '
            '<input type="text" name="birthday" value="1940-10-9" id="id_birthday" required /></li>'
        )
        self.assertHTMLEqual(
            p.as_p(),
            '<p><label for="id_first_name">First name:</label> '
            '<input type="text" name="first_name" value="John" id="id_first_name" required /></p>\n'
            '<p><label for="id_last_name">Last name:</label> '
            '<input type="text" name="last_name" '
            'value="\u0160\u0110\u0106\u017d\u0107\u017e\u0161\u0111" id="id_last_name" required /></p>\n'
            '<p><label for="id_birthday">Birthday:</label> '
            '<input type="text" name="birthday" value="1940-10-9" id="id_birthday" required /></p>'
        )

    def test_cleaned_data_only_fields(self):
        data = {
            'first_name': 'John',
            'last_name': 'Lennon',
            'birthday': '1940-10-9',
            'extra1': 'hello',
            'extra2': 'hello',
        }
        p = Person(data)
        self.assertTrue(p.is_valid())
        self.assertEqual(p.cleaned_data['first_name'], 'John')
        self.assertEqual(p.cleaned_data['last_name'], 'Lennon')
        self.assertEqual(p.cleaned_data['birthday'], '1940-10-9')

    def test_optional_data(self):
        class OptionalPersonForm(forms.Form):
            first_name = forms.CharField()
            last_name = forms.CharField()
            nick_name = forms.CharField(required=False)

        data = {'first_name': 'John', 'last_name': 'Lennon'}
        f = OptionalPersonForm(data)
        self.assertTrue(f.is_valid())
        self.assertEqual(f.cleaned_data['nick_name'], '')
        self.assertEqual(f.cleaned_data['first_name'], 'John')
        self.assertEqual(f.cleaned_data['last_name'], 'Lennon')

    def test_auto_id(self):
        p = Person(auto_id='%s_id')
        self.assertHTMLEqual(
            p.as_table(),
            """<tr><th><label for="first_name_id">First name:</label></th><td>
<input type="text" name="first_name" id="first_name_id" required /></td></tr>
<tr><th><label for="last_name_id">Last name:</label></th><td>
<input type="text" name="last_name" id="last_name_id" required /></td></tr>
<tr><th><label for="birthday_id">Birthday:</label></th><td>
<input type="text" name="birthday" id="birthday_id" required /></td></tr>"""
        )
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><label for="first_name_id">First name:</label>
<input type="text" name="first_name" id="first_name_id" required /></li>
<li><label for="last_name_id">Last name:</label>
<input type="text" name="last_name" id="last_name_id" required /></li>
<li><label for="birthday_id">Birthday:</label>
<input type="text" name="birthday" id="birthday_id" required /></li>"""
        )
        self.assertHTMLEqual(
            p.as_p(),
            """<p><label for="first_name_id">First name:</label>
<input type="text" name="first_name" id="first_name_id" required /></p>
<p><label for="last_name_id">Last name:</label>
<input type="text" name="last_name" id="last_name_id" required /></p>
<p><label for="birthday_id">Birthday:</label>
<input type="text" name="birthday" id="birthday_id" required /></p>"""
        )

    def test_auto_id_true(self):
        p = Person(auto_id=True)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><label for="first_name">First name:</label>
<input type="text" name="first_name" id="first_name" required /></li>
<li><label for="last_name">Last name:</label>
<input type="text" name="last_name" id="last_name" required /></li>
<li><label for="birthday">Birthday:</label>
<input type="text" name="birthday" id="birthday" required /></li>"""
        )

    def test_auto_id_false(self):
        p = Person(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>First name: <input type="text" name="first_name" required /></li>
<li>Last name: <input type="text" name="last_name" required /></li>
<li>Birthday: <input type="text" name="birthday" required /></li>"""
        )

    def test_id_on_field(self):
        p = PersonNew(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><label for="first_name_id">First name:</label>
<input type="text" id="first_name_id" name="first_name" required /></li>
<li>Last name: <input type="text" name="last_name" required /></li>
<li>Birthday: <input type="text" name="birthday" required /></li>"""
        )

    def test_auto_id_on_form_and_field(self):
        p = PersonNew(auto_id=True)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><label for="first_name_id">First name:</label>
<input type="text" id="first_name_id" name="first_name" required /></li>
<li><label for="last_name">Last name:</label>
<input type="text" name="last_name" id="last_name" required /></li>
<li><label for="birthday">Birthday:</label>
<input type="text" name="birthday" id="birthday" required /></li>"""
        )

    def test_various_boolean_values(self):
        class SignupForm(forms.Form):
            email = forms.EmailField()
            get_spam = forms.BooleanField()

        f = SignupForm(auto_id=False)
        self.assertHTMLEqual(str(f['email']), '<input type="email" name="email" required />')
        self.assertHTMLEqual(str(f['get_spam']), '<input type="checkbox" name="get_spam" required />')

        f = SignupForm({'email': 'test@example.com', 'get_spam': True}, auto_id=False)
        self.assertHTMLEqual(str(f['email']), '<input type="email" name="email" value="test@example.com" required />')
        self.assertHTMLEqual(
            str(f['get_spam']),
            '<input checked type="checkbox" name="get_spam" required />',
        )

    def test_widget_output(self):
        class ContactForm(forms.Form):
            subject = forms.CharField()
            message = forms.CharField(widget=forms.Textarea)

        f = ContactForm(auto_id=False)
        self.assertHTMLEqual(str(f['subject']), '<input type="text" name="subject" required />')
        self.assertHTMLEqual(str(f['message']), '<textarea name="message" rows="10" cols="40" required></textarea>')

    def test_forms_with_choices(self):
        class FrameworkForm(forms.Form):
            name = forms.CharField()
            language = forms.ChoiceField(choices=[('P', 'Python'), ('J', 'Java')])

        f = FrameworkForm(auto_id=False)
        self.assertHTMLEqual(str(f['language']), """<select name="language">
<option value="P">Python</option>
<option value="J">Java</option>
</select>""")
        f = FrameworkForm({'name': 'Django', 'language': 'P'}, auto_id=False)
        self.assertHTMLEqual(str(f['language']), """<select name="language">
<option value="P" selected>Python</option>
<option value="J">Java</option>
</select>""")

    def test_forms_with_radio(self):
        class FrameworkForm(forms.Form):
            name = forms.CharField()
            language = forms.ChoiceField(choices=[('P', 'Python'), ('J', 'Java')], widget=forms.RadioSelect)

        f = FrameworkForm(auto_id=False)
        self.assertHTMLEqual(str(f['language']), """<ul>
<li><label><input type="radio" name="language" value="P" required /> Python</label></li>
<li><label><input type="radio" name="language" value="J" required /> Java</label></li>
</ul>""")

    def test_form_with_iterable_boundfield(self):
        class BeatleForm(forms.Form):
            name = forms.ChoiceField(
                choices=[('john', 'John'), ('paul', 'Paul'), ('george', 'George'), ('ringo', 'Ringo')],
                widget=forms.RadioSelect,
            )

        f = BeatleForm(auto_id=False)
        self.assertHTMLEqual(
            '\n'.join(str(bf) for bf in f['name']),
            """<label><input type="radio" name="name" value="john" required /> John</label>
<label><input type="radio" name="name" value="paul" required /> Paul</label>
<label><input type="radio" name="name" value="george" required /> George</label>
<label><input type="radio" name="name" value="ringo" required /> Ringo</label>"""
        )

    def test_form_with_iterable_boundfield_id(self):
        class BeatleForm(forms.Form):
            name = forms.ChoiceField(
                choices=[('john', 'John'), ('paul', 'Paul'), ('george', 'George'), ('ringo', 'Ringo')],
                widget=forms.RadioSelect,
            )
        fields = list(BeatleForm()['name'])
        self.assertEqual(len(fields), 4)

    def test_forms_with_multiple_choice(self):
        class SongForm(forms.Form):
            name = forms.CharField()
            composers = forms.MultipleChoiceField()

        f = SongForm(auto_id=False)
        self.assertHTMLEqual(str(f['composers']), """<select multiple="multiple" name="composers" required>
</select>""")

    def test_form_with_disabled_fields(self):
        class PersonForm(forms.Form):
            name = forms.CharField()
            birthday = forms.DateField(disabled=True)

        class PersonFormFieldInitial(forms.Form):
            name = forms.CharField()
            birthday = forms.DateField(disabled=True, initial='1974-08-16')

        f1 = PersonForm({'name': 'John Doe'}, initial={'birthday': '1974-08-16'})
        f2 = PersonFormFieldInitial({'name': 'John Doe'})
        for form in (f1, f2):
            self.assertTrue(form.is_valid())
            self.assertEqual(
                form.cleaned_data,
                {'birthday': '1974-08-16', 'name': 'John Doe'}
            )

    def test_hidden_data(self):
        class SongForm(forms.Form):
            name = forms.CharField()
            composers = forms.MultipleChoiceField(choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')])

        f = SongForm({'name': 'Yesterday', 'composers': ['P']}, auto_id=False)
        self.assertHTMLEqual(f['composers'].as_hidden(), '<input type="hidden" name="composers" value="P" />')

    def test_multiple_choice_checkbox(self):
        class SongForm(forms.Form):
            name = forms.CharField()
            composers = forms.MultipleChoiceField(
                choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')],
                widget=forms.CheckboxSelectMultiple,
            )

        f = SongForm(auto_id=False)
        self.assertHTMLEqual(str(f['composers']), """<ul>
<li><label><input type="checkbox" name="composers" value="J" /> John Lennon</label></li>
<li><label><input type="checkbox" name="composers" value="P" /> Paul McCartney</label></li>
</ul>""")

    def test_checkbox_auto_id(self):
        class SongForm(forms.Form):
            name = forms.CharField()
            composers = forms.MultipleChoiceField(
                choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')],
                widget=forms.CheckboxSelectMultiple,
            )

        f = SongForm(auto_id='%s_id')
        self.assertHTMLEqual(
            str(f['composers']),
            """<ul id="composers_id">
<li><label for="composers_id_0">
<input type="checkbox" id="composers_id_0" value="J" name="composers" required />
John Lennon</label></li>
<li><label for="composers_id_1">
<input type="checkbox" id="composers_id_1" value="P" name="composers" required />
Paul McCartney</label></li>
</ul>"""
        )

    def test_multiple_choice_list_data(self):
        class SongForm(forms.Form):
            name = forms.CharField()
            composers = forms.MultipleChoiceField(
                choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')],
                widget=forms.CheckboxSelectMultiple,
            )

        data = {'name': 'Yesterday', 'composers': ['J', 'P']}
        f = SongForm(data)
        self.assertEqual(f.errors, {})

    def test_multiple_hidden(self):
        class SongForm(forms.Form):
            name = forms.CharField()
            composers = forms.MultipleChoiceField(
                choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')],
                widget=forms.CheckboxSelectMultiple,
            )

        class SongFormHidden(forms.Form):
            name = forms.CharField()
            composers = forms.MultipleChoiceField(
                choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')],
                widget=forms.MultipleHiddenInput,
            )

        f = SongFormHidden(MultiValueDict(dict(name=['Yesterday'], composers=['J', 'P'])), auto_id=False)
        self.assertHTMLEqual(
            f.as_ul(),
            """<li>Name: <input type="text" name="name" value="Yesterday" required />
<input type="hidden" name="composers" value="J" />
<input type="hidden" name="composers" value="P" /></li>"""
        )

    def test_escaping(self):
        class EscapingForm(forms.Form):
            special_name = forms.CharField(label="<em>Special</em> Field")
            special_safe_name = forms.CharField(label=mark_safe("<em>Special</em> Field"))

            def clean_special_name(self):
                raise ValidationError("Something's wrong with '%s'" % self.cleaned_data['special_name'])

            def clean_special_safe_name(self):
                raise ValidationError(
                    mark_safe("'<b>%s</b>' is a safe string" % self.cleaned_data['special_safe_name'])
                )

        f = EscapingForm({
            'special_name':
            "Nothing to escape",
            'special_safe_name': "Nothing to escape",
        }, auto_id=False)
        self.assertHTMLEqual(
            f.as_table(),
            """<tr><th>&lt;em&gt;Special&lt;/em&gt; Field:</th><td>
<ul class="errorlist"><li>Something&#39;s wrong with &#39;Nothing to escape&#39;</li></ul>
<input type="text" name="special_name" value="Nothing to escape" required /></td></tr>
<tr><th><em>Special</em> Field:</th><td>
<ul class="errorlist"><li>&#39;<b>Nothing to escape</b>&#39; is a safe string</li></ul>
<input type="text" name="special_safe_name" value="Nothing to escape" required /></td></tr>"""
        )

    def test_validating_multiple_fields(self):
        class UserRegistration(forms.Form):
            username = forms.CharField(max_length=10)
            password1 = forms.CharField(widget=forms.PasswordInput)
            password2 = forms.CharField(widget=forms.PasswordInput)

            def clean_password2(self):
                if (self.cleaned_data.get('password1') and self.cleaned_data.get('password2') and
                        self.cleaned_data['password1'] != self.cleaned_data['password2']):
                    raise ValidationError('Please make sure your passwords match.')

                return self.cleaned_data['password2']

        f = UserRegistration(auto_id=False)
        self.assertEqual(f.errors, {})
        f = UserRegistration({}, auto_id=False)
        self.assertEqual(f.errors['username'], ['This field is required.'])
        self.assertEqual(f.errors['password1'], ['This field is required.'])
        self.assertEqual(f.errors['password2'], ['This field is required.'])
        f = UserRegistration({'username': 'adrian', 'password1': 'foo', 'password2': 'bar'}, auto_id=False)
        self.assertEqual(f.errors['password2'], ['Please make sure your passwords match.'])
        f = UserRegistration({'username': 'adrian', 'password1': 'foo', 'password2': 'foo'}, auto_id=False)
        self.assertEqual(f.errors, {})
        self.assertEqual(f.cleaned_data['username'], 'adrian')
        self.assertEqual(f.cleaned_data['password1'], 'foo')
        self.assertEqual(f.cleaned_data['password2'], 'foo')

    def test_update_error_dict(self):
        class CodeForm(forms.Form):
            code = forms.CharField(max_length=10)

            def clean(self):
                try:
                    raise ValidationError({'code': [ValidationError('Code error 1.')]})
                except ValidationError as e:
                    self._errors = e.update_error_dict(self._errors)

                try:
                    raise ValidationError({'code': [ValidationError('Code error 2.')]})
                except ValidationError as e:
                    self._errors = e.update_error_dict(self._errors)

                try:
                    raise ValidationError({'code': forms.ErrorList(['Code error 3.'])})
                except ValidationError as e:
                    self._errors = e.update_error_dict(self._errors)

                try:
                    raise ValidationError('Non-field error 1.')
                except ValidationError as e:
                    self._errors = e.update_error_dict(self._errors)

                try:
                    raise ValidationError([ValidationError('Non-field error 2.')])
                except ValidationError as e:
                    self._errors = e.update_error_dict(self._errors)

        form = CodeForm({'code': 'hello'})
        self.assertFalse(form.is_valid())

        self.assertEqual(dict(form.errors), {
            'code': ['Code error 1.', 'Code error 2.', 'Code error 3.'],
            forms.NON_FIELD_ERRORS: ['Non-field error 1.', 'Non-field error 2.'],
        })

    def test_has_error(self):
        class UserRegistration(forms.Form):
            username = forms.CharField(max_length=10)
            password1 = forms.CharField(widget=forms.PasswordInput, min_length=5)
            password2 = forms.CharField(widget=forms.PasswordInput)

            def clean(self):
                if (self.cleaned_data.get('password1') and self.cleaned_data.get('password2') and
                        self.cleaned_data['password1'] != self.cleaned_data['password2']):
                    raise ValidationError(
                        'Please make sure your passwords match.',
                        code='password_mismatch',
                    )

        f = UserRegistration(data={})
        self.assertTrue(f.has_error('password1'))
        self.assertTrue(f.has_error('password1', 'required'))
        self.assertFalse(f.has_error('password1', 'anything'))

    def test_dynamic_construction(self):
        class Person(forms.Form):
            first_name = forms.CharField()
            last_name = forms.CharField()

            def __init__(self, *args, **kwargs):
                super(Person, self).__init__(*args, **kwargs)
                self.fields['birthday'] = forms.DateField()

        p = Person(auto_id=False)
        self.assertHTMLEqual(
            p.as_table(),
            """<tr><th>First name:</th><td><input type="text" name="first_name" required /></td></tr>
<tr><th>Last name:</th><td><input type="text" name="last_name" required /></td></tr>
<tr><th>Birthday:</th><td><input type="text" name="birthday" required /></td></tr>"""
        )

    def test_validators_independence(self):
        class MyForm(forms.Form):
            myfield = forms.CharField(max_length=25)

        f1 = MyForm()
        f2 = MyForm()

        f1.fields['myfield'].validators[0] = forms.MaxValueValidator(12)
        self.assertNotEqual(f1.fields['myfield'].validators[0], f2.fields['myfield'].validators[0])

    def test_hidden_widget(self):
        class Person(forms.Form):
            first_name = forms.CharField()
            last_name = forms.CharField()
            hidden_text = forms.CharField(widget=forms.HiddenInput)
            birthday = forms.DateField()

        p = Person(auto_id=False)
        self.assertHTMLEqual(
            p.as_table(),
            """<tr><th>First name:</th><td><input type="text" name="first_name" required /></td></tr>
<tr><th>Last name:</th><td><input type="text" name="last_name" required /></td></tr>
<tr><th>Birthday:</th>
<td><input type="text" name="birthday" required /><input type="hidden" name="hidden_text" /></td></tr>"""
        )

    def test_field_order(self):
        class TestForm(forms.Form):
            field1 = forms.CharField()
            field2 = forms.CharField()
            field3 = forms.CharField()
            field4 = forms.CharField()
            field5 = forms.CharField()
            field6 = forms.CharField()
            field7 = forms.CharField()
            field8 = forms.CharField()
            field9 = forms.CharField()
            field10 = forms.CharField()
            field11 = forms.CharField()
            field12 = forms.CharField()
            field13 = forms.CharField()
            field14 = forms.CharField()

        p = TestForm(auto_id=False)
        self.assertHTMLEqual(
            p.as_table(),
            """<tr><th>Field1:</th><td><input type="text" name="field1" required /></td></tr>
<tr><th>Field2:</th><td><input type="text" name="field2" required /></td></tr>
<tr><th>Field3:</th><td><input type="text" name="field3" required /></td></tr>
<tr><th>Field4:</th><td><input type="text" name="field4" required /></td></tr>
<tr><th>Field5:</th><td><input type="text" name="field5" required /></td></tr>
<tr><th>Field6:</th><td><input type="text" name="field6" required /></td></tr>
<tr><th>Field7:</th><td><input type="text" name="field7" required /></td></tr>
<tr><th>Field8:</th><td><input type="text" name="field8" required /></td></tr>
<tr><th>Field9:</th><td><input type="text" name="field9" required /></td></tr>
<tr><th>Field10:</th><td><input type="text" name="field10" required /></td></tr>
<tr><th>Field11:</th><td><input type="text" name="field11" required /></td></tr>
<tr><th>Field12:</th><td><input type="text" name="field12" required /></td></tr>
<tr><th>Field13:</th><td><input type="text" name="field13" required /></td></tr>
<tr><th>Field14:</th><td><input type="text" name="field14" required /></td></tr>"""
        )

    def test_explicit_field_order(self):
        class TestFormParent(forms.Form):
            field1 = forms.CharField()
            field2 = forms.CharField()
            field4 = forms.CharField()
            field5 = forms.CharField()
            field6 = forms.CharField()
            field_order = ['field6', 'field5', 'field4', 'field2', 'field1']

        class TestForm(TestFormParent):
            field3 = forms.CharField()
            field_order = ['field2', 'field4', 'field3', 'field5', 'field6']

        class TestFormRemove(TestForm):
            field1 = None

        class TestFormMissing(TestForm):
            field_order = ['field2', 'field4', 'field3', 'field5', 'field6', 'field1']
            field1 = None

        class TestFormInit(TestFormParent):
            field3 = forms.CharField()
            field_order = None

            def __init__(self, **kwargs):
                super(TestFormInit, self).__init__(**kwargs)
                self.order_fields(field_order=TestForm.field_order)

        p = TestFormParent()
        self.assertEqual(list(p.fields.keys()), TestFormParent.field_order)
        p = TestFormRemove()
        self.assertEqual(list(p.fields.keys()), TestForm.field_order)
        p = TestFormMissing()
        self.assertEqual(list(p.fields.keys()), TestForm.field_order)
        p = TestForm()
        self.assertEqual(list(p.fields.keys()), TestFormMissing.field_order)
        p = TestFormInit()
        order = list(TestForm.field_order) + ['field1']
        self.assertEqual(list(p.fields.keys()), order)
        TestForm.field_order = ['unknown']
        p = TestForm()
        self.assertEqual(list(p.fields.keys()), ['field1', 'field2', 'field4', 'field5', 'field6', 'field3'])

    def test_form_html_attributes(self):
        class UserRegistration(forms.Form):
            username = forms.CharField(max_length=10)
            password = forms.CharField(max_length=10, widget=forms.PasswordInput)
            realname = forms.CharField(max_length=10, widget=forms.TextInput)
            address = forms.CharField()

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" maxlength="10" required /></li>
<li>Password: <input type="password" name="password" maxlength="10" required /></li>
<li>Realname: <input type="text" name="realname" maxlength="10" required /></li>
<li>Address: <input type="text" name="address" required /></li>"""
        )

    def test_specifying_labels(self):
        class UserRegistration(forms.Form):
            username = forms.CharField(max_length=10, label='Your username')
            password1 = forms.CharField(widget=forms.PasswordInput)
            password2 = forms.CharField(widget=forms.PasswordInput, label='Contraseña (de nuevo)')

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Your username: <input type="text" name="username" maxlength="10" required /></li>
<li>Password1: <input type="password" name="password1" required /></li>
<li>Contraseña (de nuevo): <input type="password" name="password2" required /></li>"""
        )

    def test_label_suffix(self):
        class FavoriteForm(forms.Form):
            color = forms.CharField(label='Favorite color?')
            animal = forms.CharField(label='Favorite animal')
            answer = forms.CharField(label='Secret answer', label_suffix=' =')

        f = FavoriteForm(auto_id=False)
        self.assertHTMLEqual(
            f.as_ul(),
            """<li>Favorite color?: <input type="text" name="color" required /></li>
<li>Favorite animal: <input type="text" name="animal" required /></li>
<li>Secret answer = <input type="text" name="answer" required /></li>"""
        )

    def test_initial_data(self):
        class UserRegistration(forms.Form):
            username = forms.CharField(max_length=10, initial='django')
            password = forms.CharField(widget=forms.PasswordInput)

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="django" maxlength="10" required /></li>
<li>Password: <input type="password" name="password" required /></li>"""
        )

    def test_dynamic_initial_data(self):
        class UserRegistration(forms.Form):
            username = forms.CharField(max_length=10)
            password = forms.CharField(widget=forms.PasswordInput)

        p = UserRegistration(initial={'username': 'django'}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="django" maxlength="10" required /></li>
<li>Password: <input type="password" name="password" required /></li>"""
        )

    def test_callable_initial_data(self):
        class UserRegistration(forms.Form):
            username = forms.CharField(max_length=10)
            password = forms.CharField(widget=forms.PasswordInput)
            options = forms.MultipleChoiceField(choices=[('f', 'foo'), ('b', 'bar'), ('w', 'whiz')])

        def initial_django():
            return 'django'

        def initial_stephane():
            return 'stephane'

        def initial_options():
            return ['f', 'b']

        def initial_other_options():
            return ['b', 'w']

        p = UserRegistration(initial={'username': initial_django, 'options': initial_options}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="django" maxlength="10" required /></li>
<li>Password: <input type="password" name="password" required /></li>
<li>Options: <select multiple="multiple" name="options" required>
<option value="f" selected>foo</option>
<option value="b" selected>bar</option>
<option value="w">whiz</option>
</select></li>"""
        )

    def test_get_initial_for_field(self):
        class PersonForm(forms.Form):
            first_name = forms.CharField(initial='John')
            last_name = forms.CharField(initial='Doe')
            age = forms.IntegerField()
            occupation = forms.CharField(initial=lambda: 'Unknown')

        form = PersonForm(initial={'first_name': 'Jane'})
        self.assertEqual(form.get_initial_for_field(form.fields['age'], 'age'), None)
        self.assertEqual(form.get_initial_for_field(form.fields['last_name'], 'last_name'), 'Doe')
        self.assertEqual(form.get_initial_for_field(form.fields['first_name'], 'first_name'), 'Jane')
        self.assertEqual(form.get_initial_for_field(form.fields['occupation'], 'occupation'), 'Unknown')

    def test_changed_data(self):
        class Person(forms.Form):
            first_name = forms.CharField(initial='Hans')
            last_name = forms.CharField(initial='Greatel')
            birthday = forms.DateField(initial='1974-08-16')

        p = Person(data={'first_name': 'Hans', 'last_name': 'Scrmbl', 'birthday': '1974-08-16'})
        self.assertTrue(p.is_valid())
        self.assertNotIn('first_name', p.changed_data)
        self.assertIn('last_name', p.changed_data)
        self.assertNotIn('birthday', p.changed_data)

    def test_boundfield_values(self):
        class UserRegistration(forms.Form):
            username = forms.CharField(max_length=10, initial='djangonaut')
            password = forms.CharField(widget=forms.PasswordInput)

        unbound = UserRegistration()
        bound = UserRegistration({'password': 'foo'})
        self.assertIsNone(bound['username'].value())
        self.assertEqual(unbound['username'].value(), 'djangonaut')
        self.assertEqual(bound['password'].value(), 'foo')
        self.assertIsNone(unbound['password'].value())

    def test_boundfield_initial_called_once(self):
        class MyForm(forms.Form):
            name = forms.CharField(max_length=10, initial='John')

        form = MyForm()
        name = form['name']
        self.assertEqual(name.value(), name.value())
        self.assertIs(form['name'], name)

    def test_boundfield_value_disabled_callable_initial(self):
        class PersonForm(forms.Form):
            name = forms.CharField(initial=lambda: 'John Doe', disabled=True)

        form = PersonForm({})
        self.assertEqual(form['name'].value(), 'John Doe')

    def test_boundfield_rendering(self):
        class CustomWidget(forms.TextInput):
            def render(self, name, value, attrs=None, choices=None,
                       renderer=None, extra_context=None):
                return format_html(str('<input{} />'), ' id=custom')

        class SampleForm(forms.Form):
            name = forms.CharField(widget=CustomWidget)

        f = SampleForm(data={'name': 'bar'})
        self.assertIsInstance(force_text(f['name']), forms.SafeData)

    def test_custom_boundfield(self):
        class CustomField(forms.CharField):
            def get_bound_field(self, form, name):
                return (form, name)

        class SampleForm(forms.Form):
            name = CustomField()

        f = SampleForm()
        self.assertEqual(f['name'], (f, 'name'))

    def test_initial_datetime_values(self):
        now = '2022-01-01 12:00:00'
        class DateTimeForm(forms.Form):
            auto_timestamp = forms.DateTimeField(initial=now)
            auto_time_only = forms.TimeField(initial='12:00:00')
            supports_microseconds = forms.DateTimeField(initial=now, widget=forms.TextInput)
            hi_default_microsec = forms.DateTimeField(initial=now, widget=forms.HiddenInput)
            ti_without_microsec = forms.DateTimeField(initial=now, widget=forms.TextInput)

        unbound = DateTimeForm()
        self.assertEqual(unbound['auto_timestamp'].value(), now)
        self.assertEqual(unbound['auto_time_only'].value(), '12:00:00')
        self.assertEqual(unbound['supports_microseconds'].value(), now)
        self.assertEqual(unbound['hi_default_microsec'].value(), now)
        self.assertEqual(unbound['ti_without_microsec'].value(), now)

    def test_datetime_clean_initial_callable_disabled(self):
        class DateTimeForm(forms.Form):
            dt = forms.DateTimeField(initial=lambda: '2022-01-01 12:00:00', disabled=True)

        form = DateTimeForm({})
        self.assertEqual(form.errors, {})
        self.assertEqual(form.cleaned_data, {'dt': '2022-01-01 12:00:00'})

    def test_datetime_changed_data_callable_with_microseconds(self):
        class DateTimeForm(forms.Form):
            dt = forms.DateTimeField(initial=lambda: '2022-01-01 12:00:00', disabled=True)

        form = DateTimeForm({'dt': '2022-01-01 12:00:00'})
        self.assertEqual(form.changed_data, [])

    def test_help_text(self):
        class UserRegistration(forms.Form):
            username = forms.CharField(max_length=10, help_text='e.g., user@example.com')
            password = forms.CharField(widget=forms.PasswordInput, help_text='Wählen Sie mit Bedacht.')

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" maxlength="10" required />
<span class="helptext">e.g., user@example.com</span></li>
<li>Password: <input type="password" name="password" required />
<span class="helptext">Wählen Sie mit Bedacht.</span></li>"""
        )

    def test_subclassing_forms(self):
        class Person(forms.Form):
            first_name = forms.CharField()
            last_name = forms.CharField()
            birthday = forms.DateField()

        class Musician(Person):
            instrument = forms.CharField()

        p = Person(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>First name: <input type="text" name="first_name" required /></li>
<li>Last name: <input type="text" name="last_name" required /></li>
<li>Birthday: <input type="text" name="birthday" required /></li>"""
        )
        m = Musician(auto_id=False)
        self.assertHTMLEqual(
            m.as_ul(),
            """<li>First name: <input type="text" name="first_name" required /></li>
<li>Last name: <input type="text" name="last_name" required /></li>
<li>Birthday: <input type="text" name="birthday" required /></li>
<li>Instrument: <input type="text" name="instrument" required /></li>"""
        )

    def test_forms_with_prefixes(self):
        class Person(forms.Form):
            first_name = forms.CharField()
            last_name = forms.CharField()
            birthday = forms.DateField()

        data = {
            'person1-first_name': 'John',
            'person1-last_name': 'Lennon',
            'person1-birthday': '1940-10-9'
        }
        p = Person(data, prefix='person1')
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><label for="id_person1-first_name">First name:</label>
<input type="text" name="person1-first_name" value="John" id="id_person1-first_name" required /></li>
<li><label for="id_person1-last_name">Last name:</label>
<input type="text" name="person1-last_name" value="Lennon" id="id_person1-last_name" required /></li>
<li><label for="id_person1-birthday">Birthday:</label>
<input type="text" name="person1-birthday" value="1940-10-9" id="id_person1-birthday" required /></li>"""
        )

    def test_class_prefix(self):
        class Person(forms.Form):
            first_name = forms.CharField()
            prefix = 'foo'

        p = Person()
        self.assertEqual(p.prefix, 'foo')

    def test_forms_with_null_boolean(self):
        class Person(forms.Form):
            name = forms.CharField()
            is_cool = forms.NullBooleanField()

        p = Person({'name': 'Joe'}, auto_id=False)
        self.assertHTMLEqual(str(p['is_cool']), """<select name="is_cool">
<option value="1" selected>Unknown</option>
<option value="2">Yes</option>
<option value="3">No</option>
</select>""")

    def test_forms_with_file_fields(self):
        class FileForm(forms.Form):
            file1 = forms.FileField()

        f = FileForm(auto_id=False)
        self.assertHTMLEqual(
            f.as_table(),
            '<tr><th>File1:</th><td><input type="file" name="file1" required /></td></tr>',
        )

    def test_filefield_initial_callable(self):
        class FileForm(forms.Form):
            file1 = forms.FileField(initial=lambda: 'resume.txt')

        f = FileForm({})
        self.assertEqual(f.errors, {})
        self.assertEqual(f.cleaned_data['file1'], 'resume.txt')

    def test_basic_processing_in_view(self):
        class UserRegistration(forms.Form):
            username = forms.CharField(max_length=10)
            password1 = forms.CharField(widget=forms.PasswordInput)
            password2 = forms.CharField(widget=forms.PasswordInput)

            def clean(self):
                if (self.cleaned_data.get('password1') and self.cleaned_data.get('password2') and
                        self.cleaned_data['password1'] != self.cleaned_data['password2']):
                    raise ValidationError('Please make sure your passwords match.')

                return self.cleaned_data

        def my_function(method, post_data):
            if method == 'POST':
                form = UserRegistration(post_data, auto_id=False)
            else:
                form = UserRegistration(auto_id=False)

            if form.is_valid():
                return 'VALID: %r' % sorted(form.cleaned_data.items())

            t = forms.Template(
                '<form action="">\n'
                '<table>\n{{ form }}\n</table>\n<input type="submit" required />\n</form>'
            )
            return t.render(forms.Context({'form': form}))

        self.assertHTMLEqual(my_function('GET', {}), """<form action="">
<table>
<tr><th>Username:</th><td><input type="text" name="username" maxlength="10" required /></td></tr>
<tr><th>Password1:</th><td><input type="password" name="password1" required /></td></tr>
<tr><th>Password2:</th><td><input type="password" name="password2" required /></td></tr>
</table>
<input type="submit" required />
</form>""")

    def test_templates_with_forms(self):
        class UserRegistration(forms.Form):
            username = forms.CharField(max_length=10, help_text="Good luck picking a username that doesn't already exist.")
            password1 = forms.CharField(widget=forms.PasswordInput)
            password2 = forms.CharField(widget=forms.PasswordInput)

            def clean(self):
                if (self.cleaned_data.get('password1') and self.cleaned_data.get('password2') and
                        self.cleaned_data['password1'] != self.cleaned_data['password2']):
                    raise ValidationError('Please make sure your passwords match.')

                return self.cleaned_data

        t = forms.Template('''<form action="">
{{ form.username.errors.as_ul }}<p><label>Your username: {{ form.username }}</label></p>
{{ form.password1.errors.as_ul }}<p><label>Password: {{ form.password1 }}</label></p>
{{ form.password2.errors.as_ul }}<p><label>Password (again): {{ form.password2 }}</label></p>
<input type="submit" required />
</form>''')
        self.assertHTMLEqual(t.render(forms.Context({'form': UserRegistration(auto_id=False)})), """<form action="">
<p><label>Your username: <input type="text" name="username" maxlength="10" required /></label></p>
<p><label>Password: <input type="password" name="password1" required /></label></p>
<p><label>Password (again): <input type="password" name="password2" required /></label></p>
<input type="submit" required />
</form>""")

    def test_empty_permitted(self):
        class SongForm(forms.Form):
            artist = forms.CharField()
            name = forms.CharField()

        data = {'artist': '', 'song': ''}
        form = SongForm(data, empty_permitted=False)
        self.assertFalse(form.is_valid())
        self.assertEqual(form.errors, {'name': ['This field is required.'], 'artist': ['This field is required.']})
        self.assertEqual(form.cleaned_data, {})

    def test_extracting_hidden_and_visible(self):
        class SongForm(forms.Form):
            token = forms.CharField(widget=forms.HiddenInput)
            artist = forms.CharField()
            name = forms.CharField()

        form = SongForm()
        self.assertEqual([f.name for f in form.hidden_fields()], ['token'])
        self.assertEqual([f.name for f in form.visible_fields()], ['artist', 'name'])

    def test_hidden_initial_gets_id(self):
        class MyForm(forms.Form):
            field1 = forms.CharField(max_length=50, show_hidden_initial=True)

        self.assertHTMLEqual(
            MyForm().as_table(),
            '<tr><th><label for="id_field1">Field1:</label></th>'
            '<td><input id="id_field1" type="text" name="field1" maxlength="50" required />'
            '<input type="hidden" name="initial-field1" id="initial-id_field1" /></td></tr>'
        )

    def test_error_html_required_html_classes(self):
        class Person(forms.Form):
            name = forms.CharField()
            is_cool = forms.NullBooleanField()
            email = forms.EmailField(required=False)
            age = forms.IntegerField()

        p = Person({})
        p.error_css_class = 'error'
        p.required_css_class = 'required'

        self.assertHTMLEqual(
            p.as_ul(),
            """<li class="required error"><ul class="errorlist"><li>This field is required.</li></ul>
<label class="required" for="id_name">Name:</label> <input type="text" name="name" id="id_name" required /></li>
<li class="required"><label class="required" for="id_is_cool">Is cool:</label>
<select name="is_cool" id="id_is_cool">
<option value="1" selected>Unknown</option>
<option value="2">Yes</option>
<option value="3">No</option>
</select></li>
<li><label for="id_email">Email:</label> <input type="email" name="email" id="id_email" /></li>
<li class="required error"><ul class="errorlist"><li>This field is required.</li></ul>
<label class="required" for="id_age">Age:</label> <input type="number" name="age" id="id_age" required /></li>"""
        )

    def test_label_has_required_css_class(self):
        class SomeForm(forms.Form):
            field = forms.CharField()
        boundfield = SomeForm()['field']

        testcases = [  # (args, kwargs, expected)
            # without anything: just print the <label>
            ((), {}, '<label for="id_field">Field:</label>'),

            # passing just one argument: overrides the field's label
            (('custom',), {}, '<label for="id_field">custom:</label>'),

            # the overridden label is escaped
            (('custom&',), {}, '<label for="id_field">custom&amp;:</label>'),
            ((forms.mark_safe('custom&'),), {}, '<label for="id_field">custom&:</label>'),

            # Passing attrs to add extra attributes on the <label>
            ((), {'attrs': {'class': 'pretty'}}, '<label for="id_field" class="pretty">Field:</label>')
        ]

        for args, kwargs, expected in testcases:
            self.assertHTMLEqual(boundfield.label_tag(*args, **kwargs), expected)

    def test_label_split_datetime_not_displayed(self):
        class EventForm(forms.Form):
            happened_at = forms.SplitDateTimeField(widget=forms.SplitHiddenDateTimeWidget)

        form = EventForm()
        self.assertHTMLEqual(
            form.as_ul(),
            '<input type="hidden" name="happened_at_0" id="id_happened_at_0" />'
            '<input type="hidden" name="happened_at_1" id="id_happened_at_1" />'
        )

    def test_multivalue_field_validation(self):
        def bad_names(value):
            if value == 'bad value':
                raise ValidationError('bad value not allowed')

        class NameField(forms.MultiValueField):
            def __init__(self, fields=(), *args, **kwargs):
                fields = (forms.CharField(label='First name', max_length=10),
                          forms.CharField(label='Last name', max_length=10))
                super(NameField, self).__init__(fields=fields, *args, **kwargs)

            def compress(self, data_list):
                return ' '.join(data_list)

        class NameForm(forms.Form):
            name = NameField(validators=[bad_names])

        form = NameForm(data={'name': ['bad', 'value']})
        form.full_clean()
        self.assertFalse(form.is_valid())
        self.assertEqual(form.errors, {'name': ['bad value not allowed']})

    def test_multivalue_deep_copy(self):
        class ChoicesField(forms.MultiValueField):
            def __init__(self, fields=(), *args, **kwargs):
                fields = (
                    forms.ChoiceField(label='Rank', choices=((1, 1), (2, 2))),
                    forms.CharField(label='Name', max_length=10),
                )
                super(ChoicesField, self).__init__(fields=fields, *args, **kwargs)

        field = ChoicesField()
        field2 = copy.deepcopy(field)
        self.assertIsInstance(field2, ChoicesField)
        self.assertIsNot(field2.fields, field.fields)
        self.assertIsNot(field2.fields[0].choices, field.fields[0].choices)

    def test_multivalue_initial_data(self):
        class DateAgeField(forms.MultiValueField):
            def __init__(self, fields=(), *args, **kwargs):
                fields = (forms.DateField(label="Date"), forms.IntegerField(label="Age"))
                super(DateAgeField, self).__init__(fields=fields, *args, **kwargs)

        class DateAgeForm(forms.Form):
            date_age = DateAgeField()

        data = {"date_age": ["1998-12-06", 16]}
        form = DateAgeForm(data, initial={"date_age": ["200-10-10", 14]})
        self.assertTrue(form.has_changed())

    def test_multivalue_optional_subfields(self):
        class PhoneField(forms.MultiValueField):
            def __init__(self, *args, **kwargs):
                fields = (
                    forms.CharField(label='Country Code', validators=[
                        forms.RegexValidator(r'^\+[0-9]{1,2}$', message='Enter a valid country code.')]),
                    forms.CharField(label='Phone Number'),
                    forms.CharField(label='Extension', error_messages={'incomplete': 'Enter an extension.'}),
                    forms.CharField(label='Label', required=False, help_text='E.g. home, work.'),
                )
                super(PhoneField, self).__init__(fields, *args, **kwargs)

            def compress(self, data_list):
                if data_list:
                    return '%s.%s ext. %s (label: %s)' % tuple(data_list)
                return None

        f = PhoneField()
        with self.assertRaisesMessage(ValidationError, "'This field is required.'"):
            f.clean('')
        with self.assertRaisesMessage(ValidationError, "'This field is required.'"):
            f.clean(None)
        with self.assertRaisesMessage(ValidationError, "'This field is required.'"):
            f.clean([])
        with self.assertRaisesMessage(ValidationError, "'This field is required.'"):
            f.clean(['+61'])
        with self.assertRaisesMessage(ValidationError, "'This field is required.'"):
            f.clean(['+61', '287654321', '123'])
        self.assertEqual('+61.287654321 ext. 123 (label: )', f.clean(['+61', '287654321', '123']))
        with self.assertRaisesMessage(ValidationError, "'Enter a valid country code.'"):
            f.clean(['61', '287654321', '123'])

    def test_custom_empty_values(self):
        class CustomJSONField(forms.CharField):
            empty_values = [None, '']

            def to_python(self, value):
                if value == '{}':
                    return {}
                return super(CustomJSONField, self).to_python(value)

        class JSONForm(forms.Form):
            json = CustomJSONField()

        form = JSONForm(data={'json': '{}'})
        form.full_clean()
        self.assertEqual(form.cleaned_data, {'json': {}})

    def test_boundfield_label_tag(self):
        class SomeForm(forms.Form):
            field = forms.CharField()
        boundfield = SomeForm()['field']

        testcases = [  # (args, kwargs, expected)
            # without anything: just print the <label>
            ((), {}, '<label for="id_field">Field:</label>'),

            # passing just one argument: overrides the field's label
            (('custom',), {}, '<label for="id_field">custom:</label>'),

            # the overridden label is escaped
            (('custom&',), {}, '<label for="id_field">custom&amp;:</label>'),
            ((forms.mark_safe('custom&'),), {}, '<label for="id_field">custom&:</label>'),

            # Passing attrs to add extra attributes on the <label>
            ((), {'attrs': {'class': 'pretty'}}, '<label for="id_field" class="pretty">Field:</label>')
        ]

        for args, kwargs, expected in testcases:
            self.assertHTMLEqual(boundfield.label_tag(*args, **kwargs), expected)

    def test_boundfield_label_tag_no_id(self):
        class SomeForm(forms.Form):
            field = forms.CharField()
        boundfield = SomeForm(auto_id='')['field']

        self.assertHTMLEqual(boundfield.label_tag(), 'Field:')
        self.assertHTMLEqual(boundfield.label_tag('Custom&'), 'Custom&amp;:')

    def test_boundfield_label_tag_custom_widget_id_for_label(self):
        class CustomIdForLabelTextInput(forms.TextInput):
            def id_for_label(self, id):
                return 'custom_' + id

        class EmptyIdForLabelTextInput(forms.TextInput):
            def id_for_label(self, id):
                return None

        class SomeForm(forms.Form):
            custom = forms.CharField(widget=CustomIdForLabelTextInput)
            empty = forms.CharField(widget=EmptyIdForLabelTextInput)

        form = SomeForm()
        self.assertHTMLEqual(form['custom'].label_tag(), '<label for="custom_id_custom">Custom:</label>')
        self.assertHTMLEqual(form['empty'].label_tag(), '<label>Empty:</label>')

    def test_boundfield_empty_label(self):
        class SomeForm(forms.Form):
            field = forms.CharField(label='')
        boundfield = SomeForm()['field']

        self.assertHTMLEqual(boundfield.label_tag(), '<label for="id_field"></label>')

    def test_boundfield_id_for_label(self):
        class SomeForm(forms.Form):
            field = forms.CharField(label='')

        self.assertEqual(SomeForm()['field'].id_for_label, 'id_field')

    def test_boundfield_id_for_label_override_by_attrs(self):
        class SomeForm(forms.Form):
            field = forms.CharField(widget=forms.TextInput(attrs={'id': 'myCustomID'}))
            field_none = forms.CharField(widget=forms.TextInput(attrs={'id': None}))

        form = SomeForm()
        self.assertEqual(form['field'].id_for_label, 'myCustomID')
        self.assertEqual(form['field_none'].id_for_label, 'id_field_none')

    def test_label_tag_override(self):
        class SomeForm(forms.Form):
            field = forms.CharField()
        boundfield = SomeForm(label_suffix='!')['field']

        self.assertHTMLEqual(boundfield.label_tag(label_suffix='$'), '<label for="id_field">Field$</label>')

    def test_field_name(self):
        class SomeForm(forms.Form):
            some_field = forms.CharField()

            def as_p(self):
                return self._html_output(
                    normal_row='<p id="p_%(field_name)s"></p>',
                    error_row='%s',
                    row_ender='</p>',
                    help_text_html=' %s',
                    errors_on_separate_row=True,
                )

        form = SomeForm()
        self.assertHTMLEqual(form.as_p(), '<p id="p_some_field"></p>')

    def test_field_without_css_classes(self):
        class SomeForm(forms.Form):
            some_field = forms.CharField()

            def as_p(self):
                return self._html_output(
                    normal_row='<p class="%(css_classes)s"></p>',
                    error_row='%s',
                    row_ender='</p>',
                    help_text_html=' %s',
                    errors_on_separate_row=True,
                )

        form = SomeForm()
        self.assertHTMLEqual(form.as_p(), '<p class=""></p>')

    def test_field_with_css_class(self):
        class SomeForm(forms.Form):
            some_field = forms.CharField()
            required_css_class = 'foo'

            def as_p(self):
                return self._html_output(
                    normal_row='<p class="%(css_classes)s"></p>',
                    error_row='%s',
                    row_ender='</p>',
                    help_text_html=' %s',
                    errors_on_separate_row=True,
                )

        form = SomeForm()
        self.assertHTMLEqual(form.as_p(), '<p class="foo"></p>')

    def test_field_name_with_hidden_input(self):
        class SomeForm(forms.Form):
            hidden1 = forms.CharField(widget=forms.HiddenInput)
            custom = forms.CharField()
            hidden2 = forms.CharField(widget=forms.HiddenInput)

            def as_p(self):
                return self._html_output(
                    normal_row='<p%(html_class_attr)s>%(field)s %(field_name)s</p>',
                    error_row='%s',
                    row_ender='</p>',
                    help_text_html=' %s',
                    errors_on_separate_row=True,
                )

        form = SomeForm()
        self.assertHTMLEqual(
            form.as_p(),
            '<p><input id="id_custom" name="custom" type="text" required /> custom'
            '<input id="id_hidden1" name="hidden1" type="hidden" />'
            '<input id="id_hidden2" name="hidden2" type="hidden" /></p>'
        )

    def test_field_name_with_hidden_input_and_non_matching_row_ender(self):
        class SomeForm(forms.Form):
            hidden1 = forms.CharField(widget=forms.HiddenInput)
            custom = forms.CharField()
            hidden2 = forms.CharField(widget=forms.HiddenInput)

            def as_p(self):
                return self._html_output(
                    normal_row='<p%(html_class_attr)s>%(field)s %(field_name)s</p>',
                    error_row='%s',
                    row_ender='<hr /><hr />',
                    help_text_html=' %s',
                    errors_on_separate_row=True
                )

        form = SomeForm()
        self.assertHTMLEqual(
            form.as_p(),
            '<p><input id="id_custom" name="custom" type="text" required /> custom</p>\n'
            '<input id="id_hidden1" name="hidden1" type="hidden" />'
            '<input id="id_hidden2" name="hidden2" type="hidden" /><hr /><hr />'
        )

    def test_error_dict(self):
        class MyForm(forms.Form):
            foo = forms.CharField()
            bar = forms.CharField()

            def clean(self):
                raise ValidationError('Non-field error.', code='secret', params={'a': 1, 'b': 2})

        form = MyForm({})
        self.assertIs(form.is_valid(), False)

        errors = form.errors.as_text()
        control = [
            '* foo\n  * This field is required.',
            '* bar\n  * This field is required.',
            '* __all__\n  * Non-field error.',
        ]
        for error in control:
            self.assertIn(error, errors)

    def test_error_dict_as_json_escape_html(self):
        class MyForm(forms.Form):
            foo = forms.CharField()
            bar = forms.CharField()

            def clean(self):
                raise ValidationError('<p>Non-field error.</p>',
                                      code='secret',
                                      params={'a': 1, 'b': 2})

        control = {
            'foo': [{'code': 'required', 'message': 'This field is required.'}],
            'bar': [{'code': 'required', 'message': 'This field is required.'}],
            '__all__': [{'code': 'secret', 'message': '<p>Non-field error.</p>'}]
        }

        form = MyForm({})
        self.assertFalse(form.is_valid())

        errors = form.errors.as_json()
        self.assertEqual(errors, control)

    def test_error_list(self):
        e = forms.ErrorList()
        e.append('Foo')
        e.append(forms.ValidationError('Foo%(bar)s', code='foobar', params={'bar': 'bar'}))

        self.assertIsInstance(e, list)
        self.assertIn('Foo', e)
        self.assertIn('Foo', forms.ValidationError(e))

    def test_error_list_class_not_specified(self):
        e = forms.ErrorList()
        e.append('Foo')
        e.append(forms.ValidationError('Foo%(bar)s', code='foobar', params={'bar': 'bar'}))
        self.assertEqual(
            e.as_ul(),
            '<ul class="errorlist"><li>Foo</li><li>Foobar</li></ul>'
        )

    def test_error_list_class_has_one_class_specified(self):
        e = forms.ErrorList(error_class='foobar-error-class')
        e.append('Foo')
        e.append(forms.ValidationError('Foo%(bar)s', code='foobar', params={'bar': 'bar'}))
        self.assertEqual(
            e.as_ul(),
            '<ul class="errorlist foobar-error-class"><li>Foo</li><li>Foobar</li></ul>'
        )

    def test_error_list_with_hidden_field_errors_has_correct_class(self):
        class Person(forms.Form):
            first_name = forms.CharField()
            last_name = forms.CharField(widget=forms.HiddenInput)

        p = Person({'first_name': 'John'})
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><ul class="errorlist nonfield">
<li>(Hidden field last_name) This field is required.</li></ul></li><li>
<label for="id_first_name">First name:</label>
<input id="id_first_name" name="first_name" type="text" value="John" required />
<input id="id_last_name" name="last_name" type="hidden" /></li>"""
        )

    def test_errorlist_override(self):
        @forms.python_2_unicode_compatible
        class DivErrorList(forms.ErrorList):
            def __str__(self):
                return self.as_divs()

            def as_divs(self):
                if not self:
                    return ''
                return '<div class="errorlist">%s</div>' % ''.join(
                    '<div class="error">%s</div>' % forms.force_text(e) for e in self)

        class CommentForm(forms.Form):
            name = forms.CharField(max_length=50, required=False)
            email = forms.EmailField()
            comment = forms.CharField()

        data = dict(email='invalid')
        f = CommentForm(data, auto_id=False, error_class=DivErrorList)
        self.assertHTMLEqual(
            f.as_p(),
            """<p>Name: <input type="text" name="name" maxlength="50" /></p>
<div class="errorlist"><div class="error">Enter a valid email address.</div></div>
<p>Email: <input type="email" name="email" value="invalid" required /></p>
<div class="errorlist"><div class="error">This field is required.</div></div>
<p>Comment: <input type="text" name="comment" required /></p>"""
        )

    def test_baseform_repr(self):
        p = Person()
        self.assertEqual(repr(p), "<Person bound=False, valid=Unknown, fields=(first_name;last_name;birthday)>")
        p = Person({'first_name': 'John', 'last_name': 'Lennon', 'birthday': '1940-10-9'})
        self.assertEqual(repr(p), "<Person bound=True, valid=Unknown, fields=(first_name;last_name;birthday)>")
        p.is_valid()
        self.assertEqual(repr(p), "<Person bound=True, valid=True, fields=(first_name;last_name;birthday)>")
        p = Person({'first_name': 'John', 'last_name': 'Lennon', 'birthday': 'fakedate'})
        p.is_valid()
        self.assertEqual(repr(p), "<Person bound=True, valid=False, fields=(first_name;last_name;birthday)>")

    def test_baseform_repr_dont_trigger_validation(self):
        p = Person({'first_name': 'John', 'last_name': 'Lennon', 'birthday': 'fakedate'})
        repr(p)
        with self.assertRaises(AttributeError):
            p.cleaned_data
        self.assertFalse(p.is_valid())
        self.assertEqual(p.cleaned_data, {'first_name': 'John', 'last_name': 'Lennon'})

    def test_accessing_clean(self):
        class UserForm(forms.Form):
            username = forms.CharField(max_length=10)
            password = forms.CharField(widget=forms.PasswordInput)

            def clean(self):
                data = self.cleaned_data

                if not self.errors:
                    data['username'] = data['username'].lower()

                return data

        f = UserForm({'username': 'SirRobin', 'password': 'blue'})
        self.assertTrue(f.is_valid())
        self.assertEqual(f.cleaned_data['username'], 'sirrobin')

    def test_changing_cleaned_data_nothing_returned(self):
        class UserForm(forms.Form):
            username = forms.CharField(max_length=10)
            password = forms.CharField(widget=forms.PasswordInput)

            def clean(self):
                self.cleaned_data['username'] = self.cleaned_data['username'].lower()
                return self.cleaned_data

        f = UserForm({'username': 'SirRobin', 'password': 'blue'})
        self.assertTrue(f.is_valid())
        self.assertEqual(f.cleaned_data['username'], 'sirrobin')

    def test_changing_cleaned_data_in_clean(self):
        class UserForm(forms.Form):
            username = forms.CharField(max_length=10)
            password = forms.CharField(widget=forms.PasswordInput)

            def clean(self):
                data = self.cleaned_data

                return {
                    'username': data['username'].lower(),
                    'password': 'this_is_not_a_secret',
                }

        f = UserForm({'username': 'SirRobin', 'password': 'blue'})
        self.assertTrue(f.is_valid())
        self.assertEqual(f.cleaned_data['username'], 'sirrobin')

    def test_multipart_encoded_form(self):
        class FormWithoutFile(forms.Form):
            username = forms.CharField()

        class FormWithFile(forms.Form):
            username = forms.CharField()
            file = forms.FileField()

        class FormWithImage(forms.Form):
            image = forms.ImageField()

        self.assertFalse(FormWithoutFile().is_multipart())
        self.assertTrue(FormWithFile().is_multipart())
        self.assertTrue(FormWithImage().is_multipart())

    def test_html_safe(self):
        class SimpleForm(forms.Form):
            username = forms.CharField()

        form = SimpleForm()
        self.assertTrue(hasattr(SimpleForm, '__html__'))
        self.assertEqual(forms.force_text(form), form.__html__())
        self.assertTrue(hasattr(form['username'], '__html__'))
        self.assertEqual(forms.force_text(form['username']), form['username'].__html__())

    def test_use_required_attribute_true(self):
        class MyForm(forms.Form):
            use_required_attribute = True
            f1 = forms.CharField(max_length=30)
            f2 = forms.CharField(max_length=30, required=False)
            f3 = forms.CharField(widget=forms.Textarea)
            f4 = forms.ChoiceField(choices=[('P', 'Python'), ('J', 'Java')])

        form = MyForm()
        self.assertHTMLEqual(
            form.as_p(),
            '<p><label for="id_f1">F1:</label> <input id="id_f1" maxlength="30" name="f1" type="text" required /></p>'
            '<p><label for="id_f2">F2:</label> <input id="id_f2" maxlength="30" name="f2" type="text" /></p>'
            '<p><label for="id_f3">F3:</label> <textarea cols="40" id="id_f3" name="f3" rows="10" required>'
            '</textarea></p>'
            '<p><label for="id_f4">F4:</label> <select id="id_f4" name="f4">'
            '<option value="P">Python</option>'
            '<option value="J">Java</option>'
            '</select></p>',
        )

    def test_use_required_attribute_false(self):
        class MyForm(forms.Form):
            use_required_attribute = False
            f1 = forms.CharField(max_length=30)
            f2 = forms.CharField(max_length=30, required=False)
            f3 = forms.CharField(widget=forms.Textarea)
            f4 = forms.ChoiceField(choices=[('P', 'Python'), ('J', 'Java')])

        form = MyForm()
        self.assertHTMLEqual(
            form.as_p(),
            '<p><label for="id_f1">F1:</label> <input id="id_f1" maxlength="30" name="f1" type="text" /></p>'
            '<p><label for="id_f2">F2:</label> <input id="id_f2" maxlength="30" name="f2" type="text" /></p>'
            '<p><label for="id_f3">F3:</label> <textarea cols="40" id="id_f3" name="f3" rows="10">'
            '</textarea></p>'
            '<p><label for="id_f4">F4:</label> <select id="id_f4" name="f4">'
            '<option value="P">Python</option>'
            '<option value="J">Java</option>'
            '</select></p>',
        )

    def test_only_hidden_fields(self):
        class HiddenForm(forms.Form):
            data = forms.IntegerField(widget=forms.HiddenInput)

        f = HiddenForm({})
        self.assertHTMLEqual(
            f.as_p(),
            '<ul class="errorlist nonfield">'
            '<li>(Hidden field data) This field is required.</li></ul>\n<p> '
            '<input type="hidden" name="data" id="id_data" /></p>'
        )

    def test_field_named_data(self):
        class DataForm(forms.Form):
            data = forms.CharField(max_length=10)

        f = DataForm({'data': 'xyzzy'})
        self.assertTrue(f.is_valid())
        self.assertEqual(f.cleaned_data, {'data': 'xyzzy'})

class CustomRenderer(forms.renderers.DjangoTemplates):
    pass

class RendererTests(SimpleTestCase):
    def test_default(self):
        form = forms.Form()
        self.assertEqual(form.renderer, forms.get_default_renderer())

    def test_kwarg_instance(self):
        custom = CustomRenderer()
        form = forms.Form(renderer=custom)
        self.assertEqual(form.renderer, custom)

    def test_kwarg_class(self):
        custom = CustomRenderer()
        form = forms.Form(renderer=custom)
        self.assertEqual(form.renderer, custom)

    def test_attribute_instance(self):
        class CustomForm(forms.Form):
            default_renderer = forms.DjangoTemplates()

        form = CustomForm()
        self.assertEqual(form.renderer, CustomForm.default_renderer)

    def test_attribute_class(self):
        class CustomForm(forms.Form):
            default_renderer = CustomRenderer

        form = CustomForm()
        self.assertTrue(isinstance(form.renderer, CustomForm.default_renderer))

    def test_attribute_override(self):
        class CustomForm(forms.Form):
            default_renderer = forms.DjangoTemplates()

        custom = CustomRenderer()
        form = CustomForm(renderer=custom)
        self.assertEqual(form.renderer, custom)