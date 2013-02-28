var aposPages = {};

aposPages.enableUI = function(options) {
  if (!options) {
    options = {};
  }
  if (!options.root) {
    options.root = '';
  }
  // Allow / or /pages/ to be specified, just quietly fix it
  options.root = options.root.replace(/\/$/, '');

  aposPages.options = options;

  $('body').on('click', '.apos-new-page', function() {
    var parent = $(this).data('slug');
    var $el = apos.modalFromTemplate('.apos-new-page-settings', {
      init: function(callback) {
        populateType($el);
        return callback(null);
      },
      save: save
    });
    function save(callback) {
      return addOrEdit($el, 'new', { parent: parent }, callback);
    }
    return false;
  });

  $('body').on('click', '.apos-edit-page', function() {
    var slug = $(this).data('slug');
    var interval;
    var $el = apos.modalFromTemplate('.apos-edit-page-settings', {
      save: save,
      init: function(callback) {
        populateType($el);
        $el.find('[name=type]').val(aposPages.options.type);
        $el.find('[name=title]').val(aposPages.options.title);
        $el.find('[name=slug]').val(slug);

        // Watch the title for changes, update the slug - but only if
        // the slug was in sync with the title to start with

        var $slug = $el.find('[name=slug]');
        var $title = $el.find('[name=title]');
        var originalTitle = aposPages.options.title;
        var currentSlug = $slug.val();
        var components = currentSlug.split('/');
        var currentSlugTitle = components.pop();
        if (currentSlugTitle === apos.slugify(originalTitle)) {
          apos.log('Slug was initially in sync with title');
          $title.on('keyup', function() {
            var title = $title.val();
            if (title !== originalTitle) {
              var currentSlug = $el.find('[name=slug]').val();
              var components = currentSlug.split('/');
              if (components.length) {
                components.pop();
                var candidateSlugTitle = apos.slugify(title);
                components.push(candidateSlugTitle);
                var newSlug = components.join('/');
                $slug.val(newSlug);
                apos.log("Auto-updated slug to " + newSlug);
              }
            }
          });
        }
        return callback(null);
      },
      afterHide: function(callback) {
        clearInterval(interval);
        return callback();
      }
    });
    function save(callback) {
      return addOrEdit($el, 'edit', { slug: slug }, callback);
    }
    return false;
  });

  function populateType($el) {
    var $type = $el.find('[name=type]');
    $type.html('');
    _.each(aposPages.options.types, function(type) {
      var $option = $('<option></option>');
      $option.text(type.label);
      $option.attr('value', type.name);
      $type.append($option);
    });
  }

  function addOrEdit($el, action, options, callback) {
    $.ajax(
      { 
        url: '/apos-pages/' + action, 
        data: {
          title: $el.find('[name="title"]').val(),
          slug: $el.find('[name="slug"]').val(),
          type: $el.find('[name="type"]').val(),
          parent: options.parent,
          originalSlug: options.slug
        }, 
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

  $('body').on('click', '.apos-delete-page', function(){
    var slug = $(this).data('slug');
    if(confirm('Delete this page?')) {
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
};
