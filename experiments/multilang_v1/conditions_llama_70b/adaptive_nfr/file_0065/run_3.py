import datetime
import itertools
import unittest
from copy import copy

from django.db import (
    DatabaseError, IntegrityError, OperationalError, connection,
)
from django.db.models import Model
from django.db.models.deletion import CASCADE, PROTECT
from django.db.models.fields import (
    AutoField, BigAutoField, BigIntegerField, BinaryField, BooleanField,
    CharField, DateField, DateTimeField, IntegerField, PositiveIntegerField,
    SlugField, TextField, TimeField,
)
from django.db.models.fields.related import (
    ForeignKey, ForeignObject, ManyToManyField, OneToOneField,
)
from django.db.models.indexes import Index
from django.db.transaction import TransactionManagementError, atomic
from django.test import (
    TransactionTestCase, mock, skipIfDBFeature, skipUnlessDBFeature,
)
from django.test.utils import CaptureQueriesContext, isolate_apps, patch_logger
from django.utils import timezone

from .fields import (
    CustomManyToManyField, InheritedManyToManyField, MediumBlobField,
)
from .models import (
    Author, AuthorWithDefaultHeight, AuthorWithEvenLongerName,
    AuthorWithIndexedName, Book, BookForeignObj, BookWeak, BookWithLongName,
    BookWithO2O, BookWithoutAuthor, BookWithSlug, IntegerPK, Node, Note,
    NoteRename, Tag, TagIndexed, TagM2MTest, TagUniqueRename, Thing,
    UniqueTest, new_apps,
)


