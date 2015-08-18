var GtfsRealtimeBindings = require('gtfs-realtime-bindings');
var request = require('request');
var Promise = require('bluebird');
var csv = require('csv');
var moment = require('moment');

var stopsResolver = Promise.pending();
var stopTimesResolver = Promise.pending();
var STOPS = [];
var STOP_TIMES = [];

var requestSettings = {
  method: 'GET',
  url: 'http://gtfs.bigbluebus.com/tripupdates.bin',
  encoding: null
};

// Map array of trip IDs to array of delays in seconds
function getTripUpdates(tripId) {
  request(requestSettings, function (error, response, body) {
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

function loadStopTimes() {
  var stopTimesParser = csv.parse({columns: true}, function(err, data) {
    if (!err) {
      STOP_TIMES = data;
      stopTimesResolver.resolve();
      return;
    }

    stopTimesResolver.reject();
  });
  request('http://gtfs.bigbluebus.com/parsed/stop_times.txt')
      .pipe(stopTimesParser);
}

function loadStops() {
  var stopsParser = csv.parse({columns: true}, function(err, data) {
    if (!err) {
      STOPS = data;
      stopsResolver.resolve();
      // console.log(STOPS);
      return;
    }

    stopsResolver.reject();
  });
  request('http://gtfs.bigbluebus.com/parsed/stops.txt')
      .pipe(stopsParser);
}

// Find closest stop (or 2 stops?) for a given gps coordinate
function getClosestStop(lat, lon) {
  var minDistance = 100;
  var closestStopIndex = -1;

  for (var i = 0; i < STOPS.length; i++) {
    var stop = STOPS[i];
    var changeLat = lat - stop.stop_lat;
    var changeLon = lon - stop.stop_lon;
    var distance = Math.sqrt(changeLat * changeLat + changeLon * changeLon);
    // console.log('distance calcd is', distance);
    if (distance < minDistance) {
      minDistance = distance;
      closestStopIndex = i;
      // console.log('closest stop now', i);
    }
  }

  return closestStopIndex;
}


loadStopTimes();
loadStops();
Promise
    .all([stopTimesResolver.promise, stopsResolver.promise])
    .then(function() {
      console.log('stops and stop times loaded!');

      // Find closest stop based on GPS coordinates, get stop_id
      var closestStopIndex = getClosestStop(34.0361974, -118.4718219);
      var closestStopId = STOPS[closestStopIndex].stop_id;
      console.log('closest stop is', STOPS[closestStopIndex].stop_name);

      // Get arrivals for that stop
      var arrivals = STOP_TIMES.filter(function(element, index) {
        return element.stop_id === closestStopId;
      }).sort(function(stopTime1, stopTime2) {
        return moment(stopTime1.arrival_time, 'HH:mm:ss')
            .diff(moment(stopTime2.arrival_time, 'HH:mm:ss'));
      });
      console.log(arrivals);
    });




// find delays by that trip ID
getTripUpdates('614519');