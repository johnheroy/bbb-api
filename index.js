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
  var lat = req.query.lat;
  var lon = req.query.lon;

  var count = 0;
  var stops = bbb.getClosestStops(lat, lon, 3);

  stops.forEach(function(stop) {
    bbb.getLatestArrivalsForStop(stop.stop_id).then(function(arrivals) {
      stop.arrivals = arrivals;

      count++;
      if (count === stops.length) {
        res.send(stops);
      }
    });

    delete stop.wheelchair_boarding;
    delete stop.stop_timezone;
    delete stop.parent_station;
    delete stop.location_type;
    delete stop.stop_url;
    delete stop.zone_id;
  });
});

var port = process.env.PORT || 3000;
app.listen(port, function(){
  console.log('app listening on port', port);
});