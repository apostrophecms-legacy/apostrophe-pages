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
      save: save
    });
    function save(callback) {
      return addOrEdit($el, 'new', { parent: parent }, callback);
    }
    return false;
  });

  $('body').on('click', '.apos-edit-page', function() {
    var slug = $(this).data('slug');
    var $el = apos.modalFromTemplate('.apos-edit-page-settings', {
      save: save,
      init: function(callback) {
        $el.find('[name=title]').val(aposPages.options.title);
        $el.find('[name=slug]').val(slug);
        return callback(null);
      }
    });
    function save(callback) {
      return addOrEdit($el, 'edit', { slug: slug }, callback);
    }
    return false;
  });

  function addOrEdit($el, action, options, callback) {
    $.ajax(
      { 
        url: '/apos-pages/' + action, 
        data: {
          title: $el.find('[name="title"]').val(),
          slug: $el.find('[name="slug"]').val(),
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
