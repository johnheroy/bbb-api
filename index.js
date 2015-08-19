// Deps.
var GtfsRealtimeBindings = require('gtfs-realtime-bindings');
var request = require('request');
var Promise = require('bluebird');
var csv = require('csv');
var moment = require('moment');

// Resolvers to track loading the static GTFS data.
var calendarResolver = Promise.pending();
var routesResolver = Promise.pending();
var stopsResolver = Promise.pending();
var stopTimesResolver = Promise.pending();
var tripsResolver = Promise.pending();

// These all correspond to CSVs in the static GTFS data available.
var STATIC_DATA = {};

var realTimeRequestSettings = {
  method: 'GET',
  url: 'http://gtfs.bigbluebus.com/tripupdates.bin',
  encoding: null
};

// Map array of trip IDs to array of delays in seconds
function getTripUpdates(tripId) {
  request(realTimeRequestSettings, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var feed = GtfsRealtimeBindings.FeedMessage.decode(body);

      for (var i = 0; i < feed.entity.length; i++) {
        if (feed.entity[i].trip_update.trip.trip_id === tripId) {
          // TODO: replace with a real API.
          console.log(
              'delay for trip ID',
              tripId,
              feed.entity[i].trip_update.stop_time_update[0].arrival.delay,
              'seconds');
          return;
        }
      }
    }
  });
}


/**
 * @param {string} table String key of static data table
 * @param {!PromiseResolver} resolver
 * @param {string} url Remote URL of GTFS .txt file.
 */
function loadStaticData(table, resolver, url) {
  var parser = csv.parse({columns: true}, function(err, data) {
    if (!err) {
      STATIC_DATA[table] = data;
      resolver.resolve();
      return;
    }

    resolver.reject();
  });

  request(url).pipe(parser);
}

loadStaticData(
    'STOP_TIMES', 
    stopTimesResolver, 
    'http://gtfs.bigbluebus.com/parsed/stop_times.txt');
loadStaticData(
    'STOPS',
    stopsResolver,
    'http://gtfs.bigbluebus.com/parsed/stops.txt');



function loadCalendar() {

}

// Find closest stop (or 2 stops?) for a given gps coordinate
function getClosestStop(lat, lon) {
  var minDistance = 100;
  var closestStopIndex = -1;
  console.log('stops', STATIC_DATA.STOPS);

  for (var i = 0; i < STATIC_DATA.STOPS.length; i++) {
    var stop = STATIC_DATA.STOPS[i];
    var changeLat = lat - stop.stop_lat;
    var changeLon = lon - stop.stop_lon;
    var distance = Math.sqrt(changeLat * changeLat + changeLon * changeLon);
    console.log('distance calcd is', distance);
    if (distance < minDistance) {
      minDistance = distance;
      closestStopIndex = i;
      console.log('closest stop now', i);
    }
  }

  return closestStopIndex;
}


Promise
    .all([stopTimesResolver.promise, stopsResolver.promise])
    .then(function() {
      console.log('stops and stop times loaded!');

      // Find closest stop based on GPS coordinates, get stop_id
      var closestStopIndex = getClosestStop(34.0361974, -118.4718219);
      var closestStopId = STATIC_DATA.STOPS[closestStopIndex].stop_id;
      console.log('closest stop is', STATIC_DATA.STOPS[closestStopIndex].stop_name);

      // Get arrivals for that stop
      var sortedArrivals = STATIC_DATA.STOP_TIMES.filter(function(element, index) {
        return element.stop_id === closestStopId;
      }).map(function(stopTime) {
        stopTime.arrival_time = moment(stopTime.arrival_time, 'HH:mm:ss');
        return stopTime;
      }).sort(function(stopTime1, stopTime2) {
        return stopTime1.arrival_time.diff(stopTime2.arrival_time);
      });
      
      // Now get the arrivals within say 10 minutes before now and 30 minutes
      // from now.
      var tenMinutesAgo = moment().subtract(10, 'minutes');
      var inThirtyMinutes = moment().add(30, 'minutes');

      var latestArrivals = sortedArrivals.filter(function(arrival) {
        return arrival.arrival_time.isBetween(tenMinutesAgo, inThirtyMinutes);
      });

      console.log('latest arrivals!');
      console.log(latestArrivals);
    });




// find delays by that trip ID
getTripUpdates('614519');