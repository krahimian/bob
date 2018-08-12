const fs = require('fs')
const path = require('path')

const nodemailer = require('nodemailer')
const moment = require('moment')
const async = require('async')
const request = require('request')
const Logger = require('logplease')
const jsonfile = require('jsonfile')
const ChartjsNode = require('chartjs-node')
const _ = require('lodash')
const MACD = require('technicalindicators').MACD
const EMA = require('technicalindicators').EMA

const yargs_opts = {
  t: {
    alias: 'type',
    default: 'BTC',
    choices: ['BTC', 'ETH'],
    desc: 'cryptocurrency to use',
    type: 'string'
  }
}

const argv = require('yargs').options(yargs_opts).argv
const type = argv.type

const config_path = path.join(__dirname, './config.js')
if (!fs.existsSync(config_path))
  throw new Error('Setup a configuration file at config.js')

const config = require(config_path)

let transporter;
if (config.email) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: config.email
  })
}

const logger = Logger.create('BOB')

const data_path = config.getDataPath(type)
const chart_path = config.getChartPath(type)

function run () {
  logger.debug('intializing')
  
  if (!fs.existsSync(data_path))
    return setup()

  logger.debug('loading saved data')
  let saved_data = jsonfile.readFileSync(data_path)

  logger.debug('building MACD')

  // MACD
  const macd = new MACD({
    values: saved_data.close_values,
    fastPeriod: config.macd.fast_period,
    slowPeriod: config.macd.slow_period,
    signalPeriod: config.macd.signal_period
  })
  const macd_result = macd.getResult()

  // EMA LONG
  const ema_long = new EMA({
    values: saved_data.close_values,
    period: config.macd.slow_period
  })
  const ema_long_result = ema_long.getResult()

  // EMA SHORT
  const ema_short = new EMA({
    values: saved_data.close_values,
    period: config.macd.fast_period
  })
  const ema_short_result = ema_short.getResult()

  logger.debug('Macd results length:', macd_result.length)
  logger.debug('Data length:', saved_data.close_values.length)

  generateChart({
    macd: macd_result,
    ema_short: ema_short_result,
    ema_long: ema_long_result
  }, saved_data.time_values).then(() => {

    fetchData((err, data) => {
      if (err)
	throw err

      logger.debug('saved Time To:', saved_data.timeTo)
      logger.debug('fetched Time To:', data.timeTo)

      if (saved_data.timeTo == data.timeTo)
	return logger.debug('no new data to process')

      let new_close_values = []
      let new_time_values = []

      data.time_values.forEach((time, index) => {
	if (time > saved_data.timeTo) {
	  new_close_values.push(data.close_values[index])
	  new_time_values.push(time)
	}
      })

      let current_signal = macd_result[macd_result.length - 1].signal
      let current_macd = macd_result[macd_result.length - 1].MACD
      let current_histogram = current_macd - current_signal

      logger.debug('last signal:', current_signal)
      logger.debug('last macd:', current_macd)
      logger.debug('last histogram:', current_histogram)

      async.eachOfSeries(new_close_values, (value, index, next) => {

	const finish = () => {
	  current_macd = r.MACD
	  current_histogram = r.histogram
	  next()
	}

	const r = macd.nextValue(value)

	if (r) {
	  logger.debug(r)
	  macd_result.push(r)

	  let email_msg

	  function sendEmail() {
	    generateChart(macd_result, saved_data.time_values.concat(new_time_values.slice(0, index))).then(() => {
	      const email_opts = {
		subject: email_msg,
		html: '<img src="cid:chart@bob.com" />',
		attachments: [{
		  filename: 'chart.png',
		  path: chart_path,
		  cid: 'chart@bob.com'
		}]
	      }
	      transporter.sendMail(Object.assign(config.emailOptions, email_opts), finish)
	    })
	  }

	  if (Math.sign(current_histogram) !== Math.sign(r.histogram)) {
	    const msg = type + ' - Signal-line crossover: ' + r.histogram
	    logger.info(msg)

	    if (transporter) email_msg = msg
	  }

	  if (Math.sign(current_macd) !== Math.sign(r.MACD)) {
	    const msg = type + ' - Zero crossover: ' + r.MACD
	    logger.info(msg)

	    if (transporter) email_msg += msg
	  }

	  if (email_msg)
	    return sendEmail()

	  finish()
	}
      }, () => {

	const updated_data = {
	  timeTo: data.timeTo,
	  close_values: saved_data.close_values.concat(new_close_values),
	  time_values: saved_data.time_values.concat(new_time_values),
	}

	logger.debug('saving new data')
	jsonfile.writeFileSync(data_path, updated_data, { spaces: 4 })

      })
    })
  })
}

function setup () {
  logger.debug('setting up for the first time')
  fetchData((err, data) => {
    if (err)
      throw err

    logger.debug('saving fetched data')
    jsonfile.writeFileSync(data_path, data, { spaces: 4 })
    run()
  })
}

function fetchData (cb) {
  logger.debug('fetching latest data')
  request({
    url: 'https://min-api.cryptocompare.com/data/histohour',
    qs: {
      fsym: type,
      tsym: 'USD',
      e: 'Coinbase'
    },
    json: true
  }, (err, res, data) => {
    if (err)
      return cb(err)

    let close_values = _.map(data.Data, 'close')
    let time_values = _.map(data.Data, 'time')

    const result = {
      timeTo: data.TimeTo,
      close_values: close_values,
      time_values: time_values
    }

    cb(null, result)
    
  })
}

function generateChart(data, time_values) {
  let labels = _.slice(time_values, config.macd.slow_period -1)
  labels = _.map(labels, (value) => {
    return moment.unix(value).format('HH[h] - M/D')
  })
  const chartNode = new ChartjsNode(1000, 1000)
  const chartJsOptions = {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'MACD',
        borderColor: 'rgba(233,142,57,1)',
	fill: false,
	data: _.map(data.macd, 'MACD')
      },{
        label: 'signal',
        borderColor: 'rgba(127,139,158,1)',
	fill: false,
	data: _.map(data.macd, 'signal')
      }]
    },
    options: {
      elements: {
	point: {
	  radius: 0
	}
      }
    }
  }

  return chartNode.drawChart(chartJsOptions).then(() => {
    return chartNode.writeImageToFile('image/png', chart_path)
  })
}

run()
