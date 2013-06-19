$(function() {

  // This is a hack to figure out what *isn't* a page based on
  // the available checkboxes
  var typeNames = [];
  $('.apos-search-filter').each(function() {
    typeNames.push($(this).attr('name'));
  });

  // Show and hide search results by type
  $('body').on('click', '.apos-search-filter', function() {
    var checked = $(this).prop('checked');
    var name = $(this).attr('name');
    var names = [];
    $('.apos-result').each(function() {
      var $result = $(this);
      if (name === 'page') {
        if (!_.contains(typeNames, $result.data('type'))) {
          if (checked) {
            $result.show();
          } else {
            $result.hide();
          }
        }
      } else {
        if ($result.data('type') === name) {
          if (checked) {
            $result.show();
          } else {
            $result.hide();
          }
        }
      }
    });
  });

});
