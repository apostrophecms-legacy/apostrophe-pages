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

## Page Types

The constructor for the pages module accepts a `types` option. In its simplest form, a "page type" is just a template name and a label. If you do not specify a `types` parameter, you get a single type with the name `default` and the label `Default`. this causes `views/default.html` to be loaded to render pages with that type.

However page types can also be extended with custom behavior. See the `apostrophe-blog` module for an example with all the trimmings.

To facilitate code reuse, page types can have a single "superclass" from which they inherit behavior in both the server- and browser-side JavaScript code.

Here is a simple example of specifying the `types` option:

    types: [ { name: 'default', label: 'Default (Two Column)' }, { name: 'onecolumn', label: 'One Column' }]

You can also add types later, for instance when initializing other modules such as our blog module. See `pages.addType`.

`pages.serve` has options that can be used to override its behavior in many ways. Complete documentation for the `pages.serve` function is provided at the top of the function in `index.js` (TODO: work on publishing this as jsdoc).

Your page templates will want to render areas. Just use the page objects passed to you to access them and call the aposArea helper available in anything rendered via apos.partial, which includes page templates:

    {{ aposArea(page, 'main') }}
    {{ aposArea(global, 'footer') }}

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
the ancestors and descendants of a page. `pages.getAncestors(req, page, callback)` delivers
ancestor pages to its callback, in order beginning with the root page.
`pages.getDescendants(req, page, callback)` delivers the children of the page, in order by rank. `req` must be passed to provide a context for permissions (`req.user`) and, potentially, for caching during the lifetime of a single request. It must be either a real Express request object or some other object acceptable to your `apos.permissions` function.

You can optionally specify a depth:

`pages.getDescendants(req, page, { depth: 2 }, callback)`

In this case your callback still receives an array of the immediate children of `page`. However, each of those pages has a `children` property containing an array of its children.

For performance reasons, `pages.getAncestors` and `pages.getDescendants` do not return the `items` property. Typically only the `slug` and `title` properties are necessary to build navigation. If necessary you may use the slug property of a page to fetch the entire page with its items, via `apos.getPage`.

### Fetching Ancestors, Peers and Descendants Automatically ###

`pages.serve` automatically fetches the ancestors of the page into the `ancestors` property of the `page` object given to the page template. In addition, the children of the page are available in the `children` property. And the children of the home page (whether the current page is the home page or not) are available in the `tabs` property. Also, the peers of the current page (children of the same parent) are available in the `peers` property.

If you need to see the descendants of the current page to a greater depth, set the `descendantOptions` option when calling `pages.serve`:

    {
      descendantOptions: {
        depth: 2
      }
    }

You can then look at the `children` property of each entry in `page.children`, and so on.

To do the same thing for descendants of the home page, set:

    {
      tabOptions: {
        depth: 2
      }
    }

You can add a `.children` array to each ancestor in order to implement accordion navigation, in which each ancestor's children are also displayed:

    {
      ancestorOptions: {
        children: true
      }
    }


You can also shut off ancestors, descendants or tabs entirely if you're not interested:

    {
      ancestors: false
      tabs: false,
      descendants: false,
    }

### Fetching Pages by Tag ###

Typically "tree pages" (pages that are part of the tree, i.e. the home page and its descendants) are displayed and browsed like nested folders. But from time to time it is useful to fetch pages based on taxonomy instead.

The `pages.getByTag` method returns *all tree pages on the site* that have a specified tag:

    pages.getByTag(req, 'green', function(err, results) { ... });

And `pages.getByTags` returns all pages with at least one of the tags in an array:

    pages.getByTags(req, ['green', 'blue'], function(err, results) { ... });

When pages are fetched by tag, they are sorted alphabetically by title.

### Filtering Pages by Tag ###

If you already have an array of pages, for instance the children or peers of the current page, it can be useful to filter them by tag. You can do that with `pages.filterByTag`:

    pages.filterByTag(children, 'tag')
    pages.filterByTags(children, ['green', 'blue'])

Again, `filterByTags` returns pages with *at least one* of the specified tags.

*Note that these functions do not take a callback.* They return the pages directly, since they are just filtering an existing array of pages based on their metadata.

## Loading Additional Data

Most sites require that some extra data be loaded along with pages. The data to be loaded is often dependent on the site structure and the unique needs of the project. The pages.serve function supports this via the load option.

