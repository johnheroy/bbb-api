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

app.get('/api/stops', function(req, res) {
  var lat = req.query.lat;
  var lon = req.query.lon;

  var stopId = bbb.getClosestStop(lat, lon);
  var stops = {};
  bbb.getLatestArrivalsForStop(stopId).then(function(arrivals) {
    stops[stopId] = arrivals;
    res.send(stops);
  });
});

var port = process.env.PORT || 3000;
app.listen(port, function(){
  console.log('app listening on port', port);
});