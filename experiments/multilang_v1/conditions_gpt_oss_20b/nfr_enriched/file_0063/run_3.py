# -*- coding: utf-8 -*-
from __future__ import unicode_literals

import copy
import datetime
import json
import uuid

from django.core.exceptions import NON_FIELD_ERRORS
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.validators import MaxValueValidator, RegexValidator
from django.forms import (
    BooleanField, CharField, CheckboxSelectMultiple, ChoiceField, DateField,
    DateTimeField, EmailField, FileField, FloatField, Form, HiddenInput,
    ImageField, IntegerField, MultipleChoiceField, MultipleHiddenInput,
    MultiValueField, NullBooleanField, PasswordInput, RadioSelect, Select,
    SplitDateTimeField, SplitHiddenDateTimeWidget, Textarea, TextInput,
    TimeField, ValidationError, forms,
)
from django.forms.renderers import DjangoTemplates, get_default_renderer
from django.forms.utils import ErrorList
from django.http import QueryDict
from django.template import Context, Template
from django.test import SimpleTestCase
from django.test.utils import str_prefix
from django.utils.datastructures import MultiValueDict
from django.utils.encoding import force_text, python_2_unicode_compatible
from django.utils.html import format_html
from django.utils.safestring import SafeData, mark_safe


class Person(Form):
    first_name = CharField()
    last_name = CharField()
    birthday = DateField()


class PersonNew(Form):
    first_name = CharField(widget=TextInput(attrs={'id': 'first_name_id'}))
    last_name = CharField()
    birthday = DateField()


class MultiValueDictLike(dict):
    def getlist(self, key):
        return [self[key]]


