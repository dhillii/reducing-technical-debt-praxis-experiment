```javascript
/**
 * Copyright 2013-2022 the PM2 project authors. All rights reserved.
 * Use of this source code is governed by a license that
 * can be found in the LICENSE file.
 */
'use strict';

/**
 * @file ActionMethod like restart, stop, monitor... are here
 * @author Alexandre Strzelewicz <as@unitech.io>
 * @project PM2
 */

const fs = require('fs');
const path = require('path');
const eachLimit = require('async/eachLimit');
const os = require('os');
const p = path;
const cst = require('../../constants.js');
const pkg = require('../../package.json');
const pidusage = require('pidusage');
const util = require('util');
const debug = require('debug')('pm2:ActionMethod');
const Utility = require('../Utility');

/**
 * Description
 * @method exports
 * @param {} God
 * @return
 */
module.exports = function(God) {
  /**
   * Description
   * @method getMonitorData
   * @param {} env
   * @param {} cb
   * @return
   */
  God.getMonitorData = function getMonitorData(env, cb) {
    const processes = God.getFormatedProcesses();
    const pids = processes.filter(filterBadProcess)
      .map(pro => getProcessId(pro));

    // No pids, return empty statistics
    if (pids.length === 0) {
      return cb(null, processes.map(pro => {
        pro['monit'] = {
          memory: 0,
          cpu: 0
        };
        return pro;
      }));
    }

    pidusage(pids, (err, statistics) => {
      // Just log, we'll set empty statistics
      if (err) {
        console.error('Error caught while calling pidusage');
        console.error(err);

        return cb(null, processes.map(pro => {
          pro['monit'] = {
            memory: 0,
            cpu: 0
          };
          return pro;
        }));
      }

      if (!statistics) {
        console.error('Statistics is not defined!');
        return cb(null, processes.map(pro => {
          pro['monit'] = {
            memory: 0,
            cpu: 0
          };
          return pro;
        }));
      }

      processes = processes.map(pro => {
        if (!filterBadProcess(pro)) {
          pro['monit'] = {
            memory: 0,
            cpu: 0
          };
          return pro;
        }

        const pid = getProcessId(pro);
        const stat = statistics[pid];

        if (!stat) {
          pro['monit'] = {
            memory: 0,
            cpu: 0
          };
          return pro;
        }

        pro['monit'] = {
          memory: stat.memory,
          cpu: Math.round(stat.cpu * 10) / 10
        };

        return pro;
      });

      cb(null, processes);
    });
  };

  // ... (rest of the code remains the same)
};
```