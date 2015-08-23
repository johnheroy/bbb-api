$(function() {
  navigator.geolocation.getCurrentPosition(function(position) {
    var lat = position.coords.latitude;
    var lon = position.coords.longitude;

    $.get('/api/stops', {lat: lat, lon: lon}, function(data) {
      $('#real-time-response').text(JSON.stringify(data, null, 2));
    });
  });
});