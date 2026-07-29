from __future__ import unicode_literals

import datetime
import os
from decimal import Decimal
from unittest import skipUnless

from django import forms
from django.core.exceptions import (
    NON_FIELD_ERRORS, FieldError, ImproperlyConfigured,
)
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.validators import ValidationError
from django.db import connection, models
from django.db.models.query import EmptyQuerySet
from django.forms.models import (
    ModelChoiceIterator, ModelFormMetaclass, construct_instance,
    fields_for_model, model_to_dict, modelform_factory,
)
from django.forms.widgets import CheckboxSelectMultiple
from django.template import Context, Template
from django.test import SimpleTestCase, TestCase, mock, skipUnlessDBFeature
from django.utils import six
from django.utils._os import upath

from .models import (
    Article, ArticleStatus, Author, Author1, Award, BetterWriter, BigInt, Book,
    Category, Character, Colour, ColourfulItem, CommaSeparatedInteger,
    CustomErrorMessage, CustomFF, CustomFieldForExclusionModel, DateTimePost,
    DerivedBook, DerivedPost, Document, ExplicitPK, FilePathModel,
    FlexibleDatePost, Homepage, ImprovedArticle, ImprovedArticleWithParentLink,
    Inventory, NullableUniqueCharFieldModel, Person, Photo, Post, Price,
    Product, Publication, PublicationDefaults, StrictAssignmentAll,
    StrictAssignmentFieldSpecific, Student, StumpJoke, TextFile, Triple,
    Writer, WriterProfile, test_images,
)

if test_images:
    from .models import ImageFile, OptionalImageFile, NoExtensionImageFile

    class ImageFileForm(forms.ModelForm):
        class Meta:
            model = ImageFile
            fields = '__all__'

    class OptionalImageFileForm(forms.ModelForm):
        class Meta:
            model = OptionalImageFile
            fields = '__all__'

    class NoExtensionImageFileForm(forms.ModelForm):
        class Meta:
            model = NoExtensionImageFile
            fields = '__all__'


class ProductForm(forms.ModelForm):
    class Meta:
        model = Product
        fields = '__all__'


class PriceForm(forms.ModelForm):
    class Meta:
        model = Price
        fields = '__all__'


class BookForm(forms.ModelForm):
    class Meta:
        model = Book
        fields = '__all__'


class DerivedBookForm(forms.ModelForm):
    class Meta:
        model = DerivedBook
        fields = '__all__'


class ExplicitPKForm(forms.ModelForm):
    class Meta:
        model = ExplicitPK
        fields = ('key', 'desc',)


class PostForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = '__all__'


class DerivedPostForm(forms.ModelForm):
    class Meta:
        model = DerivedPost
        fields = '__all__'


class CustomWriterForm(forms.ModelForm):
    name = forms.CharField(required=False)

    class Meta:
        model = Writer
        fields = '__all__'


class BaseCategoryForm(forms.ModelForm):
    class Meta:
        model = Category
        fields = '__all__'


class ArticleForm(forms.ModelForm):
    class Meta:
        model = Article
        fields = '__all__'


class RoykoForm(forms.ModelForm):
    class Meta:
        model = Writer
        fields = '__all__'


class ArticleStatusForm(forms.ModelForm):
    class Meta:
        model = ArticleStatus
        fields = '__all__'


class InventoryForm(forms.ModelForm):
    class Meta:
        model = Inventory
        fields = '__all__'


class SelectInventoryForm(forms.Form):
    items = forms.ModelMultipleChoiceField(Inventory.objects.all(), to_field_name='barcode')


class CustomFieldForExclusionForm(forms.ModelForm):
    class Meta:
        model = CustomFieldForExclusionModel
        fields = ['name', 'markup']


class TextFileForm(forms.ModelForm):
    class Meta:
        model = TextFile
        fields = '__all__'


class BigIntForm(forms.ModelForm):
    class Meta:
        model = BigInt
        fields = '__all__'


class ModelFormWithMedia(forms.ModelForm):
    class Media:
        js = ('/some/form/javascript',)
        css = {
            'all': ('/some/form/css',)
        }

    class Meta:
        model = TextFile
        fields = '__all__'


class CustomErrorMessageForm(forms.ModelForm):
    name1 = forms.CharField(error_messages={'invalid': 'Form custom error message.'})

    class Meta:
        fields = '__all__'
        model = CustomErrorMessage