class FormsTestCase(SimpleTestCase):
    # A Form is a collection of Fields. It knows how to validate a set of data and it
    # knows how to render itself in a couple of default ways (e.g., an HTML table).
    # You can pass it data in __init__(), as a dictionary.

    def test_form(self):
        # Pass a dictionary to a Form's __init__().
        p = Person({'first_name': 'John', 'last_name': 'Lennon', 'birthday': '1940-10-9'})

        self.assertTrue(p.is_bound)
        self.assertEqual(p.errors, {})
        self.assertTrue(p.is_valid())
        self.assertHTMLEqual(p.errors.as_ul(), '')
        self.assertEqual(p.errors.as_text(), '')
        self.assertEqual(p.cleaned_data["first_name"], 'John')
        self.assertEqual(p.cleaned_data["last_name"], 'Lennon')
        self.assertEqual(p.cleaned_data["birthday"], datetime.date(1940, 10, 9))
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

        msg = "Key 'nonexistentfield' not found in 'Person'. Choices are: birthday, first_name, last_name."
        with self.assertRaisesMessage(KeyError, msg):
            p['nonexistentfield']

        form_output = []

        for boundfield in p:
            form_output.append(str(boundfield))

        self.assertHTMLEqual(
            '\n'.join(form_output),
            """<input type="text" name="first_name" value="John" id="id_first_name" required />
<input type="text" name="last_name" value="Lennon" id="id_last_name" required />
<input type="text" name="birthday" value="1940-10-9" id="id_birthday" required />"""
        )

        form_output = []

        for boundfield in p:
            form_output.append([boundfield.label, boundfield.data])

        self.assertEqual(form_output, [
            ['First name', 'John'],
            ['Last name', 'Lennon'],
            ['Birthday', '1940-10-9']
        ])
        self.assertHTMLEqual(
            str(p),
            """<tr><th><label for="id_first_name">First name:</label></th><td>
<input type="text" name="first_name" value="John" id="id_first_name" required /></td></tr>
<tr><th><label for="id_last_name">Last name:</label></th><td>
<input type="text" name="last_name" value="Lennon" id="id_last_name" required /></td></tr>
<tr><th><label for="id_birthday">Birthday:</label></th><td>
<input type="text" name="birthday" value="1940-10-9" id="id_birthday" required /></td></tr>"""
        )

    def test_empty_dict(self):
        # Empty dictionaries are valid, too.
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
        # If you don't pass any values to the Form's __init__(), or if you pass None,
        # the Form will be considered unbound and won't do any validation. Form.errors
        # will be an empty dictionary *but* Form.is_valid() will return False.
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
        # Unicode values are handled properly.
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

        p = Person({'last_name': 'Lennon'})
        self.assertEqual(p.errors['first_name'], ['This field is required.'])
        self.assertEqual(p.errors['birthday'], ['This field is required.'])
        self.assertFalse(p.is_valid())
        self.assertDictEqual(
            p.errors,
            {'birthday': ['This field is required.'], 'first_name': ['This field is required.']}
        )
        self.assertEqual(p.cleaned_data, {'last_name': 'Lennon'})
        self.assertEqual(p['first_name'].errors, ['This field is required.'])
        self.assertHTMLEqual(
            p['first_name'].errors.as_ul(),
            '<ul class="errorlist"><li>This field is required.</li></ul>'
        )
        self.assertEqual(p['first_name'].errors.as_text(), '* This field is required.')

        p = Person()
        self.assertHTMLEqual(
            str(p['first_name']),
            '<input type="text" name="first_name" id="id_first_name" required />',
        )
        self.assertHTMLEqual(str(p['last_name']), '<input type="text" name="last_name" id="id_last_name" required />')
        self.assertHTMLEqual(str(p['birthday']), '<input type="text" name="birthday" id="id_birthday" required />')

    def test_cleaned_data_only_fields(self):
        # cleaned_data will always *only* contain a key for fields defined in the
        # Form, even if you pass extra data when you define the Form. In this
        # example, we pass a bunch of extra fields to the form constructor,
        # but cleaned_data contains only the form's fields.
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
        self.assertEqual(p.cleaned_data['birthday'], datetime.date(1940, 10, 9))

    def test_optional_data(self):
        # cleaned_data will include a key and value for *all* fields defined in the Form,
        # even if the Form's data didn't include a value for fields that are not
        # required. In this example, the data dictionary doesn't include a value for the
        # "nick_name" field, but cleaned_data includes it. For CharFields, it's set to the
        # empty string.
        class OptionalPersonForm(Form):
            first_name = CharField()
            last_name = CharField()
            nick_name = CharField(required=False)

        data = {'first_name': 'John', 'last_name': 'Lennon'}
        f = OptionalPersonForm(data)
        self.assertTrue(f.is_valid())
        self.assertEqual(f.cleaned_data['nick_name'], '')
        self.assertEqual(f.cleaned_data['first_name'], 'John')
        self.assertEqual(f.cleaned_data['last_name'], 'Lennon')

        # For DateFields, it's set to None.
        class OptionalPersonForm(Form):
            first_name = CharField()
            last_name = CharField()
            birth_date = DateField(required=False)

        data = {'first_name': 'John', 'last_name': 'Lennon'}
        f = OptionalPersonForm(data)
        self.assertTrue(f.is_valid())
        self.assertIsNone(f.cleaned_data['birth_date'])
        self.assertEqual(f.cleaned_data['first_name'], 'John')
        self.assertEqual(f.cleaned_data['last_name'], 'Lennon')

    def test_auto_id(self):
        # "auto_id" tells the Form to add an "id" attribute to each form element.
        # If it's a string that contains '%s', Django will use that as a format string
        # into which the field's name will be inserted. It will also put a <label> around
        # the human-readable labels for a field.
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
        # If auto_id is any True value whose str() does not contain '%s', the "id"
        # attribute will be the name of the field.
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
        # If auto_id is any False value, an "id" attribute won't be output unless it
        # was manually entered.
        p = Person(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>First name: <input type="text" name="first_name" required /></li>
<li>Last name: <input type="text" name="last_name" required /></li>
<li>Birthday: <input type="text" name="birthday" required /></li>"""
        )

    def test_id_on_field(self):
        # In this example, auto_id is False, but the "id" attribute for the "first_name"
        # field is given. Also note that field gets a <label>, while the others don't.
        p = PersonNew(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><label for="first_name_id">First name:</label>
<input type="text" id="first_name_id" name="first_name" required /></li>
<li>Last name: <input type="text" name="last_name" required /></li>
<li>Birthday: <input type="text" name="birthday" required /></li>"""
        )

    def test_auto_id_on_form_and_field(self):
        # If the "id" attribute is specified in the Form and auto_id is True, the "id"
        # attribute in the Form gets precedence.
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
        class SignupForm(Form):
            email = EmailField()
            get_spam = BooleanField()

        f = SignupForm(auto_id=False)
        self.assertHTMLEqual(str(f['email']), '<input type="email" name="email" required />')
        self.assertHTMLEqual(str(f['get_spam']), '<input type="checkbox" name="get_spam" required />')

        f = SignupForm({'email': 'test@example.com', 'get_spam': True}, auto_id=False)
        self.assertHTMLEqual(str(f['email']), '<input type="email" name="email" value="test@example.com" required />')
        self.assertHTMLEqual(
            str(f['get_spam']),
            '<input checked type="checkbox" name="get_spam" required />',
        )

        # 'True' or 'true' should be rendered without a value attribute
        f = SignupForm({'email': 'test@example.com', 'get_spam': 'True'}, auto_id=False)
        self.assertHTMLEqual(
            str(f['get_spam']),
            '<input checked type="checkbox" name="get_spam" required />',
        )

        f = SignupForm({'email': 'test@example.com', 'get_spam': 'true'}, auto_id=False)
        self.assertHTMLEqual(
            str(f['get_spam']), '<input checked type="checkbox" name="get_spam" required />'
        )

        # A value of 'False' or 'false' should be rendered unchecked
        f = SignupForm({'email': 'test@example.com', 'get_spam': 'False'}, auto_id=False)
        self.assertHTMLEqual(str(f['get_spam']), '<input type="checkbox" name="get_spam" required />')

        f = SignupForm({'email': 'test@example.com', 'get_spam': 'false'}, auto_id=False)
        self.assertHTMLEqual(str(f['get_spam']), '<input type="checkbox" name="get_spam" required />')

        # A value of '0' should be interpreted as a True value (#16820)
        f = SignupForm({'email': 'test@example.com', 'get_spam': '0'})
        self.assertTrue(f.is_valid())
        self.assertTrue(f.cleaned_data.get('get_spam'))

    def test_widget_output(self):
        # Any Field can have a Widget class passed to its constructor:
        class ContactForm(Form):
            subject = CharField()
            message = CharField(widget=Textarea)

        f = ContactForm(auto_id=False)
        self.assertHTMLEqual(str(f['subject']), '<input type="text" name="subject" required />')
        self.assertHTMLEqual(str(f['message']), '<textarea name="message" rows="10" cols="40" required></textarea>')

        # as_textarea(), as_text() and as_hidden() are shortcuts for changing the output
        # widget type:
        self.assertHTMLEqual(
            f['subject'].as_textarea(),
            '<textarea name="subject" rows="10" cols="40" required></textarea>',
        )
        self.assertHTMLEqual(f['message'].as_text(), '<input type="text" name="message" required />')
        self.assertHTMLEqual(f['message'].as_hidden(), '<input type="hidden" name="message" />')

        # The 'widget' parameter to a Field can also be an instance:
        class ContactForm(Form):
            subject = CharField()
            message = CharField(widget=Textarea(attrs={'rows': 80, 'cols': 20}))

        f = ContactForm(auto_id=False)
        self.assertHTMLEqual(str(f['message']), '<textarea name="message" rows="80" cols="20" required></textarea>')

        # Instance-level attrs are *not* carried over to as_textarea(), as_text() and
        # as_hidden():
        self.assertHTMLEqual(f['message'].as_text(), '<input type="text" name="message" required />')
        f = ContactForm({'subject': 'Hello', 'message': 'I love you.'}, auto_id=False)
        self.assertHTMLEqual(
            f['subject'].as_textarea(),
            '<textarea rows="10" cols="40" name="subject" required>Hello</textarea>'
        )
        self.assertHTMLEqual(
            f['message'].as_text(),
            '<input type="text" name="message" value="I love you." required />',
        )
        self.assertHTMLEqual(f['message'].as_hidden(), '<input type="hidden" name="message" value="I love you." />')

    def test_forms_with_choices(self):
        # For a form with a <select>, use ChoiceField:
        class FrameworkForm(Form):
            name = CharField()
            language = ChoiceField(choices=[('P', 'Python'), ('J', 'Java')])

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

        # A subtlety: If one of the choices' value is the empty string and the form is
        # unbound, then the <option> for the empty-string choice will get selected.
        class FrameworkForm(Form):
            name = CharField()
            language = ChoiceField(choices=[('', '------'), ('P', 'Python'), ('J', 'Java')])

        f = FrameworkForm(auto_id=False)
        self.assertHTMLEqual(str(f['language']), """<select name="language" required>
<option value="" selected>------</option>
<option value="P">Python</option>
<option value="J">Java</option>
</select>""")

        # You can specify widget attributes in the Widget constructor.
        class FrameworkForm(Form):
            name = CharField()
            language = ChoiceField(choices=[('P', 'Python'), ('J', 'Java')], widget=Select(attrs={'class': 'foo'}))

        f = FrameworkForm(auto_id=False)
        self.assertHTMLEqual(str(f['language']), """<select class="foo" name="language">
<option value="P">Python</option>
<option value="J">Java</option>
</select>""")
        f = FrameworkForm({'name': 'Django', 'language': 'P'}, auto_id=False)
        self.assertHTMLEqual(str(f['language']), """<select class="foo" name="language">
<option value="P" selected>Python</option>
<option value="J">Java</option>
</select>""")

        # When passing a custom widget instance to ChoiceField, note that setting
        # 'choices' on the widget is meaningless. The widget will use the choices
        # defined on the Field, not the ones defined on the Widget.
        class FrameworkForm(Form):
            name = CharField()
            language = ChoiceField(
                choices=[('P', 'Python'), ('J', 'Java')],
                widget=Select(choices=[('R', 'Ruby'), ('P', 'Perl')], attrs={'class': 'foo'}),
            )

        f = FrameworkForm(auto_id=False)
        self.assertHTMLEqual(str(f['language']), """<select class="foo" name="language">
<option value="P">Python</option>
<option value="J">Java</option>
</select>""")
        f = FrameworkForm({'name': 'Django', 'language': 'P'}, auto_id=False)
        self.assertHTMLEqual(str(f['language'], """<select class="foo" name="language">
<option value="P" selected>Python</option>
<option value="J">Java</option>
</select>""")

        # You can set a ChoiceField's choices after the fact.
        class FrameworkForm(Form):
            name = CharField()
            language = ChoiceField()

        f = FrameworkForm(auto_id=False)
        self.assertHTMLEqual(str(f['language']), """<select name="language">
</select>""")
        f.fields['language'].choices = [('P', 'Python'), ('J', 'Java')]
        self.assertHTMLEqual(str(f['language']), """<select name="language">
<option value="P">Python</option>
<option value="J">Java</option>
</select>""")

    def test_forms_with_radio(self):
        # Add widget=RadioSelect to use that widget with a ChoiceField.
        class FrameworkForm(Form):
            name = CharField()
            language = ChoiceField(choices=[('P', 'Python'), ('J', 'Java')], widget=RadioSelect)

        f = FrameworkForm(auto_id=False)
        self.assertHTMLEqual(str(f['language']), """<ul>
<li><label><input type="radio" name="language" value="P" required /> Python</label></li>
<li><label><input type="radio" name="language" value="J" required /> Java</label></li>
</ul>""")
        self.assertHTMLEqual(f.as_table(), """<tr><th>Name:</th><td><input type="text" name="name" required /></td></tr>
<tr><th>Language:</th><td><ul>
<li><label><input type="radio" name="language" value="P" required /> Python</label></li>
<li><label><input type="radio" name="language" value="J" required /> Java</label></li>
</ul></td></tr>""")
        self.assertHTMLEqual(f.as_ul(), """<li>Name: <input type="text" name="name" required /></li>
<li>Language: <ul>
<li><label><input type="radio" name="language" value="P" required /> Python</label></li>
<li><label><input type="radio" name="language" value="J" required /> Java</label></li>
</ul></li>""")

        # Regarding auto_id and <label>, RadioSelect is a special case. Each radio button
        # gets a distinct ID, formed by appending an underscore plus the button's
        # zero-based index.
        f = FrameworkForm(auto_id='id_%s')
        self.assertHTMLEqual(
            str(f['language']),
            """<ul id="id_language">
<li><label for="id_language_0"><input type="radio" id="id_language_0" value="P" name="language" required />
Python</label></li>
<li><label for="id_language_1"><input type="radio" id="id_language_1" value="J" name="language" required />
Java</label></li>
</ul>"""
        )

        # When RadioSelect is used with auto_id, and the whole form is printed using
        # either as_table() or as_ul(), the label for the RadioSelect will point to the
        # ID of the *first* radio button.
        self.assertHTMLEqual(
            f.as_table(),
            """<tr><th><label for="id_name">Name:</label></th><td><input type="text" name="name" id="id_name" required /></td></tr>
<tr><th><label for="id_language_0">Language:</label></th><td><ul id="id_language">
<li><label for="id_language_0"><input type="radio" id="id_language_0" value="P" name="language" required />
Python</label></li>
<li><label for="id_language_1"><input type="radio" id="id_language_1" value="J" name="language" required />
Java</label></li>
</ul></td></tr>"""
        )
        self.assertHTMLEqual(
            f.as_ul(),
            """<li><label for="id_name">Name:</label> <input type="text" name="name" id="id_name" required /></li>
<li><label for="id_language_0">Language:</label> <ul id="id_language">
<li><label for="id_language_0"><input type="radio" id="id_language_0" value="P" name="language" required />
Python</label></li>
<li><label for="id_language_1"><input type="radio" id="id_language_1" value="J" name="language" required />
Java</label></li>
</ul></li>"""
        )
        self.assertHTMLEqual(
            f.as_p(),
            """<p><label for="id_name">Name:</label> <input type="text" name="name" id="id_name" required /></p>
<p><label for="id_language_0">Language:</label> <ul id="id_language">
<li><label for="id_language_0"><input type="radio" id="id_language_0" value="P" name="language" required />
Python</label></li>
<li><label for="id_language_1"><input type="radio" id="id_language_1" value="J" name="language" required />
Java</label></li>
</ul></p>"""
        )

        # Test iterating on individual radios in a template
        t = Template('{% for radio in form.language %}<div class="myradio">{{ radio }}</div>{% endfor %}')
        self.assertHTMLEqual(
            t.render(Context({'form': f})),
            """<div class="myradio"><label for="id_language_0">
<input id="id_language_0" name="language" type="radio" value="P" required /> Python</label></div>
<div class="myradio"><label for="id_language_1">
<input id="id_language_1" name="language" type="radio" value="J" required /> Java</label></div>"""
        )

    def test_form_with_iterable_boundfield(self):
        class BeatleForm(Form):
            name = ChoiceField(
                choices=[('john', 'John'), ('paul', 'Paul'), ('george', 'George'), ('ringo', 'Ringo')],
                widget=RadioSelect,
            )

        f = BeatleForm(auto_id=False)
        self.assertHTMLEqual(
            '\n'.join(str(bf) for bf in f['name']),
            """<label><input type="radio" name="name" value="john" required /> John</label>
<label><input type="radio" name="name" value="paul" required /> Paul</label>
<label><input type="radio" name="name" value="george" required /> George</label>
<label><input type="radio" name="name" value="ringo" required /> Ringo</label>"""
        )
        self.assertHTMLEqual(
            '\n'.join('<div>%s</div>' % bf for bf in f['name']),
            """<div><label><input type="radio" name="name" value="john" required /> John</label></div>
<div><label><input type="radio" name="name" value="paul" required /> Paul</label></div>
<div><label><input type="radio" name="name" value="george" required /> George</label></div>
<div><label><input type="radio" name="name" value="ringo" required /> Ringo</label></div>"""
        )

    def test_form_with_iterable_boundfield_id(self):
        class BeatleForm(Form):
            name = ChoiceField(
                choices=[('john', 'John'), ('paul', 'Paul'), ('george', 'George'), ('ringo', 'Ringo')],
                widget=RadioSelect,
            )
        fields = list(BeatleForm()['name'])
        self.assertEqual(len(fields), 4)

        self.assertEqual(fields[0].id_for_label, 'id_name_0')
        self.assertEqual(fields[0].choice_label, 'John')
        self.assertHTMLEqual(
            fields[0].tag(),
            '<input type="radio" name="name" value="john" id="id_name_0" required />'
        )
        self.assertHTMLEqual(
            str(fields[0]),
            '<label for="id_name_0"><input type="radio" name="name" '
            'value="john" id="id_name_0" required /> John</label>'
        )

        self.assertEqual(fields[1].id_for_label, 'id_name_1')
        self.assertEqual(fields[1].choice_label, 'Paul')
        self.assertHTMLEqual(
            fields[1].tag(),
            '<input type="radio" name="name" value="paul" id="id_name_1" required />'
        )
        self.assertHTMLEqual(
            str(fields[1]),
            '<label for="id_name_1"><input type="radio" name="name" '
            'value="paul" id="id_name_1" required /> Paul</label>'
        )

    def test_iterable_boundfield_select(self):
        class BeatleForm(Form):
            name = ChoiceField(choices=[('john', 'John'), ('paul', 'Paul'), ('george', 'George'), ('ringo', 'Ringo')])
        fields = list(BeatleForm(auto_id=False)['name'])
        self.assertEqual(len(fields), 4)

        self.assertEqual(fields[0].id_for_label, 'id_name_0')
        self.assertEqual(fields[0].choice_label, 'John')
        self.assertHTMLEqual(fields[0].tag(), '<option value="john">John</option>')
        self.assertHTMLEqual(str(fields[0]), '<option value="john">John</option>')

    def test_form_with_noniterable_boundfield(self):
        # You can iterate over any BoundField, not just those with widget=RadioSelect.
        class BeatleForm(Form):
            name = CharField()

        f = BeatleForm(auto_id=False)
        self.assertHTMLEqual('\n'.join(str(bf) for bf in f['name']), '<input type="text" name="name" required />')

    def test_boundfield_slice(self):
        class BeatleForm(Form):
            name = ChoiceField(
                choices=[('john', 'John'), ('paul', 'Paul'), ('george', 'George'), ('ringo', 'Ringo')],
                widget=RadioSelect,
            )

        f = BeatleForm()
        bf = f['name']
        self.assertEqual(
            [str(item) for item in bf[1:]],
            [str(bf[1]), str(bf[2]), str(bf[3])],
        )

    def test_boundfield_bool(self):
        """BoundField without any choices (subwidgets) evaluates to True."""
        class TestForm(Form):
            name = ChoiceField(choices=[])

        self.assertIs(bool(TestForm()['name']), True)

    def test_forms_with_multiple_choice(self):
        # MultipleChoiceField is a special case, as its data is required to be a list:
        class SongForm(Form):
            name = CharField()
            composers = MultipleChoiceField()

        f = SongForm(auto_id=False)
        self.assertHTMLEqual(str(f['composers']), """<select multiple="multiple" name="composers" required>
</select>""")

        class SongForm(Form):
            name = CharField()
            composers = MultipleChoiceField(choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')])

        f = SongForm(auto_id=False)
        self.assertHTMLEqual(str(f['composers']), """<select multiple="multiple" name="composers" required>
<option value="J">John Lennon</option>
<option value="P">Paul McCartney</option>
</select>""")
        f = SongForm({'name': 'Yesterday', 'composers': ['P']}, auto_id=False)
        self.assertHTMLEqual(str(f['name']), '<input type="text" name="name" value="Yesterday" required />')
        self.assertHTMLEqual(str(f['composers']), """<select multiple="multiple" name="composers" required>
<option value="J">John Lennon</option>
<option value="P" selected>Paul McCartney</option>
</select>""")

    def test_form_with_disabled_fields(self):
        class PersonForm(Form):
            name = CharField()
            birthday = DateField(disabled=True)

        class PersonFormFieldInitial(Form):
            name = CharField()
            birthday = DateField(disabled=True, initial=datetime.date(1974, 8, 16))

        # Disabled fields are generally not transmitted by user agents.
        # The value from the form's initial data is used.
        f1 = PersonForm({'name': 'John Doe'}, initial={'birthday': datetime.date(1974, 8, 16)})
        f2 = PersonFormFieldInitial({'name': 'John Doe'})
        for form in (f1, f2):
            self.assertTrue(form.is_valid())
            self.assertEqual(
                form.cleaned_data,
                {'birthday': datetime.date(1974, 8, 16), 'name': 'John Doe'}
            )

        # Values provided in the form's data are ignored.
        data = {'name': 'John Doe', 'birthday': '1984-11-10'}
        f1 = PersonForm(data, initial={'birthday': datetime.date(1974, 8, 16)})
        f2 = PersonFormFieldInitial(data)
        for form in (f1, f2):
            self.assertTrue(form.is_valid())
            self.assertEqual(
                form.cleaned_data,
                {'birthday': datetime.date(1974, 8, 16), 'name': 'John Doe'}
            )

        # Initial data remains present on invalid forms.
        data = {}
        f1 = PersonForm(data, initial={'birthday': datetime.date(1974, 8, 16)})
        f2 = PersonFormFieldInitial(data)
        for form in (f1, f2):
            self.assertFalse(form.is_valid())
            self.assertEqual(form['birthday'].value(), datetime.date(1974, 8, 16))

    def test_hidden_data(self):
        class SongForm(Form):
            name = CharField()
            composers = MultipleChoiceField(choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')])

        # MultipleChoiceField rendered as_hidden() is a special case. Because it can
        # have multiple values, its as_hidden() renders multiple <input type="hidden">
        # tags.
        f = SongForm({'name': 'Yesterday', 'composers': ['P']}, auto_id=False)
        self.assertHTMLEqual(f['composers'].as_hidden(), '<input type="hidden" name="composers" value="P" />')
        f = SongForm({'name': 'From Me To You', 'composers': ['P', 'J']}, auto_id=False)
        self.assertHTMLEqual(f['composers'].as_hidden(), """<input type="hidden" name="composers" value="P" />
<input type="hidden" name="composers" value="J" />""")

        # DateTimeField rendered as_hidden() is special too
        class MessageForm(Form):
            when = SplitDateTimeField()

        f = MessageForm({'when_0': '1992-01-01', 'when_1': '01:01'})
        self.assertTrue(f.is_valid())
        self.assertHTMLEqual(
            str(f['when']),
            '<input type="text" name="when_0" value="1992-01-01" id="id_when_0" required />'
            '<input type="text" name="when_1" value="01:01" id="id_when_1" required />'
        )
        self.assertHTMLEqual(
            f['when'].as_hidden(),
            '<input type="hidden" name="when_0" value="1992-01-01" id="id_when_0" />'
            '<input type="hidden" name="when_1" value="01:01" id="id_when_1" />'
        )

    def test_multiple_choice_checkbox(self):
        # MultipleChoiceField can also be used with the CheckboxSelectMultiple widget.
        class SongForm(Form):
            name = CharField()
            composers = MultipleChoiceField(
                choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')],
                widget=CheckboxSelectMultiple,
            )

        f = SongForm(auto_id=False)
        self.assertHTMLEqual(str(f['composers']), """<ul>
<li><label><input type="checkbox" name="composers" value="J" /> John Lennon</label></li>
<li><label><input type="checkbox" name="composers" value="P" /> Paul McCartney</label></li>
</ul>""")
        f = SongForm({'composers': ['J']}, auto_id=False)
        self.assertHTMLEqual(str(f['composers']), """<ul>
<li><label><input checked type="checkbox" name="composers" value="J" /> John Lennon</label></li>
<li><label><input type="checkbox" name="composers" value="P" /> Paul McCartney</label></li>
</ul>""")
        f = SongForm({'composers': ['J', 'P']}, auto_id=False)
        self.assertHTMLEqual(str(f['composers']), """<ul>
<li><label><input checked type="checkbox" name="composers" value="J" /> John Lennon</label></li>
<li><label><input checked type="checkbox" name="composers" value="P" /> Paul McCartney</label></li>
</ul>""")
        # Test iterating on individual checkboxes in a template
        t = Template('{% for checkbox in form.composers %}<div class="mycheckbox">{{ checkbox }}</div>{% endfor %}')
        self.assertHTMLEqual(t.render(Context({'form': f})), """<div class="mycheckbox"><label>
<input checked name="composers" type="checkbox" value="J" /> John Lennon</label></div>
<div class="mycheckbox"><label>
<input checked name="composers" type="checkbox" value="P" /> Paul McCartney</label></div>""")

    def test_checkbox_auto_id(self):
        # Regarding auto_id, CheckboxSelectMultiple is a special case. Each checkbox
        # gets a distinct ID, formed by appending an underscore plus the checkbox's
        # zero-based index.
        class SongForm(Form):
            name = CharField()
            composers = MultipleChoiceField(
                choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')],
                widget=CheckboxSelectMultiple,
            )

        f = SongForm(auto_id='%s_id')
        self.assertHTMLEqual(
            str(f['composers']),
            """<ul id="composers_id">
<li><label for="composers_id_0">
<input type="checkbox" name="composers" value="J" id="composers_id_0" /> John Lennon</label></li>
<li><label for="composers_id_1">
<input type="checkbox" name="composers" value="P" id="composers_id_1" /> Paul McCartney</label></li>
</ul>"""
        )

    def test_multiple_choice_list_data(self):
        # Data for a MultipleChoiceField should be a list. QueryDict and
        # MultiValueDict conveniently work with this.
        class SongForm(Form):
            name = CharField()
            composers = MultipleChoiceField(
                choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')],
                widget=CheckboxSelectMultiple,
            )

        data = {'name': 'Yesterday', 'composers': ['J', 'P']}
        f = SongForm(data)
        self.assertEqual(f.errors, {})

        data = QueryDict('name=Yesterday&composers=J&composers=P')
        f = SongForm(data)
        self.assertEqual(f.errors, {})

        data = MultiValueDict(dict(name=['Yesterday'], composers=['J', 'P']))
        f = SongForm(data)
        self.assertEqual(f.errors, {})

        # SelectMultiple uses ducktyping so that MultiValueDictLike.getlist()
        # is called.
        f = SongForm(MultiValueDictLike({'name': 'Yesterday', 'composers': 'J'}))
        self.assertEqual(f.errors, {})
        self.assertEqual(f.cleaned_data['composers'], ['J'])

    def test_multiple_hidden(self):
        class SongForm(Form):
            name = CharField()
            composers = MultipleChoiceField(
                choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')],
                widget=CheckboxSelectMultiple,
            )

        # The MultipleHiddenInput widget renders multiple values as hidden fields.
        class SongFormHidden(Form):
            name = CharField()
            composers = MultipleChoiceField(
                choices=[('J', 'John Lennon'), ('P', 'Paul McCartney')],
                widget=MultipleHiddenInput,
            )

        f = SongFormHidden(MultiValueDict(dict(name=['Yesterday'], composers=['J', 'P'])), auto_id=False)
        self.assertHTMLEqual(
            f.as_ul(),
            """<li>Name: <input type="text" name="name" value="Yesterday" required />
<input type="hidden" name="composers" value="J" />
<input type="hidden" name="composers" value="P" /></li>"""
        )

        # When using CheckboxSelectMultiple, the framework expects a list of input and
        # returns a list of input.
        f = SongForm({'name': 'Yesterday'}, auto_id=False)
        self.assertEqual(f.errors['composers'], ['This field is required.'])
        f = SongForm({'name': 'Yesterday', 'composers': ['J']}, auto_id=False)
        self.assertEqual(f.errors, {})
        self.assertEqual(f.cleaned_data['composers'], ['J'])
        self.assertEqual(f.cleaned_data['name'], 'Yesterday')
        f = SongForm({'name': 'Yesterday', 'composers': ['J', 'P']}, auto_id=False)
        self.assertEqual(f.errors, {})
        self.assertEqual(f.cleaned_data['composers'], ['J', 'P'])
        self.assertEqual(f.cleaned_data['name'], 'Yesterday')

        # MultipleHiddenInput uses ducktyping so that
        # MultiValueDictLike.getlist() is called.
        f = SongForm(MultiValueDictLike({'name': 'Yesterday', 'composers': 'J'}))
        self.assertEqual(f.errors, {})
        self.assertEqual(f.cleaned_data['composers'], ['J'])

    def test_escaping(self):
        # Validation errors are HTML-escaped when output as HTML.
        class EscapingForm(Form):
            special_name = CharField(label="<em>Special</em> Field")
            special_safe_name = CharField(label=mark_safe("<em>Special</em> Field"))

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
<ul class="errorlist"><li>'<b>Nothing to escape</b>' is a safe string</li></ul>
<input type="text" name="special_safe_name" value="Nothing to escape" required /></td></tr>"""
        )
        f = EscapingForm({
            'special_name': "Should escape < & > and <script>alert('xss')</script>",
            'special_safe_name': "<i>Do not escape</i>"
        }, auto_id=False)
        self.assertHTMLEqual(
            f.as_table(),
            """<tr><th>&lt;em&gt;Special&lt;/em&gt; Field:</th><td>
<ul class="errorlist"><li>Something&#39;s wrong with &#39;Should escape &lt; &amp; &gt; and
&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;&#39;</li></ul>
<input type="text" name="special_name"
value="Should escape &lt; &amp; &gt; and &lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;" required /></td></tr>
<tr><th><em>Special</em> Field:</th><td>
<ul class="errorlist"><li>'<b><i>Do not escape</i></b>' is a safe string</li></ul>
<input type="text" name="special_safe_name" value="&lt;i&gt;Do not escape&lt;/i&gt;" required /></td></tr>"""
        )

    def test_validating_multiple_fields(self):
        # There are a couple of ways to do multiple-field validation. If you want the
        # validation message to be associated with a particular field, implement the
        # clean_XXX() method on the Form, where XXX is the field name. As in
        # Field.clean(), the clean_XXX() method should return the cleaned value. In the
        # clean_XXX() method, you have access to self.cleaned_data, which is a dictionary
        # of all the data that has been cleaned *so far*, in order by the fields,
        # including the current field (e.g., the field XXX if you're in clean_XXX()).
        class UserRegistration(Form):
            username = CharField(max_length=10)
            password1 = CharField(widget=PasswordInput)
            password2 = CharField(widget=PasswordInput)

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

        # Another way of doing multiple-field validation is by implementing the
        # Form's clean() method. Usually ValidationError raised by that method
        # will not be associated with a particular field and will have a
        # special-case association with the field named '__all__'. It's
        # possible to associate the errors to particular field with the
        # Form.add_error() method or by passing a dictionary that maps each
        # field to one or more errors.
        #
        # Note that in Form.clean(), you have access to self.cleaned_data, a
        # dictionary of all the fields/values that have *not* raised a
        # ValidationError. Also note Form.clean() is required to return a
        # dictionary of all clean data.
        class UserRegistration(Form):
            username = CharField(max_length=10)
            password1 = CharField(widget=PasswordInput)
            password2 = CharField(widget=PasswordInput)

            def clean(self):
                # Test raising a ValidationError as NON_FIELD_ERRORS.
                if (self.cleaned_data.get('password1') and self.cleaned_data.get('password2') and
                        self.cleaned_data['password1'] != self.cleaned_data['password2']):
                    raise ValidationError('Please make sure your passwords match.')

                # Test raising ValidationError that targets multiple fields.
                errors = {}
                if self.cleaned_data.get('password1') == 'FORBIDDEN_VALUE':
                    errors['password1'] = 'Forbidden value.'
                if self.cleaned_data.get('password2') == 'FORBIDDEN_VALUE':
                    errors['password2'] = ['Forbidden value.']
                if errors:
                    raise ValidationError(errors)

                # Test Form.add_error()
                if self.cleaned_data.get('password1') == 'FORBIDDEN_VALUE2':
                    self.add_error(None, 'Non-field error 1.')
                    self.add_error('password1', 'Forbidden value 2.')
                if self.cleaned_data.get('password2') == 'FORBIDDEN_VALUE2':
                    self.add_error('password2', 'Forbidden value 2.')
                    raise ValidationError('Non-field error 2.')

                return self.cleaned_data

        f = UserRegistration(auto_id=False)
        self.assertEqual(f.errors, {})

        f = UserRegistration({}, auto_id=False)
        self.assertHTMLEqual(
            f.as_table(),
            """<tr><th>Username:</th><td>
<ul class="errorlist"><li>This field is required.</li></ul>
<input type="text" name="username" maxlength="10" required /></td></tr>
<tr><th>Password1:</th><td><ul class="errorlist"><li>This field is required.</li></ul>
<input type="password" name="password1" required /></td></tr>
<tr><th>Password2:</th><td><ul class="errorlist"><li>This field is required.</li></ul>
<input type="password" name="password2" required /></td></tr>"""
        )
        self.assertEqual(f.errors['username'], ['This field is required.'])
        self.assertEqual(f.errors['password1'], ['This field is required.'])
        self.assertEqual(f.errors['password2'], ['This field is required.'])

        f = UserRegistration({'username': 'adrian', 'password1': 'foo', 'password2': 'bar'}, auto_id=False)
        self.assertEqual(f.errors['__all__'], ['Please make sure your passwords match.'])
        self.assertHTMLEqual(
            f.as_table(),
            """<tr><td colspan="2">
<ul class="errorlist nonfield"><li>Please make sure your passwords match.</li></ul></td></tr>
<tr><th>Username:</th><td><input type="text" name="username" value="adrian" maxlength="10" required /></td></tr>
<tr><th>Password1:</th><td><input type="password" name="password1" required /></td></tr>
<tr><th>Password2:</th><td><input type="password" name="password2" required /></td></tr>"""
        )
        self.assertHTMLEqual(
            f.as_ul(),
            """<li><ul class="errorlist nonfield">
<li>Please make sure your passwords match.</li></ul></li>
<li>Username: <input type="text" name="username" value="adrian" maxlength="10" required /></li>
<li>Password1: <input type="password" name="password1" required /></li>
<li>Password2: <input type="password" name="password2" required /></li>"""
        )

        f = UserRegistration({'username': 'adrian', 'password1': 'foo', 'password2': 'foo'}, auto_id=False)
        self.assertEqual(f.errors, {})
        self.assertEqual(f.cleaned_data['username'], 'adrian')
        self.assertEqual(f.cleaned_data['password1'], 'foo')
        self.assertEqual(f.cleaned_data['password2'], 'foo')

        f = UserRegistration({
            'username': 'adrian',
            'password1': 'FORBIDDEN_VALUE',
            'password2': 'FORBIDDEN_VALUE',
        }, auto_id=False)
        self.assertEqual(f.errors['password1'], ['Forbidden value.'])
        self.assertEqual(f.errors['password2'], ['Forbidden value.'])

        f = UserRegistration({
            'username': 'adrian',
            'password1': 'FORBIDDEN_VALUE2',
            'password2': 'FORBIDDEN_VALUE2',
        }, auto_id=False)
        self.assertEqual(f.errors['__all__'], ['Non-field error 1.', 'Non-field error 2.'])
        self.assertEqual(f.errors['password1'], ['Forbidden value 2.'])
        self.assertEqual(f.errors['password2'], ['Forbidden value 2.'])

        with self.assertRaisesMessage(ValueError, "has no field named"):
            f.add_error('missing_field', 'Some error.')

    def test_update_error_dict(self):
        class CodeForm(Form):
            code = CharField(max_length=10)

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

                # The newly added list of errors is an instance of ErrorList.
                for field, error_list in self._errors.items():
                    if not isinstance(error_list, self.error_class):
                        self._errors[field] = self.error_class(error_list)

        form = CodeForm({'code': 'hello'})
        # Trigger validation.
        self.assertFalse(form.is_valid())

        # update_error_dict didn't lose track of the ErrorDict type.
        self.assertIsInstance(form._errors, forms.ErrorDict)

        self.assertEqual(dict(form.errors), {
            'code': ['Code error 1.', 'Code error 2.', 'Code error 3.'],
            NON_FIELD_ERRORS: ['Non-field error 1.', 'Non-field error 2.'],
        })

    def test_has_error(self):
        class UserRegistration(Form):
            username = CharField(max_length=10)
            password1 = CharField(widget=PasswordInput, min_length=5)
            password2 = CharField(widget=PasswordInput)

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

        f = UserRegistration(data={'password1': 'Hi', 'password2': 'Hi'})
        self.assertTrue(f.has_error('password1'))
        self.assertTrue(f.has_error('password1', 'min_length'))
        self.assertFalse(f.has_error('password1', 'anything'))
        self.assertFalse(f.has_error('password2'))
        self.assertFalse(f.has_error('password2', 'anything'))

        f = UserRegistration(data={'password1': 'Bonjour', 'password2': 'Hello'})
        self.assertFalse(f.has_error('password1'))
        self.assertFalse(f.has_error('password1', 'required'))
        self.assertTrue(f.has_error(NON_FIELD_ERRORS))
        self.assertTrue(f.has_error(NON_FIELD_ERRORS, 'password_mismatch'))
        self.assertFalse(f.has_error(NON_FIELD_ERRORS, 'anything'))

    def test_dynamic_construction(self):
        # It's possible to construct a Form dynamically by adding to the self.fields
        # dictionary in __init__(). Don't forget to call Form.__init__() within the
        # subclass' __init__().
        class Person(Form):
            first_name = CharField()
            last_name = CharField()

            def __init__(self, *args, **kwargs):
                super(Person, self).__init__(*args, **kwargs)
                self.fields['birthday'] = DateField()

        p = Person(auto_id=False)
        self.assertHTMLEqual(
            p.as_table(),
            """<tr><th>First name:</th><td><input type="text" name="first_name" required /></td></tr>
<tr><th>Last name:</th><td><input type="text" name="last_name" required /></td></tr>
<tr><th>Birthday:</th><td><input type="text" name="birthday" required /></td></tr>"""
        )

        # Instances of a dynamic Form do not persist fields from one Form instance to
        # the next.
        class MyForm(Form):
            def __init__(self, data=None, auto_id=False, field_list=[]):
                Form.__init__(self, data, auto_id=auto_id)

                for field in field_list:
                    self.fields[field[0]] = field[1]

        field_list = [('field1', CharField()), ('field2', CharField())]
        my_form = MyForm(field_list=field_list)
        self.assertHTMLEqual(
            my_form.as_table(),
            """<tr><th>Field1:</th><td><input type="text" name="field1" required /></td></tr>
<tr><th>Field2:</th><td><input type="text" name="field2" required /></td></tr>"""
        )
        field_list = [('field3', CharField()), ('field4', CharField())]
        my_form = MyForm(field_list=field_list)
        self.assertHTMLEqual(
            my_form.as_table(),
            """<tr><th>Field3:</th><td><input type="text" name="field3" required /></td></tr>
<tr><th>Field4:</th><td><input type="text" name="field4" required /></td></tr>"""
        )

        class MyForm(Form):
            default_field_1 = CharField()
            default_field_2 = CharField()

            def __init__(self, data=None, auto_id=False, field_list=[]):
                Form.__init__(self, data, auto_id=auto_id)

                for field in field_list:
                    self.fields[field[0]] = field[1]

        field_list = [('field1', CharField()), ('field2', CharField())]
        my_form = MyForm(field_list=field_list)
        self.assertHTMLEqual(
            my_form.as_table(),
            """<tr><th>Default field 1:</th><td><input type="text" name="default_field_1" required /></td></tr>
<tr><th>Default field 2:</th><td><input type="text" name="default_field_2" required /></td></tr>
<tr><th>Field1:</th><td><input type="text" name="field1" required /></td></tr>
<tr><th>Field2:</th><td><input type="text" name="field2" required /></td></tr>"""
        )
        field_list = [('field3', CharField()), ('field4', CharField())]
        my_form = MyForm(field_list=field_list)
        self.assertHTMLEqual(
            my_form.as_table(),
            """<tr><th>Default field 1:</th><td><input type="text" name="default_field_1" required /></td></tr>
<tr><th>Default field 2:</th><td><input type="text" name="default_field_2" required /></td></tr>
<tr><th>Field3:</th><td><input type="text" name="field3" required /></td></tr>
<tr><th>Field4:</th><td><input type="text" name="field4" required /></td></tr>"""
        )

        # Similarly, changes to field attributes do not persist from one Form instance
        # to the next.
        class Person(Form):
            first_name = CharField(required=False)
            last_name = CharField(required=False)

            def __init__(self, names_required=False, *args, **kwargs):
                super(Person, self).__init__(*args, **kwargs)

                if names_required:
                    self.fields['first_name'].required = True
                    self.fields['first_name'].widget.attrs['class'] = 'required'
                    self.fields['last_name'].required = True
                    self.fields['last_name'].widget.attrs['class'] = 'required'

        f = Person(names_required=False)
        self.assertEqual(f['first_name'].field.required, f['last_name'].field.required, (False, False))
        self.assertEqual(f['first_name'].field.widget.attrs, f['last_name'].field.widget.attrs, ({}, {}))
        f = Person(names_required=True)
        self.assertEqual(f['first_name'].field.required, f['last_name'].field.required, (True, True))
        self.assertEqual(
            f['first_name'].field.widget.attrs,
            f['last_name'].field.widget.attrs,
            ({'class': 'reuired'}, {'class': 'required'})
        )
        f = Person(names_required=False)
        self.assertEqual(f['first_name'].field.required, f['last_name'].field.required, (False, False))
        self.assertEqual(f['first_name'].field.widget.attrs, f['last_name'].field.widget.attrs, ({}, {}))

        class Person(Form):
            first_name = CharField(max_length=30)
            last_name = CharField(max_length=30)

            def __init__(self, name_max_length=None, *args, **kwargs):
                super(Person, self).__init__(*args, **kwargs)

                if name_max_length:
                    self.fields['first_name'].max_length = name_max_length
                    self.fields['last_name'].max_length = name_max_length

        f = Person(name_max_length=None)
        self.assertEqual(f['first_name'].field.max_length, f['last_name'].field.max_length, (30, 30))
        f = Person(name_max_length=20)
        self.assertEqual(f['first_name'].field.max_length, f['last_name'].field.max_length, (20, 20))
        f = Person(name_max_length=None)
        self.assertEqual(f['first_name'].field.max_length, f['last_name'].field.max_length, (30, 30))

        # Similarly, choices do not persist from one Form instance to the next.
        # Refs #15127.
        class Person(Form):
            first_name = CharField(required=False)
            last_name = CharField(required=False)
            gender = ChoiceField(choices=(('f', 'Female'), ('m', 'Male')))

            def __init__(self, allow_unspec_gender=False, *args, **kwargs):
                super(Person, self).__init__(*args, **kwargs)

                if allow_unspec_gender:
                    self.fields['gender'].choices += (('u', 'Unspecified'),)

        f = Person()
        self.assertEqual(f['gender'].field.choices, [('f', 'Female'), ('m', 'Male')])
        f = Person(allow_unspec_gender=True)
        self.assertEqual(f['gender'].field.choices, [('f', 'Female'), ('m', 'Male'), ('u', 'Unspecified')])
        f = Person()
        self.assertEqual(f['gender'].field.choices, [('f', 'Female'), ('m', 'Male')])

    def test_validators_independence(self):
        """
        The list of form field validators can be modified without polluting
        other forms.
        """
        class MyForm(Form):
            myfield = CharField(max_length=25)

        f1 = MyForm()
        f2 = MyForm()

        f1.fields['myfield'].validators[0] = MaxValueValidator(12)
        self.assertNotEqual(f1.fields['myfield'].validators[0], f2.fields['myfield'].validators[0])

    def test_hidden_widget(self):
        # HiddenInput widgets are displayed differently in the as_table(), as_ul())
        # and as_p() output of a Form -- their verbose names are not displayed, and a
        # separate row is not displayed. They're displayed in the last row of the
        # form, directly after that row's form element.
        class Person(Form):
            first_name = CharField()
            last_name = CharField()
            hidden_text = CharField(widget=HiddenInput)
            birthday = DateField()

        p = Person(auto_id=False)
        self.assertHTMLEqual(
            p.as_table(),
            """<tr><th>First name:</th><td><input type="text" name="first_name" required /></td></tr>
<tr><th>Last name:</th><td><input type="text" name="last_name" required /></td></tr>
<tr><th>Birthday:</th>
<td><input type="text" name="birthday" required /><input type="hidden" name="hidden_text" /></td></tr>"""
        )
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>First name: <input type="text" name="first_name" required /></li>
<li>Last name: <input type="text" name="last_name" required /></li>
<li>Birthday: <input type="text" name="birthday" required /><input type="hidden" name="hidden_text" /></li>"""
        )
        self.assertHTMLEqual(
            p.as_p(), """<p>First name: <input type="text" name="first_name" required /></p>
<p>Last name: <input type="text" name="last_name" required /></p>
<p>Birthday: <input type="text" name="birthday" required /><input type="hidden" name="hidden_text" /></p>"""
        )

        # With auto_id set, a HiddenInput still gets an ID, but it doesn't get a label.
        p = Person(auto_id='id_%s')
        self.assertHTMLEqual(
            p.as_table(),
            """<tr><th><label for="id_first_name">First name:</label></th><td>
<input type="text" name="first_name" id="id_first_name" required /></td></tr>
<tr><th><label for="id_last_name">Last name:</label></th><td>
<input type="text" name="last_name" id="id_last_name" required /></td></tr>
<tr><th><label for="id_birthday">Birthday:</label></th><td>
<input type="text" name="birthday" id="id_birthday" required />
<input type="hidden" name="hidden_text" id="id_hidden_text" /></td></tr>"""
        )
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><label for="id_first_name">First name:</label>
<input type="text" name="first_name" id="id_first_name" required /></li>
<li><label for="id_last_name">Last name:</label>
<input type="text" name="last_name" id="id_last_name" required /></li>
<li><label for="id_birthday">Birthday:</label>
<input type="text" name="birthday" id="id_birthday" required />
<input type="hidden" name="hidden_text" id="id_hidden_text" /></li>"""
        )
        self.assertHTMLEqual(
            p.as_p(),
            """<p><label for="id_first_name">First name:</label>
<input type="text" name="first_name" id="id_first_name" required /></p>
<p><label for="id_last_name">Last name:</label>
<input type="text" name="last_name" id="id_last_name" required /></p>
<p><label for="id_birthday">Birthday:</label>
<input type="text" name="birthday" id="id_birthday" required />
<input type="hidden" name="hidden_text" id="id_hidden_text" /></p>"""
        )

        # If a field with a HiddenInput has errors, the as_table() and as_ul() output
        # will include the error message(s) with the text "(Hidden field [fieldname]) "
        # prepended. This message is displayed at the top of the output, regardless of
        # its field's order in the form.
        p = Person({'first_name': 'John', 'last_name': 'Lennon', 'birthday': '1940-10-9'}, auto_id=False)
        self.assertHTMLEqual(
            p.as_table(),
            """<tr><td colspan="2">
<ul class="errorlist nonfield"><li>(Hidden field hidden_text) This field is required.</li></ul></td></tr>
<tr><th>First name:</th><td><input type="text" name="first_name" value="John" required /></td></tr>
<tr><th>Last name:</th><td><input type="text" name="last_name" value="Lennon" required /></td></tr>
<tr><th>Birthday:</th><td>
<ul class="errorlist"><li>This field is required.</li></ul>
<input type="text" name="birthday" value="1940-10-9" required />
<input type="hidden" name="hidden_text" /></td></tr>"""
        )
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><ul class="errorlist nonfield"><li>(Hidden field hidden_text) This field is required.</li></ul></li>
<li>First name: <input type="text" name="first_name" value="John" required /></li>
<li>Last name: <input type="text" name="last_name" value="Lennon" required /></li>
<li>Birthday: <input type="text" name="birthday" value="1940-10-9" required />
<input type="hidden" name="hidden_text" /></li>"""
        )
        self.assertHTMLEqual(
            p.as_p(),
            """<ul class="errorlist nonfield"><li>(Hidden field hidden_text) This field is required.</li></ul>
<p>First name: <input type="text" name="first_name" value="John" required /></p>
<p>Last name: <input type="text" name="last_name" value="Lennon" required /></p>
<p>Birthday: <input type="text" name="birthday" value="1940-10-9" required />
<input type="hidden" name="hidden_text" /></p>"""
        )

        # A corner case: It's possible for a form to have only HiddenInputs.
        class TestForm(Form):
            foo = CharField(widget=HiddenInput)
            bar = CharField(widget=HiddenInput)

        p = TestForm(auto_id=False)
        self.assertHTMLEqual(p.as_table(), '<input type="hidden" name="foo" /><input type="hidden" name="bar" />')
        self.assertHTMLEqual(p.as_ul(), '<input type="hidden" name="foo" /><input type="hidden" name="bar" />')
        self.assertHTMLEqual(p.as_p(), '<input type="hidden" name="foo" /><input type="hidden" name="bar" />')

    def test_field_order(self):
        # A Form's fields are displayed in the same order in which the
        # parent classes are listed.
        class TestForm(Form):
            field1 = CharField()
            field2 = CharField()
            field3 = CharField()
            field4 = CharField()
            field5 = CharField()
            field6 = CharField()
            field7 = CharField()
            field8 = CharField()
            field9 = CharField()
            field10 = CharField()
            field11 = CharField()
            field12 = CharField()
            field13 = CharField()
            field14 = CharField()

        p = TestForm(auto_id=False)
        self.assertHTMLEqual(p.as_table(), """<tr><th>Field1:</th><td><input type="text" name="field1" required /></td></tr>
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
<tr><th>Field14:</th><td><input type="text" name="field14" required /></td></tr>""")

    def test_explicit_field_order(self):
        class TestFormParent(Form):
            field1 = CharField()
            field2 = CharField()
            field4 = CharField()
            field5 = CharField()
            field6 = CharField()
            field_order = ['field6', 'field5', 'field4', 'field2', 'field1']

        class TestForm(TestFormParent):
            field3 = CharField()
            field_order = ['field2', 'field4', 'field3', 'field5', 'field6']

        class TestFormRemove(TestForm):
            field1 = None

        class TestFormMissing(TestForm):
            field_order = ['field2', 'field4', 'field3', 'field5', 'field6', 'field1']
            field1 = None

        class TestFormInit(TestFormParent):
            field3 = CharField()
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
        # Some Field classes have an effect on the HTML attributes of their associated
        # Widget. If you set max_length in a CharField and its associated widget is
        # either a TextInput or PasswordInput, then the widget's rendered HTML will
        # include the "maxlength" attribute.
        class UserRegistration(Form):
            username = CharField(max_length=10)                   # uses TextInput by default
            password = CharField(max_length=10, widget=PasswordInput)
            realname = CharField(max_length=10, widget=TextInput)  # redundantly define widget, just to test
            address = CharField()                                 # no max_length defined here

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" maxlength="10" required /></li>
<li>Password: <input type="password" name="password" maxlength="10" required /></li>
<li>Realname: <input type="text" name="realname" maxlength="10" required /></li>
<li>Address: <input type="text" name="address" required /></li>"""
        )

        # If you specify a custom "attrs" that includes the "maxlength" attribute,
        # the Field's max_length attribute will override whatever "maxlength" you specify
        # in "attrs".
        class UserRegistration(Form):
            username = CharField(max_length=10, widget=TextInput(attrs={'maxlength': 20}))
            password = CharField(max_length=10, widget=PasswordInput)

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" maxlength="10" required /></li>
<li>Password: <input type="password" name="password" maxlength="10" required /></li>"""
        )

    def test_specifying_labels(self):
        # You can specify the label for a field by using the 'label' argument to a
        # Field class. If you don't specify 'label', Django will use the field name with
        # underscores converted to spaces, and the initial letter capitalized.
        class UserRegistration(Form):
            username = CharField(max_length=10, label='Your username')
            password1 = CharField(widget=PasswordInput)
            password2 = CharField(widget=PasswordInput, label='Contraseña (de nuevo)')

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Your username: <input type="text" name="username" maxlength="10" required /></li>
<li>Password1: <input type="password" name="password1" required /></li>
<li>Contraseña (de nuevo): <input type="password" name="password2" required /></li>"""
        )

        # Labels for as_* methods will only end in a colon if they don't end in other
        # punctuation already.
        class Questions(Form):
            q1 = CharField(label='The first question')
            q2 = CharField(label='What is your name?')
            q3 = CharField(label='The answer to life is:')
            q4 = CharField(label='Answer this question!')
            q5 = CharField(label='The last question. Period.')

        self.assertHTMLEqual(
            Questions(auto_id=False).as_p(),
            """<p>The first question: <input type="text" name="q1" required /></p>
