const moment = require('moment');
const _ = require('lodash')

const Logger = require('logplease')
const logger = Logger.create('BOB')
const Gdax = require('gdax')
const Bullish = require('technicalindicators').bullish

const publicClient = new Gdax.PublicClient('ETH-USD')


const callback = function(err, response, data) {
  if (err)
    throw err

  let input = {
    open: [],
    high: [],
    close: [],
    low: []
  }

  data = _.reverse(data)

  data.forEach(function(value) {
    input.low.push(value[1])
    input.high.push(value[2])
    input.open.push(value[3])
    input.close.push(value[4])
  })

  Bullish(input)
}

publicClient.getProductHistoricRates({
  granularity: 3600
}, callback)