class ModelFormBaseTest(TestCase):
    def test_base_form(self):
        self.assertEqual(list(BaseCategoryForm.base_fields),
                         ['name', 'slug', 'url'])

    def test_no_model_class(self):
        class NoModelModelForm(forms.ModelForm):
            pass
        with self.assertRaises(ValueError):
            NoModelModelForm()

    def test_empty_fields_to_fields_for_model(self):
        """
        An argument of fields=() to fields_for_model should return an empty dictionary
        """
        field_dict = fields_for_model(Person, fields=())
        self.assertEqual(len(field_dict), 0)

    def test_empty_fields_on_modelform(self):
        """
        No fields on a ModelForm should actually result in no fields.
        """
        class EmptyPersonForm(forms.ModelForm):
            class Meta:
                model = Person
                fields = ()

        form = EmptyPersonForm()
        self.assertEqual(len(form.fields), 0)

    def test_empty_fields_to_construct_instance(self):
        """
        No fields should be set on a model instance if construct_instance receives fields=().
        """
        form = modelform_factory(Person, fields="__all__")({'name': 'John Doe'})
        self.assertTrue(form.is_valid())
        instance = construct_instance(form, Person(), fields=())
        self.assertEqual(instance.name, '')

    def test_blank_with_null_foreign_key_field(self):
        """
        #13776 -- ModelForm's with models having a FK set to null=False and
        required=False should be valid.
        """
        class FormForTestingIsValid(forms.ModelForm):
            class Meta:
                model = Student
                fields = '__all__'

            def __init__(self, *args, **kwargs):
                super(FormForTestingIsValid, self).__init__(*args, **kwargs)
                self.fields['character'].required = False

        char = Character.objects.create(username='user',
                                        last_action=datetime.datetime.today())
        data = {'study': 'Engineering'}
        data2 = {'study': 'Engineering', 'character': char.pk}

        # form is valid because required=False for field 'character'
        f1 = FormForTestingIsValid(data)
        self.assertTrue(f1.is_valid())

        f2 = FormForTestingIsValid(data2)
        self.assertTrue(f2.is_valid())
        obj = f2.save()
        self.assertEqual(obj.character, char)

    def test_blank_false_with_null_true_foreign_key_field(self):
        """
        A ModelForm with a model having ForeignKey(blank=False, null=True)
        and the form field set to required=False should allow the field to be
        unset.
        """
        class AwardForm(forms.ModelForm):
            class Meta:
                model = Award
                fields = '__all__'

            def __init__(self, *args, **kwargs):
                super(AwardForm, self).__init__(*args, **kwargs)
                self.fields['character'].required = False

        character = Character.objects.create(username='user', last_action=datetime.datetime.today())
        award = Award.objects.create(name='Best sprinter', character=character)
        data = {'name': 'Best tester', 'character': ''}  # remove character
        form = AwardForm(data=data, instance=award)
        self.assertTrue(form.is_valid())
        award = form.save()
        self.assertIsNone(award.character)

    def test_save_blank_false_with_required_false(self):
        """
        A ModelForm with a model with a field set to blank=False and the form
        field set to required=False should allow the field to unset.
        """
        obj = Writer.objects.create(name='test')
        form = CustomWriterForm(data={'name': ''}, instance=obj)
        self.assertTrue(form.is_valid())
        obj = form.save()
        self.assertEqual(obj.name, '')

    def test_save_blank_null_unique_charfield_saves_null(self):
        form_class = modelform_factory(model=NullableUniqueCharFieldModel, fields=['codename'])
        empty_value = '' if connection.features.interprets_empty_strings_as_nulls else None

        form = form_class(data={'codename': ''})
        self.assertTrue(form.is_valid())
        form.save()
        self.assertEqual(form.instance.codename, empty_value)

        # Save a second form to verify there isn't a unique constraint violation.
        form = form_class(data={'codename': ''})
        self.assertTrue(form.is_valid())
        form.save()
        self.assertEqual(form.instance.codename, empty_value)

    def test_missing_fields_attribute(self):
        message = (
            "Creating a ModelForm without either the 'fields' attribute "
            "or the 'exclude' attribute is prohibited; form "
            "MissingFieldsForm needs updating."
        )
        with self.assertRaisesMessage(ImproperlyConfigured, message):
            class MissingFieldsForm(forms.ModelForm):
                class Meta:
                    model = Category

    def test_extra_fields(self):
        class ExtraFields(BaseCategoryForm):
            some_extra_field = forms.BooleanField()

        self.assertEqual(list(ExtraFields.base_fields),
                         ['name', 'slug', 'url', 'some_extra_field'])

    def test_extra_declared_field_model_form(self):
        class ExtraPersonForm(forms.ModelForm):
            """ ModelForm with an extra field """
            age = forms.IntegerField()

            class Meta:
                model = Person
                fields = ('name', 'age')

    def test_extra_field_modelform_factory(self):
        with self.assertRaises(FieldError):
            modelform_factory(Person, fields=['no-field', 'name'])

    def test_replace_field(self):
        class ReplaceField(forms.ModelForm):
            url = forms.BooleanField()

            class Meta:
                model = Category
                fields = '__all__'

        self.assertIsInstance(ReplaceField.base_fields['url'], forms.fields.BooleanField)

    def test_replace_field_variant_2(self):
        # Should have the same result as before,
        # but 'fields' attribute specified differently
        class ReplaceField(forms.ModelForm):
            url = forms.BooleanField()

            class Meta:
                model = Category
                fields = ['url']

        self.assertIsInstance(ReplaceField.base_fields['url'], forms.fields.BooleanField)

    def test_replace_field_variant_3(self):
        # Should have the same result as before,
        # but 'fields' attribute specified differently
        class ReplaceField(forms.ModelForm):
            url = forms.BooleanField()

            class Meta:
                model = Category
                fields = []  # url will still appear, since it is explicit above

        self.assertIsInstance(ReplaceField.base_fields['url'], forms.fields.BooleanField)

    def test_override_field(self):
        class WriterForm(forms.ModelForm):
            book = forms.CharField(required=False)

            class Meta:
                model = Writer
                fields = '__all__'

        wf = WriterForm({'name': 'Richard Lockridge'})
        self.assertTrue(wf.is_valid())

    def test_limit_nonexistent_field(self):
        expected_msg = 'Unknown field(s) (nonexistent) specified for Category'
        with self.assertRaisesMessage(FieldError, expected_msg):
            class InvalidCategoryForm(forms.ModelForm):
                class Meta:
                    model = Category
                    fields = ['nonexistent']

    def test_limit_fields_with_string(self):
        expected_msg = "CategoryForm.Meta.fields cannot be a string. Did you mean to type: ('url',)?"
        with self.assertRaisesMessage(TypeError, expected_msg):
            class CategoryForm(forms.ModelForm):
                class Meta:
                    model = Category
                    fields = ('url')  # note the missing comma

    def test_exclude_fields(self):
        class ExcludeFields(forms.ModelForm):
            class Meta:
                model = Category
                exclude = ['url']

        self.assertEqual(list(ExcludeFields.base_fields), ['name', 'slug'])

    def test_exclude_nonexistent_field(self):
        class ExcludeFields(forms.ModelForm):
            class Meta:
                model = Category
                exclude = ['nonexistent']

        self.assertEqual(list(ExcludeFields.base_fields), ['name', 'slug', 'url'])

    def test_exclude_fields_with_string(self):
        expected_msg = "CategoryForm.Meta.exclude cannot be a string. Did you mean to type: ('url',)?"
        with self.assertRaisesMessage(TypeError, expected_msg):
            class CategoryForm(forms.ModelForm):
                class Meta:
                    model = Category
                    exclude = ('url')  # note the missing comma

    def test_exclude_and_validation(self):
        # This Price instance generated by this form is not valid because the quantity
        # field is required, but the form is valid because the field is excluded from
        # the form. This is for backwards compatibility.
        class PriceFormWithoutQuantity(forms.ModelForm):
            class Meta:
                model = Price
                exclude = ('quantity',)

        form = PriceFormWithoutQuantity({'price': '6.00'})
        self.assertTrue(form.is_valid())
        price = form.save(commit=False)
        with self.assertRaises(ValidationError):
            price.full_clean()

        # The form should not validate fields that it doesn't contain even if they are
        # specified using 'fields', not 'exclude'.
        class PriceFormWithoutQuantity(forms.ModelForm):
            class Meta:
                model = Price
                fields = ('price',)
        form = PriceFormWithoutQuantity({'price': '6.00'})
        self.assertTrue(form.is_valid())

        # The form should still have an instance of a model that is not complete and
        # not saved into a DB yet.
        self.assertEqual(form.instance.price, Decimal('6.00'))
        self.assertIsNone(form.instance.quantity)
        self.assertIsNone(form.instance.pk)

    def test_confused_form(self):
        class ConfusedForm(forms.ModelForm):
            """ Using 'fields' *and* 'exclude'. Not sure why you'd want to do
            this, but uh, "be liberal in what you accept" and all.
            """
            class Meta:
                model = Category
                fields = ['name', 'url']
                exclude = ['url']

        self.assertEqual(list(ConfusedForm.base_fields),
                         ['name'])

    def test_mixmodel_form(self):
        class MixModelForm(BaseCategoryForm):
            """ Don't allow more than one 'model' definition in the
            inheritance hierarchy.  Technically, it would generate a valid
            form, but the fact that the resulting save method won't deal with
            multiple objects is likely to trip up people not familiar with the
            mechanics.
            """
            class Meta:
                model = Article
                fields = '__all__'
            # MixModelForm is now an Article-related thing, because MixModelForm.Meta
            # overrides BaseCategoryForm.Meta.

        self.assertEqual(
            list(MixModelForm.base_fields),
            ['headline', 'slug', 'pub_date', 'writer', 'article', 'categories', 'status']
        )

    def test_article_form(self):
        self.assertEqual(
            list(ArticleForm.base_fields),
            ['headline', 'slug', 'pub_date', 'writer', 'article', 'categories', 'status']
        )

    def test_bad_form(self):
        # First class with a Meta class wins...
        class BadForm(ArticleForm, BaseCategoryForm):
            pass

        self.assertEqual(
            list(BadForm.base_fields),
            ['headline', 'slug', 'pub_date', 'writer', 'article', 'categories', 'status']
        )

    def test_invalid_meta_model(self):
        class InvalidModelForm(forms.ModelForm):
            class Meta:
                pass  # no model

        # Can't create new form
        with self.assertRaises(ValueError):
            InvalidModelForm()

        # Even if you provide a model instance
        with self.assertRaises(ValueError):
            InvalidModelForm(instance=Category)

    def test_subcategory_form(self):
        class SubCategoryForm(BaseCategoryForm):
            """ Subclassing without specifying a Meta on the class will use
            the parent's Meta (or the first parent in the MRO if there are
            multiple parent classes).
            """
            pass

        self.assertEqual(list(SubCategoryForm.base_fields),
                         ['name', 'slug', 'url'])

    def test_subclassmeta_form(self):
        class SomeCategoryForm(forms.ModelForm):
            checkbox = forms.BooleanField()

            class Meta:
                model = Category
                fields = '__all__'

        class SubclassMeta(SomeCategoryForm):
            """ We can also subclass the Meta inner class to change the fields
            list.
            """
            class Meta(SomeCategoryForm.Meta):
                exclude = ['url']

        self.assertHTMLEqual(
            str(SubclassMeta()),
            """<tr><th><label for="id_name">Name:</label></th>
<td><input id="id_name" type="text" name="name" maxlength="20" required /></td></tr>
<tr><th><label for="id_slug">Slug:</label></th>
<td><input id="id_slug" type="text" name="slug" maxlength="20" required /></td></tr>
<tr><th><label for="id_checkbox">Checkbox:</label></th>
<td><input type="checkbox" name="checkbox" id="id_checkbox" required /></td></tr>"""
        )

    def test_orderfields_form(self):
        class OrderFields(forms.ModelForm):
            class Meta:
                model = Category
                fields = ['url', 'name']

        self.assertEqual(list(OrderFields.base_fields),
                         ['url', 'name'])
        self.assertHTMLEqual(
            str(OrderFields()),
            """<tr><th><label for="id_url">The URL:</label></th>
<td><input id="id_url" type="text" name="url" maxlength="40" required /></td></tr>
<tr><th><label for="id_name">Name:</label></th>
<td><input id="id_name" type="text" name="name" maxlength="20" required /></td></tr>"""
        )

    def test_orderfields2_form(self):
        class OrderFields2(forms.ModelForm):
            class Meta:
                model = Category
                fields = ['slug', 'url', 'name']
                exclude = ['url']

        self.assertEqual(list(OrderFields2.base_fields),
                         ['slug', 'name'])

    def test_default_populated_on_optional_field(self):
        class PubForm(forms.ModelForm):
            mode = forms.CharField(max_length=255, required=False)

            class Meta:
                model = PublicationDefaults
                fields = ('mode',)

        # Empty data uses the model field default.
        mf1 = PubForm({})
        self.assertEqual(mf1.errors, {})
        m1 = mf1.save(commit=False)
        self.assertEqual(m1.mode, 'di')
        self.assertEqual(m1._meta.get_field('mode').get_default(), 'di')

        # Blank data doesn't use the model default.
        mf2 = PubForm({'mode': ''})
        self.assertEqual(mf2.errors, {})
        m2 = mf2.save(commit=False)
        self.assertEqual(m2.mode, '')

    def test_default_not_populated_on_optional_checkbox_input(self):
        class PubForm(forms.ModelForm):
            class Meta:
                model = PublicationDefaults
                fields = ('active',)

        # Empty data doesn't use the model default because CheckboxInput
        # doesn't have a value in HTML form submission.
        mf1 = PubForm({})
        self.assertEqual(mf1.errors, {})
        m1 = mf1.save(commit=False)
        self.assertIs(m1.active, False)
        self.assertIsInstance(mf1.fields['active'].widget, forms.CheckboxInput)
        self.assertIs(m1._meta.get_field('active').get_default(), True)

    def test_default_not_populated_on_checkboxselectmultiple(self):
        class PubForm(forms.ModelForm):
            mode = forms.CharField(required=False, widget=forms.CheckboxSelectMultiple)

            class Meta:
                model = PublicationDefaults
                fields = ('mode',)

        # Empty data doesn't use the model default because an unchecked
        # CheckboxSelectMultiple doesn't have a value in HTML form submission.
        mf1 = PubForm({})
        self.assertEqual(mf1.errors, {})
        m1 = mf1.save(commit=False)
        self.assertEqual(m1.mode, '')
        self.assertEqual(m1._meta.get_field('mode').get_default(), 'di')

    def test_default_not_populated_on_selectmultiple(self):
        class PubForm(forms.ModelForm):
            mode = forms.CharField(required=False, widget=forms.SelectMultiple)

            class Meta:
                model = PublicationDefaults
                fields = ('mode',)

        # Empty data doesn't use the model default because an unselected
        # SelectMultiple doesn't have a value in HTML form submission.
        mf1 = PubForm({})
        self.assertEqual(mf1.errors, {})
        m1 = mf1.save(commit=False)
        self.assertEqual(m1.mode, '')
        self.assertEqual(m1._meta.get_field('mode').get_default(), 'di')

    def test_prefixed_form_with_default_field(self):
        class PubForm(forms.ModelForm):
            prefix = 'form-prefix'

            class Meta:
                model = PublicationDefaults
                fields = ('mode',)

        mode = 'de'
        self.assertNotEqual(mode, PublicationDefaults._meta.get_field('mode').get_default())

        mf1 = PubForm({'form-prefix-mode': mode})
        self.assertEqual(mf1.errors, {})
        m1 = mf1.save(commit=False)
        self.assertEqual(m1.mode, mode)

    def test_default_splitdatetime_field(self):
        class PubForm(forms.ModelForm):
            datetime_published = forms.SplitDateTimeField(required=False)

            class Meta:
                model = PublicationDefaults
                fields = ('datetime_published',)

        mf1 = PubForm({})
        self.assertEqual(mf1.errors, {})
        m1 = mf1.save(commit=False)
        self.assertEqual(m1.datetime_published, datetime.datetime(2000, 1, 1))

        mf2 = PubForm({'datetime_published_0': '2010-01-01', 'datetime_published_1': '0:00:00'})
        self.assertEqual(mf2.errors, {})
        m2 = mf2.save(commit=False)
        self.assertEqual(m2.datetime_published, datetime.datetime(2010, 1, 1))

    def test_default_filefield(self):
        class PubForm(forms.ModelForm):
            class Meta:
                model = PublicationDefaults
                fields = ('file',)

        mf1 = PubForm({})
        self.assertEqual(mf1.errors, {})
        m1 = mf1.save(commit=False)
        self.assertEqual(m1.file.name, 'default.txt')

        mf2 = PubForm({}, {'file': SimpleUploadedFile('name', b'foo')})
        self.assertEqual(mf2.errors, {})
        m2 = mf2.save(commit=False)
        self.assertEqual(m2.file.name, 'name')

    def test_default_selectdatewidget(self):
        class PubForm(forms.ModelForm):
            date_published = forms.DateField(required=False, widget=forms.SelectDateWidget)

            class Meta:
                model = PublicationDefaults
                fields = ('date_published',)

        mf1 = PubForm({})
        self.assertEqual(mf1.errors, {})
        m1 = mf1.save(commit=False)
        self.assertEqual(m1.date_published, datetime.date.today())

        mf2 = PubForm({'date_published_year': '2010', 'date_published_month': '1', 'date_published_day': '1'})
        self.assertEqual(mf2.errors, {})
        m2 = mf2.save(commit=False)
        self.assertEqual(m2.date_published, datetime.date(2010, 1, 1))


