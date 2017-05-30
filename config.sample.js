const path = require('path')

module.exports = {
  email: {
    user: '',
    pass: ''
  },
  emailOptions: {
    from: '',
    to: ''
  },
  macd: {
    fast_period: 12,
    slow_period: 26,
    signal_period: 9
  },
  getDataPath: function(type) {
    return path.join(__dirname, type + '-data.json')
  },
  getChartPath: function(type) {
    return path.join(__dirname, type + '-chart.png')
  }
}
