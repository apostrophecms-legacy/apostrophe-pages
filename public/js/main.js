$.extend(true, window, {
  aposPages: {
    groups: {},
    // Return a page type object if one was configured for the given type name.
    // JavaScript doesn't iterate over object properties in a defined order,
    // so we maintain the list of types as a flat array. This convenience method
    // prevents this from being inconvenient and allows us to choose to do more
    // optimization later.

    getType: function(name) {
      return _.find(aposPages.options.types, function(item) {
        return item.name === name;
      });
    },

    // Replace a type with a new type object. Typically this is done to replace
    // a type object we got from the server (with just a name and a label) with a
    // type object that includes a settings property with functions for a page
    // settings dialog and so on.
    //
    // We replace rather than extending so that closures with references
    // to "self" still do the right thing.

    replaceType: function(name, object) {
      var newTypes = [];
      for (var i in aposPages.options.types) {
        var type = aposPages.options.types[i];
        if (type.name === name) {
          object.name = type.name;
          object.label = type.label;
          newTypes.push(object);
        } else {
          newTypes.push(type);
        }
      }
      aposPages.options.types = newTypes;
    },

    enableUI: function(options) {

      if (!options) {
        options = {};
      }
      if (!options.root) {
        options.root = '';
      }

      // Allow / or /pages/ to be specified, just quietly fix it
      options.root = options.root.replace(/\/$/, '');

      // Available in other scopes
      aposPages.options = options;

      // Shared state closure for the page settings dialogs (new and edit)
      (function() {
        var oldTypeName;
        var typeData = {};
        // Active dialog
        var $el;

        $('body').on('click', '.apos-new-page', function() {
          var parent = $(this).data('slug');
          $el = apos.modalFromTemplate('.apos-new-page-settings', {
            init: function(callback) {
              populateType();
              refreshType();
              return callback(null);
            },
            save: save
          });
          function save(callback) {
            return addOrEdit('new', { parent: parent }, callback);
          }
          return false;
        });

        $('body').on('click', '.apos-edit-page', function() {
          var slug = $(this).data('slug');
          $el = apos.modalFromTemplate('.apos-edit-page-settings', {
            save: save,
            init: function(callback) {
              populateType();
              $el.find('[name=type]').val(aposPages.options.page.type);
              $el.find('[name=title]').val(aposPages.options.page.title);
              $el.find('[name=slug]').val(slug);
              refreshType();

              // Watch the title for changes, update the slug - but only if
              // the slug was in sync with the title to start with

              var $slug = $el.find('[name=slug]');
              var $title = $el.find('[name=title]');

              apos.suggestSlugOnTitleEdits($slug, $title);

              return callback(null);
            }
          });
          function save(callback) {
            return addOrEdit('edit', { slug: slug }, callback);
          }
          return false;
        });

        function populateType() {
          var $type = $el.find('[name=type]');
          $type.html('');
          _.each(aposPages.options.types, function(type) {
            var $option = $('<option></option>');
            $option.text(type.label);
            $option.attr('value', type.name);
            $type.append($option);
          });
          // Some types have custom settings of their own. When appropriate
          // instantiate the additional template and make it part of the form.
          // If the type has a selector for a settings template (settings.sel)
          // then it must also have an unserialize function to populate that
          // template's form fields from an object and a serialize function
          // to return an object based on the form fields. You can set up
          // client side javascript to assist with the use of the fields in
          // your unserialize function.

          $el.on('change', '[name=type]', function() {
            refreshType();
          });
        }

        function refreshType() {
          var typeName = $el.find('[name=type]').val();
          if (oldTypeName) {
            var oldType = aposPages.getType(oldTypeName);
            if (oldType.settings) {
              typeData[oldTypeName] = oldType.settings.serialize($el, $el.find('[data-type-details]'));
            }
            $el.find('[data-type-details]').html('');
          }
          oldTypeName = typeName;
          var type = aposPages.getType(typeName);

          if (type.settings) {
            var $typeEl = apos.fromTemplate('.apos-page-settings-' + type._css);
            $el.find('[data-type-details]').html($typeEl);
            var typeDefaults = typeData[typeName];
            if (!typeDefaults) {
              if (aposPages.options.page.type === type.name) {
                typeDefaults = aposPages.options.page.typeSettings;
              }
            }
            if (!typeDefaults) {
              typeDefaults = {};
            }
            type.settings.unserialize(typeDefaults, $el, $el.find('[data-type-details]'));
          }
        }

        function addOrEdit(action, options, callback) {
          var typeName = $el.find('[name=type]').val();
          var type = aposPages.getType(typeName);
          var data = {
            title: $el.find('[name=title]').val(),
            slug: $el.find('[name=slug]').val(),
            type: $el.find('[name=type]').val()
          };
          _.extend(data, { parent: options.parent, originalSlug: options.slug });
          if (type.settings && type.settings.serialize) {
            data.typeSettings = type.settings.serialize($el, $el.find('[data-type-details]'));
          }
          $.ajax(
            {
              url: '/apos-pages/' + action,
              data: data,
              type: 'POST',
              dataType: 'json',
              success: function(data) {
                window.location.href = aposPages.options.root + data.slug;
              },
              error: function() {
                alert('Server error');
                callback('Server error');
              }
            }
          );
          return false;
        }
      })();

      $('body').on('click', '.apos-delete-page', function() {
        var slug = $(this).data('slug');
        if (confirm('Delete this page?')) {
          $.ajax(
            {
              url: '/apos-pages/delete',
              data: {
                slug: slug
              },
              type: 'POST',
              dataType: 'json',
              success: function(data) {
                if(data.status === 'ok') {
                  window.location.href = aposPages.options.root + data.parent;
                } else {
                  alert(data.status);
                }
              },
              error: function() {
                alert('Server error');
              }
            }
          );
          return false;
        }
      });
    }
  }
});