class FieldOverridesByFormMetaForm(forms.ModelForm):
    class Meta:
        model = Category
        fields = ['name', 'url', 'slug']
        widgets = {
            'name': forms.Textarea,
            'url': forms.TextInput(attrs={'class': 'url'})
        }
        labels = {
            'name': 'Title',
        }
        help_texts = {
            'slug': 'Watch out! Letters, numbers, underscores and hyphens only.',
        }
        error_messages = {
            'slug': {
                'invalid': (
                    "Didn't you read the help text? "
                    "We said letters, numbers, underscores and hyphens only!"
                )
            }
        }
        field_classes = {
            'url': forms.URLField,
        }


class TestFieldOverridesByFormMeta(SimpleTestCase):
    def test_widget_overrides(self):
        form = FieldOverridesByFormMetaForm()
        self.assertHTMLEqual(
            str(form['name']),
            '<textarea id="id_name" rows="10" cols="40" name="name" maxlength="20" required></textarea>',
        )
        self.assertHTMLEqual(
            str(form['url']),
            '<input id="id_url" type="text" class="url" name="url" maxlength="40" required />',
        )
        self.assertHTMLEqual(
            str(form['slug']),
            '<input id="id_slug" type="text" name="slug" maxlength="20" required />',
        )

    def test_label_overrides(self):
        form = FieldOverridesByFormMetaForm()
        self.assertHTMLEqual(
            str(form['name'].label_tag()),
            '<label for="id_name">Title:</label>',
        )
        self.assertHTMLEqual(
            str(form['url'].label_tag()),
            '<label for="id_url">The URL:</label>',
        )
        self.assertHTMLEqual(
            str(form['slug'].label_tag()),
            '<label for="id_slug">Slug:</label>',
        )

    def test_help_text_overrides(self):
        form = FieldOverridesByFormMetaForm()
        self.assertEqual(
            form['slug'].help_text,
            'Watch out! Letters, numbers, underscores and hyphens only.',
        )

    def test_error_messages_overrides(self):
        form = FieldOverridesByFormMetaForm(data={
            'name': 'Category',
            'url': 'http://www.example.com/category/',
            'slug': '!%#*@',
        })
        form.full_clean()

        error = [
            "Didn't you read the help text? "
            "We said letters, numbers, underscores and hyphens only!",
        ]
        self.assertEqual(form.errors, {'slug': error})

    def test_field_type_overrides(self):
        form = FieldOverridesByFormMetaForm()
        self.assertIs(Category._meta.get_field('url').__class__, models.CharField)
        self.assertIsInstance(form.fields['url'], forms.URLField)


