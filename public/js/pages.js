var aposPages = {};

aposPages.enableUI = function(options) {
  if (!options) {
    options = {};
  }
  if (!options.root) {
    options.root = '';
  }
  $('body').on('click', '.apos-new-page', function() {
    var parent = $(this).data('slug');
    var $el = apos.modalFromTemplate('.apos-new-page-settings', {
      save: function(callback){
        $.ajax(
          { 
            url: '/apos-pages/new', 
            data: {
              title: $el.find('[name="title"]').val(),
              parent: parent
            }, 
            type: 'POST',
            dataType: 'json',
            success: function(data) {
              apos.log('success');
              apos.log(data);
              window.location.href = options.root + data.slug;
            },
            error: function() {
              alert('Server error');
              callback('Server error');
            }
          }
        );
      }
    });
    return false;
  });
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
            if(data.status == 'ok') {
              window.location.href = options.root + data.parent;
            }
            else {
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
