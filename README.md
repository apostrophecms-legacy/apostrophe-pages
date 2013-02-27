# apostrophe-pages

`apostrophe-pages` adds page rendering to the [Apostrophe](http://github.com/punkave/apostrophe) content management system. The `apostrophe-pages` module makes it easy to serve pages, fetching the requested page and making its content areas available to your Nunjucks template along with any other attributes of interest.

`apostrophe-pages` also provides a UI for adding pages, deleting pages and changing page settings such as the title. As part of that, `apostrophe-pages` provides functions to fetch ancestor and descendant pages to any desired depth.

## Serving Pages

By default `apostrophe-pages` renders page templates found in its `views` folder depending on the `template` property of the page. You can override the location where one or all of these are found in order to provide custom templates for your project's needs.

Setting up `apostrophe-pages` is easy once you have the main `apos` object. See the [apostrophe-wiki](http://github.com/punkave/apostrophe-wiki) project for a more complete sample app. In this example we want to render any URL that matches a page slug as a page:

    var apos = require('apostrophe')({ ..., partialPaths: [ '/views/global' ]});
    var pages = require('apostrophe-pages')({ apos: apos, templatePath: __dirname + '/views/pages' });

    // Your app specific routes should come first.
    app.get('/mything', function(req, res) { ... my non-Apostrophe-related stuff ... });

    // Now try to serve anything else as a page.
    app.get('*', pages.serve());

Notice that we set partialPaths to provide global layout templates that can be `extend`ed by our page templates, and set `templatePath` to specify where our page templates area.

`pages.serve` has options that can be used to override its behavior in many ways. Complete documentation for the `pages.serve` function is provided at the top of the function in `index.js` (TODO: work on publishing this as jsdoc).

Your page templates will want to render areas. Just use the page objects passed to you to access them and call the aposArea helper available in anything rendered via apos.partial, which includes page templates:

    {{ aposArea({ slug: slug + ':main', area: page.areas.main, edit: edit }) }}
    {{ aposArea({ slug: slug + ':main', area: global.areas.footer, edit: edit }) }}

## Building Navigation: Ancestors and Descendants

Pages may have a path, separate from their slug, which expresses
their relationship to other pages. Paths look like this:
this:

    home
    home/about
    home/about/staff

The path always reflects the relationship between the pages no
matter what the slug may be changed to by the user. (Clients routinely 
shorten slugs to make URLs easier to publish in print, but don't want to 
lose the relationships between pages.)

Note that paths do not have a leading /. Multiple roots are permitted,
but typically there is one root page with the path `home`.

Pages also have a rank, which determines their ordering among
the children of a particular page.

### Fetching Ancestors and Descendants Manually ###

`pages.getAncestors` and `pages.getDescendants` can be used to fetch
the ancestors and descendants of a page. `pages.getAncestors(page, callback)` delivers
ancestor pages to its callback, in order beginning with the root page. 
`pages.getDescendants(page, callback)` delivers the children of the page, in order by rank.

You can optionally specify a depth:

`pages.getDescendants(page, { depth: 2 }, callback)`

In this case your callback still receives an array of the immediate children of `page`. However, each of those pages has a `children` property containing an array of its children.

For performance reasons, `pages.getAncestors` and `pages.getDescendants` do not return the `items` property. Typically only the `slug` and `title` properties are necessary to build navigation. If necessary you may use the slug property of a page to fetch the entire page with its items, via `apos.getPage`.

### Fetching Ancestors and Descendants Automatically ###

`pages.serve` automatically fetches the ancestors of the page into the `ancestors` property of the `page` object given to the page template. In addition, the children of the page are available in the `children` property. If you specify `depth: 2` as an option to `pages.serve`, you may access the grandchildren as well. You may set `depth` as high as your needs require, but for performance reasons it's best not to fetch more detail than you need.

