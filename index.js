const fs = require('fs')

const nodemailer = require('nodemailer')
const request = require('request')
const Logger = require('logplease')
const jsonfile = require('jsonfile')
const ChartjsNode = require('chartjs-node')
const _ = require('lodash')
const MACD = require('technicalindicators').MACD

const opts = {
  t: {
    alias: 'type',
    default: 'BTC',
    choices: ['BTC', 'ETH'],
    desc: 'cryptocurrency to use',
    type: 'string'
  }
}

const argv = require('yargs').options(opts).argv
const type = argv.type

if (!fs.existsSync('./config.js'))
  throw new Error('Setup a configuration file at config.js')

const config = require('./config')

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

  const macdInput = {
    values: saved_data.close_values,
    fastPeriod: config.macd.fast_period,
    slowPeriod: config.macd.slow_period,
    signalPeriod: config.macd.signal_period
  }

  logger.debug('building MACD')
  const macd = new MACD(macdInput)
  const result = macd.getResult()

  const chartNode = new ChartjsNode(1000, 1000)
  const chartJsOptions = {
    type: 'line',
    data: {
      labels: _.slice(saved_data.time_values, config.macd.slow_period - 1),
      datasets: [{
        label: 'MACD',
        backgroundColor: 'rgba(200,200,200,0.2)',
        borderColor: 'rgba(200,200,200,1)',
	pointBackgroundColor: 'rgba(200,200,200,1)',
	data: _.map(result, 'MACD')
      },{
        label: 'signal',
        backgroundColor: 'rgba(151,187,205,0.2)',
        borderColor: 'rgba(151,187,205,1)',
        pointBackgroundColor: 'rgba(151,187,205,1)',
	data: _.map(result, 'signal')
      }]
    },
    options: {}
  }
  
  chartNode.drawChart(chartJsOptions).then(() => {
    return chartNode.writeImageToFile('image/png', chart_path)    
  })

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

    let current_signal = result[result.length - 1].signal
    let current_macd = result[result.length - 1].MACD
    let current_histogram = current_macd - current_signal

    logger.debug('last signal:', current_signal)
    logger.debug('last macd:', current_macd)
    logger.debug('last histogram:', current_histogram)

    new_close_values.forEach(value => {
      const r = macd.nextValue(value)
      if (r) {
	logger.debug(r)
	
	if (Math.sign(current_histogram) !== Math.sign(r.histogram)) {
	  const msg = 'Signal-line crossover: ' + r.histogram
	  logger.info(msg)
	  if (transporter) {
	    transporter.sendMail(Object.assign(config.emailOptions, { subject: msg }))
	  }
	}

	if (Math.sign(current_macd) !== Math.sign(r.MACD)) {
	  const msg = 'Zero crossover: ' + r.MACD
	  logger.info(msg)
	  if (transporter) {
	    transporter.sendMail(Object.assign(config.emailOptions, { subject: msg }))
	  }	  
	}
	
	current_macd = r.MACD
	current_histogram = r.histogram
      }
    })

    const updated_data = {
      timeTo: data.timeTo,
      timeFrom: saved_data.timeFrom,
      close_values: saved_data.close_values.concat(new_close_values),
      time_values: saved_data.time_values.concat(new_time_values)
    }

    logger.debug('saving new data')
    jsonfile.writeFileSync(data_path, updated_data, { spaces: 4 })
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
      timeFrom: data.TimeFrom,
      timeTo: data.TimeTo,
      close_values: close_values,
      time_values: time_values
    }

    cb(null, result)
    
  })
}

run()
