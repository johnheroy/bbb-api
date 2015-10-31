var express = require('express');
var bbb = require('./bbb-data-service');
var path = require('path');
var app = express();

var bodyParser = require('body-parser');
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, './demo/')));

app.get('/', function(req, res){
  res.sendFile(path.join(__dirname, './demo/index.html'));
});

app.get('/api/arrivals', function(req, res) {
  console.log('new query to arrivals', JSON.stringify(req));
  var lat = req.query.lat;
  var lon = req.query.lon;

  var count = 0;
  var stops = bbb.getClosestStops(lat, lon, 3).map(function(stop) {
    var newStop = {};

    newStop.stop_id = stop.stop_id;
    newStop.stop_code = stop.stop_code;
    newStop.stop_name = stop.stop_name;
    newStop.stop_desc = stop.stop_desc;
    newStop.stop_lat = stop.stop_lat;
    newStop.stop_lon = stop.stop_lon;

    return newStop;
  });

  stops.forEach(function(stop) {
    bbb.getLatestArrivalsForStop(stop.stop_id).then(function(arrivals) {
      stop.arrivals = arrivals;

      count++;
      if (count === stops.length) {
        res.send(stops);
      }
    });
  });
});

var port = process.env.PORT || 3000;
app.listen(port, function(){
  console.log('app listening on port', port);
});