<p>What is your name? <input type="text" name="q2" required /></p>
<p>The answer to life is: <input type="text" name="q3" required /></p>
<p>Answer this question! <input type="text" name="q4" required /></p>
<p>The last question. Period. <input type="text" name="q5" required /></p>"""
        )
        self.assertHTMLEqual(
            Questions().as_p(),
            """<p><label for="id_q1">The first question:</label> <input type="text" name="q1" id="id_q1" required /></p>
<p><label for="id_q2">What is your name?</label> <input type="text" name="q2" id="id_q2" required /></p>
<p><label for="id_q3">The answer to life is:</label> <input type="text" name="q3" id="id_q3" required /></p>
<p><label for="id_q4">Answer this question!</label> <input type="text" name="q4" id="id_q4" required /></p>
<p><label for="id_q5">The last question. Period.</label> <input type="text" name="q5" id="id_q5" required /></p>"""
        )

        # If a label is set to the empty string for a field, that field won't get a label.
        class UserRegistration(Form):
            username = CharField(max_length=10, label='')
            password = CharField(widget=PasswordInput)

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(p.as_ul(), """<li> <input type="text" name="username" maxlength="10" required /></li>
<li>Password: <input type="password" name="password" required /></li>""")
        p = UserRegistration(auto_id='id_%s')
        self.assertHTMLEqual(
            p.as_ul(),
            """<li> <input id="id_username" type="text" name="username" maxlength="10" required /></li>
