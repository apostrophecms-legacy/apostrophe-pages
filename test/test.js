var assert = require('assert');
var mongo = require('mongodb');

var db;

var collection;

var pages;

var page;

var req = {};

describe('apostrophe-pages', function() {
  describe('test database connection open', function() {
    it('initialize mongodb', function(done) {
      db = new mongo.Db(
        'apostest',
        new mongo.Server('localhost', 27017, {}),
        // Sensible default of safe: true
        // (soon to be the driver's default)
        { safe: true }
      );
      assert(!!db);
      db.open(function(err) {
        collection = new mongo.Collection(db, 'pages');
        assert(!!collection);
        pages = require('../index.js')({ apos: { pages: collection, permissions: function(req, action, object, callback) { return callback(null); } }, app: {}, ui: false });
        assert(!!pages);
        done();
      });
    });
  });
  describe('remove test data', function() {
    it('removed', function(done) {
      collection.remove({}, function(err) {
        assert(!err);
        done();
      });
    });
  });
  describe('insert test data', function() {
    it('inserted', function(done) {
      collection.insert(
        [
          {
            path: 'home',
            level: 0,
            rank: 0
          },
          // Kids in scrambled order so sort() has work to do
          {
            path: 'home/contact',
            level: 1,
            rank: 2
          },
          {
            path: 'home/about',
            level: 1,
            rank: 0
          },
          {
            path: 'home/about/location',
            level: 2,
            rank: 1
          },
          {
            path: 'home/about/people',
            level: 2,
            rank: 0
          },
          {
            path: 'home/products',
            level: 1,
            rank: 1
          }
        ], function(err) {
          assert(!err);
          done();
        }
      );
    });
  });
  describe('fetch home page', function() {
    it('fetched', function(done) {
      collection.findOne({ path: 'home' }, function(err, doc) {
        assert(!!doc);
        page = doc;
        done();
      });
    });
  });
  describe('fetch ancestors of home page (should be empty)', function() {
    it('fetched', function(done) {
      pages.getAncestors(req, page, function(err, ancestors) {
        assert(ancestors.length === 0);
        done();
      });
    });
  });

  var children;

  describe('fetch descendants of home page', function() {
    it('fetched', function(done) {
      pages.getDescendants(req, page, { depth: 2 }, function(err, childrenArg) {
        children = childrenArg;
        assert(!err);
        assert(children.length === 3);
        done();
      });
    });
    it('in order', function() {
      assert(children[0].path === 'home/about');
      assert(children[1].path === 'home/products');
      assert(children[2].path === 'home/contact');
    });
    it('have grandkids', function() {
      assert(children[0].children.length === 2);
    });
    it('grandkids in order', function() {
      assert(children[0].children[0].path === 'home/about/people');
      assert(children[0].children[1].path === 'home/about/location');
    });
  });

  var ancestors;

  describe('fetch ancestors of home/about/people', function() {
    it('fetched', function(done) {
      var people = children[0].children[0];
      pages.getAncestors(req, people, function(err, ancestorsArg) {
        assert(!err);
        assert(ancestorsArg);
        ancestors = ancestorsArg;
        done();
      });
    });
    it('correct count', function() {
      assert(ancestors.length === 2);
    });
    it('correct paths in order', function() {
      assert(ancestors[0].path === 'home');
      assert(ancestors[1].path === 'home/about');
    });
  });
});

