module.exports = {
  getClosestStops: getClosestStops,
  getLatestArrivalsForStop: getLatestArrivalsForStop
};

// Deps.
var GtfsRealtimeBindings = require('gtfs-realtime-bindings');
var request = require('request');
var Promise = require('bluebird');
var csv = require('csv');
var moment = require('moment');
var _ = require('underscore');

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

// Map array of trip IDs to array of delays in seconds. Returns a promise
function getTripUpdates(tripIds) {
  var resolver = Promise.pending();

  request(realTimeRequestSettings, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var feed = GtfsRealtimeBindings.FeedMessage.decode(body);

      var delays = {};
      // TODO: replace with something which is better than O(m * n).
      for (var i = 0; i < feed.entity.length; i++) {
        for (var j = 0; j < tripIds.length; j++) {
          var tripId = tripIds[j];
          if (feed.entity[i].trip_update.trip.trip_id === tripId) {
            delays[tripId] =
                feed.entity[i].trip_update.stop_time_update[0].arrival.delay;
          }
        }
      }

      resolver.resolve(delays);
      return;
    }

    resolver.reject();
  });

  return resolver.promise;
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

// Maps from trip_id's and stop_id's to arrival times.
loadStaticData(
    'STOP_TIMES', 
    stopTimesResolver, 
    'http://gtfs.bigbluebus.com/parsed/stop_times.txt');

// Maps from stop_id's to stop names and GPS coords.
loadStaticData(
    'STOPS',
    stopsResolver,
    'http://gtfs.bigbluebus.com/parsed/stops.txt');

// Maps from service_id's to days of the week.
loadStaticData(
    'CALENDAR',
    calendarResolver,
    'http://gtfs.bigbluebus.com/parsed/calendar.txt');

// Maps from route_id's to route names for funsies.
loadStaticData(
    'ROUTES',
    routesResolver,
    'http://gtfs.bigbluebus.com/parsed/routes.txt');

// Maps from route_id's to service_id's.
loadStaticData(
    'TRIPS',
    tripsResolver,
    'http://gtfs.bigbluebus.com/parsed/trips.txt');

var staticDataLoaded = Promise.all([
  stopTimesResolver.promise,
  stopsResolver.promise,
  calendarResolver.promise,
  routesResolver.promise,
  tripsResolver.promise
]);

// Find closest stop (or 2 stops?) for a given gps coordinate
function getClosestStops(lat, lon, numStops) {
  var closestStops = STATIC_DATA.STOPS.slice().sort(function(stop1, stop2) {
    return getStopDistance(lat, lon, stop1) - getStopDistance(lat, lon, stop2);
  });
  return closestStops.slice(0, numStops);
}

function getStopDistance(lat, lon, stop) {
    var changeLat = lat - stop.stop_lat;
    var changeLon = lon - stop.stop_lon;
    return Math.sqrt(changeLat * changeLat + changeLon * changeLon);
}


/**
 * @enum {string}
 */
var WEEKDAYS = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  7: 'sunday'
};


staticDataLoaded.then(function() {
  console.log('stops and stop times loaded!');
});


function getStop(stopId) {
  var stops = STATIC_DATA.STOPS.filter(function(stop) {
    return stop.stop_id === stopId;
  });
  return stops[0];
} 


// Returns a Promise.
function getLatestArrivalsForStop(stopId) {
  var arrivalsResolver = Promise.pending();

  staticDataLoaded.then(function() {
    // Get ALL arrivals for that stop, sorted chronologically.
    var sortedArrivals = STATIC_DATA.STOP_TIMES.filter(function(element, index) {
      return element.stop_id === stopId;
    }).map(function(stopTime) {
      stopTime.arrival_time = moment(stopTime.arrival_time, 'HH:mm:ss');
      return stopTime;
    }).sort(function(stopTime1, stopTime2) {
      return stopTime1.arrival_time.diff(stopTime2.arrival_time);
    });
    
    // Now get the arrivals within say 10 minutes before now and 30 minutes
    // from now.
    var now = moment();
    var tenMinutesAgo = now.clone().subtract(15, 'minutes');
    var inThirtyMinutes = now.clone().add(45, 'minutes');
    var latestArrivals = sortedArrivals.filter(function(arrival) {
      return arrival.arrival_time.isBetween(tenMinutesAgo, inThirtyMinutes);
    });

    // Now get the arrivals for TODAY.
    var todaysArrivals = latestArrivals.filter(function(arrival) {
      var trip = STATIC_DATA.TRIPS.filter(function(trip) {
        return trip.trip_id === arrival.trip_id;
      })[0];
      var service = STATIC_DATA.CALENDAR.filter(function(service) {
        return service.service_id === trip.service_id;
      })[0];
      return service[WEEKDAYS[now.weekday()]] === '1' &&
        now.isBefore(moment(service.end_date, 'YYYYMMDD').add(1, 'day')) &&
        now.isAfter(moment(service.start_date, 'YYYYMMDD'));
    });

    // Make sure we have the relevant data next in freshly created objects
    // which we can mutate without consequence (i.e. delays).
    var cleanTodaysArrivals = todaysArrivals.map(function(arrival) {
      var cleanedArrival = {};

      // Construct and return a totally new object that we can manipulate.
      cleanedArrival.arrival_time = arrival.arrival_time.clone();
      cleanedArrival.trip_id = arrival.trip_id;

      var trip = STATIC_DATA.TRIPS.filter(function(trip) {
        return trip.trip_id === arrival.trip_id;
      })[0];
      cleanedArrival.headsign = trip.trip_headsign;
      cleanedArrival.route = STATIC_DATA.ROUTES.filter(function(route) {
        return route.route_id === trip.route_id;
      })[0].route_short_name;

      return cleanedArrival;
    });

    // Now adjust for delays.
    var tripIds = cleanTodaysArrivals.map(function(arrival) {
      return arrival.trip_id;
    });
    getTripUpdates(tripIds).then(function(delays) {
      // console.log('tripIds', tripIds);
      // console.log('delays', delays);
      cleanTodaysArrivals.forEach(function(arrival) {
        var delayInSeconds = parseInt(delays[arrival.trip_id]);
        // console.log('delay', delayInSeconds);
        arrival.adjusted_arrival_time =
            arrival.arrival_time.clone().add(delayInSeconds, 's');
      });

      // Make sure now that we have the adjusted arrival that we are only
      // looking at upcoming buses.
      var arrivals = cleanTodaysArrivals.filter(function(arrival) {
        return arrival.adjusted_arrival_time.isAfter(now);
      });

      // Resort.
      arrivals.sort(function(arrival1, arrival2) {
        return arrival1.adjusted_arrival_time.diff(arrival2.adjusted_arrival_time);
      });

      // Clean up time stuff.
      arrivals.forEach(function(arrival) {
        arrival.fromNow = arrival.adjusted_arrival_time.fromNow();
        arrival.arrival_time = arrival.adjusted_arrival_time.toDate();
        delete arrival['adjusted_arrival_time'];
      });

      arrivalsResolver.resolve(arrivals);
    });
  });

  return arrivalsResolver.promise;
}
