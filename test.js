const fs = require('fs')
const path = require('path')

const moment = require('moment');
const jsonfile = require('jsonfile')
const _ = require('lodash')
const MACD = require('technicalindicators').MACD
const SMA = require('technicalindicators').SMA;

const Logger = require('logplease')
const logger = Logger.create('BOB')
const Gdax = require('gdax')


//////////////// GLOBALS
let macd;
let macd_result;

//////////////// LOAD ARGS
const yargs_opts = {
  t: {
    alias: 'type',
    default: 'ETH',
    choices: ['BTC', 'ETH'],
    desc: 'cryptocurrency to use',
    type: 'string'
  }
}
const argv = require('yargs').options(yargs_opts).argv
const type = argv.type

//////////////// LOAD CONFIG
const config_path = path.join(__dirname, './config.js')
if (!fs.existsSync(config_path))
  throw new Error('Setup a configuration file at config.js')

const config = require(config_path)
const publicClient = new Gdax.PublicClient(type + '-USD')

//////////////////////// LOAD DATA
/* const data_path = config.getDataPath(type)
 * let saved_data = jsonfile.readFileSync(data_path)
 * */

//////////////////////// INITIALIZE
function initialize(close_values) {
  const initial_values = _.slice(close_values, 0, config.macd.slow_period)
  console.log(initial_values)

  macd = new MACD({
    values: initial_values,
    fastPeriod: config.macd.fast_period,
    slowPeriod: config.macd.slow_period,
    signalPeriod: config.macd.signal_period
  })
  macd_result = macd.getResult()

  sma = new SMA({
    period: config.macd.slow_period * 5,
    values: initial_values
  })
  sma_result = sma.getResult()
}


/////////////////////// ANALYZE
function analyze(close_values) {
  const remaining_values = _.slice(close_values, config.macd.slow_period)

  let current_signal = macd_result[macd_result.length - 1].signal
  let current_macd = macd_result[macd_result.length - 1].MACD
  let current_histogram = current_macd - current_signal

  let holding = false
  let holding_price = null
  let profits = 0

  remaining_values.forEach(function(value, index) {
    const r = macd.nextValue(value)
    console.log(r)
    const price = close_values[config.macd.slow_period + index]
    console.log(price)

    const s = sma.nextValue(value)
    console.log(s)

    const previous_bearish = Math.sign(current_macd)
    const current_bearish = Math.sign(r.MACD)

    function sell () {
      console.log('sell at ' + price)
      
      const trade_profit = price - holding_price
      console.log('trade profit: ', trade_profit)
      profits += trade_profit
      holding = false
    }

    function buy () {
      console.log('buy at ' + price)      
      holding = true
      holding_price = price
    }

    function make_decision () {
      if (!holding && Math.sign(r.histogram) < 0 && current_bearish > 0) {
	return buy()
      }
      
      if (holding && Math.sign(r.histogram) > 0 && current_bearish > 0) {
	return sell() 
      }
    }

    if (r) {
      macd_result.push(r)
      sma_result.push(s)

      if (current_histogram && Math.sign(current_histogram) !== Math.sign(r.histogram)) {
	const price = close_values[config.macd.slow_period + index]
	const msg = type + ' - Signal-line crossover - histogram: ' + r.histogram + ', Price:' + price
	logger.info(msg)

	make_decision()
      }

      if (Math.sign(current_macd) !== Math.sign(r.MACD)) {
	const msg = type + ' - Zero crossover - MACD: ' + r.MACD + ', Price: ' + price
	logger.info(msg)

	if (holding && current_bearish < 0) sell()
      }
      
      current_macd = r.MACD
      current_histogram = r.histogram
    }
  })

  console.log('Profits: ', profits)
}

///////////////// CHECK FOR NEW DATA
const callback = function(err, response, data) {
  if (err)
    throw err

  const close_values = _.flatMap(data, function(n) {
    return n[4]
  }).reverse()

  initialize(close_values)
  analyze(close_values)

}

publicClient.getProductHistoricRates({
  granularity: 3600
}, callback)