class IncompleteCategoryFormWithFields(forms.ModelForm):
    """
    A form that replaces the model's url field with a custom one. This should
    prevent the model field's validation from being called.
    """
    url = forms.CharField(required=False)

    class Meta:
        fields = ('name', 'slug')
        model = Category


class IncompleteCategoryFormWithExclude(forms.ModelForm):
    """
    A form that replaces the model's url field with a custom one. This should
    prevent the model field's validation from being called.
    """
    url = forms.CharField(required=False)

    class Meta:
        exclude = ['url']
        model = Category


class ValidationTest(SimpleTestCase):
    def test_validates_with_replaced_field_not_specified(self):
        form = IncompleteCategoryFormWithFields(data={'name': 'some name', 'slug': 'some-slug'})
        assert form.is_valid()

    def test_validates_with_replaced_field_excluded(self):
        form = IncompleteCategoryFormWithExclude(data={'name': 'some name', 'slug': 'some-slug'})
        assert form.is_valid()

    def test_notrequired_overrides_notblank(self):
        form = CustomWriterForm({})
        assert form.is_valid()


class UniqueTest(TestCase):
    """
    unique/unique_together validation.
    """
    def setUp(self):
        self.writer = Writer.objects.create(name='Mike Royko')

    def test_simple_unique(self):
        form = ProductForm({'slug': 'teddy-bear-blue'})
        self.assertTrue(form.is_valid())
        obj = form.save()
        form = ProductForm({'slug': 'teddy-bear-blue'})
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['slug'], ['Product with this Slug already exists.'])
        form = ProductForm({'slug': 'teddy-bear-blue'}, instance=obj)
        self.assertTrue(form.is_valid())

    def test_unique_together(self):
        """ModelForm test of unique_together constraint"""
        form = PriceForm({'price': '6.00', 'quantity': '1'})
        self.assertTrue(form.is_valid())
        form.save()
        form = PriceForm({'price': '6.00', 'quantity': '1'})
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['__all__'], ['Price with this Price and Quantity already exists.'])

    def test_multiple_field_unique_together(self):
        """
        When the same field is involved in multiple unique_together
        constraints, we need to make sure we don't remove the data for it
        before doing all the validation checking (not just failing after
        the first one).
        """
        class TripleForm(forms.ModelForm):
            class Meta:
                model = Triple
                fields = '__all__'

        Triple.objects.create(left=1, middle=2, right=3)

        form = TripleForm({'left': '1', 'middle': '2', 'right': '3'})
        self.assertFalse(form.is_valid())

        form = TripleForm({'left': '1', 'middle': '3', 'right': '1'})
        self.assertTrue(form.is_valid())

    @skipUnlessDBFeature('supports_nullable_unique_constraints')
    def test_unique_null(self):
        title = 'I May Be Wrong But I Doubt It'
        form = BookForm({'title': title, 'author': self.writer.pk})
        self.assertTrue(form.is_valid())
        form.save()
        form = BookForm({'title': title, 'author': self.writer.pk})
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['__all__'], ['Book with this Title and Author already exists.'])
        form = BookForm({'title': title})
        self.assertTrue(form.is_valid())
        form.save()
        form = BookForm({'title': title})
        self.assertTrue(form.is_valid())

    def test_inherited_unique(self):
        title = 'Boss'
        Book.objects.create(title=title, author=self.writer, special_id=1)
        form = DerivedBookForm({'title': 'Other', 'author': self.writer.pk, 'special_id': '1', 'isbn': '12345'})
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['special_id'], ['Book with this Special id already exists.'])

    def test_inherited_unique_together(self):
        title = 'Boss'
        form = BookForm({'title': title, 'author': self.writer.pk})
        self.assertTrue(form.is_valid())
        form.save()
        form = DerivedBookForm({'title': title, 'author': self.writer.pk, 'isbn': '12345'})
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['__all__'], ['Book with this Title and Author already exists.'])

    def test_abstract_inherited_unique(self):
        title = 'Boss'
        isbn = '12345'
        DerivedBook.objects.create(title=title, author=self.writer, isbn=isbn)
        form = DerivedBookForm({
            'title': 'Other', 'author': self.writer.pk, 'isbn': isbn,
            'suffix1': '1', 'suffix2': '2',
        })
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['isbn'], ['Derived book with this Isbn already exists.'])

    def test_abstract_inherited_unique_together(self):
        title = 'Boss'
        isbn = '12345'
        DerivedBook.objects.create(title=title, author=self.writer, isbn=isbn)
        form = DerivedBookForm({
            'title': 'Other',
            'author': self.writer.pk,
            'isbn': '9876',
            'suffix1': '0',
            'suffix2': '0'
        })
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['__all__'],
                         ['Derived book with this Suffix1 and Suffix2 already exists.'])

    def test_explicitpk_unspecified(self):
        """Test for primary_key being in the form and failing validation."""
        form = ExplicitPKForm({'key': '', 'desc': ''})
        self.assertFalse(form.is_valid())

    def test_explicitpk_unique(self):
        """Ensure keys and blank character strings are tested for uniqueness."""
        form = ExplicitPKForm({'key': 'key1', 'desc': ''})
        self.assertTrue(form.is_valid())
        form.save()
        form = ExplicitPKForm({'key': 'key1', 'desc': ''})
        self.assertFalse(form.is_valid())
        if connection.features.interprets_empty_strings_as_nulls:
            self.assertEqual(len(form.errors), 1)
            self.assertEqual(form.errors['key'], ['Explicit pk with this Key already exists.'])
        else:
            self.assertEqual(len(form.errors), 3)
            self.assertEqual(form.errors['__all__'], ['Explicit pk with this Key and Desc already exists.'])
            self.assertEqual(form.errors['desc'], ['Explicit pk with this Desc already exists.'])
            self.assertEqual(form.errors['key'], ['Explicit pk with this Key already exists.'])

    def test_unique_for_date(self):
        p = Post.objects.create(
            title="Django 1.0 is released", slug="Django 1.0",
            subtitle="Finally", posted=datetime.date(2008, 9, 3),
        )
        form = PostForm({'title': "Django 1.0 is released", 'posted': '2008-09-03'})
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['title'], ['Title must be unique for Posted date.'])
        form = PostForm({'title': "Work on Django 1.1 begins", 'posted': '2008-09-03'})
        self.assertTrue(form.is_valid())
        form = PostForm({'title': "Django 1.0 is released", 'posted': '2008-09-04'})
        self.assertTrue(form.is_valid())
        form = PostForm({'slug': "Django 1.0", 'posted': '2008-01-01'})
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['slug'], ['Slug must be unique for Posted year.'])
        form = PostForm({'subtitle': "Finally", 'posted': '2008-09-30'})
        self.assertFalse(form.is_valid())
        self.assertEqual(form.errors['subtitle'], ['Subtitle must be unique for Posted month.'])
        data = {'subtitle': "Finally", "title": "Django 1.0 is released", "slug": "Django 1.0", 'posted': '2008-09-03'}
        form = PostForm(data, instance=p)
        self.assertTrue(form.is_valid())
        form = PostForm({'title': "Django 1.0 is released"})
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['posted'], ['This field is required.'])

    def test_unique_for_date_in_exclude(self):
        """
        If the date for unique_for_* constraints is excluded from the
        ModelForm (in this case 'posted' has editable=False, then the
        constraint should be ignored.
        """
        class DateTimePostForm(forms.ModelForm):
            class Meta:
                model = DateTimePost
                fields = '__all__'

        DateTimePost.objects.create(
            title="Django 1.0 is released", slug="Django 1.0",
            subtitle="Finally", posted=datetime.datetime(2008, 9, 3, 10, 10, 1),
        )
        # 'title' has unique_for_date='posted'
        form = DateTimePostForm({'title': "Django 1.0 is released", 'posted': '2008-09-03'})
        self.assertTrue(form.is_valid())
        # 'slug' has unique_for_year='posted'
        form = DateTimePostForm({'slug': "Django 1.0", 'posted': '2008-01-01'})
        self.assertTrue(form.is_valid())
        # 'subtitle' has unique_for_month='posted'
        form = DateTimePostForm({'subtitle': "Finally", 'posted': '2008-09-30'})
        self.assertTrue(form.is_valid())

    def test_inherited_unique_for_date(self):
        p = Post.objects.create(
            title="Django 1.0 is released", slug="Django 1.0",
            subtitle="Finally", posted=datetime.date(2008, 9, 3),
        )
        form = DerivedPostForm({'title': "Django 1.0 is released", 'posted': '2008-09-03'})
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['title'], ['Title must be unique for Posted date.'])
        form = DerivedPostForm({'title': "Work on Django 1.1 begins", 'posted': '2008-09-03'})
        self.assertTrue(form.is_valid())
        form = DerivedPostForm({'title': "Django 1.0 is released", 'posted': '2008-09-04'})
        self.assertTrue(form.is_valid())
        form = DerivedPostForm({'slug': "Django 1.0", 'posted': '2008-01-01'})
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['slug'], ['Slug must be unique for Posted year.'])
        form = DerivedPostForm({'subtitle': "Finally", 'posted': '2008-09-30'})
        self.assertFalse(form.is_valid())
        self.assertEqual(form.errors['subtitle'], ['Subtitle must be unique for Posted month.'])
        data = {'subtitle': "Finally", "title": "Django 1.0 is released", "slug": "Django 1.0", 'posted': '2008-09-03'}
        form = DerivedPostForm(data, instance=p)
        self.assertTrue(form.is_valid())

    def test_unique_for_date_with_nullable_date(self):
        class FlexDatePostForm(forms.ModelForm):
            class Meta:
                model = FlexibleDatePost
                fields = '__all__'

        p = FlexibleDatePost.objects.create(
            title="Django 1.0 is released", slug="Django 1.0",
            subtitle="Finally", posted=datetime.date(2008, 9, 3),
        )

        form = FlexDatePostForm({'title': "Django 1.0 is released"})
        self.assertTrue(form.is_valid())
        form = FlexDatePostForm({'slug': "Django 1.0"})
        self.assertTrue(form.is_valid())
        form = FlexDatePostForm({'subtitle': "Finally"})
        self.assertTrue(form.is_valid())
        data = {'subtitle': "Finally", "title": "Django 1.0 is released", "slug": "Django 1.0"}
        form = FlexDatePostForm(data, instance=p)
        self.assertTrue(form.is_valid())

    def test_override_unique_message(self):
        class CustomProductForm(ProductForm):
            class Meta(ProductForm.Meta):
                error_messages = {
                    'slug': {
                        'unique': "%(model_name)s's %(field_label)s not unique.",
                    }
                }

        Product.objects.create(slug='teddy-bear-blue')
        form = CustomProductForm({'slug': 'teddy-bear-blue'})
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['slug'], ["Product's Slug not unique."])

    def test_override_unique_together_message(self):
        class CustomPriceForm(PriceForm):
            class Meta(PriceForm.Meta):
                error_messages = {
                    NON_FIELD_ERRORS: {
                        'unique_together': "%(model_name)s's %(field_labels)s not unique.",
                    }
                }

        Price.objects.create(price=6.00, quantity=1)
        form = CustomPriceForm({'price': '6.00', 'quantity': '1'})
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors[NON_FIELD_ERRORS], ["Price's Price and Quantity not unique."])

    def test_override_unique_for_date_message(self):
        class CustomPostForm(PostForm):
            class Meta(PostForm.Meta):
                error_messages = {
                    'title': {
                        'unique_for_date': (
                            "%(model_name)s's %(field_label)s not unique "
                            "for %(date_field_label)s date."
                        ),
                    }
                }

        Post.objects.create(
            title="Django 1.0 is released", slug="Django 1.0",
            subtitle="Finally", posted=datetime.date(2008, 9, 3),
        )
        form = CustomPostForm({'title': "Django 1.0 is released", 'posted': '2008-09-03'})
        self.assertEqual(len(form.errors), 1)
        self.assertEqual(form.errors['title'], ["Post's Title not unique for Posted date."])


