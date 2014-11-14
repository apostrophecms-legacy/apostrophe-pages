/* jshint node:true */

var argv = require('yargs').argv;
var request = require('request');
var fs = require('fs');
var async = require('async');
var _ = require('lodash');

var urls = fs.readFileSync(argv._[0], 'utf8').split(/\n/);

var tries = argv.tries || 10;

var speed = {};

return async.eachSeries(urls, function(url, callback) {
  return async.times(tries, function(callback) {
    var start = Date.now();
    return request(url, function(err, response) {
      console.log(response.statusCode);
      if (err && (response.statusCode >= 400)) {
        console.log(url + ': ERROR: ' + response.statusCode);
      }
      return callback(null, Date.now() - start);
    });
  }, function(err, results) {
    var total;
    for (var i = 0; (i < results.length); i++) {
      total += results[i];
    }
    speed[url] = total / results.length;
    return callback(null);
  });
}, function(err) {

});

