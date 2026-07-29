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
            str(f['get_spam']), '<input checked type="checkbox" name="get_spam" required />')

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
        """
        Refactored to reduce cyclomatic complexity by extracting helper methods.
        """
        self._test_choice_field_basic()
        self._test_choice_field_with_empty_string()
        self._test_choice_field_with_select_widget()
        self._test_choice_field_with_custom_widget_instance()
        self._test_choice_field_set_choices_after()
        self._test_choice_field_multiple_choices()

    def _test_choice_field_basic(self):
        """Test a basic ChoiceField with no empty string."""
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

    def _test_choice_field_with_empty_string(self):
        """Test a ChoiceField where one choice has an empty string value."""
        class FrameworkForm(Form):
            name = CharField()
            language = ChoiceField(choices=[('', '------'), ('P', 'Python'), ('J', 'Java')])

        f = FrameworkForm(auto_id=False)
        self.assertHTMLEqual(str(f['language']), """<select class="foo" name="language">
<option value="" selected>------</option>
<option value="P">Python</option>
<option value="J">Java</option>
</select>""")

    def _test_choice_field_with_select_widget(self):
        """Test a ChoiceField with a custom Select widget."""
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

    def _test_choice_field_with_custom_widget_instance(self):
        """Test a ChoiceField with a custom widget instance."""
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
        self.assertHTMLEqual(str(f['language']), """<select class="foo" name="language">
<option value="P" selected>Python</option>
<option value="J">Java</option>
</select>""")

    def _test_choice_field_set_choices_after(self):
        """Test setting choices after form initialization."""
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

    def _test_choice_field_multiple_choices(self):
        """Test a ChoiceField with multiple choices and a custom widget."""
        class FrameworkForm(Form):
            name = CharField()
            language = ChoiceField(choices=[('P', 'Python'), ('J', 'Java')])

        f = FrameworkForm(auto_id=False)
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
            """<li><label for="id_name">Name:</label> <ul id="id_language">
<li><label for="id_language_0"><input type="radio" id="id_language_0" value="P" name="language" required />
Python</label></li>
<li><label for="id_language_1"><input type="radio" id="id_language_1" value="J" name="language" required />
Java</label></li>
</ul></li>"""
        )
        self.assertHTMLEqual(
            f.as_p(),
            """<p><label for="id_name">Name:</label> <ul id="id_language">
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
<input id="id_language_1" name="language" type="radio" value="Q" required /> Java</label></div>"""
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
<input checked name="composers" type="checkbox" value="J" /> John
```