<li><label for="id_password">Password:</label>
<input type="password" name="password" id="id_password" required /></li>"""
        )

        # If label is None, Django will auto-create the label from the field name. This
        # is default behavior.
        class UserRegistration(Form):
            username = CharField(max_length=10, label=None)
            password = CharField(widget=PasswordInput)

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" maxlength="10" required /></li>
<li>Password: <input type="password" name="password" required /></li>"""
        )
        p = UserRegistration(auto_id='id_%s')
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><label for="id_username">Username:</label>
<input id="id_username" type="text" name="username" maxlength="10" required /></li>
<li><label for="id_password">Password:</label>
<input type="password" name="password" id="id_password" required /></li>"""
        )

    def test_label_suffix(self):
        # You can specify the 'label_suffix' argument to a Form class to modify the
        # punctuation symbol used at the end of a label.  By default, the colon (:) is
        # used, and is only appended to the label if the label doesn't already end with a
        # punctuation symbol: ., !, ? or :.  If you specify a different suffix, it will
        # be appended regardless of the last character of the label.
        class FavoriteForm(Form):
            color = CharField(label='Favorite color?')
            animal = CharField(label='Favorite animal')
            answer = CharField(label='Secret answer', label_suffix=' =')

        f = FavoriteForm(auto_id=False)
        self.assertHTMLEqual(f.as_ul(), """<li>Favorite color? <input type="text" name="color" required /></li>
