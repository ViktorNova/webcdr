var _ = require('lodash');

var Bookshelf = require('./db');
var knex = Bookshelf.knex;

var groups = require('./groups');

/*
  {
    rows: [
      '8:30-10:00',
      '10:00-12:00',
      ...
    ],
    columns: [
      'total',
      'service',
      'sales'
    ],
    data: [
      [50, 4, 2],
      [10, 14, 12],
      ...
    ]
  }
*/

var reportTable = 'calls';

var columns = _.map(groups, function (group) {
  return group.name;
});
columns = ['calls'].concat(columns);

function getTotals (table) {
  return _.reduce(table, function (resrow, row) {
    return _.map(resrow, function (x, i) {
      return x + row[i];
    });
  });
}

/**
 * Build report for a week
 */
function reportWeek (from, to, cb) {
  var querySelect = prepareSummaryQuerySelect(knex);

  var knexTable = knex(reportTable);

  knexTable.select.apply(knexTable, querySelect)
    .where(function () {
      this.whereBetween(knex.raw('date(calldate)'), [from, to]);
    })
    .groupBy('day')
    .then(function (data) {
      var rows = [
        'Понедельник',
        'Вторник',
        'Среда',
        'Четверг',
        'Пятница',
        'Суббота',
        'Воскресенье'
      ];

      var result = _.times(rows.length, function () {
        return _.times(columns.length, function () {
          return 0;
        });
      });

      _.each(data, function (row) {
        _.each(columns, function (column, index) {
          result[row.day][index] = row[column];
        });
      });

      rows.push('Всего');
      result.push(getTotals(result));

      var retd = {
        rows: rows,
        columns: columns,
        data: result
      };

      cb(retd);
    });
}

function prepareSummaryQuerySelect (knex) {
  var args = _.map(groups, function (group) {
    return knex.raw('SUM(dst BETWEEN ' + group.from + ' AND ' + group.to + ') as ' + group.name);
  });

  args = [
    knex.raw('weekday(calldate) as day'),
    knex.raw('count(*) as calls')
  ].concat(args);

  return args;
}

/**
 * Build report for a day
 */
function reportDay (from, to, cb) {
  var args = _.map(groups, function (group) {
    return knex.raw('IFNULL(SUM(dst BETWEEN ' + group.from + ' AND ' + group.to + '),0) as ' + group.name);
  });
  knex()
    .select([
      'time_id',
      knex.raw('concat(time_format(start,"%H:%i"),"-",time_format(end,"%H:%i")) as timerange'),
      knex.raw('count (id) as calls')
    ].concat(args))
    .from(knex.raw('report_timeperiods tp left join `' + reportTable + '` on time(calldate) between start and end and date(calldate) between ? and ?', [from, to]))
    .groupBy(knex.raw('time_id'))
  .then(function (res) {
    var rows = _.pluck(res, 'timerange');
    var data = _.map(res, function (row) {
      return _.map(columns, function (column) {
        return row[column];
      });
    });

    rows.push('Всего');
    data.push(getTotals(data));

    cb({
      columns: columns,
      rows: rows,
      data: data
    });
  });
}

var reports = {
  week: reportWeek,
  day: reportDay
};

module.exports = function getReport (mode, from, to, cb) {
  return reports[mode](from, to, cb);
};