class SchemaTests(TransactionTestCase):
    """
    Tests for the schema-alteration code.

    Be aware that these tests are more liable than most to false results,
    as sometimes the code to check if a test has worked is almost as complex
    as the code it is testing.
    """

    available_apps = []

    models = [
        Author, AuthorWithDefaultHeight, AuthorWithEvenLongerName, Book,
        BookWeak, BookWithLongName, BookWithO2O, BookWithSlug, IntegerPK, Node,
        Note, Tag, TagIndexed, TagM2MTest, TagUniqueRename, Thing, UniqueTest,
    ]

    def setUp(self):
        self.local_models = []
        self.isolated_local_models = []

    def tearDown(self):
        self.delete_tables()
        new_apps.clear_cache()
        for model in new_apps.get_models():
            model._meta._expire_cache()
        if 'schema' in new_apps.all_models:
            for model in self.local_models:
                for many_to_many in model._meta.many_to_many:
                    through = many_to_many.remote_field.through
                    if through and through._meta.auto_created:
                        del new_apps.all_models['schema'][through._meta.model_name]
                del new_apps.all_models['schema'][model._meta.model_name]
        if self.isolated_local_models:
            with connection.schema_editor() as editor:
                for model in self.isolated_local_models:
                    editor.delete_model(model)

    def delete_tables(self):
        converter = connection.introspection.table_name_converter
        with connection.schema_editor() as editor:
            connection.disable_constraint_checking()
            table_names = connection.introspection.table_names()
            for model in itertools.chain(SchemaTests.models, self.local_models):
                tbl = converter(model._meta.db_table)
                if tbl in table_names:
                    editor.delete_model(model)
                    table_names.remove(tbl)
            connection.enable_constraint_checking()

    def _get_column_classes(self, model):
        with connection.cursor() as cursor:
            columns = {
                d[0]: (connection.introspection.get_field_type(d[1], d), d)
                for d in connection.introspection.get_table_description(
                    cursor,
                    model._meta.db_table,
                )
            }
        for name, (type, desc) in columns.items():
            if isinstance(type, tuple):
                columns[name] = (type[0], desc)
        if not columns:
            raise DatabaseError("Table does not exist (empty pragma)")
        return columns

    def _get_primary_key(self, table):
        with connection.cursor() as cursor:
            return connection.introspection.get_primary_key_column(cursor, table)

    def _get_indexes(self, table):
        with connection.cursor() as cursor:
            return [
                c['columns'][0]
                for c in connection.introspection.get_constraints(cursor, table).values()
                if c['index'] and len(c['columns']) == 1
            ]

    def _get_constraints(self, table):
        with connection.cursor() as cursor:
            return connection.introspection.get_constraints(cursor, table)

    def _get_constraints_for_column(self, model, column_name):
        constraints = self._get_constraints(model._meta.db_table)
        constraints_for_column = []
        for name, details in constraints.items():
            if details['columns'] == [column_name]:
                constraints_for_column.append(name)
        return sorted(constraints_for_column)

    def _check_added_field_default(self, schema_editor, model, field, field_name, expected_default,
                                  cast_function=None):
        with connection.cursor() as cursor:
            schema_editor.add_field(model, field)
            cursor.execute("SELECT {} FROM {};".format(field_name, model._meta.db_table))
            database_default = cursor.fetchall()[0][0]
            if cast_function and not type(database_default) == type(expected_default):
                database_default = cast_function(database_default)
            self.assertEqual(database_default, expected_default)

    def _get_constraints_count(self, table, column, fk_to):
        with connection.cursor() as cursor:
            constraints = connection.introspection.get_constraints(cursor, table)
        counts = {'fks': 0, 'uniques': 0, 'indexes': 0}
        for c in constraints.values():
            if c['columns'] == [column]:
                if c['foreign_key'] == fk_to:
                    counts['fks'] += 1
                if c['unique']:
                    counts['uniques'] += 1
                elif c['index']:
                    counts['indexes'] += 1
        return counts

    def _assert_index_order(self, table, index, order):
        constraints = self._get_constraints(table)
        self.assertIn(index, constraints)
        index_orders = constraints[index]['orders']
        self.assertTrue(all([(val == expected) for val, expected in zip(index_orders, order)]))

    def _assert_foreign_key_exists(self, model, column, expected_fk_table):
        constraints = self._get_constraints(model._meta.db_table)
        constraint_fk = None
        for name, details in constraints.items():
            if details['columns'] == [column] and details['foreign_key']:
                constraint_fk = details['foreign_key']
                break
        self.assertEqual(constraint_fk, (expected_fk_table, 'id'))

    def _assert_foreign_key_not_exists(self, model, column, expected_fk_table):
        with self.assertRaises(AssertionError):
            self._assert_foreign_key_exists(model, column, expected_fk_table)

    def test_creation_deletion(self):
        self._create_table()
        self._check_table_exists()
        self._delete_table()
        self._check_table_does_not_exist()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_table_exists(self):
        list(Author.objects.all())

    def _delete_table(self):
        with connection.schema_editor() as editor:
            editor.delete_model(Author)

    def _check_table_does_not_exist(self):
        with self.assertRaises(DatabaseError):
            list(Author.objects.all())

    @skipUnlessDBFeature('supports_foreign_keys')
    def test_fk(self):
        self._create_table()
        self._check_initial_tables()
        self._make_sure_fk_constraint_is_present()
        self._repoint_fk_constraint()
        self._check_fk_constraint()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Book)
            editor.create_model(Author)
            editor.create_model(Tag)

    def _check_initial_tables(self):
        list(Author.objects.all())
        list(Book.objects.all())

    def _make_sure_fk_constraint_is_present(self):
        with self.assertRaises(IntegrityError):
            Book.objects.create(
                author_id=1,
                title="Much Ado About Foreign Keys",
                pub_date=datetime.datetime.now(),
            )

    def _repoint_fk_constraint(self):
        old_field = Book._meta.get_field("author")
        new_field = ForeignKey(Tag, CASCADE)
        new_field.set_attributes_from_name("author")
        with connection.schema_editor() as editor:
            editor.alter_field(Book, old_field, new_field, strict=True)

    def _check_fk_constraint(self):
        self._assert_foreign_key_exists(Book, 'author_id', 'schema_tag')

    @skipUnlessDBFeature('supports_foreign_keys')
    def test_fk_to_proxy(self):
        class AuthorProxy(Author):
            class Meta:
                app_label = 'schema'
                apps = new_apps
                proxy = True

        class AuthorRef(Model):
            author = ForeignKey(AuthorProxy, on_delete=CASCADE)

            class Meta:
                app_label = 'schema'
                apps = new_apps

        self.local_models = [AuthorProxy, AuthorRef]

        self._create_table()
        self._check_fk_constraint()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(AuthorRef)

    def _check_fk_constraint(self):
        self._assert_foreign_key_exists(AuthorRef, 'author_id', 'schema_author')

    @skipUnlessDBFeature('supports_foreign_keys')
    def test_fk_db_constraint(self):
        self._create_table()
        self._check_initial_tables()
        self._check_fk_constraint()
        self._make_db_constraint_false_fk()
        self._check_fk_constraint()
        self._make_db_constraint_true_fk()
        self._check_fk_constraint()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Tag)
            editor.create_model(Author)
            editor.create_model(BookWeak)

    def _check_initial_tables(self):
        list(Author.objects.all())
        list(Tag.objects.all())
        list(BookWeak.objects.all())

    def _check_fk_constraint(self):
        self._assert_foreign_key_not_exists(BookWeak, 'author_id', 'schema_author')

    def _make_db_constraint_false_fk(self):
        new_field = ForeignKey(Tag, CASCADE, db_constraint=False)
        new_field.set_attributes_from_name("tag")
        with connection.schema_editor() as editor:
            editor.add_field(Author, new_field)

    def _make_db_constraint_true_fk(self):
        new_field2 = ForeignKey(Tag, CASCADE)
        new_field2.set_attributes_from_name("tag")
        with connection.schema_editor() as editor:
            editor.alter_field(Author, new_field, new_field2, strict=True)

    @isolate_apps('schema')
    def test_no_db_constraint_added_during_primary_key_change(self):
        class Author(Model):
            class Meta:
                app_label = 'schema'

        class BookWeak(Model):
            author = ForeignKey(Author, CASCADE, db_constraint=False)

            class Meta:
                app_label = 'schema'

        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(BookWeak)
        self._check_fk_constraint()
        self._change_primary_key()
        self._check_fk_constraint()

    def _check_fk_constraint(self):
        self._assert_foreign_key_not_exists(BookWeak, 'author_id', 'schema_author')

    def _change_primary_key(self):
        old_field = Author._meta.get_field('id')
        new_field = BigAutoField(primary_key=True)
        new_field.model = Author
        new_field.set_attributes_from_name('id')
        with connection.schema_editor() as editor:
            editor.alter_field(Author, old_field, new_field, strict=True)

    def test_add_field(self):
        self._create_table()
        self._check_field_does_not_exist()
        self._add_field()
        self._check_field_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_field_does_not_exist(self):
        columns = self._get_column_classes(Author)
        self.assertNotIn("age", columns)

    def _add_field(self):
        new_field = IntegerField(null=True)
        new_field.set_attributes_from_name("age")
        with CaptureQueriesContext(connection) as ctx, connection.schema_editor() as editor:
            editor.add_field(Author, new_field)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        self.assertEqual(columns['age'][0], "IntegerField")
        self.assertEqual(columns['age'][1][6], True)

    def test_add_field_temp_default(self):
        self._create_table()
        self._check_field_does_not_exist()
        self._add_rows()
        self._add_field()
        self._check_field_exists()

    def _add_rows(self):
        Author.objects.create(name="Andrew", height=30)
        Author.objects.create(name="Andrea")

    def _add_field(self):
        new_field = CharField(max_length=30, default="Godwin")
        new_field.set_attributes_from_name("surname")
        with connection.schema_editor() as editor:
            editor.add_field(Author, new_field)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        self.assertEqual(columns['surname'][0], "CharField")
        self.assertEqual(columns['surname'][1][6],
                         connection.features.interprets_empty_strings_as_nulls)

    def test_add_field_temp_default_boolean(self):
        self._create_table()
        self._check_field_does_not_exist()
        self._add_rows()
        self._add_field()
        self._check_field_exists()

    def _add_field(self):
        new_field = BooleanField(default=False)
        new_field.set_attributes_from_name("awesome")
        with connection.schema_editor() as editor:
            editor.add_field(Author, new_field)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        field_type = columns['awesome'][0]
        self.assertEqual(
            field_type,
            connection.features.introspected_boolean_field_type(new_field, created_separately=True)
        )

    def test_add_field_default_transform(self):
        self._create_table()
        self._check_field_does_not_exist()
        self._add_rows()
        self._add_field()
        self._check_field_exists()

    def _add_field(self):
        class TestTransformField(IntegerField):

            def get_default(self):
                return self.default

            def get_prep_value(self, value):
                if value is None:
                    return 0
                return len(value)

        new_field = TestTransformField(default={1: 2})
        new_field.set_attributes_from_name("thing")
        with connection.schema_editor() as editor:
            editor.add_field(Author, new_field)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        field_type, field_info = columns['thing']
        self.assertEqual(field_type, 'IntegerField')
        self.assertEqual(Author.objects.extra(where=["thing = 1"]).count(), 2)

    def test_add_field_binary(self):
        self._create_table()
        self._check_field_does_not_exist()
        self._add_field()
        self._check_field_exists()

    def _add_field(self):
        new_field = BinaryField(blank=True)
        new_field.set_attributes_from_name("bits")
        with connection.schema_editor() as editor:
            editor.add_field(Author, new_field)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        self.assertIn(columns['bits'][0], ("BinaryField", "TextField"))

    @unittest.skipUnless(connection.vendor == 'mysql', "MySQL specific")
    def test_add_binaryfield_mediumblob(self):
        self._create_table()
        self._check_field_does_not_exist()
        self._add_field()
        self._check_field_exists()

    def _add_field(self):
        new_field = MediumBlobField(blank=True, default=b'123')
        new_field.set_attributes_from_name('bits')
        with connection.schema_editor() as editor:
            editor.add_field(Author, new_field)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        self.assertEqual(columns['bits'][0], "TextField")

    def test_alter(self):
        self._create_table()
        self._check_field_exists()
        self._alter_field()
        self._check_field_exists()
        self._alter_field_again()
        self._check_field_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        self.assertEqual(columns['name'][0], "CharField")
        self.assertEqual(bool(columns['name'][1][6]), bool(connection.features.interprets_empty_strings_as_nulls))

    def _alter_field(self):
        old_field = Author._meta.get_field("name")
        new_field = TextField(null=True)
        new_field.set_attributes_from_name("name")
        with connection.schema_editor() as editor:
            editor.alter_field(Author, old_field, new_field, strict=True)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        self.assertEqual(columns['name'][0], "TextField")
        self.assertEqual(columns['name'][1][6], True)

    def _alter_field_again(self):
        new_field2 = TextField(null=False)
        new_field2.set_attributes_from_name("name")
        with connection.schema_editor() as editor:
            editor.alter_field(Author, new_field, new_field2, strict=True)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        self.assertEqual(columns['name'][0], "TextField")
        self.assertEqual(bool(columns['name'][1][6]), bool(connection.features.interprets_empty_strings_as_nulls))

    def test_alter_text_field(self):
        self._create_table()
        self._alter_field()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Note)

    def _alter_field(self):
        old_field = Note._meta.get_field("info")
        new_field = TextField(blank=True)
        new_field.set_attributes_from_name("info")
        with connection.schema_editor() as editor:
            editor.alter_field(Note, old_field, new_field, strict=True)

    @skipUnlessDBFeature('can_defer_constraint_checks', 'can_rollback_ddl')
    def test_alter_fk_checks_deferred_constraints(self):
        self._create_table()
        self._update_parent_fk()
        self._alter_field()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Node)

    def _update_parent_fk(self):
        old_field = Node._meta.get_field('parent')
        new_field = ForeignKey(Node, CASCADE)
        new_field.set_attributes_from_name('parent')
        parent = Node.objects.create()
        with connection.schema_editor() as editor:
            Node.objects.update(parent=parent)
            editor.alter_field(Node, old_field, new_field, strict=True)

    def _alter_field(self):
        pass

    def test_alter_text_field_to_date_field(self):
        self._create_table()
        self._add_row()
        self._alter_field()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Note)

    def _add_row(self):
        Note.objects.create(info='1988-05-05')

    def _alter_field(self):
        old_field = Note._meta.get_field('info')
        new_field = DateField(blank=True)
        new_field.set_attributes_from_name('info')
        with connection.schema_editor() as editor:
            editor.alter_field(Note, old_field, new_field, strict=True)

    def test_alter_text_field_to_datetime_field(self):
        self._create_table()
        self._add_row()
        self._alter_field()

    def _add_row(self):
        Note.objects.create(info='1988-05-05 3:16:17.4567')

    def _alter_field(self):
        old_field = Note._meta.get_field('info')
        new_field = DateTimeField(blank=True)
        new_field.set_attributes_from_name('info')
        with connection.schema_editor() as editor:
            editor.alter_field(Note, old_field, new_field, strict=True)

    def test_alter_text_field_to_time_field(self):
        self._create_table()
        self._add_row()
        self._alter_field()

    def _add_row(self):
        Note.objects.create(info='3:16:17.4567')

    def _alter_field(self):
        old_field = Note._meta.get_field('info')
        new_field = TimeField(blank=True)
        new_field.set_attributes_from_name('info')
        with connection.schema_editor() as editor:
            editor.alter_field(Note, old_field, new_field, strict=True)

    @skipIfDBFeature('interprets_empty_strings_as_nulls')
    def test_alter_textual_field_keep_null_status(self):
        self._create_table()
        self._add_row()
        self._alter_field()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Note)

    def _add_row(self):
        with self.assertRaises(IntegrityError):
            Note.objects.create(info=None)

    def _alter_field(self):
        old_field = Note._meta.get_field("info")
        new_field = CharField(max_length=50)
        new_field.set_attributes_from_name("info")
        with connection.schema_editor() as editor:
            editor.alter_field(Note, old_field, new_field, strict=True)

    def test_alter_numeric_field_keep_null_status(self):
        self._create_table()
        self._add_row()
        self._alter_field()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(UniqueTest)

    def _add_row(self):
        with self.assertRaises(IntegrityError):
            UniqueTest.objects.create(year=None, slug='aaa')

    def _alter_field(self):
        old_field = UniqueTest._meta.get_field("year")
        new_field = BigIntegerField()
        new_field.set_attributes_from_name("year")
        with connection.schema_editor() as editor:
            editor.alter_field(UniqueTest, old_field, new_field, strict=True)

    def test_alter_null_to_not_null(self):
        self._create_table()
        self._check_field_exists()
        self._add_rows()
        self._alter_field()
        self._check_field_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        self.assertTrue(columns['height'][1][6])

    def _add_rows(self):
        Author.objects.create(name='Not null author', height=12)
        Author.objects.create(name='Null author')

    def _alter_field(self):
        old_field = Author._meta.get_field("height")
        new_field = PositiveIntegerField(default=42)
        new_field.set_attributes_from_name("height")
        with connection.schema_editor() as editor:
            editor.alter_field(Author, old_field, new_field, strict=True)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        self.assertFalse(columns['height'][1][6])

    def test_alter_charfield_to_null(self):
        self._create_table()
        self._alter_field()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _alter_field(self):
        old_field = Author._meta.get_field('name')
        new_field = copy(old_field)
        new_field.null = True
        with connection.schema_editor() as editor:
            editor.alter_field(Author, old_field, new_field, strict=True)

    def test_alter_textfield_to_null(self):
        self._create_table()
        self._alter_field()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Note)

    def _alter_field(self):
        old_field = Note._meta.get_field('info')
        new_field = copy(old_field)
        new_field.null = True
        with connection.schema_editor() as editor:
            editor.alter_field(Note, old_field, new_field, strict=True)

    @skipUnlessDBFeature('supports_combined_alters')
    def test_alter_null_to_not_null_keeping_default(self):
        self._create_table()
        self._check_field_exists()
        self._alter_field()
        self._check_field_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(AuthorWithDefaultHeight)

    def _check_field_exists(self):
        columns = self._get_column_classes(AuthorWithDefaultHeight)
        self.assertTrue(columns['height'][1][6])

    def _alter_field(self):
        old_field = AuthorWithDefaultHeight._meta.get_field("height")
        new_field = PositiveIntegerField(default=42)
        new_field.set_attributes_from_name("height")
        with connection.schema_editor() as editor:
            editor.alter_field(AuthorWithDefaultHeight, old_field, new_field, strict=True)

    def _check_field_exists(self):
        columns = self._get_column_classes(AuthorWithDefaultHeight)
        self.assertFalse(columns['height'][1][6])

    @skipUnlessDBFeature('supports_foreign_keys')
    def test_alter_fk(self):
        self._create_table()
        self._check_field_exists()
        self._alter_field()
        self._check_field_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(Book)

    def _check_field_exists(self):
        columns = self._get_column_classes(Book)
        self.assertEqual(columns['author_id'][0], "IntegerField")
        self._assert_foreign_key_exists(Book, 'author_id', 'schema_author')

    def _alter_field(self):
        old_field = Book._meta.get_field("author")
        new_field = ForeignKey(Author, CASCADE, editable=False)
        new_field.set_attributes_from_name("author")
        with connection.schema_editor() as editor:
            editor.alter_field(Book, old_field, new_field, strict=True)

    def _check_field_exists(self):
        columns = self._get_column_classes(Book)
        self.assertEqual(columns['author_id'][0], "IntegerField")
        self._assert_foreign_key_exists(Book, 'author_id', 'schema_author')

    @skipUnlessDBFeature('supports_foreign_keys')
    def test_alter_to_fk(self):
        class LocalBook(Model):
            author = IntegerField()
            title = CharField(max_length=100, db_index=True)
            pub_date = DateTimeField()

            class Meta:
                app_label = 'schema'
                apps = new_apps

        self.local_models = [LocalBook]

        self._create_table()
        self._check_fk_constraint()
        self._alter_field()
        self._check_fk_constraint()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(LocalBook)

    def _check_fk_constraint(self):
        constraints = self._get_constraints(LocalBook._meta.db_table)
        for name, details in constraints.items():
            if details['foreign_key']:
                self.fail('Found an unexpected FK constraint to %s' % details['columns'])

    def _alter_field(self):
        old_field = LocalBook._meta.get_field("author")
        new_field = ForeignKey(Author, CASCADE)
        new_field.set_attributes_from_name("author")
        with connection.schema_editor() as editor:
            editor.alter_field(LocalBook, old_field, new_field, strict=True)

    def _check_fk_constraint(self):
        self._assert_foreign_key_exists(LocalBook, 'author_id', 'schema_author')

    @skipUnlessDBFeature('supports_foreign_keys')
    def test_alter_o2o_to_fk(self):
        self._create_table()
        self._check_field_exists()
        self._check_field_is_unique()
        self._alter_field()
        self._check_field_exists()
        self._check_field_is_not_unique()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(BookWithO2O)

    def _check_field_exists(self):
        columns = self._get_column_classes(BookWithO2O)
        self.assertEqual(columns['author_id'][0], "IntegerField")

    def _check_field_is_unique(self):
        author = Author.objects.create(name="Joe")
        BookWithO2O.objects.create(author=author, title="Django 1", pub_date=datetime.datetime.now())
        with self.assertRaises(IntegrityError):
            BookWithO2O.objects.create(author=author, title="Django 2", pub_date=datetime.datetime.now())

    def _alter_field(self):
        old_field = BookWithO2O._meta.get_field("author")
        new_field = ForeignKey(Author, CASCADE)
        new_field.set_attributes_from_name("author")
        with connection.schema_editor() as editor:
            editor.alter_field(BookWithO2O, old_field, new_field, strict=True)

    def _check_field_exists(self):
        columns = self._get_column_classes(Book)
        self.assertEqual(columns['author_id'][0], "IntegerField")

    def _check_field_is_not_unique(self):
        Book.objects.create(author=author, title="Django 1", pub_date=datetime.datetime.now())
        Book.objects.create(author=author, title="Django 2", pub_date=datetime.datetime.now())

    @skipUnlessDBFeature('supports_foreign_keys')
    def test_alter_fk_to_o2o(self):
        self._create_table()
        self._check_field_exists()
        self._check_field_is_not_unique()
        self._alter_field()
        self._check_field_exists()
        self._check_field_is_unique()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(Book)

    def _check_field_exists(self):
        columns = self._get_column_classes(Book)
        self.assertEqual(columns['author_id'][0], "IntegerField")

    def _check_field_is_not_unique(self):
        author = Author.objects.create(name="Joe")
        Book.objects.create(author=author, title="Django 1", pub_date=datetime.datetime.now())
        Book.objects.create(author=author, title="Django 2", pub_date=datetime.datetime.now())

    def _alter_field(self):
        old_field = Book._meta.get_field("author")
        new_field = OneToOneField(Author, CASCADE)
        new_field.set_attributes_from_name("author")
        with connection.schema_editor() as editor:
            editor.alter_field(Book, old_field, new_field, strict=True)

    def _check_field_exists(self):
        columns = self._get_column_classes(BookWithO2O)
        self.assertEqual(columns['author_id'][0], "IntegerField")

    def _check_field_is_unique(self):
        BookWithO2O.objects.create(author=author, title="Django 1", pub_date=datetime.datetime.now())
        with self.assertRaises(IntegrityError):
            BookWithO2O.objects.create(author=author, title="Django 2", pub_date=datetime.datetime.now())

    def test_alter_field_fk_to_o2o(self):
        self._create_table()
        self._check_index()
        self._alter_field()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(Book)

    def _check_index(self):
        counts = self._get_constraints_count(
            Book._meta.db_table,
            Book._meta.get_field('author').column,
            (Author._meta.db_table, Author._meta.pk.column),
        )
        self.assertEqual(counts, {'fks': 1 if connection.features.supports_foreign_keys else 0, 'uniques': 0, 'indexes': 1})

    def _alter_field(self):
        old_field = Book._meta.get_field('author')
        new_field = OneToOneField(Author, CASCADE)
        new_field.set_attributes_from_name('author')
        with connection.schema_editor() as editor:
            editor.alter_field(Book, old_field, new_field, strict=True)

    def _check_index(self):
        counts = self._get_constraints_count(
            Book._meta.db_table,
            Book._meta.get_field('author').column,
            (Author._meta.db_table, Author._meta.pk.column),
        )
        self.assertEqual(counts, {'fks': 1 if connection.features.supports_foreign_keys else 0, 'uniques': 1, 'indexes': 0})

    def test_alter_field_fk_keeps_index(self):
        self._create_table()
        self._check_index()
        self._alter_field()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(Book)

    def _check_index(self):
        counts = self._get_constraints_count(
            Book._meta.db_table,
            Book._meta.get_field('author').column,
            (Author._meta.db_table, Author._meta.pk.column),
        )
        self.assertEqual(counts, {'fks': 1 if connection.features.supports_foreign_keys else 0, 'uniques': 0, 'indexes': 1})

    def _alter_field(self):
        old_field = Book._meta.get_field('author')
        new_field = ForeignKey(Author, PROTECT)
        new_field.set_attributes_from_name('author')
        with connection.schema_editor() as editor:
            editor.alter_field(Book, old_field, new_field, strict=True)

    def _check_index(self):
        counts = self._get_constraints_count(
            Book._meta.db_table,
            Book._meta.get_field('author').column,
            (Author._meta.db_table, Author._meta.pk.column),
        )
        self.assertEqual(counts, {'fks': 1 if connection.features.supports_foreign_keys else 0, 'uniques': 0, 'indexes': 1})

    def test_alter_field_o2o_to_fk(self):
        self._create_table()
        self._check_unique_constraint()
        self._alter_field()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(BookWithO2O)

    def _check_unique_constraint(self):
        counts = self._get_constraints_count(
            BookWithO2O._meta.db_table,
            BookWithO2O._meta.get_field('author').column,
            (Author._meta.db_table, Author._meta.pk.column),
        )
        self.assertEqual(counts, {'fks': 1 if connection.features.supports_foreign_keys else 0, 'uniques': 1, 'indexes': 0})

    def _alter_field(self):
        old_field = BookWithO2O._meta.get_field('author')
        new_field = ForeignKey(Author, CASCADE)
        new_field.set_attributes_from_name('author')
        with connection.schema_editor() as editor:
            editor.alter_field(BookWithO2O, old_field, new_field, strict=True)

    def _check_index(self):
        counts = self._get_constraints_count(
            BookWithO2O._meta.db_table,
            BookWithO2O._meta.get_field('author').column,
            (Author._meta.db_table, Author._meta.pk.column),
        )
        self.assertEqual(counts, {'fks': 1 if connection.features.supports_foreign_keys else 0, 'uniques': 0, 'indexes': 1})

    def test_alter_field_o2o_keeps_unique(self):
        self._create_table()
        self._check_unique_constraint()
        self._alter_field()
        self._check_unique_constraint()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(BookWithO2O)

    def _check_unique_constraint(self):
        counts = self._get_constraints_count(
            BookWithO2O._meta.db_table,
            BookWithO2O._meta.get_field('author').column,
            (Author._meta.db_table, Author._meta.pk.column),
        )
        self.assertEqual(counts, {'fks': 1 if connection.features.supports_foreign_keys else 0, 'uniques': 1, 'indexes': 0})

    def _alter_field(self):
        old_field = BookWithO2O._meta.get_field('author')
        new_field = OneToOneField(Author, PROTECT)
        new_field.set_attributes_from_name('author')
        with connection.schema_editor() as editor:
            editor.alter_field(BookWithO2O, old_field, new_field, strict=True)

    def _check_unique_constraint(self):
        counts = self._get_constraints_count(
            BookWithO2O._meta.db_table,
            BookWithO2O._meta.get_field('author').column,
            (Author._meta.db_table, Author._meta.pk.column),
        )
        self.assertEqual(counts, {'fks': 1 if connection.features.supports_foreign_keys else 0, 'uniques': 1, 'indexes': 0})

    def test_alter_db_table_case(self):
        self._create_table()
        self._alter_table()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _alter_table(self):
        old_table_name = Author._meta.db_table
        with connection.schema_editor() as editor:
            editor.alter_db_table(Author, old_table_name, old_table_name.upper())

    def test_alter_implicit_id_to_explicit(self):
        self._create_table()
        self._alter_field()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _alter_field(self):
        old_field = Author._meta.get_field("id")
        new_field = AutoField(primary_key=True)
        new_field.set_attributes_from_name("id")
        new_field.model = Author
        with connection.schema_editor() as editor:
            editor.alter_field(Author, old_field, new_field, strict=True)

    def test_alter_int_pk_to_autofield_pk(self):
        self._create_table()
        self._alter_field()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(IntegerPK)

    def _alter_field(self):
        old_field = IntegerPK._meta.get_field('i')
        new_field = AutoField(primary_key=True)
        new_field.model = IntegerPK
        new_field.set_attributes_from_name('i')
        with connection.schema_editor() as editor:
            editor.alter_field(IntegerPK, old_field, new_field, strict=True)

    def test_alter_int_pk_to_int_unique(self):
        class IntegerUnique(Model):
            i = IntegerField(unique=True)
            j = IntegerField(primary_key=True)

            class Meta:
                app_label = 'schema'
                apps = new_apps
                db_table = 'INTEGERPK'

        with connection.schema_editor() as editor:
            editor.create_model(IntegerPK)

        old_field = IntegerPK._meta.get_field('j')
        new_field = IntegerField(primary_key=True)
        new_field.model = IntegerPK
        new_field.set_attributes_from_name('j')
        with connection.schema_editor() as editor:
            editor.alter_field(IntegerPK, old_field, new_field, strict=True)

        old_field = IntegerPK._meta.get_field('i')
        new_field = IntegerField(unique=True)
        new_field.model = IntegerPK
        new_field.set_attributes_from_name('i')
        with connection.schema_editor() as editor:
            editor.alter_field(IntegerPK, old_field, new_field, strict=True)

    def test_rename(self):
        self._create_table()
        self._check_field_exists()
        self._alter_field()
        self._check_field_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        self.assertEqual(columns['name'][0], "CharField")
        self.assertNotIn("display_name", columns)

    def _alter_field(self):
        old_field = Author._meta.get_field("name")
        new_field = CharField(max_length=254)
        new_field.set_attributes_from_name("display_name")
        with connection.schema_editor() as editor:
            editor.alter_field(Author, old_field, new_field, strict=True)

    def _check_field_exists(self):
        columns = self._get_column_classes(Author)
        self.assertEqual(columns['display_name'][0], "CharField")
        self.assertNotIn("name", columns)

    @skipIfDBFeature('interprets_empty_strings_as_nulls')
    def test_rename_keep_null_status(self):
        self._create_table()
        self._add_row()
        self._alter_field()
        self._check_field_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Note)

    def _add_row(self):
        with self.assertRaises(IntegrityError):
            Note.objects.create(info=None)

    def _alter_field(self):
        old_field = Note._meta.get_field("info")
        new_field = TextField()
        new_field.set_attributes_from_name("detail_info")
        with connection.schema_editor() as editor:
            editor.alter_field(Note, old_field, new_field, strict=True)

    def _check_field_exists(self):
        columns = self._get_column_classes(Note)
        self.assertEqual(columns['detail_info'][0], "TextField")
        self.assertNotIn("info", columns)
        with self.assertRaises(IntegrityError):
            NoteRename.objects.create(detail_info=None)

    def _test_m2m_create(self, M2MFieldClass):
        class LocalBookWithM2M(Model):
            author = ForeignKey(Author, CASCADE)
            title = CharField(max_length=100, db_index=True)
            pub_date = DateTimeField()
            tags = M2MFieldClass("TagM2MTest", related_name="books")

            class Meta:
                app_label = 'schema'
                apps = new_apps

        self.local_models = [LocalBookWithM2M]
        self._create_table()
        self._check_m2m_table()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(TagM2MTest)
            editor.create_model(LocalBookWithM2M)

    def _check_m2m_table(self):
        columns = self._get_column_classes(LocalBookWithM2M._meta.get_field("tags").remote_field.through)
        self.assertEqual(columns['tagm2mtest_id'][0], "IntegerField")

    def test_m2m_create(self):
        self._test_m2m_create(ManyToManyField)

    def test_m2m_create_custom(self):
        self._test_m2m_create(CustomManyToManyField)

    def test_m2m_create_inherited(self):
        self._test_m2m_create(InheritedManyToManyField)

    def _test_m2m_create_through(self, M2MFieldClass):
        class LocalTagThrough(Model):
            book = ForeignKey("schema.LocalBookWithM2MThrough", CASCADE)
            tag = ForeignKey("schema.TagM2MTest", CASCADE)

            class Meta:
                app_label = 'schema'
                apps = new_apps

        class LocalBookWithM2MThrough(Model):
            tags = M2MFieldClass("TagM2MTest", related_name="books", through=LocalTagThrough)

            class Meta:
                app_label = 'schema'
                apps = new_apps

        self.local_models = [LocalTagThrough, LocalBookWithM2MThrough]

        self._create_table()
        self._check_m2m_table()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(LocalTagThrough)
            editor.create_model(TagM2MTest)
            editor.create_model(LocalBookWithM2MThrough)

    def _check_m2m_table(self):
        columns = self._get_column_classes(LocalTagThrough)
        self.assertEqual(columns['book_id'][0], "IntegerField")
        self.assertEqual(columns['tag_id'][0], "IntegerField")

    def test_m2m_create_through(self):
        self._test_m2m_create_through(ManyToManyField)

    def test_m2m_create_through_custom(self):
        self._test_m2m_create_through(CustomManyToManyField)

    def test_m2m_create_through_inherited(self):
        self._test_m2m_create_through(InheritedManyToManyField)

    def _test_m2m(self, M2MFieldClass):
        class LocalAuthorWithM2M(Model):
            name = CharField(max_length=255)

            class Meta:
                app_label = 'schema'
                apps = new_apps

        self.local_models = [LocalAuthorWithM2M]

        self._create_table()
        self._check_m2m_table()
        self._add_m2m_field()
        self._check_m2m_table()
        self._remove_m2m_field()
        self._check_m2m_table()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(LocalAuthorWithM2M)
            editor.create_model(TagM2MTest)

    def _check_m2m_table(self):
        with self.assertRaises(DatabaseError):
            self._get_column_classes(new_field.remote_field.through)

    def _add_m2m_field(self):
        new_field = M2MFieldClass("schema.TagM2MTest", related_name="authors")
        new_field.contribute_to_class(LocalAuthorWithM2M, "tags")
        with connection.schema_editor() as editor:
            editor.add_field(LocalAuthorWithM2M, new_field)

    def _check_m2m_table(self):
        columns = self._get_column_classes(new_field.remote_field.through)
        self.assertEqual(columns['tagm2mtest_id'][0], "IntegerField")

    def _remove_m2m_field(self):
        with connection.schema_editor() as editor:
            editor.remove_field(LocalAuthorWithM2M, new_field)

    def _check_m2m_table(self):
        with self.assertRaises(DatabaseError):
            self._get_column_classes(new_field.remote_field.through)

    def test_m2m(self):
        self._test_m2m(ManyToManyField)

    def test_m2m_custom(self):
        self._test_m2m(CustomManyToManyField)

    def test_m2m_inherited(self):
        self._test_m2m(InheritedManyToManyField)

    def _test_m2m_through_alter(self, M2MFieldClass):
        class LocalAuthorTag(Model):
            author = ForeignKey("schema.LocalAuthorWithM2MThrough", CASCADE)
            tag = ForeignKey("schema.TagM2MTest", CASCADE)

            class Meta:
                app_label = 'schema'
                apps = new_apps

        class LocalAuthorWithM2MThrough(Model):
            name = CharField(max_length=255)
            tags = M2MFieldClass("schema.TagM2MTest", related_name="authors", through=LocalAuthorTag)

            class Meta:
                app_label = 'schema'
                apps = new_apps

        self.local_models = [LocalAuthorTag, LocalAuthorWithM2MThrough]

        self._create_table()
        self._check_m2m_table()
        self._alter_m2m_field()
        self._check_m2m_table()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(LocalAuthorTag)
            editor.create_model(LocalAuthorWithM2MThrough)
            editor.create_model(TagM2MTest)

    def _check_m2m_table(self):
        self.assertEqual(len(self._get_column_classes(LocalAuthorTag)), 3)

    def _alter_m2m_field(self):
        old_field = LocalAuthorWithM2MThrough._meta.get_field("tags")
        new_field = M2MFieldClass("schema.TagM2MTest", related_name="authors", through=LocalAuthorTag)
        new_field.contribute_to_class(LocalAuthorWithM2MThrough, "tags")
        with connection.schema_editor() as editor:
            editor.alter_field(LocalAuthorWithM2MThrough, old_field, new_field, strict=True)

    def _check_m2m_table(self):
        self.assertEqual(len(self._get_column_classes(LocalAuthorTag)), 3)

    def test_m2m_through_alter(self):
        self._test_m2m_through_alter(ManyToManyField)

    def test_m2m_through_alter_custom(self):
        self._test_m2m_through_alter(CustomManyToManyField)

    def test_m2m_through_alter_inherited(self):
        self._test_m2m_through_alter(InheritedManyToManyField)

    def _test_m2m_repoint(self, M2MFieldClass):
        class LocalBookWithM2M(Model):
            author = ForeignKey(Author, CASCADE)
            title = CharField(max_length=100, db_index=True)
            pub_date = DateTimeField()
            tags = M2MFieldClass("TagM2MTest", related_name="books")

            class Meta:
                app_label = 'schema'
                apps = new_apps
        self.local_models = [LocalBookWithM2M]
        self._create_table()
        self._check_m2m_table()
        self._repoint_m2m_field()
        self._check_m2m_table()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(LocalBookWithM2M)
            editor.create_model(TagM2MTest)
            editor.create_model(UniqueTest)

    def _check_m2m_table(self):
        if connection.features.supports_foreign_keys:
            self._assert_foreign_key_exists(
                LocalBookWithM2M._meta.get_field("tags").remote_field.through,
                'tagm2mtest_id',
                'schema_tagm2mtest',
            )

    def _repoint_m2m_field(self):
        old_field = LocalBookWithM2M._meta.get_field("tags")
        new_field = M2MFieldClass(UniqueTest)
        new_field.contribute_to_class(LocalBookWithM2M, "uniques")
        with connection.schema_editor() as editor:
            editor.alter_field(LocalBookWithM2M, old_field, new_field, strict=True)

    def _check_m2m_table(self):
        with self.assertRaises(DatabaseError):
            self._get_column_classes(LocalBookWithM2M._meta.get_field("tags").remote_field.through)

    def test_m2m_repoint(self):
        self._test_m2m_repoint(ManyToManyField)

    def test_m2m_repoint_custom(self):
        self._test_m2m_repoint(CustomManyToManyField)

    def test_m2m_repoint_inherited(self):
        self._test_m2m_repoint(InheritedManyToManyField)

    @skipUnlessDBFeature('supports_column_check_constraints')
    def test_check_constraints(self):
        self._create_table()
        self._check_constraint()
        self._alter_field()
        self._check_constraint()
        self._alter_field_again()
        self._check_constraint()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_constraint(self):
        constraints = self._get_constraints(Author._meta.db_table)
        for name, details in constraints.items():
            if details['columns'] == ["height"] and details['check']:
                break
        else:
            self.fail("No check constraint for height found")

    def _alter_field(self):
        old_field = Author._meta.get_field("height")
        new_field = IntegerField(null=True, blank=True)
        new_field.set_attributes_from_name("height")
        with connection.schema_editor() as editor:
            editor.alter_field(Author, old_field, new_field, strict=True)

    def _check_constraint(self):
        constraints = self._get_constraints(Author._meta.db_table)
        for name, details in constraints.items():
            if details['columns'] == ["height"] and details['check']:
                self.fail("Check constraint for height found")

    def _alter_field_again(self):
        new_field2 = Author._meta.get_field("height")
        with connection.schema_editor() as editor:
            editor.alter_field(Author, new_field, new_field2, strict=True)

    def _check_constraint(self):
        constraints = self._get_constraints(Author._meta.db_table)
        for name, details in constraints.items():
            if details['columns'] == ["height"] and details['check']:
                break
        else:
            self.fail("No check constraint for height found")

    def test_unique(self):
        self._create_table()
        self._check_unique_constraint()
        self._alter_field()
        self._check_unique_constraint()
        self._alter_field_again()
        self._check_unique_constraint()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Tag)

    def _check_unique_constraint(self):
        Tag.objects.create(title="foo", slug="foo")
        with self.assertRaises(IntegrityError):
            Tag.objects.create(title="bar", slug="foo")

    def _alter_field(self):
        old_field = Tag._meta.get_field("slug")
        new_field = SlugField(unique=False)
        new_field.set_attributes_from_name("slug")
        with connection.schema_editor() as editor:
            editor.alter_field(Tag, old_field, new_field, strict=True)

    def _check_unique_constraint(self):
        Tag.objects.create(title="foo", slug="foo")
        Tag.objects.create(title="bar", slug="foo")

    def _alter_field_again(self):
        new_field2 = SlugField(unique=True)
        new_field2.set_attributes_from_name("slug")
        with connection.schema_editor() as editor:
            editor.alter_field(Tag, new_field, new_field2, strict=True)

    def _check_unique_constraint(self):
        Tag.objects.create(title="foo", slug="foo")
        with self.assertRaises(IntegrityError):
            Tag.objects.create(title="bar", slug="foo")

    def test_unique_together(self):
        self._create_table()
        self._check_unique_together_constraint()
        self._alter_unique_together()
        self._check_unique_together_constraint()
        self._alter_unique_together_again()
        self._check_unique_together_constraint()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(UniqueTest)

    def _check_unique_together_constraint(self):
        UniqueTest.objects.create(year=2012, slug="foo")
        UniqueTest.objects.create(year=2011, slug="foo")
        UniqueTest.objects.create(year=2011, slug="bar")
        with self.assertRaises(IntegrityError):
            UniqueTest.objects.create(year=2012, slug="foo")

    def _alter_unique_together(self):
        with connection.schema_editor() as editor:
            editor.alter_unique_together(UniqueTest, UniqueTest._meta.unique_together, [])

    def _check_unique_together_constraint(self):
        UniqueTest.objects.create(year=2012, slug="foo")
        UniqueTest.objects.create(year=2012, slug="foo")

    def _alter_unique_together_again(self):
        with connection.schema_editor() as editor:
            editor.alter_unique_together(UniqueTest, [], UniqueTest._meta.unique_together)

    def _check_unique_together_constraint(self):
        UniqueTest.objects.create(year=2012, slug="foo")
        with self.assertRaises(IntegrityError):
            UniqueTest.objects.create(year=2012, slug="foo")

    def test_unique_together_with_fk(self):
        self._create_table()
        self._check_unique_together_constraint()
        self._alter_unique_together()
        self._check_unique_together_constraint()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(Book)

    def _check_unique_together_constraint(self):
        self.assertEqual(Book._meta.unique_together, ())

    def _alter_unique_together(self):
        with connection.schema_editor() as editor:
            editor.alter_unique_together(Book, [], [['author', 'title']])

    def _check_unique_together_constraint(self):
        with connection.schema_editor() as editor:
            editor.alter_unique_together(Book, [['author', 'title']], [])

    def test_unique_together_with_fk_with_existing_index(self):
        self._create_table()
        self._check_unique_together_constraint()
        self._alter_unique_together()
        self._check_unique_together_constraint()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(BookWithoutAuthor)
            new_field = ForeignKey(Author, CASCADE)
            new_field.set_attributes_from_name('author')
            editor.add_field(BookWithoutAuthor, new_field)

    def _check_unique_together_constraint(self):
        self.assertEqual(Book._meta.unique_together, ())

    def _alter_unique_together(self):
        with connection.schema_editor() as editor:
            editor.alter_unique_together(Book, [], [['author', 'title']])

    def _check_unique_together_constraint(self):
        with connection.schema_editor() as editor:
            editor.alter_unique_together(Book, [['author', 'title']], [])

    def test_index_together(self):
        self._create_table()
        self._check_index()
        self._alter_index_together()
        self._check_index()
        self._alter_index_together_again()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Tag)

    def _check_index(self):
        self.assertEqual(
            False,
            any(
                c["index"]
                for c in self._get_constraints("schema_tag").values()
                if c['columns'] == ["slug", "title"]
            ),
        )

    def _alter_index_together(self):
        with connection.schema_editor() as editor:
            editor.alter_index_together(Tag, [], [("slug", "title")])

    def _check_index(self):
        self.assertEqual(
            True,
            any(
                c["index"]
                for c in self._get_constraints("schema_tag").values()
                if c['columns'] == ["slug", "title"]
            ),
        )

    def _alter_index_together_again(self):
        new_field2 = SlugField(unique=True)
        new_field2.set_attributes_from_name("slug")
        with connection.schema_editor() as editor:
            editor.alter_index_together(Tag, [("slug", "title")], [])

    def _check_index(self):
        self.assertEqual(
            False,
            any(
                c["index"]
                for c in self._get_constraints("schema_tag").values()
                if c['columns'] == ["slug", "title"]
            ),
        )

    def test_index_together_with_fk(self):
        self._create_table()
        self._check_index()
        self._alter_index_together()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(Book)

    def _check_index(self):
        self.assertEqual(Book._meta.index_together, ())

    def _alter_index_together(self):
        with connection.schema_editor() as editor:
            editor.alter_index_together(Book, [], [['author', 'title']])

    def _check_index(self):
        with connection.schema_editor() as editor:
            editor.alter_index_together(Book, [['author', 'title']], [])

    def test_create_index_together(self):
        self._create_table()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(TagIndexed)

    def _check_index(self):
        self.assertEqual(
            True,
            any(
                c["index"]
                for c in self._get_constraints("schema_tagindexed").values()
                if c['columns'] == ["slug", "title"]
            ),
        )

    def test_db_table(self):
        self._create_table()
        self._check_table_exists()
        self._alter_table()
        self._check_table_exists()
        self._alter_table_again()
        self._check_table_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_table_exists(self):
        columns = self._get_column_classes(Author)
        self.assertEqual(columns['name'][0], "CharField")

    def _alter_table(self):
        with connection.schema_editor() as editor:
            editor.alter_db_table(Author, "schema_author", "schema_otherauthor")

    def _check_table_exists(self):
        Author._meta.db_table = "schema_otherauthor"
        columns = self._get_column_classes(Author)
        self.assertEqual(columns['name'][0], "CharField")

    def _alter_table_again(self):
        with connection.schema_editor() as editor:
            editor.alter_db_table(Author, "schema_otherauthor", "schema_author")

    def _check_table_exists(self):
        Author._meta.db_table = "schema_author"
        columns = self._get_column_classes(Author)
        self.assertEqual(columns['name'][0], "CharField")

    def test_add_remove_index(self):
        self._create_table()
        self._check_index()
        self._add_index()
        self._check_index()
        self._remove_index()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_index(self):
        self.assertNotIn('title', self._get_indexes(Author._meta.db_table))

    def _add_index(self):
        index = Index(fields=['name'], name='author_title_idx')
        with connection.schema_editor() as editor:
            editor.add_index(Author, index)

    def _check_index(self):
        self.assertIn('name', self._get_indexes(Author._meta.db_table))

    def _remove_index(self):
        with connection.schema_editor() as editor:
            editor.remove_index(Author, index)

    def _check_index(self):
        self.assertNotIn('name', self._get_indexes(Author._meta.db_table))

    def test_remove_db_index_doesnt_remove_custom_indexes(self):
        self._create_table()
        self._check_index()
        self._add_custom_index()
        self._check_index()
        self._remove_db_index()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(AuthorWithIndexedName)

    def _check_index(self):
        self.assertIn('name', self._get_indexes(AuthorWithIndexedName._meta.db_table))

    def _add_custom_index(self):
        index = Index(fields=['-name'], name='author_name_idx')
        author_index_name = index.name
        with connection.schema_editor() as editor:
            db_index_name = editor._create_index_name(
                model=AuthorWithIndexedName,
                column_names=('name',),
            )
        if connection.features.uppercases_column_names:
            author_index_name = author_index_name.upper()
            db_index_name = db_index_name.upper()
        try:
            AuthorWithIndexedName._meta.indexes = [index]
            with connection.schema_editor() as editor:
                editor.add_index(AuthorWithIndexedName, index)
            old_constraints = self._get_constraints(AuthorWithIndexedName._meta.db_table)
            self.assertIn(author_index_name, old_constraints)
            self.assertIn(db_index_name, old_constraints)
            old_field = AuthorWithIndexedName._meta.get_field('name')
            new_field = CharField(max_length=255)
            new_field.set_attributes_from_name('name')
            with connection.schema_editor() as editor:
                editor.alter_field(AuthorWithIndexedName, old_field, new_field, strict=True)
            new_constraints = self._get_constraints(AuthorWithIndexedName._meta.db_table)
            self.assertNotIn(db_index_name, new_constraints)
            self.assertIn(author_index_name, new_constraints)
            with connection.schema_editor() as editor:
                editor.remove_index(AuthorWithIndexedName, index)
        finally:
            AuthorWithIndexedName._meta.indexes = []

    def _check_index(self):
        pass

    def _remove_db_index(self):
        pass

    def _check_index(self):
        pass

    def test_order_index(self):
        self._create_table()
        self._check_index()
        self._add_index()
        self._check_index()
        self._remove_index()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_index(self):
        self.assertNotIn('title', self._get_indexes(Author._meta.db_table))

    def _add_index(self):
        index_name = 'author_name_idx'
        index = Index(fields=['name', '-weight'], name=index_name)
        with connection.schema_editor() as editor:
            editor.add_index(Author, index)

    def _check_index(self):
        if connection.features.supports_index_column_ordering:
            if connection.features.uppercases_column_names:
                index_name = index_name.upper()
            self._assert_index_order(Author._meta.db_table, index_name, ['ASC', 'DESC'])

    def _remove_index(self):
        with connection.schema_editor() as editor:
            editor.remove_index(Author, index)

    def _check_index(self):
        pass

    def test_indexes(self):
        self._create_table()
        self._check_index()
        self._alter_field()
        self._check_index()
        self._alter_field_again()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(Book)

    def _check_index(self):
        self.assertIn(
            "title",
            self._get_indexes(Book._meta.db_table),
        )

    def _alter_field(self):
        old_field = Book._meta.get_field("title")
        new_field = CharField(max_length=100, db_index=False)
        new_field.set_attributes_from_name("title")
        with connection.schema_editor() as editor:
            editor.alter_field(Book, old_field, new_field, strict=True)

    def _check_index(self):
        self.assertNotIn(
            "title",
            self._get_indexes(Book._meta.db_table),
        )

    def _alter_field_again(self):
        new_field2 = Book._meta.get_field("title")
        with connection.schema_editor() as editor:
            editor.alter_field(Book, new_field, new_field2, strict=True)

    def _check_index(self):
        self.assertIn(
            "title",
            self._get_indexes(Book._meta.db_table),
        )

    def test_primary_key(self):
        self._create_table()
        self._check_primary_key()
        self._alter_primary_key()
        self._check_primary_key()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Tag)

    def _check_primary_key(self):
        self.assertEqual(self._get_primary_key(Tag._meta.db_table), 'id')

    def _alter_primary_key(self):
        id_field = Tag._meta.get_field("id")
        old_field = Tag._meta.get_field("slug")
        new_field = SlugField(primary_key=True)
        new_field.set_attributes_from_name("slug")
        new_field.model = Tag
        with connection.schema_editor() as editor:
            editor.remove_field(Tag, id_field)
            editor.alter_field(Tag, old_field, new_field)

    def _check_primary_key(self):
        self.assertNotIn(
            'id',
            self._get_indexes(Tag._meta.db_table),
        )
        self.assertEqual(self._get_primary_key(Tag._meta.db_table), 'slug')

    def test_context_manager_exit(self):
        class SomeError(Exception):
            pass
        try:
            with connection.schema_editor():
                raise SomeError
        except SomeError:
            self.assertFalse(connection.in_atomic_block)

    @skipIfDBFeature('can_rollback_ddl')
    def test_unsupported_transactional_ddl_disallowed(self):
        message = (
            "Executing DDL statements while in a transaction on databases "
            "that can't perform a rollback is prohibited."
        )
        with atomic(), connection.schema_editor() as editor:
            with self.assertRaisesMessage(TransactionManagementError, message):
                editor.execute(editor.sql_create_table % {'table': 'foo', 'definition': ''})

    @skipUnlessDBFeature('supports_foreign_keys')
    def test_foreign_key_index_long_names_regression(self):
        self._create_table()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(AuthorWithEvenLongerName)
            editor.create_model(BookWithLongName)

    def _check_index(self):
        column_name = connection.ops.quote_name("author_foreign_key_with_really_long_field_name_id")
        column_name = column_name[1:-1].lower()
        self.assertIn(
            column_name,
            self._get_indexes(BookWithLongName._meta.db_table),
        )

    @skipUnlessDBFeature('supports_foreign_keys')
    def test_add_foreign_key_long_names(self):
        self._create_table()
        self._add_foreign_key()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(AuthorWithEvenLongerName)
            editor.create_model(BookWithLongName)

    def _add_foreign_key(self):
        new_field = ForeignKey(AuthorWithEvenLongerName, CASCADE, related_name="something")
        new_field.set_attributes_from_name("author_other_really_long_named_i_mean_so_long_fk")
        with connection.schema_editor() as editor:
            editor.add_field(BookWithLongName, new_field)

    @isolate_apps('schema')
    @skipUnlessDBFeature('supports_foreign_keys')
    def test_add_foreign_key_quoted_db_table(self):
        class Author(Model):
            class Meta:
                db_table = '"table_author_double_quoted"'
                app_label = 'schema'

        class Book(Model):
            author = ForeignKey(Author, CASCADE)

            class Meta:
                app_label = 'schema'

        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.create_model(Book)
        if connection.vendor == 'mysql':
            self._assert_foreign_key_exists(Book, 'author_id', '"table_author_double_quoted"')
        else:
            self._assert_foreign_key_exists(Book, 'author_id', 'table_author_double_quoted')

    def test_add_foreign_object(self):
        with connection.schema_editor() as editor:
            editor.create_model(BookForeignObj)

        new_field = ForeignObject(Author, on_delete=CASCADE, from_fields=['author_id'], to_fields=['id'])
        new_field.set_attributes_from_name('author')
        with connection.schema_editor() as editor:
            editor.add_field(BookForeignObj, new_field)

    def test_creation_deletion_reserved_names(self):
        self._create_table()
        self._check_table_exists()
        self._delete_table()
        self._check_table_does_not_exist()

    def _create_table(self):
        with connection.schema_editor() as editor:
            try:
                editor.create_model(Thing)
            except OperationalError as e:
                self.fail("Errors when applying initial migration for a model "
                          "with a table named after an SQL reserved word: %s" % e)

    def _check_table_exists(self):
        list(Thing.objects.all())

    def _delete_table(self):
        with connection.schema_editor() as editor:
            editor.delete_model(Thing)

    def _check_table_does_not_exist(self):
        with self.assertRaises(DatabaseError):
            list(Thing.objects.all())

    def test_remove_constraints_capital_letters(self):
        def get_field(*args, **kwargs):
            kwargs['db_column'] = "CamelCase"
            field = kwargs.pop('field_class', IntegerField)(*args, **kwargs)
            field.set_attributes_from_name("CamelCase")
            return field

        model = Author
        field = get_field()
        table = model._meta.db_table
        column = field.column

        with connection.schema_editor() as editor:
            editor.create_model(model)
            editor.add_field(model, field)

            constraint_name = "CamelCaseIndex"
            editor.execute(
                editor.sql_create_index % {
                    "table": editor.quote_name(table),
                    "name": editor.quote_name(constraint_name),
                    "using": "",
                    "columns": editor.quote_name(column),
                    "extra": "",
                }
            )
            if connection.features.uppercases_column_names:
                constraint_name = constraint_name.upper()
            self.assertIn(constraint_name, self._get_constraints(model._meta.db_table))
            editor.alter_field(model, get_field(db_index=True), field, strict=True)
            self.assertNotIn(constraint_name, self._get_constraints(model._meta.db_table))

            constraint_name = "CamelCaseUniqConstraint"
            editor.execute(
                editor.sql_create_unique % {
                    "table": editor.quote_name(table),
                    "name": editor.quote_name(constraint_name),
                    "columns": editor.quote_name(field.column),
                }
            )
            if connection.features.uppercases_column_names:
                constraint_name = constraint_name.upper()
            self.assertIn(constraint_name, self._get_constraints(model._meta.db_table))
            editor.alter_field(model, get_field(unique=True), field, strict=True)
            self.assertNotIn(constraint_name, self._get_constraints(model._meta.db_table))

            if connection.features.supports_foreign_keys:
                constraint_name = "CamelCaseFKConstraint"
                editor.execute(
                    editor.sql_create_fk % {
                        "table": editor.quote_name(table),
                        "name": editor.quote_name(constraint_name),
                        "column": editor.quote_name(column),
                        "to_table": editor.quote_name(table),
                        "to_column": editor.quote_name(model._meta.auto_field.column),
                        "deferrable": connection.ops.deferrable_sql(),
                    }
                )
                if connection.features.uppercases_column_names:
                    constraint_name = constraint_name.upper()
                self.assertIn(constraint_name, self._get_constraints(model._meta.db_table))
                editor.alter_field(model, get_field(Author, CASCADE, field_class=ForeignKey), field, strict=True)
                self.assertNotIn(constraint_name, self._get_constraints(model._meta.db_table))

    def test_add_field_use_effective_default(self):
        self._create_table()
        self._check_field_does_not_exist()
        self._add_row()
        self._add_field()
        self._check_field_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_field_does_not_exist(self):
        columns = self._get_column_classes(Author)
        self.assertNotIn("surname", columns)

    def _add_row(self):
        Author.objects.create(name='Anonymous1')

    def _add_field(self):
        new_field = CharField(max_length=15, blank=True)
        new_field.set_attributes_from_name("surname")
        with connection.schema_editor() as editor:
            editor.add_field(Author, new_field)

    def _check_field_exists(self):
        with connection.cursor() as cursor:
            cursor.execute("SELECT surname FROM schema_author;")
            item = cursor.fetchall()[0]
            self.assertEqual(item[0], None if connection.features.interprets_empty_strings_as_nulls else '')

    def test_add_field_default_dropped(self):
        self._create_table()
        self._check_field_does_not_exist()
        self._add_row()
        self._add_field()
        self._check_field_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_field_does_not_exist(self):
        columns = self._get_column_classes(Author)
        self.assertNotIn("surname", columns)

    def _add_row(self):
        Author.objects.create(name='Anonymous1')

    def _add_field(self):
        new_field = CharField(max_length=15, blank=True, default='surname default')
        new_field.set_attributes_from_name("surname")
        with connection.schema_editor() as editor:
            editor.add_field(Author, new_field)

    def _check_field_exists(self):
        with connection.cursor() as cursor:
            cursor.execute("SELECT surname FROM schema_author;")
            item = cursor.fetchall()[0]
            self.assertEqual(item[0], 'surname default')
            field = next(
                f for f in connection.introspection.get_table_description(cursor, "schema_author")
                if f.name == "surname"
            )
            if connection.features.can_introspect_default:
                self.assertIsNone(field.default)

    def test_alter_field_default_dropped(self):
        self._create_table()
        self._add_row()
        self._check_field_exists()
        self._alter_field()
        self._check_field_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _add_row(self):
        Author.objects.create(name='Anonymous1')
        self.assertIsNone(Author.objects.get().height)

    def _check_field_exists(self):
        pass

    def _alter_field(self):
        old_field = Author._meta.get_field('height')
        new_field = IntegerField(blank=True, default=42)
        new_field.set_attributes_from_name('height')
        with connection.schema_editor() as editor:
            editor.alter_field(Author, old_field, new_field, strict=True)

    def _check_field_exists(self):
        self.assertEqual(Author.objects.get().height, 42)
        with connection.cursor() as cursor:
            field = next(
                f for f in connection.introspection.get_table_description(cursor, "schema_author")
                if f.name == "height"
            )
            if connection.features.can_introspect_default:
                self.assertIsNone(field.default)

    def test_add_textfield_unhashable_default(self):
        self._create_table()
        self._add_row()
        self._add_field()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _add_row(self):
        Author.objects.create(name='Anonymous1')

    def _add_field(self):
        new_field = TextField(default={})
        new_field.set_attributes_from_name("info")
        with connection.schema_editor() as editor:
            editor.add_field(Author, new_field)

    @unittest.skipUnless(connection.vendor == 'postgresql', "PostgreSQL specific")
    def test_add_indexed_charfield(self):
        field = CharField(max_length=255, db_index=True)
        field.set_attributes_from_name('nom_de_plume')
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.add_field(Author, field)
        self.assertEqual(
            self._get_constraints_for_column(Author, 'nom_de_plume'),
            ['schema_author_nom_de_plume_7570a851', 'schema_author_nom_de_plume_7570a851_like'],
        )

    @unittest.skipUnless(connection.vendor == 'postgresql', "PostgreSQL specific")
    def test_add_unique_charfield(self):
        field = CharField(max_length=255, unique=True)
        field.set_attributes_from_name('nom_de_plume')
        with connection.schema_editor() as editor:
            editor.create_model(Author)
            editor.add_field(Author, field)
        self.assertEqual(
            self._get_constraints_for_column(Author, 'nom_de_plume'),
            ['schema_author_nom_de_plume_7570a851_like', 'schema_author_nom_de_plume_key']
        )

    @unittest.skipUnless(connection.vendor == 'postgresql', "PostgreSQL specific")
    def test_alter_field_add_index_to_charfield(self):
        self._create_table()
        self._check_index()
        self._alter_field()
        self._check_index()
        self._alter_field_again()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_index(self):
        self.assertEqual(self._get_constraints_for_column(Author, 'name'), [])

    def _alter_field(self):
        old_field = Author._meta.get_field('name')
        new_field = CharField(max_length=255, db_index=True)
        new_field.set_attributes_from_name('name')
        with connection.schema_editor() as editor:
            editor.alter_field(Author, old_field, new_field, strict=True)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(Author, 'name'),
            ['schema_author_name_1fbc5617', 'schema_author_name_1fbc5617_like']
        )

    def _alter_field_again(self):
        with connection.schema_editor() as editor:
            editor.alter_field(Author, new_field, old_field, strict=True)

    def _check_index(self):
        self.assertEqual(self._get_constraints_for_column(Author, 'name'), [])

    @unittest.skipUnless(connection.vendor == 'postgresql', "PostgreSQL specific")
    def test_alter_field_add_unique_to_charfield(self):
        self._create_table()
        self._check_index()
        self._alter_field()
        self._check_index()
        self._alter_field_again()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_index(self):
        self.assertEqual(self._get_constraints_for_column(Author, 'name'), [])

    def _alter_field(self):
        old_field = Author._meta.get_field('name')
        new_field = CharField(max_length=255, unique=True)
        new_field.set_attributes_from_name('name')
        with connection.schema_editor() as editor:
            editor.alter_field(Author, old_field, new_field, strict=True)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(Author, 'name'),
            ['schema_author_name_1fbc5617_like', 'schema_author_name_1fbc5617_uniq']
        )

    def _alter_field_again(self):
        with connection.schema_editor() as editor:
            editor.alter_field(Author, new_field, old_field, strict=True)

    def _check_index(self):
        self.assertEqual(self._get_constraints_for_column(Author, 'name'), [])

    @unittest.skipUnless(connection.vendor == 'postgresql', "PostgreSQL specific")
    def test_alter_field_add_index_to_textfield(self):
        self._create_table()
        self._check_index()
        self._alter_field()
        self._check_index()
        self._alter_field_again()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Note)

    def _check_index(self):
        self.assertEqual(self._get_constraints_for_column(Note, 'info'), [])

    def _alter_field(self):
        old_field = Note._meta.get_field('info')
        new_field = TextField(db_index=True)
        new_field.set_attributes_from_name('info')
        with connection.schema_editor() as editor:
            editor.alter_field(Note, old_field, new_field, strict=True)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(Note, 'info'),
            ['schema_note_info_4b0ea695', 'schema_note_info_4b0ea695_like']
        )

    def _alter_field_again(self):
        with connection.schema_editor() as editor:
            editor.alter_field(Note, new_field, old_field, strict=True)

    def _check_index(self):
        self.assertEqual(self._get_constraints_for_column(Note, 'info'), [])

    @unittest.skipUnless(connection.vendor == 'postgresql', "PostgreSQL specific")
    def test_alter_field_add_unique_to_charfield_with_db_index(self):
        self._create_table()
        self._check_index()
        self._alter_field()
        self._check_index()
        self._alter_field_again()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(BookWithoutAuthor)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(BookWithoutAuthor, 'title'),
            ['schema_book_title_2dfb2dff', 'schema_book_title_2dfb2dff_like']
        )

    def _alter_field(self):
        old_field = BookWithoutAuthor._meta.get_field('title')
        new_field = CharField(max_length=100, db_index=True, unique=True)
        new_field.set_attributes_from_name('title')
        with connection.schema_editor() as editor:
            editor.alter_field(BookWithoutAuthor, old_field, new_field, strict=True)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(BookWithoutAuthor, 'title'),
            ['schema_book_title_2dfb2dff_like', 'schema_book_title_2dfb2dff_uniq']
        )

    def _alter_field_again(self):
        new_field2 = CharField(max_length=100, db_index=True)
        new_field2.set_attributes_from_name('title')
        with connection.schema_editor() as editor:
            editor.alter_field(BookWithoutAuthor, new_field, new_field2, strict=True)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(BookWithoutAuthor, 'title'),
            ['schema_book_title_2dfb2dff', 'schema_book_title_2dfb2dff_like']
        )

    @unittest.skipUnless(connection.vendor == 'postgresql', "PostgreSQL specific")
    def test_alter_field_remove_unique_and_db_index_from_charfield(self):
        self._create_table()
        self._check_index()
        self._alter_field()
        self._check_index()
        self._alter_field_again()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(BookWithoutAuthor)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(BookWithoutAuthor, 'title'),
            ['schema_book_title_2dfb2dff', 'schema_book_title_2dfb2dff_like']
        )

    def _alter_field(self):
        old_field = BookWithoutAuthor._meta.get_field('title')
        new_field = CharField(max_length=100, db_index=True, unique=True)
        new_field.set_attributes_from_name('title')
        with connection.schema_editor() as editor:
            editor.alter_field(BookWithoutAuthor, old_field, new_field, strict=True)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(BookWithoutAuthor, 'title'),
            ['schema_book_title_2dfb2dff_like', 'schema_book_title_2dfb2dff_uniq']
        )

    def _alter_field_again(self):
        new_field2 = CharField(max_length=100)
        new_field2.set_attributes_from_name('title')
        with connection.schema_editor() as editor:
            editor.alter_field(BookWithoutAuthor, new_field, new_field2, strict=True)

    def _check_index(self):
        self.assertEqual(self._get_constraints_for_column(BookWithoutAuthor, 'title'), [])

    @unittest.skipUnless(connection.vendor == 'postgresql', "PostgreSQL specific")
    def test_alter_field_swap_unique_and_db_index_with_charfield(self):
        self._create_table()
        self._check_index()
        self._alter_field()
        self._check_index()
        self._alter_field_again()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(BookWithoutAuthor)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(BookWithoutAuthor, 'title'),
            ['schema_book_title_2dfb2dff', 'schema_book_title_2dfb2dff_like']
        )

    def _alter_field(self):
        old_field = BookWithoutAuthor._meta.get_field('title')
        new_field = CharField(max_length=100, unique=True)
        new_field.set_attributes_from_name('title')
        with connection.schema_editor() as editor:
            editor.alter_field(BookWithoutAuthor, old_field, new_field, strict=True)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(BookWithoutAuthor, 'title'),
            ['schema_book_title_2dfb2dff_like', 'schema_book_title_2dfb2dff_uniq']
        )

    def _alter_field_again(self):
        new_field2 = CharField(max_length=100, db_index=True)
        new_field2.set_attributes_from_name('title')
        with connection.schema_editor() as editor:
            editor.alter_field(BookWithoutAuthor, new_field, new_field2, strict=True)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(BookWithoutAuthor, 'title'),
            ['schema_book_title_2dfb2dff', 'schema_book_title_2dfb2dff_like']
        )

    @unittest.skipUnless(connection.vendor == 'postgresql', "PostgreSQL specific")
    def test_alter_field_add_db_index_to_charfield_with_unique(self):
        self._create_table()
        self._check_index()
        self._alter_field()
        self._check_index()
        self._alter_field_again()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Tag)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(Tag, 'slug'),
            ['schema_tag_slug_2c418ba3_like', 'schema_tag_slug_key']
        )

    def _alter_field(self):
        old_field = Tag._meta.get_field('slug')
        new_field = SlugField(db_index=True, unique=True)
        new_field.set_attributes_from_name('slug')
        with connection.schema_editor() as editor:
            editor.alter_field(Tag, old_field, new_field, strict=True)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(Tag, 'slug'),
            ['schema_tag_slug_2c418ba3_like', 'schema_tag_slug_key']
        )

    def _alter_field_again(self):
        new_field2 = SlugField(unique=True)
        new_field2.set_attributes_from_name('slug')
        with connection.schema_editor() as editor:
            editor.alter_field(Tag, new_field, new_field2, strict=True)

    def _check_index(self):
        self.assertEqual(
            self._get_constraints_for_column(Tag, 'slug'),
            ['schema_tag_slug_2c418ba3_like', 'schema_tag_slug_key']
        )

    def test_alter_field_add_index_to_integerfield(self):
        self._create_table()
        self._check_index()
        self._alter_field()
        self._check_index()
        self._alter_field_again()
        self._check_index()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_index(self):
        self.assertEqual(self._get_constraints_for_column(Author, 'weight'), [])

    def _alter_field(self):
        old_field = Author._meta.get_field('weight')
        new_field = IntegerField(null=True, db_index=True)
        new_field.set_attributes_from_name('weight')
        with connection.schema_editor() as editor:
            editor.alter_field(Author, old_field, new_field, strict=True)

    def _check_index(self):
        expected = 'schema_author_weight_587740f9'
        if connection.features.uppercases_column_names:
            expected = expected.upper()
        self.assertEqual(self._get_constraints_for_column(Author, 'weight'), [expected])

    def _alter_field_again(self):
        with connection.schema_editor() as editor:
            editor.alter_field(Author, new_field, old_field, strict=True)

    def _check_index(self):
        self.assertEqual(self._get_constraints_for_column(Author, 'weight'), [])

    def test_alter_pk_with_self_referential_field(self):
        self._create_table()
        self._alter_field()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Node)

    def _alter_field(self):
        old_field = Node._meta.get_field('node_id')
        new_field = AutoField(primary_key=True)
        new_field.set_attributes_from_name('id')
        with connection.schema_editor() as editor:
            editor.alter_field(Node, old_field, new_field, strict=True)

    @mock.patch('django.db.backends.base.schema.datetime')
    @mock.patch('django.db.backends.base.schema.timezone')
    def test_add_datefield_and_datetimefield_use_effective_default(self, mocked_datetime, mocked_tz):
        now = datetime.datetime(month=1, day=1, year=2000, hour=1, minute=1)
        now_tz = datetime.datetime(month=1, day=1, year=2000, hour=1, minute=1, tzinfo=timezone.utc)
        mocked_datetime.now = mock.MagicMock(return_value=now)
        mocked_tz.now = mock.MagicMock(return_value=now_tz)
        self._create_table()
        self._check_field_does_not_exist()
        self._add_row()
        self._add_field()
        self._check_field_exists()

    def _create_table(self):
        with connection.schema_editor() as editor:
            editor.create_model(Author)

    def _check_field_does_not_exist(self):
        columns = self._get_column_classes(Author)
        self.assertNotIn("dob_auto_now", columns)
        self.assertNotIn("dob_auto_now_add", columns)
        self.assertNotIn("dtob_auto_now", columns)
        self.assertNotIn("dtob_auto_now_add", columns)
        self.assertNotIn("tob_auto_now", columns)
        self.assertNotIn("tob_auto_now_add", columns)

    def _add_row(self):
        Author.objects.create(name='Anonymous1')

    def _add_field(self):
        dob_auto_now = DateField(auto_now=True)
        dob_auto_now.set_attributes_from_name('dob_auto_now')
        self._check_added_field_default(
            connection.schema_editor(), Author, dob_auto_now, 'dob_auto_now', now.date(),
            cast_function=lambda x: x.date(),
        )
        dob_auto_now_add = DateField(auto_now_add=True)
        dob_auto_now_add.set_attributes_from_name('dob_auto_now_add')
        self._check_added_field_default(
            connection.schema_editor(), Author, dob_auto_now_add, 'dob_auto_now_add', now.date(),
            cast_function=lambda x: x.date(),
        )
        dtob_auto_now = DateTimeField(auto_now=True)
        dtob_auto_now.set_attributes_from_name('dtob_auto_now')
        self._check_added_field_default(
            connection.schema_editor(), Author, dtob_auto_now, 'dtob_auto_now', now,
        )
        dt_tm_of_birth_auto_now_add = DateTimeField(auto_now_add=True)
        dt_tm_of_birth_auto_now_add.set_attributes_from_name('dtob_auto_now_add')
        self._check_added_field_default(
            connection.schema_editor(), Author, dt_tm_of_birth_auto_now_add, 'dtob_auto_now_add', now,
        )
        tob_auto_now = TimeField(auto_now=True)
        tob_auto_now.set_attributes_from_name('tob_auto_now')
        self._check_added_field_default(
            connection.schema_editor(), Author, tob_auto_now, 'tob_auto_now', now.time(),
            cast_function=lambda x: x.time(),
        )
        tob_auto_now_add = TimeField(auto_now_add=True)
        tob_auto_now_add.set_attributes_from_name('tob_auto_now_add')
        self._check_added_field_default(
            connection.schema_editor(), Author, tob_auto_now_add, 'tob_auto_now_add', now.time(),
            cast_function=lambda x: x.time(),
        )

    def _check_field_exists(self):
        pass

    @isolate_apps('schema')
    def test_namespaced_db_table_create_index_name(self):
        with connection.schema_editor() as editor:
            max_name_length = connection.ops.max_name_length() or 200
            namespace = 'n' * max_name_length
            table_name = 't' * max_name_length

            class TableName(Model):
                class Meta:
                    app_label = 'schema'
                    db_table = table_name

            class NameSpacedTableName(Model):
                class Meta:
                    app_label = 'schema'
                    db_table = '"%s"."%s"' % (namespace, table_name)
            self.assertEqual(
                editor._create_index_name(TableName, []),
                editor._create_index_name(NameSpacedTableName, []),
            )

    @unittest.skipUnless(connection.vendor == 'oracle', 'Oracle specific db_table syntax')
    def test_creation_with_db_table_double_quotes(self):
        oracle_user = connection.creation._test_database_user()

        class Student(Model):
            name = CharField(max_length=30)

            class Meta:
                app_label = 'schema'
                apps = new_apps
                db_table = '"%s"."DJANGO_STUDENT_TABLE"' % oracle_user

        class Document(Model):
            name = CharField(max_length=30)
            students = ManyToManyField(Student)

            class Meta:
                app_label = 'schema'
                apps = new_apps
                db_table = '"%s"."DJANGO_DOCUMENT_TABLE"' % oracle_user

        self.local_models = [Student, Document]

        with connection.schema_editor() as editor:
            editor.create_model(Student)
            editor.create_model(Document)

        doc = Document.objects.create(name='Test Name')
        student = Student.objects.create(name='Some man')
        doc.students.add(student)