The load option accepts an array made up of page slugs and functions. Any strings found in this array are assumed to be the slugs of pages, usually "virtual pages" whose slugs do not start with a leading / and are not directly reachable by navigating the site. Such pages are loaded and added to the `req.extras` property. All properties of `req.extras` are then made available to your page templates. So if you use the virtual page `global` to hold a shared global footer area, you can access it as `global.footer` in your page templates.

In addition, loaders can be asynchronous functions that modify the `req` object in their own ways. Loaders receive the `req` object as their first parameter and a callback to be invoked on completion as their second parameter. The `req` object will have a `page` property containing the page that matched the slug, if any, and a `remainder` property matching additional content in the URL after the slug if the page is greedy, as explained below.

## Second Chances and "Greedy Pages"

Many sites need to go beyond a simple tree of pages, implementing experiences like blogs and catalogs that require "subpages" to exist for every product or blog post, and URLs that contain elements other than page slugs, such as the date and slug of a blog post. This is easily implemented using greedy pages.

While the `req.page` page property is set only if the slug exactly matches a page, the `req.bestPage` property is set to the page whose slug comes closest to matching the page. To be the "best page," a page must meet the following conditions:

Either (1) it matches the requested URL exactly (in which case req.page and req.bestPage will be the same page), or (2) it matches the longest portion of the URL ending in a `/`.

Examples:

Assume there are pages with the slugs `/blog` and `/blog/credits` in the databsae.

1. If the user requests `/blog` and there is a page with the slug `/blog`, both `req.page` and `req.bestPage` will be set to the `/blog` page object. `req.remainder` will be the empty string.
2. If the user requests `/blog/2013/01/01/i-like-kittens`, `req.page` will be undefined, and `req.bestPage` will be set to the `/blog` page object. `req.remainder` will be set to `/2013/01/01/i-like-kittens`.
3. If the user requests `/blog/credits`, `req.page` and `req.bestPage` will both be set to the `/blog/credits` page object. `req.remainder` will be the empty string.
4. If the user requests `/blog/credits/paul`, `req.page` will be undefined, and `req.bestPage` will be set to the `/blog/credits` page object. `req.remainder` will be set to `/paul`.
5. For consistency, if the URL ends with a trailing /, this is not included in `req.remainder`.

This approach allows a mix of "ordinary" subpages and subpages implemented by custom logic in a `load` function that examines `req.remainder` and `req.bestPage` to decide what to do.

### Converting req.bestPage to req.page ###

A loader that decides a page should be rendered after all based on a partial match should set `req.page` to `req.bestPage`. Otherwise the page is considered to be a 404.

### Switching Templates In A Load Function ###

You could implement a blog with custom behavior for different values of `remainder` entirely by setting properties of `req.extras` and examining them in your template.

But it is often easier to use an entirely different template, for instance to render a blog post's permalink page differently from the main index of a blog.

To achieve that in your `load` function, just set `req.type` to the template you want to render:

`req.type = 'blogPost';`

Note that you can set `req.type` to `notfound` to display the standard "404 not found" template for the project.

## User Interface: Adding, Modifying and Removing Pages ##

`apostrophe-pages` provides a full user interface for creating, modifying and removing pages. To enable it, just insert the appropriate markup into your page layout:

    {{ aposEditPage({ page: page, edit: edit, root: '/' }) }}

This helper function inserts the page-related buttons at that point and also the necessary browser-side JavaScript to power them.

## Automatic Redirects ##

If you change the slug (URL) of a page via the Page Settings button, that doesn't tell Google and other search engines that the page has moved. So as a convenience, `apostrophe-pages` automatically tracks the old URLs and provides redirects to the new URLs. Of course, if a new page is created at the old URL, that page wins and the old redirect is not used.

## Search

The `apostrophe-search` module also provides a sitewide search facility. This is implemented by a page loader function that kicks in for pages (usually just one) with the `search` type.

Simple filters are provided to include or exclude results. There is a checkbox for each searchable instance type (such as `blogPost` or `event`) and for regular pages. You can override these with the `searchLoader` option to the pages module. For instance, in `app.js` in a project using `apostrophe-site` for configuration:

```javascript
pages: {
  searchLoader: [
    {
      name: 'page',
      label: 'Pages'
    },
    {
      name: 'blogPost',
      label: 'Blog Posts'
    }
  ]
}
```

Any searchable document whose page type does not have a specific filter is toggled by the `page` filter. *If you do not include a filter with the name `page` then such documents will not be visible in search results.* However this is frontend filtering and should not be relied upon to secure information by keeping it out of search. For that, if you are subclassing snippets, you may use the `searchable` option when configuring the module.

