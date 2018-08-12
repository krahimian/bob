var ThreeWhiteSoldiers =require('technicalindicators').threewhitesoldiers;
var drawCandleStick = require('draw-candlestick');
var canvas = require('canvas');
require('console-png').attachTo(console);

var input = {
  open: [21.12,21.48,21.80],
  close: [21.65,22.20,22.65],
  high: [21.83,22.40,22.80],
  low: [20.85,21.36,21.66]
}

var imageBuffer = drawCandleStick(input);
console.png(imageBuffer);
console.log(ThreeWhiteSoldiers)
var result      = ThreeWhiteSoldiers(input);
console.log('Is Three White Soldiers Pattern? :' +result);
