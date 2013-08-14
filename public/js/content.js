$(function() {

  // This is a hack to figure out what *isn't* a page based on
  // the available checkboxes
  var typeNames = [];
  $('.apos-search-filter').each(function() {
    typeNames.push($(this).attr('name'));
  });

  // Show and hide search results by type
  $('body').on('click', '.apos-search-filter', function() {
    update();
  });

  // So it works if we click the back button and had filters on
  // (this is quite common)
  update();

  function update() {
    var checked = {};
    $('.apos-search-filter').each(function() {
      checked[$(this).attr('name')] = $(this).prop('checked');
    });
    $('.apos-result').each(function() {
      var $result = $(this);
      var type = $result.data('type');
      if (!_.contains(typeNames, $result.data('type'))) {
        type = 'page';
      }
      if (checked[type]) {
        $result.show();
      } else {
        $result.hide();
      }
    });
  }
});
