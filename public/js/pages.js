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

    enableUI: function(options) {
      // Available in other scopes
      aposPages.options = options;

      if (!options) {
        options = {};
      }
      if (!options.root) {
        options.root = '';
      }

      // Page types inherit behavior from their "group." This allows us to define
      // many variations on "blog" with different type names (and therefore templates)
      // but the same behavior. We do it this way with a group name
      // that comes from the server because there is server side
      // behavior that needs to be mapped to types as well.

      _.each(aposPages.options.types, function(type) {
        if (type.group && aposPages.groups[type.group]) {
          $.extend(true, type, aposPages.groups[type.group]);
        }
      });

      // Allow / or /pages/ to be specified, just quietly fix it
      options.root = options.root.replace(/\/$/, '');

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
            },
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
          apos.log('type changed');
          var typeName = $el.find('[name=type]').val();
          apos.log('type is now ' + typeName);
          if (oldTypeName) {
            var oldType = aposPages.getType(oldTypeName);
            if (oldType.settings) {
              typeData[oldTypeName] = oldType.settings.serialize($el);
            }
          }
          oldTypeName = typeName;
          var type = aposPages.getType(typeName);
          if (type.settings) {
            apos.log('type has settings');
            var $typeEl = apos.fromTemplate(type.settings.sel);
            apos.log($typeEl[0]);
            apos.log($el.find('[data-type-details]').length);
            $el.find('[data-type-details]').html($typeEl);
            apos.log('type data is:');
            apos.log(typeData);
            type.settings.unserialize(typeData[typeName] || aposPages.options.page[typeName] || {}, $el);
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
            data[typeName] = type.settings.serialize($el);
          }
          apos.log('data is:');
          apos.log(data);
          $.ajax(
            {
              url: '/apos-pages/' + action,
              data: data,
              type: 'POST',
              dataType: 'json',
              success: function(data) {
                apos.log('success');
                apos.log(data);
                apos.log('Redirecting to ' + aposPages.options.root + data.slug);
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
                apos.log('success');
                apos.log(data);
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