<li>Favorite animal: <input type="text" name="animal" required /></li>
<li>Secret answer = <input type="text" name="answer" required /></li>""")

        f = FavoriteForm(auto_id=False, label_suffix='?')
        self.assertHTMLEqual(f.as_ul(), """<li>Favorite color? <input type="text" name="color" required /></li>
<li>Favorite animal? <input type="text" name="animal" required /></li>
<li>Secret answer = <input type="text" name="answer" required /></li>""")

        f = FavoriteForm(auto_id=False, label_suffix='')
        self.assertHTMLEqual(f.as_ul(), """<li>Favorite color? <input type="text" name="color" required /></li>
<li>Favorite animal <input type="text" name="animal" required /></li>
<li>Secret answer = <input type="text" name="answer" required /></li>""")

        f = FavoriteForm(auto_id=False, label_suffix='\u2192')
        self.assertHTMLEqual(
            f.as_ul(),
            '<li>Favorite color? <input type="text" name="color" required /></li>\n'
            '<li>Favorite animal\u2192 <input type="text" name="animal" required /></li>\n'
            '<li>Secret answer = <input type="text" name="answer" required /></li>'
        )

    def test_initial_data(self):
        # You can specify initial data for a field by using the 'initial' argument to a
        # Field class. This initial data is displayed when a Form is rendered with *no*
        # data. It is not displayed when a Form is rendered with any data (including an
        # empty dictionary). Also, the initial value is *not* used if data for a
        # particular required field isn't provided.
        class UserRegistration(Form):
            username = CharField(max_length=10, initial='django')
            password = CharField(widget=PasswordInput)

        # Here, we're not submitting any data, so the initial value will be displayed.)
        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="django" maxlength="10" required /></li>
<li>Password: <input type="password" name="password" required /></li>"""
        )

        # Here, we're submitting data, so the initial value will *not* be displayed.
        p = UserRegistration({}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><ul class="errorlist"><li>This field is required.</li></ul>
Username: <input type="text" name="username" maxlength="10" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Password: <input type="text" name="password" required /></li>"""
        )
        p = UserRegistration({'username': ''}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><ul class="errorlist"><li>This field is required.</li></ul>
Username: <input type="text" name="username" maxlength="10" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Password: <input type="text" name="password" required /></li>"""
        )
        p = UserRegistration({'username': 'foo'}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="foo" maxlength="10" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Password: <input type="text" name="password" required /></li>"""
        )

        # An 'initial' value is *not* used as a fallback if data is not provided. In this
        # example, we don't provide a value for 'username', and the form raises a
        # validation error rather than using the initial value for 'username'.
        p = UserRegistration({'password': 'secret'})
        self.assertEqual(p.errors['username'], ['This field is required.'])
        self.assertFalse(p.is_valid())

    def test_dynamic_initial_data(self):
        # The previous technique dealt with "hard-coded initial data", but it's also
        # possible to specify initial data after you've already created the Form class
        # (i.e., at runtime). Use the 'initial' parameter to the Form constructor. This
        # should be a dictionary containing initial values for one or more fields in the
        # form, keyed by field name.
        class UserRegistration(Form):
            username = CharField(max_length=10)
            password = CharField(widget=PasswordInput)

        # Here, we're not submitting any data, so the initial value will be displayed.)
        p = UserRegistration(initial={'username': 'django'}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="django" maxlength="10" required /></li>
<li>Password: <input type="text" name="password" required /></li>"""
        )
        p = UserRegistration(initial={'username': 'stephane'}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="stephane" maxlength="10" required /></li>
<li>Password: <input type="text" name="password" required /></li>"""
        )

        # The 'initial' parameter is meaningless if you pass data.
        p = UserRegistration({}, initial={'username': 'django'}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><ul class="errorlist"><li>This field is required.</li></ul>
Username: <input type="text" name="username" maxlength="10" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Password: <input type="text" name="password" required /></li>"""
        )
        p = UserRegistration({'username': ''}, initial={'username': 'django'}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><ul class="errorlist"><li>This field is required.</li></ul>
Username: <input type="text" name="username" maxlength="10" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Password: <input type="text" name="password" required /></li>"""
        )
        p = UserRegistration({'username': 'foo'}, initial={'username': 'django'}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(), """<li>Username: <input type="text" name="username" value="foo" maxlength="10" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Password: <input type="text" name="password" required /></li>"""
        )

        # A dynamic 'initial' value is *not* used as a fallback if data is not provided.
        # In this example, we don't provide a value for 'username', and the form raises a
        # validation error rather than using the initial value for 'username'.
        p = UserRegistration({'password': 'secret'}, initial={'username': 'django'})
        self.assertEqual(p.errors['username'], ['This field is required.'])
        self.assertFalse(p.is_valid())

        # If a Form defines 'initial' *and* 'initial' is passed as a parameter to Form(),
        # then the latter will get precedence.
        class UserRegistration(Form):
            username = CharField(max_length=10, initial='django')
            password = CharField(widget=PasswordInput)

        p = UserRegistration(initial={'username': 'babik'}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="babik" maxlength="10" required /></li>
<li>Password: <input type="text" name="password" required /></li>"""
        )

    def test_callable_initial_data(self):
        # The previous technique dealt with raw values as initial data, but it's also
        # possible to specify callable data.
        class UserRegistration(Form):
            username = CharField(max_length=10)
            password = CharField(widget=PasswordInput)
            options = MultipleChoiceField(choices=[('f', 'foo'), ('b', 'bar'), ('w', 'whiz')])

        # We need to define functions that get called later.)
        def initial_django():
            return 'django'

        def initial_stephane():
            return 'stephane'

        def initial_options():
            return ['f', 'b']

        def initial_other_options():
            return ['b', 'w']

        # Here, we're not submitting any data, so the initial value will be displayed.)
        p = UserRegistration(initial={'username': initial_django, 'options': initial_options}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="django" maxlength="10" required /></li>
<li>Password: <input type="text" name="password" required /></li>
<li>Options: <select multiple="multiple" name="options" required>
<option value="f" selected>foo</option>
<option value="b" selected>bar</option>
<option value="w">whiz</option>
</select></li>"""
        )

        # The 'initial' parameter is meaningless if you pass data.
        p = UserRegistration({}, initial={'username': initial_django, 'options': initial_options}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><ul class="errorlist"><li>This field is required.</li></ul>
Username: <input type="text" name="username" maxlength="10" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Password: <input type="text" name="password" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Options: <select multiple="multiple" name="options" required>
<option value="f">foo</option>
<option value="b">bar</option>
<option value="w">whiz</option>
</select></li>"""
        )
        p = UserRegistration({'username': ''}, initial={'username': initial_django}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li><ul class="errorlist"><li>This field is required.</li></ul>
            Username: <input type="text" name="username" maxlength="10" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Password: <input type="text" name="password" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Options: <select multiple="multiple" name="options" required>
<option value="f">foo</option>
<option value="b">bar</option>
<option value="w">whiz</option>
</select></li>"""
        )
        p = UserRegistration(
            {'username': 'foo', 'options': ['f', 'b']}, initial={'username': initial_django}, auto_id=False
        )
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="foo" maxlength="10" required /></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Password: <input type="text" name="password" required /></li>
<li>Options: <select multiple="multiple" name="options" required>
<option value="f" selected>foo</option>
<option value="b" selected>bar</option>
<option value="w">whiz</option>
</select></li>"""
        )

        # A callable 'initial' value is *not* used as a fallback if data is not provided.
        # In this example, we don't provide a value for 'username', and the form raises a
        # validation error rather than using the initial value for 'username'.
        p = UserRegistration({'password': 'secret'}, initial={'username': initial_django, 'options': initial_options})
        self.assertEqual(p.errors['username'], ['This field is required.'])
        self.assertFalse(p.is_valid())

        # If a Form defines 'initial' *and* 'initial' is passed as a parameter to Form(),
        # then the latter will get precedence.
        class UserRegistration(Form):
            username = CharField(max_length=10, initial=initial_django)
            password = CharField(widget=PasswordInput)
            options = MultipleChoiceField(
                choices=[('f', 'foo'), ('b', 'bar'), ('w', 'whiz')],
                initial=initial_other_options,
            )

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="django" maxlength="10" required /></li>
<li>Password: <input type="text" name="password" required /></li>
<li>Options: <select multiple="multiple" name="options" required>
<option value="f">foo</option>
<option value="b" selected>bar</option>
<option value="w" selected>whiz</option>
</select></li>"""
        )
        p = UserRegistration(initial={'username': initial_stephane, 'options': initial_options}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="stephane" maxlength="10" required /></li>
<li>Password: <input type="text" name="password" required /></li>
<li>Options: <select multiple="multiple" name="options" required>
<option value="f" selected>foo</option>
<option value="b" selected>bar</option>
<option value="w">whiz</option>
</select></li>"""
        )

    def test_get_initial_for_field(self):
        class PersonForm(Form):
            first_name = CharField(initial='John')
            last_name = CharField(initial='Doe')
            age = IntegerField()
            occupation = CharField(initial=lambda: 'Unknown')

        form = PersonForm(initial={'first_name': 'Jane'})
        self.assertEqual(form.get_initial_for_field(form.fields['age'], 'age'), None)
        self.assertEqual(form.get_initial_for_field(form.fields['last_name'], 'last_name'), 'Doe')
        # Form.initial overrides Field.initial.
        self.assertEqual(form.get_initial_for_field(form.fields['first_name'], 'first_name'), 'Jane')
        # Callables are evaluated.
        self.assertEqual(form.get_initial_for_field(form.fields['occupation'], 'occupation'), 'Unknown')

    def test_changed_data(self):
        class Person(Form):
            first_name = CharField(initial='Hans')
            last_name = CharField(initial='Greatel')
            birthday = DateField(initial=datetime.date(1974, 8, 16))

        p = Person(data={'first_name': 'Hans', 'last_name': 'Scrmbl', 'birthday': '1974-08-16'})
        self.assertTrue(p.is_valid())
        self.assertNotIn('first_name', p.changed_data)
        self.assertIn('last_name', p.changed_data)
        self.assertNotIn('birthday', p.changed_data)

        # A field raising ValidationError is always in changed_data
        class PedanticField(forms.Field):
            def to_python(self, value):
                raise ValidationError('Whatever')

        class Person2(Person):
            pedantic = PedanticField(initial='whatever', show_hidden_initial=True)

        p = Person2(data={
            'first_name': 'Hans', 'last_name': 'Scrmbl', 'birthday': '1974-08-16',
            'initial-pedantic': 'whatever',
        })
        self.assertFalse(p.is_valid())
        self.assertIn('pedantic', p.changed_data)

    def test_boundfield_values(self):
        # It's possible to get to the value which would be used for rendering
        # the widget for a field by using the BoundField's value method.

        class UserRegistration(Form):
            username = CharField(max_length=10, initial='djangonaut')
            password = CharField(widget=PasswordInput)

        unbound = UserRegistration()
        bound = UserRegistration({'password': 'foo'})
        self.assertIsNone(bound['username'].value())
        self.assertEqual(unbound['username'].value(), 'djangonaut')
        self.assertEqual(bound['password'].value(), 'foo')
        self.assertIsNone(unbound['password'].value())

    def test_boundfield_initial_called_once(self):
        """
        Multiple calls to BoundField().value() in an unbound form should return
        the same result each time (#24391).
        """
        class MyForm(Form):
            name = CharField(max_length=10, initial=uuid.uuid4)

        form = MyForm()
        name = form['name']
        self.assertEqual(name.value(), name.value())
        # BoundField is also cached
        self.assertIs(form['name'], name)

    def test_boundfield_value_disabled_callable_initial(self):
        class PersonForm(Form):
            name = CharField(initial=lambda: 'John Doe', disabled=True)

        # Without form data.
        form = PersonForm()
        self.assertEqual(form['name'].value(), 'John Doe')

        # With form data. As the field is disabled, the value should not be
        # affected by the form data.
        form = PersonForm({})
        self.assertEqual(form['name'].value(), 'John Doe')

    def test_boundfield_rendering(self):
        """
        Python 2 issue: Rendering a BoundField with bytestring content
        doesn't lose it's safe string status (#22950).
        """
        class CustomWidget(TextInput):
            def render(self, name, value, attrs=None, choices=None,
                       renderer=None, extra_context=None):
                return format_html(str('<input{} />'), ' id=custom')

        class SampleForm(Form):
            name = CharField(widget=CustomWidget)

        f = SampleForm(data={'name': 'bar'})
        self.assertIsInstance(force_text(f['name']), SafeData)

    def test_custom_boundfield(self):
        class CustomField(CharField):
            def get_bound_field(self, form, name):
                return (form, name)

        class SampleForm(Form):
            name = CustomField()

        f = SampleForm()
        self.assertEqual(f['name'], (f, 'name'))

    def test_initial_datetime_values(self):
        now = datetime.datetime.now()
        # Nix microseconds (since they should be ignored). #22502
        now_no_ms = now.replace(microsecond=0)
        if now == now_no_ms:
            now = now.replace(microsecond=1)

        def delayed_now():
            return now

        def delayed_now_time():
            return now.time()

        class HiddenInputWithoutMicrosec(HiddenInput):
            supports_microseconds = False

        class TextInputWithoutMicrosec(TextInput):
            supports_microseconds = False

        class DateTimeForm(Form):
            auto_timestamp = DateTimeField(initial=delayed_now)
            auto_time_only = TimeField(initial=delayed_now_time)
            supports_microseconds = DateTimeField(initial=delayed_now, widget=TextInput)
            hi_default_microsec = DateTimeField(initial=delayed_now, widget=HiddenInput)
            hi_without_microsec = DateTimeField(initial=delayed_now, widget=HiddenInputWithoutMicrosec)
            ti_without_microsec = DateTimeField(initial=delayed_now, widget=TextInputWithoutMicrosec)

        unbound = DateTimeForm()
        self.assertEqual(unbound['auto_timestamp'].value(), now_no_ms)
        self.assertEqual(unbound['auto_time_only'].value(), now_no_ms.time())
        self.assertEqual(unbound['supports_microseconds'].value(), now)
        self.assertEqual(unbound['hi_default_microsec'].value(), now)
        self.assertEqual(unbound['hi_without_microsec'].value(), now_no_ms)
        self.assertEqual(unbound['ti_without_microsec'].value(), now_no_ms)

    def test_datetime_clean_initial_callable_disabled(self):
        now = datetime.datetime(2006, 10, 25, 14, 30, 45, 123456)

        class DateTimeForm(forms.Form):
            dt = DateTimeField(initial=lambda: now, disabled=True)

        form = DateTimeForm({})
        self.assertEqual(form.errors, {})
        self.assertEqual(form.cleaned_data, {'dt': now})

    def test_datetime_changed_data_callable_with_microseconds(self):
        class DateTimeForm(forms.Form):
            dt = DateTimeField(initial=lambda: datetime.datetime(2006, 10, 25, 14, 30, 45, 123456), disabled=True)

        form = DateTimeForm({'dt': '2006-10-25 14:30:45'})
        self.assertEqual(form.changed_data, [])

    def test_help_text(self):
        # You can specify descriptive text for a field by using the 'help_text' argument)
        class UserRegistration(Form):
            username = CharField(max_length=10, help_text='e.g., user@example.com')
            password = CharField(widget=PasswordInput, help_text='Wählen Sie mit Bedacht.')

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" maxlength="10" required />
<span class="helptext">e.g., user@example.com</span></li>
<li>Password: <input type="password" name="password" required />
<span class="helptext">Wählen Sie mit Bedacht.</span></li>"""
        )
        self.assertHTMLEqual(
            p.as_p(),
            """<p>Username: <input type="text" name="username" maxlength="10" required />