class ModelFormBasicTests(TestCase):
    def create_basic_data(self):
        self.c1 = Category.objects.create(
            name="Entertainment", slug="entertainment", url="entertainment")
        self.c2 = Category.objects.create(
            name="It's a test", slug="its-test", url="test")
        self.c3 = Category.objects.create(
            name="Third test", slug="third-test", url="third")
        self.w_royko = Writer.objects.create(name='Mike Royko')
        self.w_woodward = Writer.objects.create(name='Bob Woodward')

    def test_base_form(self):
        self.assertEqual(Category.objects.count(), 0)
        f = BaseCategoryForm()
        self.assertHTMLEqual(
            str(f),
            """<tr><th><label for="id_name">Name:</label></th>
<td><input id="id_name" type="text" name="name" maxlength="20" required /></td></tr>
<tr><th><label for="id_slug">Slug:</label></th>
<td><input id="id_slug" type="text" name="slug" maxlength="20" required /></td></tr>
<tr><th><label for="id_url">The URL:</label></th>
<td><input id="id_url" type="text" name="url" maxlength="40" required /></td></tr>"""
        )
        self.assertHTMLEqual(
            str(f.as_ul()),
            """<li><label for="id_name">Name:</label> <input id="id_name" type="text" name="name" maxlength="20" required /></li>
<li><label for="id_slug">Slug:</label> <input id="id_slug" type="text" name="slug" maxlength="20" required /></li>
<li><label for="id_url">The URL:</label> <input id="id_url" type="text" name="url" maxlength="40" required /></li>"""
        )
        self.assertHTMLEqual(
            str(f["name"]),
            """<input id="id_name" type="text" name="name" maxlength="20" required />""")

    def test_auto_id(self):
        f = BaseCategoryForm(auto_id=False)
        self.assertHTMLEqual(
            str(f.as_ul()),
            """<li>Name: <input type="text" name="name" maxlength="20" required /></li>
<li>Slug: <input type="text" name="slug" maxlength="20" required /></li>
<li>The URL: <input type="text" name="url" maxlength="40" required /></li>"""
        )

    def test_initial_values(self):
        self.create_basic_data()
        # Initial values can be provided for model forms
        f = ArticleForm(
            auto_id=False,
            initial={
                'headline': 'Your headline here',
                'categories': [str(self.c1.id), str(self.c2.id)]
            })
        self.assertHTMLEqual(
            f.as_ul(),
            '''<li>Headline: <input type="text" name="headline" value="Your headline here" maxlength="50" required /></li>
<li>Slug: <input type="text" name="slug" maxlength="50" required /></li>
<li>Pub date: <input type="text" name="pub_date" required /></li>
<li>Writer: <select name="writer" required>
<option value="" selected>---------</option>
<option value="%s">Bob Woodward</option>
<option value="%s">Mike Royko</option>
</select></li>
<li>Article: <textarea rows="10" cols="40" name="article" required></textarea></li>
<li>Categories: <select multiple="multiple" name="categories">
<option value="%s" selected>Entertainment</option>
<option value="%s" selected>It&#39;s a test</option>
<option value="%s">Third test</option>
</select></li>
<li>Status: <select name="status">
<option value="" selected>---------</option>
<option value="1">Draft</option>
<option value="2">Pending</option>
<option value="3">Live</option>
</select></li>''' % (self.w_woodward.pk, self.w_royko.pk, self.c1.pk, self.c2.pk, self.c3.pk))

        # When the ModelForm is passed an instance, that instance's current values are
        # inserted as 'initial' data in each Field.
        f = RoykoForm(auto_id=False, instance=self.w_royko)
        self.assertHTMLEqual(
            six.text_type(f),
            '''<tr><th>Name:</th><td><input type="text" name="name" value="Mike Royko" maxlength="50" required /><br />
            <span class="helptext">Use both first and last names.</span></td></tr>'''
        )

        art = Article.objects.create(
            headline='Test article',
            slug='test-article',
            pub_date=datetime.date(1988, 1, 4),
            writer=self.w_royko,
            article='Hello.'
        )
        art_id_1 = art.id

        f = ArticleForm(auto_id=False, instance=art)
        self.assertHTMLEqual(
            f.as_ul(),
            '''<li>Headline: <input type="text" name="headline" value="Test article" maxlength="50" required /></li>
<li>Slug: <input type="text" name="slug" value="test-article" maxlength="50" required /></li>
<li>Pub date: <input type="text" name="pub_date" value="1988-01-04" required /></li>
<li>Writer: <select name="writer" required>
<option value="">---------</option>
<option value="%s">Bob Woodward</option>
<option value="%s" selected>Mike Royko</option>
</select></li>
<li>Article: <textarea rows="10" cols="40" name="article" required>Hello.</textarea></li>
<li>Categories: <select multiple="multiple" name="categories">
<option value="%s">Entertainment</option>
<option value="%s">It&#39;s a test</option>
<option value="%s">Third test</option>
</select></li>
<li>Status: <select name="status">
<option value="" selected>---------</option>
<option value="1">Draft</option>
<option value="2">Pending</option>
<option value="3">Live</option>
</select></li>''' % (self.w_woodward.pk, self.w_royko.pk, self.c1.pk, self.c2.pk, self.c3.pk))

        f = ArticleForm({
            'headline': 'Test headline',
            'slug': 'test-headline',
            'pub_date': '1984-02-06',
            'writer': six.text_type(self.w_royko.pk),
            'article': 'Hello.'
        }, instance=art)
        self.assertEqual(f.errors, {})
        self.assertTrue(f.is_valid())
        test_art = f.save()
        self.assertEqual(test_art.id, art_id_1)
        test_art = Article.objects.get(id=art_id_1)
        self.assertEqual(test_art.headline, 'Test headline')

    def test_m2m_initial_callable(self):
        """
        Regression for #10349: A callable can be provided as the initial value for an m2m field
        """
        self.maxDiff = 1200
        self.create_basic_data()

        # Set up a callable initial value
        def formfield_for_dbfield(db_field, **kwargs):
            if db_field.name == 'categories':
                kwargs['initial'] = lambda: Category.objects.all().order_by('name')[:2]
            return db_field.formfield(**kwargs)

        # Create a ModelForm, instantiate it, and check that the output is as expected
        ModelForm = modelform_factory(Article, fields=['headline', 'categories'],
                                      formfield_callback=formfield_for_dbfield)
        form = ModelForm()
        self.assertHTMLEqual(
            form.as_ul(),
            """<li><label for="id_headline">Headline:</label>
<input id="id_headline" type="text" name="headline" maxlength="50" required /></li>
<li><label for="id_categories">Categories:</label>
<select multiple="multiple" name="categories" id="id_categories">
<option value="%d" selected>Entertainment</option>
<option value="%d" selected>It&39;s a test</option>
<option value="%d">Third test</option>
</select></li>"""
            % (self.c1.pk, self.c2.pk, self.c3.pk))

    def test_basic_creation(self):
        self.assertEqual(Category.objects.count(), 0)
        f = BaseCategoryForm({'name': 'Entertainment',
                              'slug': 'entertainment',
                              'url': 'entertainment'})
        self.assertTrue(f.is_valid())
        self.assertEqual(f.cleaned_data['name'], 'Entertainment')
        self.assertEqual(f.cleaned_data['slug'], 'entertainment')
        self.assertEqual(f.cleaned_data['url'], 'entertainment')
        c1 = f.save()
        # Testing whether the same object is returned from the
        # ORM... not the fastest way...

        self.assertEqual(Category.objects.count(), 1)
        self.assertEqual(c1, Category.objects.all()[0])
        self.assertEqual(c1.name, "Entertainment")

    def test_save_commit_false(self):
        # If you call save() with commit=False, then it will return an object that
        # hasn't yet been saved to the database. In this case, it's up to you to call
        # save() on the resulting model instance.
        f = BaseCategoryForm({'name': 'Third test', 'slug': 'third-test', 'url': 'third'})
        self.assertTrue(f.is_valid())
        c1 = f.save(commit=False)
        self.assertEqual(c1.name, "Third test")
        self.assertEqual(Category.objects.count(), 0)
        c1.save()
        self.assertEqual(Category.objects.count(), 1)

    def test_save_with_data_errors(self):
        # If you call save() with invalid data, you'll get a ValueError.
        f = BaseCategoryForm({'name': '', 'slug': 'not a slug!', 'url': 'foo'})
        self.assertEqual(f.errors['name'], ['This field is required.'])
        self.assertEqual(
            f.errors['slug'],
            ["Enter a valid 'slug' consisting of letters, numbers, underscores or hyphens."]
        )
        self.assertEqual(f.cleaned_data, {'url': 'foo'})
        with self.assertRaises(ValueError):
            f.save()
        f = BaseCategoryForm({'name': '', 'slug': '', 'url': 'foo'})
        with self.assertRaises(ValueError):
            f.save()

    def test_multi_fields(self):
        self.create_basic_data()
        self.maxDiff = None
        # ManyToManyFields are represented by a MultipleChoiceField, ForeignKeys and any
        # fields with the 'choices' attribute are represented by a ChoiceField.
        f = ArticleForm(auto_id=False)
        self.assertHTMLEqual(
            six.text_type(f),
            '''<tr><th>Headline:</th><td><input type="text" name="headline" maxlength="50" required /></td></tr>
<tr><th>Slug:</th><td><input type="text" name="slug" maxlength="50" required /></td></tr>
<tr><th>Pub date:</th><td><input type="text" name="pub_date" required /></td></tr>
<tr><th>Writer:</th><td><select name="writer" required>
<option value="" selected>---------</option>
<option value="%s">Bob Woodward</option>
<option value="%s">Mike Royko</option>
</select></td></tr>
<tr><th>Article:</th><td><textarea rows="10" cols="40" name="article" required></textarea></td></tr>
<tr><th>Categories:</th><td><select multiple="multiple" name="categories">
<option value="%s">Entertainment</option>
<option value="%s">It&#39;s a test</option>
<option value="%s">Third test</option>
</select></td></tr>
<tr><th>Status:</th><td><select name="status">
<option value="" selected>---------</option>
<option value="1">Draft</option>
<option value="2">Pending</option>
<option value="3">Live</option>
</select></td></tr>''' % (self.w_woodward.pk, self.w_royko.pk, self.c1.pk, self.c2.pk, self.c3.pk))

        # Add some categories and test the many-to-many form output.
        new_art = Article.objects.create(
            article="Hello.", headline="New headline", slug="new-headline",
            pub_date=datetime.date(1988, 1, 4), writer=self.w_royko)
        new_art.categories.add(Category.objects.get(name='Entertainment'))
        self.assertQuerysetEqual(new_art.categories.all(), ["Entertainment"])
        f = ArticleForm(auto_id=False, instance=new_art)
        self.assertHTMLEqual(
            f.as_ul(),
            '''<li>Headline: <input type="text" name="headline" value="New headline" maxlength="50" required /></li>
<li>Slug: <input type="text" name="slug" value="new-headline" maxlength="50" required /></li>
<li>Pub date: <input type="text" name="pub_date" value="1988-01-04" required /></li>
<li>Writer: <select name="writer" required>
<option value="">---------</option>
<option value="%s">Bob Woodward</option>
<option value="%s" selected>Mike Royko</option>
</select></li>
<li>Article: <textarea rows="10" cols="40" name="article" required>Hello.</textarea></li>
<li>Categories: <select multiple="multiple" name="categories">
<option value="%s" selected>Entertainment</option>
<option value="%s">It&#39;s a test</option>
<option value="%s">Third test</option>
</select></li>
<li>Status: <select name="status">
<option value="" selected>---------</option>
<option value="1">Draft</option>
<option value="2">Pending</option>
<option value="3">Live</option>
</select></li>''' % (self.w_woodward.pk, self.w_royko.pk, self.c1.pk, self.c2.pk, self.c3.pk))

    def test_subset_fields(self):
        # You can restrict a form to a subset of the complete list of fields
        # by providing a 'fields' argument. If you try to save a
        # model created with such a form, you need to ensure that the fields
        # that are _not_ on the form have default values, or are allowed to have
        # a value of None. If a field isn't specified on a form, the object created
        # from the form can't provide a value for that field!
        class PartialArticleForm(forms.ModelForm):
            class Meta:
                model = Article
                fields = ('headline', 'pub_date')

        f = PartialArticleForm(auto_id=False)
        self.assertHTMLEqual(
            six.text_type(f),
            '''<tr><th>Headline:</th><td><input type="text" name="headline" maxlength="50" required /></td></tr>
<tr><th>Pub date:</th><td><input type="text" name="pub_date" required /></td></tr>''')

        # You can create a form over a subset of the available fields
        # by specifying a 'fields' argument to form_for_instance.
        class PartialArticleFormWithSlug(forms.ModelForm):
            class Meta:
                model = Article
                fields = ('headline', 'slug', 'pub_date')

        w_royko = Writer.objects.create(name='Mike Royko')
        art = Article.objects.create(
            article="Hello.", headline="New headline", slug="new-headline",
            pub_date=datetime.date(1988, 1, 4), writer=w_royko)
        f = PartialArticleFormWithSlug({
            'headline': 'New headline',
            'slug': 'new-headline',
            'pub_date': '1988-01-04'
        }, auto_id=False, instance=art)
        self.assertHTMLEqual(
            f.as_ul(),
            '''<li>Headline: <input type="text" name="headline" value="New headline" maxlength="50" required /></li>
<li>Slug: <input type="text" name="slug" value="new-headline" maxlength="50" required /></li>
<li>Pub date: <input type="text" name="pub_date" value="1988-01-04" required /></li>'''
        )
        self.assertTrue(f.is_valid())
        new_art = f.save()
        self.assertEqual(new_art.id, art.id)
        new_art = Article.objects.get(id=art.id)
        self.assertEqual(new_art.headline, 'New headline')

    def test_m2m_editing(self):
        self.create_basic_data()
        form_data = {
            'headline': 'New headline',
            'slug': 'new-headline',
            'pub_date': '1988-01-04',
            'writer': six.text_type(self.w_royko.pk),
            'article': 'Hello.',
            'categories': [six.text_type(self.c1.id), six.text_type(self.c2.id)]
        }
        # Create a new article, with categories, via the form.
        f = ArticleForm(form_data)
        new_art = f.save()
        new_art = Article.objects.get(id=new_art.id)
        art_id_1 = new_art.id
        self.assertQuerysetEqual(new_art.categories.order_by('name'), ["Entertainment", "It's a test"])

        # Now, submit form data with no categories. This deletes the existing categories.
        form_data['categories'] = []
        f = ArticleForm(form_data, instance=new_art)
        new_art = f.save()
        self.assertEqual(new_art.id, art_id_1)
        new_art = Article.objects.get(id=art_id_1)
        self.assertQuerysetEqual(new_art.categories.all(), [])

        # Create a new article, with no categories, via the form.
        f = ArticleForm(form_data)
        new_art = f.save()
        art_id_2 = new_art.id
        self.assertNotIn(art_id_2, (None, art_id_1))
        new_art = Article.objects.get(id=art_id_2)
        self.assertQuerysetEqual(new_art.categories.all(), [])

        # Create a new article, with categories, via the form, but use commit=False.
        # The m2m data won't be saved until save_m2m() is invoked on the form.
        form_data['categories'] = [six.text_type(self.c1.id), six.text_type(self.c2.id)]
        f = ArticleForm(form_data)
        new_art = f.save(commit=False)

        # Manually save the instance
        new_art.save()
        art_id_3 = new_art.id
        self.assertNotIn(art_id_3, (None, art_id_1, art_id_2))

        # The instance doesn't have m2m data yet
        new_art = Article.objects.get(id=art_id_3)
        self.assertQuerysetEqual(new_art.categories.all(), [])

        # Save the m2m data on the form
        f.save_m2m()
        self.assertQuerysetEqual(new_art.categories.order_by('name'), ["Entertainment", "It's a test"])

    def test_custom_form_fields(self):
        # Here, we define a custom ModelForm. Because it happens to have the same fields as
        # the Category model, we can just call the form's save() to apply its changes to an
        # existing Category instance.
        class ShortCategory(forms.ModelForm):
            name = forms.CharField(max_length=5)
            slug = forms.CharField(max_length=5)
            url = forms.CharField(max_length=3)

            class Meta:
                model = Category
                fields = '__all__'

        cat = Category.objects.create(name='Third test')
        form = ShortCategory({'name': 'Third', 'slug': 'third', 'url': '3rd'}, instance=cat)
        self.assertEqual(form.save().name, 'Third')
        self.assertEqual(Category.objects.get(id=cat.id).name, 'Third')

    def test_runtime_choicefield_populated(self):
        self.maxDiff = None
        # Here, we demonstrate that choices for a ForeignKey ChoiceField are determined
        # at runtime, based on the data in the database when the form is displayed, not
        # the data in the database when the form is instantiated.
        self.create_basic_data()
        f = ArticleForm(auto_id=False)
        self.assertHTMLEqual(
            f.as_ul(),
            '''<li>Headline: <input type="text" name="headline" maxlength="50" required /></li>
<li>Slug: <input type="text" name="slug" maxlength="50" required /></li>
<li>Pub date: <input type="text" name="pub_date" required /></li>
<li>Writer: <select name="writer" required>
<option value="" selected>---------</option>
<option value="%s">Bob Woodward</option>
<option value="%s">Mike Royko</option>
</select></li>
<li>Article: <textarea rows="10" cols="40" name="article" required></textarea></li>
<li>Categories: <select multiple="multiple" name="categories">
<option value="%s">Entertainment</option>
<option value="%s">It&#39;s a test</option>
<option value="%s">Third test</option>
</select> </li>
<li>Status: <select name="status">
<option value="" selected>---------</option>
<option value="1">Draft</option>
<option value="2">Pending</option>
<option value="3">Live</option>
</select></li>''' % (self.w_woodward.pk, self.w_royko.pk, self.c1.pk, self.c2.pk, self.c3.pk))

        c4 = Category.objects.create(name='Fourth', url='4th')
        w_bernstein = Writer.objects.create(name='Carl Bernstein')
        self.assertHTMLEqual(
            f.as_ul(),
            '''<li>Headline: <input type="text" name="headline" maxlength="50" required /></li>
<li>Slug: <input type="text" name="slug" maxlength="50" required /></li>
<li>Pub