var GtfsRealtimeBindings = require('gtfs-realtime-bindings');
var request = require('request');

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

// Find closest stop (or 2 stops?) for a given gps coordinate
function getClosestStop(lat, lon) {
  request('http://gtfs.bigbluebus.com/stop_times.txt', function(error, response, body) {
    console.log('in here', response)
    if (!error && response.statusCode == 200) {
      console.log(body);
    }
  });
}

getClosestStop(34.0361974, -118.4718219);


// Find closest stop based on GPS coordinates, get stop_id


// Get arrivals +/- 30 minutes for that stop
// find delays by that trip ID
// getTripUpdates('613771');