<span class="helptext">e.g., user@example.com</span></p>
<p>Password: <input type="password" name="password" required />
<span class="helptext">Wählen Sie mit Bedacht.</span></p>"""
        )
        self.assertHTMLEqual(
            p.as_table(),
            """<tr><th>Username:</th><td><input type="text" name="username" maxlength="10" required /><br />
<span class="helptext">e.g., user@example.com</span></td></tr>
<tr><th>Password:</th><td><input type="password" name="password" required /><br />
<span class="helptext">Wählen Sie mit Bedacht.</span></td></tr>"""
        )

        # The help text is displayed whether or not data is provided for the form.
        p = UserRegistration({'username': 'foo'}, auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" value="foo" maxlength="10" required />
<span class="helptext">e.g., user@example.com</span></li>
<li><ul class="errorlist"><li>This field is required.</li></ul>
Password: <input type="text" name="password" required />
<span class="helptext">Wählen Sie mit Bedacht.</span></li>"""
        )

        # help_text is not displayed for hidden fields. It can be used for documentation
        # purposes, though.
        class UserRegistration(Form):
            username = CharField(max_length=10, help_text='e.g., user@example.com')
            password = CharField(widget=PasswordInput)
            next = CharField(widget=HiddenInput, initial='/', help_text='Redirect destination')

        p = UserRegistration(auto_id=False)
        self.assertHTMLEqual(
            p.as_ul(),
            """<li>Username: <input type="text" name="username" maxlength="10" required /></li>
<li>Password: <input type="password" name="password" required /></li>
<li>Next: <input type="hidden" name="next" value="/" /></li>"""
        )

    def test_subclassing_forms(self):
        # You can subclass a Form to add fields. The resulting form subclass will have
        # all of the fields of the parent Form, plus whichever fields you define in the
        # subclass.
        class Person(Form):
            first_name = CharField()
            last_name = CharField()
            birthday = DateField()

        class Musician(Person):
            instrument = CharField()

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

        # Yes, you can subclass multiple forms. The fields are added in the order in
        # which the parent classes are listed.
        class Person(Form):
            first_name = CharField()
            last_name = CharField()
            birthday = DateField()

        class Instrument(Form):
            instrument = CharField()

        class Beatle(Person, Instrument):
            haircut_type = CharField()

        b = Beatle(auto_id=False)
        self.assertHTMLEqual(b.as_ul(), """<li>Instrument: <input type="text" name="instrument" required /></li>
<li>First name: <input type="text" name="first_name" required /></li>
<li>Last name: <input type="text" name="last_name" required /></li>
<li>Birthday: <input type="text" name="birthday" required /></li>
<li>Haircut type: <input type="text" name="haircut_type" required /></li>""")

    def test_forms_with_prefixes(self):
        # Sometimes it's necessary to have multiple forms display on the same HTML page,
        # or multiple copies of the same form. We can accomplish this with form prefixes.
        # Pass the keyword argument 'prefix' to the Form constructor to use this feature.
        # This value will be prepended to each HTML form field name. One way to think
        # about this is "namespaces for HTML forms". Notice that in the data argument,
        # each field's key has the prefix, in this case 'person1', prepended to the
        # actual field name.
        class Person(Form):
            first_name = CharField()
            last_name = CharField()
            birthday = DateField()

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
<input type="text" name="person1-last_name" value="John" id="id_person1-last_name" required /></li>
<li><label for="id_person1-birthday">Birthday:</label>
<input type="text" name="person1-birthday" value="1940-10-9" id="id_person1-birthday" required /></li>"""
        )
        self.assertHTMLEqual(
            str(p['first_name']),
            '<input type="text" name="person1-first_name" value="John" id="id_person1-first_name" required />'
        )
        self.assertHTMLEqual(
            str(p['last_name']),
            '<input type="text" name="person1-last_name" value="John" id="id_person1-last_name" required />'
        )
        self.assertHTMLEqual(
            str(p['birthday']),
            '<input type="text" name="person1-birthday" value="John" id="id_person1-birthday" required />'
        )
        self.assertEqual(p.errors, {})
        self.assertTrue(p.is_valid())
        self.assertEqual(p.cleaned_data['first_name'], 'John')
        self.assertEqual(p.cleaned_data['last_name'], 'Lennon')
        self.assertEqual(p.cleaned_data['birthday'], datetime.date(1940, 10, 9))

        # Let's try submitting some bad data to make sure form.errors and field.errors
        # work as expected.
        data = {
            'person1-first_name': '',
            'person1-last_name': '',
            'person1-birthday': ''
        }
        p = Person(data, prefix='person1')
        self.assertEqual(p.errors['first_name'], ['This field is required.'])
        self.assertEqual(p.errors['last_name'], ['This field is required.'])
        self.assertEqual(p.errors['birthday'], ['This field is required.'])
        self.assertEqual(p['first_name'].errors, ['This field is required.'])
        # Accessing a nonexistent field.
        with self.assertRaises(KeyError):
            p['person1-first_name'].errors

        # In this example, the data doesn't have a prefix, but the form requires it, so
        # the form doesn't "see" the fields.
        data = {
            'first_name': 'John',
            'last_name': 'Lennon',
            'birthday': '1940-10-9'
        }
        p = Person(data, prefix='person1')
        self.assertEqual(p.errors['first_name'], ['This field is required.'])
        self.assertEqual(p.errors['last_name'], ['This field is required.'])
        self.assertEqual(p.errors['birthday'], ['This